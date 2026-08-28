#include "WeMotor.h"

WeMotor::WeMotor(uint8_t pin1, uint8_t pin2) {
    _pin1 = pin1;
    _pin2 = pin2;
    _speed = 0;
}

void WeMotor::begin() {
    pinMode(_pin1, OUTPUT);
    pinMode(_pin2, OUTPUT);
    stop();
}

void WeMotor::setSpeed(int speed) {
    _speed = constrain(speed, -255, 255);  // 限制速度范围
    
    if (_speed > 0) {
        // 正转
        analogWrite(_pin1, _speed);
        digitalWrite(_pin2, LOW);
    } else if (_speed < 0) {
        // 反转
        digitalWrite(_pin1, LOW);
        analogWrite(_pin2, abs(_speed));
    } else {
        // 停止
        stop();
    }
}

void WeMotor::stop() {
    digitalWrite(_pin1, LOW);
    digitalWrite(_pin2, LOW);
    _speed = 0;
} 