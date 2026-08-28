#include "Weeecore.h"

WeCoMotor weCoMotor;//初始化电机
WeJoyandKey wejoy;
WeGyroscope gyro;

void setup() {
    Serial.begin(115200);
    
    if (!gyro.begin()){
        Serial.println("MPU6050初始化失败!");
        while(1);
    }
    Serial.println("MPU6050初始化成功!");
    // if (!weCoMotor.begin(0)) {//启动电机
    //     Serial.println("电机初始化失败！");
    // }
    // wejoy.begin(); 
}

void loop() {

    Serial.print("倾斜角(度) X: ");
    Serial.print(gyro.getTiltAngleX());
    Serial.print(" Y: ");
    Serial.print(gyro.getTiltAngleY());
    Serial.print(" Z: ");
    Serial.println(gyro.getTiltAngleZ());
//       if(wejoy.ispressed(Key_Middle))
//   {
//     weCoMotor.run(1,70);//电机1正转
//     weCoMotor.run(2,70);//电机2反转
//   }
//   else if(wejoy.ispressed(Key_A))
// {
//   weCoMotor.stop(1);
//   weCoMotor.stop(2);
// }
    // Serial.print("角速度(度/秒) X: ");
    // Serial.print(gyro.getGyroX());
    // Serial.print(" Y: ");
    // Serial.print(gyro.getGyroY());
    // Serial.print(" Z: ");
    // Serial.println(gyro.getGyroZ());
    
    // Serial.print("加速度(g) X: ");
    // Serial.print(gyro.getAccelX());
    // Serial.print(" Y: ");
    // Serial.print(gyro.getAccelY());
    // Serial.print(" Z: ");
    // Serial.println(gyro.getAccelZ());
     delay(1000);
}