



#ifdef  ESP32

#include "WeOneWire.h"

static const char *TAG = "hello_world";

WeOneWire::WeOneWire(uint8_t pin)
{
  reset(pin);
}

WeOneWire::WeOneWire(void){}

void WeOneWire::reset(uint8_t pin)
{
  WePIN=static_cast<gpio_num_t>(pin);
}

uint8_t WeOneWire::reset(void)
{ 
  uint8_t r;
//ESP_LOG_LEVEL(ESP_LOG_ERROR, TAG, "ESP_LOG_LEVEL test!\n") ;
  gpio_set_direction(WePIN, GPIO_MODE_OUTPUT);
 // ESP_LOG_LEVEL(ESP_LOG_ERROR, TAG, "first error\n") ;
  gpio_set_level(WePIN,0);
 // ESP_LOG_LEVEL(ESP_LOG_ERROR, TAG, "second error\n") ;
  delayMicroseconds(480);
 // ESP_LOG_LEVEL(ESP_LOG_ERROR, TAG, "third error\n") ;
  gpio_set_direction(WePIN, GPIO_MODE_INPUT);
 // ESP_LOG_LEVEL(ESP_LOG_ERROR, TAG, "fourth error\n") ;
  delayMicroseconds(50);
  r = gpio_get_level(WePIN);
  delayMicroseconds(80);
  return r;
}

uint8_t WeOneWire::respond(void)
{ 
	unsigned long startTime=0;
    gpio_set_direction(WePIN, GPIO_MODE_INPUT);
    while(gpio_get_level(WePIN) == 1){
        startTime++;
        delayMicroseconds(1);
        if(startTime > 150000){
        	return 1;
        }
    }
    while(gpio_get_level(WePIN) == 0);
    gpio_set_direction(WePIN, GPIO_MODE_OUTPUT);
    gpio_set_level(WePIN,0);
    delayMicroseconds(30);
    gpio_set_direction(WePIN, GPIO_MODE_INPUT);
    return 0;
}

void WeOneWire::write_byte(uint8_t v)
{
  gpio_set_direction(WePIN, GPIO_MODE_OUTPUT);
    for(uint8_t i=0;i<8;i++){
      gpio_set_level(WePIN,0);

      delayMicroseconds(7);

      if (v&0x01){
        gpio_set_level(WePIN,1);
      }else{
        gpio_set_level(WePIN,0);
      }
      v=v>>1;
      delayMicroseconds(40);
      gpio_set_level(WePIN,1);
      delayMicroseconds(12);
    }
    gpio_set_direction(WePIN, GPIO_MODE_INPUT);
}

uint8_t WeOneWire::read_byte(void)
{
  uint8_t j=0,k=0;
    uint32_t startTime=0;
    for (int i = 0; i < 8; ++i){
        startTime=0;
        gpio_set_direction(WePIN, GPIO_MODE_INPUT);
        while(gpio_get_level(WePIN)==1)
        {
            startTime++;
            delayMicroseconds(1);
            if (startTime>15000){
                break;
            }
        }
        delayMicroseconds(35);
        j=gpio_get_level(WePIN);
        delayMicroseconds(40);
        k = (j<<7)|(k>>1);
    }

    return k;
}

bool WeOneWire::send(uint8_t id, uint8_t dataLen, byte* data)
{
  if(reset())return false;
  write_byte(id);
  if(dataLen == 0)return true;
  if(reset())return false;
  for(int i=0; i<dataLen; ++i)
    write_byte(data[i]);
  return true;
}

// bool WeOneWire::recv(uint8_t id, uint8_t dataLen, byte* data)
// {
//   if(reset())return false;
//   write_byte(id);
//   if(respond())return false;
//   for(int i=0; i<dataLen; ++i)
//     data[i] = read_byte();
//   return true;
// }

#else

#include "WeOneWire.h"


WeOneWire::WeOneWire(uint8_t pin)
{
  reset(pin);
}

WeOneWire::WeOneWire(void){}

