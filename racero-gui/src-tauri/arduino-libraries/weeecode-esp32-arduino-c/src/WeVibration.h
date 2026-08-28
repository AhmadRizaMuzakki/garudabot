#ifndef WeVibration_H
#define WeVibration_H


#include "WePort.h"



class WeVibration
{
public:
    WeVibration(uint8_t port = 0);
    void reset(uint8_t port);
    void enable(void);
    void disable(void);
   // uint8_t read(uint8_t can);


private:
    WeOneWire _WeVibration;


};

#endif