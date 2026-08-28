#include<WeESP32Mini.h>

WeDCMotor dc_1(M1);
WeDCMotor dc_2(M2);

void setup(){
  Serial.begin(9600);
}

void loop(){
  
  dc_1.run(120);
	dc_2.run(-120);
}
