#ifndef WeTCP_Client_h
#define WeTCP_Client_h

#include <WiFi.h>
#include <WiFiClient.h>

class WeTCPClient {
public:
    WeTCPClient();
    ~WeTCPClient();

    bool connect(const char* server_ip, uint16_t server_port);  // 连接到服务器
    void disconnect();  // 断开连接
    bool send(const char* data);  // 向服务器发送数据
    bool receive(String& data);  // 从服务器接收数据

private:
    WiFiClient client;
    bool is_connected = false;
};

#endif