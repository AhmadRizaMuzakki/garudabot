#ifndef WeKeyboard_H
#define WeKeyboard_H


#include "WePort.h"

#define Key_0  0x01
#define Key_1  0x05
#define Key_2  0x06
#define Key_3  0x07
#define Key_4  0x09
#define Key_5  0x0A
#define Key_6  0x0B
#define Key_7  0x0D
#define Key_8  0x0E
#define Key_9  0x0F
#define Key_ponit 0x03
#define Key_num   0x04
#define Key_minus 0x08
#define Key_star  0x0C
#define Key_slash 0x10

class WeKeyboard
{
public:
    WeKeyboard(uint8_t port = 0);
    void reset(uint8_t port);
    void startRead(void);
    uint8_t getKey();

private:
    WeOneWire _WeKeyboard;
    uint8_t key;

 

};

#endif