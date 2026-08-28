
#define USE_Hardware_Serial
#include<WeELF328P.h>

void update();

WeHandle handle24g;
WeRGBLed rgb_led_board(OnBoard_RGB);
double v_flag;	//flag;

void setup(){
	handle24g.begin();

	v_flag = 0;
}

void loop(){
	update();
	if(handle24g.get_Key(7)){
		v_flag = 1;
	}
	if(handle24g.get_Key(6)){
		v_flag = 2;
	}
	if(handle24g.get_Key(5)){
		v_flag = 3;
	}
	if(handle24g.get_Key(4)){
		v_flag = 4;
	}
	if(v_flag == 1){
		rgb_led_board.setColor(1, 255, 0, 0);
		rgb_led_board.show();
	}else if(v_flag == 2){
		rgb_led_board.setColor(1, 0, 255, 0);
		rgb_led_board.show();
	}else if(v_flag == 3){
		rgb_led_board.setColor(1, 0, 0, 255);
		rgb_led_board.show();
	}else if(v_flag == 4){
		rgb_led_board.setColor(1, 0, 255, 255);
		rgb_led_board.show();
	}else{
		rgb_led_board.setColor(1, 0, 0, 0);
		rgb_led_board.show();
	}
}

void update(){
	handle24g.read();
}

