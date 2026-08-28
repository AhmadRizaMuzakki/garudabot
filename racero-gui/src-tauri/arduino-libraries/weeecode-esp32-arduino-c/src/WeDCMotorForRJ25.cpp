#include "WeDCMotorForRJ25.h"


void WeDCMotorForRJ25::move(uint8_t direction, int16_t speed)
{
  //1,2,3,4 => F,B,L,R
  reset(2);
  if(direction == 1 || direction == 4){
    run(-speed);
  }else{
    run(speed);
  }
  reset(1);
  if(direction == 1 || direction == 3){
    run(speed);
  }else{
    run(-speed);
  }  
}

WeDCMotorForRJ25::WeDCMotorForRJ25(uint8_t port)
{

  reset(port);
}


void WeDCMotorForRJ25::reset(uint8_t port)
{
  if(port > 2)
  {
    _WeDCMotorForRJ25.reset(WetwoPort[port].s1);
    motor_flag=WetwoPort[port].s2;
    onBoard_flag=0;
  }else{
    pinMode(WetwoPort[port].s2, OUTPUT);
    dc_pwm_pinA=WetwoPort[port].s1;
    dc_pwm_pinB=WetwoPort[port].s2;
    onBoard_flag=1;
  }
  last_speed=300;
}

void WeDCMotorForRJ25::run(int16_t speed)
{
  if(setPWM_flag==0)
  {
     setfastPWM();
     setPWM_flag=1;
  }
  speed = speed > 255 ? 255 : speed;
  speed = speed < -255 ? -255 : speed;

  if(last_speed != speed)
  {
    last_speed = speed;
  }
  else
  {
    return;
  }

  if(speed >= 0)
  {

   if(onBoard_flag==1)
   {
    analogWrite(dc_pwm_pinA,speed);
    digitalWrite(dc_pwm_pinB,0);
   }
   else
   {
     _WeDCMotorForRJ25.reset();
	 _WeDCMotorForRJ25.write_byte(0x02);
     _WeDCMotorForRJ25.reset();
     _WeDCMotorForRJ25.write_byte(motor_flag);
     _WeDCMotorForRJ25.write_byte((uint8_t)(speed/2.55));
     delayMicroseconds(500);
   }
  }
  else
  {
    if(onBoard_flag==1){
    digitalWrite(dc_pwm_pinA,0);
    analogWrite(dc_pwm_pinB,speed);
  }
  else
  {
	  _WeDCMotorForRJ25.reset();
	  _WeDCMotorForRJ25.write_byte(0x02);
	  _WeDCMotorForRJ25.reset();
      _WeDCMotorForRJ25.write_byte(motor_flag);
      _WeDCMotorForRJ25.write_byte((uint8_t)(100-speed/2.55));
      delayMicroseconds(500);
   }
  }
}
void WeDCMotorForRJ25:: stop(void)
{
	run(0);
}
