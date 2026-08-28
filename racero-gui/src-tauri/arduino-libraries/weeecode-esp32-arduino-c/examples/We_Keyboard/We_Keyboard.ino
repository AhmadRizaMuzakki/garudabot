#include "WeELF328P.h"
WeKeyboard  weKeyboard_A(PORT_A);
WeRGBLed rgb_led_board(OnBoard_RGB);
void setup() {
  // put your setup code here, to run once:
  Serial.begin(115200);
}

void loop() {
  // put your main code here, to run repeatedly:
  Serial.println(weKeyboard_A.getKey());
  if(weKeyboard_A.getKey() == Key_0)
  {
	rgb_led_board.setColor(1, 0, 0, 0);
	rgb_led_board.show();        
  }
  if(weKeyboard_A.getKey() == Key_1)
  {
	rgb_led_board.setColor(1, 255, 0, 0);
	rgb_led_board.show(); 
  }
    if(weKeyboard_A.getKey() == Key_2)
  {
	rgb_led_board.setColor(1, 255, 165 , 0);
	rgb_led_board.show();     
  }
    if(weKeyboard_A.getKey() == Key_3)
  {
	rgb_led_board.setColor(1, 255, 255, 0);
	rgb_led_board.show();    
  }
    if(weKeyboard_A.getKey() == Key_4)
  {
	rgb_led_board.setColor(1, 0, 255, 0);
	rgb_led_board.show();       
  }
    if(weKeyboard_A.getKey() == Key_5)
  {
	rgb_led_board.setColor(1, 0, 255, 255);
	rgb_led_board.show();     
  }
    if(weKeyboard_A.getKey() == Key_6)
  {
	rgb_led_board.setColor(1, 0, 0, 255);
	rgb_led_board.show();       
  }
    if(weKeyboard_A.getKey() == Key_7)
  {
	rgb_led_board.setColor(1, 255, 0, 255);
	rgb_led_board.show();    
  }
    if(weKeyboard_A.getKey() == Key_8)
  {
	rgb_led_board.setColor(1, 255, 255, 255);
	rgb_led_board.show();    
  }
    if(weKeyboard_A.getKey() == Key_9)
  {
	rgb_led_board.setColor(1, 139, 35 , 35 );
	rgb_led_board.show();        
  }
    if(weKeyboard_A.getKey() == Key_ponit)
  {
	rgb_led_board.setColor(1, 255, 181 , 197);
	rgb_led_board.show();        
  }
      if(weKeyboard_A.getKey() == Key_num)
  {
 	rgb_led_board.setColor(1, 169 , 169 , 169 );
	rgb_led_board.show();       
  }
      if(weKeyboard_A.getKey() == Key_minus)
  {
	rgb_led_board.setColor(1, 139 , 117 , 0);
	rgb_led_board.show();        
  }
      if(weKeyboard_A.getKey() == Key_star)
  {
	rgb_led_board.setColor(1, 255, 246 , 143);
	rgb_led_board.show();        
  }
      if(weKeyboard_A.getKey() == Key_slash)
  {
	rgb_led_board.setColor(1, 139 , 125 , 123);
	rgb_led_board.show();        
  }
//  delay(1000);
}
