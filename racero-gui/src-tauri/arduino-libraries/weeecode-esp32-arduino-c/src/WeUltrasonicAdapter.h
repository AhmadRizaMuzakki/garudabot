#ifndef WeUltrasonicAdapter_H
#define WeUltrasonicAdapter_H


#include "WePort.h"



class WeUltrasonicAdapter
{
public:
    WeUltrasonicAdapter(uint8_t port = 0);
    void reset(uint8_t port);
    void getUltrasonicDistance(void);
    uint8_t s1;
    uint8_t s2;  
    uint8_t s3; 
   // uint8_t read(uint8_t can);


private:
    WeOneWire _WeUltrasonicAdapter;
    uint8_t setdata1;
    uint8_t updatei;
 

};

#endif