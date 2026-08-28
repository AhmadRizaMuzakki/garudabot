#include "WeImageRecognition_V831.h"

WeImageRecognition_V831::WeImageRecognition_V831(uint8_t port)
{
   reset(port);
}

void WeImageRecognition_V831::reset(uint8_t port)
{
   _WeImageRecognition_V831.reset(port);
   set_flag = 0;
}

bool WeImageRecognition_V831::faceDetection(void)
{
    if (set_flag != 1){
        set_flag = 1;
        if(_WeImageRecognition_V831.reset()!=0)return 0;
        _WeImageRecognition_V831.write_byte(0x03);
        if(_WeImageRecognition_V831.reset()!=0)return 0;
        _WeImageRecognition_V831.write_byte(0x00);
        _WeImageRecognition_V831.write_byte(0x00);
        if(_WeImageRecognition_V831.reset()!=0)return 0;
        _WeImageRecognition_V831.write_byte(0x05);
        if(_WeImageRecognition_V831.reset()!=0)return 0;
        _WeImageRecognition_V831.write_byte(20);
    }
    delay(10);
    if(_WeImageRecognition_V831.reset()!=0)return 0;
    _WeImageRecognition_V831.write_byte(0x02);
    _WeImageRecognition_V831.respond();
    uint8_t data_len = _WeImageRecognition_V831.read_byte();
    if(data_len == 0){
        return 0;
    }
    for(int i=0; i<data_len; i++){
        uartData[i] =  _WeImageRecognition_V831.read_byte();
    }
    face_num = uartData[0];
    centerX = uartData[1];
    centerY = uartData[2];
    high = uartData[3];
    width = uartData[4];
    return 1;
}

bool WeImageRecognition_V831::faceRecognition(void)
{
    if (set_flag != 2){
        set_flag = 2;
        if(_WeImageRecognition_V831.reset()!=0)return 0;
        _WeImageRecognition_V831.write_byte(0x03);
        if(_WeImageRecognition_V831.reset()!=0)return 0;
        _WeImageRecognition_V831.write_byte(0x00);
        _WeImageRecognition_V831.write_byte(0x01);
        if(_WeImageRecognition_V831.reset()!=0)return 0;
        _WeImageRecognition_V831.write_byte(0x05);
        if(_WeImageRecognition_V831.reset()!=0)return 0;
        _WeImageRecognition_V831.write_byte(20);
    }
    delay(10);
    if(_WeImageRecognition_V831.reset()!=0)return 0;
    _WeImageRecognition_V831.write_byte(0x02);
    _WeImageRecognition_V831.respond();
    uint8_t data_len = _WeImageRecognition_V831.read_byte();
    if(data_len == 0){
        return 0;
    }
    for(int i=0; i<data_len; i++){
        uartData[i] =  _WeImageRecognition_V831.read_byte();
    }
    id = uartData[0];
    prob = uartData[1];
    return 1;
}

bool WeImageRecognition_V831::maskDetection(void)
{
    if (set_flag != 3){
        set_flag = 3;
        if(_WeImageRecognition_V831.reset()!=0)return 0;
        _WeImageRecognition_V831.write_byte(0x03);
        if(_WeImageRecognition_V831.reset()!=0)return 0;
        _WeImageRecognition_V831.write_byte(0x00);
        _WeImageRecognition_V831.write_byte(0x02);
        if(_WeImageRecognition_V831.reset()!=0)return 0;
        _WeImageRecognition_V831.write_byte(0x05);
        if(_WeImageRecognition_V831.reset()!=0)return 0;
        _WeImageRecognition_V831.write_byte(20);
    }
    delay(10);
    if(_WeImageRecognition_V831.reset()!=0)return 0;
    _WeImageRecognition_V831.write_byte(0x02);
    _WeImageRecognition_V831.respond();
    uint8_t data_len = _WeImageRecognition_V831.read_byte();
    if(data_len == 0){
        return 0;
    }
    for(int i=0; i<data_len; i++){
        uartData[i] =  _WeImageRecognition_V831.read_byte();
    }
    face_mask = uartData[0];

    return 1;
}

