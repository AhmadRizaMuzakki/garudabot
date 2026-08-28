#ifndef  ESP32

#include "WeServo360.h"


WeServo360::WeServo360(uint8_t port)
{
  _Servopin=port;
  pinMode(_Servopin, OUTPUT);
}
void WeServo360::reset(uint8_t port)
{
  _Servopin=port;
  pinMode(_Servopin, OUTPUT);
}


void WeServo360::write(uint16_t angle)
{
 if(angle>360) angle=360;
 noInterrupts();
 for(int i=0;i<200;i++){
    int pulsewidth = (angle * 55.5)/10 + 500; //���Ƕ�ת��Ϊ500-2500������ֵ
    //if(_IRflag==1) pulsewidth = (angle * 4.3) + 400;		
    digitalWrite(_Servopin, HIGH);   //������ӿڵ�ƽ����
    delayMicroseconds(pulsewidth);  //��ʱ����ֵ��΢����
    digitalWrite(_Servopin, LOW);    //������ӿڵ�ƽ����
    delayMicroseconds(20000 - pulsewidth);
  }
  interrupts();
  delay(100);
}


#endif
