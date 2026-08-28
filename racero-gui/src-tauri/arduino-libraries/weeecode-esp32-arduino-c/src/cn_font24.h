#ifndef CN_FONT24_H
#define CN_FONT24_H

#include <stdint.h>

// 字库常量定义
#define FONT24_WIDTH 24
#define FONT24_HEIGHT 24
#define BYTES_PER_CHAR 72  // 24*24/8
#define CHARS_IN_FONT 7552  // 字库中的汉字数量
#define CN_FONT24_SIZE (CHARS_IN_FONT * BYTES_PER_CHAR)  // 总字节数

// 声明字库数据
extern const uint8_t cn_font24[];

#endif // CN_FONT24_H