#ifndef WEGYROSCOPE_H
#define WEGYROSCOPE_H

#include "Arduino.h"
#include "Adafruit_Library/Adafruit_MPU6050.h"
#include "Adafruit_Library/Adafruit_Sensor.h"
#include <Wire.h>

class WeGyroscope {
public:
    WeGyroscope();
    bool begin();
    void reset();
    float getZAngleIncrement();
    
    // 获取倾斜角(度)
    float getTiltAngleX();
    float getTiltAngleY();
    float getTiltAngleZ();
    
    // 获取角速度(度/秒)
    float getGyroX();
    float getGyroY();
    float getGyroZ();
    
    // 获取加速度(g)
    float getAccelX();
    float getAccelY();
    float getAccelZ();

private:
    Adafruit_MPU6050 mpu;
    float lastZAngle;
    unsigned long lastTime;
};

#endif