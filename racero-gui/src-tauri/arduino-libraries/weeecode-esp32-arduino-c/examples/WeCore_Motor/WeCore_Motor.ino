#include "Weeecore.h"
WeCoMotor weMotor;
WeJoyandKey wejoy;
int error;

void setup() {
  Serial.begin(115200);
    if (!wejoy.begin()) {
        Serial.println("Failed to initialize WeJoyandKey");
        while (1);
    }
  weMotor.begin();

  

}

void loop() {
   if (wejoy.isPressed(ButtonA)) {
    weMotor.run(1,70);
    weMotor.run(2,70);
    }
    if (wejoy.isPressed(ButtonB)) {
      weMotor.stop(1);
      weMotor.stop(2);
    }

    delay(100);

   
    //Serial.println(error);
}
