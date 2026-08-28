#ifdef ESP32
#include "WeCoMotor.h"

WeCoMotor::WeCoMotor(){
}

bool WeCoMotor::begin() {
    Wire.begin(22, 21);           // 指定 SDA 和 SCL 引脚
    Wire.setClock(100000);        // 设置 I2C 速度为 400kHz
    
    // 检查设备是否存在
    Wire.beginTransmission(0x52);
    uint8_t error = Wire.endTransmission();
    // if (error == 2) {
    //     Serial.println("找不到I2C设备，请检查:");
    //     Serial.println("1. 设备地址是否正确（0x52）");
    //     Serial.println("2. 接线是否正确");
    //     Serial.println("3. 是否加上拉电阻");
    //     return false;
    // }
    return true;
}



void WeCoMotor::run(uint8_t port, int speed) {
    // 准备数据
    MArary[0] = 0x01;
    MArary[1] = port;
   // speed = map(speed, -100, 100, -255, 255);    
    if (speed > 0) {
        MArary[2] = 0x01;
        speed = map(speed,0,100,80,220);
        MArary[3] = speed;
    }
    else if (speed < 0) {
        MArary[2] = 0x02;
        speed = -speed;
        speed = map(speed,0,100,80,220);
        MArary[3] = speed;
    }
    else {
        MArary[2] = 0x00;
        MArary[3] = 0x00;
    }

    Wire.beginTransmission(0x52);
    Wire.write(MArary, 4);
    Wire.endTransmission();
    delay(10);
    Wire.beginTransmission(0x52);
    Wire.write(MArary, 4);
    Wire.endTransmission();
}

void WeCoMotor::stop(uint8_t port){
    MArary[0] = 0x01;
    MArary[1] = port;
    MArary[2] = 0x01;
    MArary[3] = 0;
    Wire.beginTransmission(0x52);
    Wire.write(MArary, 4);
    Wire.endTransmission();
    delay(10);
    Wire.beginTransmission(0x52);
    Wire.write(MArary, 4);
    Wire.endTransmission();
}


void WeCoMotor::runs(uint8_t speed1, uint8_t speed2) {
     // 准备数据
    MArary[0] = 0x01;
    MArary[1] = 0x01;
   // speed = map(speed, -100, 100, -255, 255);    
    if (speed1 > 0) {
        MArary[2] = 0x01;
        speed1 = map(speed1,0,100,80,220);
        MArary[3] = speed1;
    }
    else if (speed1 < 0) {
        MArary[2] = 0x02;
        speed1 = -speed1;
        speed1 = map(speed1,0,100,80,220);
        MArary[3] = speed1;
    }         
    else {
        MArary[2] = 0x00;
        MArary[3] = 0x00;
    }
    Wire.beginTransmission(0x52);
    Wire.write(MArary, 4);
    Wire.endTransmission();
    delay(10);
    Wire.beginTransmission(0x52);
    Wire.write(MArary, 4);
    Wire.endTransmission();
    MArary[0] = 0x01;
    MArary[1] = 0x02;
    if (speed2 > 0) {
        MArary[2] = 0x02;
        speed2 = map(speed2,0,100,80,220);
        MArary[3] = speed2;
    }
    else if (speed2 < 0) {
        MArary[2] = 0x01;
        speed2 = -speed2;
        speed2 = map(speed2,0,100,80,220);
        MArary[3] = speed2;
    }
    else {
        MArary[2] = 0x00;
        MArary[3] = 0x00;
    }
    Wire.beginTransmission(0x52);
    Wire.write(MArary, 4);
    Wire.endTransmission();
    delay(10);
    Wire.beginTransmission(0x52);
    Wire.write(MArary, 4);
    Wire.endTransmission();   
}
#endif