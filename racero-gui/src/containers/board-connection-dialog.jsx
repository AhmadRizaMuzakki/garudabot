import bindAll from 'lodash.bindall';

import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { setConnectingStatus, setConnectionDetails, setInstallStatus, setOtaPassword } from '../reducers/board';
import { boards } from 'racero-boards';
import Esp32BleLink from '../lib/ble/esp32-ble-link.js';

import BoardConnectionDialogComponent from '../components/board-connection-dialog/board-connection-dialog.jsx';

// Dialog Connect: ESP32 memakai daftar BLE (Scratch Link) + USB cadangan.
// Setelah pilih Garudabot, target tersimpan sebagai `ble:<peripheralId>` untuk upload.

const DEFAULT_WIFI_IP = '192.168.4.1';
const DEFAULT_OTA_PASSWORD = 'admin';

const isNetworkAddress = value => value.startsWith('net:') || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(value);

const stripNetPrefix = address => address.replace(/^net:/, '').split(':')[0];

const normalizePorts = data => {
    const rawPorts = (data && (data.detected_ports || data.ports)) || [];
    return rawPorts.map(port => {
        const address = port.address || '';
        const label = port.label || port.protocol_label || address;
        return {
            address,
            label,
            protocol: port.protocol || port.protocol_label || ''
        };
    }).filter(port => port.address);
};

