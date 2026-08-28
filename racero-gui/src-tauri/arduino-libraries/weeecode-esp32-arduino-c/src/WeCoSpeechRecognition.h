#ifndef WeCoSpeechRecognition_H
#define WeCoSpeechRecognition_H

#include "Arduino.h"
#include "AW9523Manager.h"  // 包含 AW9523Manager

class WeCoSpeechRecognition {
public:
    WeCoSpeechRecognition();
    bool begin();
    void enable();
    void disable();
    int read();

private:
    HardwareSerial *serial;
    static const uint8_t SPEECH_ENABLE_PIN = 8;  // 固定使能引脚
    static const uint8_t SPEECH_RX_PIN = 16;     // 固定 RX 引脚
    static const uint8_t SPEECH_TX_PIN = 4;      // 固定 TX 引脚
    static const uint8_t SPEECH_SERIAL_PORT = 1; // 固定串口端口号
};

#endif