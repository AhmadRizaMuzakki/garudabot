/**
 * ELF ESP32 dual-PWM motor (IN1/IN2). Pin map dari board fisik ELF (bukan Mini/Pro).
 * +speed = maju; M2 pakai reverse karena wiring fisik terbalik.
 */
#ifndef WeELF_ESP32_MOTOR_H
#define WeELF_ESP32_MOTOR_H

#include <Arduino.h>

#define WE_ELF_M1_IN1 21
#define WE_ELF_M1_IN2 19
#define WE_ELF_M2_IN1 16
#define WE_ELF_M2_IN2 17
#define WE_ELF_M2_REVERSE true

#define WE_ELF_PWM_FREQ 20000
#define WE_ELF_PWM_BITS 8
/** Duty minimum agar motor benar-benar berputar (bukan hanya getar). */
#define WE_ELF_MIN_DUTY 60
/**
 * Firmata SysEx motor dual: [pin1][pin2][speed+100 low7][speed+100 high7]
 * Harus di rentang user 0x60–0x68 — JANGAN 0x6D (itu PIN_STATE_QUERY Firmata).
 */
#define WE_ELF_FIRMATA_MOTOR_DUAL 0x63

class WeELFMotor {
public:
    WeELFMotor(uint8_t in1, uint8_t in2, bool reverse = false)
        : _in1(in1), _in2(in2), _reverse(reverse), _ready(false) {}

    void begin() {
        if (_ready) {
            return;
        }
        attachPwm(_in1);
        attachPwm(_in2);
        _ready = true;
        stop();
    }

    /** percent -100..100 → LEDC duty 0..255 (bukan nilai mentah percent). */
    void runPercent(int percent) {
        if (percent > 100) {
            percent = 100;
        }
        if (percent < -100) {
            percent = -100;
        }
        run(percent * 255 / 100);
    }

    void run(int speed) {
        begin();
        if (_reverse) {
            speed = -speed;
        }
        if (speed > 255) {
            speed = 255;
        }
        if (speed < -255) {
            speed = -255;
        }

        if (speed == 0) {
            stop();
            return;
        }

        int duty = speed > 0 ? speed : -speed;
        if (duty < WE_ELF_MIN_DUTY) {
            duty = WE_ELF_MIN_DUTY;
        }

        if (speed > 0) {
            writePwm(_in2, 0);
            writePwm(_in1, duty);
        } else {
            writePwm(_in1, 0);
            writePwm(_in2, duty);
        }
    }

    void stop() {
        writePwm(_in1, 0);
        writePwm(_in2, 0);
    }

private:
    // ESP32 core 3.x: jangan campur digitalWrite + LEDC pada pin yang sama.
    static void attachPwm(uint8_t pin) {
        pinMode(pin, OUTPUT);
        digitalWrite(pin, LOW);
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
        ledcAttach(pin, WE_ELF_PWM_FREQ, WE_ELF_PWM_BITS);
#else
        analogWriteFrequency(WE_ELF_PWM_FREQ);
        analogWriteResolution(WE_ELF_PWM_BITS);
#endif
    }

    static void writePwm(uint8_t pin, int duty) {
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
        ledcWrite(pin, duty);
#else
        analogWrite(pin, duty);
#endif
    }

    uint8_t _in1;
    uint8_t _in2;
    bool _reverse;
    bool _ready;
};

/**
 * Live/Firmata: route M1/M2 ke instance tetap; pin lain → WeELFMotor sementara.
 * Satu implementasi untuk BLE OTA + StandardFirmata.
 */
inline void WeELF_driveByPins(uint8_t in1, uint8_t in2, int speedPct) {
    static WeELFMotor m1(WE_ELF_M1_IN1, WE_ELF_M1_IN2);
    static WeELFMotor m2(WE_ELF_M2_IN1, WE_ELF_M2_IN2, WE_ELF_M2_REVERSE);

    if (speedPct > 100) {
        speedPct = 100;
    }
    if (speedPct < -100) {
        speedPct = -100;
    }

    if (in1 == WE_ELF_M1_IN1 && in2 == WE_ELF_M1_IN2) {
        m1.runPercent(speedPct);
        return;
    }
    if (in1 == WE_ELF_M2_IN1 && in2 == WE_ELF_M2_IN2) {
        m2.runPercent(speedPct);
        return;
    }

    WeELFMotor tmp(in1, in2);
    tmp.runPercent(speedPct);
}

#endif
