/**
 * ELF ESP32 dual-PWM motor (IN1/IN2).
 * Port silk (uji board):
 *   M1 = GPIO19 + GPIO21
 *   M2 = GPIO16 + GPIO17
 * (Blok yang kirim 16/17 menggerakkan terminal M2 — jangan ditukar lagi.)
 */
#ifndef WeELF_ESP32_MOTOR_H
#define WeELF_ESP32_MOTOR_H

#include <Arduino.h>

#define WE_ELF_M1_IN1 19
#define WE_ELF_M1_IN2 21
#define WE_ELF_M2_IN1 16
#define WE_ELF_M2_IN2 17
#define WE_ELF_M2_REVERSE false

#define WE_ELF_PWM_FREQ 20000
#define WE_ELF_PWM_BITS 8
/** Duty minimum agar motor berputar (bukan hanya getar). */
#define WE_ELF_MIN_DUTY 40
/** Cap duty — terlalu tinggi bikin lampu F menyala keras + drop tegangan. */
#define WE_ELF_MAX_DUTY_SINGLE 180
/**
 * Anggaran persen gabungan M1+M2.
 * 100+100 → masing-masing ~40 (total 80).
 */
#define WE_ELF_DUAL_PERCENT_BUDGET 80
/** Soft-start singkat (hanya saat start dari diam / lonjakan besar). */
#define WE_ELF_SOFT_STEPS 4
#define WE_ELF_SOFT_STEP_US 2000
#define WE_ELF_SOFT_JUMP 40

/**
 * Firmata SysEx motor dual: [pin1][pin2][speed+100 low7][speed+100 high7]
 * JANGAN 0x6D (PIN_STATE_QUERY Firmata).
 */
#define WE_ELF_FIRMATA_MOTOR_DUAL 0x63

class WeELFMotor {
public:
    WeELFMotor(uint8_t in1, uint8_t in2, bool reverse = false)
        : _in1(in1), _in2(in2), _reverse(reverse), _ready(false),
          _lastDuty(0), _lastSign(0) {}

    void begin() {
        if (_ready) {
            return;
        }
        attachPwm(_in1);
        attachPwm(_in2);
        _ready = true;
        stopImmediate();
    }

    /** percent -100..100 → LEDC duty (sudah di-scale oleh WeELF_driveByPins). */
    void runPercent(int percent) {
        if (percent > 100) {
            percent = 100;
        }
        if (percent < -100) {
            percent = -100;
        }
        run(percent * WE_ELF_MAX_DUTY_SINGLE / 100);
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

        // Speed 0 = stop langsung. Jangan debounce.
        if (speed == 0) {
            stopImmediate();
            return;
        }

        int8_t sign = speed > 0 ? 1 : -1;
        int duty = speed > 0 ? speed : -speed;
        if (duty < WE_ELF_MIN_DUTY) {
            duty = WE_ELF_MIN_DUTY;
        }
        if (duty > WE_ELF_MAX_DUTY_SINGLE) {
            duty = WE_ELF_MAX_DUTY_SINGLE;
        }

        // Skip kalau sama (hindari soft-start ulang tiap tick forever).
        if (_lastSign == sign && _lastDuty == duty) {
            return;
        }

        // Ganti arah: coast sebentar (jangan brake keras = arus besar / F terang).
        if (_lastSign != 0 && sign != _lastSign) {
            writePwm(_in1, 0);
            writePwm(_in2, 0);
            _lastDuty = 0;
            _lastSign = 0;
            delayMicroseconds(500);
        }

        const bool needRamp =
            (_lastSign != sign) ||
            (_lastDuty == 0) ||
            (duty > _lastDuty + WE_ELF_SOFT_JUMP);

        if (needRamp) {
            int start = (_lastSign == sign) ? _lastDuty : 0;
            if (start > 0 && start < WE_ELF_MIN_DUTY) {
                start = WE_ELF_MIN_DUTY;
            }
            if (start > duty) {
                start = duty;
            }
            // Jangan mulai ramp dari MIN kalau target kecil — hindari lonjakan.
            if (start == 0) {
                start = duty < WE_ELF_MIN_DUTY ? duty : (duty / 3);
                if (start < 1) {
                    start = 1;
                }
            }
            for (int s = 1; s <= WE_ELF_SOFT_STEPS; s++) {
                int d = start + ((duty - start) * s) / WE_ELF_SOFT_STEPS;
                applyDrive(sign, d);
                delayMicroseconds(WE_ELF_SOFT_STEP_US);
            }
        } else {
            applyDrive(sign, duty);
        }

        _lastDuty = duty;
        _lastSign = sign;
    }

    void stop() {
        stopImmediate();
    }

private:
    void applyDrive(int8_t sign, int duty) {
        // Satu sisi PWM, sisi lain wajib 0 — cegah shoot-through / F terang.
        if (sign > 0) {
            writePwm(_in2, 0);
            writePwm(_in1, duty);
        } else {
            writePwm(_in1, 0);
            writePwm(_in2, duty);
        }
    }

    void stopImmediate() {
        writePwm(_in1, 0);
        writePwm(_in2, 0);
        _lastDuty = 0;
        _lastSign = 0;
    }

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
        if (duty < 0) {
            duty = 0;
        }
        if (duty > 255) {
            duty = 255;
        }
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
    int _lastDuty;
    int8_t _lastSign;
};

inline WeELFMotor &WeELF_motor1() {
    static WeELFMotor m1(WE_ELF_M1_IN1, WE_ELF_M1_IN2);
    return m1;
}

inline WeELFMotor &WeELF_motor2() {
    static WeELFMotor m2(WE_ELF_M2_IN1, WE_ELF_M2_IN2, WE_ELF_M2_REVERSE);
    return m2;
}

inline void WeELF_beginMotors() {
    WeELF_motor1().begin();
    WeELF_motor2().begin();
}

/**
 * Update permintaan M1/M2, bagi daya kalau keduanya hidup.
 * Hanya apply motor yang out-nya berubah (0 selalu langsung stop).
 */
inline void WeELF_driveByPins(uint8_t in1, uint8_t in2, int speedPct) {
    static int req1 = 0;
    static int req2 = 0;
    static int applied1 = 0;
    static int applied2 = 0;

    if (speedPct > 100) {
        speedPct = 100;
    }
    if (speedPct < -100) {
        speedPct = -100;
    }

    const bool isM1 = (in1 == WE_ELF_M1_IN1 && in2 == WE_ELF_M1_IN2);
    const bool isM2 = (in1 == WE_ELF_M2_IN1 && in2 == WE_ELF_M2_IN2);

    if (isM1) {
        req1 = speedPct;
    } else if (isM2) {
        req2 = speedPct;
    } else {
        WeELFMotor tmp(in1, in2);
        tmp.runPercent(speedPct);
        return;
    }

    int a = req1 >= 0 ? req1 : -req1;
    int b = req2 >= 0 ? req2 : -req2;
    int out1 = req1;
    int out2 = req2;

    if (a > 0 && b > 0) {
        int sum = a + b;
        if (sum > WE_ELF_DUAL_PERCENT_BUDGET) {
            out1 = (req1 * WE_ELF_DUAL_PERCENT_BUDGET) / sum;
            out2 = (req2 * WE_ELF_DUAL_PERCENT_BUDGET) / sum;
        }
    }

    if (out1 != applied1) {
        WeELF_motor1().runPercent(out1);
        applied1 = out1;
    }
    if (out2 != applied2) {
        WeELF_motor2().runPercent(out2);
        applied2 = out2;
    }
}

#endif
