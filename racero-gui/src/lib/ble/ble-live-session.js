/**
 * Live Mode BLE — sesi native (btleplug) untuk pin I/O realtime (green flag).
 * Dipakai saat connectedDevice = ble:<peripheralId>.
 * USB Live Mode tetap lewat Tauri Firmata (board_connect).
 *
 * Alur: Search → Connect (otomatis Live) → green flag.
 * Windows sering putus diam-diam — keepalive + reconnect otomatis.
 */

import Esp32BleLink from './esp32-ble-link.js';
import {
    buildLiveDigitalWrite,
    buildLivePwmWrite,
    buildLiveServoWrite,
    buildLiveTone,
    buildLiveNoTone,
    buildLiveDigitalRead,
    buildLiveAnalogRead,
    buildLivePing,
    buildLiveUltrasonic,
    buildLiveMotorDual
} from './protocol.js';
import {setLiveTransport} from '../live-transport.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

let activeSession = null;
let invokeQueue = Promise.resolve();
let keepaliveTimer = null;
let reconnectPromise = null;
let startingPromise = null;
let lastLiveWriteAt = 0;

const getActiveSession = () => {
    if (activeSession) return activeSession;
    if (typeof window !== 'undefined' && window.__garudabotBleLiveSession) {
        activeSession = window.__garudabotBleLiveSession;
        return activeSession;
    }
    return null;
};

const setActiveSession = session => {
    activeSession = session;
    if (typeof window !== 'undefined') {
        window.__garudabotBleLiveSession = session;
    }
};

const enqueue = fn => {
    const next = invokeQueue.then(fn, fn);
    invokeQueue = next.catch(() => {});
    return next;
};

const peripheralIdFromWindow = () => {
    if (typeof window === 'undefined') return null;
    const target = window.__garudabotConnectedDevice;
    if (target && String(target).startsWith('ble:')) {
        return String(target).slice(4);
    }
    const session = getActiveSession();
    return session && session.peripheralId ? String(session.peripheralId) : null;
};

const preferredNameFromWindow = () => {
    if (typeof window === 'undefined') return '';
    return String(window.__garudabotBlePreferredName || '').trim();
};

const stopKeepalive = () => {
    if (keepaliveTimer) {
        clearInterval(keepaliveTimer);
        keepaliveTimer = null;
    }
};

const startKeepalive = () => {
    stopKeepalive();
    let failCount = 0;
    let recovering = false;
    // Hanya nudge ringan. Jangan pingSoft (tunggu notify) — itu bentrok
    // dengan forever motor dan memicu reconnect palsu → sesi mati.
    keepaliveTimer = setInterval(() => {
        const session = getActiveSession();
        if (!session || !session.link || !session.active) return;
        if (recovering) return;
        // Ada traffic Live baru-baru ini? Skip — link masih dipakai.
        if (Date.now() - lastLiveWriteAt < 5000) {
            failCount = 0;
            return;
        }
        session.nudge().then(() => {
            failCount = 0;
        }).catch(err => {
            failCount += 1;
            console.warn('[Live BLE] nudge gagal', failCount, err);
            // Jangan matikan session.active sebelum recover — green flag akan
            // mengira Live mati dan memicu scan yang sering gagal di Windows.
            if (failCount >= 6 && !recovering) {
                recovering = true;
                softRecoverBleLive(session.peripheralId).then(() => {
                    failCount = 0;
                }).catch(e => {
                    console.warn('[Live BLE] soft recover gagal', e);
                    // Baru tandai mati kalau recover benar-benar gagal.
                    const s = getActiveSession();
                    if (s) s.active = false;
                }).finally(() => {
                    recovering = false;
                });
            }
        });
    }, 6000);
};

class BleLiveSession {
    constructor (peripheralId) {
        this.peripheralId = peripheralId;
        this.link = null;
        this.active = false;
        this.protocolVersion = 0;
        /** @type {Record<string, number>} dedupe motor forever-loop */
        this._lastMotor = {};
        /** @type {Record<string, {speed: number, since: number}>} */
        this._motorHold = {};
    }

