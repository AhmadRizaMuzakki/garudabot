#ifndef WeWirelessRadio_h
#define WeWirelessRadio_h

#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include "esp_wifi.h"

#define MAX_MESSAGE_LENGTH 32
#define MAX_STORED_DATA 10  // 最多存储10条数据

// 定义结构体
typedef struct {
    char name[MAX_MESSAGE_LENGTH];  // 字符串型变量
    char value[MAX_MESSAGE_LENGTH]; // 字符串型变量，长度为32
} MyData;

class WeWirelessRadio {
  public:
    WeWirelessRadio();
    bool begin(uint8_t channel);
    void sendChar(const char* name, const char* str);  // 修改为支持字符串
    void sendNumber(const char* name, int num);        // 修改为支持字符串
    void onReceive(void (*callback)(MyData data));
    
    // 新增方法
    MyData* getStoredData();  // 获取存储的数据数组
    int getStoredDataCount(); // 获取存储的数据数量
    void clearStoredData();   // 清空存储的数据
    
    // 新增：根据name查找value的方法
    const char* getValueByName(const char* name);  // 返回找到的value，如果未找到返回nullptr
    
  private:
    bool _init();
    void _send(MyData data);
    static void _onDataRecv(const esp_now_recv_info *info, const uint8_t *incomingData, int len);

    static uint8_t _channel;
    static void (*_callback)(MyData data);
    
    // 新增成员变量
    static MyData _storedData[MAX_STORED_DATA];  // 存储接收到的数据
    static int _storedDataCount;                 // 当前存储的数据数量
};

#endif