#ifdef ESP32
#include "WeSocket.h"

WeSocket::Connection WeSocket::connections[MAX_CONNECTIONS];
int WeSocket::connectionCount = 0;
String WeSocket::clientIP = "0.0.0.0"; // 初始化静态成员变量
uint16_t WeSocket::clientPort = 0; // 初始化静态成员变量

WeSocket::WeSocket() {
    // 默认构造函数
}

WeSocket::~WeSocket() {
    // 析构函数：释放所有连接
    for (int i = 0; i < connectionCount; i++) {
       // connections[i].~Connection(); // 调用 Connection 的析构函数
    }
}

long WeSocket::createServer(uint16_t port, int maxConnections) {
    if (connectionCount >= MAX_CONNECTIONS) {
        Serial.println("Too many connections.");
        return -1;
    }

    int id = connectionCount++;
    connections[id].isServer = true;
    connections[id].port = port;
    connections[id].maxConnections = maxConnections > 10 ? 10 : maxConnections;

    // 动态分配 WiFiServer
    connections[id].server = new WiFiServer(port);
    connections[id].server->begin();
    Serial.print("Server created on port ");
    Serial.println(port);

    return (id << 8) | 0xFF; // 返回 serverID，clientID 为 0xFF 表示无效
}

long WeSocket::createClient(const char* serverIP, uint16_t port) {
    if (connectionCount >= MAX_CONNECTIONS) {
        Serial.println("Too many connections.");
        return -1;
    }

    int id = connectionCount++;
    connections[id].isServer = false;
    connections[id].serverIP = serverIP;
    connections[id].port = port;

    // 动态分配 WiFiClient
    connections[id].client = new WiFiClient();
    unsigned long startTime = millis();
    while (!connections[id].client->connect(serverIP, port) && (millis() - startTime) < connections[id].timeout) {
        delay(100); // 尝试连接，直到超时
    }

    if (connections[id].client->connected()) {
        Serial.print("Connected to server at ");
        Serial.print(serverIP);
        Serial.print(":");
        Serial.println(port);
        return (id << 8) | 0xFF; // 返回 clientID，serverID 为 0xFF 表示无效
    } else {
        Serial.println("Failed to connect to server.");
        delete connections[id].client; // 释放失败的客户端
        connectionCount--; // 回退连接计数
        return -1;
    }
}

long WeSocket::handleClientConnection(long connectionID) {
    int serverID = (connectionID >> 8) & 0xFF;
    if (serverID < 0 || serverID >= connectionCount || !connections[serverID].isServer) {
        Serial.println("Invalid server ID.");
        return -1;
    }

    auto& serverConn = connections[serverID];
    unsigned long startTime = millis();
    WiFiClient newClient = serverConn.server->available(); // 检查是否有新的客户端连接
    while (!newClient && (millis() - startTime) < serverConn.timeout) {
        delay(100); // 等待新连接，直到超时
        newClient = serverConn.server->available();
    }
    if (newClient) {
        Serial.println("New client connected.");
        for (int i = 0; i < serverConn.maxConnections; i++) {
            if (!serverConn.clients[i].connected()) { // 找到一个空闲的槽位
                serverConn.clients[i] = newClient; // 存储新客户端
                serverConn.lastValidClientID = i; // 更新上一个有效的客户端ID
                clientIP = newClient.remoteIP().toString(); // 更新客户端IP
                clientPort = newClient.remotePort(); // 更新客户端端口
                return (serverID << 8) | i; // 返回 serverID 和 clientID
            }
        }
        Serial.println("Max connections reached. Rejecting new client.");
        newClient.stop(); // 关闭新连接
    }
    // 如果没有新连接，返回上一个连接的clientID
    return (serverID << 8) | serverConn.lastValidClientID;
}

