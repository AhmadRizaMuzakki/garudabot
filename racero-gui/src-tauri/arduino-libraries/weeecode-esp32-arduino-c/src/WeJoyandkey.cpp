#include "WeJoyandKey.h"

WeJoyandKey::WeJoyandKey() {}

bool WeJoyandKey::begin() {
    // 初始化 AW9523
    if (!AW9523Manager::getInstance().begin()) {
        return false;
    }

    _initPins();
    return true;
}

void WeJoyandKey::_initPins() {
    Adafruit_AW9523* aw9523 = AW9523Manager::getInstance().getDevice();

    // 配置 GPIO 为输入模式
    aw9523->pinMode(ButtonA, INPUT);
    aw9523->pinMode(ButtonB, INPUT);
    aw9523->pinMode(JoyStickUp, INPUT);
    aw9523->pinMode(JoyStickDown, INPUT);
    aw9523->pinMode(JoyStickLeft, INPUT);
    aw9523->pinMode(JoyStickRight, INPUT);
    aw9523->pinMode(JoyStickMiddle, INPUT);

}

bool WeJoyandKey::_readPin(uint8_t pin) {
    Adafruit_AW9523* aw9523 = AW9523Manager::getInstance().getDevice();
    return aw9523->digitalRead(pin) == LOW;
}

bool WeJoyandKey::isPressed(WeJoyandKeyPin pin) {
    return _readPin(static_cast<uint8_t>(pin));
}