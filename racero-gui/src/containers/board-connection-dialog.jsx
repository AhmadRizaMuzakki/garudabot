import bindAll from 'lodash.bindall';

import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { injectIntl, intlShape } from 'react-intl';
import {
    setConnectingStatus,
    setConnectionDetails,
    setConnectedStatus,
    setBleDeviceName
} from '../reducers/board';
import { boards } from 'racero-boards';
import Esp32BleLink from '../lib/ble/esp32-ble-link.js';
import {startBleLive, stopBleLive, isBleLiveActive} from '../lib/ble/ble-live-session.js';
import {setLiveTransport} from '../lib/live-transport.js';
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

// Dialog Connect: ESP32 memakai daftar BLE native (btleplug) + USB cadangan.
// Board lain: USB Serial saja.
// Setelah pilih Garudabot, target tersimpan sebagai `ble:<peripheralId>`
// untuk Upload Program dan Live Mode BLE.

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
            'handleRefreshPorts',
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
            isRefreshingPorts: false,
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
        this.portPollTimer = null;
    }
    componentDidMount() {
        // Sinkron ulang antrian + nama flash terakhir (bisa berubah setelah Upload).
        this.syncBleNameState();

        const tauri = window.__TAURI__;
        if (!tauri) return;

        tauri.event.listen('ports-updated', this.handlePortWatcherEvent).then(unlistenFn => {
            this.unlistenPorts = unlistenFn;
        });

        // Dialog selalu di-mount di menu-bar; refresh nyata saat dibuka (isConnecting).
        if (this.props.isConnecting) {
            this.refreshWhenDialogOpens();
        }
    }
    syncBleNameState () {
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
    }
    startPortAutoPoll () {
        this.stopPortAutoPoll();
        // Poll ringan selama dialog terbuka — colok USB → COM muncul tanpa klik Refresh.
        // Cocok alur batch: colok → pilih → Upload → cabut → board berikutnya.
        this.portPollTimer = setInterval(() => {
            if (this.isUnmounted || !this.props.isConnecting) return;
            this.handleRefreshPorts({quiet: true});
        }, 1500);
    }
    stopPortAutoPoll () {
        if (this.portPollTimer) {
            clearInterval(this.portPollTimer);
            this.portPollTimer = null;
        }
    }
    refreshWhenDialogOpens () {
        this.syncBleNameState();
        this.handleRefreshPorts();
        this.startPortAutoPoll();
        if (this.isEsp32Board()) {
            // Kalau sudah Connect/Live BLE, jangan scan penuh (itu putus sesi).
            const alreadyBle = String(
                this.props.connectedDevice ||
                (typeof window !== 'undefined' ? window.__garudabotConnectedDevice : '') ||
                ''
            ).startsWith('ble:');
            this.handleScanBle({preserveConnected: alreadyBle || isBleLiveActive()});
        }
    }
    handleRefreshPorts (options = {}) {
        const quiet = Boolean(options.quiet);
        const tauri = window.__TAURI__;
        if (!tauri || !tauri.core) return;
        if (this._portRefreshInFlight) return;
        this._portRefreshInFlight = true;
        // Jangan full-screen loading — biarkan panel USB/BLE tetap terlihat.
        if (!quiet) {
            this.setState({ isRefreshingPorts: true, isLoading: false });
        }
        tauri.core.invoke('port_list').then(portsString => {
            if (this.isUnmounted) return;
            let data = portsString;
            if (typeof portsString === 'string') {
                try {
                    data = JSON.parse(portsString);
                } catch (err) {
                    console.error(err);
                    data = {};
                }
            }
            const next = normalizePorts(data);
            const prevKey = (this.state.ports || []).map(p => p.address).sort().join('|');
            const nextKey = next.map(p => p.address).sort().join('|');
            const patch = { isRefreshingPorts: false };
            if (prevKey !== nextKey) {
                patch.ports = next;
            }
            this.setState(patch);
        }).catch(err => {
            console.error(err);
            if (!this.isUnmounted) {
                this.setState({ isRefreshingPorts: false });
            }
        }).finally(() => {
            this._portRefreshInFlight = false;
        });
    }
    teardownBleLink (options = {}) {
        if (!this.bleLink) return;
        const keepNative = Boolean(options.keepNative);
        if (keepNative && typeof this.bleLink.detach === 'function') {
            this.bleLink.detach().catch(() => {});
        } else {
            this.bleLink.close();
        }
        this.bleLink = null;
    }
    componentWillUnmount() {
        this.isUnmounted = true;
        this.stopPortAutoPoll();
        if (this.unlistenPorts) {
            this.unlistenPorts();
        }
        if (this.connectionSuccessTimer) {
            clearTimeout(this.connectionSuccessTimer);
        }
        // Jangan putus BLE setelah user sudah Connect — Live Mode butuh sesi itu.
        const keepNative = String(
            this.props.connectedDevice ||
            (typeof window !== 'undefined' ? window.__garudabotConnectedDevice : '') ||
            ''
        ).startsWith('ble:');
        this.teardownBleLink({keepNative});
    }
    showConnectionSuccess (label, connectionTarget) {
        if (this.connectionSuccessTimer) {
            clearTimeout(this.connectionSuccessTimer);
        }

        const isBle = String(connectionTarget || '').startsWith('ble:');
        // BLE + Live sudah aktif dari pair — jangan clearStale (itu matikan Live).
        if (!(isBle && isBleLiveActive())) {
            this.clearStaleLiveMode({keepBleNative: isBle});
        }

        this.props.onSetConnectionDetails(connectionTarget);
        if (typeof window !== 'undefined') {
            window.__garudabotConnectedDevice = connectionTarget || null;
        }
        this.setState({ connectionSuccess: label });

        this.connectionSuccessTimer = setTimeout(() => {
            this.setState({ connectionSuccess: null });
            this.props.onSetConnecting(false);
            this.connectionSuccessTimer = null;
        }, 1800);
    }
    clearStaleLiveMode (options = {}) {
        const keepBleNative = Boolean(options.keepBleNative);
        stopBleLive({keepNative: keepBleNative}).catch(() => {});
        if (!keepBleNative) {
            setLiveTransport(null);
        }
        if (this.props.onSetConnected) {
            this.props.onSetConnected(false);
        }
        const tauri = window.__TAURI__;
        if (tauri && tauri.core) {
            tauri.core.invoke('board_disconnect').catch(() => {});
        }
    }
    handlePortWatcherEvent = (e) => {
        try {
            let data = e && e.payload !== undefined ? e.payload : e;
            if (typeof data === 'string') {
                data = JSON.parse(data);
            }
            const next = normalizePorts(data);
            const prevKey = (this.state.ports || []).map(p => p.address).sort().join('|');
            const nextKey = next.map(p => p.address).sort().join('|');
            // Abaikan update identik — cegah re-render daftar COM berkedip.
            if (prevKey === nextKey) {
                return;
            }
            this.setState({ ports: next });
        } catch (err) {
            console.error("FIRMATA: Error updating port list", err);
        }
    }
    componentDidUpdate(prevProps) {
        if (this.props.isConnecting && !prevProps.isConnecting) {
            this.refreshWhenDialogOpens();
        } else if (!this.props.isConnecting && prevProps.isConnecting) {
            this.stopPortAutoPoll();
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
    handleScanBle (options = {}) {
        const preserveConnected = Boolean(
            options.preserveConnected ||
            isBleLiveActive() ||
            String(this.props.connectedDevice || '').startsWith('ble:')
        );
        const prev = this.bleLink;
        this.setState({
            isScanningBle: true,
            bleScanError: null,
            bleDevices: preserveConnected ? this.state.bleDevices : []
        });

        const run = async () => {
            // Scan penuh = putus; preserve = jangan close native.
            if (prev) {
                if (preserveConnected && typeof prev.detach === 'function') {
                    try { await prev.detach(); } catch (e) { /* ignore */ }
                } else if (typeof prev.closeAsync === 'function') {
                    try { await prev.closeAsync(); } catch (e) { /* ignore */ }
                }
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
                const preferred = String(
                    this.props.bleDeviceName || this.state.bleNameDraft || ''
                ).trim();
                if (typeof window !== 'undefined' && preferred) {
                    window.__garudabotBlePreferredName = preferred;
                }
                const found = await link.discover(14000, preferred, {preserveConnected});
                if (this.isUnmounted) return;
                const list = Object.values(found || {});
                if (list.length === 0) {
                    this.setState({
                        isScanningBle: false,
                        bleDevices: [],
                        bleScanError: this.props.intl.formatMessage({
                            id: 'gui.boardConnection.bleScanNotFound',
                            defaultMessage:
                                'Tidak ada board BLE. Pastikan board menyala, Bluetooth PC aktif, ' +
                                'lalu Search lagi.',
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
                defaultMessage: 'Search BLE dulu, lalu pilih board.',
                description: 'Alert when pairing without scan'
            }));
            return;
        }

        this.setState({ pairingBleId: device.peripheralId });
        const preferred = String(
            this.props.bleDeviceName || this.state.bleNameDraft || ''
        ).trim();
        if (typeof window !== 'undefined' && preferred) {
            window.__garudabotBlePreferredName = preferred;
        }

        const run = async () => {
            const result = await this.bleLink.connect(device.peripheralId, preferred);
            if (this.isUnmounted) return;
            const resolvedId = (result && result.peripheralId) || device.peripheralId;
            const label = (result && result.name) || device.name || resolvedId;

            // Connect = langsung aktifkan Live Mode (ping). Satu langkah mulus.
            // Firmware Live harus sudah dari Upload Program sebelumnya.
            try {
                await startBleLive(resolvedId, {keepNative: true});
                setLiveTransport('ble');
                if (this.props.onSetConnected) {
                    this.props.onSetConnected(true);
                }
                if (typeof window !== 'undefined') {
                    window.__garudabotLiveErrorShown = false;
                    window.__garudabotLiveModeOn = true;
                    window.__garudabotConnectedDevice = `ble:${resolvedId}`;
                }
            } catch (liveErr) {
                // Native sudah connect — simpan target; user bisa Turn Live Mode On.
                console.warn('[BLE Connect] Live ping gagal, target tetap disimpan', liveErr);
                setLiveTransport(null);
                if (this.props.onSetConnected) {
                    this.props.onSetConnected(false);
                }
                if (this.isUnmounted) return;
                this.setState({ pairingBleId: null });
                this.showConnectionSuccess(label, `ble:${resolvedId}`);
                this.teardownBleLink({keepNative: true});
                window.alert(
                    'Board tersambung, tapi Live Mode belum siap.\n\n' +
                    String(liveErr && liveErr.message ? liveErr.message : liveErr) +
                    '\n\nPastikan sudah Upload Program (firmware Live), ' +
                    'lalu Board → Turn Live Mode On.'
                );
                return;
            }

            if (this.isUnmounted) return;
            this.setState({ pairingBleId: null });
            this.showConnectionSuccess(label, `ble:${resolvedId}`);
            // Pastikan flag Live tetap On setelah dialog success (clearStale di-skip).
            if (this.props.onSetConnected) {
                this.props.onSetConnected(true);
            }
            setLiveTransport('ble');
            // Jangan putus native — Live Mode pakai sesi yang sama.
            this.teardownBleLink({keepNative: true});
        };

        run().catch(err => {
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
        if (typeof window !== 'undefined') {
            window.__garudabotBlePreferredName = saved.name;
        }
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
        // Tutup dialog: jangan putus BLE kalau sudah Connect/Live.
        this.stopPortAutoPoll();
        const keepNative = String(
            this.props.connectedDevice ||
            (typeof window !== 'undefined' ? window.__garudabotConnectedDevice : '') ||
            ''
        ).startsWith('ble:') || isBleLiveActive();
        this.teardownBleLink({keepNative});
        this.props.onSetConnecting(false);
        if (!keepNative) {
            this.props.onSetConnectionDetails(null);
        }
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
                isRefreshingPorts={this.state.isRefreshingPorts}
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
                onRefreshPorts={this.handleRefreshPorts}
                onScanBle={() => this.handleScanBle({
                    preserveConnected: Boolean(
                        String(this.props.connectedDevice || '').startsWith('ble:') ||
                        isBleLiveActive()
                    )
                })}
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
    connectedDevice: PropTypes.string,
    intl: intlShape.isRequired,
    isConnecting: PropTypes.bool,
    onSetBleDeviceName: PropTypes.func,
    onSetConnecting: PropTypes.func,
    onSetConnectionDetails: PropTypes.func,
    onSetConnected: PropTypes.func,
    vm: PropTypes.object
};

const mapStateToProps = state => ({
    vm: state.raceroGui.vm,
    isConnecting: state.raceroGui.board.isConnecting,
    bleDeviceName: state.raceroGui.board.bleDeviceName,
    connectedDevice: state.raceroGui.board.connectedDevice
});

const mapDispatchToProps = dispatch => ({
    onSetConnecting: connecting => dispatch(setConnectingStatus(connecting)),
    onSetConnectionDetails: details => dispatch(setConnectionDetails(details)),
    onSetConnected: connected => dispatch(setConnectedStatus(connected)),
    onSetBleDeviceName: name => dispatch(setBleDeviceName(name))
});

export default injectIntl(connect(mapStateToProps, mapDispatchToProps)(BoardConnectionDialog));
