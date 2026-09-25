#ifndef WeESP32_MINI_H
#define WeESP32_MINI_H


#include "driver/gpio.h"
#include <Arduino.h>
#include "WeOneWire.h"
#include "WeUltrasonicAdapter.h"
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
#include "WeSpeechSynthesisModuleV2.h"
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
#include "WeHandle.h"
#include "WeWeight.h"
#include <ESP32Servo.h> // library resmi ESP32Servo (jangan vendored di weeecode)
#include "WeOLED.h"
#include "WeRFIDModule.h"

#define PORT_A (25)
#define PORT_B (33)
#define PORT_C (32)
#define PORT_D (26)

#define OnBoard_Buzzer        (15)
#define OnBoard_IR            (27)
#define OnBoard_Light         (39)
#define OnBoard_Sound         (36)
#define M1                    (1)
#define M2                    (2)



WePort_TwoSig WetwoPort[12] =
{
    { NC, NC }, {23 , 22 }, {  21,  19 }, { NC, NC }, { NC, NC },
	{ NC, NC }, { NC, NC }, { NC, NC }, { NC, NC }, { NC, NC },
	{ NC, NC }, { NC, NC },
};
int _boardType = 1;

#define MINI_LEFT_YELLOW   13
#define MINI_LEFT_RED      2
#define MINI_RIGHT_RED     12
#define MINI_RIGHT_YELLOW  14


void setfastPWM()
{
//	TCCR1A = _BV(WGM10);
//	TCCR1B = _BV(CS11) | _BV(CS10) | _BV(WGM12);
	
//	TCCR2A = _BV(WGM21) | _BV(WGM20);
//	TCCR2B = _BV(CS22);

}

void LED_LEFT_RED(bool sig)
{
  pinMode(MINI_LEFT_RED, OUTPUT);
  digitalWrite(MINI_LEFT_RED, sig);	
}
void LED_RIGHT_RED(bool sig)
{
  pinMode(MINI_RIGHT_RED, OUTPUT);
  digitalWrite(MINI_RIGHT_RED, sig);
}
void LED_LEFT_YELLOW(bool sig)
{
  pinMode(MINI_LEFT_YELLOW, OUTPUT);
  digitalWrite(MINI_LEFT_YELLOW, sig);
}
void LED_RIGHT_YELLOW(bool sig)
{
  pinMode(MINI_RIGHT_YELLOW, OUTPUT);
  digitalWrite(MINI_RIGHT_YELLOW, sig);
}




#endif
