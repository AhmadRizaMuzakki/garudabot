#ifdef ESP32
#include "WeCoLCD.h"


WeCoLCD::WeCoLCD() {
    tft = new Adafruit_ST7789(5, 2, 15);
}

void WeCoLCD::begin() {
    // 禁用所有看门狗
    disableCore0WDT();
    disableCore1WDT();
    disableLoopWDT();
    
    tft->init(240, 240);
    tft->setRotation(2);
    tft->fillScreen(ST77XX_BLACK);
    tft->setTextWrap(true);
    
    // 初始化SPI总线，进一步降低频率
    SPI.begin(18, 19, 23, 5);  // SCK, MISO, MOSI, SS
    SPI.setFrequency(10000000);  // 降低到10MHz
}

uint16_t WeCoLCD::color565(uint8_t r, uint8_t g, uint8_t b) {
    return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3);
}

void WeCoLCD::fill(uint16_t color) {
    tft->fillScreen(color);
}

void WeCoLCD::rotation(uint8_t rotation) {
    tft->setRotation(rotation);
}

void WeCoLCD::pixel(int16_t x, int16_t y, uint16_t color) {
    tft->drawPixel(x, y, color);
}

void WeCoLCD::line(int16_t x0, int16_t y0, int16_t x1, int16_t y1, uint16_t color) {
    tft->drawLine(x0, y0, x1, y1, color);
}

void WeCoLCD::hline(int16_t x, int16_t y, int16_t w, uint16_t color) {
    tft->drawLine(x, y, x + w, y, color);
}

void WeCoLCD::vline(int16_t x, int16_t y, int16_t h, uint16_t color) {
    tft->drawLine(x, y, x, y + h, color);
}

void WeCoLCD::rect(int16_t x, int16_t y, int16_t w, int16_t h, uint16_t color) {
    tft->drawRect(x, y, w, h, color);
}

void WeCoLCD::fill_rect(int16_t x, int16_t y, int16_t w, int16_t h, uint16_t color) {
    tft->fillRect(x, y, w, h, color);
}

void WeCoLCD::circle(int16_t x0, int16_t y0, int16_t r, uint16_t color) {
    tft->drawCircle(x0, y0, r, color);
}

void WeCoLCD::fill_circle(int16_t x0, int16_t y0, int16_t r, uint16_t color) {
    tft->fillCircle(x0, y0, r, color);
}

void WeCoLCD::setTextSize(uint8_t size) {
    tft->setTextSize(size);
}

void WeCoLCD::setTextColor(uint16_t color) {
    tft->setTextColor(color);
}

void WeCoLCD::setCursor(int16_t x, int16_t y) {
    tft->setCursor(x, y);
}

void WeCoLCD::print(const char* str) {
    tft->print(str);
}

void WeCoLCD::println(const char* str) {
    
    tft->println(str);
}

void WeCoLCD::printNumber(int num, int16_t x, int16_t y, uint8_t size) {
    tft->setTextSize(size);
    tft->setCursor(x, y);
    tft->print(num);
}
void WeCoLCD::text(const char* str, int16_t x, int16_t y, uint16_t color, uint8_t size) {
    tft->setTextSize(size);
    tft->setTextColor(color);
    tft->setCursor(x, y);
    tft->print(str);
}
void WeCoLCD::drawGB2312String(int16_t x, int16_t y, const char* str, uint16_t color) {
    if (!str) return;
    
    uint16_t x0 = x;
    uint16_t y0 = y;
    
    // 预分配较小的缓冲区
    static uint16_t buf[24];  // 只缓存一行数据
    
    while(*str) {
        if(*str & 0x80) {  // 中文字符
            uint8_t high = *str++;
            if (!*str) break;
            uint8_t low = *str++;
            
            // 范围检查
            if (high < 0xA1 || high > 0xF7 || low < 0xA1 || low > 0xFE) continue;
            
            // 计算偏移
            uint32_t offset = ((high - 0xA1) * 94 + (low - 0xA1)) * BYTES_PER_CHAR;
            if (offset >= CHARS_IN_FONT * BYTES_PER_CHAR) continue;
            
            // 检查显示位置
            if (x0 + FONT24_WIDTH > 240) {
                x0 = x;
                y0 += FONT24_HEIGHT;
                if (y0 + FONT24_HEIGHT > 240) break;
            }
            
            // 逐行绘制字符
            const uint8_t* data = &cn_font24[offset];
            tft->startWrite();
            
            for(uint8_t row = 0; row < FONT24_HEIGHT; row++) {
                // 准备一行数据
                for(uint8_t col = 0; col < FONT24_WIDTH; col++) {
                    uint8_t bit = col % 8;
                    uint8_t byte = data[row * 3 + col / 8];
                    buf[col] = (byte & (0x80 >> bit)) ? color : 0x0000;
                }
                
                // 设置显示区域并写入一行
                tft->setAddrWindow(x0, y0 + row, FONT24_WIDTH, 1);
                for(uint8_t i = 0; i < FONT24_WIDTH; i++) {
                    tft->pushColor(buf[i]);
                }
                
                // 每4行给系统一些时间
                if((row % 4) == 3) {
                    yield();
                    delay(1);
                }
            }
            
            tft->endWrite();
            x0 += FONT24_WIDTH;
            
        } else {  // ASCII字符
            if (x0 + 12 > 240) {
                x0 = x;
                y0 += FONT24_HEIGHT;
                if (y0 + FONT24_HEIGHT > 240) break;
            }
            
            tft->drawChar(x0, y0, *str++, color, 0x0000, 2);
            x0 += 12;
        }
        
        // 定期给系统时间
        yield();
        delay(1);
    }
}

void WeCoLCD::drawChinese24Fast(int16_t x, int16_t y, const uint8_t* data, uint16_t color, uint16_t* buf) {
    if (!data || !buf) return;
    
    // 使用更快的位操作
    uint32_t idx = 0;
    uint16_t fgColor = color;
    uint16_t bgColor = 0x0000;
    
    // 准备位图数据
    for(uint8_t i = 0; i < 72; i++) {
        uint8_t byte = data[i];
        for(uint8_t bit = 0; bit < 8; bit++) {
            buf[idx++] = (byte & 0x80) ? fgColor : bgColor;
            byte <<= 1;
        }
        
        // 更频繁的yield
        if((i % 24) == 23) {  // 每24字节yield一次
            yield();
        }
    }
    
    // 分批写入显示
    tft->startWrite();
    tft->setAddrWindow(x, y, FONT24_WIDTH, FONT24_HEIGHT);
    
    for(uint16_t i = 0; i < FONT24_HEIGHT; i++) {
        for(uint16_t j = 0; j < FONT24_WIDTH; j++) {
            tft->pushColor(buf[i * FONT24_WIDTH + j]);
        }
        
        // 每4行yield一次
        if((i % 4) == 3) {
            yield();
            delay(1);
        }
    }
    
    tft->endWrite();
}
#endif