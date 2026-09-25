/**
 * Tes penggerak motor ELF ESP32, tanpa WiFi.
 *
 * Sengaja tidak meng-include WeELFESP32Motor.h supaya bisa langsung di-paste
 * ke Arduino IDE tanpa memasang library Garudabot lebih dulu. Nomor pin di
 * bawah harus sama dengan yang ada di WeELFESP32Motor.h.
 *
 * Empat fase diuji berurutan pada M1, masing-masing dilaporkan ke Serial
 * Monitor (115200). Amati roda di tiap fase:
 *
 *   1-2. DC PENUH maju/mundur — tanpa PWM sama sekali, tegangan penuh.
 *        Kalau di sini pun tidak berputar, masalahnya bukan di kode:
 *        baterai lemah, saklar motor off, atau poros macet secara mekanis.
 *        Kalau berputar, berarti pin dan daya sudah benar dan sisa
 *        masalahnya murni soal PWM.
 *
 *   3.   PWM 1 kHz — frekuensi bawaan analogWrite, masuk rentang dengar
 *        manusia sehingga sering terdengar mendengung.
 *
 *   4.   PWM 20 kHz — di atas batas pendengaran. Kalau fase 3 hanya
 *        mendengung tapi fase 4 berputar, ganti frekuensi PWM di library.
 */
#include <Arduino.h>

// Port M1 = GPIO19 / GPIO21. Untuk M2: IN1=16, IN2=17.
const int IN1 = 19;
const int IN2 = 21;
const int SPEED = 200;

void bebas() {
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);
  delay(1500);
}

void setup() {
  Serial.begin(115200);
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  Serial.println();
  Serial.print("Menguji M1 pada IN1=GPIO");
  Serial.print(IN1);
  Serial.print(" IN2=GPIO");
  Serial.println(IN2);
}

void loop() {
  Serial.println("1. DC PENUH maju (tanpa PWM)");
  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, LOW);
  delay(2000);
  bebas();

  Serial.println("2. DC PENUH mundur (tanpa PWM)");
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, HIGH);
  delay(2000);
  bebas();

  Serial.println("3. PWM 1 kHz (bawaan analogWrite)");
  analogWriteFrequency(IN1, 1000);
  digitalWrite(IN2, LOW);
  analogWrite(IN1, SPEED);
  delay(2000);
  analogWrite(IN1, 0);
  bebas();

  Serial.println("4. PWM 20 kHz (di atas ambang dengar)");
  analogWriteFrequency(IN1, 20000);
  digitalWrite(IN2, LOW);
  analogWrite(IN1, SPEED);
  delay(2000);
  analogWrite(IN1, 0);
  bebas();
}
