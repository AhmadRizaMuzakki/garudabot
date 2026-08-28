import { buildEsp32Pins, ESP32_FEATURES } from './esp32Shared';
import ESP32Wroom from './ESP32Wroom';

/**
 * ELF ESP32 Motor — board ESP32 wireless (OTA / SoftAP).
 * Muncul di network discovery sebagai "ELF-ESP32-Motor".
 * FQBN sama dengan ESP32 Dev Module.
 */
export default {
    name: 'ELF ESP32 Motor',
    fqbn: 'esp32:esp32:esp32',
    icon: ESP32Wroom.icon,
    pins: buildEsp32Pins(),
    features: ESP32_FEATURES
};
