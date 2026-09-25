#include "GarudabotBleOta.h"

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <BLEAdvertising.h>
#include <Update.h>
#if defined(CONFIG_IDF_TARGET_ESP32)
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"
#endif

// OTA Bluetooth + Live Mode. Motor = LEDC langsung (tanpa WeELFESP32Motor).

namespace GarudabotBleOta {

namespace {

BLEServer *server = nullptr;
BLECharacteristic *txChar = nullptr;
BLECharacteristic *rxChar = nullptr;

bool deviceConnected = false;
bool otaInProgress = false;
bool otaShouldReboot = false;
bool bleReady = false;
bool advertisingRunning = false;
size_t otaExpected = 0;
size_t otaReceived = 0;
uint32_t lastAdvertiseMs = 0;
uint32_t advertiseRestartAtMs = 0;
String bleName;

int liveTonePin = -1;
uint32_t toneStopAtMs = 0;
static bool pendingReadyNotify = false;

#define LIVE_PWM_FREQ 20000
#define LIVE_PWM_BITS 8
#define LIVE_MOTOR_MAX_DUTY 220
/**
 * Pin fisik ELF ESP32 Motor (dari uji board, bukan tebakan Mini):
 *   Port M1 (silk) = GPIO19 + GPIO21
 *   Port M2 (silk) = GPIO16 + GPIO17
 * Bukti: blok yang kirim 16/17 menggerakkan motor di terminal M2.
 * IN1 = pin yang di-PWM untuk +speed (M1 maju = PWM di 19, sama We_ELFMotor_Test).
 */
#define LIVE_M1_IN1 19
#define LIVE_M1_IN2 21
#define LIVE_M2_IN1 16
#define LIVE_M2_IN2 17
static bool livePwmAttached[40] = {false};

// Ring buffer Live — onWrite hanya salin byte.
#define LIVE_Q_CAP 24
#define LIVE_Q_PKT 8
struct LivePkt {
    uint8_t len;
    uint8_t data[LIVE_Q_PKT];
};
static LivePkt liveQ[LIVE_Q_CAP];
static volatile uint8_t liveQHead = 0; // next write
static volatile uint8_t liveQTail = 0; // next read

static void livePwmAttach(uint8_t pin) {
    if (pin >= 40) {
        return;
    }
    pinMode(pin, OUTPUT);
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
    // Re-attach tiap kali: jalur lain bisa merusak kanal LEDC (sering di 16/17).
    if (livePwmAttached[pin]) {
        ledcDetach(pin);
    }
    ledcAttach(pin, LIVE_PWM_FREQ, LIVE_PWM_BITS);
#else
    analogWriteFrequency(LIVE_PWM_FREQ);
    analogWriteResolution(LIVE_PWM_BITS);
#endif
    livePwmAttached[pin] = true;
}

static void livePwmWrite(uint8_t pin, uint8_t value) {
    livePwmAttach(pin);
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
    ledcWrite(pin, value);
#else
    analogWrite(pin, value);
#endif
}

/** Idle pin: lepas PWM lalu digital LOW — hindari shoot-through / LED F. */
static void liveMotorIdle(uint8_t pin) {
    if (pin >= 40) {
        return;
    }
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
    if (livePwmAttached[pin]) {
        ledcWrite(pin, 0);
        ledcDetach(pin);
        livePwmAttached[pin] = false;
    }
#endif
    pinMode(pin, OUTPUT);
    digitalWrite(pin, LOW);
}

/** Drive pin: full HIGH kalau duty tinggi, else PWM. */
static void liveMotorDrive(uint8_t pin, int duty) {
    if (duty >= 250) {
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
        if (livePwmAttached[pin]) {
            ledcDetach(pin);
            livePwmAttached[pin] = false;
        }
#endif
        pinMode(pin, OUTPUT);
        digitalWrite(pin, HIGH);
        return;
    }
    livePwmWrite(pin, (uint8_t)duty);
}

static void liveDetachPwm(uint8_t pin) {
    if (pin >= 40 || !livePwmAttached[pin]) {
        return;
    }
    livePwmAttached[pin] = false;
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
    ledcDetach(pin);
#endif
}

/** Dual-PWM H-bridge. speedPct -100..100. */
static void liveMotorDual(uint8_t in1, uint8_t in2, int8_t speedPct) {
    int sp = (int)speedPct;
    if (sp > 100) {
        sp = 100;
    }
    if (sp < -100) {
        sp = -100;
    }

    if (sp == 0) {
        liveMotorIdle(in1);
        liveMotorIdle(in2);
        return;
    }

    int mag = sp < 0 ? -sp : sp;
    int duty = (mag * LIVE_MOTOR_MAX_DUTY) / 100;
    if (duty < 40) {
        duty = 40; // di bawah ini motor sering cuma getar
    }
    if (duty > 255) {
        duty = 255;
    }

    if (sp > 0) {
        liveMotorIdle(in2);
        liveMotorDrive(in1, duty);
    } else {
        liveMotorIdle(in1);
        liveMotorDrive(in2, duty);
    }
}

static void writeServoAngle(uint8_t pin, uint8_t angle) {
    if (angle > 180) {
        angle = 180;
    }
    int pulseUs = 500 + ((int)angle * 2000) / 180;
    pinMode(pin, OUTPUT);
    for (int i = 0; i < 12; i++) {
        digitalWrite(pin, HIGH);
        delayMicroseconds(pulseUs);
        digitalWrite(pin, LOW);
        delayMicroseconds(20000 - pulseUs);
    }
}

static void notifyStatus(const char *msg) {
    if (!txChar || !deviceConnected) {
        return;
    }
    txChar->setValue(msg);
    txChar->notify();
}

static void stopToneNow() {
    if (liveTonePin < 0) {
        toneStopAtMs = 0;
        return;
    }
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
    ledcWriteTone((uint8_t)liveTonePin, 0);
#else
    ledcWriteTone(0, 0);
#endif
    liveTonePin = -1;
    toneStopAtMs = 0;
}

/** Enqueue Live pkt. Motor dual: coalesce ke slot terakhir yang sama pin. */
static bool enqueueLive(const uint8_t *data, size_t len) {
    if (!data || len == 0) {
        return false;
    }
    if (len > LIVE_Q_PKT) {
        len = LIVE_Q_PKT;
    }

    // Coalesce motor: update pending packet dengan pin sama (hindari full queue).
    if (data[0] == CMD_LIVE_MOTOR_DUAL && len >= 4) {
        uint8_t t = liveQTail;
        while (t != liveQHead) {
            LivePkt &p = liveQ[t];
            if (p.len >= 4 && p.data[0] == CMD_LIVE_MOTOR_DUAL &&
                p.data[1] == data[1] && p.data[2] == data[2]) {
                p.data[3] = data[3];
                return true;
            }
            t = (uint8_t)((t + 1) % LIVE_Q_CAP);
        }
    }

    uint8_t next = (uint8_t)((liveQHead + 1) % LIVE_Q_CAP);
    if (next == liveQTail) {
        // Penuh: drop oldest supaya perintah baru (stop/gas) tetap masuk.
        liveQTail = (uint8_t)((liveQTail + 1) % LIVE_Q_CAP);
    }

    LivePkt &slot = liveQ[liveQHead];
    slot.len = (uint8_t)len;
    for (size_t i = 0; i < len; i++) {
        slot.data[i] = data[i];
    }
    liveQHead = next;
    return true;
}

static bool dequeueLive(LivePkt *out) {
    if (liveQTail == liveQHead) {
        return false;
    }
    *out = liveQ[liveQTail];
    liveQTail = (uint8_t)((liveQTail + 1) % LIVE_Q_CAP);
    return true;
}

static void startAdvertising() {
    BLEAdvertising *advertising = BLEDevice::getAdvertising();
    if (!advertising) {
        return;
    }
    if (advertisingRunning) {
        return;
    }

    BLEAdvertisementData adv;
    adv.setFlags(0x06);
    adv.setCompleteServices(BLEUUID(SERVICE_UUID));
    const size_t maxNameInAdv = 8;
    if (bleName.length() > 0 && bleName.length() <= maxNameInAdv) {
        adv.setName(bleName.c_str());
    }
    advertising->setAdvertisementData(adv);

    BLEAdvertisementData scanResp;
    if (bleName.length() > 0) {
        scanResp.setName(bleName.c_str());
    }
    advertising->setScanResponseData(scanResp);

    advertising->addServiceUUID(BLEUUID(SERVICE_UUID));
    advertising->setScanResponse(true);
    advertising->setMinPreferred(0x06);
    advertising->setMaxPreferred(0x12);
    advertising->start();
    advertisingRunning = true;
    lastAdvertiseMs = millis();
    advertiseRestartAtMs = 0;
}

static void scheduleAdvertisingRestart(uint32_t delayMs) {
    uint32_t at = millis() + delayMs;
    if (advertiseRestartAtMs == 0 || at < advertiseRestartAtMs) {
        advertiseRestartAtMs = at;
    }
    advertisingRunning = false;
}

/** Dipanggil dari loop() — boleh delay singkat (soft-start / servo). */
static void handleLiveCommand(const uint8_t *data, size_t len) {
    if (otaInProgress || len < 1) {
        return;
    }

    uint8_t cmd = data[0];

    if (cmd == CMD_LIVE_PING) {
        notifyStatus("LIVE:7"); // v7 = M1=19/21, M2=16/17 (label port benar)
        return;
    }

    if (cmd == CMD_LIVE_DIGITAL_WRITE && len >= 3) {
        uint8_t pin = data[1];
        uint8_t value = data[2] ? HIGH : LOW;
        liveDetachPwm(pin);
        pinMode(pin, OUTPUT);
        digitalWrite(pin, value);
        // Tidak notify OK:W — write-without-response; hemat radio.
        return;
    }

    if (cmd == CMD_LIVE_PWM_WRITE && len >= 3) {
        livePwmWrite(data[1], data[2]);
        return;
    }

    if (cmd == CMD_LIVE_MOTOR_DUAL && len >= 4) {
        liveMotorDual(data[1], data[2], (int8_t)data[3]);
        // Tidak notify — motor fire-and-forget (hindari BLE putus).
        return;
    }

    if (cmd == CMD_LIVE_SERVO_WRITE && len >= 3) {
        writeServoAngle(data[1], data[2]);
        return;
    }

    if (cmd == CMD_LIVE_TONE && len >= 6) {
        uint8_t pin = data[1];
        uint16_t frequency = (uint16_t)data[2] | ((uint16_t)data[3] << 8);
        uint16_t duration = (uint16_t)data[4] | ((uint16_t)data[5] << 8);
        stopToneNow();
        liveTonePin = pin;
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
        ledcAttach(pin, frequency > 0 ? frequency : 1000, 8);
        ledcWriteTone(pin, frequency);
#else
        ledcSetup(0, frequency > 0 ? frequency : 1000, 8);
        ledcAttachPin(pin, 0);
        ledcWriteTone(0, frequency);
#endif
        if (duration > 0) {
            toneStopAtMs = millis() + duration;
        } else {
            toneStopAtMs = 0;
        }
        return;
    }

    if (cmd == CMD_LIVE_NO_TONE && len >= 2) {
        (void)data[1];
        stopToneNow();
        return;
    }

    if (cmd == CMD_LIVE_DIGITAL_READ && len >= 2) {
        uint8_t pin = data[1];
        pinMode(pin, INPUT);
        int value = digitalRead(pin) ? 1 : 0;
        char buf[24];
        snprintf(buf, sizeof(buf), "D:%u:%d", (unsigned)pin, value);
        notifyStatus(buf);
        return;
    }

    if (cmd == CMD_LIVE_ANALOG_READ && len >= 2) {
        uint8_t pin = data[1];
        int value = analogRead(pin);
        char buf[28];
        snprintf(buf, sizeof(buf), "A:%u:%d", (unsigned)pin, value);
        notifyStatus(buf);
        return;
    }

    if (cmd == CMD_LIVE_ULTRASONIC && len >= 3) {
        uint8_t trig = data[1];
        uint8_t echo = data[2];
        pinMode(trig, OUTPUT);
        pinMode(echo, INPUT);
        digitalWrite(trig, LOW);
        delayMicroseconds(2);
        digitalWrite(trig, HIGH);
        delayMicroseconds(10);
        digitalWrite(trig, LOW);
        unsigned long duration = pulseIn(echo, HIGH, 30000UL);
        float cm = duration > 0 ? (duration * 0.0343f / 2.0f) : -1.0f;
        char buf[28];
        snprintf(buf, sizeof(buf), "U:%.2f", cm);
        notifyStatus(buf);
        return;
    }
}

class ServerCallbacks : public BLEServerCallbacks {
    void onConnect(BLEServer *pServer) override {
        (void)pServer;
        deviceConnected = true;
        advertisingRunning = false;
        advertiseRestartAtMs = 0;
        pendingReadyNotify = true; // notify dari loop(), bukan di callback
    }

