/**
 * Klien BLE ESP32 untuk Connect + upload program lewat Bluetooth.
 *
 * Transport: Scratch Link WebSocket lokal (bukan Web Bluetooth browser).
 * Digunakan dialog Connect (scan/pair) dan board-uploader (BLE OTA).
 * Filter discover: service UUID — nama device di Windows sering kosong.
 */

import ScratchLinkSocket from './scratch-link-socket.js';
import {
    GARUDABOT_BLE,
    DISCOVER_OPTIONS,
    bytesToBase64,
    decodeFirmwareBase64,
    decodeNotifyMessage,
    buildBeginPacket,
    buildDataPacket,
    buildEndPacket,
    peripheralDisplayName
} from './protocol.js';

export {GARUDABOT_BLE, peripheralDisplayName};

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export default class Esp32BleLink {
    constructor ({onPeripheral, onError, onOpen, onClose, onNotify} = {}) {
        this._onPeripheral = onPeripheral || (() => {});
        this._onError = onError || (() => {});
        this._onNotify = onNotify || (() => {});
        this._peripherals = {};
        this._notifyWaiters = [];

        this._socket = new ScratchLinkSocket('BLE', {
            onError: err => this._onError(err),
            onOpen: onOpen || (() => {}),
            onClose: () => {
                if (onClose) onClose();
            },
            onNotification: (method, params) => this._onSocketNotification(method, params)
        });
    }

    _ingestPeripheral (params) {
        if (!params || params.peripheralId === undefined || params.peripheralId === null) {
            return;
        }
        const normalized = {
            ...params,
            name: peripheralDisplayName(params)
        };
        this._peripherals[String(params.peripheralId)] = normalized;
        this._onPeripheral(normalized, this.getPeripherals());
    }

    open () {
        return this._socket.open();
    }

    close () {
        this.closeAsync().catch(() => {});
    }

    async closeAsync () {
        this._notifyWaiters.forEach(w => w.reject(new Error('BLE session closed')));
        this._notifyWaiters = [];
        this._peripherals = {};
        this._socket.close();
        // Bebaskan sesi Rust bridge jika pernah terbuka.
        try {
            if (window.__TAURI__ && window.__TAURI__.core) {
                await window.__TAURI__.core.invoke('ble_link_close');
            }
        } catch (e) { /* ignore */ }
    }

    /**
     * Scan Scratch Link sampai ketemu device atau timeout.
     * @param {number} timeoutMs
     */
    async scan (timeoutMs = 12000) {
        this._peripherals = {};
        // Tutup bridge Rust dulu agar Scratch Link tidak “penuh”.
        try {
            if (window.__TAURI__ && window.__TAURI__.core) {
                await window.__TAURI__.core.invoke('ble_link_close');
                await delay(600);
            }
        } catch (e) { /* ignore */ }

        await this._socket.open();
        await this._socket.request('discover', DISCOVER_OPTIONS);

        const started = Date.now();
        while (Date.now() - started < timeoutMs) {
            if (Object.keys(this._peripherals).length > 0) {
                await delay(800);
                return this.getPeripherals();
            }
            await delay(250);
        }
        return this.getPeripherals();
    }

    /**
     * Scratch Link butuh discover di sesi WebSocket yang sama sebelum connect.
     * @param {string|number} peripheralId id dari sesi scan sebelumnya (boleh beda tipe)
     * @param {number} timeoutMs
     * @returns {Promise<string|number>} peripheralId asli dari discover (tipe yang Scratch Link kenal)
     */
    async discoverForConnect (peripheralId, timeoutMs = 15000) {
        const targetKey = String(peripheralId);
        this._peripherals = {};

        try {
            if (window.__TAURI__ && window.__TAURI__.core) {
                await window.__TAURI__.core.invoke('ble_link_close');
                await delay(400);
            }
        } catch (e) { /* ignore */ }

        // Tutup socket lama supaya session Scratch Link bersih.
        this._socket.close();
        await delay(300);
        await this._socket.open();
        await this._socket.request('discover', DISCOVER_OPTIONS);

        const started = Date.now();
        while (Date.now() - started < timeoutMs) {
            const exact = this._peripherals[targetKey];
            if (exact) {
                return exact.peripheralId;
            }
            const keys = Object.keys(this._peripherals);
            // Satu device saja setelah ~2s — pakai itu (ID Windows kadang berubah antar scan).
            if (keys.length === 1 && Date.now() - started > 2000) {
                return this._peripherals[keys[0]].peripheralId;
            }
            await delay(250);
        }

        throw new Error(
            `Board BLE ${targetKey} tidak ditemukan di Scratch Link. ` +
            'Pastikan board menyala, Scratch Link jalan, lalu Connect BLE lagi.'
        );
    }

    async connect (peripheralId) {
        await this._socket.open();
        // Pakai nilai asli dari discover (number/string) — string-only sering Invalid Params.
        await this._socket.request('connect', {peripheralId});
        try {
            await this._socket.request('startNotifications', {
                serviceId: GARUDABOT_BLE.serviceUuid,
                characteristicId: GARUDABOT_BLE.txUuid
            });
        } catch (e) { /* optional */ }
        return this._peripherals[String(peripheralId)] || {
            peripheralId,
            name: GARUDABOT_BLE.deviceName
        };
    }

    async writeRaw (bytes, withResponse = true) {
        await this._socket.request('write', {
            serviceId: GARUDABOT_BLE.serviceUuid,
            characteristicId: GARUDABOT_BLE.rxUuid,
            message: bytesToBase64(bytes),
            encoding: 'base64',
            withResponse
        });
    }

    waitForNotify (predicate, timeoutMs = 20000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this._notifyWaiters = this._notifyWaiters.filter(w => w !== waiter);
                reject(new Error('Timeout menunggu respons BLE dari ESP32.'));
            }, timeoutMs);
            const waiter = {
                predicate,
                resolve: value => {
                    clearTimeout(timer);
                    resolve(value);
                },
                reject: err => {
                    clearTimeout(timer);
                    reject(err);
                }
            };
            this._notifyWaiters.push(waiter);
        });
    }

    /**
     * Upload firmware app (*.ino.bin) ke ESP32 lewat BLE OTA.
     * Wajib discover dulu di sesi Scratch Link yang sama, lalu connect + chunk write.
     */
    async uploadOta (peripheralId, firmware, options = {}) {
        const onProgress = options.onProgress || (() => {});
        const onStatus = options.onStatus || (() => {});
        const bytes = typeof firmware === 'string' ?
            decodeFirmwareBase64(firmware) :
            firmware;

        if (!bytes || !bytes.length) {
            throw new Error('Firmware kosong.');
        }
        // Update.begin butuh app image (~1–2MB), bukan merged flash 4MB.
        if (bytes.length > 0x300000) {
            throw new Error(
                `Firmware terlalu besar untuk BLE OTA (${bytes.length} bytes). ` +
                'Harusnya file *.ino.bin, bukan *.merged.bin.'
            );
        }

        onStatus('Discover BLE (Scratch Link)...');
        const resolvedId = await this.discoverForConnect(
            peripheralId,
            options.discoverTimeoutMs || 15000
        );
        onStatus(`Connect BLE ${resolvedId}...`);
        await this.connect(resolvedId);
        onStatus('Kirim BEGIN OTA...');

        const beginAck = this.waitForNotify(
            msg => typeof msg === 'string' && (msg.startsWith('ACK:BEGIN') || msg.startsWith('ERR')),
            15000
        );
        await this.writeRaw(buildBeginPacket(bytes.length), true);
        const beginMsg = await beginAck;
        if (String(beginMsg).startsWith('ERR')) {
            throw new Error(`ESP32 menolak OTA: ${beginMsg}`);
        }

        const chunkSize = GARUDABOT_BLE.chunkSize;
        let sent = 0;
        while (sent < bytes.length) {
            const end = Math.min(sent + chunkSize, bytes.length);
            await this.writeRaw(buildDataPacket(bytes.subarray(sent, end)), false);
            sent = end;
            if (sent % (chunkSize * 4) === 0) {
                await delay(8);
            }
            if (sent === bytes.length || sent % (chunkSize * 16) < chunkSize) {
                onProgress(sent, bytes.length);
            }
        }

        const endAck = this.waitForNotify(
            msg => typeof msg === 'string' && (msg === 'OK' || String(msg).startsWith('ERR')),
            30000
        );
        await this.writeRaw(buildEndPacket(), true);
        const endMsg = await endAck;
        if (endMsg !== 'OK') {
            throw new Error(`OTA gagal di ESP32: ${endMsg}`);
        }
        onProgress(bytes.length, bytes.length);
        return true;
    }

    getPeripherals () {
        return {...this._peripherals};
    }

    _handleNotifyPayload (params) {
        const message = decodeNotifyMessage(params.message, params.encoding);
        this._onNotify(message);
        const remaining = [];
        this._notifyWaiters.forEach(waiter => {
            try {
                if (waiter.predicate(message)) {
                    waiter.resolve(message);
                } else {
                    remaining.push(waiter);
                }
            } catch (e) {
                remaining.push(waiter);
            }
        });
        this._notifyWaiters = remaining;
    }

    _onSocketNotification (method, params) {
        if (method === 'didDiscoverPeripheral' || method === 'userDidPickPeripheral') {
            this._ingestPeripheral(params);
            return;
        }
        if (method === 'characteristicDidChange') {
            this._handleNotifyPayload(params || {});
        }
    }
}