bool WeImageRecognition_V831::simpleGesture(void)
{
    if (set_flag != 4){
        set_flag = 4;
        if(_WeImageRecognition_V831.reset()!=0)return 0;
        _WeImageRecognition_V831.write_byte(0x03);
        if(_WeImageRecognition_V831.reset()!=0)return 0;
        _WeImageRecognition_V831.write_byte(0x01);
        _WeImageRecognition_V831.write_byte(0x00);
        if(_WeImageRecognition_V831.reset()!=0)return 0;
        _WeImageRecognition_V831.write_byte(0x05);
        if(_WeImageRecognition_V831.reset()!=0)return 0;
        _WeImageRecognition_V831.write_byte(30);
    }
    delay(10);
    if(_WeImageRecognition_V831.reset()!=0)return 0;
    _WeImageRecognition_V831.write_byte(0x02);
    _WeImageRecognition_V831.respond();
    uint8_t data_len = _WeImageRecognition_V831.read_byte();
    if(data_len == 0){
        return 0;
    }
    for(int i=0; i<data_len; i++){
        uartData[i] =  _WeImageRecognition_V831.read_byte();
    }
    id = uartData[0];
    prob = uartData[1];
    centerX = uartData[2];
    centerY = uartData[3];
    high = uartData[4];
    width = uartData[5];
    return 1;
}

bool WeImageRecognition_V831::moraGesture(void)
{
    if (set_flag != 5){
        set_flag = 5;
        if(_WeImageRecognition_V831.reset()!=0)return 0;
        _WeImageRecognition_V831.write_byte(0x03);
        if(_WeImageRecognition_V831.reset()!=0)return 0;
        _WeImageRecognition_V831.write_byte(0x01);
        _WeImageRecognition_V831.write_byte(0x01);
        if(_WeImageRecognition_V831.reset()!=0)return 0;
        _WeImageRecognition_V831.write_byte(0x05);
        if(_WeImageRecognition_V831.reset()!=0)return 0;
        _WeImageRecognition_V831.write_byte(30);
    }
    delay(10);
    if(_WeImageRecognition_V831.reset()!=0)return 0;
    _WeImageRecognition_V831.write_byte(0x02);
    _WeImageRecognition_V831.respond();
    uint8_t data_len = _WeImageRecognition_V831.read_byte();
    if(data_len == 0){
        return 0;
    }
    for(int i=0; i<data_len; i++){
        uartData[i] =  _WeImageRecognition_V831.read_byte();
    }
    id = uartData[0];
    prob = uartData[1];
    centerX = uartData[2];
    centerY = uartData[3];
    high = uartData[4];
    width = uartData[5];
    return 1;
}

// index:0~5, 0:任意颜色,
bool WeImageRecognition_V831::getColorBall(int8_t index, uint16_t pixels_threshold, uint16_t area_threshold)
{
  if (set_flag != 6){
      set_flag = 6;
      if(_WeImageRecognition_V831.reset()!=0)return 0;
      _WeImageRecognition_V831.write_byte(0x03);
      if(_WeImageRecognition_V831.reset()!=0)return 0;
      _WeImageRecognition_V831.write_byte(0x02);
      _WeImageRecognition_V831.write_byte(0x00);
      if(_WeImageRecognition_V831.reset()!=0)return 0;
      _WeImageRecognition_V831.write_byte(0x05);
      if(_WeImageRecognition_V831.reset()!=0)return 0;
      _WeImageRecognition_V831.write_byte(40);
  }
  if (ball_color_index!=index) {
    if(_WeImageRecognition_V831.reset()!=0)return 0;
    _WeImageRecognition_V831.write_byte(0x04);
    if(_WeImageRecognition_V831.reset()!=0)return 0;
    _WeImageRecognition_V831.write_byte(index);
    ball_color_index = index;
  }
  if (colorball_pixels_threshold!=pixels_threshold) {
    if(_WeImageRecognition_V831.reset()!=0)return 0;
    _WeImageRecognition_V831.write_byte(0x06);
    if(_WeImageRecognition_V831.reset()!=0)return 0;
    _WeImageRecognition_V831.write_byte(pixels_threshold>>8);
    _WeImageRecognition_V831.write_byte(pixels_threshold);
    colorball_pixels_threshold = pixels_threshold;
  }
  if (colorball_area_threshold!=area_threshold) {
    if(_WeImageRecognition_V831.reset()!=0)return 0;
    _WeImageRecognition_V831.write_byte(0x07);
    if(_WeImageRecognition_V831.reset()!=0)return 0;
    _WeImageRecognition_V831.write_byte(area_threshold>>8);
    _WeImageRecognition_V831.write_byte(area_threshold);
    colorball_area_threshold = area_threshold;
  }
  delay(20);
  if(_WeImageRecognition_V831.reset()!=0)return 0;
  _WeImageRecognition_V831.write_byte(0x02);
  _WeImageRecognition_V831.respond();
  uint8_t data_len = _WeImageRecognition_V831.read_byte();
  if(data_len == 0){
      return 0;
  }
  for(int i=0; i<data_len; i++){
      uartData[i] =  _WeImageRecognition_V831.read_byte();
  }
  id = uartData[0];
  pixels = uartData[1] << 8 | uartData[2];
  centerX = uartData[3];
  centerY = uartData[4];
  high = uartData[5];
  width = uartData[6];
  return 1;
}

