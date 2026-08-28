#ifdef ESP32
#include "WeWirelessRadio.h"

uint8_t broadcastAddress[] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
uint8_t data2[] = { 'A', 'B', 'C' };
uint8_t WeWirelessRadio::_channel = 0;
void (*WeWirelessRadio::_callback)(MyData data) = nullptr;
MyData WeWirelessRadio::_storedData[MAX_STORED_DATA];
int WeWirelessRadio::_storedDataCount = 0;

WeWirelessRadio::WeWirelessRadio() {
}

bool WeWirelessRadio::begin(uint8_t channel) {
  _channel = channel;
       
  return _init();
}

bool WeWirelessRadio::_init() {
  WiFi.mode(WIFI_STA);
  if (esp_now_init() != ESP_OK) {
    Serial.println("Error initializing ESP-NOW");
    return false;
  }

  esp_now_peer_info_t peerInfo;
  memcpy(peerInfo.peer_addr, broadcastAddress, 6);
  Serial.print("We channel: ");
  Serial.println(_channel);    
  peerInfo.channel = _channel;
  esp_wifi_set_channel(_channel,WIFI_SECOND_CHAN_NONE);//设计WIFI通道，不然默认只能使用0，1
  peerInfo.encrypt = false;
peerInfo.ifidx = WIFI_IF_STA; // 明确设置 ifidx 字段

  Serial.println();

  if (esp_now_add_peer(&peerInfo) != ESP_OK) {
    Serial.println("Failed to add peer");
    return false;
  }
  esp_now_register_recv_cb(_onDataRecv);
  return true;
}

void WeWirelessRadio::sendChar(const char* name, const char* str) {
  MyData data;
  strncpy(data.name, name, MAX_MESSAGE_LENGTH - 1);
  data.name[MAX_MESSAGE_LENGTH - 1] = '\0';  // 确保字符串以空字符结尾
  strncpy(data.value, str, MAX_MESSAGE_LENGTH - 1);
  data.value[MAX_MESSAGE_LENGTH - 1] = '\0';  // 确保字符串以空字符结尾
  _send(data);
}

void WeWirelessRadio::sendNumber(const char* name, int num) {
  MyData data;
  strncpy(data.name, name, MAX_MESSAGE_LENGTH - 1);
  data.name[MAX_MESSAGE_LENGTH - 1] = '\0';  // 确保字符串以空字符结尾
  snprintf(data.value, MAX_MESSAGE_LENGTH, "%d", num); // 将整数转换为字符串
  _send(data);
}

void WeWirelessRadio::_send(MyData data) {
  esp_err_t result = esp_now_send(broadcastAddress, (uint8_t *) &data, sizeof(data));
  if (result == ESP_OK) {
  } else {
    Serial.print("Error sending the data: ");
    Serial.println(result); // 打印错误代码
  }
}

void WeWirelessRadio::onReceive(void (*callback)(MyData data)) {
  _callback = callback;
}

void WeWirelessRadio::_onDataRecv(const esp_now_recv_info *info, const uint8_t *incomingData, int len) {
  if (len != sizeof(MyData)) {
    Serial.println("Received data length does not match MyData structure size");
    return;
  }

  MyData data;
  memcpy(&data, incomingData, sizeof(data));
  
  // 存储数据
  if (_storedDataCount < MAX_STORED_DATA) {
    memcpy(&_storedData[_storedDataCount], &data, sizeof(MyData));
    _storedDataCount++;
  } else {
    // 如果数组已满，移除最旧的数据（移动所有数据）
    for (int i = 0; i < MAX_STORED_DATA - 1; i++) {
      memcpy(&_storedData[i], &_storedData[i + 1], sizeof(MyData));
    }
    // 添加新数据到最后
    memcpy(&_storedData[MAX_STORED_DATA - 1], &data, sizeof(MyData));
  }

  if (_callback) {
    _callback(data);
  }
}

// 新增方法的实现
MyData* WeWirelessRadio::getStoredData() {
  return _storedData;
}

int WeWirelessRadio::getStoredDataCount() {
  return _storedDataCount;
}

void WeWirelessRadio::clearStoredData() {
  _storedDataCount = 0;
}

// 新增：根据name查找value的方法实现
const char* WeWirelessRadio::getValueByName(const char* name) {
  for (int i = 0; i < _storedDataCount; i++) {
    if (strcmp(_storedData[i].name, name) == 0) {
      return _storedData[i].value;
    }
  }
  return nullptr;  // 如果未找到，返回nullptr
}
#endif