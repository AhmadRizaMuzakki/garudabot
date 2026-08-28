#include"WeESP32Pro.h"

WeCO2Sensor co2_A(PORT_A);

void setup(){
	co2_A.begin();
	Serial.begin(115200);
}

void loop(){
	delay(1000);
	co2_A.startRead();
	Serial.println(co2_A.CO2);
}