bool WeImageRecognition_V831::getCustomColor(int8_t index, uint16_t pixels_threshold, uint16_t area_threshold)
{
  if (set_flag != 7){
      set_flag = 7;
      if(_WeImageRecognition_V831.reset()!=0)return 0;
      _WeImageRecognition_V831.write_byte(0x03);
      if(_WeImageRecognition_V831.reset()!=0)return 0;
      _WeImageRecognition_V831.write_byte(0x02);
      _WeImageRecognition_V831.write_byte(0x01);
      if(_WeImageRecognition_V831.reset()!=0)return 0;
      _WeImageRecognition_V831.write_byte(0x05);
      if(_WeImageRecognition_V831.reset()!=0)return 0;
      _WeImageRecognition_V831.write_byte(40);
  }
  if (custom_color_index!=index) {
    if(_WeImageRecognition_V831.reset()!=0)return 0;
    _WeImageRecognition_V831.write_byte(0x04);
    if(_WeImageRecognition_V831.reset()!=0)return 0;
    _WeImageRecognition_V831.write_byte(index);
    custom_color_index = index;
  }
  if (customcolor_pixels_threshold!=pixels_threshold) {
    if(_WeImageRecognition_V831.reset()!=0)return 0;
    _WeImageRecognition_V831.write_byte(0x06);
    if(_WeImageRecognition_V831.reset()!=0)return 0;
    _WeImageRecognition_V831.write_byte(pixels_threshold>>8);
    _WeImageRecognition_V831.write_byte(pixels_threshold);
    customcolor_pixels_threshold = pixels_threshold;
  }
  if (customcolor_area_threshold!=area_threshold) {
    if(_WeImageRecognition_V831.reset()!=0)return 0;
    _WeImageRecognition_V831.write_byte(0x07);
    if(_WeImageRecognition_V831.reset()!=0)return 0;
    _WeImageRecognition_V831.write_byte(area_threshold>>8);
    _WeImageRecognition_V831.write_byte(area_threshold);
    customcolor_area_threshold = area_threshold;
  }
  delay(15);
  if(_WeImageRecognition_V831.reset()!=0)return 0;
  _WeImageRecognition_V831.write_byte(0x02);
  _WeImageRecognition_V831.respond();
  uint8_t data_len = _WeImageRecognition_V831.read_byte();
  if(data_len == 0){
      return 0;
  }
  for(int i=0; i<data_len; i++){
      uartData[i] =  _WeImageRecognition_V831.read_byte();
  }
  id = uartData[0];
  pixels = uartData[1] << 8 | uartData[2];
  centerX = uartData[3];
  centerY = uartData[4];
  high = uartData[5];
  width = uartData[6];
  return 1;
}

