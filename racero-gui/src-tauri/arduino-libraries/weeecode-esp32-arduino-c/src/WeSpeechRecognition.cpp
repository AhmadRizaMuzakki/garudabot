#include "WeSpeechRecognition.h"


WeSpeechRecognition::WeSpeechRecognition(uint8_t port)
{
   reset(port);
}

void WeSpeechRecognition::reset(uint8_t port)
{
	_WeSpeechRecognition.reset(port);
}

void WeSpeechRecognition::setKeyword(String str)
{
	setKeyword(str.c_str());
}

void WeSpeechRecognition::setKeyword(const char *str)
{
	if(_WeSpeechRecognition.reset()!=0) return ;
    _WeSpeechRecognition.write_byte(0x02);
    if(_WeSpeechRecognition.reset()!=0) return ;
	_WeSpeechRecognition.write_byte(0x00);
	for(int i=0;i<DATA_A;i++)
	{
	   char v = str[i];
	   if(v ==0) break;
	   _WeSpeechRecognition.write_byte(v);	   
	}
	_WeSpeechRecognition.write_byte(0x00);	
	delay(10);
}

void WeSpeechRecognition::setPassword(int8_t num,String str)
{
	setPassword(num, str.c_str());
}

void WeSpeechRecognition::setPassword(int8_t num,const char *str)
{
	if(_WeSpeechRecognition.reset()!=0) return ;
    _WeSpeechRecognition.write_byte(0x02);
    if(_WeSpeechRecognition.reset()!=0) return ;
	_WeSpeechRecognition.write_byte(num);
	for(int i=0;i<DATA_A;i++)
	{
	   char v = str[i];
	   if(v ==0) break;
	   _WeSpeechRecognition.write_byte(v);	   
	}
	_WeSpeechRecognition.write_byte(0x00);	
	delay(10);
}

uint16_t  WeSpeechRecognition::readvfour(void)
{
	if(_WeSpeechRecognition.reset()!=0) 
		return 0 ;
    _WeSpeechRecognition.write_byte(0x03);
   _WeSpeechRecognition.respond();
   uint8_t highByte = _WeSpeechRecognition.read_byte(); // 读取高字节
   uint8_t lowByte = _WeSpeechRecognition.read_byte();  // 读取低字节

   delay(50); // 延时

   // 将高字节和低字节组合为一个16位的数值
   uint16_t value = (highByte << 8) | lowByte;

   return value;
} 


uint8_t  WeSpeechRecognition::readForMulti(void)
{
	if(_WeSpeechRecognition.reset()!=0) 
		return 0 ;
    _WeSpeechRecognition.write_byte(0x03);
   _WeSpeechRecognition.respond();
   uint8_t s1 = _WeSpeechRecognition.read_byte(); // 读取一字节
   uint8_t s2 = _WeSpeechRecognition.read_byte();  // 读取二字节
   uint8_t s3 = _WeSpeechRecognition.read_byte();  // 读取三字节
   uint8_t value;
   if( s1 != 0 || s2 != 0 || s3 != 0)
   {
   	value = 100 + (s2-48) * 10 + (s3-48);
   }
   else
   {
	value = 0;
   }

   delay(50); // 延时

   return value;
}  


uint8_t  WeSpeechRecognition::read(void)
{
	if(_WeSpeechRecognition.reset()!=0) 
		return 0 ;
    _WeSpeechRecognition.write_byte(0x03);
   _WeSpeechRecognition.respond();
   uint8_t value = _WeSpeechRecognition.read_byte(); // 读取高字节
   delay(50); // 延时
   // 将高字节和低字节组合为一个16位的数值
   return value;
}  

uint8_t WeSpeechRecognition::setValue(uint8_t sensor,uint8_t value)
{
	if(sensor == 0x08 && value >128)
	{
		sensor = 0x07;
		value = value - 128;
	}
	sensor = sensor + 5;
	if(_WeSpeechRecognition.reset()!=0)
	return 0;
	_WeSpeechRecognition.write_byte(sensor);
	_WeSpeechRecognition.reset();
	_WeSpeechRecognition.write_byte(value);
	delay(50);
	return 1;
}


void WeSpeechRecognition::setTriggerMode(uint8_t mode)
{
	if(_WeSpeechRecognition.reset()!=0) 
		return  ;
   _WeSpeechRecognition.write_byte(0x04);
    if(_WeSpeechRecognition.reset()!=0) return ;
	_WeSpeechRecognition.write_byte(mode-1);
    delay(10);
}


void WeSpeechRecognition::beginTrigger(void)  //trigger mode
{
	if(_WeSpeechRecognition.reset()!=0) 
		return  ;
   _WeSpeechRecognition.write_byte(0x06); 
   delay(10);
}
void WeSpeechRecognition::stopTrigger(void)  //trigger mode
{
	if(_WeSpeechRecognition.reset()!=0) 
		return  ;
   _WeSpeechRecognition.write_byte(0x07); 
   delay(10);
}


