
#ifndef _WeMultipleGrayscaleSensor_H
#define _WeMultipleGrayscaleSensor_H

#include "WePort.h"
class WeMultipleGrayscaleSensor
{
public:

  WeMultipleGrayscaleSensor(uint8_t port=0);
  void reset(uint8_t port=0);
  void setAccurary(uint8_t value=5);  // 设置精度
  void startRead(uint8_t index=0);  // 更新数据: 0-数字值, 1-模拟值
  void setRGB(uint8_t value=1); // 设置RGB灯, 1-R,2-G,3-B
  uint16_t S1,S2,S3,S4;

private:
   WeOneWire _WeMultipleGrayscaleSensor;
};

#endif
