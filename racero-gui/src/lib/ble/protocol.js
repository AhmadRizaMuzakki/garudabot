/**
 * Protokol OTA Bluetooth Garudabot — harus cocok dengan firmware GarudabotBleOta.
 *
 * Upload program wireless memakai BLE (Scratch Link), bukan SoftAP WiFi.
 *
 * Packet (PC → ESP32, characteristic RX):
 *   [CMD_BEGIN][size u32 LE]
 *   [CMD_DATA ][payload…]
 *   [CMD_END]
 *
 * Notify status (ESP32 → PC, characteristic TX):
 *   RDY | ACK:BEGIN | N:<bytes> | OK | ERR:…
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
    /** Payload bytes per DATA packet (BLE MTU-safe). */
    chunkSize: 160
};

export const DISCOVER_OPTIONS = {
    // Windows Scratch Link: name sering "" — filter service UUID saja.
    filters: [
        {services: [GARUDABOT_BLE.serviceUuid]}
    ],
    optionalServices: [GARUDABOT_BLE.serviceUuid]
};

/** Label fallback jika Scratch Link mengirim name kosong (sering di Windows). */
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

/** Decode Scratch Link notify payload into ASCII status when possible. */
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
