#ifdef ESP32

#include "WeSoftSerial.h"


WeSoftSerial::WeSoftSerial(uint8_t port){
    serial  = new HardwareSerial(SPEECH_SERIAL_PORT);
    wePort = port;
    data = "";    // 初始化数据
    name = "";    // 初始化名称
    value = "";   // 初始化值
}

bool WeSoftSerial::begin() {
    uint8_t SPEECH_RX_PIN,SPEECH_TX_PIN;
    if(wePort == 25)
    {   
        SPEECH_RX_PIN = 25;
        SPEECH_TX_PIN = 18;
    }else if(wePort == 33){
        SPEECH_RX_PIN = 33;
        SPEECH_TX_PIN = 17;
    }else if(wePort == 32){
        SPEECH_RX_PIN = 32;
        SPEECH_TX_PIN = 16;
    }else if(wePort == 26){
        SPEECH_RX_PIN = 26;
        SPEECH_TX_PIN = 4;
    }
    serial->begin(115200,SERIAL_8N1,SPEECH_RX_PIN,SPEECH_TX_PIN);
    return true;
}

void WeSoftSerial::send(const char* name, const char* value){
    serial->print(String(value));
}


bool WeSoftSerial::available(){
    return serial->available();
}

String WeSoftSerial::readData(){
    data = serial->readStringUntil('&');
    data.trim();
    parseData();  // 读取数据后自动解析
    return data;
}

void WeSoftSerial::parseData() {
    
    // 查找第一个逗号的位置
    int firstComma = data.indexOf(',');
    if (firstComma != -1) {
        // 提取名称（逗号前的部分）
        name = data.substring(0, firstComma);
        
        // 提取值（逗号后的部分）
        value = data.substring(firstComma + 1);
    } else {
        // 如果没有找到逗号，说明数据格式不正确
        name = "";
        value = "";
    }
}

// 返回完整值
String WeSoftSerial::getValue() {
    return value;
}

// 返回名称
String WeSoftSerial::getName() {
    return name;
}

// 根据索引返回值
String WeSoftSerial::getValueByIndex(int index) {
    if(index < 0 || index >= getValueIndexCount()) {
        return "";
    }
    int start = 0;
    int end = 0;
    int currentIndex = 0;
    
    for(int i = 0; i < value.length(); i++) {
        if(value[i] == ',') {
            if(currentIndex == index) {
                end = i;
                break;
            }
            start = i + 1;
            currentIndex++;
        }
    }
    
    if(currentIndex == index) {
        return value.substring(start);
    }
    
    return value.substring(start, end);
}

// 返回值的索引数
int WeSoftSerial::getValueIndexCount() {
    int count = 1;
    for(int i = 0; i < value.length(); i++) {
        if(value[i] == ',') {
            count++;
        }
    }
    return count;
}

#endif


