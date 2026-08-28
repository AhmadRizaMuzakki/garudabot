#include "WeESP32Mini.h"
void update();
WeRFIDModule weNFC_A(PORT_A);

void setup() {
  // put your setup code here, to run once:
  Serial.begin(115200);   
}

void loop() {
    update();
    uint32_t UID = weNFC_A.getUID();
    if(UID != 0 )
    {
    Serial.println(UID);
    //UID = "0:0:0:0";
    }
  //  delay(1000);
 }

void update()
{
  weNFC_A.startReadWhile();
}
