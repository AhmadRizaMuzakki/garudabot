import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import {
    setSelectingStatus,
    setSelectedStatus,
    setConnectingStatus,
    setConnectedStatus,
    setCompilingStatus,
    setInstallStatus,
    setInstallingStatusMessage,
    setUploadStatus,
    setConnectionDetails,
    setBoardName,
} from '../reducers/board';

import {
    boards
} from 'racero-boards';
import {startBleLive, stopBleLive, isBleLiveActive} from '../lib/ble/ble-live-session.js';
import {setLiveTransport, isLiveSessionReady} from '../lib/live-transport.js';
import {
    beginLiveInstall,
    throwIfLiveInstallCancelled
} from '../lib/live-install.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

class Board extends React.Component {
    constructor (props) {
        super(props);

        bindAll(this, [
            'handleBoardSelection',
            'toggleBoardConnection',
            'handleLiveModeOn',
            'handleLiveModeOff',
            'setInstallProgress',
            'ensureLiveModeForVm',
            'runLiveModeOn',
            'pulseBleMotorSelfTest'
        ]);
        this._liveModePromise = null;
    }
    setInstallProgress (status) {
        if (this.props.onSetInstallingStatus) {
            this.props.onSetInstallingStatus(status);
        }
    }
    componentDidMount () {
        const name = this.props.vm &&
            this.props.vm.runtime &&
            this.props.vm.runtime.boardConfig &&
            this.props.vm.runtime.boardConfig.name;
        if (name && name !== this.props.selectedBoardName) {
            this.props.onSetBoardName(name);
        }
        this.publishLiveBridge();
    }
    componentDidUpdate (prevProps) {
        if (this.props.connectedDevice !== prevProps.connectedDevice ||
            this.props.isConnected !== prevProps.isConnected) {
            this.publishLiveBridge();
        }
    }
    /** Selalu publish ke window — jangan hilang saat HMR/remount. */
    publishLiveBridge () {
        if (typeof window === 'undefined') return;
        window.__garudabotEnsureLiveMode = this.ensureLiveModeForVm;
        window.__garudabotConnectedDevice = this.props.connectedDevice || null;
        window.__garudabotLiveModeOn = Boolean(this.props.isConnected);
    }
    componentWillUnmount() {
        // Jangan stopBleLive di sini — HMR/remount menu sering unmount Board
        // dan itu yang bikin menu "Turn off Live Mode" tapi sesi sudah mati.
        if (typeof window !== 'undefined' &&
            window.__garudabotEnsureLiveMode === this.ensureLiveModeForVm) {
            // Biarkan callback; instance baru akan menimpa di mount/render.
        }
    }
    handleBoardSelection () {
        this.props.onSetSelecting(true);
    }

    /**
     * Dipanggil dari racero-vm saat green flag butuh board tapi Live belum aktif.
     * BLE: reconnect cepat (tanpa OTA/dialog panjang) kalau sesi Windows putus.
     */
    ensureLiveModeForVm () {
        this.publishLiveBridge();
        if (isLiveSessionReady() || isBleLiveActive()) {
            return Promise.resolve('ready');
        }
        if (this._liveModePromise) {
            return this._liveModePromise;
        }
        const address = this.props.connectedDevice ||
            (typeof window !== 'undefined' ? window.__garudabotConnectedDevice : null);
        if (!address) {
            return Promise.reject(new Error(
                'Belum Connect board BLE.\n\n' +
                'Board → Search → Connect (Bluetooth), lalu green flag lagi.\n' +
                '(Live Mode wireless = BLE; USB hanya alternatif kabel.)'
            ));
        }

        // BLE: hidupkan Live di atas koneksi native — JANGAN OTA/compile
        // dan JANGAN close+scan (Windows sering → "Board BLE tidak ditemukan").
        if (String(address).startsWith('ble:')) {
            const peripheralId = String(address).slice(4);
            this._liveModePromise = startBleLive(peripheralId, {keepNative: true})
                .then(() => {
                    setLiveTransport('ble');
                    this.props.onSetConnected(true);
                    this.publishLiveBridge();
                    return 'ready';
                })
                .catch(err => {
                    const detail = String(err && err.message ? err.message : err);
                    return Promise.reject(new Error(
                        'BLE Live belum siap.\n\n' +
                        'Board → Search → Connect BLE dulu (Live ikut aktif), ' +
                        'atau Turn Live Mode On, tunggu selesai, lalu green flag.\n\n' +
                        detail
                    ));
                })
                .finally(() => {
                    this._liveModePromise = null;
                });
            return this._liveModePromise;
        }

        this._liveModePromise = this.runLiveModeOn(address)
            .then(() => {
                this.publishLiveBridge();
                return 'ready';
            })
            .finally(() => {
                this._liveModePromise = null;
            });
        return this._liveModePromise;
    }

