#include "WeKeyboard.h"

WeKeyboard::WeKeyboard(uint8_t port)
{
    _WeKeyboard.reset(port);
}

void WeKeyboard::reset(uint8_t port)
{
    _WeKeyboard.reset(port);
}

void WeKeyboard::startRead(void)
{   

    if(_WeKeyboard.reset()!=0) 
    return ;
    _WeKeyboard.write_byte(0x02);
    _WeKeyboard.respond();
    key = _WeKeyboard.read_byte();
   // return key;
 }

 uint8_t WeKeyboard::getKey()
 {
    startRead();
    return key;
 }