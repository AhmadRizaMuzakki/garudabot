#ifndef WeSoftSerial_H
#define WeSoftSerial_H


#include "Arduino.h"





class WeSoftSerial {
    public:
    WeSoftSerial(uint8_t port);
    bool begin();
    void send(const char* name, const char* value);
    bool available();
    String readData();
    
    // 新增函数
    String getValue();                    // 返回完整值
    String getName();                     // 返回名称
    String getValueByIndex(int index);    // 根据索引返回值
    int getValueIndexCount();            // 返回值的索引数
    
    // 公开变量
    String data;   // 存储完整数据
    String name;   // 存储名称
    String value;  // 存储值
        
    private:
         HardwareSerial *serial;
         static const uint8_t SPEECH_SERIAL_PORT = 2; // 固定串口端口号
         int wePort;
         void parseData();  // 移到private部分
};

































#endif