void WeOneWire::reset(uint8_t pin)
{
  WePIN=pin;
  bitmask = WePIN_TO_BITMASK(pin);
  baseReg = WePIN_TO_BASEREG(pin);
}

uint8_t WeOneWire::reset(void)
{ 
	WeIO_REG_TYPE mask = bitmask;
	volatile WeIO_REG_TYPE *reg WeIO_REG_ASM = baseReg;

  uint8_t r;

  WeDIRECT_MODE_OUTPUT(reg, mask);
  WeDIRECT_WRITE_LOW(reg, mask);
  delayMicroseconds(480);
  pinMode(WePIN,INPUT);
  delayMicroseconds(50);
  r=WeDIRECT_READ(reg, mask);
  delayMicroseconds(100);

  return r;
}

uint8_t WeOneWire::respond(void)
{ 
	WeIO_REG_TYPE mask = bitmask;
	 volatile WeIO_REG_TYPE *reg WeIO_REG_ASM = baseReg;

  unsigned long time;
  time = millis();
  WeDIRECT_MODE_INPUT(reg, mask);
  while(WeDIRECT_READ(reg, mask)==1)
  {
  	if((millis()-time)>150)
	return 1;
  }
  while(WeDIRECT_READ(reg, mask)==0);
  WeDIRECT_MODE_OUTPUT(reg, mask);
  WeDIRECT_WRITE_LOW(reg, mask);
  delayMicroseconds(30);
  pinMode(WePIN,INPUT);
  return 0;
}

void WeOneWire::write_bit(uint8_t value)
{
  noInterrupts();
  digitalWrite(WePIN,LOW);
  pinMode(WePIN,OUTPUT);
  delayMicroseconds(5);
  digitalWrite(WePIN, value);
  interrupts();
  delayMicroseconds(35);
  digitalWrite(WePIN,HIGH);
  delayMicroseconds(5);
}

void WeOneWire::write_byte(uint8_t v)
{
  for(int i=0;i<8;i++){
    write_bit((v >> i) & 1);
  }
  pinMode(WePIN,INPUT);
}

uint8_t WeOneWire::read_bit(void)
{
  WeIO_REG_TYPE mask = bitmask;
  volatile uint8_t *reg WeIO_REG_ASM = baseReg;

  unsigned long time = millis();
  while(WeDIRECT_READ(reg, mask) == 1 && (millis() - time) <= 3);

  noInterrupts();
  delayMicroseconds(34);
  uint8_t r = WeDIRECT_READ(reg, mask);
  interrupts();
  delayMicroseconds(40);

  return r;
}

uint8_t WeOneWire::read_byte(void)
{
  uint8_t k = 0;
  pinMode(WePIN, INPUT);
  for(int i=0;i<8;i++){
    k |= read_bit() << i;
  }
  return k;
}

bool WeOneWire::send(uint8_t id, uint8_t dataLen, byte* data)
{
  if(reset())return false;
  write_byte(id);
  if(dataLen == 0)return true;
  if(reset())return false;
  for(int i=0; i<dataLen; ++i)
    write_byte(data[i]);
  return true;
}

bool WeOneWire::recv(uint8_t id, uint8_t dataLen, byte* data)
{
  if(reset())return false;
  write_byte(id);
  if(respond())return false;
  for(int i=0; i<dataLen; ++i)
    data[i] = read_byte();
  return true;
}

bool WeOneWire::write(uint8_t id, uint8_t dataLen, byte* data, long time, uint8_t writeDataLen, byte* writeData)
{
  if(reset())return false;
  write_byte(id);
  if(writeDataLen > 0){
    if(reset())return false;
    for(int i=0; i<writeDataLen; ++i)
      write_byte(writeData[i]);
  }
  if(dataLen == 0)return true;
  unsigned long timestamp = millis() + time;
  while(respond())
    if(millis() >= timestamp)
      return false;
  for(int i=0; i<dataLen; ++i)
    data[i] = read_byte();
  return true;
}

bool WeOneWire::send(uint8_t id)
{
  send(id, 0, 0);
}


#endif











