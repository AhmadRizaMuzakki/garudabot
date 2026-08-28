 #include "Weeecore.h"

WeCoSpeechRecognition weCoSpeechRecognition;
WeJoyandKey  wejoy;
void setup() {
    Serial.begin(115200);
    
    weCoSpeechRecognition.begin();
 //   Serial.println("MPU6050初始化成功!");
    weCoSpeechRecognition.enable();
    wejoy.begin();
    // if (!weCoMotor.begin(0)) {//启动电机
    //     Serial.println("电机初始化失败！");
    // }
    // wejoy.begin(); 
}

void loop() {  

    Serial.println(weCoSpeechRecognition.read());
    if(wejoy.isPressed(ButtonA))
    {
      Serial.println("how are you");
    }
     delay(1000);
}