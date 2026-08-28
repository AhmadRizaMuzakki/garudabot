#ifndef WeSocket_h
#define WeSocket_h

#include "Arduino.h"
#include <WiFi.h>
#include <WiFiClient.h>
#include <WiFiServer.h>

#define MAX_CONNECTIONS 20  // 最大连接数（包括服务器和客户端）

class WeSocket {
public:
    WeSocket();
    ~WeSocket();

    // 使用 long 类型表示 serverID 和 clientID
    static long createServer(uint16_t port, int maxConnections);
    static long createClient(const char* serverIP, uint16_t port);

    static long handleClientConnection(long connectionID); // 处理客户端连接并返回sockID

    static size_t send(long connectionID, const char* data); // 发送数据
    static String receive(long connectionID); // 接收数据，直接返回String

    static int getConnectedClientsCount(long connectionID); // 获取连接的客户端数量
    static void end(long connectionID); // 结束连接
    static void setTimeout(long connectionID, unsigned long timeout); // 设置连接超时时间
    static bool isClientConnected(long connectionID);

    // 新增函数：通过客户端索引检索服务器连接的客户端数组，获取对应的sockID
    static long getSockIDFromClientIndex(long connectionID, int clientIndex);

    // 获取客户端的IP和端口
    static String clientIP; // 公开变量：客户端IP
    static uint16_t clientPort; // 公开变量：客户端端口

private:
    struct Connection {
        bool isServer;
        WiFiServer* server;  // 使用指针
        WiFiClient* client;  // 使用指针
        uint16_t port;
        const char* serverIP;
        int maxConnections;
        WiFiClient clients[10]; // 最大支持10个客户端
        int nextClientID = 0;
        int lastValidClientID = -1; // 记录上一个有效的客户端ID
        unsigned long timeout = 5000; // 默认超时时间（毫秒）
        ~Connection() {
            // 释放资源
            if (isServer && server) {
                delete server;
            } else if (!isServer && client) {
                delete client;
            }
        }
    };

    static Connection connections[MAX_CONNECTIONS]; // 统一管理所有连接
    static int connectionCount; // 当前连接数
};

#endif