    async start () {
        this.link = new Esp32BleLink({
            onClose: () => {
                this.active = false;
                console.warn('[Live BLE] native session closed');
            },
            onError: err => {
                console.warn('[Live BLE]', err);
            }
        });
        await this.link.openAsync();
        const preferred = preferredNameFromWindow();

        // 1) Native masih nyambung dari Connect? Ping saja — tanpa scan.
        try {
            const status = await this.link.getConnectionStatus();
            if (status && status.connected) {
                if (status.peripheralId) {
                    this.peripheralId = String(status.peripheralId);
                }
                try {
                    await this.pingSoft(4000);
                } catch (pingErr) {
                    // Sudah connected — jangan close+scan (Windows gagal rediscover).
                    // Retry ping lebih longgar sekali.
                    console.warn('[Live BLE] ping singkat gagal, retry…', pingErr);
                    await this.pingSoft(8000);
                }
                this.active = true;
                this._lastMotor = {};
                this._motorHold = {};
                console.log('[Live BLE] reuse koneksi Connect');
                return this;
            }
        } catch (reuseErr) {
            // Hanya sampai sini kalau native TIDAK connected, atau ping gagal total.
            const status = await this.link.getConnectionStatus().catch(() => null);
            if (status && status.connected) {
                throw new Error(
                    'Board BLE tersambung, tapi firmware Live tidak menjawab ping.\n' +
                    'Upload Program dulu (firmware Live), lalu Search → Connect lagi.\n\n' +
                    String(reuseErr && reuseErr.message ? reuseErr.message : reuseErr)
                );
            }
            console.warn('[Live BLE] reuse gagal, scan+connect…', reuseErr);
        }

        // 2) Fallback: discover + connect penuh (ID Windows sering berubah).
        const resolvedId = await this.link.discoverForConnect(
            this.peripheralId,
            15000,
            preferred
        );
        this.peripheralId = resolvedId;
        await this.link.connect(resolvedId, preferred);
        await delay(300);

        await this.pingSoft(8000);
        this.active = true;
        this._lastMotor = {};
        this._motorHold = {};
        return this;
    }

    async nudge () {
        if (!this.link) {
            throw new Error('BLE Live Mode belum aktif.');
        }
        await this.link.writeRaw(buildLivePing(), false);
    }

    async pingSoft (timeoutMs = 2500) {
        if (!this.link) {
            throw new Error('BLE Live Mode belum aktif.');
        }
        const parseLiveAck = msg => {
            if (typeof msg !== 'string') return false;
            if (msg === 'LIVE') {
                this.protocolVersion = 0;
                return true;
            }
            const match = /^LIVE:(\d+)$/.exec(msg);
            if (match) {
                this.protocolVersion = Number(match[1]) || 0;
                return true;
            }
            return false;
        };
        const pingAck = this.link.waitForNotify(parseLiveAck, timeoutMs);
        try {
            await this.link.writeRaw(buildLivePing(), false);
            await pingAck;
        } catch (e) {
            const retry = this.link.waitForNotify(parseLiveAck, Math.min(timeoutMs, 4000));
            await delay(120);
            await this.link.writeRaw(buildLivePing(), false);
            await retry;
        }
    }

    /** Lepas sesi JS, biarkan BLE native tetap nyambung. */
    async detach () {
        this.active = false;
        if (this.link) {
            try {
                await this.link.detach();
            } catch (e) { /* ignore */ }
            this.link = null;
        }
    }

    async stop () {
        this.active = false;
        if (this.link) {
            try {
                await this.link.closeAsync();
            } catch (e) { /* ignore */ }
            this.link = null;
        }
    }

    async write (bytes, gapMs = 12) {
        if (!this.link) {
            throw new Error('BLE Live Mode belum aktif.');
        }
        await this.link.writeRaw(bytes, false);
        lastLiveWriteAt = Date.now();
        if (gapMs > 0) {
            await delay(gapMs);
        }
        this.active = true;
    }

    async readNotify (sendBytes, predicate, timeoutMs = 4000) {
        if (!this.link) {
            throw new Error('BLE Live Mode belum aktif.');
        }
        const waiter = this.link.waitForNotify(predicate, timeoutMs);
        await this.link.writeRaw(sendBytes, false);
        return waiter;
    }

    invoke (name, payload = {}) {
        return enqueue(() => this._invoke(name, payload));
    }

