#ifndef WECO_LCD_H
#define WECO_LCD_H

#include "Adafruit_Library/Adafruit_GFX.h"
#include "Adafruit_Library/Adafruit_ST7789.h"
#include <SPI.h>
#include "cn_font24.h"  // 添加字库头文件
#include "Arduino.h"
#include "esp_task_wdt.h"  // 添加看门狗头文件


// 字库相关定义
#define FONT24_WIDTH 24
#define FONT24_HEIGHT 24
#define BYTES_PER_CHAR 72  // 24*24/8
#define CHARS_IN_FONT 7552  // 字库中的汉字数量

// 声明外部字库数据
extern const uint8_t cn_font24[];


class WeCoLCD {
public:
    WeCoLCD();
    void begin();
    
    // 基础功能
    void fill(uint16_t color);
    void rotation(uint8_t rotation);
    uint16_t color565(uint8_t r, uint8_t g, uint8_t b);
    // 绘图功能
    void pixel(int16_t x, int16_t y, uint16_t color);
    void line(int16_t x0, int16_t y0, int16_t x1, int16_t y1, uint16_t color);
    void hline(int16_t x, int16_t y, int16_t w, uint16_t color);
    void vline(int16_t x, int16_t y, int16_t h, uint16_t color);
    void rect(int16_t x, int16_t y, int16_t w, int16_t h, uint16_t color);
    void fill_rect(int16_t x, int16_t y, int16_t w, int16_t h, uint16_t color);
    void circle(int16_t x0, int16_t y0, int16_t r, uint16_t color);
    void fill_circle(int16_t x0, int16_t y0, int16_t r, uint16_t color);
    
    // 文本功能
    void setTextSize(uint8_t size);
    void setTextColor(uint16_t color);
    void setCursor(int16_t x, int16_t y);
    void print(const char* str);
    void println(const char* str);
    void printNumber(int num, int16_t x, int16_t y, uint8_t size = 2);
    void text(const char* str, int16_t x, int16_t y, uint16_t color, uint8_t size = 2);
    // 中文显示
    // 显示24x24中文字符
   // void drawChinese24(int16_t x, int16_t y, const uint8_t* data, uint16_t color);
    // 显示GB2312编码的中文字符串
    void drawGB2312String(int16_t x, int16_t y, const char* str, uint16_t color);

private:
    void drawChinese24Fast(int16_t x, int16_t y, const uint8_t* data, uint16_t color, uint16_t* buf);
    Adafruit_ST7789* tft;
};

#endif