import React from 'react';
import { connect } from 'react-redux';
import { boards } from 'racero-boards';
import BoardUploaderOverlayComponent from '../components/board-uploader-overlay/board-uploader-overlay.jsx';
import Esp32BleLink from '../lib/ble/esp32-ble-link.js';
import {startBleLive, stopBleLive} from '../lib/ble/ble-live-session.js';
import {setLiveTransport} from '../lib/live-transport.js';
import {
    saveLastFlashedBleName,
    loadBleNameForBoard,
    loadStoredBatch,
    saveStoredBatch
} from '../lib/ble/ble-device-name.js';
import {setConnectedStatus} from '../reducers/board';
import {closeSerialMonitorForUpload} from './debug-panel.jsx';
import {setSerialStatus, appendDebugLog} from '../reducers/debug-panel';
import {isAppDebug} from '../lib/app-debug.js';

/** Board keluarga MRT (MRT 3 / MRT X / Huna Robo v2) → dialog compiler Blockedit. */
const MRT_FQBN_PREFIX = 'racero:avr:32';

/**
 * Overlay compile/upload.
 * - USB (COMx): Rust flash lewat arduino-cli.
 * - Bluetooth (`ble:<id>`): Rust compile + inject → frontend kirim .bin lewat BLE native.
 * - Board MRT 3 / Huna: dialog "Compiling & Uploading Program..." (log hijau,
 *   progress bar, "Please press reset button...").
 *
 * Log di-batch (~200ms) supaya PC lama tidak re-render tiap baris compiler.
 */
