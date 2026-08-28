#ifndef WecolorfulTouch_H
#define WecolorfulTouch_H

#include "WePort.h"

class WecolorfulTouch
{
public:
    WecolorfulTouch(uint8_t port = 0);
    void reset(uint8_t port);
    unsigned char readTouch();
    unsigned char showRGB(unsigned char number, unsigned char red, unsigned char green, unsigned char blue);
    unsigned char setTouch(unsigned char action);

private:
    WeOneWire OW;
    unsigned char data1;
};

#endif 