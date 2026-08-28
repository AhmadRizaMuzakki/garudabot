
#ifndef WeCO2Sensor_H
#define WeCO2Sensor_H

#include "WePort.h"

class WeCO2Sensor
{
public:

    WeCO2Sensor(uint8_t port = 0);
    void reset(uint8_t port = 0);
    void begin(void);
    void startRead(void);
    void stop(void);
    uint16_t  CO2;
    float Humidity, Temperature;


private:
    WeOneWire _WeCO2Sensor;
    long now_time = 0;
    uint8_t sensor_data[6];
};

#endif
