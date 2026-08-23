/*
 * Garudabot — ESP-01 WiFi serial bridge untuk upload ke Arduino Uno.
 *
 * Wiring (ESP-01 pada adapter 3.3V):
 *   ESP TX  -> Arduino pin 0 (RX)
 *   ESP RX  -> Arduino pin 1 (TX)
 *   GPIO2   -> Arduino RESET (lewat kapasitor 100nF, seperti DTR)
 *
 * PC join hotspot ESP, lalu upload dari Garudabot ke net:<IP>:8266
 */
#include <ESP8266WiFi.h>
#include <WiFiClient.h>
#include <WiFiServer.h>

#ifndef AP_SSID
#define AP_SSID "Garudabot-Bridge"
#endif
#ifndef AP_PASS
#define AP_PASS "12345678"
#endif
#ifndef BRIDGE_PORT
#define BRIDGE_PORT 8266
#endif
#ifndef ARDUINO_RESET_PIN
#define ARDUINO_RESET_PIN 2
#endif

WiFiServer server(BRIDGE_PORT);

void pulseArduinoReset() {
    pinMode(ARDUINO_RESET_PIN, OUTPUT);
    digitalWrite(ARDUINO_RESET_PIN, HIGH);
    delay(10);
    digitalWrite(ARDUINO_RESET_PIN, LOW);
    delay(80);
    digitalWrite(ARDUINO_RESET_PIN, HIGH);
    delay(250);
}

void bridgeClient(WiFiClient &client) {
    pulseArduinoReset();
    while (client.connected()) {
        if (client.available()) {
            while (client.available()) {
                Serial.write(client.read());
            }
        }
        if (Serial.available()) {
            while (Serial.available()) {
                client.write(Serial.read());
            }
        }
        yield();
    }
}

void setup() {
    Serial.begin(115200);
    Serial.setRxBufferSize(1024);

    WiFi.mode(WIFI_AP);
    WiFi.softAP(AP_SSID, AP_PASS);

    server.begin();
    pulseArduinoReset();
}

void loop() {
    WiFiClient client = server.available();
    if (client) {
        bridgeClient(client);
        client.stop();
    }
}
