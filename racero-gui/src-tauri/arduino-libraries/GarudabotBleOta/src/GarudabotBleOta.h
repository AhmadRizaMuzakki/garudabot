#ifndef GARUDABOT_BLE_OTA_H
#define GARUDABOT_BLE_OTA_H

#include <Arduino.h>

// Penerima firmware OTA lewat Bluetooth (Nordic UART).
// App menyisipkan otomatis ke sketch ESP32 lewat ble_ota.rs, contoh:
//   GarudabotBleOta::begin("Mobil-01");  // nama advertising BLE
//   GarudabotBleOta::loop();
// Advertising: service UUID di paket ADV (agar Scratch Link Windows ketemu),
// nama di scan response (dan ikut di ADV jika nama ≤ 8 karakter).
// Protokol harus cocok dengan racero-gui/src/lib/ble/protocol.js

namespace GarudabotBleOta {
    // Default jika begin() dipanggil tanpa argumen.
    static const char *DEVICE_NAME = "Garudabot";
    static const char *SERVICE_UUID = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E";
    static const char *RX_UUID = "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"; // central → ESP32 (firmware)
    static const char *TX_UUID = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"; // ESP32 → central (status)

    static const uint8_t CMD_BEGIN = 0x01;
    static const uint8_t CMD_DATA = 0x02;
    static const uint8_t CMD_END = 0x03;
    static const uint8_t CMD_ABORT = 0x04;

    void begin(const char *deviceName = DEVICE_NAME);
    void loop();
}

#endif
