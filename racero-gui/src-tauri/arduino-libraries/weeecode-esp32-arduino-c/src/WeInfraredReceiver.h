/*
 * IR.h
 *
 *  Created on: 11.08.2017
 *      Author: Wolle
 */

#ifndef WeIR_H_
#define WeIR_H_

#ifdef ESP32

#include "Arduino.h"
#include <vector>
extern __attribute__((weak)) void ir_res(uint32_t res);
extern __attribute__((weak)) void ir_number(const char*);
extern __attribute__((weak)) void ir_key(const char*);

/* NEC Code table */
#define IR_CONTROLLER_A         (0x45)
#define IR_CONTROLLER_B         (0x46)
#define IR_CONTROLLER_C         (0x47)
#define IR_CONTROLLER_D         (0x44)
#define IR_CONTROLLER_UP        (0x40)
#define IR_CONTROLLER_E         (0x43)
#define IR_CONTROLLER_LEFT      (0x07)
#define IR_CONTROLLER_OK        (0x15)
#define IR_CONTROLLER_RIGHT     (0x09)
#define IR_CONTROLLER_DOWN      (0x19)
#define IR_CONTROLLER_F     (0x0D)
#define IR_CONTROLLER_0     (0x16)
#define IR_CONTROLLER_1     (0x0C)
#define IR_CONTROLLER_2     (0x18)
#define IR_CONTROLLER_3     (0x5E)
#define IR_CONTROLLER_4     (0x08)
#define IR_CONTROLLER_5     (0x1C)
#define IR_CONTROLLER_6     (0x5A)
#define IR_CONTROLLER_7     (0x42)
#define IR_CONTROLLER_8     (0x52)
#define IR_CONTROLLER_9     (0x4A)

// prototypes
void IRAM_ATTR isr_WeIR();

struct ir_btn{
    uint8_t val;
    char    ch;
};
typedef ir_btn irBtn_t;

class WeInfraredReceiver {

    private:
        boolean  f_entry=false;  // entryflag
        boolean  f_send=false;   // entryflag
        uint32_t t0;
        uint32_t ir_num=0;

        uint8_t  ir_result;
        uint8_t  idx=0;
        char     ir_resultstr[10];
        uint16_t downcount=0;
        int8_t   tmp_resp =(-1);


    protected:
        irBtn_t ir_buttons[20];
    public:
        WeInfraredReceiver(uint8_t IR_PIN);
        ~WeInfraredReceiver();
        void reset(uint8_t port=0);
        void begin();
        void defineButtons(irBtn_t* b);
        void setIRresult(uint8_t result);
        uint8_t getValue(void);
        void loop();
        boolean isKeyPressed(uint8_t key);
        uint8_t IR_VALUE;
        int8_t   ir_pin;
        boolean ir_repeat;


};

#else
#include "WePort.h"

/* NEC Code table */
#define IR_CONTROLLER_A         (0x45)
#define IR_CONTROLLER_B         (0x46)
#define IR_CONTROLLER_C         (0x47)
#define IR_CONTROLLER_D         (0x44)
#define IR_CONTROLLER_UP        (0x40)
#define IR_CONTROLLER_E         (0x43)
#define IR_CONTROLLER_LEFT      (0x07)
#define IR_CONTROLLER_OK        (0x15)
#define IR_CONTROLLER_RIGHT     (0x09)
#define IR_CONTROLLER_DOWN      (0x19)
#define IR_CONTROLLER_F     (0x0D)
#define IR_CONTROLLER_0     (0x16)
#define IR_CONTROLLER_1     (0x0C)
#define IR_CONTROLLER_2     (0x18)
#define IR_CONTROLLER_3     (0x5E)
#define IR_CONTROLLER_4     (0x08)
#define IR_CONTROLLER_5     (0x1C)
#define IR_CONTROLLER_6     (0x5A)
#define IR_CONTROLLER_7     (0x42)
#define IR_CONTROLLER_8     (0x52)
#define IR_CONTROLLER_9     (0x4A)

