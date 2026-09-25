#ifndef GARUDABOT_BLE_OTA_H
#define GARUDABOT_BLE_OTA_H

#include <Arduino.h>

// Penerima firmware OTA + Live Mode pin I/O lewat Bluetooth (Nordic UART).
// App menyisipkan otomatis ke sketch ESP32 lewat ble_ota.rs, contoh:
//   GarudabotBleOta::begin("Mobil-01");  // nama advertising BLE
//   GarudabotBleOta::loop();
// Live Mode (green flag) memakai CMD_LIVE_* di characteristic RX yang sama.
// Advertising: service UUID di paket ADV (agar scanner Windows/BLE native ketemu),
// nama di scan response (dan ikut di ADV jika nama ≤ 8 karakter).
// Protokol harus cocok dengan racero-gui/src/lib/ble/protocol.js

namespace GarudabotBleOta {
    // Default jika begin() dipanggil tanpa argumen.
    static const char *DEVICE_NAME = "Garudabot";
    static const char *SERVICE_UUID = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E";
    static const char *RX_UUID = "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"; // central → ESP32
    static const char *TX_UUID = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"; // ESP32 → central

    static const uint8_t CMD_BEGIN = 0x01;
    static const uint8_t CMD_DATA = 0x02;
    static const uint8_t CMD_END = 0x03;
    static const uint8_t CMD_ABORT = 0x04;

    // Live Mode pin I/O (jangan bentrok dengan OTA 0x01–0x04)
    static const uint8_t CMD_LIVE_DIGITAL_WRITE = 0x10;
    static const uint8_t CMD_LIVE_PWM_WRITE = 0x11;
    static const uint8_t CMD_LIVE_SERVO_WRITE = 0x12;
    static const uint8_t CMD_LIVE_TONE = 0x13;
    static const uint8_t CMD_LIVE_NO_TONE = 0x14;
    static const uint8_t CMD_LIVE_DIGITAL_READ = 0x15;
    static const uint8_t CMD_LIVE_ANALOG_READ = 0x16;
    static const uint8_t CMD_LIVE_PING = 0x17;
    static const uint8_t CMD_LIVE_ULTRASONIC = 0x18;
    /** Dual-PWM motor ELF: [cmd][in1][in2][speed_i8 -100..100] */
    static const uint8_t CMD_LIVE_MOTOR_DUAL = 0x19;

    // initSerial=false jika sketch lain sudah Serial.begin (mis. StandardFirmata).
    void begin(const char *deviceName = DEVICE_NAME, bool initSerial = true);
    void loop();
}

#endif
