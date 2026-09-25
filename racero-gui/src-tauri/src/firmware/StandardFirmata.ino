#include <Firmata.h>
#include <Wire.h>

// --- Architecture-Safe Servo ---
#ifndef MAX_SERVOS
#define MAX_SERVOS 12
#endif

#if defined(ESP32)
  #include <ESP32Servo.h>
  #include <GarudabotBleOta.h>
  #define ESP32_LIVE_PWM_FREQ 20000
  #define ESP32_LIVE_PWM_BITS 8
  #define MOTOR_DUAL 0x63
  // Port M1 = 19/21, port M2 = 16/17 (uji: 16/17 = terminal M2).
  #define ELF_M1_IN1 19
  #define ELF_M1_IN2 21
  #define ELF_M2_IN1 16
  #define ELF_M2_IN2 17
  #define ELF_MOTOR_MAX_DUTY 220

  static bool elfPwmOn[40] = {false};

  static void esp32PwmAttach(byte pin) {
      if (pin >= 40) return;
      pinMode(pin, OUTPUT);
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
      if (elfPwmOn[pin]) {
          ledcDetach(pin);
      }
      ledcAttach(pin, ESP32_LIVE_PWM_FREQ, ESP32_LIVE_PWM_BITS);
#else
      analogWriteFrequency(ESP32_LIVE_PWM_FREQ);
      analogWriteResolution(ESP32_LIVE_PWM_BITS);
#endif
      elfPwmOn[pin] = true;
  }

  static void esp32PwmWrite(byte pin, int value) {
      if (value < 0) value = 0;
      if (value > 255) value = 255;
      esp32PwmAttach(pin);
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
      ledcWrite(pin, value);
#else
      analogWrite(pin, value);
#endif
  }

  static void esp32MotorIdle(byte pin) {
      if (pin >= 40) return;
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
      if (elfPwmOn[pin]) {
          ledcWrite(pin, 0);
          ledcDetach(pin);
          elfPwmOn[pin] = false;
      }
#endif
      pinMode(pin, OUTPUT);
      digitalWrite(pin, LOW);
  }

  static void esp32MotorDrive(byte pin, int duty) {
      if (duty >= 250) {
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
          if (elfPwmOn[pin]) {
              ledcDetach(pin);
              elfPwmOn[pin] = false;
          }
#endif
          pinMode(pin, OUTPUT);
          digitalWrite(pin, HIGH);
          return;
      }
      esp32PwmWrite(pin, duty);
  }

  /** Motor dual-PWM (tanpa WeELFESP32Motor). */
  static void esp32MotorDual(uint8_t in1, uint8_t in2, int speedPct) {
      if (speedPct > 100) speedPct = 100;
      if (speedPct < -100) speedPct = -100;
      if (speedPct == 0) {
          esp32MotorIdle(in1);
          esp32MotorIdle(in2);
          return;
      }
      int mag = speedPct < 0 ? -speedPct : speedPct;
      int duty = (mag * ELF_MOTOR_MAX_DUTY) / 100;
      if (duty < 40) duty = 40;
      if (duty > 255) duty = 255;
      if (speedPct > 0) {
          esp32MotorIdle(in2);
          esp32MotorDrive(in1, duty);
      } else {
          esp32MotorIdle(in1);
          esp32MotorDrive(in2, duty);
      }
  }
#else
  #include <Servo.h>
#endif

// --- Display Includes ---
#include "SSD1306Ascii.h"
#include "SSD1306AsciiWire.h"
SSD1306AsciiWire oled;

#include <LiquidCrystal_I2C.h>
LiquidCrystal_I2C lcd(0x27, 16, 2);

// --- Servo State ---
Servo servos[MAX_SERVOS];
byte servoPinMap[TOTAL_PINS];
byte servoCount = 0;

// --- Protocol Constants (safe user range: 0x60–0x68; 0x69+ reserved Firmata) ---
// DISPLAY_INIT 0x60, ULTRASONIC 0x61, TONE 0x62, MOTOR_DUAL 0x63
// JANGAN 0x6D — itu PIN_STATE_QUERY → duplicate case value.
#define DISPLAY_INIT        0x60
#define ULTRASONIC_READ     0x61
#define TONE_PLAY           0x62

#define DISPLAY_KIND_LCD    0x0
#define DISPLAY_KIND_OLED   0x1

#define DISPLAY_OP_WRITE      0x0
#define DISPLAY_OP_CLEAR      0x1
#define DISPLAY_OP_SET_CURSOR 0x2

