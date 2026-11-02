import { methods as pinMethods } from "../pins/index.js";

/**
 * Extension Robots ESP32.
 * Beberapa modul (MP3, display 4 digit, color sensor) masih noop
 * sampai command backend khusus tersedia.
 */
export const methods = {
    handleRobotEsp32Noop() {
        return "";
    },

    handleRobotEsp32ZeroReporter() {
        return "0";
    },

    handleRobotEsp32SerialPrint(block) {
        const text = this.getInput(block, "TEXT");
        const newline = block.fields.NEWLINE && block.fields.NEWLINE.value;
        this.setups.add("Serial.begin(115200);\n");
        if (newline === "off") {
            return `Serial.print(${text});\n`;
        }
        return `Serial.println(${text});\n`;
    },

    handleRobotEsp32PrintValue(block) {
        const value = this.getInput(block, "VALUE");
        this.setups.add("Serial.begin(115200);\n");
        return `Serial.println(${value});\n`;
    },

    handleRobotEsp32ConstantPi() {
        return "3.1415926";
    },

    handleRobotEsp32ToStringValue(block) {
        const value = this.getInput(block, "VALUE");
        return `String(${value})`;
    },

    handleRobotEsp32DcMotor(block) {
        const motor = this.getMenuValue(block, "MOTOR", "M1");
        const directionRaw = String(
            this.getMenuValue(block, "DIRECTION", "forward"),
        ).trim();
        const speed = this.getInput(block, "SPEED");
        const port = String(motor).trim() === "M2" ? "M2" : "M1";
        this.includes.add("#include <WeELFESP32Motor.h>");
        const ctorArgs =
            port === "M2" ?
                `WE_ELF_M2_IN1, WE_ELF_M2_IN2, WE_ELF_M2_REVERSE` :
                `WE_ELF_M1_IN1, WE_ELF_M1_IN2`;
        this.globals.add(`WeELFMotor weDcMotor${port}(${ctorArgs});\n`);
        this.setups.add(`weDcMotor${port}.begin();\n`);
        const dirLiteral = directionRaw
            .replace(/^String\("/, "")
            .replace(/"\)$/, "")
            .replace(/^["']|["']$/g, "")
            .toLowerCase();
        if (dirLiteral === "forward" || dirLiteral === "backward") {
            const sign = dirLiteral === "backward" ? "-" : "";
            return `weDcMotor${port}.runPercent(${sign}abs((int)(${speed})));\n`;
        }
        return `weDcMotor${port}.runPercent((String(${directionRaw}).equals("backward") ? -1 : 1) * abs((int)(${speed})));\n`;
    },

    handleRobotEsp32DcMotor130(block) {
        const dirPin = this.getInput(block, "DIRPIN");
        const pwmPin = this.getInput(block, "PWMPIN");
        const speed = this.getInput(block, "SPEED");
        this.setups.add(`pinMode(${dirPin}, OUTPUT);\n`);
        this.setups.add(`pinMode(${pwmPin}, OUTPUT);\n`);
        return `digitalWrite(${dirPin}, (${speed}) >= 0 ? HIGH : LOW);\nanalogWrite(${pwmPin}, abs((int)(${speed})));\n`;
    },

    handleRobotEsp32ServoPinAngle(block) {
        const pin = this.getInput(block, "PIN");
        const angle = this.getInput(block, "ANGLE");
        this.includes.add("#include <Servo.h>");
        this.globals.add(`Servo servo${pin};\n`);
        this.setups.add(`servo${pin}.attach(${pin});\n`);
        return `servo${pin}.write(${angle});\n`;
    },

    handleRobotEsp32OnboardRgbColor(block) {
        const pin = this.getInput(block, "PIN");
        const color = this.getInput(block, "COLOR");
        this.setups.add(`pinMode(${pin}, OUTPUT);\n`);
        return `analogWrite(${pin}, ${color});\n`;
    },

    handleRobotEsp32OnboardRgbValues(block) {
        const pin = this.getInput(block, "PIN");
        const red = this.getInput(block, "R");
        this.setups.add(`pinMode(${pin}, OUTPUT);\n`);
        return `analogWrite(${pin}, ${red});\n`;
    },

    handleRobotEsp32BuzzerNoteBeat(block) {
        const pin = this.getInput(block, "PIN");
        const note = this.getMenuValue(block, "NOTE", 262);
        const beat = this.getMenuValue(block, "BEAT", 500);
        return `tone(${pin}, ${note}, ${beat});\n`;
    },

    handleRobotEsp32BuzzerNoteSecond(block) {
        const pin = this.getInput(block, "PIN");
        const note = this.getMenuValue(block, "NOTE", 262);
        const second = this.getInput(block, "SECOND");
        return `tone(${pin}, ${note}, (int)((${second}) * 1000));\n`;
    },

    handleRobotEsp32BuzzerNotationSecond(block) {
        const pin = this.getInput(block, "PIN");
        const notation = this.getInput(block, "NOTATION");
        const second = this.getInput(block, "SECOND");
        return `tone(${pin}, 220 + ((int)(${notation}) * 40), (int)((${second}) * 1000));\n`;
    },

    handleRobotEsp32PirMotionSensor(block) {
        const pin = this.getInput(block, "PIN");
        this.setups.add(`pinMode(${pin}, INPUT);\n`);
        return `(digitalRead(${pin}) == HIGH)`;
    },

    handleRobotEsp32Lm35Temperature(block) {
        const pin = this.getInput(block, "PIN");
        this.setups.add(`pinMode(${pin}, INPUT);\n`);
        return `analogRead(${pin})`;
    },

    handleRobotEsp32UltrasonicDistance(block) {
        const trig = this.getInput(block, "TRIG");
        const echo = this.getInput(block, "ECHO");
        this.setups.add(`pinMode(${trig}, OUTPUT);\npinMode(${echo}, INPUT);`);
        this.globals.add(`
float robotEsp32Ultrasonic(int trig, int echo) {
    digitalWrite(trig, LOW);
    delayMicroseconds(2);
    digitalWrite(trig, HIGH);
    delayMicroseconds(10);
    digitalWrite(trig, LOW);
    unsigned long duration = pulseIn(echo, HIGH, 30000);
    return duration * 0.034 / 2.0;
}`);
        return `robotEsp32Ultrasonic(${trig}, ${echo})`;
    },

    handleRobotEsp32InfraredPressed(block) {
        const pin = this.getInput(block, "PIN");
        this.setups.add(`pinMode(${pin}, INPUT);\n`);
        return `(digitalRead(${pin}) == HIGH)`;
    },

    handleRobotEsp32DigitalRead(block) {
        return this.handlePinsDigitalRead(block);
    },

    handleRobotEsp32DigitalWrite(block) {
        const pin = this.getInput(block, "PIN");
        const value = this.getMenuValue(block, "VALUE", "LOW");
        this.setups.add(`pinMode(${pin}, OUTPUT);\n`);
        return `digitalWrite(${pin}, ${value});\n`;
    },

    handleRobotEsp32AnalogRead(block) {
        return this.handlePinsAnalogRead(block);
    },

    handleRobotEsp32AnalogWrite(block) {
        return this.handlePinsAnalogWrite(block);
    },

    handleRobotEsp32PullupDigitalRead(block) {
        const pin = this.getInput(block, "PIN");
        this.setups.add(`pinMode(${pin}, INPUT_PULLUP);\n`);
        return `digitalRead(${pin})`;
    },

    handleRobotEsp32StringOfAscii(block) {
        const code = this.getInput(block, "CODE");
        return `String((char)(${code}))`;
    },

    handleRobotEsp32AsciiOfString(block) {
        const text = this.getInput(block, "TEXT");
        return `(int)(${text})[0]`;
    },

    handleMenuRobotEsp32Default(block) {
        const fieldName = Object.keys(block.fields || {})[0];
        return fieldName ? `${block.fields[fieldName].value}` : "0";
    }
};

const menu = methods.handleMenuRobotEsp32Default;

export const handlers = {
    robotesp32_generateCode: pinMethods.handlePinsBoardStart,
    robotesp32_serialPrint: methods.handleRobotEsp32SerialPrint,
    robotesp32_printValue: methods.handleRobotEsp32PrintValue,
    robotesp32_constantPi: methods.handleRobotEsp32ConstantPi,
    robotesp32_toStringValue: methods.handleRobotEsp32ToStringValue,
    robotesp32_setVarType: methods.handleRobotEsp32Noop,
    robotesp32_dcMotor: methods.handleRobotEsp32DcMotor,
    robotesp32_dcMotor130: methods.handleRobotEsp32DcMotor130,
    robotesp32_servoPinAngle: methods.handleRobotEsp32ServoPinAngle,
    robotesp32_onboardRgbColor: methods.handleRobotEsp32OnboardRgbColor,
    robotesp32_onboardRgbValues: methods.handleRobotEsp32OnboardRgbValues,
    robotesp32_buzzerNoteBeat: methods.handleRobotEsp32BuzzerNoteBeat,
    robotesp32_buzzerNoteSecond: methods.handleRobotEsp32BuzzerNoteSecond,
    robotesp32_buzzerNotationSecond: methods.handleRobotEsp32BuzzerNotationSecond,
    robotesp32_mp3Info: methods.handleRobotEsp32Noop,
    robotesp32_mp3PlayTrack: methods.handleRobotEsp32Noop,
    robotesp32_mp3PlaybackControl: methods.handleRobotEsp32Noop,
    robotesp32_mp3PlaybackMode: methods.handleRobotEsp32Noop,
    robotesp32_mp3Distance: methods.handleRobotEsp32ZeroReporter,
    robotesp32_display4Digit: methods.handleRobotEsp32Noop,
    robotesp32_setColorSensorWhiteBalance: methods.handleRobotEsp32Noop,
    robotesp32_colorSensorRead: methods.handleRobotEsp32ZeroReporter,
    robotesp32_pirMotionSensor: methods.handleRobotEsp32PirMotionSensor,
    robotesp32_lm35Temperature: methods.handleRobotEsp32Lm35Temperature,
    robotesp32_ultrasonicDistance: methods.handleRobotEsp32UltrasonicDistance,
    robotesp32_infraredPressed: methods.handleRobotEsp32InfraredPressed,
    robotesp32_digitalRead: methods.handleRobotEsp32DigitalRead,
    robotesp32_digitalWrite: methods.handleRobotEsp32DigitalWrite,
    robotesp32_analogRead: methods.handleRobotEsp32AnalogRead,
    robotesp32_analogWrite: methods.handleRobotEsp32AnalogWrite,
    robotesp32_pullupDigitalRead: methods.handleRobotEsp32PullupDigitalRead,
    robotesp32_stringOfAscii: methods.handleRobotEsp32StringOfAscii,
    robotesp32_asciiOfString: methods.handleRobotEsp32AsciiOfString,
    robotesp32_menu_newlineMenu: menu,
    robotesp32_menu_varTypeMenu: menu,
    robotesp32_menu_motorMenu: menu,
    robotesp32_menu_motorDirectionMenu: menu,
    robotesp32_menu_digitalValueMenu: menu,
    robotesp32_menu_buzzerNoteMenu: menu,
    robotesp32_menu_buzzerBeatMenu: menu,
    robotesp32_menu_mp3ControlMenu: menu,
    robotesp32_menu_mp3ModeMenu: menu,
    robotesp32_menu_colorSensorModeMenu: menu,
    robotesp32_menu_irKeyMenu: menu,
    robotesp32_menu_digitalInputPinsMenu: menu,
    robotesp32_menu_digitalOutputPinsMenu: menu,
    robotesp32_menu_pwmPinsMenu: menu,
    robotesp32_menu_servoPinsMenu: menu,
    robotesp32_menu_analogInputPinsMenu: menu
};

export const setupEntryOpcodes = ["robotesp32_generateCode"];