    void onDisconnect(BLEServer *pServer) override {
        (void)pServer;
        deviceConnected = false;
        if (otaInProgress) {
            Update.abort();
            otaInProgress = false;
            otaExpected = 0;
            otaReceived = 0;
        }
        // Kosongkan antrian Live saat putus.
        liveQHead = 0;
        liveQTail = 0;
        stopToneNow();
        scheduleAdvertisingRestart(1500);
    }
};

class RxCallbacks : public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) override {
        String value = pCharacteristic->getValue();
        if (value.length() == 0) {
            return;
        }

        const uint8_t *data = reinterpret_cast<const uint8_t *>(value.c_str());
        size_t len = static_cast<size_t>(value.length());
        uint8_t cmd = data[0];

        // Live: salin saja — jangan PWM/motor/delay di sini.
        if (cmd >= CMD_LIVE_DIGITAL_WRITE && cmd <= CMD_LIVE_MOTOR_DUAL) {
            enqueueLive(data, len);
            return;
        }

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

void begin(const char *deviceName, bool initSerial) {
    const char *name = deviceName ? deviceName : DEVICE_NAME;
    bleName = name;
    liveTonePin = -1;
    toneStopAtMs = 0;
    advertisingRunning = false;
    advertiseRestartAtMs = 0;
    lastAdvertiseMs = 0;
    liveQHead = 0;
    liveQTail = 0;
    pendingReadyNotify = false;
    for (int i = 0; i < 40; i++) {
        livePwmAttached[i] = false;
    }

    if (initSerial) {
        Serial.begin(115200);
        delay(80);
    }

#if defined(CONFIG_IDF_TARGET_ESP32)
    WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);
#endif

