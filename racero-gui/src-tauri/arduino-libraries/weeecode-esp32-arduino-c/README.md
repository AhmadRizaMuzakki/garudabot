# Arduino & ESP32 支持库介绍

## 概述

本支持库专为Arduino和ESP32设计，使用Arduino IDE进行编译，并支持WeeeCode图形化编程。该库旨在简化开发流程，提高开发效率，同时提供对多种开发板和模块的支持。

## 支持的主控

以下是 Weeemake 系列产品中本库支持的主控列表：

- **ELF328P**
- **ELF2560**
- **ELFMini**
- **ESP32Mini**
- **ESP32Pro**
- **Weeecore**


## 支持的模块

以下是 Weeemake 系列产品中本库支持的模块列表：

- **RGB超声波模块**
- **Adapter**
- **DC Motor**
- **语音合成V2.0**
- **语音识别V2.0**
- **光线传感器**
- **大气压模块**
- **130风扇模块**
- **光线传感器**
- **声音传感器**
- **红外接收传感器**
- **蜂鸣器**
- **板载按键**
- **板载RGB灯**
- **双路巡线传感器**
- **红外遥控器**
- **超声波模块**
- **weeecore手柄**
- **weeecore板载声音和光线**
- **weeecore陀螺仪**
- **weeecoreRGB**
- **weeecoreLCD**
- **weeecore语音识别**
- **weeecore电机**
- **天气**
- **联网Socket**
- **无线电模块**

## 安装方法

## 安装指南

### Arduino IDE 安装

1. 打开Arduino IDE。
2. 进入“文件” > “首选项”。
3. 在“附加开发板管理器网址”字段中，粘贴我们的库URL。
4. 点击“确定”并关闭首选项窗口。
5. 进入“工具” > “开发板” > “开发板管理器”。
6. 搜索我们的库名称，并安装。

### WeeeCode 安装

1. 访问WeeCode官方网站下载并安装WeeCode。
2. 在WeeCode中，选择“添加库”并搜索我们的库名称。
3. 选择库并点击“安装”。

## 使用示例

以下是如何使用本支持库的一个简单示例，控制两个DC Motor：

```cpp
#include <WeESP32Pro.h>

WeDCMotor dc_1(1);
WeDCMotor dc_2(2);

void setup() {
  dc_1.run(100); // 设置电机1的速度为100
  dc_2.run(100); // 设置电机2的速度为100
}

void loop() {
  // 循环中可以添加更多的控制代码
}

## 注意事项