bool WeImageRecognition_V831::numberDetection(int8_t index)
{
  if (set_flag != 8){
      set_flag = 8;
      if(_WeImageRecognition_V831.reset()!=0)return 0;
      _WeImageRecognition_V831.write_byte(0x03);
      if(_WeImageRecognition_V831.reset()!=0)return 0;
      _WeImageRecognition_V831.write_byte(0x03);
      _WeImageRecognition_V831.write_byte(0x00);
      if(_WeImageRecognition_V831.reset()!=0)return 0;
      _WeImageRecognition_V831.write_byte(0x05);
      if(_WeImageRecognition_V831.reset()!=0)return 0;
      _WeImageRecognition_V831.write_byte(30);
  }
  if (number_index!=index) {
    if(_WeImageRecognition_V831.reset()!=0)return 0;
    _WeImageRecognition_V831.write_byte(0x04);
    if(_WeImageRecognition_V831.reset()!=0)return 0;
    _WeImageRecognition_V831.write_byte(index);
    number_index = index;
  }
  delay(10);
  if(_WeImageRecognition_V831.reset()!=0)return 0;
  _WeImageRecognition_V831.write_byte(0x02);
  _WeImageRecognition_V831.respond();
  uint8_t data_len = _WeImageRecognition_V831.read_byte();
  if(data_len == 0){
      return 0;
  }
  for(int i=0; i<data_len; i++){
      uartData[i] =  _WeImageRecognition_V831.read_byte();
  }
  id = uartData[0]-0x30;
  prob = uartData[1];
  centerX = uartData[2];
  centerY = uartData[3];
  high = uartData[4];
  width = uartData[5];
  return 1;
}

bool WeImageRecognition_V831::licensePlateDetection(void)
{
  if (set_flag != 9){
      set_flag = 9;
      if(_WeImageRecognition_V831.reset()!=0)return 0;
      _WeImageRecognition_V831.write_byte(0x03);
      if(_WeImageRecognition_V831.reset()!=0)return 0;
      _WeImageRecognition_V831.write_byte(0x03);
      _WeImageRecognition_V831.write_byte(0x01);
      if(_WeImageRecognition_V831.reset()!=0)return 0;
      _WeImageRecognition_V831.write_byte(0x05);
      if(_WeImageRecognition_V831.reset()!=0)return 0;
      _WeImageRecognition_V831.write_byte(40);
  }
  delay(10);
  if(_WeImageRecognition_V831.reset()!=0)return 0;
  _WeImageRecognition_V831.write_byte(0x02);
  _WeImageRecognition_V831.respond();
  uint8_t data_len = _WeImageRecognition_V831.read_byte();
  if(data_len == 0){
      return 0;
  }
  for(int i=0; i<data_len; i++){
      uartData[i] =  _WeImageRecognition_V831.read_byte();
  }
  uartData[data_len] = '\0';
  license_plate = reinterpret_cast<char*>(uartData);
  return 1;
}

bool WeImageRecognition_V831::getQRCode(void)
{
  if (set_flag != 10){
      set_flag = 10;
      if(_WeImageRecognition_V831.reset()!=0)return 0;
      _WeImageRecognition_V831.write_byte(0x03);
      if(_WeImageRecognition_V831.reset()!=0)return 0;
      _WeImageRecognition_V831.write_byte(0x04);
      _WeImageRecognition_V831.write_byte(0x00);
      if(_WeImageRecognition_V831.reset()!=0)return 0;
      _WeImageRecognition_V831.write_byte(0x05);
      if(_WeImageRecognition_V831.reset()!=0)return 0;
      _WeImageRecognition_V831.write_byte(60);
  }
  delay(10);
  if(_WeImageRecognition_V831.reset()!=0)return 0;
  _WeImageRecognition_V831.write_byte(0x02);
  _WeImageRecognition_V831.respond();
  uint8_t data_len = _WeImageRecognition_V831.read_byte();
  if(data_len == 0){
      return 0;
  }
  for(int i=0; i<data_len; i++){
      uartData[i] =  _WeImageRecognition_V831.read_byte();
  }
  uartData[data_len] = '\0';
  qr_code = reinterpret_cast<char*>(uartData);
  return 1;
}

