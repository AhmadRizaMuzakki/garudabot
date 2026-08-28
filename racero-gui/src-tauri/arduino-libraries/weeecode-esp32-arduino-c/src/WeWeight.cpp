#include "WeWeight.h"

WeWeight::WeWeight(uint8_t port)
{
    _WeWeight.reset(port);
}

void WeWeight::reset(uint8_t port)
{
    _WeWeight.reset(port);
}
 void WeWeight::startRead(void)
{   

    if(_WeWeight.reset()!=0) 
    return ;
    _WeWeight.write_byte(0x02);
    _WeWeight.respond();
    Wdata1 = _WeWeight.read_byte();
    Wdata2 = _WeWeight.read_byte();
    Wdata3 = _WeWeight.read_byte();
    Wdata4 = _WeWeight.read_byte();
    weight = (unsigned long)Wdata1 << 24 | // 将最高8位左移24位
           (unsigned long)Wdata2 << 16 | // 将次高8位左移16位
           (unsigned long)Wdata3 << 8  | // 将次低8位左移8位
           (unsigned long)Wdata4;        // 将最低8位保持不变
           if(weight > 20000)
           {
            weight = 0;
           }
  //  weight = map(weight,0,172,0,100);
 }

 long WeWeight::read()
 {
    startRead();
    return weight;
 }

//使用自定义标准值时，要清空固定标准值（只需要执行一次，后续无需再执行），切记
 long WeWeight::customizeRead(unsigned int Calibration , unsigned int reality)
 {
    startRead();
    weight = map(weight,0,Calibration,0,reality);
    return weight;
 }

 unsigned char WeWeight::clear()
 {
    if(_WeWeight.reset()!=0) 
    return 0;
    _WeWeight.write_byte(0x03);
     _WeWeight.respond();
     key = _WeWeight.read_byte();
     return key;
 }
 //返回值:  1、校准成功  2、校准失败，已校准完成，如需再次校准请断电重启   3、校准失败，未放置100g砝码于托盘上
 unsigned char WeWeight::setcalibration(void){     //校准
    if(_WeWeight.reset()!=0) 
    return 0 ;
    _WeWeight.write_byte(0x04);
     _WeWeight.respond();
     key = _WeWeight.read_byte();
     return key;
 }

 unsigned long WeWeight::getcalibration(void){ //获取校准值
    if(_WeWeight.reset()!=0) 
    return  0;
    _WeWeight.write_byte(0x05);
    _WeWeight.respond();
    Wdata1 = _WeWeight.read_byte();
    Wdata2 = _WeWeight.read_byte();
    Wdata3 = _WeWeight.read_byte();
    Wdata4 = _WeWeight.read_byte();
    weight = (unsigned long)Wdata1 << 24 | // 将最高8位左移24位
           (unsigned long)Wdata2 << 16 | // 将次高8位左移16位
           (unsigned long)Wdata3 << 8  | // 将次低8位左移8位
           (unsigned long)Wdata4;        // 将最低8位保持不变
     return weight;
 }


 //返回值为1则清空成功，否则失败
 unsigned char WeWeight::clearcalibration(void){ //清空校准值
    if(_WeWeight.reset()!=0) 
    return 0;
    _WeWeight.write_byte(0x06);
    _WeWeight.respond();
    key = _WeWeight.read_byte();
    return key;
 }


 void WeWeight::calibrate(){
   while(!clearcalibration()){
      Serial.println("正在清空标准值……");
      delay(1000);
   }
   Serial.println("清空校准完成");
   while(1){
      unsigned char result = setcalibration();
      if(result == 1){
         Serial.println("校准成功");
         break;
      }else if(result == 2){
         Serial.println("校准失败，已校准完成，如需校准请先清空校准值");
      }else if(result == 3){
         Serial.println("校准失败，未放置500g砝码于托盘上");
      }else{
         Serial.println("校准失败，通信失败");
      }
      delay(1000);
   }
 }