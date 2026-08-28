#ifndef Weweather_h
#define Weweather_h

#include <Arduino.h>
#include <HTTPClient.h>
#include "ArduinoUZlib/ArduinoUZlib.h"
#include "ArduinoJson/ArduinoJson.h"


/* 实时天气ID对应的数据
 1             天气状况              texts
 2             天气状况代码           icon
 3             温度                  temp
 4             风向角度               wind360
 5             风向                  winDir
 6             风力                  winScale
 7             风速                  winSpeed
 8             湿度                  humidity
 9             降雨量                precip
 10             能见度               vis
 11            大气压强              pressure
*/


/*
天气预报ID对应的数据
1   预报日期                fxDate
2   白天天气状况            textDay         
3   夜间天气状况            textNight
4   白天天气状况代码        iconDay
5   夜间天气状况代码        iconNight
6   最高温度               tempMax
7   最低温度               tempMin
8   白天风向角度           wind360Day
9   夜间风向角度           wind360Night
10  白天风向               windDirDay
11  夜间风向               winDirNight
12  白天风力               winScaleDay
13  夜间风力               winScaleNight    
14  白天风速               winSpeedDay
15  夜间风速               winSpeedNight
16  湿度                   humidity
17  降雨量                 precip
18  能见度                 vis
19  大气压强               pressure
*/


/*
实时空气质量结果
1   数据发布时间        pubTime
2   空气质量指数        aqi
3   空气质量指数等级    level
4   主要污染物         primary
5   空气质量           category
6   可吸入颗粒物       pm10
7   细颗粒物（PM2.5）  pm2p5
8   二氧化氮           no2
9   二氧化硫           so2
10  一氧化硫           so
11  一氧化碳           co
*/

class Weweather {
  public:
    Weweather();
    void setApiKey(const char* apiKey);
    bool fetchWeather(const char* location, const char* prelocation,const char* lang = "zh");
    String fetchCity(const char* location, const char* prelocation);
    bool fetchAirquality(const char* location, const char* prelocation, const char* lang = "zh");
    bool fetchPreweather(const char* location, const char* prelocation, const char* lang = "zh");
    String getWeatherInfo(const char* key);
    String getPreWeatherInfo(const char* key,unsigned char day);
    String getAirquality(const char* key);
   
  private:
    const char* _apiKey = nullptr;
    StaticJsonDocument<512> _doc;
    StaticJsonDocument<512> _city;
    StaticJsonDocument<1024> _pre;
    StaticJsonDocument<512> _air;
   
};

#endif