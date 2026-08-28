#ifndef _WeDCMotor_H
#define _WeDCMotor_H

#include "WePort.h"

class WeDCMotorForRJ25
{
public:

  WeDCMotorForRJ25(uint8_t port=0);
  void reset(uint8_t port=0);
  void run(int16_t speed);
  void move(uint8_t direction, int16_t speed);
  void stop(void);


private:
	
	WeOneWire _WeDCMotorForRJ25;
	volatile uint8_t dc_pwm_pinA;
    volatile uint8_t dc_pwm_pinB;
    int16_t  last_speed=0;
    uint8_t  onBoard_flag=0;
	uint8_t  motor_flag=0;
	uint8_t  setPWM_flag=0;
    uint8_t motor_port=0;
};

#endif
