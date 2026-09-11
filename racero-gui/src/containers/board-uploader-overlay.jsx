import React from 'react';
import { connect } from 'react-redux';
import { boards } from 'racero-boards';
import BoardUploaderOverlayComponent from '../components/board-uploader-overlay/board-uploader-overlay.jsx';
import Esp32BleLink from '../lib/ble/esp32-ble-link.js';
import {
    saveLastFlashedBleName,
    loadStoredBatch,
    saveStoredBatch
} from '../lib/ble/ble-device-name.js';

/**
 * Overlay compile/upload.
 * - USB (COMx): Rust flash lewat arduino-cli.
 * - Bluetooth (`ble:<id>`): Rust compile + inject → frontend kirim .bin lewat Scratch Link.
 *
 * Log di-batch (~200ms) supaya PC lama tidak re-render tiap baris compiler.
 */
class BoardUploaderOverlay extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            logs: '',
            isCompiling: true
        };

        this.bottomRef = null;
        this.setBottomRef = element => {
            this.bottomRef = element;
        };

        this.unlisten = null;
        this.bleLink = null;
        this._logBuffer = '';
        this._logFlushTimer = null;
        this._cancelled = false;
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
            this.setState({ logs: 'Memulai upload...\n', isCompiling: true }, () => {
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
    }

    /** Tombol Cancel: hentikan arduino-cli + BLE OTA. */
    handleCancel = async () => {
        if (!this.state.isCompiling || this._cancelled) return;
        this._cancelled = true;
        this.appendLog('\nMembatalkan upload...\n', true);

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
        this.appendLog('Upload dibatalkan.\n', true);
        this.setState({ isCompiling: false });
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

        if (this.unlisten) {
            await this.unlisten();
            this.unlisten = null;
        }
        if (this.bleLink) {
            this.bleLink.close();
            this.bleLink = null;
        }
        this.flushLogBuffer(true);

        const { cppCode } = this.props;
        try {
            this.unlisten = await tauri.event.listen('compiler-log', (event) => {
                if (this._cancelled) return;
                const payload = String(event.payload || '');
                this._logBuffer += payload.endsWith('\n') ? payload : `${payload}\n`;
                this.scheduleLogFlush();

                if (payload.includes('Process finished') &&
                    !(this.props.connectedDevice || '').startsWith('ble:')) {
                    this.flushLogBuffer(true);
                    this.setState({ isCompiling: false });
                }
            });

            await tauri.core.invoke('board_disconnect');
            if (this._cancelled) return;
            await new Promise(res => setTimeout(res, 500));
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
            const bleName = this.props.bleDeviceName || 'Garudabot';

            if (isBle) {
                this.appendLog(
                    `Upload Bluetooth\nBoard: ${boardName}\nNama BLE: ${bleName}\n`,
                    true
                );
            } else {
                this.setState({ logs: '' });
                this.appendLog(
                    `Upload USB → ${this.props.connectedDevice}\n` +
                    `Board: ${boardName}\n` +
                    `Nama BLE: ${bleName}\n`,
                    true
                );
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

            this.markBleNameFlashed(bleName);
            this.flushLogBuffer(true);
            this.appendLog(`Upload selesai (${bleName}).\n`, true);
            this.setState({ isCompiling: false });
        } catch (error) {
            this.flushLogBuffer(true);
            if (this._cancelled || this.isCancelledError(error)) {
                this.appendLog('Upload dibatalkan.\n', true);
                this.setState({ isCompiling: false });
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
     * Lanjutan upload Bluetooth: terima payload JSON dari Rust, lalu OTA via Scratch Link.
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
            this.markBleNameFlashed(bleName || this.props.bleDeviceName || 'Garudabot');
            this.appendLog(
                `Selesai. Nama BLE di firmware: "${bleName || this.props.bleDeviceName}". ` +
                'ESP32 restart — Connect BLE lagi sebentar.\n'
            );
            this.setState({ isCompiling: false });
        } catch (error) {
            if (this._cancelled || this.isCancelledError(error)) {
                this.appendLog('Upload dibatalkan.\n', true);
                this.setState({ isCompiling: false });
                return;
            }
            this.appendLog(`\nBLE OTA gagal: ${error}\n`);
            this.appendLog('Cek Scratch Link + board menyala, lalu Connect BLE ulang.\n');
            this.setState({ isCompiling: false });
        } finally {
            if (this.bleLink) {
                this.bleLink.close();
                this.bleLink = null;
            }
        }
    };

    render() {
        return (
            <BoardUploaderOverlayComponent
                isVisible={this.props.isVisible}
                onClose={this.props.onClose}
                onCancel={this.handleCancel}
                logs={this.state.logs}
                isCompiling={this.state.isCompiling}
                setBottomRef={this.setBottomRef}
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

export default connect(mapStateToProps)(BoardUploaderOverlay);
