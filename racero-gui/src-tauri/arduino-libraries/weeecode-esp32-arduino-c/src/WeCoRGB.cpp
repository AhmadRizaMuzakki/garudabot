#ifdef  ESP32


#include "WeCoRGB.h"


WeCoRGB::WeCoRGB() {
    strip = new Adafruit_NeoPixel(5, 13, NEO_GRB + NEO_KHZ800);
}


void WeCoRGB::begin() {
    strip->begin();
}

void WeCoRGB::write(uint16_t n, uint8_t red, uint8_t green, uint8_t blue) {
    
    if (0<n && n<6) {
        strip->setPixelColor(n-1, strip->Color(red, green, blue));
        }
    
    else if (n == 0) {
        for (int i = 0; i < 5; i++) {
            strip->setPixelColor(i, strip->Color(red, green, blue));            
        }         
    }
      strip->show();                  
}   



   

#endif