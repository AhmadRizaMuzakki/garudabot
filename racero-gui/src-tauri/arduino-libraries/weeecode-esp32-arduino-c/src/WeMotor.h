#ifndef WeMotor_H
#define WeMotor_H

#include <Arduino.h>

class WeMotor {
    public:
        WeMotor(uint8_t pin1, uint8_t pin2);  // 构造函数，接收两个引脚
        void begin();                         // 初始化
        void setSpeed(int speed);            // 设置速度，范围-255到255
        void stop();                         // 停止电机
        
    private:
        uint8_t _pin1;    // 方向引脚1
        uint8_t _pin2;    // 方向引脚2
        int _speed;       // 当前速度
};

#endif 