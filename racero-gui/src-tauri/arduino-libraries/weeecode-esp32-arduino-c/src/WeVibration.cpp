#include "WeVibration.h"

// 构造函数实现
WeVibration::WeVibration(uint8_t port)
{
    _WeVibration.reset(port);
}

void WeVibration::reset(uint8_t port)
{
    _WeVibration.reset(port);
}

// 开启振动
void WeVibration::enable()
{
    if(_WeVibration.reset() != 0) return;//开启
    _WeVibration.write_byte(0x02);
}

// 关闭振动
void WeVibration::disable()
{
    if(_WeVibration.reset() != 0) return;//开启
    _WeVibration.write_byte(0x03);
}