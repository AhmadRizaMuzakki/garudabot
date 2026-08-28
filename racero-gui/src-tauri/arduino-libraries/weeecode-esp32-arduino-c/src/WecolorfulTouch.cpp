#include "WecolorfulTouch.h"

WecolorfulTouch::WecolorfulTouch(uint8_t port)
{
    OW.reset(port);
}

void WecolorfulTouch::reset(uint8_t port)
{
    OW.reset(port);
}

unsigned char WecolorfulTouch::readTouch()
{
    if(OW.reset() != 0)
        return -1;  
    OW.write_byte(0x02);
    OW.respond();    
    data1 = OW.read_byte();
    return data1;
}

unsigned char WecolorfulTouch::showRGB(unsigned char number, unsigned char red, unsigned char green, unsigned char blue)
{
    if(OW.reset() != 0)
        return -1;
    OW.write_byte(0x03);
    if(OW.reset() != 0)
        return -1;
    OW.write_byte(number);
    OW.write_byte(red);
    OW.write_byte(green);
    OW.write_byte(blue);
    return 0;
}

unsigned char WecolorfulTouch::setTouch(unsigned char action)
{
    if(OW.reset() != 0)
        return -1;
    OW.write_byte(0x04);
    if(OW.reset() != 0)
        return -1;
    OW.write_byte(action);
    return 0;   
} 