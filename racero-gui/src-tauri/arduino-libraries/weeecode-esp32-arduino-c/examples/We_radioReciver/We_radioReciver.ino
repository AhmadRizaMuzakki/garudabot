#include <WeWirelessRadio.h>

WeWirelessRadio radio;

void onMessageReceived(MyData data) {//当接收到无线广播消息时
  if(strcmp(data.name, "print") == 0)
  {
  Serial.println(radio.getValueByName("name"));
  Serial.println(radio.getValueByName("age"));
  }
}

void setup() {
  Serial.begin(115200);
  radio.begin(5); 
  radio.onReceive(onMessageReceived); // 注册接收回调函数
}

void loop() {
  // 空闲
}