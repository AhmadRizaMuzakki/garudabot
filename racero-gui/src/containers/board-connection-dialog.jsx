import bindAll from 'lodash.bindall';

import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { injectIntl, intlShape } from 'react-intl';
import {
    setConnectingStatus,
    setConnectionDetails,
    setBleDeviceName
} from '../reducers/board';
import { boards } from 'racero-boards';
import Esp32BleLink from '../lib/ble/esp32-ble-link.js';
import {
    DEFAULT_BLE_DEVICE_NAME,
    saveBleDeviceName,
    importBleNameCsv,
    loadStoredBatch,
    saveStoredBatch,
    clearStoredBatch,
    loadLastFlashedBleName
} from '../lib/ble/ble-device-name.js';

import BoardConnectionDialogComponent from '../components/board-connection-dialog/board-connection-dialog.jsx';

// Dialog Connect: ESP32 memakai daftar BLE (Scratch Link) + USB cadangan.
// Board lain: USB Serial saja.
// Setelah pilih Garudabot, target tersimpan sebagai `ble:<peripheralId>` untuk upload.

const isNetworkAddress = value => value.startsWith('net:') || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(value);

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
            'handleScanBle',
            'handlePairBle',
            'handleBleNameModeChange',
            'handleBleNameDraftChange',
            'handleBleNameSave',
            'handleBleNameImport',
            'handleBleBatchNext',
            'handleBleBatchSkip',
            'handleBleBatchClear',
            'handleBleUseBatchCurrent'
        ]);
        const storedBatch = loadStoredBatch();
        this.state = {
            ports: [],
            isLoading: false,
            selectedEspPort: '',
            connectionSuccess: null,
            bleDevices: [],
            isScanningBle: false,
            pairingBleId: null,
            bleScanError: null,
            bleNameMode: storedBatch.names.length ? 'batch' : 'manual',
            bleNameDraft: props.bleDeviceName || DEFAULT_BLE_DEVICE_NAME,
            bleNameError: null,
            bleBatchNames: storedBatch.names,
            bleBatchIndex: storedBatch.index,
            bleBatchFileName: '',
            bleBatchErrors: [],
            lastFlashedBleName: loadLastFlashedBleName()
        };
        this.connectionSuccessTimer = null;
        this.isUnmounted = false;
        this.bleLink = null;
    }
    componentDidMount() {
        // Sinkron ulang antrian + nama flash terakhir (bisa berubah setelah Upload).
        const storedBatch = loadStoredBatch();
        this.setState({
            bleBatchNames: storedBatch.names,
            bleBatchIndex: storedBatch.index,
            lastFlashedBleName: loadLastFlashedBleName(),
            bleNameMode: storedBatch.names.length ? 'batch' : this.state.bleNameMode
        });
        if (storedBatch.names.length && storedBatch.index < storedBatch.names.length) {
            this.applyBleName(storedBatch.names[storedBatch.index]);
        }

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
    handleConnect (port, label) {
        if (this.isEsp32Board()) {
            this.setState({ selectedEspPort: port });
        }
        this.showConnectionSuccess(label || port, port);
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
                        bleScanError: this.props.intl.formatMessage({
                            id: 'gui.boardConnection.bleScanNotFound',
                            defaultMessage:
                                'Scratch Link found no board. Quit Scratch Link → open again. ' +
                                'Make sure the board is on, then Search again.',
                            description: 'BLE scan found nothing'
                        })
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
            window.alert(this.props.intl.formatMessage({
                id: 'gui.boardConnection.bleScanFirst',
                defaultMessage: 'Search BLE first (Scratch Link required).',
                description: 'Alert when pairing without scan'
            }));
            return;
        }

        this.setState({ pairingBleId: device.peripheralId });
        this.bleLink.connect(device.peripheralId).then(() => {
            if (this.isUnmounted) return;
            const label = device.name || device.peripheralId;
            this.setState({ pairingBleId: null });
            // Simpan target upload Bluetooth: ble:<peripheralId>
            this.showConnectionSuccess(label, `ble:${device.peripheralId}`);
            // Lepas sesi Scratch Link — saat upload, OTA discover+connect di sesi baru.
            this.teardownBleLink();
        }).catch(err => {
            if (this.isUnmounted) return;
            this.setState({ pairingBleId: null });
            window.alert(String(err && err.message ? err.message : err));
        });
    }
    applyBleName (name) {
        const saved = saveBleDeviceName(name);
        if (!saved.ok) {
            this.setState({ bleNameError: saved.error, bleNameDraft: saved.name });
            return false;
        }
        this.props.onSetBleDeviceName(saved.name);
        this.setState({
            bleNameDraft: saved.name,
            bleNameError: null
        });
        return true;
    }
    handleBleNameModeChange (mode) {
        this.setState({ bleNameMode: mode, bleNameError: null });
    }
    handleBleNameDraftChange (value) {
        this.setState({ bleNameDraft: value, bleNameError: null });
    }
    handleBleNameSave () {
        this.applyBleName(this.state.bleNameDraft);
    }
    handleBleNameImport () {
        importBleNameCsv().then(result => {
            if (this.isUnmounted) return;
            if (!result.names.length) {
                this.setState({
                    bleBatchErrors: result.errors.length ?
                        result.errors :
                        ['Tidak ada nama valid di file.'],
                    bleBatchFileName: result.fileName || ''
                });
                return;
            }
            saveStoredBatch(result.names, 0);
            this.setState({
                bleNameMode: 'batch',
                bleBatchNames: result.names,
                bleBatchIndex: 0,
                bleBatchFileName: result.fileName || '',
                bleBatchErrors: result.errors || []
            });
            this.applyBleName(result.names[0]);
        }).catch(err => {
            if (this.isUnmounted) return;
            this.setState({
                bleBatchErrors: [String(err && err.message ? err.message : err)]
            });
        });
    }
    advanceBatch (skip) {
        const {bleBatchNames, bleBatchIndex} = this.state;
        if (!bleBatchNames.length) return;
        const next = Math.min(bleBatchIndex + 1, bleBatchNames.length);
        saveStoredBatch(bleBatchNames, next);
        this.setState({ bleBatchIndex: next });
        if (next < bleBatchNames.length) {
            this.applyBleName(bleBatchNames[next]);
        }
        if (skip) {
            // no-op beyond advance; kept for clarity / future analytics
        }
    }
    handleBleBatchNext () {
        this.advanceBatch(false);
    }
    handleBleBatchSkip () {
        this.advanceBatch(true);
    }
    handleBleBatchClear () {
        clearStoredBatch();
        this.setState({
            bleBatchNames: [],
            bleBatchIndex: 0,
            bleBatchFileName: '',
            bleBatchErrors: [],
            bleNameMode: 'manual'
        });
    }
    handleBleUseBatchCurrent () {
        const {bleBatchNames, bleBatchIndex} = this.state;
        if (!bleBatchNames.length || bleBatchIndex >= bleBatchNames.length) return;
        this.applyBleName(bleBatchNames[bleBatchIndex]);
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

        return (
            <BoardConnectionDialogComponent
                ports={serialPorts}
                showUsbList
                isEsp32={isEsp32}
                isLoading={this.state.isLoading}
                connectionSuccess={this.state.connectionSuccess}
                bleDevices={this.state.bleDevices}
                isScanningBle={this.state.isScanningBle}
                pairingBleId={this.state.pairingBleId}
                bleScanError={this.state.bleScanError}
                bleDeviceName={this.props.bleDeviceName}
                bleNameMode={this.state.bleNameMode}
                bleNameDraft={this.state.bleNameDraft}
                bleNameError={this.state.bleNameError}
                bleBatchNames={this.state.bleBatchNames}
                bleBatchIndex={this.state.bleBatchIndex}
                bleBatchFileName={this.state.bleBatchFileName}
                bleBatchErrors={this.state.bleBatchErrors}
                lastFlashedBleName={this.state.lastFlashedBleName}
                onCancel={this.handleCancel}
                onConnect={this.handleConnect}
                onScanBle={this.handleScanBle}
                onPairBle={this.handlePairBle}
                onBleNameModeChange={this.handleBleNameModeChange}
                onBleNameDraftChange={this.handleBleNameDraftChange}
                onBleNameSave={this.handleBleNameSave}
                onBleNameImport={this.handleBleNameImport}
                onBleBatchNext={this.handleBleBatchNext}
                onBleBatchSkip={this.handleBleBatchSkip}
                onBleBatchClear={this.handleBleBatchClear}
                onBleUseBatchCurrent={this.handleBleUseBatchCurrent}
            />
        );
    }
}

BoardConnectionDialog.propTypes = {
    bleDeviceName: PropTypes.string,
    intl: intlShape.isRequired,
    isConnecting: PropTypes.bool,
    onSetBleDeviceName: PropTypes.func,
    onSetConnecting: PropTypes.func,
    onSetConnectionDetails: PropTypes.func,
    vm: PropTypes.object
};

const mapStateToProps = state => ({
    vm: state.raceroGui.vm,
    isConnecting: state.raceroGui.board.isConnecting,
    bleDeviceName: state.raceroGui.board.bleDeviceName
});

const mapDispatchToProps = dispatch => ({
    onSetConnecting: connecting => dispatch(setConnectingStatus(connecting)),
    onSetConnectionDetails: details => dispatch(setConnectionDetails(details)),
    onSetBleDeviceName: name => dispatch(setBleDeviceName(name))
});

export default injectIntl(connect(mapStateToProps, mapDispatchToProps)(BoardConnectionDialog));
