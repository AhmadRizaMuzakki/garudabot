
#include "WeVibrationMotor.h"

// 方式一
WeVibrationMotor OW(25 );  // 创建一个单总线对象，指定单总线通信端口

// 方式二
// WeOneWire OW;  // 
int s1= 9999;
int s2 = 0;
void setup()
{
   Serial.begin(9600);
}

void loop() 
{
  OW.run();
  

  // OW.respond();
  // s1 = OW.read_byte();
  // Serial.print("s1:");
  // Serial.println(s1);

  delay(1000);
  OW.stop();
    delay(1000);
}

