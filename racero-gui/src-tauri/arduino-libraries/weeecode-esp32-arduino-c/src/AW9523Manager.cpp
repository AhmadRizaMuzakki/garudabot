#ifdef ESP32
#include "AW9523Manager.h"
#include <Wire.h>

bool AW9523Manager::begin() {
    if (isInitialized) {
        return true;  // 如果已经初始化，则直接返回
    }

    Wire.begin(22,21);
    if (!aw9523.begin()) {
        return false;
    }

    isInitialized = true;
    return true;
}

Adafruit_AW9523* AW9523Manager::getDevice() {
    return &aw9523;
}
#endif
