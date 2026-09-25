/**
 * Protokol Bluetooth Garudabot — harus cocok dengan firmware GarudabotBleOta.
 *
 * Upload (OTA) + Live Mode pin I/O memakai Nordic UART yang sama.
 *
 * OTA (PC → ESP32, RX):
 *   [CMD_BEGIN][size u32 LE]
 *   [CMD_DATA ][payload…]
 *   [CMD_END]
 *
 * Live (PC → ESP32, RX):
 *   [CMD_LIVE_*][args…]
 *
 * Notify (ESP32 → PC, TX):
 *   RDY | ACK:BEGIN | N:<bytes> | OK | ERR:…
 *   LIVE | LIVE:4 | D:<pin>:<0|1> | A:<pin>:<value> | U:<cm> | OK:W
 */

export const GARUDABOT_BLE = {
    namePrefix: 'Garudabot',
    deviceName: 'Garudabot',
    serviceUuid: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    rxUuid: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
    txUuid: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
    cmdBegin: 0x01,
    cmdData: 0x02,
    cmdEnd: 0x03,
    cmdAbort: 0x04,
    /** Live Mode — pin I/O realtime (green flag). */
    cmdLiveDigitalWrite: 0x10,
    cmdLivePwmWrite: 0x11,
    cmdLiveServoWrite: 0x12,
    cmdLiveTone: 0x13,
    cmdLiveNoTone: 0x14,
    cmdLiveDigitalRead: 0x15,
    cmdLiveAnalogRead: 0x16,
    cmdLivePing: 0x17,
    cmdLiveUltrasonic: 0x18,
    /** Dual-PWM motor: [cmd][in1][in2][speed_i8 -100..100] */
    cmdLiveMotorDual: 0x19,
    /** Payload bytes per DATA packet (BLE MTU-safe). */
    chunkSize: 160
};

export const DISCOVER_OPTIONS = {
    // Windows BLE: name sering "" — filter service UUID saja.
    filters: [
        {services: [GARUDABOT_BLE.serviceUuid]}
    ],
    optionalServices: [GARUDABOT_BLE.serviceUuid]
};

/** Label fallback jika OS mengirim name kosong (sering di Windows). */
export const peripheralDisplayName = peripheral => {
    const name = peripheral && peripheral.name ? String(peripheral.name).trim() : '';
    if (name) return name;
    const id = peripheral && peripheral.peripheralId != null ?
        String(peripheral.peripheralId) :
        '';
    if (id) {
        const short = id.length > 8 ? id.slice(-8) : id;
        return `ESP32-${short}`;
    }
    return 'ESP32 BLE';
};

export const bytesToBase64 = bytes => {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        const slice = bytes.subarray(i, i + chunk);
        binary += String.fromCharCode.apply(null, slice);
    }
    return btoa(binary);
};

export const decodeFirmwareBase64 = firmwareBase64 => {
    const binary = atob(firmwareBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
};

/** Decode notify payload BLE menjadi ASCII status bila memungkinkan. */
export const decodeNotifyMessage = (message, encoding) => {
    let text = message || '';
    try {
        const looksBase64 = encoding === 'base64' ||
            (/^[A-Za-z0-9+/=]+$/.test(text) && text.length % 4 === 0);
        if (looksBase64) {
            const decoded = atob(text);
            if (/^[A-Z0-9:_-]+$/i.test(decoded) ||
                decoded.startsWith('ERR') ||
                decoded.startsWith('N:')) {
                return decoded;
            }
        }
    } catch (e) { /* keep raw */ }
    return text;
};

export const buildBeginPacket = size => {
    const packet = new Uint8Array(5);
    packet[0] = GARUDABOT_BLE.cmdBegin;
    packet[1] = size & 0xff;
    packet[2] = (size >> 8) & 0xff;
    packet[3] = (size >> 16) & 0xff;
    packet[4] = (size >> 24) & 0xff;
    return packet;
};

export const buildDataPacket = chunk => {
    const packet = new Uint8Array(1 + chunk.length);
    packet[0] = GARUDABOT_BLE.cmdData;
    packet.set(chunk, 1);
    return packet;
};

export const buildEndPacket = () => new Uint8Array([GARUDABOT_BLE.cmdEnd]);

export const buildLiveDigitalWrite = (pin, value) => new Uint8Array([
    GARUDABOT_BLE.cmdLiveDigitalWrite,
    pin & 0xff,
    value ? 1 : 0
]);

export const buildLivePwmWrite = (pin, value) => new Uint8Array([
    GARUDABOT_BLE.cmdLivePwmWrite,
    pin & 0xff,
    Math.max(0, Math.min(255, value | 0)) & 0xff
]);

export const buildLiveServoWrite = (pin, angle) => new Uint8Array([
    GARUDABOT_BLE.cmdLiveServoWrite,
    pin & 0xff,
    Math.max(0, Math.min(180, angle | 0)) & 0xff
]);

export const buildLiveTone = (pin, frequency, duration) => {
    const freq = Math.max(0, Math.min(65535, frequency | 0));
    const dur = Math.max(0, Math.min(65535, duration | 0));
    return new Uint8Array([
        GARUDABOT_BLE.cmdLiveTone,
        pin & 0xff,
        freq & 0xff,
        (freq >> 8) & 0xff,
        dur & 0xff,
        (dur >> 8) & 0xff
    ]);
};

export const buildLiveNoTone = pin => new Uint8Array([
    GARUDABOT_BLE.cmdLiveNoTone,
    pin & 0xff
]);

export const buildLiveDigitalRead = pin => new Uint8Array([
    GARUDABOT_BLE.cmdLiveDigitalRead,
    pin & 0xff
]);

export const buildLiveAnalogRead = pin => new Uint8Array([
    GARUDABOT_BLE.cmdLiveAnalogRead,
    pin & 0xff
]);

export const buildLivePing = () => new Uint8Array([GARUDABOT_BLE.cmdLivePing]);

export const buildLiveUltrasonic = (trig, echo) => new Uint8Array([
    GARUDABOT_BLE.cmdLiveUltrasonic,
    trig & 0xff,
    echo & 0xff
]);

/** speedPercent: -100..100 (int8). */
export const buildLiveMotorDual = (pin1, pin2, speedPercent) => {
    let speed = Math.trunc(Number(speedPercent) || 0);
    if (speed > 100) speed = 100;
    if (speed < -100) speed = -100;
    return new Uint8Array([
        GARUDABOT_BLE.cmdLiveMotorDual,
        pin1 & 0xff,
        pin2 & 0xff,
        speed & 0xff
    ]);
};