class BoardUploaderOverlay extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            logs: '',
            isCompiling: true,
            progress: 0,
            indeterminate: true
        };

        this.bottomRef = null;
        this.setBottomRef = element => {
            this.bottomRef = element;
        };

        this.unlisten = null;
        this.unlistenMrt = null;
        this.bleLink = null;
        this._logBuffer = '';
        this._logFlushTimer = null;
        this._cancelled = false;
        this._mrtFinished = false;
        this._lastMrtLine = '';
    }

    componentDidMount() {
        if (this.props.isVisible) {
            this.startCompilation();
        }
    }

    componentDidUpdate(prevProps, prevState) {
        if (this.props.isVisible && !prevProps.isVisible) {
            this.flushLogBuffer(true);
            this._cancelled = false;
            this._mrtFinished = false;
            this._lastMrtLine = '';
            this.setState({
                logs: '',
                isCompiling: true,
                progress: this.isMrtBoard() ? 6 : 0,
                indeterminate: true
            }, () => {
                this.startCompilation();
            });
        }

        // auto scroll tanpa smooth (lebih ringan di CPU lama)
        if (this.state.logs !== prevState.logs && this.bottomRef) {
            this.bottomRef.scrollIntoView({ behavior: 'auto' });
        }
    }

    async componentWillUnmount() {
        this.flushLogBuffer(true);
        if (this.bleLink) {
            this.bleLink.close();
            this.bleLink = null;
        }
        if (this.unlisten) {
            const unsubscribe = await this.unlisten;
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            } else if (typeof this.unlisten === 'function') {
                this.unlisten();
            }
        }
        await this.stopMrtListener();
    }

    /** Nama board aktif di VM. */
    getBoardName = () => (this.props.vm && this.props.vm.runtime &&
        this.props.vm.runtime.boardConfig && this.props.vm.runtime.boardConfig.name) || 'Arduino Uno';

    /** True bila board keluarga MRT/Huna lewat USB → dialog compiler + progress. */
    isMrtBoard = () => {
        const board = boards[this.getBoardName()];
        const fqbn = (board && board.fqbn) || '';
        const isBle = String(this.props.connectedDevice || '').startsWith('ble:');
        return !isBle && fqbn.startsWith(MRT_FQBN_PREFIX);
    };

    /** Satu baris status MRT. Lewati ulang jika pesan sudah ada atau lebih pendek. */
    appendStageLine = line => {
        const text = String(line || '').trim();
        if (!text) return;
        const prev = this._lastMrtLine;
        if (prev && (prev === text || prev.includes(text))) return;
        this._lastMrtLine = text;
        this.appendLog(`${text}\n`, true);
    };

    /** Event `mrt-download` dari Rust: {stage, progress, total, message}. */
    handleMrtEvent = event => {
        if (this._cancelled) return;
        const payload = event.payload || {};
        const stage = payload.stage;
        const message = String(payload.message || '');
        const progress = Number(payload.progress) || 0;
        const total = Number(payload.total) || 0;

        switch (stage) {
        case 'wait_reset':
            this.appendStageLine(message || 'Please press reset button...');
            this.setState({progress: 48, indeterminate: false});
            break;
        case 'downloading': {
            this.appendStageLine(message || 'Downloading...');
            const pct = total > 0 ? 50 + Math.round((progress / total) * 49) : 55;
            this.setState({progress: Math.min(99, pct), indeterminate: false});
            break;
        }
        case 'fallback':
            this.appendStageLine(message || 'Downloading...');
            this.setState({indeterminate: true});
            break;
        case 'done':
            this._mrtFinished = true;
            this.appendStageLine(message || 'Please reset board to run program');
            this.setState({progress: 100, indeterminate: false, isCompiling: false});
            break;
        case 'error':
            this._mrtFinished = true;
            this.appendStageLine(message || 'Download error');
            this.setState({indeterminate: false, isCompiling: false});
            break;
        default:
            break;
        }
    };

    stopMrtListener = async () => {
        if (!this.unlistenMrt) return;
        const pending = this.unlistenMrt;
        this.unlistenMrt = null;
        try {
            const unsubscribe = await pending;
            if (typeof unsubscribe === 'function') unsubscribe();
        } catch (e) { /* ignore */ }
    };

    /** Tombol Cancel: hentikan arduino-cli + BLE OTA. */
    handleCancel = async () => {
        if (!this.state.isCompiling || this._cancelled) return;
        this._cancelled = true;
        this._mrtFinished = true;
        if (this.isMrtBoard()) {
            this.appendStageLine('Downloading has been stopped');
        } else {
            this.appendLog('\nMembatalkan upload...\n', true);
        }

        const tauri = window.__TAURI__;
        if (tauri && tauri.core) {
            try {
                await tauri.core.invoke('board_compile_cancel');
            } catch (e) { /* ignore */ }
        }

        if (this.bleLink) {
            try {
                await this.bleLink.closeAsync();
            } catch (e) { /* ignore */ }
            this.bleLink = null;
        }

        this.flushLogBuffer(true);
        if (!this.isMrtBoard()) {
            this.appendLog('Upload dibatalkan.\n', true);
        }
        this.setState({isCompiling: false, indeterminate: false});
    };

    /** Tulis log segera (pesan penting) atau lewat buffer. */
    appendLog = (line, immediate = false) => {
        const text = line + (line.endsWith('\n') ? '' : '\n');
        if (immediate) {
            this.flushLogBuffer(true);
            this.setState(prevState => ({
                logs: prevState.logs + text
            }));
            return;
        }
        this._logBuffer += text;
        this.scheduleLogFlush();
    };

    scheduleLogFlush = () => {
        if (this._logFlushTimer) return;
        this._logFlushTimer = setTimeout(() => {
            this.flushLogBuffer(false);
        }, 200);
    };

    flushLogBuffer = clearTimer => {
        if (this._logFlushTimer) {
            clearTimeout(this._logFlushTimer);
            this._logFlushTimer = null;
        } else if (!clearTimer && !this._logBuffer) {
            return;
        }
        if (!this._logBuffer) return;
        const chunk = this._logBuffer;
        this._logBuffer = '';
        this.setState(prevState => ({
            logs: prevState.logs + chunk
        }));
    };

    isCancelledError = error => {
        const text = String(error || '');
        return /dibatalkan|cancel/i.test(text);
    };

    startCompilation = async () => {
        const tauri = window.__TAURI__;
        if (!tauri) return;

        this._cancelled = false;
        this._mrtFinished = false;
        this._lastMrtLine = '';

        if (this.unlisten) {
            await this.unlisten();
            this.unlisten = null;
        }
        await this.stopMrtListener();
        if (this.bleLink) {
            this.bleLink.close();
            this.bleLink = null;
        }
        const isMrt = this.isMrtBoard();
        if (isMrt) {
            this.unlistenMrt = tauri.event.listen('mrt-download', this.handleMrtEvent);
        }
        // Lepas sesi Live Mode BLE agar link BLE bebas untuk OTA.
        try {
            await stopBleLive({keepNative: false});
            if (this.props.onSetConnected) {
                this.props.onSetConnected(false);
            }
        } catch (e) { /* ignore */ }
        this.flushLogBuffer(true);

        const { cppCode } = this.props;
        try {
            if (isAppDebug()) {
                await closeSerialMonitorForUpload();
                if (this.props.onSerialClosedForUpload) {
                    this.props.onSerialClosedForUpload();
                }
                if (this.props.onAppendDebugLog) {
                    this.props.onAppendDebugLog('--- Upload dimulai ---\n');
                }
            }

            this.unlisten = await tauri.event.listen('compiler-log', (event) => {
                if (this._cancelled) return;
                const payload = String(event.payload || '');
                this._logBuffer += payload.endsWith('\n') ? payload : `${payload}\n`;
                this.scheduleLogFlush();

                if (isMrt) {
                    if (/Sketch uses|Global variables use/i.test(payload)) {
                        this.setState({progress: 30, indeterminate: false});
                    } else if (payload.includes('Loading')) {
                        this.setState({progress: 42, indeterminate: false});
                    }
                }

                if (payload.includes('Process finished') &&
                    !(this.props.connectedDevice || '').startsWith('ble:')) {
                    this.flushLogBuffer(true);
                    this.setState({ isCompiling: false });
                }
            });

            await tauri.core.invoke('board_disconnect');
            if (this._cancelled) return;
            // Windows perlu waktu melepas handle COM setelah Live/Firmata.
            await new Promise(res => setTimeout(res, 1200));
            if (this._cancelled) return;

            const boardName = (this.props.vm.runtime.boardConfig &&
                this.props.vm.runtime.boardConfig.name) || 'Arduino Uno';
            const board = boards[boardName];
            if (!board || !board.fqbn) {
                throw new Error(
                    `Board "${boardName}" tidak dikenal. Pilih ulang board (mis. ESP32 Dev Module).`
                );
            }
            if (!this.props.connectedDevice) {
                throw new Error('Belum Connect USB/BLE. Sambungkan dulu sebelum upload.');
            }

            const isBle = String(this.props.connectedDevice || '').startsWith('ble:');
            const usesBle = isBle || /esp32/i.test(board.fqbn || '');
            const bleName = usesBle ?
                (loadBleNameForBoard(boardName) || this.props.bleDeviceName || 'Garudabot') :
                '';

            if (isBle) {
                this.appendLog(
                    `Upload Bluetooth\nBoard: ${boardName}\nNama BLE: ${bleName}\n`,
                    true
                );
            } else if (usesBle) {
                this.setState({ logs: '' });
                this.appendLog(
                    `Upload USB → ${this.props.connectedDevice}\n` +
                    `Board: ${boardName}\n` +
                    `Nama BLE: ${bleName}\n`,
                    true
                );
            } else if (!isMrt) {
                this.setState({ logs: '' });
                this.appendLog(
                    `Upload USB → ${this.props.connectedDevice}\n` +
                    `Board: ${boardName}\n`,
                    true
                );
            } else {
                this.setState({logs: '', progress: 6, indeterminate: true});
            }

            const result = await tauri.core.invoke('board_compile_and_flash', {
                code: cppCode,
                fqbn: board.fqbn,
                port: this.props.connectedDevice,
                otaPassword: this.props.otaPassword || '',
                bleDeviceName: bleName
            });

            if (this._cancelled) return;

            if (typeof result === 'string' && result.trim().startsWith('{')) {
                const payload = JSON.parse(result);
                if (payload.mode === 'ble-ota') {
                    await this.runBleOta(payload, bleName);
                    return;
                }
            }

            if (usesBle) this.markBleNameFlashed(bleName);
            this.flushLogBuffer(true);
            if (!isMrt) {
                this.appendLog(
                    usesBle ? `Upload selesai (${bleName}).\n` : 'Upload selesai.\n',
                    true
                );
            }
            this.setState({ isCompiling: false, indeterminate: false });
            if (isMrt && !this._mrtFinished) {
                this.handleMrtEvent({
                    payload: {
                        stage: 'done',
                        progress: 1,
                        total: 1,
                        message: 'Please reset board to run program'
                    }
                });
            }
        } catch (error) {
            this.flushLogBuffer(true);
            if (this._cancelled || this.isCancelledError(error)) {
                if (!isMrt) this.appendLog('Upload dibatalkan.\n', true);
                this.setState({ isCompiling: false, indeterminate: false });
                return;
            }
            const message = String((error && error.message) || error || '');
            if (isMrt) {
                this._mrtFinished = true;
                this.appendStageLine(message);
                this.setState({isCompiling: false, indeterminate: false});
                return;
            }
            this.setState(prevState => ({
                logs: prevState.logs + '\nSYSTEM ERROR: ' + error + '\n',
                isCompiling: false
            }));
        }
    };

    markBleNameFlashed = bleName => {
        // Ingat nama yang baru masuk firmware (untuk label daftar BLE).
        saveLastFlashedBleName(bleName);
        // Majukan antrian Excel ke baris berikutnya jika nama cocok.
        const batch = loadStoredBatch();
        if (batch.names && batch.names.length && batch.index < batch.names.length) {
            const current = batch.names[batch.index];
            if (current === bleName) {
                const next = Math.min(batch.index + 1, batch.names.length);
                saveStoredBatch(batch.names, next);
            }
        }
    };

    /**
     * Lanjutan upload Bluetooth: terima payload JSON dari Rust, lalu OTA via BLE native.
     * (Compile sudah selesai di backend; di sini hanya transfer firmware.)
     */
    runBleOta = async (payload, bleName) => {
        if (this._cancelled) return;

        const peripheralId = payload.peripheralId;
        const size = payload.size || 0;
        const sizeKb = Math.round(size / 1024);
        this.appendLog(`BLE OTA: ${sizeKb} KB → ${peripheralId}\n`);

        if (this.bleLink) {
            try {
                await this.bleLink.closeAsync();
            } catch (e) { /* ignore */ }
            this.bleLink = null;
        }

        let lastPct = 0;
        const link = new Esp32BleLink({
            onNotify: msg => {
                if (this._cancelled) return;
                const text = String(msg || '');
                if (text.startsWith('N:')) return;
                if (text === 'ACK:BEGIN') {
                    this.appendLog('OTA mulai…\n');
                    return;
                }
                if (text === 'OK') return;
                if (text.startsWith('ERR') || text.startsWith('RDY')) {
                    this.appendLog(`[BLE] ${text}\n`);
                }
            },
            onError: err => {
                if (this._cancelled) return;
                this.appendLog(`[BLE] ${err}\n`);
            }
        });
        this.bleLink = link;

        try {
            await link.uploadOta(peripheralId, payload.firmwareBase64, {
                preferredName: bleName || this.props.bleDeviceName || '',
                onStatus: () => {},
                onProgress: (sent, total) => {
                    if (this._cancelled || !total) return;
                    const pct = sent >= total ? 100 : Math.floor((sent / total) * 100);
                    const step = pct === 100 ? 100 : Math.floor(pct / 10) * 10;
                    if (step <= lastPct) return;
                    lastPct = step;
                    this.appendLog(`OTA ${step}%\n`);
                }
            });
            if (this._cancelled) return;
            const flashedName = bleName || this.props.bleDeviceName || 'Garudabot';
            this.markBleNameFlashed(flashedName);
            if (typeof window !== 'undefined') {
                window.__garudabotBlePreferredName = flashedName;
            }
            this.appendLog(
                `Selesai. Nama BLE di firmware: "${flashedName}". ` +
                'Menunggu restart ESP32, menyambung Live Mode…\n'
            );

            // Setelah OTA board reboot — sambung ulang Live otomatis.
            try {
                await stopBleLive({keepNative: false});
            } catch (e) { /* ignore */ }
            try {
                await link.closeAsync();
            } catch (e) { /* ignore */ }
            this.bleLink = null;
            await new Promise(r => setTimeout(r, 4000));
            if (this._cancelled) return;
            try {
                // ID Windows sering berubah setelah reboot — startBleLive pakai preferred name.
                await startBleLive(String(peripheralId), {keepNative: false});
                setLiveTransport('ble');
                if (this.props.onSetConnected) {
                    this.props.onSetConnected(true);
                }
                if (typeof window !== 'undefined') {
                    const session = window.__garudabotBleLiveSession;
                    const newId = (session && session.peripheralId) || peripheralId;
                    window.__garudabotConnectedDevice = `ble:${newId}`;
                    window.__garudabotLiveModeOn = true;
                    window.__garudabotLiveErrorShown = false;
                }
                this.appendLog('Live Mode tersambung lagi. Siap green flag.\n', true);
            } catch (reErr) {
                this.appendLog(
                    `Auto-reconnect Live gagal: ${reErr && reErr.message ? reErr.message : reErr}. ` +
                    'Search → Connect BLE lagi.\n',
                    true
                );
            }
            this.setState({ isCompiling: false });
        } catch (error) {
            if (this._cancelled || this.isCancelledError(error)) {
                this.appendLog('Upload dibatalkan.\n', true);
                this.setState({ isCompiling: false });
                return;
            }
            this.appendLog(`\nBLE OTA gagal: ${error}\n`);
            this.appendLog('Cek Bluetooth PC + board menyala, lalu Connect BLE ulang.\n');
            this.setState({ isCompiling: false });
        } finally {
            if (this.bleLink) {
                this.bleLink.close();
                this.bleLink = null;
            }
        }
    };

    render() {
        const isMrt = this.props.isVisible && this.isMrtBoard();
        return (
            <BoardUploaderOverlayComponent
                isVisible={this.props.isVisible}
                onClose={this.props.onClose}
                onCancel={this.handleCancel}
                logs={this.state.logs}
                isCompiling={this.state.isCompiling}
                setBottomRef={this.setBottomRef}
                showProgress={isMrt}
                progress={this.state.progress}
                indeterminate={this.state.indeterminate}
            />
        );
    }
}

const mapStateToProps = state => {
    return {
        vm: state.raceroGui.vm,
        connectedDevice: state.raceroGui.board.connectedDevice,
        otaPassword: state.raceroGui.board.otaPassword || '',
        bleDeviceName: state.raceroGui.board.bleDeviceName || 'Garudabot'
    };
};

const mapDispatchToProps = dispatch => ({
    onSetConnected: connected => dispatch(setConnectedStatus(connected)),
    onSerialClosedForUpload: () => dispatch(setSerialStatus({
        connected: false,
        status: 'Ditutup untuk upload'
    })),
    onAppendDebugLog: text => dispatch(appendDebugLog(text))
});

export default connect(mapStateToProps, mapDispatchToProps)(BoardUploaderOverlay);