class BoardConnectionDialog extends React.Component {
    constructor(props) {
        super(props);
        bindAll(this, [
            'handleConnect',
            'handleCancel',
            'handleInstallBridge',
            'handleEspPortChange',
            'handleScanWifi',
            'handlePairBoard',
            'handleConnectDiscovered',
            'handleScanBle',
            'handlePairBle'
        ]);
        this.state = {
            ports: [],
            isLoading: false,
            otaPassword: DEFAULT_OTA_PASSWORD,
            selectedEspPort: '',
            isInstallingBridge: false,
            connectionSuccess: null,
            wifiBoards: [],
            currentSsid: null,
            isScanningWifi: false,
            pairingSsid: null,
            wifiScanError: null,
            bleDevices: [],
            isScanningBle: false,
            pairingBleId: null,
            bleScanError: null
        };
        this.connectionSuccessTimer = null;
        this.isUnmounted = false;
        this.bleLink = null;
    }
    componentDidMount() {
        const tauri = window.__TAURI__;
        if (!tauri) return;

        tauri.event.listen('ports-updated', this.handlePortWatcherEvent).then(unlistenFn => {
            this.unlistenPorts = unlistenFn;
        });

        this.setState({isLoading: true});
        tauri.core.invoke('port_list').then(portsString => {
            const data = JSON.parse(portsString);
            this.setState({
                ports: normalizePorts(data),
                isLoading: false
            });
        }).catch(err => {
            console.error(err);
            this.setState({ isLoading: false });
        });

        if (this.isEsp32Board()) {
            this.handleScanBle();
        } else {
            this.handleScanWifi();
        }
    }
    componentWillUnmount() {
        this.isUnmounted = true;
        if (this.unlistenPorts) {
            this.unlistenPorts();
        }
        if (this.connectionSuccessTimer) {
            clearTimeout(this.connectionSuccessTimer);
        }
        this.teardownBleLink();
    }
    teardownBleLink () {
        if (this.bleLink) {
            this.bleLink.close();
            this.bleLink = null;
        }
    }
    showConnectionSuccess (label, connectionTarget) {
        if (this.connectionSuccessTimer) {
            clearTimeout(this.connectionSuccessTimer);
        }

        this.props.onSetConnectionDetails(connectionTarget);
        this.setState({ connectionSuccess: label });

        this.connectionSuccessTimer = setTimeout(() => {
            this.setState({ connectionSuccess: null });
            this.props.onSetConnecting(false);
            this.connectionSuccessTimer = null;
        }, 1800);
    }
    handlePortWatcherEvent = (e) => {
        try {
            const data = JSON.parse(e.payload);
            this.setState({ ports: normalizePorts(data) });
        } catch (err) {
            console.error("FIRMATA: Error updating port list", err);
        }
    }
    componentDidUpdate(prevProps) {
        if (this.props.isConnecting && !prevProps.isConnecting) {
            if (this.state.isLoading) {
                this.setState({isLoading: false});
            }
        }
    }
    getBoardName() {
        return this.props.vm &&
            this.props.vm.runtime &&
            this.props.vm.runtime.boardConfig &&
            this.props.vm.runtime.boardConfig.name;
    }
    isEsp32Board () {
        const boardName = this.getBoardName() || '';
        if (/esp32/i.test(boardName)) {
            return true;
        }
        const board = boards[boardName];
        return Boolean(board && board.fqbn && /esp32/i.test(board.fqbn));
    }
    pairingKind () {
        return this.isEsp32Board() ? 'esp32' : 'bridge';
    }
    resolveUsbUploadPort () {
        const serialPorts = this.state.ports.filter(port => !isNetworkAddress(port.address || ''));
        if (this.state.selectedEspPort &&
            serialPorts.some(port => port.address === this.state.selectedEspPort)) {
            return this.state.selectedEspPort;
        }
        if (serialPorts.length === 1) {
            return serialPorts[0].address;
        }
        return null;
    }
    handleConnect (port, label) {
        if (this.isEsp32Board()) {
            this.setState({ selectedEspPort: port });
        }
        this.showConnectionSuccess(label || port, port);
    }
    handleScanWifi () {
        const tauri = window.__TAURI__;
        if (!tauri) return;

        this.setState({ isScanningWifi: true, wifiScanError: null });
        tauri.core.invoke('wifi_scan_boards', { kind: this.pairingKind() }).then(resultString => {
            if (this.isUnmounted) return;
            const data = JSON.parse(resultString);
            this.setState({
                wifiBoards: data.boards || [],
                currentSsid: data.current_ssid || null,
                isScanningWifi: false
            });
        }).catch(err => {
            if (this.isUnmounted) return;
            this.setState({
                isScanningWifi: false,
                wifiScanError: String(err)
            });
        });
    }
    handleScanBle () {
        const prev = this.bleLink;
        this.setState({
            isScanningBle: true,
            bleScanError: null,
            bleDevices: []
        });

        const run = async () => {
            if (prev && typeof prev.closeAsync === 'function') {
                try { await prev.closeAsync(); } catch (e) { /* ignore */ }
            }

            const link = new Esp32BleLink({
                onPeripheral: (_device, all) => {
                    if (this.isUnmounted) return;
                    const list = Object.values(all);
                    this.setState({
                        bleDevices: list,
                        bleScanError: null
                    });
                },
                onError: err => {
                    if (this.isUnmounted) return;
                    this.setState({
                        isScanningBle: false,
                        bleScanError: String(err && err.message ? err.message : err)
                    });
                }
            });
            this.bleLink = link;

            try {
                const found = await link.scan(14000);
                if (this.isUnmounted) return;
                const list = Object.values(found || {});
                if (list.length === 0) {
                    this.setState({
                        isScanningBle: false,
                        bleDevices: [],
                        bleScanError:
                            'Scratch Link tidak menemukan Garudabot. Quit Scratch Link → buka lagi. ' +
                            'Pastikan board menyala (nRF Connect melihat Garudabot), lalu Cari lagi.'
                    });
                    return;
                }
                this.setState({
                    isScanningBle: false,
                    bleDevices: list,
                    bleScanError: null
                });
            } catch (err) {
                if (this.isUnmounted) return;
                this.setState({
                    isScanningBle: false,
                    bleScanError: String(err && err.message ? err.message : err)
                });
            }
        };

        run();
    }
    handlePairBle (device) {
        if (!device || !device.peripheralId) return;
        if (!this.bleLink) {
            window.alert('Scan BLE dulu (butuh Scratch Link).');
            return;
        }

        this.setState({ pairingBleId: device.peripheralId });
        this.bleLink.connect(device.peripheralId).then(() => {
            if (this.isUnmounted) return;
            const label = device.name || device.peripheralId;
            this.setState({ pairingBleId: null });
            // Simpan target upload Bluetooth: ble:<peripheralId>
            // (bukan COMx USB, bukan IP SoftAP WiFi lama).
            this.showConnectionSuccess(label, `ble:${device.peripheralId}`);
            // Lepas sesi Scratch Link — saat upload, OTA discover+connect di sesi baru.
            this.teardownBleLink();
        }).catch(err => {
            if (this.isUnmounted) return;
            this.setState({ pairingBleId: null });
            window.alert(String(err && err.message ? err.message : err));
        });
    }
    handlePairBoard (ssid) {
        const tauri = window.__TAURI__;
        if (!tauri) return;

        this.setState({ pairingSsid: ssid });
        tauri.core.invoke('wifi_connect_board', {
            ssid,
            kind: this.pairingKind()
        }).then(resultString => {
            if (this.isUnmounted) return;
            const data = JSON.parse(resultString);
            const ip = data.ip || DEFAULT_WIFI_IP;

            this.setState({
                pairingSsid: null,
                currentSsid: data.ssid || ssid
            });

            // Bridge ESP-01 diakses sebagai serial-over-TCP, jadi target
            // koneksinya net:<ip>:<port>; ESP32 OTA cukup IP-nya saja.
            if (data.port) {
                this.showConnectionSuccess(ssid, `net:${ip}:${data.port}`);
                return;
            }

            const password = data.ota_password || DEFAULT_OTA_PASSWORD;
            this.setState({ otaPassword: password });
            this.props.onSetOtaPassword(password);
            this.showConnectionSuccess(ssid, ip);
        }).catch(err => {
            if (this.isUnmounted) return;
            this.setState({ pairingSsid: null });
            window.alert(String(err));
        });
    }
    handleConnectDiscovered (address, label) {
        const ip = stripNetPrefix(address);
        if (this.isEsp32Board()) {
            this.props.onSetOtaPassword(this.state.otaPassword);
            this.showConnectionSuccess(label || ip, ip);
            return;
        }
        this.showConnectionSuccess(label || address, address);
    }
    handleInstallBridge () {
        const tauri = window.__TAURI__;
        if (!tauri || !this.state.selectedEspPort) return;
        if (isNetworkAddress(this.state.selectedEspPort)) {
            window.alert('Install ESP-01 bridge harus via USB-TTL (COM), bukan IP/WiFi.');
            return;
        }

        this.setState({ isInstallingBridge: true });
        this.props.onSetInstalling(true);
        tauri.core.invoke('board_install_esp01_bridge', {
            port: this.state.selectedEspPort
        }).then(msg => {
            window.alert(msg);
        }).catch(err => {
            window.alert(String(err));
        }).finally(() => {
            this.setState({ isInstallingBridge: false });
            this.props.onSetInstalling(false);
        });
    }
    handleEspPortChange (value) {
        this.setState({ selectedEspPort: value });
    }
    handleCancel() {
        this.teardownBleLink();
        this.props.onSetConnecting(false);
        this.props.onSetConnectionDetails(null);
    }
    render() {
        if (!this.props.isConnecting) {
            return null;
        }
        const isEsp32 = this.isEsp32Board();
        const serialPorts = this.state.ports.filter(port => !isNetworkAddress(port.address || ''));
        // Entri bertipe network berasal dari mDNS arduino-cli: board yang sudah
        // menjalankan ArduinoOTA dan berada di jaringan yang sama.
        const networkPorts = this.state.ports.filter(port => isNetworkAddress(port.address || ''));

        return (
            <BoardConnectionDialogComponent
                ports={serialPorts}
                installPorts={serialPorts}
                networkPorts={networkPorts}
                showBridgeInstall={!isEsp32}
                showUsbList
                isEsp32={isEsp32}
                isLoading={this.state.isLoading}
                connectionSuccess={this.state.connectionSuccess}
                selectedEspPort={this.state.selectedEspPort}
                isInstallingBridge={this.state.isInstallingBridge}
                wifiBoards={this.state.wifiBoards}
                currentSsid={this.state.currentSsid}
                isScanningWifi={this.state.isScanningWifi}
                pairingSsid={this.state.pairingSsid}
                wifiScanError={this.state.wifiScanError}
                bleDevices={this.state.bleDevices}
                isScanningBle={this.state.isScanningBle}
                pairingBleId={this.state.pairingBleId}
                bleScanError={this.state.bleScanError}
                onCancel={this.handleCancel}
                onConnect={this.handleConnect}
                onInstallBridge={this.handleInstallBridge}
                onEspPortChange={this.handleEspPortChange}
                onScanWifi={this.handleScanWifi}
                onPairBoard={this.handlePairBoard}
                onConnectDiscovered={this.handleConnectDiscovered}
                onScanBle={this.handleScanBle}
                onPairBle={this.handlePairBle}
            />
        );
    }
}

BoardConnectionDialog.propTypes = {
    isConnecting: PropTypes.bool,
    onSetConnecting: PropTypes.func,
    onSetConnectionDetails: PropTypes.func,
    onSetInstalling: PropTypes.func,
    onSetOtaPassword: PropTypes.func,
    vm: PropTypes.object
};

const mapStateToProps = state => ({
    vm: state.raceroGui.vm,
    isConnecting: state.raceroGui.board.isConnecting,
});

const mapDispatchToProps = dispatch => ({
    onSetConnecting: connecting => dispatch(setConnectingStatus(connecting)),
    onSetConnectionDetails: details => dispatch(setConnectionDetails(details)),
    onSetInstalling: installing => dispatch(setInstallStatus(installing)),
    onSetOtaPassword: password => dispatch(setOtaPassword(password))
});

export default connect(mapStateToProps, mapDispatchToProps)(BoardConnectionDialog);
