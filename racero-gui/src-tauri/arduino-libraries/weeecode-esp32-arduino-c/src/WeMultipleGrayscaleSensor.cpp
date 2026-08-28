#ifndef ESP32

#include "WeMultipleGrayscaleSensor.h"


WeMultipleGrayscaleSensor::WeMultipleGrayscaleSensor(uint8_t port)
{
  _WeMultipleGrayscaleSensor.reset(port);
}
void WeMultipleGrayscaleSensor::reset(uint8_t port)
{
  _WeMultipleGrayscaleSensor.reset(port);
}

void WeMultipleGrayscaleSensor::startRead(uint8_t index)
{
    uint8_t temp[8];
	if(_WeMultipleGrayscaleSensor.reset()!=0)return;
	_WeMultipleGrayscaleSensor.write_byte(0x02+index);
	_WeMultipleGrayscaleSensor.respond();

    if (index == 1) {
        for (uint8_t i = 0; i < 8; i++) {
            temp[i] = _WeMultipleGrayscaleSensor.read_byte();
        }
        S1 = temp[0]<<8|temp[1];
    	S2 = temp[2]<<8|temp[3];
        S3 = temp[4]<<8|temp[5];
    	S4 = temp[6]<<8|temp[7];
    }
    else{
        S1 = _WeMultipleGrayscaleSensor.read_byte();
    	S2 = _WeMultipleGrayscaleSensor.read_byte();
        S3 = _WeMultipleGrayscaleSensor.read_byte();
    	S4 = _WeMultipleGrayscaleSensor.read_byte();
    }
}

void WeMultipleGrayscaleSensor::setAccurary(uint8_t value)
{
    if (_WeMultipleGrayscaleSensor.reset()!=0)return;
    _WeMultipleGrayscaleSensor.write_byte(0x04);
    if (_WeMultipleGrayscaleSensor.reset()!=0)return;
    _WeMultipleGrayscaleSensor.write_byte(value);
}

void WeMultipleGrayscaleSensor::setRGB(uint8_t value)
{
    if (_WeMultipleGrayscaleSensor.reset()!=0)return;
    _WeMultipleGrayscaleSensor.write_byte(0x05);
    if (_WeMultipleGrayscaleSensor.reset()!=0)return;
    _WeMultipleGrayscaleSensor.write_byte(value);
}


#endif