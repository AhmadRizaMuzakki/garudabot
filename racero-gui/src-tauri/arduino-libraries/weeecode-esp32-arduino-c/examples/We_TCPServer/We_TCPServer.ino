#include "WeSocket.h"

long serverID = -1; // 服务器ID
long clientID = -1; // 客户端ID
long newClientID = -1;
void setup() {
    Serial.begin(115200);

    // 连接到 WiFi 网络
    WiFi.begin("WEEEMAKE", "WEEEMAKE8899");
    Serial.print("Connecting to WiFi...");
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    Serial.println("Connected to WiFi.");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());

    // 创建 TCP 服务器，监听端口 8080，最大连接数为 2
    serverID = WeSocket::createServer(8080, 1);
    if (serverID != -1) {
        Serial.print("Server created with ID: ");
        Serial.println(serverID);
    } else {
        Serial.println("Failed to create server.");
    }

    // 创建 TCP 客户端，连接到服务器（IP 地址为 192.168.1.100，端口为 8080）
    clientID = WeSocket::createClient("172.16.0.25", 8080);
    if (clientID != -1) {
        Serial.print("Client created with ID: ");
        Serial.println(clientID);
    } else {
        Serial.println("Failed to create client.");
    }
    WeSocket::setTimeout(serverID,50000);
    // 处理服务器端的客户端连接
    newClientID = WeSocket::handleClientConnection(serverID);
    if (newClientID != -1) {
        Serial.print("New client connected with ID: ");
        Serial.println(newClientID);
    }
}

void loop() {

    if(newClientID != -1)
    {
      WeSocket::send(newClientID, "Hello from server!");  
    }
    // 客户端向服务器发送数据
    if (clientID != -1) {
        WeSocket::send(clientID, "Hello from client!");
    }

    // 服务器接收客户端发送的数据
    if (newClientID != -1) {
        String receivedData = WeSocket::receive(newClientID);
        if (!receivedData.isEmpty()) {
            Serial.print("Server received from client: ");
            Serial.println(receivedData);
        }
    }

    // 客户端接收服务器发送的数据
    if (clientID != -1) {
        String receivedData = WeSocket::receive(clientID);
        if (!receivedData.isEmpty()) {
            Serial.print("Client received from server: ");
            Serial.println(receivedData);
        }
    }

    delay(1000);
}