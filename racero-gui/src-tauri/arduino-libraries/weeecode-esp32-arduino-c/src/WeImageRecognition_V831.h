#ifndef WeImageRecognition_V831_H
#define WeImageRecognition_V831_H

#include "WePort.h"

class WeImageRecognition_V831
{
public:
    WeImageRecognition_V831(uint8_t port=0);
    void reset(uint8_t port=0);
    bool faceDetection(void);
    bool faceRecognition(void);
    bool maskDetection(void);
    bool simpleGesture(void);
    bool moraGesture(void);
    bool getColorBall(int8_t index=0, uint16_t pixels_threshold = 500, uint16_t area_threshold = 200);
    bool getCustomColor(int8_t index=0, uint16_t pixels_threshold = 100, uint16_t area_threshold = 100);
    bool numberDetection(int8_t index=10);
    bool licensePlateDetection(void);
    bool getQRCode(void);
    bool getApriltag(uint8_t index=255);
    bool getBarCode(void);

    bool trafficCardDetection(void);
    bool objects20Detection(void);
    bool visionFollower(void);
    bool selfLearnClasses(void);

    void  setLightness(uint8_t value);
    bool face_mask;
    uint8_t face_num, id, prob;
    char *license_plate;
    char *qr_code;
    char *bar_code;
    int8_t angle;
    uint16_t x_rotation, y_rotation, z_rotation;
    uint16_t centerX,centerY,pixels,high,width,rotation,num;
private:
   WeOneWire _WeImageRecognition_V831;
   uint8_t set_flag = 0;
   uint8_t uartData[40]={0};
   int8_t lightness = -1;
   int8_t number_index = -1;
   int8_t apriltag_index = -1;
   int8_t ball_color_index = -1;
   int8_t custom_color_index = -1;
   uint16_t colorball_pixels_threshold = 0;
   uint16_t colorball_area_threshold = 0;
   uint16_t customcolor_pixels_threshold = 0;
   uint16_t customcolor_area_threshold = 0;

};

#endif
