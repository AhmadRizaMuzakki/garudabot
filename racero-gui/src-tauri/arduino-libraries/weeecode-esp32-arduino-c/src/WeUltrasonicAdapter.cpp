#include "WeUltrasonicAdapter.h"

WeUltrasonicAdapter::WeUltrasonicAdapter(uint8_t port)
{
    _WeUltrasonicAdapter.reset(port);
}

void WeUltrasonicAdapter::reset(uint8_t port)
{
    _WeUltrasonicAdapter.reset(port);
}

void WeUltrasonicAdapter::getUltrasonicDistance(void)
{   
    while(1)
    {
     updatei++;
    if(updatei == 100)
    {
        updatei = 0;
        break;
    }
    //Serial.println("need for getdata");
    if(_WeUltrasonicAdapter.reset()!=0) continue;
    _WeUltrasonicAdapter.write_byte(0x02);
    _WeUltrasonicAdapter.respond();
    s1 = _WeUltrasonicAdapter.read_byte();
    s2 = _WeUltrasonicAdapter.read_byte();
    s3 = _WeUltrasonicAdapter.read_byte();
    return;
     }
 }