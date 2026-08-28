#ifndef AW9523Manager_h
#define AW9523Manager_h

#include "Arduino.h"
#include "Adafruit_Library/Adafruit_AW9523.h"

class AW9523Manager {
public:
    static AW9523Manager& getInstance() {
        static AW9523Manager instance;
        return instance;
    }

    bool begin();
    Adafruit_AW9523* getDevice();

private:
    AW9523Manager() {}
    ~AW9523Manager() {}
    AW9523Manager(const AW9523Manager&) = delete;
    AW9523Manager& operator=(const AW9523Manager&) = delete;

    Adafruit_AW9523 aw9523;
    bool isInitialized = false;
};

#endif