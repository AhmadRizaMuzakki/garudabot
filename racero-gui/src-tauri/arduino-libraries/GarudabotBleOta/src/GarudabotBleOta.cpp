#include "GarudabotBleOta.h"

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <BLEAdvertising.h>
#include <Update.h>
#include "esp_wifi.h"

// Implementasi OTA Bluetooth: advertise service, terima BEGIN/DATA/END,
// tulis flash dengan Arduino Update API, lalu reboot.

namespace GarudabotBleOta {

namespace {

BLEServer *server = nullptr;
BLECharacteristic *txChar = nullptr;
BLECharacteristic *rxChar = nullptr;

bool deviceConnected = false;
bool otaInProgress = false;
bool otaShouldReboot = false;
bool bleReady = false;
size_t otaExpected = 0;
size_t otaReceived = 0;
uint32_t lastAdvertiseMs = 0;
String bleName;

void notifyStatus(const char *msg) {
    if (!txChar) {
        return;
    }
    txChar->setValue(msg);
    txChar->notify();
}

void startAdvertising() {
    BLEAdvertising *advertising = BLEDevice::getAdvertising();
    if (!advertising) {
        return;
    }

    // ADV: flags + service UUID (agar filter Scratch Link by UUID cocok).
    BLEAdvertisementData adv;
    adv.setFlags(0x06); // LE General Discoverable | BR/EDR Not Supported
    adv.setCompleteServices(BLEUUID(SERVICE_UUID));
    advertising->setAdvertisementData(adv);

    // Scan response: nama lengkap (Windows/Scratch Link sering baca nama dari sini).
    BLEAdvertisementData scanResp;
    scanResp.setName(bleName.c_str());
    advertising->setScanResponseData(scanResp);

    advertising->addServiceUUID(BLEUUID(SERVICE_UUID));
    advertising->setScanResponse(true);
    advertising->setMinPreferred(0x06);
    advertising->setMaxPreferred(0x12);
    advertising->start();
    lastAdvertiseMs = millis();
}

class ServerCallbacks : public BLEServerCallbacks {
    void onConnect(BLEServer *pServer) override {
        deviceConnected = true;
        notifyStatus("RDY");
    }

    void onDisconnect(BLEServer *pServer) override {
        deviceConnected = false;
        if (otaInProgress) {
            Update.abort();
            otaInProgress = false;
            otaExpected = 0;
            otaReceived = 0;
        }
        delay(200);
        startAdvertising();
    }
};

class RxCallbacks : public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) override {
        // ESP32 Arduino core 3.x: getValue() returns Arduino String (bukan std::string).
        String value = pCharacteristic->getValue();
        if (value.length() == 0) {
            return;
        }

        const uint8_t *data = reinterpret_cast<const uint8_t *>(value.c_str());
        size_t len = static_cast<size_t>(value.length());
        uint8_t cmd = data[0];

        if (cmd == CMD_BEGIN) {
            if (len < 5) {
                notifyStatus("ERR:BEGIN");
                return;
            }
            if (otaInProgress) {
                Update.abort();
            }
            otaExpected = (size_t)data[1] |
                ((size_t)data[2] << 8) |
                ((size_t)data[3] << 16) |
                ((size_t)data[4] << 24);
            otaReceived = 0;
            if (otaExpected == 0 || otaExpected > 0x400000) {
                notifyStatus("ERR:SIZE");
                otaInProgress = false;
                return;
            }
            if (!Update.begin(otaExpected)) {
                notifyStatus("ERR:BEGIN_UPD");
                otaInProgress = false;
                return;
            }
            otaInProgress = true;
            notifyStatus("ACK:BEGIN");
            return;
        }

        if (cmd == CMD_DATA) {
            if (!otaInProgress || len < 2) {
                notifyStatus("ERR:DATA");
                return;
            }
            size_t chunkLen = len - 1;
            size_t written = Update.write(const_cast<uint8_t *>(data + 1), chunkLen);
            if (written != chunkLen) {
                Update.abort();
                otaInProgress = false;
                notifyStatus("ERR:WRITE");
                return;
            }
            otaReceived += written;
            if ((otaReceived % 4096) < chunkLen || otaReceived == otaExpected) {
                char buf[32];
                snprintf(buf, sizeof(buf), "N:%u", (unsigned)otaReceived);
                notifyStatus(buf);
            }
            return;
        }

        if (cmd == CMD_END) {
            if (!otaInProgress) {
                notifyStatus("ERR:END");
                return;
            }
            if (otaReceived != otaExpected) {
                Update.abort();
                otaInProgress = false;
                notifyStatus("ERR:LEN");
                return;
            }
            if (!Update.end(true)) {
                otaInProgress = false;
                notifyStatus("ERR:END_UPD");
                return;
            }
            otaInProgress = false;
            notifyStatus("OK");
            otaShouldReboot = true;
            return;
        }

        if (cmd == CMD_ABORT) {
            if (otaInProgress) {
                Update.abort();
                otaInProgress = false;
            }
            otaExpected = 0;
            otaReceived = 0;
            notifyStatus("ACK:ABORT");
        }
    }
};

} // namespace

void begin(const char *deviceName) {
    const char *name = deviceName ? deviceName : DEVICE_NAME;
    bleName = name;

    Serial.begin(115200);
    delay(50);
    Serial.println();
    Serial.println("[GarudabotBleOta] starting...");

    // Matikan WiFi (API IDF, tanpa Arduino WiFi.h) supaya radio bebas untuk BLE.
    esp_wifi_stop();
    esp_wifi_deinit();
    delay(50);

    BLEDevice::init(name);
    server = BLEDevice::createServer();
    server->setCallbacks(new ServerCallbacks());

    BLEService *service = server->createService(BLEUUID(SERVICE_UUID));

    txChar = service->createCharacteristic(
        BLEUUID(TX_UUID),
        BLECharacteristic::PROPERTY_NOTIFY | BLECharacteristic::PROPERTY_READ
    );
    txChar->addDescriptor(new BLE2902());
    txChar->setValue("RDY");

    rxChar = service->createCharacteristic(
        BLEUUID(RX_UUID),
        BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR
    );
    rxChar->setCallbacks(new RxCallbacks());

    service->start();
    startAdvertising();
    bleReady = true;

    Serial.print("[GarudabotBleOta] advertising as ");
    Serial.println(name);
}

void loop() {
    if (otaShouldReboot) {
        delay(400);
        ESP.restart();
    }

    // Refresh advertising kalau belum terkoneksi.
    if (bleReady && !deviceConnected && !otaInProgress) {
        if (millis() - lastAdvertiseMs > 4000) {
            startAdvertising();
        }
    }
}

} // namespace GarudabotBleOta