    async _invoke (name, payload = {}) {
        const pin = Number(payload.pin);
        switch (name) {
        case 'pin_digital_write':
            await this.write(buildLiveDigitalWrite(pin, Number(payload.value)));
            return;
        case 'pin_pwm_write':
        case 'pin_analog_write':
            await this.write(buildLivePwmWrite(pin, Number(payload.value)));
            return;
        case 'pin_motor_dual': {
            const pin1 = Number(payload.pin1);
            const pin2 = Number(payload.pin2);
            const speed = Number(payload.speed);
            const key = `${pin1}:${pin2}`;
            const outSpeed = Number.isFinite(speed) ? speed : 0;

            // Forever loop: skip ulang speed sama. Stop (0) selalu dikirim.
            if (outSpeed !== 0 &&
                Object.prototype.hasOwnProperty.call(this._lastMotor, key) &&
                this._lastMotor[key] === outSpeed) {
                return;
            }
            this._lastMotor[key] = outSpeed;
            lastLiveWriteAt = Date.now();
            await this.write(buildLiveMotorDual(pin1, pin2, outSpeed), 8);
            return;
        }
        case 'pin_servo_write':
            await this.write(buildLiveServoWrite(pin, Number(payload.value)));
            return;
        case 'pin_tone': {
            const frequency = Number(payload.frequency);
            const duration = Number(payload.duration);
            await this.write(buildLiveTone(pin, frequency, duration));
            if (duration > 0) {
                await delay(Math.min(duration + 40, 5000));
            }
            return;
        }
        case 'pin_no_tone':
            await this.write(buildLiveNoTone(pin));
            return;
        case 'pin_digital_read': {
            const msg = await this.readNotify(
                buildLiveDigitalRead(pin),
                m => typeof m === 'string' && m.startsWith(`D:${pin}:`)
            );
            const parts = String(msg).split(':');
            return Number(parts[2]) ? 1 : 0;
        }
        case 'pin_analog_read': {
            const msg = await this.readNotify(
                buildLiveAnalogRead(pin),
                m => typeof m === 'string' && m.startsWith(`A:${pin}:`)
            );
            const parts = String(msg).split(':');
            return Number(parts[2]) || 0;
        }
        case 'pin_ultrasonic_read': {
            const trig = Number(payload.trig);
            const echo = Number(payload.echo);
            const msg = await this.readNotify(
                buildLiveUltrasonic(trig, echo),
                m => typeof m === 'string' && m.startsWith('U:'),
                6000
            );
            const value = Number(String(msg).slice(2));
            return Number.isFinite(value) ? value : 0;
        }
        default:
            throw new Error(`BLE Live tidak mendukung command: ${name}`);
        }
    }
}

export const isBleLiveActive = () => {
    const session = getActiveSession();
    return Boolean(session && session.active);
};

export const isBleLiveTarget = () => {
    if (isBleLiveActive()) return true;
    if (typeof window === 'undefined') return false;
    if (window.__garudabotLiveTransport === 'ble') return true;
    const target = window.__garudabotConnectedDevice;
    return Boolean(target && String(target).startsWith('ble:'));
};

export const getBleLiveSession = () => getActiveSession();

/**
 * Pulihkan tanpa close+scan kalau native masih connected.
 * (Hard reconnect sering gagal di Windows → "Board BLE tidak ditemukan".)
 */
async function softRecoverBleLive (peripheralId) {
    const id = peripheralId || peripheralIdFromWindow();
    const existing = getActiveSession();
    if (existing && existing.link) {
        try {
            const status = await existing.link.getConnectionStatus();
            if (status && status.connected) {
                await existing.link.openAsync();
                await existing.nudge();
                existing.active = true;
                existing._lastMotor = {};
                existing._motorHold = {};
                setLiveTransport('ble');
                installBleLiveBridge();
                startKeepalive();
                return existing;
            }
        } catch (e) {
            console.warn('[Live BLE] soft recover ping gagal', e);
        }
    }
    // Tetap keepNative: native Connect sering masih hidup meski sesi JS hilang.
    // keepNative:false = close+scan → sering gagal di Windows.
    return startBleLive(id || '', {keepNative: true});
}