#define STRING_USAGE_LCD    0x1
#define STRING_USAGE_OLED   0x2

unsigned long currentMillis;
unsigned long previousMillis;
unsigned int samplingInterval = 19;

// ==============================================================
// HELPERS
// ==============================================================

void attachServo(byte pin, int minPulse, int maxPulse) {
    if (servoCount < MAX_SERVOS) {
        servoPinMap[pin] = servoCount;
        if (minPulse > 0 && maxPulse > 0) {
            servos[servoCount].attach(pin, minPulse, maxPulse);
        } else {
            servos[servoCount].attach(pin);
        }
        servoCount++;
    }
}

// ==============================================================
// CALLBACKS
// ==============================================================

void setPinModeCallback(byte pin, int mode) {
    if (mode == PIN_MODE_SERVO) {
        Firmata.setPinMode(pin, PIN_MODE_SERVO);
        if (servoPinMap[pin] == 255) attachServo(pin, 0, 0);
    }
    else if (mode == PIN_MODE_PWM) {
        Firmata.setPinMode(pin, PIN_MODE_PWM);
#if defined(ESP32)
        esp32PwmAttach(pin);
        esp32PwmWrite(pin, 0);
#else
        pinMode(pin, OUTPUT);
        analogWrite(pin, 0);
#endif
        Firmata.setPinState(pin, 0);
    }
    else if (mode == PIN_MODE_OUTPUT) {
        Firmata.setPinMode(pin, PIN_MODE_OUTPUT);
        pinMode(pin, OUTPUT);
    }
    else if (mode == PIN_MODE_INPUT) {
        Firmata.setPinMode(pin, PIN_MODE_INPUT);
        pinMode(pin, INPUT);
    }
    else if (mode == PIN_MODE_PULLUP) {
        Firmata.setPinMode(pin, PIN_MODE_PULLUP);
        pinMode(pin, INPUT_PULLUP);
    }
}

void digitalWriteCallback(byte port, int value) {
    byte pin = port * 8;
    for (byte i = 0; i < 8; i++, pin++) {
        if (pin < TOTAL_PINS && Firmata.getPinMode(pin) == PIN_MODE_OUTPUT) {
            byte pinValue = (value >> i) & 0x01;
            digitalWrite(pin, pinValue);
            Firmata.setPinState(pin, pinValue);
        }
    }
}

void analogWriteCallback(byte pin, int value) {
    if (pin < TOTAL_PINS) {
        switch (Firmata.getPinMode(pin)) {
            case PIN_MODE_SERVO:
                if (servoPinMap[pin] < MAX_SERVOS) {
                    servos[servoPinMap[pin]].write(value);
                    Firmata.setPinState(pin, value);
                }
                break;
            case PIN_MODE_PWM:
#if defined(ESP32)
                esp32PwmWrite(pin, value);
#else
                analogWrite(pin, value);
#endif
                Firmata.setPinState(pin, value);
                break;
        }
    }
}

