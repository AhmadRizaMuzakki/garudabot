#include "WeMultipleLineFollower.h"


WeMultipleLineFollower::WeMultipleLineFollower(uint8_t port)
{
  _WeMultipleLineFollower.reset(port);
}
void WeMultipleLineFollower::reset(uint8_t port)
{
	_WeMultipleLineFollower.reset(port);
}

void WeMultipleLineFollower::startRead(void)
{
  if(_WeMultipleLineFollower.reset()!=0)
  	return;
  _WeMultipleLineFollower.write_byte(0x02);
  _WeMultipleLineFollower.respond();
  _Sensor1=_WeMultipleLineFollower.read_byte();
  _Sensor2=_WeMultipleLineFollower.read_byte();	
  _Sensor3=_WeMultipleLineFollower.read_byte();
  _Sensor4=_WeMultipleLineFollower.read_byte();	
  _Sensor5=_WeMultipleLineFollower.read_byte();	

}

uint8_t WeMultipleLineFollower::readSensor1(void)
{
  //return (uint16_t)(1023 * (1 - _Sensor1 / 255.0));
  return _Sensor1;
}
uint8_t WeMultipleLineFollower::readSensor2(void)
{
  //return (uint16_t)(1023 * (1 - _Sensor2 / 255.0));
  return _Sensor2;
}
uint8_t WeMultipleLineFollower::readSensor3(void)
{
  return _Sensor3;
}
uint8_t WeMultipleLineFollower::readSensor4(void)
{
  return _Sensor4;
}
uint8_t WeMultipleLineFollower::readSensor5(void)
{
  return _Sensor5;
}

uint8_t WeMultipleLineFollower::readSensor(void)
{
	if(_WeMultipleLineFollower.reset()!=0)
	   return 0;
	 _WeMultipleLineFollower.write_byte(0x03);
	 _WeMultipleLineFollower.respond();
	 _Sensor=_WeMultipleLineFollower.read_byte();
	 _Sensor1=_Sensor&0x01;
	 _Sensor2=(_Sensor&0x02)>>1;
	 _Sensor3=(_Sensor&0x04)>>2;
	 _Sensor4=(_Sensor&0x08)>>3;
	 _Sensor5=(_Sensor&0x10)>>4;
	 return _Sensor;
}

uint8_t WeMultipleLineFollower::readSensor(uint8_t model, uint8_t index)
{
	if(_WeMultipleLineFollower.reset()!=0)return 0;
	_WeMultipleLineFollower.write_byte(model ? 2 : 3);
	_WeMultipleLineFollower.respond();
	if(model == 0){
		return _WeMultipleLineFollower.read_byte() >> index & 1;
	}
	uint8_t data[5];
	for(int i=0; i<5; ++i){
		data[i] = _WeMultipleLineFollower.read_byte();
	}
	return data[index];
}


void  WeMultipleLineFollower::openLED(void)
{
	if(_WeMultipleLineFollower.reset()!=0)
  		return;
  	_WeMultipleLineFollower.write_byte(0x04);
}

void WeMultipleLineFollower::closeLED(void)
{
	if(_WeMultipleLineFollower.reset()!=0)
  		return;
  	_WeMultipleLineFollower.write_byte(0x05);
}