bool WeImageRecognition_V831::getApriltag(uint8_t index)
{
  if (set_flag != 11){
      set_flag = 11;
      if(_WeImageRecognition_V831.reset()!=0)return 0;
      _WeImageRecognition_V831.write_byte(0x03);
      if(_WeImageRecognition_V831.reset()!=0)return 0;
      _WeImageRecognition_V831.write_byte(0x04);
      _WeImageRecognition_V831.write_byte(0x01);
      if(_WeImageRecognition_V831.reset()!=0)return 0;
      _WeImageRecognition_V831.write_byte(0x05);
      if(_WeImageRecognition_V831.reset()!=0)return 0;
      _WeImageRecognition_V831.write_byte(50);
  }
  if (apriltag_index!=index) {
    if(_WeImageRecognition_V831.reset()!=0)return 0;
    _WeImageRecognition_V831.write_byte(0x04);
    if(_WeImageRecognition_V831.reset()!=0)return 0;
    _WeImageRecognition_V831.write_byte(index);
    apriltag_index = index;
  }
  delay(10);
  if(_WeImageRecognition_V831.reset()!=0)return 0;
  _WeImageRecognition_V831.write_byte(0x02);
  _WeImageRecognition_V831.respond();
  uint8_t data_len = _WeImageRecognition_V831.read_byte();
  if(data_len == 0){
      return 0;
  }
  for(int i=0; i<data_len; i++){
      uartData[i] =  _WeImageRecognition_V831.read_byte();
  }
  id = uartData[0];
  centerX = uartData[1];
  centerY = uartData[2];
  width = uartData[3];
  high = uartData[4];
  x_rotation = uartData[5]<<8 | uartData[6];
  y_rotation = uartData[7]<<8 | uartData[8];
  z_rotation = uartData[9]<<8 | uartData[10];
  return 1;
}

bool WeImageRecognition_V831::getBarCode(void)
{
  if (set_flag != 12){
      set_flag = 12;
      if(_WeImageRecognition_V831.reset()!=0)return 0;
      _WeImageRecognition_V831.write_byte(0x03);
      if(_WeImageRecognition_V831.reset()!=0)return 0;
      _WeImageRecognition_V831.write_byte(0x04);
      _WeImageRecognition_V831.write_byte(0x02);
      if(_WeImageRecognition_V831.reset()!=0)return 0;
      _WeImageRecognition_V831.write_byte(0x05);
      if(_WeImageRecognition_V831.reset()!=0)return 0;
      _WeImageRecognition_V831.write_byte(40);
  }
  delay(10);
  if(_WeImageRecognition_V831.reset()!=0)return 0;
  _WeImageRecognition_V831.write_byte(0x02);
  _WeImageRecognition_V831.respond();
  uint8_t data_len = _WeImageRecognition_V831.read_byte();
  if(data_len == 0){
      return 0;
  }
  for(int i=0; i<data_len; i++){
      uartData[i] =  _WeImageRecognition_V831.read_byte();
  }
  uartData[data_len] = '\0';
  bar_code = reinterpret_cast<char*>(uartData);
  return 1;
}

bool WeImageRecognition_V831::trafficCardDetection(void)
{
  if (set_flag != 13){
      set_flag = 13;
      if(_WeImageRecognition_V831.reset()!=0)return 0;
      _WeImageRecognition_V831.write_byte(0x03);
      if(_WeImageRecognition_V831.reset()!=0)return 0;
      _WeImageRecognition_V831.write_byte(0x05);
      _WeImageRecognition_V831.write_byte(0x00);
      if(_WeImageRecognition_V831.reset()!=0)return 0;
      _WeImageRecognition_V831.write_byte(0x05);
      if(_WeImageRecognition_V831.reset()!=0)return 0;
      _WeImageRecognition_V831.write_byte(30);
  }
  delay(10);
  if(_WeImageRecognition_V831.reset()!=0)return 0;
  _WeImageRecognition_V831.write_byte(0x02);
  _WeImageRecognition_V831.respond();
  uint8_t data_len = _WeImageRecognition_V831.read_byte();
  if(data_len == 0){
      return 0;
  }
  for(int i=0; i<data_len; i++){
      uartData[i] =  _WeImageRecognition_V831.read_byte();
  }
  id = uartData[0];
  prob = uartData[1];
  centerX = uartData[2];
  centerY = uartData[3];
  high = uartData[4];
  width = uartData[5];
  return 1;
}