long WeSocket::getSockIDFromClientIndex(long connectionID, int clientIndex) {
    int serverID = (connectionID >> 8) & 0xFF;
    if (serverID < 0 || serverID >= connectionCount || !connections[serverID].isServer) {
        Serial.println("Invalid server ID.");
        return -1;
    }

    auto& serverConn = connections[serverID];
    if (clientIndex < 1 || clientIndex > serverConn.maxConnections) {
        Serial.println("Invalid client index.");
        return -1;
    }

    int clientID = clientIndex - 1; // 将1-10的索引转换为0-9的数组索引
    if (serverConn.clients[clientID].connected()) {
        return (serverID << 8) | clientID;
    } else {
        Serial.println("Client not connected.");
        return -1;
    }
}

size_t WeSocket::send(long connectionID, const char* data) {
    int serverID = (connectionID >> 8) & 0xFF;
    int clientID = connectionID & 0xFF;

    if (serverID < 0 || serverID >= connectionCount) {
        Serial.println("Invalid server ID.");
        return 0;
    }

    auto& conn = connections[serverID];
    if (conn.isServer) {
        if (clientID < 0 || clientID >= conn.maxConnections) {
            Serial.println("Invalid client ID.");
            return 0;
        }
        if (conn.clients[clientID].connected()) {
            return conn.clients[clientID].print(data);
        }
    } else {
        if (conn.client->connected()) {
            return conn.client->print(data);
        }
    }
    return 0;
}

String WeSocket::receive(long connectionID) {
    int serverID = (connectionID >> 8) & 0xFF;
    int clientID = connectionID & 0xFF;

    if (serverID < 0 || serverID >= connectionCount) {
        Serial.println("Invalid server ID.");
        return "";
    }

    auto& conn = connections[serverID];
    if (conn.isServer) {
        if (clientID < 0 || clientID >= conn.maxConnections) {
            Serial.println("Invalid client ID.");
            return "";
        }
        if (conn.clients[clientID].available()) {
            String buffer;
            while (conn.clients[clientID].available()) {
                char c = conn.clients[clientID].read();
                buffer += c;
            }
            return buffer;
        }
    } else {
        if (conn.client->available()) {
            String buffer;
            while (conn.client->available()) {
                char c = conn.client->read();
                buffer += c;
            }
            return buffer;
        }
    }
    return "";
}

int WeSocket::getConnectedClientsCount(long connectionID) {
    int serverID = (connectionID >> 8) & 0xFF;
    if (serverID < 0 || serverID >= connectionCount) {
        Serial.println("Invalid server ID.");
        return 0;
    }

    auto& conn = connections[serverID];
    if (!conn.isServer) {
        Serial.println("This function is only for server.");
        return 0;
    }

    int count = 0;
    for (int i = 0; i < conn.maxConnections; i++) {
        if (conn.clients[i].connected()) {
            count++;
        }
    }
    return count;
}

void WeSocket::end(long connectionID) {
    int serverID = (connectionID >> 8) & 0xFF;
    int clientID = connectionID & 0xFF;

    if (serverID < 0 || serverID >= connectionCount) {
        Serial.println("Invalid connection ID.");
        return;
    }

    auto& conn = connections[serverID];
    if (conn.isServer) {
        if (clientID >= 0 && clientID < conn.maxConnections) {
            conn.clients[clientID].stop();
        }
        conn.server->stop();
        delete conn.server; // 释放服务器对象
    } else {
        conn.client->stop();
        delete conn.client; // 释放客户端对象
    }
}

void WeSocket::setTimeout(long connectionID, unsigned long timeout) {
    int serverID = (connectionID >> 8) & 0xFF;
    if (serverID < 0 || serverID >= connectionCount) {
        Serial.println("Invalid connection ID.");
        return;
    }

    connections[serverID].timeout = timeout; // 设置超时时间
    Serial.print("Timeout set to ");
    Serial.print(timeout);
    Serial.println(" ms.");
}

bool WeSocket::isClientConnected(long connectionID) {
    int serverID = (connectionID >> 8) & 0xFF;
    int clientID = connectionID & 0xFF;

    if (serverID < 0 || serverID >= connectionCount) {
        Serial.println("Invalid server ID.");
        return false;
    }

    auto& conn = connections[serverID];
    if (!conn.isServer) {
        return conn.client->connected();
    } else {
        if (clientID >= 0 && clientID < conn.maxConnections) {
            return conn.clients[clientID].connected();
        }
    }
    return false;
}

#endif