    async enableBleLiveMode (peripheralId) {
        this.setInstallProgress('Menyambung BLE Live…');
        throwIfLiveInstallCancelled();

        const bleName = this.props.bleDeviceName || 'Garudabot';
        if (typeof window !== 'undefined') {
            window.__garudabotBlePreferredName = bleName;
        }

        // Firmware Live sudah dari Upload Program — di sini hanya connect + ping.
        // Tidak compile/OTA (hemat waktu, hindari "Compile gagal" saat pairing).
        try {
            const session = await startBleLive(peripheralId, {keepNative: true});
            if (!session) {
                throw new Error('Sesi BLE Live kosong.');
            }
            this.setInstallProgress(
                session.protocolVersion > 0 ?
                    `Live Mode siap (v${session.protocolVersion}).` :
                    'Live Mode siap.'
            );
        } catch (err) {
            const detail = String(err && err.message ? err.message : err);
            throw new Error(
                'Gagal menyambung Live Mode BLE.\n\n' +
                'Pastikan board sudah pernah Upload Program (firmware Live), ' +
                'menyala, lalu Search → Connect lagi.\n\n' +
                detail
            );
        }
    }

    /**
     * Pulsa M1 di background (jangan blokir dialog Live Mode).
     * Dipanggil setelah dialog ditutup.
     */
    async pulseBleMotorSelfTest () {
        if (!isBleLiveActive()) {
            return;
        }
        try {
            const session = typeof window !== 'undefined' ?
                window.__garudabotBleLiveSession : null;
            if (!session || typeof session.invoke !== 'function') {
                return;
            }
            // Port M1 = 19/21, port M2 = 16/17
            await session.invoke('pin_motor_dual', {pin1: 19, pin2: 21, speed: 60});
            await delay(500);
            await session.invoke('pin_motor_dual', {pin1: 19, pin2: 21, speed: 0});
            await delay(200);
            await session.invoke('pin_motor_dual', {pin1: 16, pin2: 17, speed: 60});
            await delay(500);
            await session.invoke('pin_motor_dual', {pin1: 16, pin2: 17, speed: 0});
            console.log('[Live BLE] self-test M1(19/21) lalu M2(16/17) selesai');
        } catch (err) {
            console.warn('[Live BLE] self-test M1 gagal (Live tetap aktif)', err);
        }
    }

    runLiveModeOn (address) {
        beginLiveInstall();

        if (address.startsWith('net:') || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(address)) {
            return Promise.reject(new Error(
                'Live Mode hanya USB atau BLE. Untuk WiFi, gunakan Upload Program.'
            ));
        }

        if (address.startsWith('ble:')) {
            const peripheralId = address.slice(4);
            this.props.onSetInstalling(true, 'Menyiapkan Live Mode Bluetooth…');
            return this.enableBleLiveMode(peripheralId).then(() => {
                setLiveTransport('ble');
                this.props.onSetConnected(true);
                this.props.onSetInstalling(false);
                if (typeof window !== 'undefined') {
                    window.__garudabotLiveErrorShown = false;
                }
                // Tes motor setelah dialog hilang — jangan blokir Live Mode On.
                this.pulseBleMotorSelfTest();
            }).catch(err => {
                this.props.onSetInstalling(false);
                setLiveTransport(null);
                this.props.onSetConnected(false);
                throw err;
            });
        }

        const tauri = window.__TAURI__;
        if (!tauri) {
            return Promise.reject(new Error('Tauri tidak tersedia.'));
        }

        const boardName = this.props.vm.runtime.boardConfig.name;
        const board = boards[boardName];
        if (!board || !board.fqbn) {
            return Promise.reject(new Error(`Board "${boardName}" tidak dikenal.`));
        }

        this.props.onSetInstalling(true, 'Flash Firmata USB… (bisa 1–2 menit)');
        return stopBleLive().catch(() => {}).then(() =>
            tauri.core.invoke('board_connect', {
                address: address,
                fqbn: board.fqbn
            })
        ).then(msg => {
            console.log(msg);
            setLiveTransport('usb');
            this.props.onSetConnected(true);
            this.props.onSetInstalling(false);
        }).catch(err => {
            this.props.onSetInstalling(false);
            setLiveTransport(null);
            this.props.onSetConnected(false);
            throw err;
        });
    }

