// 定义蜂鸣器连接的GPIO引脚
const int buzzerPin = 25;

// 定义《小星星》的音符频率和时长
#define NOTE_C4  262
#define NOTE_D4  294
#define NOTE_E4  330
#define NOTE_F4  349
#define NOTE_G4  392
#define NOTE_A4  440
#define NOTE_B4  494
#define NOTE_C5  523

// 定义《小星星》的音符和时长
int melody[] = {
  NOTE_C4, NOTE_C4, NOTE_G4, NOTE_G4, NOTE_A4, NOTE_A4, NOTE_G4,
  NOTE_F4, NOTE_F4, NOTE_E4, NOTE_E4, NOTE_D4, NOTE_D4, NOTE_C4
};

int noteDurations[] = {
  4, 4, 4, 4, 4, 4, 2,
  4, 4, 4, 4, 4, 4, 2
};

void setup() {
  // 初始化蜂鸣器引脚
  pinMode(buzzerPin, OUTPUT);
}

void loop() {
  // 遍历音符数组，播放音乐
  for (int thisNote = 0; thisNote < 14; thisNote++) {
    // 要播放的音符时长计算
    int noteDuration = 1000 / noteDurations[thisNote];
    tone(buzzerPin, melody[thisNote], noteDuration);

    // 两个音符之间的间隔
    int pauseBetweenNotes = noteDuration * 1.30;
    delay(pauseBetweenNotes);
    // 停止当前音符
    noTone(buzzerPin);
  }

  // 播放完后暂停一段时间
  delay(2000); // 暂停2秒
}