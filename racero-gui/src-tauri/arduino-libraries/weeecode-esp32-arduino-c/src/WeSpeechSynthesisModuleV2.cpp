#ifdef ESP32

#include "WeSpeechSynthesisModuleV2.h"
#include <HardwareSerial.h>

HardwareSerial speech_serialV2(1);
WeSpeechSynthesisModuleV2::WeSpeechSynthesisModuleV2(uint8_t port)
{
  reset(port);
}

void WeSpeechSynthesisModuleV2::reset(uint8_t port)
{
    speech_serialV2.begin(115200, SERIAL_8N1, -1, port);
}

void WeSpeechSynthesisModuleV2::beginSpeek(uint8_t len)
{
  speech_serialV2.write(0xFD);   // 帧头
  speech_serialV2.write((len+2)>>8);   // 数据长度
  speech_serialV2.write((len+2) & 0xff);        //

  speech_serialV2.write(0x01);    // 命令字
  speech_serialV2.write(0x01);    // 命令参数
}

// 语音合成
void WeSpeechSynthesisModuleV2::speek(uint8_t *data_in, uint8_t len)
{
  beginSpeek(len);
  for(int i=0; i<len; i++){   // 文本标记+文字字符串GBK
    speech_serialV2.write(data_in[i]);
  }
}

// 语音合成 数据来自Flash
void WeSpeechSynthesisModuleV2::speekForFlash(const PROGMEM uint8_t *data_in, uint8_t len)
{
  beginSpeek(len);
  for(int i=0; i<len; i++){   // 文本标记+文字字符串GBK
    speech_serialV2.write(pgm_read_byte(&data_in[i]));
  }
}



// 播放提示音
void WeSpeechSynthesisModuleV2::playSound(uint8_t *data_in, uint8_t len, uint16_t t_ms)
{
  speek(data_in, len);
  delay(t_ms);
}

#else



#include "WeSpeechSynthesisModuleV2.h"


// 构建函数，创建连接对象，确定端口和波特率
WeSpeechSynthesisModuleV2::WeSpeechSynthesisModuleV2(uint8_t port)
{
  _tx_delay=0;
  setTX(port);
  begin(115200);
}

void WeSpeechSynthesisModuleV2::beginSpeek(uint8_t len)
{
  write(0xFD);   // 帧头
  //文本长度+两位命令字长度
  write((len+2)>>8);   // 数据长度
  write((len+2) & 0xff);

  write(0x01);    // 命令字
  write(0x01);    // 命令参数
}

// 语音合成
void WeSpeechSynthesisModuleV2::speek(uint8_t *data_in, uint8_t len)
{
	
	//发送帧头
	beginSpeek(len);
	//发送数据
	for(int i=0; i<len; i++){   //文字字符串GBK
		write(data_in[i]);
	}
}// 语音合成
void WeSpeechSynthesisModuleV2::speekForFlash(uint8_t *data_in, uint8_t len)
{
  
  //发送帧头
  beginSpeek(len);
  //发送数据
  for(int i=0; i<len; i++){   //文字字符串GBK
    write(pgm_read_byte(&data_in[i]));
  }
}



// 私有函数
void WeSpeechSynthesisModuleV2::setTX(uint8_t tx)
{
  digitalWrite(tx, HIGH);
  pinMode(tx, OUTPUT);
  _transmitBitMask = digitalPinToBitMask(tx);
  uint8_t port = digitalPinToPort(tx);
  _transmitPortRegister = portOutputRegister(port);
}

uint16_t WeSpeechSynthesisModuleV2::subtract_cap(uint16_t num, uint16_t sub) {
  if (num > sub)
    return num - sub;
  else
    return 1;
}

void WeSpeechSynthesisModuleV2::begin(long speed)
{
  _tx_delay = 0;
  uint16_t bit_delay = (F_CPU / speed) / 4;
  _tx_delay = subtract_cap(bit_delay, 15 / 4);
}

/* static */ 
inline void WeSpeechSynthesisModuleV2::tunedDelay(uint16_t delay) { 
  _delay_loop_2(delay);
}

size_t WeSpeechSynthesisModuleV2::write(uint8_t b)
{
  if (_tx_delay == 0) {
    return 0;
  }

  volatile uint8_t *reg = _transmitPortRegister;
  uint8_t reg_mask = _transmitBitMask;
  uint8_t inv_mask = ~_transmitBitMask;
  uint8_t oldSREG = SREG;
  uint16_t delay = _tx_delay;

  cli();  // turn off interrupts for a clean txmit
  *reg &= inv_mask;

  tunedDelay(delay);

  // Write each of the 8 bits
  for (uint8_t i = 8; i > 0; --i)
  {
    if (b & 1) // choose bit
      *reg |= reg_mask; // send 1
    else
      *reg &= inv_mask; // send 0

    tunedDelay(delay);
    b >>= 1;
  }

  *reg |= reg_mask;

  SREG = oldSREG; // turn interrupts back on
  tunedDelay(_tx_delay);
  
  return 1;
}

#endif