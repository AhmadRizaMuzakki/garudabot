#include "WeMultiTouch.h"

WeMultiTouch::WeMultiTouch(uint8_t port)
{
    _WeMultiTouch.reset(port);
}

void WeMultiTouch::reset(uint8_t port)
{
    _WeMultiTouch.reset(port);
}

void WeMultiTouch::startRead(void)
{   
    if(_WeMultiTouch.reset() != 0) 
        return;
    _WeMultiTouch.write_byte(0x02);
    _WeMultiTouch.respond();
    key = _WeMultiTouch.read_byte();
}

uint8_t WeMultiTouch::getKey()
{
    startRead();
    return key;
}