    handleLiveModeOn () {
        const address = this.props.connectedDevice;
        if (!address) {
            window.alert(
                'Hubungkan board BLE dulu.\n\n' +
                'Board → Search → Connect (Bluetooth).\n' +
                'Live Mode wireless pakai BLE — setelah Connect, Live ikut aktif.'
            );
            return;
        }

        // Sudah Live BLE? Cukup pastikan sesi sehat.
        if (String(address).startsWith('ble:') &&
            (isBleLiveActive() || isLiveSessionReady())) {
            this.props.onSetConnected(true);
            setLiveTransport('ble');
            this.publishLiveBridge();
            this.pulseBleMotorSelfTest();
            return;
        }

        this.runLiveModeOn(address).catch(err => {
            console.error(err);
            const msg = String(err && err.message ? err.message : err);
            if (/dibatalkan|cancel/i.test(msg)) {
                return;
            }
            const isBle = String(address).startsWith('ble:');
            const tip = isBle ?
                '\n\nTips: pastikan Bluetooth PC aktif, board menyala, ' +
                'lalu Search → Connect BLE lagi sebelum Turn Live Mode On.' :
                '\n\nTips USB: cabut/colok ulang kabel, tutup Serial Monitor lain, ' +
                'lalu Turn Live Mode On lagi (flash Firmata bisa 1–2 menit).';
            window.alert('Live Mode gagal:\n\n' + msg + tip);
        });
    }
    handleLiveModeOff () {
        const finish = () => {
            setLiveTransport(null);
            this.props.onSetConnected(false);
            if (typeof window !== 'undefined') {
                window.__garudabotLiveModeOn = false;
            }
        };

        const address = this.props.connectedDevice;
        if (address && String(address).startsWith('ble:')) {
            // Off = lepas sesi Live saja; native tetap nyambung supaya
            // Turn On / green flag tidak perlu scan ulang (sering gagal di Windows).
            stopBleLive({keepNative: true}).then(finish).catch(err => {
                console.error(err);
                finish();
            });
            return;
        }

        const tauri = window.__TAURI__;
        if (!tauri) {
            finish();
            return;
        }

        stopBleLive().catch(() => {});
        tauri.core.invoke('board_disconnect')
            .then(finish)
            .catch(err => {
                console.error(err);
                finish();
            });
    }
    toggleBoardConnection () {
        if (!this.props.connectedDevice && !this.props.isConnecting) {
            this.props.onSetConnecting(true);
        } else {
            stopBleLive({keepNative: false}).catch(() => {});
            setLiveTransport(null);
            const tauri = window.__TAURI__;
            if (tauri) {
                tauri.core.invoke('board_disconnect').catch(() => {});
            }
            this.props.onSetConnected(false);
            this.props.onSetConnectionDetails(null);
            if (typeof window !== 'undefined') {
                window.__garudabotConnectedDevice = null;
                window.__garudabotLiveModeOn = false;
            }
        }
    }
    render () {
        // Pastikan bridge selalu ada tiap render (aman terhadap HMR).
        this.publishLiveBridge();
        const {
            /* eslint-disable no-unused-vars */
            children,
            isSelecting,
            isSelected,
            isConnected,
            isCompiling,
            isInstalling,
            isUploading,
            vm,
            /* eslint-enable no-unused-vars */
            ...props
        } = this.props;
        return this.props.children(this.handleBoardSelection, this.toggleBoardConnection, this.handleLiveModeOn, this.handleLiveModeOff, {
            ...props,
            isConnected: isConnected,
            isSelected: isSelected
        });
    }
}

Board.propTypes = {
    children: PropTypes.func,
    isSelecting: PropTypes.bool,
    isSelected: PropTypes.bool,
    isConnected: PropTypes.bool,
    isCompiling: PropTypes.bool,
    isInstalling: PropTypes.bool,
    isUploading: PropTypes.bool,
    onSetBoardName: PropTypes.func,
    onSetSelecting: PropTypes.func,
    onSetSelected: PropTypes.func,
    onSetConnected: PropTypes.func,
    onSetCompiling: PropTypes.func,
    onSetInstalling: PropTypes.func,
    onSetInstallingStatus: PropTypes.func,
    onSetUploading: PropTypes.func,
    onSetConnectionDetails: PropTypes.func,
    selectedBoardName: PropTypes.string,
    bleDeviceName: PropTypes.string,
};

const mapStateToProps = state => {
    return {
        vm: state.raceroGui.vm,
        isSelecting: state.raceroGui.board.isSelecting,
        isSelected: state.raceroGui.board.isSelected,
        isConnecting: state.raceroGui.board.isConnecting,
        isConnected: state.raceroGui.board.isConnected,
        isCompiling: state.raceroGui.board.isCompiling,
        isInstalling: state.raceroGui.board.isInstalling,
        isUploading: state.raceroGui.board.isUploading,
        selectedBoardName: state.raceroGui.board.selectedBoardName,
        bleDeviceName: state.raceroGui.board.bleDeviceName || 'Garudabot',

        connectedDevice: state.raceroGui.board.connectedDevice,
    };
};

const mapDispatchToProps = dispatch => ({
    onSetSelecting: selecting => dispatch(setSelectingStatus(selecting)),
    onSetSelected: connecting => dispatch(setSelectedStatus(connecting)),
    onSetConnecting: connecting => dispatch(setConnectingStatus(connecting)),
    onSetConnected: connected => dispatch(setConnectedStatus(connected)),
    onSetCompiling: compiling => dispatch(setCompilingStatus(compiling)),
    onSetInstalling: (installing, status) => dispatch(setInstallStatus(installing, status)),
    onSetInstallingStatus: status => dispatch(setInstallingStatusMessage(status)),
    onSetUploading: uploading => dispatch(setUploadStatus(uploading)),
    onSetBoardName: name => dispatch(setBoardName(name)),

    onSetConnectionDetails: details => dispatch(setConnectionDetails(details)),
});


export default connect(
    mapStateToProps,
    mapDispatchToProps
)(Board);
