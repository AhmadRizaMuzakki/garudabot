#include <Wire.h>
#include <AW9523Manager.h>
#include <WeESP32Mini.h>

Adafruit_AW9523 aw;

// 定义按键引脚数组
const uint8_t buttonPins[] = {0, 1, 2, 3, 4, 5, 6, 7, 8};
const int numButtons = sizeof(buttonPins) / sizeof(buttonPins[0]);

void setup() {
  Serial.begin(115200);
  Wire.begin(33, 17);  // SDA=25, SCL=18
  
  if (!aw.begin()) {
    Serial.println("AW9523 not found? Check wiring!");
    while (1) delay(10);
  }
  
  Serial.println("AW9523 found!");
  
  // 设置所有按键引脚为输入模式
  for (int i = 0; i < numButtons; i++) {
    aw.pinMode(buttonPins[i], INPUT);
  }
}

void loop() {
  // 读取所有按键状态
    if (aw.digitalRead(buttonPins[2]) == HIGH) {
      Serial.print("Button ");
      Serial.print(2);
      Serial.println(" is pressed!");
    }
  
  delay(100); // 简单的消抖延时
} 