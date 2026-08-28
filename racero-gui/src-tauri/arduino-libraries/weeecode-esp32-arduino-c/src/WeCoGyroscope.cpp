#ifdef ESP32
#include "WeCoGyroscope.h"

WeGyroscope::WeGyroscope() {
    lastZAngle = 0;
    lastTime = 0;
}

bool WeGyroscope::begin() {
    Wire.begin(22, 21);
    
    if (!mpu.begin()) {
        return false;
    }

    // 配置传感器范围
    mpu.setAccelerometerRange(MPU6050_RANGE_2_G);
    mpu.setGyroRange(MPU6050_RANGE_250_DEG);
    mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
    
    reset();
    return true;
}

void WeGyroscope::reset() {
    lastZAngle = 0;
    lastTime = millis();
}

float WeGyroscope::getZAngleIncrement() {
    sensors_event_t a, g, temp;
    mpu.getEvent(&a, &g, &temp);
    
    unsigned long currentTime = millis();
    float dt = (currentTime - lastTime) / 1000.0;
    lastTime = currentTime;
    
    float zDelta = g.gyro.z * dt * RAD_TO_DEG;
    lastZAngle += zDelta;
    
    return zDelta;
}

float WeGyroscope::getTiltAngleX() {
    sensors_event_t a, g, temp;
    mpu.getEvent(&a, &g, &temp);
    return atan2(a.acceleration.y, sqrt(a.acceleration.x * a.acceleration.x + 
           a.acceleration.z * a.acceleration.z)) * RAD_TO_DEG;
}

float WeGyroscope::getTiltAngleY() {
    sensors_event_t a, g, temp;
    mpu.getEvent(&a, &g, &temp);
    return atan2(-a.acceleration.x, sqrt(a.acceleration.y * a.acceleration.y + 
           a.acceleration.z * a.acceleration.z)) * RAD_TO_DEG;
}

float WeGyroscope::getTiltAngleZ() {
    sensors_event_t a, g, temp;
    mpu.getEvent(&a, &g, &temp);
    return atan2(-a.acceleration.z, sqrt(a.acceleration.x * a.acceleration.x + 
        a.acceleration.y * a.acceleration.y)) * RAD_TO_DEG;
}

float WeGyroscope::getGyroX() {
    sensors_event_t a, g, temp;
    mpu.getEvent(&a, &g, &temp);
    return g.gyro.x * RAD_TO_DEG;
}

float WeGyroscope::getGyroY() {
    sensors_event_t a, g, temp;
    mpu.getEvent(&a, &g, &temp);
    return g.gyro.y * RAD_TO_DEG;
}

float WeGyroscope::getGyroZ() {
    sensors_event_t a, g, temp;
    mpu.getEvent(&a, &g, &temp);
    return g.gyro.z * RAD_TO_DEG;
}

float WeGyroscope::getAccelX() {
    sensors_event_t a, g, temp;
    mpu.getEvent(&a, &g, &temp);
    return a.acceleration.x / 9.80665;  // 转换为g
}

float WeGyroscope::getAccelY() {
    sensors_event_t a, g, temp;
    mpu.getEvent(&a, &g, &temp);
    return a.acceleration.y / 9.80665;
}

float WeGyroscope::getAccelZ() {
    sensors_event_t a, g, temp;
    mpu.getEvent(&a, &g, &temp);
    return a.acceleration.z / 9.80665;
}
#endif
