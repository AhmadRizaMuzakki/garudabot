#include "WeESP32Mini.h"
#include "WeOneWire.h"

// 创建一个单总线对象，指定单总线通信端口
WeOneWire OW(PORT_A);

int s1 = 0;

// 封装函数：发送命令并读取返回值
int readOneWireData() {
    if (OW.reset() != 0) {  // 检查单总线是否正常
        return -1;          // 如果复位失败，返回-1
    }
    OW.write_byte(0x01);    // 发送命令
    OW.respond();           // 等待设备响应
    s1 = OW.read_byte();    // 读取返回值
    return s1;              // 返回读取的数据
}

void setup() {
    Serial.begin(115200);  // 初始化串口通信
}

void loop() {
    s1 = readOneWireData();  // 调用封装函数
    if (s1 != -1) {          // 如果读取成功
        Serial.print("s1:");
        Serial.println(s1);  // 打印读取的数据
    } else {
        Serial.println("Failed to read from OneWire device.");  // 如果读取失败，打印错误信息
    }
    delay(1000);  // 每秒读取一次
}