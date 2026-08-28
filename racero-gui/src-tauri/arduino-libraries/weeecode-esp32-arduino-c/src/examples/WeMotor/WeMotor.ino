#include "WeMotor.h"

// 创建两个电机对象
WeMotor motor1(6, 7);  // 电机1使用D6和D7引脚
WeMotor motor2(8, 9);  // 电机2使用D8和D9引脚

void setup() {
    // 初始化串口
    Serial.begin(9600);
    
    // 初始化电机
    motor1.begin();
    motor2.begin();
    
    Serial.println("电机控制程序已启动");
    Serial.println("输入格式：M1,速度 或 M2,速度");
    Serial.println("速度范围：-255到255");
    Serial.println("例如：M1,100 或 M2,-200");
}

void loop() {
    if (Serial.available() > 0) {
        String command = Serial.readStringUntil('\n');
        command.trim();
        
        // 解析命令
        if (command.startsWith("M1,")) {
            int speed = command.substring(3).toInt();
            motor1.setSpeed(speed);
            Serial.print("电机1速度设置为: ");
            Serial.println(speed);
        }
        else if (command.startsWith("M2,")) {
            int speed = command.substring(3).toInt();
            motor2.setSpeed(speed);
            Serial.print("电机2速度设置为: ");
            Serial.println(speed);
        }
        else if (command == "STOP") {
            motor1.stop();
            motor2.stop();
            Serial.println("所有电机已停止");
        }
    }
} 