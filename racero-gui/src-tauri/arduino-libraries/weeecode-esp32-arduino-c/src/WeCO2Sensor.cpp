
#include "WeCO2Sensor.h"


WeCO2Sensor::WeCO2Sensor(uint8_t port)
{
    _WeCO2Sensor.reset(port);
}
void WeCO2Sensor::reset(uint8_t port)
{
    _WeCO2Sensor.reset(port);
}

void WeCO2Sensor::begin(void)
{
    // now_time = millis();
    if(_WeCO2Sensor.reset() != 0)
        return;
    _WeCO2Sensor.write_byte(0x02);
}

void WeCO2Sensor::startRead(void)
{
    // if ((millis() - now_time) < 5000) {
    //  return;
    // }
    // now_time = millis();
    // uint8_t sensor_data[6];
    if(_WeCO2Sensor.reset() != 0)
        return;
    _WeCO2Sensor.write_byte(0x03);
    _WeCO2Sensor.respond();
    sensor_data[0] = _WeCO2Sensor.read_byte();
    for (uint8_t i = 1; i < 6; i++)
    {
        if(_WeCO2Sensor.reset() != 0)
            return;
        _WeCO2Sensor.write_byte(0x04 + i);
        _WeCO2Sensor.respond();
        sensor_data[i] = _WeCO2Sensor.read_byte();
    }

    CO2 = ((uint16_t)sensor_data[0] << 8 | sensor_data[1]);
    Temperature = -45 + 175 * (float)((uint16_t)sensor_data[2] << 8 | sensor_data[3]) / 65536;
    Humidity = 100 * (float)((uint16_t)sensor_data[4] << 8 | sensor_data[5]) / 65536;
}

void WeCO2Sensor::stop(void)
{
    if(_WeCO2Sensor.reset() != 0)
        return;
    _WeCO2Sensor.write_byte(0x04);
}
