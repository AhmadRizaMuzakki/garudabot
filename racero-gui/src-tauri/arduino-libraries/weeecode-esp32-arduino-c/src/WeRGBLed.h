
#ifndef WeRGBLed_H
#define WeRGBLed_H

#ifdef ESP32

#include "Adafruit_Library/Adafruit_NeoPixel.h"
#include "Arduino.h"


#define DEFAULT_MAX_LED_NUMBER  (32)

#define SIMPLENEOPIXEL_DEFAULT_PIN    12 // 默认引脚，可以根据需要修改

class WeRGBLed {
public:
    WeRGBLed(uint8_t pin = SIMPLENEOPIXEL_DEFAULT_PIN);
    void setColor(uint16_t n,  long value);
    void setColor(uint16_t n, uint8_t red, uint8_t green, uint8_t blue);
    void show();

private:
    Adafruit_NeoPixel *strip;
    uint16_t numLEDs;
    uint8_t pin;
};

#else

#include "WePort.h"
#include "Adafruit_Library/Adafruit_NeoPixel.h"

#define DEFAULT_MAX_LED_NUMBER  (32)

void rgbled_sendarray_mask(uint8_t *array, uint16_t length, uint8_t pinmask, uint8_t *port);

struct cRGB
{
  uint8_t g;
  uint8_t r;
  uint8_t b;
};


class WeRGBLed
{
public:

  WeRGBLed(uint8_t port=0);
  ~WeRGBLed(void);

  void setNumber(uint8_t num_led);
  bool setColorAt(uint8_t index, uint8_t red, uint8_t green, uint8_t blue);
  bool setColor(uint8_t index, uint8_t red, uint8_t green, uint8_t blue);
  bool setColor(uint8_t red, uint8_t green, uint8_t blue);
  
  bool setColor(uint8_t index, long value);
  void show(void);
  void reset(uint8_t port=0);



 
  
 private:
	
	uint16_t count_led;
	uint8_t *pixels;
	

    const volatile uint8_t *ws2812_port;
    //volatile uint8_t *ws2812_port_reg;
    uint8_t pinMask;

};

#endif



#endif

