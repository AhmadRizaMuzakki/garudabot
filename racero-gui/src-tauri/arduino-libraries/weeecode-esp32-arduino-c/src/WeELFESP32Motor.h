/**
 * ELF ESP32 (bukan Mini/Pro) — driver motor dual-PWM (IN1/IN2).
 *
 * Tata letak pinnya berbeda dari WeESP32Mini maupun WeESP32Pro, jadi jangan
 * disalin dari kedua header itu. Angka di bawah didapat dari penyapuan GPIO
 * satu per satu pada board fisik:
 *   M1 (roda kiri) : GPIO21 + GPIO19
 *   M2 (roda kanan): GPIO17 + GPIO16
 */
#ifndef WeELF_ESP32_MOTOR_H
#define WeELF_ESP32_MOTOR_H

#include <Arduino.h>

#define WE_ELF_M1_IN1 21
#define WE_ELF_M1_IN2 19
#define WE_ELF_M2_IN1 17
#define WE_ELF_M2_IN2 16

// 20 kHz berada di atas ambang pendengaran, jadi motor tidak mendengung seperti
// pada 1 kHz bawaan analogWrite.
#define WE_ELF_PWM_FREQ 20000
#define WE_ELF_PWM_BITS 8

// Di bawah nilai ini motor umumnya hanya bergetar tanpa berputar, sehingga speed
// kecil dinaikkan ke ambang ini agar perintah tetap terasa.
#define WE_ELF_MIN_DUTY 60

class WeELFMotor {
public:
    WeELFMotor(uint8_t in1, uint8_t in2)
        : _in1(in1), _in2(in2), _ready(false) {}

    void begin() {
        if (_ready) {
            return;
        }
        attachPwm(_in1);
        attachPwm(_in2);
        _ready = true;
        stop();
    }

    // Blok "dc motor" memakai skala persen (-100..100), sementara LEDC memakai
    // duty 0..255. Tanpa konversi ini speed 100 hanya menghasilkan 39% duty dan
    // roda sering tidak kuat berputar.
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
    // Mencampur analogWrite() dan digitalWrite() pada pin yang sama tidak andal di
    // ESP32 core 3.x, jadi kedua pin dikunci sebagai kanal LEDC sejak begin().
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
    bool _ready;
};

#endif
