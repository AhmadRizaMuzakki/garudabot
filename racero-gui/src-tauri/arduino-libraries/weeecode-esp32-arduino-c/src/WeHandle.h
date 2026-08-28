#ifndef WeHandle_H
#define WeHandle_H

#ifdef  ESP32


#include <Arduino.h>
#include <HardwareSerial.h>
#define poket_count 8 
#define start_cmd 0xAA
#define stop_cmd  0x55
#define button1   7
#define button2   6
#define button3   5
#define button4   4
#define button5   3
#define button6   2
#define button7   1
#define button_RB 12
#define button_LR 8 
#define postion_Key 5

class WeHandle
{
public:
    WeHandle(int pin);
    void reset();  
    WeHandle(int rxPin, int txPin);
    void reset(int rxPin, int txPin);
    void begin();
    void read();
    uint8_t get_RX();
    uint8_t get_RY();
    uint8_t get_LX();
    uint8_t get_LY();
    uint8_t get_Key(uint8_t Hkey);
private:
#ifndef USE_Hardware_Serial
    int _rxPin;
    int _txPin;
#endif
    uint8_t hexArray[8];
    int hexArrayIndex = 0;
    bool receiving = false;
    uint8_t getByte(uint8_t arr[],int num);
    bool getBit( uint8_t Hbyte,int num);
};













#else
#include <Arduino.h>

// // 宏定义，根据需要在使用库时定义
// #ifndef Serialcom
// #error   "Serialcom must be defined before including WeHandle.h"
// #endif



#include <stdint.h>
#include <stdint.h>
#include <stdbool.h>
#include <SoftwareSerial.h>




#define poket_count 8 
#define start_cmd 0xAA
#define stop_cmd  0x55
#define button1   7
#define button2   6
#define button3   5
#define button4   4
#define button5   3
#define button6   2
#define button7   1
#define button_RB 12
#define button_LR 8 
#define postion_Key 5



class WeHandle
{
public:
#ifdef USE_Hardware_Serial
    WeHandle;
    void reset(void);  
#else
    WeHandle(int rxPin, int txPin);
    void reset(int rxPin, int txPin);
#endif
    void begin();
    void read();
    uint8_t get_RX();
    uint8_t get_RY();
    uint8_t get_LX();
    uint8_t get_LY();
    uint8_t get_Key(uint8_t Hkey);
private:
#ifndef USE_Hardware_Serial
    int _rxPin;
    int _txPin;
    SoftwareSerial*  _WeHandle;
#endif
    uint8_t hexArray[8];
    int hexArrayIndex = 0;
    bool receiving = false;
    uint8_t getByte(uint8_t arr[],int num);
    bool getBit( uint8_t Hbyte,int num);
};

#endif


#endif