    // Idle pin motor sebelum advertising (jangan paksa LEDC dulu).
    liveMotorIdle(LIVE_M1_IN1);
    liveMotorIdle(LIVE_M1_IN2);
    liveMotorIdle(LIVE_M2_IN1);
    liveMotorIdle(LIVE_M2_IN2);

    delay(30);
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
    delay(40);
    startAdvertising();
    bleReady = true;

    if (initSerial) {
        Serial.print("[GarudabotBleOta] advertising as ");
        Serial.println(name);
    }
}

void loop() {
    if (otaShouldReboot) {
        delay(400);
        ESP.restart();
    }

    if (pendingReadyNotify && deviceConnected) {
        pendingReadyNotify = false;
        notifyStatus("RDY");
    }

    // Tone non-blocking (tidak delay di callback / handle).
    if (toneStopAtMs != 0 && (int32_t)(millis() - toneStopAtMs) >= 0) {
        stopToneNow();
    }

    // Drain Live queue (batas per tick supaya loop tidak starvasi).
    for (int n = 0; n < 8; n++) {
        LivePkt pkt;
        if (!dequeueLive(&pkt)) {
            break;
        }
        handleLiveCommand(pkt.data, pkt.len);
    }

    if (bleReady && !deviceConnected && !otaInProgress && advertiseRestartAtMs != 0) {
        if ((int32_t)(millis() - advertiseRestartAtMs) >= 0) {
            advertiseRestartAtMs = 0;
            startAdvertising();
        }
    }
}

} // namespace GarudabotBleOta
