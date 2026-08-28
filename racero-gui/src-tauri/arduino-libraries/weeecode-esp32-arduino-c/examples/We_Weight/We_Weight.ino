#include "WeESP32Mini.h"
WeWeight  weweight_A(PORT_A);
unsigned char setcalibrate = 0;
unsigned long weight = 0;
void setup() {
  // put your setup code here, to run once:
  Serial.begin(115200);
//    while(weweight_A.clearcalibration() != 1)
//    {
// // //    setcalibrate =  weweight_A.clearcalibration();
// // //    Serial.println("setcalibrate:");
// // //    Serial.println(setcalibrate);
// //    delay(1000);     
//     }  
}
void loop() {
  //  setcalibrate =  weweight_A.clearcalibration();
  //  Serial.println("setcalibrate:");
  //  Serial.println(setcalibrate);
//   delay(1000);
  // put your main code here, to run repeatedly:
     Serial.println(weweight_A.read());//获取重量
       delay(1000);
  // //校准流程
  // setcalibrate = weweight_A.calibrate();
  // if(setcalibrate == 1)
  // {
  //   Serial.println("The calibration success !");
  //   while(weight == 0)
  //   {
  //     weight = weweight_A.read();
      
  //   }
  //    Serial.println(weight);
    
  // }
  // else if(setcalibrate == 2)
  // {
  //   Serial.println("The calibration failed, the calibration has been completed, if you need to calibrate again, please power off and restart");
  // }
  // else if(setcalibrate == 3)
  // {
  //   Serial.println("Calibration failed, 500g weight was not placed on the tray");   
  // }
  // //Serial.println(weweight_A.customizeRead(783,500));
//   delay(1000);




}