export async function reconnectBleLive (peripheralId) {
    const id = peripheralId || peripheralIdFromWindow();
    if (!id) {
        throw new Error('Tidak ada peripheral BLE untuk reconnect.');
    }
    if (reconnectPromise) {
        return reconnectPromise;
    }
    if (startingPromise) {
        return startingPromise;
    }
    reconnectPromise = (async () => {
        console.warn('[Live BLE] reconnect…', id);
        try {
            return await softRecoverBleLive(id);
        } catch (e) {
            console.warn('[Live BLE] soft gagal, coba start ulang (keep native)…', e);
            // Jangan keepNative:false — itu yang bikin "tidak ditemukan".
            return startBleLive(id, {keepNative: true});
        }
    })().finally(() => {
        reconnectPromise = null;
    });
    return reconnectPromise;
}

/**
 * @param {string} peripheralId
 * @param {{ keepNative?: boolean }} [options] keepNative=true: jangan putus BLE
 *   saat ganti sesi (default true supaya Connect → Live mulus).
 */
export async function startBleLive (peripheralId, options = {}) {
    const keepNative = options.keepNative !== false;
    const id = String(peripheralId || '');

    // Idempotent: sesi Live sudah aktif ke board yang sama.
    const existing = getActiveSession();
    if (existing && existing.link &&
        (!id || String(existing.peripheralId) === id || !existing.peripheralId)) {
        // Jangan pingSoft di sini — forever motor bisa bikin timeout palsu
        // lalu hard-reconnect → "Board BLE tidak ditemukan".
        if (existing.active) {
            setLiveTransport('ble');
            installBleLiveBridge();
            startKeepalive();
            return existing;
        }
        try {
            await existing.nudge();
            existing.active = true;
            setLiveTransport('ble');
            installBleLiveBridge();
            startKeepalive();
            return existing;
        } catch (e) {
            console.warn('[Live BLE] sesi lama stale, buat ulang', e);
        }
    }

    if (startingPromise) {
        return startingPromise;
    }

    startingPromise = (async () => {
        stopKeepalive();
        await stopBleLive({keepNative});
        const session = new BleLiveSession(id);
        try {
            await session.start();
        } catch (err) {
            try {
                await session.stop();
            } catch (e) { /* ignore */ }
            throw err;
        }
        setActiveSession(session);
        setLiveTransport('ble');
        installBleLiveBridge();
        startKeepalive();
        if (typeof window !== 'undefined') {
            window.__garudabotConnectedDevice = `ble:${session.peripheralId}`;
        }
        return session;
    })().finally(() => {
        startingPromise = null;
    });

    return startingPromise;
}

/**
 * @param {{ keepNative?: boolean }} [options]
 *   keepNative=true → lepas sesi Live saja, BLE Connect tetap nyambung.
 *   keepNative=false → putus BLE total (Live Mode Off / ganti ke USB).
 */
export async function stopBleLive (options = {}) {
    const keepNative = Boolean(options.keepNative);
    stopKeepalive();
    const session = getActiveSession();
    const wasBle = typeof window !== 'undefined' && window.__garudabotLiveTransport === 'ble';
    setActiveSession(null);
    if (wasBle && !keepNative) setLiveTransport(null);
    if (!session) return;
    if (keepNative) {
        await session.detach();
    } else {
        await session.stop();
    }
}

export function bleLiveInvoke (name, payload) {
    const invokeOn = session => session.invoke(name, payload);

    const session = getActiveSession();
    if (session && session.link) {
        return invokeOn(session).catch(err => {
            // Retry sekali di sesi yang sama — jangan langsung scan (itu yang "mati").
            console.warn('[Live BLE] invoke gagal, retry…', name, err);
            return delay(80).then(() => invokeOn(session)).catch(err2 => {
                if (session) session.active = false;
                return softRecoverBleLive(session && session.peripheralId)
                    .then(s => invokeOn(s))
                    .catch(() => Promise.reject(err2));
            });
        });
    }

    const id = peripheralIdFromWindow();
    if (!id) {
        return Promise.reject(new Error('BLE Live Mode belum aktif.'));
    }
    return reconnectBleLive(id).then(s => invokeOn(s));
}

export function installBleLiveBridge () {
    window.__garudabotBleLive = {
        isActive: isBleLiveActive,
        isTarget: isBleLiveTarget,
        invoke: (name, payload) => bleLiveInvoke(name, payload),
        reconnect: peripheralId => reconnectBleLive(peripheralId)
    };
}

installBleLiveBridge();

export default {
    startBleLive,
    stopBleLive,
    reconnectBleLive,
    isBleLiveActive,
    isBleLiveTarget,
    bleLiveInvoke,
    installBleLiveBridge
};
