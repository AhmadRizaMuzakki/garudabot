/**
 * Scratch Link WebSocket (JSON-RPC) — jalur Bluetooth desktop Garudabot.
 * Hanya localhost:20111; jangan pakai device-manager.scratch.mit.edu
 * (cloud bisa connect tapi tidak melihat BLE PC ini).
 */

export default class ScratchLinkSocket {
    /**
     * @param {'BLE'|'BT'} type
     * @param {{onError?: Function, onOpen?: Function, onClose?: Function, onNotification?: Function}} handlers
     */
    constructor (type = 'BLE', handlers = {}) {
        this._type = type;
        this._onError = handlers.onError || (() => {});
        this._onOpen = handlers.onOpen || (() => {});
        this._onClose = handlers.onClose || (() => {});
        this._onNotification = handlers.onNotification || (() => {});
        this._ws = null;
        this._requestId = 0;
        this._openRequests = {};
    }

    open () {
        return new Promise((resolve, reject) => {
            if (this._ws && this._ws.readyState === WebSocket.OPEN) {
                resolve();
                return;
            }

            const pathname = this._type === 'BT' ? 'scratch/bt' : 'scratch/ble';
            const url = `ws://127.0.0.1:20111/${pathname}`;
            const ws = new WebSocket(url);

            let settled = false;
            const connectTimeout = setTimeout(() => {
                if (settled) return;
                settled = true;
                try { ws.close(); } catch (e) { /* ignore */ }
                reject(new Error(
                    'Scratch Link tidak merespons di localhost:20111. Pastikan Scratch Link berjalan, lalu Cari lagi.'
                ));
            }, 8000);

            ws.onopen = () => {
                if (settled) return;
                settled = true;
                clearTimeout(connectTimeout);
                this._ws = ws;
                this._ws.onmessage = event => this._handleMessage(JSON.parse(event.data));
                this._ws.onclose = () => {
                    this._ws = null;
                    this._onClose();
                };
                this._ws.onerror = () => {
                    this._onError(new Error('Koneksi Scratch Link terputus.'));
                };
                this._onOpen();
                resolve();
            };

            ws.onerror = () => {
                if (settled) return;
                settled = true;
                clearTimeout(connectTimeout);
                try { ws.close(); } catch (e) { /* ignore */ }
                reject(new Error(
                    'Tidak bisa hubungi Scratch Link (ws://127.0.0.1:20111). Pastikan Scratch Link berjalan di PC ini.'
                ));
            };
        });
    }

    close () {
        Object.keys(this._openRequests).forEach(id => {
            const req = this._openRequests[id];
            if (req) req.reject(new Error('Scratch Link session closed'));
        });
        this._openRequests = {};
        if (this._ws) {
            try { this._ws.close(); } catch (e) { /* ignore */ }
            this._ws = null;
        }
    }

    request (method, params) {
        const id = this._requestId++;
        const payload = {jsonrpc: '2.0', method, params, id};
        return new Promise((resolve, reject) => {
            if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
                reject(new Error('Scratch Link belum terhubung.'));
                return;
            }
            this._openRequests[id] = {resolve, reject};
            this._ws.send(JSON.stringify(payload));
        });
    }

    _handleMessage (json) {
        if (Object.prototype.hasOwnProperty.call(json, 'method')) {
            this._onNotification(json.method, json.params || {});
            return;
        }
        if (Object.prototype.hasOwnProperty.call(json, 'id')) {
            const pending = this._openRequests[json.id];
            if (!pending) return;
            delete this._openRequests[json.id];
            if (json.error) {
                pending.reject(new Error(json.error.message || JSON.stringify(json.error)));
            } else {
                pending.resolve(json.result);
            }
        }
    }
}