#define RAWBUF 100 // Length of raw duration buffer
#define MARK  0
#define SPACE 1
#define NEC_BITS 32

#define USECPERTICK 50  // microseconds per clock interrupt tick
#define RAWBUF 100 // Length of raw duration buffer

typedef enum {ERROR = 0, SUCCESS = !ERROR} ErrorStatus;
#define NEC_HDR_MARK	9000
#define NEC_HDR_SPACE	4500
#define NEC_BIT_MARK	560
#define NEC_ONE_SPACE	1600
#define NEC_ZERO_SPACE	560
#define NEC_RPT_SPACE	2250
#define NEC_RPT_PERIOD	110000

// receiver states
#define STATE_IDLE     2
#define STATE_MARK     3
#define STATE_SPACE    4
#define STATE_STOP     5

// receiver states
#define STATE_IDLE     2
#define STATE_MARK     3
#define STATE_SPACE    4
#define STATE_STOP     5

#define NEC 1

#ifdef F_CPU
#define SYSCLOCK F_CPU     // main Arduino clock
#else
#define SYSCLOCK 16000000  // main Arduino clock
#endif

#define _GAP 5000 // Minimum map between transmissions
#define GAP_TICKS (_GAP/USECPERTICK)


#define TIMER_DISABLE_INTR   (TIMSK2 = 0)
#define TIMER_ENABLE_PWM     (TCCR2A |= _BV(COM2B1))
#define TIMER_DISABLE_PWM    (TCCR2A &= ~(_BV(COM2B1)))
#define TIMER_ENABLE_INTR    (TIMSK2 = _BV(OCIE2A))
#define TIMER_DISABLE_INTR   (TIMSK2 = 0)
#define TIMER_INTR_NAME      TIMER2_COMPA_vect
#define TIMER_CONFIG_KHZ(val) ({ \
  const uint8_t pwmval = F_CPU / 2000 / (val); \
  TCCR2A = _BV(WGM20); \
  TCCR2B = _BV(WGM22) | _BV(CS20); \
  OCR2A = pwmval; \
  OCR2B = pwmval / 3; \
})
#define TIMER_COUNT_TOP      (SYSCLOCK * USECPERTICK / 1000000)
#if (TIMER_COUNT_TOP < 256)
#define TIMER_CONFIG_NORMAL() ({ \
	  TCCR2A = _BV(WGM21); \
	  TCCR2B = _BV(CS20); \
	  OCR2A = TIMER_COUNT_TOP; \
	  TCNT2 = 0; \
	})
#else
#define TIMER_CONFIG_NORMAL() ({ \
	  TCCR2A = _BV(WGM21); \
	  TCCR2B = _BV(CS21); \
	  OCR2A = TIMER_COUNT_TOP / 8; \
	  TCNT2 = 0; \
	})
#endif
// information for the interrupt handler
typedef struct {
  uint8_t recvpin;           // pin for IR data from detector
  volatile uint8_t rcvstate;          // state machine
  volatile uint32_t lastTime;
  unsigned int timer;     // 
  volatile uint8_t rawbuf[RAWBUF]; // raw data
  volatile uint8_t rawlen;         // counter of entries in rawbuf
} 
irparams_t;


class WeInfraredReceiver
{
public:

  WeInfraredReceiver(uint8_t port=0);
  void reset(uint8_t port=0);
  
  int8_t decode_type; // NEC, SONY, RC5, UNKNOWN
  unsigned long value; // Decoded value
  uint8_t bits; // Number of bits in decoded value
  volatile uint8_t *rawbuf; // Raw intervals in .5 us ticks
  int rawlen; // Number of records in rawbuf.

  ErrorStatus decode();
  void begin(void);
  ErrorStatus loop();
  bool isKeyPressed(uint8_t key);
  uint8_t getValue(void);
  ErrorStatus decodeNEC();
   
  
 private:
  uint8_t IR_VALUE;
	//volatile uint8_t _RxPin;
};

#endif

#endif /* IR_H_ */