void sysexCallback(byte command, byte argc, byte *argv) {
    switch (command) {
		case CAPABILITY_QUERY:
            Firmata.write(START_SYSEX);
            Firmata.write(CAPABILITY_RESPONSE);
            for (byte pin = 0; pin < TOTAL_PINS; pin++) {
                if (IS_PIN_DIGITAL(pin)) {
                    Firmata.write((byte)PIN_MODE_INPUT);
                    Firmata.write(1);
                    Firmata.write((byte)PIN_MODE_PULLUP);
                    Firmata.write(1);
                    Firmata.write((byte)PIN_MODE_OUTPUT);
                    Firmata.write(1);
                }
                if (IS_PIN_ANALOG(pin)) {
                    Firmata.write(PIN_MODE_ANALOG);
                    Firmata.write(10); // 10-bit resolution
                }
                // ESP32: LEDC PWM di GPIO digital (motor ELF M1=19/21, M2=16/17).
                // Boards.h sering tidak menandai pin >15 sebagai IS_PIN_PWM.
                if (IS_PIN_PWM(pin)
#if defined(ESP32)
                    || IS_PIN_DIGITAL(pin)
#endif
                ) {
                    Firmata.write(PIN_MODE_PWM);
                    Firmata.write(8); // 8-bit resolution
                }
                if (IS_PIN_SERVO(pin)
#if defined(ESP32)
                    || IS_PIN_DIGITAL(pin)
#endif
                ) {
                    Firmata.write(PIN_MODE_SERVO);
                    Firmata.write(14); // 14-bit resolution
                }
                if (IS_PIN_I2C(pin)) {
                    Firmata.write(PIN_MODE_I2C);
                    Firmata.write(1);
                }
                Firmata.write(127); // End of pin capabilities
            }
            Firmata.write(END_SYSEX);
            break;

        case ANALOG_MAPPING_QUERY:
            Firmata.write(START_SYSEX);
            Firmata.write(ANALOG_MAPPING_RESPONSE);
            for (byte pin = 0; pin < TOTAL_PINS; pin++) {
                Firmata.write(IS_PIN_ANALOG(pin) ? PIN_TO_ANALOG(pin) : 127);
            }
            Firmata.write(END_SYSEX);
            break;

        case PIN_STATE_QUERY:
            if (argc > 0) {
                byte pin = argv[0];
                Firmata.write(START_SYSEX);
                Firmata.write(PIN_STATE_RESPONSE);
                Firmata.write(pin);
                if (pin < TOTAL_PINS) {
                    Firmata.write((byte)Firmata.getPinMode(pin));
                    Firmata.write((byte)Firmata.getPinState(pin) & 0x7F);
                    if (Firmata.getPinState(pin) & 0xFF80) {
                        Firmata.write((byte)(Firmata.getPinState(pin) >> 7) & 0x7F);
                    }
                    if (Firmata.getPinState(pin) & 0xC000) {
                        Firmata.write((byte)(Firmata.getPinState(pin) >> 14) & 0x7F);
                    }
                }
                Firmata.write(END_SYSEX);
			} break;
        case DISPLAY_INIT:
            if (argc >= 2) {
                byte kind    = argv[0] & 0x01;       // fixed: separate kind from address
                byte address = (argv[0] >> 1) | (argv[1] << 6);
                if (kind == DISPLAY_KIND_LCD) {
                    lcd = LiquidCrystal_I2C(address, 16, 2);
                    lcd.init();
                    lcd.backlight();
                    lcd.clear();
                    lcd.setCursor(0, 0);
                } else {
                    oled.begin(&Adafruit128x64, address);
                    delay(50);
                    oled.setFont(Adafruit5x7);
                    oled.clear();
                    oled.setCursor(0, 0);
                }
            }
            break;

        case ULTRASONIC_READ:
            if (argc >= 4) {
                byte trig = (argv[0] & 0x7F) | (argv[1] << 7);
                byte echo = (argv[2] & 0x7F) | (argv[3] << 7);

                pinMode(trig, OUTPUT);
                pinMode(echo, INPUT);
                digitalWrite(trig, LOW);
                delayMicroseconds(2);
                digitalWrite(trig, HIGH);
                delayMicroseconds(10);
                digitalWrite(trig, LOW);

                unsigned long t = pulseIn(echo, HIGH, 30000);
                float d = t * 0.034 / 2.0;
                int n = (int)d;
                int f = (int)((d - n) * 100.0);

                byte replyData[4];
                replyData[0] = n & 0x7F;
                replyData[1] = (n >> 7) & 0x7F;
                replyData[2] = f & 0x7F;
                replyData[3] = (f >> 7) & 0x7F;
                Firmata.sendSysex(ULTRASONIC_READ, 4, replyData);
            }
            break;

        case TONE_PLAY:
            if (argc >= 2) {
                byte toneCommand = argv[0];
                byte pin = argv[1];
                if (toneCommand == 0x00 && argc >= 6) {
                    unsigned int frequency = (argv[2] & 0x7F) | (argv[3] << 7);
                    unsigned int duration  = (argv[4] & 0x7F) | (argv[5] << 7);
                    if (duration > 0) tone(pin, frequency, duration);
                    else tone(pin, frequency);
                } else if (toneCommand == 0x01) {
                    noTone(pin);
                }
            }
            break;

        case SERVO_CONFIG:
            if (argc > 4) {
                byte pin      = argv[0];
                int minPulse  = argv[1] + (argv[2] << 7);
                int maxPulse  = argv[3] + (argv[4] << 7);
                attachServo(pin, minPulse, maxPulse);
                Firmata.setPinMode(pin, PIN_MODE_SERVO);
            }
            break;

        case EXTENDED_ANALOG:
            // Pin PWM/servo > 15 (motor ELF 16/17/19/21) — ANALOG_MESSAGE biasa tidak cukup.
            if (argc > 1) {
                int val = argv[1];
                if (argc > 2) val |= (argv[2] << 7);
                if (argc > 3) val |= (argv[3] << 14);
                analogWriteCallback(argv[0], val);
            }
            break;

#if defined(ESP32)
        case MOTOR_DUAL:
            if (argc >= 4) {
                uint8_t in1 = argv[0];
                uint8_t in2 = argv[1];
                int encoded = (argv[2] & 0x7F) | ((argv[3] & 0x7F) << 7);
                esp32MotorDual(in1, in2, encoded - 100);
            }
            break;
#endif
    }
}

