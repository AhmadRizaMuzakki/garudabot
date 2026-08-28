
#ifndef WeSpeechRecognition_H
#define WeSpeechRecognition_H

#include "WePort.h"

class WeSpeechRecognition
{
public:

   WeSpeechRecognition(uint8_t port=0);
   void reset(uint8_t port=0);
   void setKeyword(String str);
   void setKeyword( const char *str);
   void setPassword(int8_t list,const char *str);
   void setPassword(int8_t list,String str);
   uint16_t readvfour(void);
   uint8_t  read(void);
   void setTriggerMode(uint8_t mode);
   void beginTrigger(void);
   void stopTrigger(void);
   uint8_t setValue(uint8_t sensor,uint8_t value);
   uint8_t readForMulti(void);

 private:
	WeOneWire _WeSpeechRecognition;
	volatile uint8_t DATA_A=40;
};

#endif
