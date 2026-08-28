#ifndef WeWeight_H
#define WeWeight_H


#include "WePort.h"



class WeWeight
{
public:
    WeWeight(uint8_t port = 0);
    void reset(uint8_t port);
    void startRead(void);
    unsigned char clear(void);
    unsigned char setcalibration(void);
    unsigned long getcalibration(void);
    unsigned char clearcalibration(void);    
    long read();
    long customizeRead(unsigned int Calibration , unsigned int reality);
    void calibrate();
    long weight;
    long first_weight;
    
   // uint8_t read(uint8_t can);


private:
    WeOneWire _WeWeight;
    int Wdata1;
    int Wdata2;
    int Wdata3;
    int Wdata4;
    unsigned char key;

};

#endif