bool WeImageRecognition_V831::objects20Detection(void)
{
  if (set_flag != 14){
      set_flag = 14;
      if(_WeImageRecognition_V831.reset()!=0)return 0;
      _WeImageRecognition_V831.write_byte(0x03);
      if(_WeImageRecognition_V831.reset()!=0)return 0;
      _WeImageRecognition_V831.write_byte(0x06);
      _WeImageRecognition_V831.write_byte(0x00);
      if(_WeImageRecognition_V831.reset()!=0)return 0;
      _WeImageRecognition_V831.write_byte(0x05);
      if(_WeImageRecognition_V831.reset()!=0)return 0;
      _WeImageRecognition_V831.write_byte(30);
  }
  delay(10);
  if(_WeImageRecognition_V831.reset()!=0)return 0;
  _WeImageRecognition_V831.write_byte(0x02);
  _WeImageRecognition_V831.respond();
  uint8_t data_len = _WeImageRecognition_V831.read_byte();
  if(data_len == 0){
      return 0;
  }
  for(int i=0; i<data_len; i++){
      uartData[i] =  _WeImageRecognition_V831.read_byte();
  }
  id = uartData[0];
  prob = uartData[1];
  centerX = uartData[2];
  centerY = uartData[3];
  high = uartData[4];
  width = uartData[5];
  return 1;
}

bool WeImageRecognition_V831::visionFollower(void)
{
  if (set_flag != 15){
      set_flag = 15;
      if(_WeImageRecognition_V831.reset()!=0)return 0;
      _WeImageRecognition_V831.write_byte(0x03);
      if(_WeImageRecognition_V831.reset()!=0)return 0;
      _WeImageRecognition_V831.write_byte(0x07);
      _WeImageRecognition_V831.write_byte(0x00);
      if(_WeImageRecognition_V831.reset()!=0)return 0;
      _WeImageRecognition_V831.write_byte(0x05);
      if(_WeImageRecognition_V831.reset()!=0)return 0;
      _WeImageRecognition_V831.write_byte(20);
  }
  delay(20);
  if(_WeImageRecognition_V831.reset()!=0)return 0;
  _WeImageRecognition_V831.write_byte(0x02);
  _WeImageRecognition_V831.respond();
  uint8_t data_len = _WeImageRecognition_V831.read_byte();
  if(data_len == 0){
      return 0;
  }
  for(int i=0; i<data_len; i++){
      uartData[i] =  _WeImageRecognition_V831.read_byte();
  }
  angle = uartData[0]-100;
  return 1;
}

bool WeImageRecognition_V831::selfLearnClasses(void)
{
  if (set_flag != 16){
      set_flag = 16;
      if(_WeImageRecognition_V831.reset()!=0)return 0;
      _WeImageRecognition_V831.write_byte(0x03);
      if(_WeImageRecognition_V831.reset()!=0)return 0;
      _WeImageRecognition_V831.write_byte(0x08);
      _WeImageRecognition_V831.write_byte(0x00);
      if(_WeImageRecognition_V831.reset()!=0)return 0;
      _WeImageRecognition_V831.write_byte(0x05);
      if(_WeImageRecognition_V831.reset()!=0)return 0;
      _WeImageRecognition_V831.write_byte(20);
  }
  delay(10);
  if(_WeImageRecognition_V831.reset()!=0)return 0;
  _WeImageRecognition_V831.write_byte(0x02);
  _WeImageRecognition_V831.respond();
  uint8_t data_len = _WeImageRecognition_V831.read_byte();
  if(data_len == 0){
      return 0;
  }
  for(int i=0; i<data_len; i++){
      uartData[i] =  _WeImageRecognition_V831.read_byte();
  }
  id = uartData[0];
  prob = uartData[1];
  return 1;
}

void WeImageRecognition_V831::setLightness(uint8_t value)
{
  if (lightness != value) {
    lightness = value;
    if(_WeImageRecognition_V831.reset()!=0)return;
    _WeImageRecognition_V831.write_byte(0x20);
    if(_WeImageRecognition_V831.reset()!=0)return;
    _WeImageRecognition_V831.write_byte(lightness);
  }
  delay(5);
}
