#include "WeESP32Mini.h"
#include "WeSoftSerial.h"

WeSoftSerial serial_A(PORT_A);
String data;

void setup() {
  serial_A.begin();  // 使能RJ11有线通信
  Serial.begin(115200);
}

void loop() {
  if(serial_A.available()) {  // 当接受到数据
     data = serial_A.readData();  // 接收的数据，String类型
     Serial.println(data);
    
    // 获取RGB值
    int R = 0, G = 0, B = 0;
    int value = serial_A.getValue().toInt();  // 使用getValue()函数
    int count = serial_A.getValueIndexCount();

    if(count >= 3) {  // 确保有足够的值
      R = serial_A.getValueByIndex(0).toInt();
      G = serial_A.getValueByIndex(1).toInt();
      B = serial_A.getValueByIndex(2).toInt();
      
      if(R != 0 || G != 0 || B != 0) {
        Serial.print("RGB:");
        Serial.print(R);
        Serial.print(" ");
        Serial.print(G);
        Serial.print(" ");
        Serial.println(B);
      }
    }
    
    // 检查门的状态
    if(serial_A.getName() == "door") {  // 使用getName()函数
      int doorState = value;
      if(doorState == 1) {
        Serial.println("打开大门");
      }
      else if(doorState == 2) {
        Serial.println("关闭大门");
      }
    }
    
    // 处理温度和湿度请求
    if(data == "temp,1") {
      serial_A.send("temp", "32");
    }
    if(data == "humi,1") {
      serial_A.send("humi", "87");
    }
  }
}