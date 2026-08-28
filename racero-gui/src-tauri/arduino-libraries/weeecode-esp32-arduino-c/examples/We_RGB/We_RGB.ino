
//ESP32
#include "WeESP32Pro.h"

// 初始化WeRGBLed对象,
WeRGBLed weRGBLED(1,OnBoard_RGB);

void setup() {
    weRGBLED.begin(); // 初始化LED
}

void loop() {
    // 设置第一个LED为红色
    weRGBLED.setColor(0,255, 0, 0);
    weRGBLED.show();

    delay(1000); // 等待1秒

    // 设置第一个LED为绿色
    weRGBLED.setColor(0,0, 255, 0);
    weRGBLED.show();

    delay(1000); // 等待1秒

    // 设置第一个LED为蓝色
    weRGBLED.setColor(0,128,34, 255);
    weRGBLED.show();

    delay(1000); // 等待1秒
}
//Arduino

// #include"WeELF328P.h"

// WeRGBLed rgb_led_board(OnBoard_RGB);

// void setup(){
// }

// void loop(){
// 	rgb_led_board.setColor(1, 255, 0, 0);
// 	rgb_led_board.show();
// 	delay(1000);
// 	rgb_led_board.setColor(1, 0, 255, 0);
// 	rgb_led_board.show();
// 	delay(1000);
// 	rgb_led_board.setColor(1, 0, 0, 255);
// 	rgb_led_board.show();
// 	delay(1000);
// }