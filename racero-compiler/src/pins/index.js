/** Pin generik, plus opcode yang sama untuk board UNO dan ESP32. */
export const methods = {
    handlePinsBoardStart() {
        return "";
    },

    handlePinsDigitalWrite(block) {
        const pin = this.getInput(block, "PIN");
        const value = this.getInput(block, "VALUE");

        this.setups.add(`pinMode(${pin}, OUTPUT);\n`);
        return `digitalWrite(${pin}, ${value});\n`;
    },

    handlePinsPwmWrite(block) {
        const pin = this.getInput(block, "PIN");
        const value = this.getInput(block, "VALUE");

        this.setups.add(`pinMode(${pin}, OUTPUT);\n`);
        return `analogWrite(${pin}, ${value});\n`;
    },

    handlePinsAnalogWrite(block) {
        const pin = this.getInput(block, "PIN");
        const value = this.getInput(block, "VALUE");

        this.setups.add(`pinMode(${pin}, OUTPUT);\n`);
        return `analogWrite(${pin}, ${value});\n`;
    },

    handlePinsServoWrite(block) {
        const pin = this.getInput(block, "PIN");
        const value = this.getInput(block, "VALUE");

        this.includes.add("#include <Servo.h>");
        this.globals.add(`Servo servo${pin};\n`);
        this.setups.add(`servo${pin}.attach(${pin});\n`);

        return `servo${pin}.write(${value});`;
    },

    handlePinsBuzzerWrite(block) {
        const pin = this.getInput(block, "PIN");
        const note = block.fields.NOTE.value;
        const beat = block.fields.BEAT.value;

        return `tone(${pin}, ${note}, ${beat});`;
    },

    handlePinsDigitalRead(block) {
        const pin = this.getInput(block, "PIN");

        this.setups.add(`pinMode(${pin}, INPUT);\n`);
        return `digitalRead(${pin})`;
    },

    handlePinsAnalogRead(block) {
        const pin = this.getInput(block, "PIN");

        this.setups.add(`pinMode(${pin}, INPUT);\n`);
        return `analogRead(${pin})`;
    },

    handlePinsUltrasonicRead(block) {
        const trig = this.getInput(block, "TRIG");
        const echo = this.getInput(block, "ECHO");

        this.setups.add(`pinMode(${trig}, OUTPUT);\npinMode(${echo}, INPUT);`);
        this.globals.add(`
float readUltrasonic(int trig, int echo) {
    digitalWrite(trig, LOW);
    delayMicroseconds(2);
    digitalWrite(trig, HIGH);
    delayMicroseconds(10);
    digitalWrite(trig, LOW);
    unsigned long duration = pulseIn(echo, HIGH, 30000);
    return duration * 0.034 / 2.0;
}`);
        return `readUltrasonic(${trig}, ${echo})`;
    },

    handlePinsMap(block) {
        const value = this.getInput(block, "VALUE");
        const from1 = this.getInput(block, "FROM1");
        const to1 = this.getInput(block, "TO1");
        const from2 = this.getInput(block, "FROM2");
        const to2 = this.getInput(block, "TO2");

        return `((float)(${value} - ${from1}) / (float)(${to1} - ${from1}) * (float)(${to2} - ${from2}))`;
    },

    handleMenuDigitalValue(block) {
        return `${block.fields.digitalValueMenu.value}`;
    },

    handleMenuAnalogOutputPins(block) {
        return `${block.fields.analogOutputPinsMenu.value}`;
    },

    handleMenuDigitalOutputPins(block) {
        return `${block.fields.digitalOutputPinsMenu.value}`;
    },

    handleMenuPwmPins(block) {
        return `${block.fields.pwmPinsMenu.value}`;
    },

    handleMenuServoPins(block) {
        return `${block.fields.servoPinsMenu.value}`;
    },

    handleMenuAnalogInputPins(block) {
        return `${block.fields.analogInputPinsMenu.value}`;
    },

    handleMenuDigitalInputPins(block) {
        return `${block.fields.digitalInputPinsMenu.value}`;
    }
};

const commandHandlers = {
    boardStart: methods.handlePinsBoardStart,
    digitalWrite: methods.handlePinsDigitalWrite,
    pwmWrite: methods.handlePinsPwmWrite,
    analogWrite: methods.handlePinsAnalogWrite,
    servoWrite: methods.handlePinsServoWrite,
    buzzerWrite: methods.handlePinsBuzzerWrite,
    digitalRead: methods.handlePinsDigitalRead,
    analogRead: methods.handlePinsAnalogRead,
    ultrasonicRead: methods.handlePinsUltrasonicRead,
    map: methods.handlePinsMap
};

const menuHandlers = {
    digitalValueMenu: methods.handleMenuDigitalValue,
    analogOutputPinsMenu: methods.handleMenuAnalogOutputPins,
    digitalOutputPinsMenu: methods.handleMenuDigitalOutputPins,
    pwmPinsMenu: methods.handleMenuPwmPins,
    servoPinsMenu: methods.handleMenuServoPins,
    analogInputPinsMenu: methods.handleMenuAnalogInputPins,
    digitalInputPinsMenu: methods.handleMenuDigitalInputPins
};

export const handlers = {};

for (const prefix of ["pins", "pinsuno", "pinsesp32"]) {
    for (const name in commandHandlers) {
        handlers[`${prefix}_${name}`] = commandHandlers[name];
    }
    for (const name in menuHandlers) {
        handlers[`${prefix}_menu_${name}`] = menuHandlers[name];
    }
}

export const setupEntryOpcodes = [
    "pins_boardStart",
    "pinsuno_boardStart",
    "pinsesp32_boardStart"
];
