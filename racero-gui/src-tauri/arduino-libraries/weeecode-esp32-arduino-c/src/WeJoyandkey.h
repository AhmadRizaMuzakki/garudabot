#ifndef WeJoyandKey_h
#define WeJoyandKey_h

#include "Arduino.h"
#include "AW9523Manager.h"  // 包含 AW9523Manager

// 定义按键和摇杆的引脚枚举
enum WeJoyandKeyPin {
    ButtonA = 1,
    ButtonB = 0,
    JoyStickUp = 13,
    JoyStickDown = 7,
    JoyStickLeft = 14,
    JoyStickRight = 12,
    JoyStickMiddle = 15
};

class WeJoyandKey {
public:
    WeJoyandKey();
    bool begin();
    bool isPressed(WeJoyandKeyPin pin);

private:
    void _initPins();
    bool _readPin(uint8_t pin);
};

#endif