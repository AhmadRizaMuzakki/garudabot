#include<WeESP32Mini.h>

WeSpeechRecognition speechRec_A(PORT_A);
double v_data;	//data;

void setup(){
	Serial.begin(115200);
}

void loop(){
  //新版语音识别
	v_data = speechRec_A.readvfour();
	//旧版语音识别
  //v_data = speechRec_A.read();
  if(v_data > 0){
		Serial.println(v_data);
	}
	delay(1000);
}
