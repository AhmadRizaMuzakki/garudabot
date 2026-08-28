#ifndef WeMultiTouch_H
#define WeMultiTouch_H

#include "WePort.h"



class WeMultiTouch
{
public:
    WeMultiTouch(uint8_t port = 0);
    void reset(uint8_t port);
    void startRead(void);
    uint8_t getKey();

private:
    WeOneWire _WeMultiTouch;
    uint8_t key;
};

#endif