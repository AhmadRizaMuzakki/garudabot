#ifndef _WeRFIDModule_H
#define _WeRFIDModule_H

#include "WePort.h"

typedef struct 
{
    uint8_t status;
    String  ids;
    uint32_t id;
    /* data */
}WeRFID;

class WeRFIDModule
{
public:
    WeRFIDModule(uint8_t port=0);
    void reset(uint8_t port=0);
    void startReadOne(void);
    void startReadWhile(void);
    uint32_t getUID();
    String getUIDString();
    uint8_t getStatus();
private:
    WeOneWire _WeRFIDModule;
    WeRFID read(void);
    uint32_t UIDNumber;
    String UIDString;
    uint8_t status;
    uint32_t lastIds = 0xFFFFFFFF;  // 初始值设为无效值
};

#endif
