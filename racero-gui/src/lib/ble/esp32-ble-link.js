/**
 * Klien BLE ESP32 untuk Connect + upload program lewat Bluetooth.
 *
 * Transport: BLE native via Tauri (btleplug) — tanpa Scratch Link.
 * Digunakan dialog Connect (scan/pair) dan board-uploader (BLE OTA).
 */

import {
    GARUDABOT_BLE,
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

const getTauri = () => {
    if (typeof window === 'undefined') return null;
    return window.__TAURI__ || null;
};

const invoke = (cmd, args) => {
    const tauri = getTauri();
    if (!tauri || !tauri.core || typeof tauri.core.invoke !== 'function') {
        return Promise.reject(new Error(
            'BLE native hanya tersedia di aplikasi desktop Garudabot (bukan browser).'
        ));
    }
    return tauri.core.invoke(cmd, args || {});
};

export default class Esp32BleLink {
    constructor ({onPeripheral, onError, onOpen, onClose, onNotify} = {}) {
        this._onPeripheral = onPeripheral || (() => {});
        this._onError = onError || (() => {});
        this._onNotify = onNotify || (() => {});
        this._onOpen = onOpen || (() => {});
        this._onClose = onClose || (() => {});
        this._peripherals = {};
        this._notifyWaiters = [];
        this._unlistenPeripheral = null;
        this._unlistenNotify = null;
        this._opened = false;
        this._connectedId = null;
    }

    _ingestPeripheral (params) {
        if (!params || params.peripheralId === undefined || params.peripheralId === null) {
            return;
        }
        const rawName = params.name ? String(params.name).trim() : '';
        const normalized = {
            ...params,
            rawName,
            name: peripheralDisplayName(params)
        };
        this._peripherals[String(params.peripheralId)] = normalized;
        this._onPeripheral(normalized, this.getPeripherals());
    }

    async _ensureListeners () {
        const tauri = getTauri();
        if (!tauri || !tauri.event || typeof tauri.event.listen !== 'function') {
            throw new Error('Tauri event API tidak tersedia.');
        }
        if (!this._unlistenPeripheral) {
            this._unlistenPeripheral = await tauri.event.listen(
                'ble-native-peripheral',
                event => this._ingestPeripheral(event.payload)
            );
        }
        if (!this._unlistenNotify) {
            this._unlistenNotify = await tauri.event.listen(
                'ble-native-notify',
                event => this._onNotifyEvent(event.payload)
            );
        }
    }

    _onNotifyEvent (params) {
        const payload = params || {};
        const decoded = decodeNotifyMessage(payload.message, payload.encoding);
        if (decoded == null || decoded === '') return;
        this._onNotify(decoded, payload);
        const stillWaiting = [];
        for (const waiter of this._notifyWaiters) {
            let matched = false;
            try {
                matched = waiter.predicate(decoded, payload);
            } catch (e) {
                matched = false;
            }
            if (matched) {
                clearTimeout(waiter.timer);
                waiter.resolve(decoded);
            } else {
                stillWaiting.push(waiter);
            }
        }
        this._notifyWaiters = stillWaiting;
    }

    open () {
        return this.openAsync();
    }

    async openAsync () {
        await this._ensureListeners();
        this._opened = true;
        this._onOpen();
        return true;
    }

    close () {
        this.closeAsync().catch(() => {});
    }

    /**
     * Lepas listener UI saja — koneksi BLE native di Rust tetap hidup
     * (setelah Connect, sebelum Live Mode).
     */
    async detach () {
        this._notifyWaiters.forEach(w => w.reject(new Error('BLE session detached')));
        this._notifyWaiters = [];
        this._peripherals = {};
        this._opened = false;
        if (this._unlistenPeripheral) {
            try { this._unlistenPeripheral(); } catch (e) { /* ignore */ }
            this._unlistenPeripheral = null;
        }
        if (this._unlistenNotify) {
            try { this._unlistenNotify(); } catch (e) { /* ignore */ }
            this._unlistenNotify = null;
        }
    }

    async closeAsync () {
        await this.detach();
        this._connectedId = null;
        try {
            await invoke('ble_native_close');
        } catch (e) { /* ignore */ }
        this._onClose();
    }

    getPeripherals () {
        return {...this._peripherals};
    }

    async discover (timeoutMs = 12000, preferredName = '', options = {}) {
        this._peripherals = {};
        await this.openAsync();
        const preferred = String(preferredName || '').trim();
        const preserve = Boolean(options.preserveConnected);
        const result = await invoke('ble_native_scan', {
            timeoutMs: Math.min(Math.max(timeoutMs, 2000), 30000),
            preferredName: preferred || null,
            preserveConnected: preserve
        });
        const devices = (result && result.devices) || [];
        devices.forEach(d => this._ingestPeripheral(d));
        return this.getPeripherals();
    }

    async scan (timeoutMs = 12000, preferredName = '', options = {}) {
        return this.discover(timeoutMs, preferredName, options);
    }

    async getConnectionStatus () {
        try {
            return await invoke('ble_native_status');
        } catch (e) {
            return {connected: false};
        }
    }

    _pickPeripheralId (targetKey, preferred) {
        if (this._peripherals[targetKey]) {
            return this._peripherals[targetKey].peripheralId;
        }
        const all = Object.values(this._peripherals);
        if (preferred) {
            const pref = preferred.toLowerCase();
            const match = all.find(p => {
                const n = String(p.rawName || p.name || '').toLowerCase();
                return n === pref || n.includes(pref) || pref.includes(n);
            });
            if (match) return match.peripheralId;
        }
        if (all.length === 1) {
            return all[0].peripheralId;
        }
        // ID Windows sering berubah antar scan — ambil yang paling baru kalau ada.
        if (all.length > 0) {
            return all[0].peripheralId;
        }
        return null;
    }

    async discoverForConnect (peripheralId, timeoutMs = 15000, preferredName = '') {
        const targetKey = String(peripheralId);
        const preferred = String(preferredName || '').trim();
        await this.openAsync();

        // Sudah nyambung ke board mana pun? Jangan close+scan.
        // Windows sering ganti peripheralId antar sesi — reuse native yang hidup.
        try {
            const status = await this.getConnectionStatus();
            if (status && status.connected) {
                const currentId = String(status.peripheralId || '');
                const currentName = String(status.name || '');
                if (currentId) {
                    this._ingestPeripheral({
                        peripheralId: currentId,
                        name: currentName || preferred || currentId
                    });
                    return currentId;
                }
            }
        } catch (e) { /* lanjut scan */ }

        this._peripherals = {};

        try {
            await invoke('ble_native_close');
            await delay(150);
        } catch (e) { /* ignore */ }

        const scanPromise = invoke('ble_native_scan', {
            timeoutMs: Math.min(timeoutMs, 14000),
            preferredName: preferred || null,
            preserveConnected: false
        }).then(result => {
            const devices = (result && result.devices) || [];
            // Wajib ingest hasil Rust — event saja tidak cukup di Windows.
            devices.forEach(d => this._ingestPeripheral(d));
            return result;
        });

        const started = Date.now();
        while (Date.now() - started < timeoutMs) {
            const picked = this._pickPeripheralId(targetKey, preferred);
            if (picked) {
                try { await scanPromise; } catch (e) { /* ignore */ }
                return this._pickPeripheralId(targetKey, preferred) || picked;
            }
            await delay(250);
        }

        try {
            await scanPromise;
        } catch (e) { /* ignore */ }

        const resolved = this._pickPeripheralId(targetKey, preferred);
        if (resolved) return resolved;

        throw new Error(
            'Board BLE tidak ditemukan. Pastikan board menyala & Bluetooth PC aktif, ' +
            'lalu Search → Connect lagi.'
        );
    }

    async connect (peripheralId, preferredName = '') {
        await this.openAsync();
        const preferred = String(preferredName || '').trim();
        const result = await invoke('ble_native_connect', {
            peripheralId: String(peripheralId),
            preferredName: preferred || null
        });
        this._connectedId = (result && result.peripheralId) || String(peripheralId);
        return result;
    }

    async writeRaw (bytes, withResponse = false) {
        const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        await invoke('ble_native_write', {
            dataBase64: bytesToBase64(data),
            withResponse: Boolean(withResponse)
        });
    }

    waitForNotify (predicate, timeoutMs = 8000) {
        return new Promise((resolve, reject) => {
            const waiter = {
                predicate,
                resolve,
                reject,
                timer: setTimeout(() => {
                    this._notifyWaiters = this._notifyWaiters.filter(w => w !== waiter);
                    reject(new Error('Timeout menunggu respons BLE.'));
                }, timeoutMs)
            };
            this._notifyWaiters.push(waiter);
        });
    }

    async uploadOta (peripheralId, firmware, options = {}) {
        const onProgress = options.onProgress || (() => {});
        const onStatus = options.onStatus || (() => {});
        const preferred = String(options.preferredName || '').trim();
        const bytes = typeof firmware === 'string' ?
            decodeFirmwareBase64(firmware) :
            firmware;

        if (!bytes || !bytes.length) {
            throw new Error('Firmware kosong.');
        }
        if (bytes.length > 0x300000) {
            throw new Error(
                `Firmware terlalu besar untuk BLE OTA (${bytes.length} bytes). ` +
                'Harusnya file *.ino.bin, bukan *.merged.bin.'
            );
        }

        onStatus('Discover BLE...');
        const resolvedId = await this.discoverForConnect(
            peripheralId,
            options.discoverTimeoutMs || 15000,
            preferred
        );
        onStatus(`Connect BLE ${resolvedId}...`);
        await this.connect(resolvedId, preferred);
        onStatus('Kirim BEGIN OTA...');

        const beginAck = this.waitForNotify(
            msg => typeof msg === 'string' && (msg.startsWith('ACK:BEGIN') || msg.startsWith('ERR')),
            15000
        );
        await this.writeRaw(buildBeginPacket(bytes.length), false);
        const beginMsg = await beginAck;
        if (String(beginMsg).startsWith('ERR')) {
            throw new Error(`ESP32 menolak OTA: ${beginMsg}`);
        }

        const chunkSize = (GARUDABOT_BLE && GARUDABOT_BLE.chunkSize) || 180;
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
        await this.writeRaw(buildEndPacket(), false);
        const endMsg = await endAck;
        if (endMsg !== 'OK') {
            throw new Error(`OTA gagal di ESP32: ${endMsg}`);
        }
        onProgress(bytes.length, bytes.length);
        return true;
    }

    async uploadFirmware (firmwareBase64, options = {}) {
        const peripheralId = this._connectedId || options.peripheralId;
        if (!peripheralId) {
            throw new Error('BLE belum terhubung untuk OTA.');
        }
        return this.uploadOta(peripheralId, firmwareBase64, options);
    }
}
