#include "Weeecore.h"

WeCoRGB  rgb;

void setup(){
  rgb.begin();
}
void loop(){
  rgb.write(0,0,255,0);
}
