
#ifdef ESP32
#include "Weweather.h"
#include <WiFiClient.h>  // 显式包含 WiFiClient 相关头文件

Weweather::Weweather() {}

void Weweather::setApiKey(const char* apiKey) {
  _apiKey = apiKey;
}

bool Weweather::fetchWeather(const char* location, const char* prelocation, const char* lang) {
  if (_apiKey == nullptr) {
    Serial.println("API key is not set");
    return false;
  }
  String city = fetchCity(location,prelocation);
  String url = "https://devapi.qweather.com/v7/weather/now?location=" + String(city) + "&key=" + String(_apiKey) + "&lang=" + String(lang);
  HTTPClient http;
  http.begin(url);
  int httpResponseCode = http.GET();
  if (httpResponseCode == HTTP_CODE_OK) {
    WiFiClient *stream = http.getStreamPtr();
    int contentLength = http.getSize();
    byte *buffer = (byte *)malloc(contentLength);
    int bytesRead = stream->readBytes(buffer, contentLength);
    if (bytesRead > 0) {
      uint32_t outBufferSize = contentLength * 4; // 增加缓冲区大小
      byte *outBuffer = (byte *)malloc(outBufferSize);
      uint32_t outSize = 0;
      int result = ArduinoUZlib::decompress(buffer, bytesRead, outBuffer, outSize);

      if (result >= 0) { // 检查返回值是否为非负数
        char *weatherData = (char *)malloc(outSize + 1); // 分配足够的内存并加1用于存储字符串结束符
        memcpy(weatherData, outBuffer, outSize);
        weatherData[outSize] = '\0'; // 添加字符串结束符

        // 解析 JSON 数据
        DeserializationError error = deserializeJson(_doc, weatherData);
        if (!error) {
          free(weatherData); // 释放临时字符串内存
          free(outBuffer);
          free(buffer);
          return true;
        } else {
          Serial.println("Failed to parse JSON");
        }
      } else {
        Serial.println("Decompression failed");
      }
      free(outBuffer);
    }
    free(buffer);
  } else {   
    Serial.println("Error on HTTP request");
  }
  http.end();
  return false;
}




bool Weweather::fetchPreweather(const char* location, const char* prelocation, const char* lang) {
    if (_apiKey == nullptr) {
      Serial.println("API key is not set");
      return false;
    }
    String city = fetchCity(location,prelocation);
    String url = "https://devapi.qweather.com/v7/weather/3d?location=" + String(city) + "&key=" + String(_apiKey) + "&lang=" + String(lang);
    HTTPClient http;
    http.begin(url);
    int httpResponseCode = http.GET();
    if (httpResponseCode == HTTP_CODE_OK) {
      WiFiClient *stream = http.getStreamPtr();
      int contentLength = http.getSize();
      byte *buffer = (byte *)malloc(contentLength);
      int bytesRead = stream->readBytes(buffer, contentLength);
      if (bytesRead > 0) {
        uint32_t outBufferSize = contentLength * 4; // 增加缓冲区大小
        byte *outBuffer = (byte *)malloc(outBufferSize);
        uint32_t outSize = 0;
        int result = ArduinoUZlib::decompress(buffer, bytesRead, outBuffer, outSize);
  
        if (result >= 0) { // 检查返回值是否为非负数
          char *preWeatherdata = (char *)malloc(outSize + 1); // 分配足够的内存并加1用于存储字符串结束符
          memcpy(preWeatherdata, outBuffer, outSize);
          preWeatherdata[outSize] = '\0'; // 添加字符串结束符
  
          // 解析 JSON 数据
          DeserializationError error = deserializeJson(_pre, preWeatherdata);
          if (!error) {
            free(preWeatherdata); // 释放临时字符串内存
            free(outBuffer);
            free(buffer);
            return true;
          } else {
            Serial.println("Failed to parse JSON");
          }
        } else {
          Serial.println("Decompression failed");
        }
        free(outBuffer);
      }
      free(buffer);
    } else {
      Serial.println("Error on HTTP request");
    }
    http.end();
    return false;
  }

