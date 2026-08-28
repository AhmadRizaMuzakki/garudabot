#ifndef WeESP32_PRO_H
#define WeESP32_PRO_H

#include "driver/gpio.h"
#include <Arduino.h>
#include "WeOneWire.h"
//#include "WeUltrasonic.h"
#include "WeAdapter.h"
#include "WeButton.h"
#include "WeRGB.h"
#include "WeSprecognition.h"
#include "WeSensor.h"
#include "WeSingleLineFollower.h"
#include "WeSingleLED.h"
#include "WeLimitSwitch.h"
#include "WeRelay.h"
#include "WePIRSensor.h"
#include "WeWaterSensor.h"
#include "WeUVSensor.h"
#include "WeSmartIRModule.h"
#include "WeWaterAtomizer.h"
#include "WeTiltSwitch.h"
#include "WeFunnyTouchSensor.h"
#include "WeTouchSensor.h"
#include "WeGasSensor.h"
#include "WeSlidingPotentiometer.h"
#include "WePotentiometer.h"
#include "WeBuzzer.h"
#include "WeGestureSensor.h"
#include "WeBarometerSensor.h"
#include "WeSoundSensor.h"
#include "WeRGBLED_RJ.h"
#include "WeRGBLed.h"
#include "WeLEDLineFollower.h"
#include "We4LEDButton.h"
#include "WeLineFollower.h"
#include "WeIRThermometerSensor.h"
#include "WeHumiture.h"
#include "WeFlameSensor.h"
#include "We130DCMotor.h"
#include "WeSpeechSynthesisModule.h"
#include "WeStepperMotor.h"
#include "WeMP3.h"
#include "WeDCMotor.h"
#include "We7SegmentDisplay.h"
#include "WePort.h"
#include "WeSpeechRecognition.h"
#include "WeCompassSensor.h"
#include "WeColorSensor.h"
#include "WeEncoderMotor.h"
#include "WeMultipleLineFollower.h"
#include "WeGyroSensor.h"
#include "WeIRAvoidSensor.h"
#include "WeUltrasonicSensor.h"
#include "WePM25Sensor.h"
#include "WeBluetoothController.h"
#include "WeImageRecognition_V831.h"
#include "WeLEDPanelModuleMatrix.h"
#include "WeInfraredReceiver.h"
#include "WeSpeechSynthesisModuleV2.h"
#include "WeCO2Sensor.h"
#include "ESP32Servo.h"
#include "WeWeight.h"


#define PORT_A (17)
#define PORT_B (16)
#define PORT_C (13)
#define PORT_D (27)
#define PORT_1 (32)
#define PORT_2 (33)
#define PORT_3 (25)
#define PORT_4 (26)
#define PORT_5 (4)
#define PORT_6 (2)
#define OnBoard_Buzzer (14)
#define OnBoard_Button (18)
#define OnBoard_RGB (12)
#define M1 (1)
#define M2 (2)

// 自动初始化 IO 的类
class WeESP32ProInit {
public:
    WeESP32ProInit() {
        pinMode(13, INPUT);
    }
};

// 创建全局对象，构造函数会自动执行
WeESP32ProInit weESP32ProInit;

WePort_TwoSig WetwoPort[12] =
{
    { NC, NC }, { 21, 22 }, {  19,  23 }, {PORT_3, 1 }, {PORT_3,  2 },
	{PORT_4, 1 }, {PORT_4, 2 }, {PORT_5, 1 }, {PORT_5, 2 }, {PORT_6,  1 },
	{PORT_6,  2 }, { NC, NC },
};
int _boardType = 2;  // Pro板

void setfastPWM()
{

}




#endif
