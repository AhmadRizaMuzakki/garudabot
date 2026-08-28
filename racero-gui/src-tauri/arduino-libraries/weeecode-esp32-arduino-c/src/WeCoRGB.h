#ifndef WeCoRGB_H
#define WeCoRGB_H

#include "Adafruit_Library/Adafruit_NeoPixel.h"
#include "Arduino.h"
      


class WeCoRGB {
public:
    WeCoRGB();  
    void begin();
    void write(uint16_t n, uint8_t red, uint8_t green, uint8_t blue);

private:
    Adafruit_NeoPixel *strip;
};

#endif