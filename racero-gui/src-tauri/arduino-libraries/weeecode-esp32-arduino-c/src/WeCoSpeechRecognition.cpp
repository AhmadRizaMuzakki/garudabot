#ifdef ESP32

#include "WeCoSpeechRecognition.h"

WeCoSpeechRecognition::WeCoSpeechRecognition() {
    serial = new HardwareSerial(SPEECH_SERIAL_PORT);
}

bool WeCoSpeechRecognition::begin() {
    // 初始化 AW9523
    if (!AW9523Manager::getInstance().begin()) {
        Serial.println("AW9523 初始化失败!");
        return false;
    }

    // 获取 AW9523 实例
    Adafruit_AW9523* aw9523 = AW9523Manager::getInstance().getDevice();

    // 配置使能引脚
    aw9523->pinMode(SPEECH_ENABLE_PIN, OUTPUT);
    aw9523->digitalWrite(SPEECH_ENABLE_PIN, LOW);  // 默认低电平

    // 初始化串口
    serial->begin(9600, SERIAL_8N1, SPEECH_RX_PIN, SPEECH_TX_PIN);

    return true;
}

void WeCoSpeechRecognition::enable() {
    Adafruit_AW9523* aw9523 = AW9523Manager::getInstance().getDevice();
    aw9523->digitalWrite(SPEECH_ENABLE_PIN, HIGH);  // 使能语音识别模块
}

void WeCoSpeechRecognition::disable() {
    Adafruit_AW9523* aw9523 = AW9523Manager::getInstance().getDevice();
    aw9523->digitalWrite(SPEECH_ENABLE_PIN, LOW);  // 禁用语音识别模块
}

int WeCoSpeechRecognition::read() {
    if (serial->available()) {
        return serial->read();  // 返回接收到的数据
    }
    return 0;  // 没有数据时返回 -1
}

#endif