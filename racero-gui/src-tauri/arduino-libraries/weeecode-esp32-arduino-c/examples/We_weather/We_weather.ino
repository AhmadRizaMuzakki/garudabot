#include <Weweather.h>
#include <WiFi.h>

const char* ssid = "WEEEMAKE";
const char* password = "WEEEMAKE8899";
const char* apiKey = "dc0aa31026b34f5ea5dda882615643eb";
const char* location = "longgang";
const char* lang = "zh"; // 语言设置为英文

Weweather weather;

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.println("Connecting to WiFi...");
  }
  Serial.println("Connected to WiFi");
  weather.setApiKey(apiKey); // 设置 API 密钥
  if (weather.fetchWeather(location,"shenzhen", lang)) { // 获取实时天气数据
  /*（三个参数：   
    参数1表示位置，可以是beijing、shenzhen，Paris等数据，此参数必填
    参数2表示位置范围，例如，当你参数1为龙岗时，会出现多个龙岗，此时通过限制深圳龙岗，就可以准确定位龙岗的数据。此参数可以为空
    参数3表示语言，有中文或者英文
  */
    Serial.print("天气状况: ");
    Serial.println(weather.getWeatherInfo("text"));// 获取实时天气天气状况
  }
  if (weather.fetchPreweather(location,"shenzhen", lang)) { // 获取天气预报数据（三天内）
    Serial.print("明天白天天气状况: ");
    Serial.println(weather.getPreWeatherInfo("textDay",1));//0:今天1：明天2：后天
  }
  if (weather.fetchAirquality(location,"shenzhen", lang)) { // 获取实时空气质量
    Serial.print("天气状况: ");
    Serial.println(weather.getAirquality("aqi"));// 获取实时空气质量指数
  }

}

void loop() {
  // Nothing to do here
}