#ifdef ESP32


#include "WeHandle.h"

#ifndef  USE_Hardware_Serial
HardwareSerial handle_serial(1);
#endif

WeHandle::WeHandle(int port)
{


}
void WeHandle::reset(void)
{

}

WeHandle::WeHandle(int rxPin, int txPin)
{
  _rxPin = rxPin;
  _txPin = txPin;
}
void WeHandle::reset(int rxPin, int txPin)
{

}
void WeHandle::begin()
{
#ifdef USE_Hardware_Serial
  Serial.begin(9600); 
#else
  handle_serial.begin(9600,SERIAL_8N1,_rxPin,_txPin);
#endif
   
}

void WeHandle::read(void)
{
#ifdef USE_Hardware_Serial
    if (Serial.available()) {
    uint8_t incomingByte = Serial.read();

    // 检查是否接收到开始标志0xAA
    if (incomingByte == start_cmd) {
      receiving = true;
      hexArrayIndex = 0; // 重置数组索引
    }
    // 如果已经开始接收数据
    else if (receiving) {
      // 检查是否接收到结束标志0x55
      if (incomingByte == stop_cmd) {
        receiving = false; // 重置接收标志
        // 打印接收到的16进制数据
      } else if (hexArrayIndex < poket_count) {
        // 存储接收到的数据字节
        hexArray[hexArrayIndex++] = incomingByte;
        }
      }
    } 
  #else
    if (handle_serial.available()) {
    uint8_t incomingByte = handle_serial.read();

    // 检查是否接收到开始标志0xAA
    if (incomingByte == start_cmd) {
      receiving = true;
      hexArrayIndex = 0; // 重置数组索引
    }
    // 如果已经开始接收数据
    else if (receiving) {
      // 检查是否接收到结束标志0x55
      if (incomingByte == stop_cmd) {
        receiving = false; // 重置接收标志
        // 打印接收到的16进制数据
      } else if (hexArrayIndex < poket_count) {
        // 存储接收到的数据字节
        hexArray[hexArrayIndex++] = incomingByte;
        }
      }
    } 
  #endif  
}

uint8_t WeHandle::get_RY()
{
    return getByte(hexArray,4);
}

uint8_t WeHandle::get_RX()
{
    return getByte(hexArray, 3);
}

uint8_t WeHandle::get_LY()
{
    return getByte(hexArray,6);
}

uint8_t WeHandle::get_LX()
{
    return getByte(hexArray,5);
}


uint8_t WeHandle::get_Key(uint8_t Hkey)
{
    if(Hkey < 8)
    {
    uint8_t hByte = getByte(hexArray,7);
    return getBit(hByte,Hkey);
    }
    else
    {
    uint8_t hByte = getByte(hexArray,8);
    return getBit(hByte,Hkey-8);
    }
    
}

uint8_t WeHandle::getByte(uint8_t arr[],int num)
{
  if (poket_count < num) {
    return 0; // 检查要查的字节是否小于数组的总字节长度
  }
  return arr[poket_count - num];    
}

bool WeHandle::getBit(uint8_t Hbyte,int num)
{
  // 确保count在0到7之间
  if (num < 0 || num > 7) {
    return false; // 非法位置，返回false
  }
  // 使用位运算符检查特定位
  return (Hbyte >> num) & 1;
}




#else
#include "WeHandle.h"
#ifdef USE_Hardware_Serial
WeHandle::WeHandle(void)
{

}
void WeHandle::reset(void)
{

}
#else
WeHandle::WeHandle(int rxPin, int txPin)
{
  _rxPin = rxPin;
  _txPin = txPin;
  _WeHandle = new SoftwareSerial(rxPin, txPin);
}
#endif
void WeHandle::reset(int rxPin, int txPin)
{

}

void WeHandle::begin()
{
#ifdef USE_Hardware_Serial
  Serial.begin(9600); 
#else
  _WeHandle->begin(9600);
#endif
   
}

void WeHandle::read(void)
{
#ifdef USE_Hardware_Serial
    if (Serial.available()) {
    uint8_t incomingByte = Serial.read();

    // 检查是否接收到开始标志0xAA
    if (incomingByte == start_cmd) {
      receiving = true;
      hexArrayIndex = 0; // 重置数组索引
    }
    // 如果已经开始接收数据
    else if (receiving) {
      // 检查是否接收到结束标志0x55
      if (incomingByte == stop_cmd) {
        receiving = false; // 重置接收标志
        // 打印接收到的16进制数据
      } else if (hexArrayIndex < poket_count) {
        // 存储接收到的数据字节
        hexArray[hexArrayIndex++] = incomingByte;
        }
      }
    } 
  #else
    if (_WeHandle->available()) {
    uint8_t incomingByte = _WeHandle->read();

    // 检查是否接收到开始标志0xAA
    if (incomingByte == start_cmd) {
      receiving = true;
      hexArrayIndex = 0; // 重置数组索引
    }
    // 如果已经开始接收数据
    else if (receiving) {
      // 检查是否接收到结束标志0x55
      if (incomingByte == stop_cmd) {
        receiving = false; // 重置接收标志
        // 打印接收到的16进制数据
      } else if (hexArrayIndex < poket_count) {
        // 存储接收到的数据字节
        hexArray[hexArrayIndex++] = incomingByte;
        }
      }
    } 
  #endif  
}

uint8_t WeHandle::get_RY()
{
    return getByte(hexArray,4);
}

uint8_t WeHandle::get_RX()
{
    return getByte(hexArray, 3);
}

uint8_t WeHandle::get_LY()
{
    return getByte(hexArray,6);
}

uint8_t WeHandle::get_LX()
{
    return getByte(hexArray,5);
}


uint8_t WeHandle::get_Key(uint8_t Hkey)
{
    if(Hkey < 8)
    {
    uint8_t hByte = getByte(hexArray,7);
    return getBit(hByte,Hkey);
    }
    else
    {
    uint8_t hByte = getByte(hexArray,8);
    return getBit(hByte,Hkey-8);
    }
    
}

uint8_t WeHandle::getByte(uint8_t arr[],int num)
{
  if (poket_count < num) {
    return 0; // 检查要查的字节是否小于数组的总字节长度
  }
  return arr[poket_count - num];    
}

bool WeHandle::getBit(uint8_t Hbyte,int num)
{
  // 确保count在0到7之间
  if (num < 0 || num > 7) {
    return false; // 非法位置，返回false
  }
  // 使用位运算符检查特定位
  return (Hbyte >> num) & 1;
}


#endif