void stringDataCallback(char *payload) {
    byte usage     = (byte)payload[0];
    byte operation = (byte)payload[1];
    char *text     = payload + 2;   // fixed: consistent offset

    switch (usage) {
        case STRING_USAGE_LCD:
            switch (operation) {
                case DISPLAY_OP_WRITE:
                    lcd.print(text);        // fixed: print not println
                    break;
                case DISPLAY_OP_CLEAR:
                    lcd.clear();
                    break;
                case DISPLAY_OP_SET_CURSOR:
                    lcd.setCursor((byte)text[0], (byte)text[1]); // fixed: dereference not cast pointer
                    break;
            }
            break;

        case STRING_USAGE_OLED:
            switch (operation) {
                case DISPLAY_OP_WRITE:
                    oled.print(text);
                    break;
                case DISPLAY_OP_CLEAR:
                    oled.clear();
                    break;
                case DISPLAY_OP_SET_CURSOR:
                    oled.setCursor((byte)text[0], (byte)text[1]); // fixed: dereference not cast pointer
                    break;
            }
            break;
    }
}

void reportAnalogCallback(byte pin, int value) {
    if (value == 1 && pin < TOTAL_PINS) {
        Firmata.setPinMode(pin, PIN_MODE_ANALOG);
    }
}

void systemResetCallback() {
    for (byte i = 0; i < TOTAL_PINS; i++) {
        servoPinMap[i] = 255;
    }
    for (byte i = 0; i < servoCount; i++) {
        servos[i].detach();
    }
    servoCount = 0;
}

// ==============================================================
// SETUP & LOOP
// ==============================================================

void setup() {
    Firmata.setFirmwareVersion(FIRMATA_FIRMWARE_MAJOR_VERSION, FIRMATA_FIRMWARE_MINOR_VERSION);

    Firmata.attach(SET_PIN_MODE,    setPinModeCallback);
    Firmata.attach(DIGITAL_MESSAGE, digitalWriteCallback);
    Firmata.attach(ANALOG_MESSAGE,  analogWriteCallback);
    Firmata.attach(START_SYSEX,     sysexCallback);
    Firmata.attach(STRING_DATA,     stringDataCallback);
    Firmata.attach(REPORT_ANALOG,   reportAnalogCallback);
    Firmata.attach(SYSTEM_RESET,    systemResetCallback);

    Firmata.begin(57600);

    // Fixed: timeout so ESP32 doesn't hang without Serial monitor
    unsigned long serialTimeout = millis();
    while (!Serial && (millis() - serialTimeout) < 3000) { ; }

    systemResetCallback();

#if defined(ESP32)
    // BLE Live Mode: Nordic UART + CMD_LIVE_* (Serial Firmata tetap aktif di USB).
    GarudabotBleOta::begin("Garudabot", false);
#endif
}

void loop() {
    while (Firmata.available()) {
        Firmata.processInput();
    }

#if defined(ESP32)
    GarudabotBleOta::loop();
#endif

    currentMillis = millis();
    if (currentMillis - previousMillis > samplingInterval) {
        previousMillis += samplingInterval;

        // Manual analog reporting
        for (byte pin = 0; pin < TOTAL_PINS; pin++) {
            if (Firmata.getPinMode(pin) == PIN_MODE_ANALOG) {
                Firmata.sendAnalog(pin, analogRead(pin));
            }
        }

        // Manual digital reporting
        for (byte port = 0; port < TOTAL_PORTS; port++) {
            byte portValue = 0;
            for (byte bit = 0; bit < 8; bit++) {
                byte pin = port * 8 + bit;
                if (pin < TOTAL_PINS && Firmata.getPinMode(pin) == PIN_MODE_INPUT) {
                    if (digitalRead(pin)) portValue |= (1 << bit);
                }
            }
            Firmata.sendDigitalPort(port, portValue);
        }
    }
}