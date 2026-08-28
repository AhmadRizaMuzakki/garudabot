#include<WeESP32Mini.h>
#include<WiFi.h>
#include<WiFiAP.h>

void setup(){
	WiFi.softAP("ABC", "12345678", 11);
}

void loop(){
}