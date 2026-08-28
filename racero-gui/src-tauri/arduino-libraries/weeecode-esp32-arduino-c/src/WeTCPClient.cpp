#ifdef ESP32
#include "WeTCPClient.h"

WeTCPClient::WeTCPClient() {
    is_connected = false;
}

WeTCPClient::~WeTCPClient() {
    disconnect();
}

bool WeTCPClient::connect(const char* server_ip, uint16_t server_port) {
    if (is_connected) {
        Serial.println("Already connected to a server.");
        return false;
    }
    if (client.connect(server_ip, server_port)) {
        is_connected = true;
        Serial.println("Connected to server.");
        return true;
    } else {
        Serial.println("Failed to connect to server.");
        return false;
    }
}

void WeTCPClient::disconnect() {
    if (is_connected) {
        client.stop();
        is_connected = false;
        Serial.println("Disconnected from server.");
    }
}

bool WeTCPClient::send(const char* data) {
    if (!is_connected) {
        Serial.println("Not connected to server.");
        return false;
    }
    return client.write(data) > 0;
}

bool WeTCPClient::receive(String& data) {
    if (!is_connected) {
        Serial.println("Not connected to server.");
        return false;
    }
    if (client.available()) {
        data = client.readStringUntil('\n');
        return true;
    }
    return false;
}

#endif