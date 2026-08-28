#include "WeRFIDModule.h"

WeRFIDModule::WeRFIDModule(uint8_t port)
{
  _WeRFIDModule.reset(port);
  lastIds = 0xFFFFFFFF;  // 在构造函数中初始化
  status = 0;  // 初始化status
}

void WeRFIDModule::reset(uint8_t port)
{
  _WeRFIDModule.reset(port);
}

WeRFID WeRFIDModule::read()
{
  WeRFID data;
  if(_WeRFIDModule.reset() != 0){
    data.status = 0xFF;
    data.ids = "Error";
    data.id = 0xFFFFFFFF;
    return data;
  }
  _WeRFIDModule.write_byte(0X02);
  _WeRFIDModule.respond();
  data.status = _WeRFIDModule.read_byte();
  uint8_t id1 = _WeRFIDModule.read_byte();
  uint8_t id2 = _WeRFIDModule.read_byte();
  uint8_t id3 = _WeRFIDModule.read_byte();
  uint8_t id4 = _WeRFIDModule.read_byte();
  data.ids = String(id1) + ":" + String(id2) + ":" + String(id3) + ":" + String(id4);
  data.id = ((uint32_t)id1 << 24) | ((uint32_t)id2 << 16) | ((uint32_t)id3 << 8) | ((uint32_t)id4);
  return data;
}

void WeRFIDModule::startReadOne()
{
  WeRFID data = read();
  if(data.status != 0xFF){
    uint8_t previousStatus = status;  // 保存上一次的status值
    status = data.status;  
    
    // 只有当上一次status为2（未找到）且当前status为1时才更新值
    if(previousStatus == 2 && data.status == 1) {
      UIDNumber = data.id;
      UIDString = data.ids;
      lastIds = data.id;
      data.ids = "0:0:0:0";
      data.id = 0;
    }
    else
    {
      UIDNumber = 0;
      UIDString = "0:0:0:0";
    }
  }
  else{
      UIDNumber = 0;
      UIDString = "0:0:0:0";
  }
}

void WeRFIDModule::startReadWhile()
{
  WeRFID data = read();
  if(data.status != 0xFF)
  {
    status = data.status;  
    UIDNumber = data.id;
    UIDString = data.ids;
    data.ids = "0:0:0:0";
    data.id = 0;
  }
}

uint32_t WeRFIDModule::getUID()
{
  return UIDNumber;
}

String WeRFIDModule::getUIDString()
{

  return UIDString;
  
}

uint8_t WeRFIDModule::getStatus(){
  return status;
}