#include <WeWirelessRadio.h>

WeWirelessRadio radio;

void setup() {
  Serial.begin(115200);
  if (!radio.begin(5)) { // 初始化 ESP-NOW 并设置通信频道为0
    Serial.println("Failed to initialize ESP-NOW");
    return;
  }
  Serial.println("ESP-NOW initialized successfully");
}

void loop() {
  radio.sendChar("name", "alex"); // 发送字符
  radio.sendNumber("ager", 100); // 发送数字
  radio.sendNumber("age", 25); // 发送数字
  radio.sendNumber("printf", 0); // 发送数字
  delay(1000);
}