#include <Weeecore.h>

WeJoyandKey weJoyandKey;

void setup() {
    Serial.begin(115200);
    if (!weJoyandKey.begin()) {
        Serial.println("Failed to initialize WeJoyandKey");
        while (1);
    }
}

void loop() {
    if (weJoyandKey.isPressed(ButtonA)) {
        Serial.println("Button A pressed");
    }
    if (weJoyandKey.isPressed(ButtonB)) {
        Serial.println("Button B pressed");
    }
    if (weJoyandKey.isPressed(JoyStickUp)) {
        Serial.println("Joystick Up");
    }
    if (weJoyandKey.isPressed(JoyStickDown)) {
        Serial.println("Joystick Down");
    }
    if (weJoyandKey.isPressed(JoyStickLeft)) {
        Serial.println("Joystick Left");
    }
    if (weJoyandKey.isPressed(JoyStickRight)) {
        Serial.println("Joystick Right");
    }
    if (weJoyandKey.isPressed(JoyStickMiddle)) {
        Serial.println("Joystick Middle");
    }

    delay(100);
}