String Weweather::fetchCity(const char* location,const char* prelocation) {
    if (_apiKey == nullptr) {
      Serial.println("API key is not set");
      return "";
    }
    String url = "https://geoapi.qweather.com/v2/city/lookup?location=" + String(location) +"&adm="+ prelocation +"&key=" + String(_apiKey) ;
    HTTPClient http;
    http.begin(url);
    int httpResponseCode = http.GET();
    if (httpResponseCode == HTTP_CODE_OK) {
      WiFiClient *stream = http.getStreamPtr();
      int contentLength = http.getSize();
      byte *buffer = (byte *)malloc(contentLength);
      int bytesRead = stream->readBytes(buffer, contentLength);
      if (bytesRead > 0) {
        uint32_t outBufferSize = contentLength * 4; // 增加缓冲区大小
        byte *outBuffer = (byte *)malloc(outBufferSize);
        uint32_t outSize = 0;
        int result = ArduinoUZlib::decompress(buffer, bytesRead, outBuffer, outSize);
  
        if (result >= 0) { // 检查返回值是否为非负数
          char *cityData = (char *)malloc(outSize + 1); // 分配足够的内存并加1用于存储字符串结束符
          memcpy(cityData, outBuffer, outSize);
          cityData[outSize] = '\0'; // 添加字符串结束符
  
          // 解析 JSON 数据
          DeserializationError error = deserializeJson(_city, cityData);
          if (!error) {
            Serial.println("JSON Data:");
            free(cityData); // 释放临时字符串内存
            free(outBuffer);
            free(buffer);
            JsonArray  cityAray = _city["location"];
           // String city = _city["id"].as<String>();
            JsonObject cityJson = cityAray[0];
            String city = cityJson["id"].as<String>();
            return city;
          } else {
            Serial.println("Failed to parse JSON");
          }
        } else {
          Serial.println("Decompression failed");
        }
        free(outBuffer);
      }
      free(buffer);
    } else {
      Serial.println("Error on HTTP request");
    }
    http.end();
    return "";
  }

  bool Weweather::fetchAirquality(const char* location, const char* prelocation, const char* lang) {
    if (_apiKey == nullptr) {
      Serial.println("API key is not set");
      return false;
    }
    String city = fetchCity(location,prelocation);
    String url = "https://devapi.qweather.com/v7/air/now?location=" + String(city) + "&key=" + String(_apiKey) + "&lang=" + String(lang);
    HTTPClient http;
    http.begin(url);
    int httpResponseCode = http.GET();
    if (httpResponseCode == HTTP_CODE_OK) {
      WiFiClient *stream = http.getStreamPtr();
      int contentLength = http.getSize();
      byte *buffer = (byte *)malloc(contentLength);
      int bytesRead = stream->readBytes(buffer, contentLength);
      if (bytesRead > 0) {
        uint32_t outBufferSize = contentLength * 4; // 增加缓冲区大小
        byte *outBuffer = (byte *)malloc(outBufferSize);
        uint32_t outSize = 0;
        int result = ArduinoUZlib::decompress(buffer, bytesRead, outBuffer, outSize);
  
        if (result >= 0) { // 检查返回值是否为非负数
          char *airData = (char *)malloc(outSize + 1); // 分配足够的内存并加1用于存储字符串结束符
          memcpy(airData, outBuffer, outSize);
          airData[outSize] = '\0'; // 添加字符串结束符
  
          // 解析 JSON 数据
          DeserializationError error = deserializeJson(_air, airData);
          if (!error) {
            free(airData); // 释放临时字符串内存
            free(outBuffer);
            free(buffer);
            return true;
          } else {
            Serial.println("Failed to parse JSON");
          }
        } else {
          Serial.println("Decompression failed");
        }
        free(outBuffer);
      }
      free(buffer);
    } else {
      Serial.println("Error on HTTP request");
    }
    http.end();
    return false;
  }

String Weweather::getPreWeatherInfo(const char* key,unsigned char day) {
    
    JsonArray preweather = _pre["daily"];
    JsonObject dayWeather = preweather[day];
    String temp = dayWeather[key].as<String>();
    return temp;
}


String Weweather::getWeatherInfo(const char* key) {
    
        JsonObject now = _doc["now"];
        String temp = now[key].as<String>();
        return temp;
}

String Weweather::getAirquality(const char* key) {
    
    JsonObject now = _air["now"];
    String temp = now[key].as<String>();
    return temp;
}

#endif
