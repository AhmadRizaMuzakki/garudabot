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
    }

    componentDidMount() {
        if (this.props.isVisible) {
            this.startCompilation();
        }
    }

    componentDidUpdate(prevProps, prevState) {
        if (this.props.isVisible && !prevProps.isVisible) {
            this.setState({ logs: 'Starting compiler...\n', isCompiling: true }, () => {
                this.startCompilation();
            });
        }

        if (this.state.logs !== prevState.logs && this.bottomRef) {
            this.bottomRef.scrollIntoView({ behavior: 'smooth' });
        }
    }

    async componentWillUnmount() {
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

    appendLog = line => {
        this.setState(prevState => ({
            logs: prevState.logs + line + (line.endsWith('\n') ? '' : '\n')
        }));
    };

    startCompilation = async () => {
        const tauri = window.__TAURI__;
        if (!tauri) return;

        if (this.unlisten) {
            await this.unlisten();
            this.unlisten = null;
        }
        if (this.bleLink) {
            this.bleLink.close();
            this.bleLink = null;
        }

        const { cppCode } = this.props;
        try {
            this.unlisten = await tauri.event.listen('compiler-log', (event) => {
                this.setState(prevState => ({
                    logs: prevState.logs + event.payload + '\n'
                }));

                if (event.payload.includes('Process finished') &&
                    !(this.props.connectedDevice || '').startsWith('ble:')) {
                    this.setState({ isCompiling: false });
                }
            });

            await tauri.core.invoke('board_disconnect');
            await new Promise(res => setTimeout(res, 500));

            const boardName = (this.props.vm.runtime.boardConfig &&
                this.props.vm.runtime.boardConfig.name) || 'Arduino Uno';
            const board = boards[boardName];
            if (!board || !board.fqbn) {
                throw new Error(
                    `Board "${boardName}" tidak dikenal. Pilih ulang board (mis. ELF ESP32 Motor).`
                );
            }
            if (!this.props.connectedDevice) {
                throw new Error('Belum Connect USB/BLE. Sambungkan dulu sebelum upload.');
            }

            this.appendLog(
                `Board aktif: ${boardName}\nFQBN: ${board.fqbn}\nTarget: ${this.props.connectedDevice}\n` +
                `Nama BLE untuk inject: ${this.props.bleDeviceName || 'Garudabot'}\n`
            );

            const bleName = this.props.bleDeviceName || 'Garudabot';
            const result = await tauri.core.invoke('board_compile_and_flash', {
                code: cppCode,
                fqbn: board.fqbn,
                port: this.props.connectedDevice,
                otaPassword: this.props.otaPassword || '',
                bleDeviceName: bleName
            });

            if (typeof result === 'string' && result.trim().startsWith('{')) {
                const payload = JSON.parse(result);
                if (payload.mode === 'ble-ota') {
                    await this.runBleOta(payload, bleName);
                    return;
                }
            }

            this.markBleNameFlashed(bleName);
            this.appendLog(
                `\nUpload selesai. Nama BLE: "${bleName}".\n` +
                'Di Windows daftar Connect bisa tetap ESP32-xxxx (cek nRF Connect di HP).\n'
            );
            this.setState({ isCompiling: false });
        } catch (error) {
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
                this.appendLog(`[BLE] ${err}\n`);
            }
        });
        this.bleLink = link;

        try {
            await link.uploadOta(peripheralId, payload.firmwareBase64, {
                onStatus: () => {},
                onProgress: (sent, total) => {
                    if (!total) return;
                    const pct = sent >= total ? 100 : Math.floor((sent / total) * 100);
                    const step = pct === 100 ? 100 : Math.floor(pct / 10) * 10;
                    if (step <= lastPct) return;
                    lastPct = step;
                    this.appendLog(`OTA ${step}%\n`);
                }
            });
            this.markBleNameFlashed(bleName || this.props.bleDeviceName || 'Garudabot');
            this.appendLog(
                `Selesai. Nama BLE di firmware: "${bleName || this.props.bleDeviceName}". ` +
                'ESP32 restart — Connect BLE lagi sebentar.\n'
            );
            this.setState({ isCompiling: false });
        } catch (error) {
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
