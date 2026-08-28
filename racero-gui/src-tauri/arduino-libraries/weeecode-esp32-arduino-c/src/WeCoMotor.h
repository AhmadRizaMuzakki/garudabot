#ifndef WECOMOTOR_H
#define WECOMOTOR_H

#include <Wire.h>
#include <Arduino.h>  // 添加这行

class WeCoMotor{
    public:
        WeCoMotor();
        bool begin();
        void run(uint8_t port,int speed);
        void stop(uint8_t port);
        void runs(uint8_t speed1, uint8_t speed2);
    private:
        uint8_t MArary[4];
};

#endif
