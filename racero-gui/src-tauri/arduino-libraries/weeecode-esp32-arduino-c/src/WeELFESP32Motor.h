/**
 * ELF ESP32 (bukan Mini/Pro) — driver motor dual-PWM (IN1/IN2).
 * Firmware WeeeCode MicroPython memakai dcmotor.DCMotor(pwm1, pwm2),
 * bukan DIR+PWM ala WeESP32Mini.
 *
 * Pin internal M1/M2 (tidak di-breakout ke port sensor):
 *   M1: GPIO23 + GPIO22
 *   M2: GPIO21 + GPIO19
 */
#ifndef WeELF_ESP32_MOTOR_H
#define WeELF_ESP32_MOTOR_H

#include <Arduino.h>

#define WE_ELF_M1_IN1 23
#define WE_ELF_M1_IN2 22
#define WE_ELF_M2_IN1 21
#define WE_ELF_M2_IN2 19

class WeELFMotor {
public:
    WeELFMotor(uint8_t in1, uint8_t in2)
        : _in1(in1), _in2(in2), _ready(false) {}

    void begin() {
        pinMode(_in1, OUTPUT);
        pinMode(_in2, OUTPUT);
        stop();
        _ready = true;
    }

    void run(int speed) {
        if (!_ready) {
            begin();
        }
        if (speed > 255) {
            speed = 255;
        }
        if (speed < -255) {
            speed = -255;
        }

        if (speed > 0) {
            analogWrite(_in1, speed);
            digitalWrite(_in2, LOW);
            analogWrite(_in2, 0);
        } else if (speed < 0) {
            digitalWrite(_in1, LOW);
            analogWrite(_in1, 0);
            analogWrite(_in2, -speed);
        } else {
            stop();
        }
    }

    void stop() {
        digitalWrite(_in1, LOW);
        digitalWrite(_in2, LOW);
        analogWrite(_in1, 0);
        analogWrite(_in2, 0);
    }

private:
    uint8_t _in1;
    uint8_t _in2;
    bool _ready;
};

#endif
