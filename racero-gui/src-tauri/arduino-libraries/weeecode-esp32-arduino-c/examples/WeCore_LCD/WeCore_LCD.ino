#include "WeCoLCD.h"

// 创建 WeCoLCD 对象，假设使用端口 0
WeCoLCD lcd;

void setup() {
  // 初始化 LCD
  lcd.begin();

  // 设置文本大小和颜色
  lcd.setTextSize(2);
  lcd.setTextColor(lcd.color565(255, 255, 255));

  // 设置光标位置并打印文本
  lcd.setCursor(10, 10);
  lcd.print("Hello, World!");

  // 绘制一个矩形
  lcd.rect(20, 40, 100, 50, lcd.color565(0, 255, 0));

  // 填充一个圆形
  lcd.fill_circle(180, 70, 30, lcd.color565(255, 0, 0));
}

void loop() {
  // 这里可以添加循环代码，例如动态更新显示内容
  delay(1000);
}