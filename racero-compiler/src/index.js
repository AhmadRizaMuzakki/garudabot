import beautify from 'js-beautify';

export class ArduinoCompiler {
    constructor(vm) {
        this.vm = vm;

        this.blocks = null;
        this.includes = new Set();
        this.globals = new Set();
        this.procedures = new Set();
        this.setups = new Set();
        this.loopSubstack = undefined;
        
        this.handlers = {
            // Data
            'data_variable': this.handleDataVariable,
            'data_setvariableto': this.handleDataSetVariableTo,
            'data_changevariableby': this.handleDataChangeVariableBy,
            'text': this.handleText,
            
            // Math
            'math_angle': this.handleMathNumber,
            'math_number': this.handleMathNumber,
            'math_integer': this.handleMathNumber,
            'math_whole_number': this.handleMathNumber,
            'math_positive_number': this.handleMathNumber,
            'math_slider': this.handleMathNumber,
            'math_slider_motor': this.handleMathNumber,

            // Operators
            'operator_add': this.handleOperatorAdd,
            'operator_subtract': this.handleOperatorSubtract,
            'operator_multiply': this.handleOperatorMultiply,
            'operator_divide': this.handleOperatorDivide,
            'operator_lt': this.handleOperatorLt,
            'operator_equals': this.handleOperatorEquals,
            'operator_gt': this.handleOperatorGt,
            'operator_and': this.handleOperatorAnd,
            'operator_or': this.handleOperatorOr,
            'operator_not': this.handleOperatorNot,
            'operator_random': this.handleOperatorRandom,
            'operator_join': this.handleOperatorJoin,
            'operator_letter_of': this.handleOperatorLetterOf,
            'operator_length': this.handleOperatorLength,
            'operator_contains': this.handleOperatorContains,
            'operator_mod': this.handleOperatorMod,
            'operator_round': this.handleOperatorRound,
            'operator_mathop': this.handleOperatorMathop,

            // Control
            'control_repeat': this.handleControlRepeat,
            'control_while': this.handleControlWhileRepeatUntil,
            'control_repeat_until': this.handleControlWhileRepeatUntil,
            'control_forever': this.handleControlForever,
            'control_wait': this.handleControlWait,
            'control_wait_until': this.handleControlWaitUntil,
            'control_if': this.handleControlIf,
            'control_if_else': this.handleControlIfElse,

            // Procedures
            'procedures_call': this.handleProceduresCall,
            'argument_reporter_string_number': this.handleArgumentReporter,
            'argument_reporter_boolean': this.handleArgumentReporter,

            // Pins
            'pins_boardStart': this.handlePinsBoardStart,
            'pins_digitalWrite': this.handlePinsDigitalWrite,
            'pins_pwmWrite': this.handlePinsPwmWrite,
            'pins_analogWrite': this.handlePinsAnalogWrite,
            'pins_servoWrite': this.handlePinsServoWrite,
            'pins_buzzerWrite': this.handlePinsBuzzerWrite,
            'pins_digitalRead': this.handlePinsDigitalRead,
            'pins_analogRead': this.handlePinsAnalogRead,
            'pins_ultrasonicRead': this.handlePinsUltrasonicRead,
            'pins_map': this.handlePinsMap,
            // Pins UNO (wrapper board-specific dari RaceroPins)
            'pinsuno_boardStart': this.handlePinsBoardStart,
            'pinsuno_digitalWrite': this.handlePinsDigitalWrite,
            'pinsuno_pwmWrite': this.handlePinsPwmWrite,
            'pinsuno_analogWrite': this.handlePinsAnalogWrite,
            'pinsuno_servoWrite': this.handlePinsServoWrite,
            'pinsuno_buzzerWrite': this.handlePinsBuzzerWrite,
            'pinsuno_digitalRead': this.handlePinsDigitalRead,
            'pinsuno_analogRead': this.handlePinsAnalogRead,
            'pinsuno_ultrasonicRead': this.handlePinsUltrasonicRead,
            'pinsuno_map': this.handlePinsMap,
            // Pins ESP32 (wrapper board-specific dari RaceroPins)
            'pinsesp32_boardStart': this.handlePinsBoardStart,
            'pinsesp32_digitalWrite': this.handlePinsDigitalWrite,
            'pinsesp32_pwmWrite': this.handlePinsPwmWrite,
            'pinsesp32_analogWrite': this.handlePinsAnalogWrite,
            'pinsesp32_servoWrite': this.handlePinsServoWrite,
            'pinsesp32_buzzerWrite': this.handlePinsBuzzerWrite,
            'pinsesp32_digitalRead': this.handlePinsDigitalRead,
            'pinsesp32_analogRead': this.handlePinsAnalogRead,
            'pinsesp32_ultrasonicRead': this.handlePinsUltrasonicRead,
            'pinsesp32_map': this.handlePinsMap,
            
            // Pin Menus
            'pins_menu_digitalValueMenu': this.handleMenuDigitalValue,
            'pins_menu_analogOutputPinsMenu': this.handleMenuAnalogOutputPins,
            'pins_menu_digitalOutputPinsMenu': this.handleMenuDigitalOutputPins,
            'pins_menu_pwmPinsMenu': this.handleMenuPwmPins,
            'pins_menu_servoPinsMenu': this.handleMenuServoPins,
            'pins_menu_analogInputPinsMenu': this.handleMenuAnalogInputPins,
            'pins_menu_digitalInputPinsMenu': this.handleMenuDigitalInputPins,
            // Pins UNO Menus
            'pinsuno_menu_digitalValueMenu': this.handleMenuDigitalValue,
            'pinsuno_menu_analogOutputPinsMenu': this.handleMenuAnalogOutputPins,
            'pinsuno_menu_digitalOutputPinsMenu': this.handleMenuDigitalOutputPins,
            'pinsuno_menu_pwmPinsMenu': this.handleMenuPwmPins,
            'pinsuno_menu_servoPinsMenu': this.handleMenuServoPins,
            'pinsuno_menu_analogInputPinsMenu': this.handleMenuAnalogInputPins,
            'pinsuno_menu_digitalInputPinsMenu': this.handleMenuDigitalInputPins,
            // Pins ESP32 Menus
            'pinsesp32_menu_digitalValueMenu': this.handleMenuDigitalValue,
            'pinsesp32_menu_analogOutputPinsMenu': this.handleMenuAnalogOutputPins,
            'pinsesp32_menu_digitalOutputPinsMenu': this.handleMenuDigitalOutputPins,
            'pinsesp32_menu_pwmPinsMenu': this.handleMenuPwmPins,
            'pinsesp32_menu_servoPinsMenu': this.handleMenuServoPins,
            'pinsesp32_menu_analogInputPinsMenu': this.handleMenuAnalogInputPins,
            'pinsesp32_menu_digitalInputPinsMenu': this.handleMenuDigitalInputPins,

            // Display
            'display_enableI2cDisplay': this.handleDisplayEnableI2c,
            'display_setCursor': this.handleDisplaySetCursor,
            'display_clearDisplay': this.handleDisplayClearDisplay,
            'display_writeDisplay': this.handleDisplayWriteDisplay,
            'display_menu_displayTypeMenu': this.handleMenuDisplayType,

            // MRT Motors
            'mrtpins_setMotor': this.handleMrtPinsSetMotor,
            'mrtpins_getIRButton': this.handleMrtPinsGetIRButton,
            'mrtpins_menu_dcMotorKindMenu': this.handleMenuDcMotorKind,

            // Robots ESP32: opcode extension modul robot (motor/sensor/MP3/dll)
            'robotesp32_generateCode': this.handlePinsBoardStart,
            'robotesp32_serialPrint': this.handleRobotEsp32SerialPrint,
            'robotesp32_printValue': this.handleRobotEsp32PrintValue,
            'robotesp32_constantPi': this.handleRobotEsp32ConstantPi,
            'robotesp32_toStringValue': this.handleRobotEsp32ToStringValue,
            'robotesp32_setVarType': this.handleRobotEsp32Noop,
            'robotesp32_dcMotor': this.handleRobotEsp32DcMotor,
            'robotesp32_dcMotor130': this.handleRobotEsp32DcMotor130,
            'robotesp32_servoPinAngle': this.handleRobotEsp32ServoPinAngle,
            'robotesp32_onboardRgbColor': this.handleRobotEsp32OnboardRgbColor,
            'robotesp32_onboardRgbValues': this.handleRobotEsp32OnboardRgbValues,
            'robotesp32_buzzerNoteBeat': this.handleRobotEsp32BuzzerNoteBeat,
            'robotesp32_buzzerNoteSecond': this.handleRobotEsp32BuzzerNoteSecond,
            'robotesp32_buzzerNotationSecond': this.handleRobotEsp32BuzzerNotationSecond,
            'robotesp32_mp3Info': this.handleRobotEsp32Noop,
            'robotesp32_mp3PlayTrack': this.handleRobotEsp32Noop,
            'robotesp32_mp3PlaybackControl': this.handleRobotEsp32Noop,
            'robotesp32_mp3PlaybackMode': this.handleRobotEsp32Noop,
            'robotesp32_mp3Distance': this.handleRobotEsp32ZeroReporter,
            'robotesp32_display4Digit': this.handleRobotEsp32Noop,
            'robotesp32_setColorSensorWhiteBalance': this.handleRobotEsp32Noop,
            'robotesp32_colorSensorRead': this.handleRobotEsp32ZeroReporter,
            'robotesp32_pirMotionSensor': this.handleRobotEsp32PirMotionSensor,
            'robotesp32_lm35Temperature': this.handleRobotEsp32Lm35Temperature,
            'robotesp32_ultrasonicDistance': this.handleRobotEsp32UltrasonicDistance,
            'robotesp32_infraredPressed': this.handleRobotEsp32InfraredPressed,
            'robotesp32_digitalRead': this.handleRobotEsp32DigitalRead,
            'robotesp32_digitalWrite': this.handleRobotEsp32DigitalWrite,
            'robotesp32_analogRead': this.handleRobotEsp32AnalogRead,
            'robotesp32_analogWrite': this.handleRobotEsp32AnalogWrite,
            'robotesp32_pullupDigitalRead': this.handleRobotEsp32PullupDigitalRead,
            'robotesp32_stringOfAscii': this.handleRobotEsp32StringOfAscii,
            'robotesp32_asciiOfString': this.handleRobotEsp32AsciiOfString,
            'robotesp32_menu_newlineMenu': this.handleMenuRobotEsp32Default,
            'robotesp32_menu_varTypeMenu': this.handleMenuRobotEsp32Default,
            'robotesp32_menu_motorMenu': this.handleMenuRobotEsp32Default,
            'robotesp32_menu_digitalValueMenu': this.handleMenuRobotEsp32Default,
            'robotesp32_menu_buzzerNoteMenu': this.handleMenuRobotEsp32Default,
            'robotesp32_menu_buzzerBeatMenu': this.handleMenuRobotEsp32Default,
            'robotesp32_menu_mp3ControlMenu': this.handleMenuRobotEsp32Default,
            'robotesp32_menu_mp3ModeMenu': this.handleMenuRobotEsp32Default,
            'robotesp32_menu_colorSensorModeMenu': this.handleMenuRobotEsp32Default,
            'robotesp32_menu_irKeyMenu': this.handleMenuRobotEsp32Default,
            'robotesp32_menu_digitalInputPinsMenu': this.handleMenuRobotEsp32Default,
            'robotesp32_menu_digitalOutputPinsMenu': this.handleMenuRobotEsp32Default,
            'robotesp32_menu_pwmPinsMenu': this.handleMenuRobotEsp32Default,
            'robotesp32_menu_servoPinsMenu': this.handleMenuRobotEsp32Default,
            'robotesp32_menu_analogInputPinsMenu': this.handleMenuRobotEsp32Default
        };

        for (const key in this.handlers) {
            this.handlers[key] = this.handlers[key].bind(this);
        }
    }

    // --- Core Utilities ---

    sanitizeName(variable) {
        const sanitized = variable.replace(/[^a-zA-Z0-9]/g, '_');
        return `var_${sanitized}`;
    }

    resetState() {
        this.includes.clear();
        this.globals.clear();
        this.procedures.clear();
        this.setups.clear();
        this.loopSubstack = undefined;
    }

    getInput(block, inputName) {
        const inputId = block.inputs[inputName] && block.inputs[inputName].block;
        return this.traverseBlock(inputId);
    }

    /**
     * Menu yang memakai acceptReporters muncul sebagai input berisi blok menu,
     * bukan field, sehingga membaca block.fields saja selalu jatuh ke nilai
     * bawaan. Helper ini mencoba field lebih dulu lalu input menunya.
     */
    getMenuValue(block, name, fallback) {
        if (block.fields && block.fields[name] && block.fields[name].value !== undefined) {
            return block.fields[name].value;
        }
        const fromInput = this.getInput(block, name);
        return fromInput === '' ? fallback : fromInput;
    }

    traverseBlock(blockId, isSetup = false) {
        if (!blockId) return '';

        const block = this.blocks.getBlock(blockId);
        if (!block) return '';

        let code = '';
        const handler = this.handlers[block.opcode];
        
        if (handler) {
            code = handler(block, isSetup);
        } else {
            console.warn(`COMPILER: unknown block opcode: ${block.opcode}`);
        }

        const nextCode = this.traverseBlock(block.next, isSetup);
        return code + nextCode;
    }

    // --- Expanded Block Handlers ---

    /* Data & Text */
    handleDataVariable(block) { 
        const variableName = block.fields.VARIABLE.value;
        return this.sanitizeName(variableName); 
    }

    handleDataSetVariableTo(block) { 
        const variableName = this.sanitizeName(block.fields.VARIABLE.value);
        const value = this.getInput(block, 'VALUE');
        return `${variableName} = ${value};\n`; 
    }

    handleDataChangeVariableBy(block) { 
        const variableName = this.sanitizeName(block.fields.VARIABLE.value);
        const value = this.getInput(block, 'VALUE');
        return `${variableName} += ${value}`; 
    }

    handleText(block) {
        const value = block.fields.TEXT.value;
        if (isNaN(value)) {
            return `String("${value}")`;
        }
        return `${value}`;
    }

    handleMathNumber(block) {
        const raw = block.fields && block.fields.NUM && block.fields.NUM.value;
        const value = Number(raw);
        return `${Number.isFinite(value) ? value : 0}`;
    }

    /* Operators */
    handleOperatorAdd(block) { 
        const num1 = this.getInput(block, 'NUM1');
        const num2 = this.getInput(block, 'NUM2');
        return `(${num1} + ${num2})`; 
    }

    handleOperatorSubtract(block) { 
        const num1 = this.getInput(block, 'NUM1');
        const num2 = this.getInput(block, 'NUM2');
        return `(${num1} - ${num2})`; 
    }

    handleOperatorMultiply(block) { 
        const num1 = this.getInput(block, 'NUM1');
        const num2 = this.getInput(block, 'NUM2');
        return `((float)${num1} * (float)${num2})`; 
    }

    handleOperatorDivide(block) { 
        const num1 = this.getInput(block, 'NUM1');
        const num2 = this.getInput(block, 'NUM2');
        return `((float)${num1} / (float)${num2})`; 
    }

    handleOperatorLt(block) { 
        const operand1 = this.getInput(block, 'OPERAND1');
        const operand2 = this.getInput(block, 'OPERAND2');
        return `(${operand1} < ${operand2})`; 
    }

    handleOperatorEquals(block) { 
        const operand1 = this.getInput(block, 'OPERAND1');
        const operand2 = this.getInput(block, 'OPERAND2');
        return `(${operand1} == ${operand2})`; 
    }

    handleOperatorGt(block) { 
        const operand1 = this.getInput(block, 'OPERAND1');
        const operand2 = this.getInput(block, 'OPERAND2');
        return `(${operand1} > ${operand2})`; 
    }

    handleOperatorAnd(block) { 
        const operand1 = this.getInput(block, 'OPERAND1');
        const operand2 = this.getInput(block, 'OPERAND2');
        return `(${operand1} && ${operand2})`; 
    }

    handleOperatorOr(block) { 
        const operand1 = this.getInput(block, 'OPERAND1');
        const operand2 = this.getInput(block, 'OPERAND2');
        return `(${operand1} || ${operand2})`; 
    }

    handleOperatorNot(block) { 
        const operand = this.getInput(block, 'OPERAND');
        return `!${operand}`; 
    }

    handleOperatorRandom(block) { 
        const from = this.getInput(block, 'FROM');
        const to = this.getInput(block, 'TO');
        return `random(${from}, ${to})`; 
    }

    handleOperatorJoin(block) {
        let string1 = this.getInput(block, 'STRING1');
        let string2 = this.getInput(block, 'STRING2');

        if (!isNaN(string1)) {
            string1 = `String("${string1}")`;
        }
        if (!isNaN(string2)) {
            string2 = `String("${string2}")`;
        }

        return `String(${string1} + ${string2})`;
    }

    handleOperatorLetterOf(block) { 
        const string = this.getInput(block, 'STRING');
        const letter = this.getInput(block, 'LETTER');
        return `String(${string}.charAt(${letter}))`; 
    }

    handleOperatorLength(block) { 
        const string = this.getInput(block, 'STRING');
        return `${string}.length()`; 
    }

    handleOperatorContains(block) { 
        const string1 = this.getInput(block, 'STRING1');
        const string2 = this.getInput(block, 'STRING2');
        return `(${string1}.indexOf(${string2}) != -1)`; 
    }

    handleOperatorMod(block) { 
        const num1 = this.getInput(block, 'NUM1');
        const num2 = this.getInput(block, 'NUM2');
        return `${num1} % ${num2}`; 
    }
    
    handleOperatorRound(block) {
        this.includes.add('#include <math.h>');
        const num = this.getInput(block, 'NUM');
        return `round(${num})`;
    }
    
    handleOperatorMathop(block) {
        this.includes.add('#include <math.h>');
        
        const operator = block.fields.OPERATOR.value;
        const n = this.getInput(block, 'NUM');
        
        switch (operator) {
            case 'abs': return `abs(${n})`;
            case 'floor': return `floor(${n})`;
            case 'ceiling': return `ceil(${n})`;
            case 'sqrt': return `sqrt(${n})`;
            case 'sin': return `sin((M_PI * ${n}) / 180.0f)`;
            case 'cos': return `cos((M_PI * ${n}) / 180.0f)`;
            case 'tan': return `tan((M_PI * ${n}) / 180.0f)`;
            case 'asin': return `((asin(${n}) * 180.0f) / M_PI)`;
            case 'acos': return `((acos(${n}) * 180.0f) / M_PI)`;
            case 'atan': return `((atan(${n}) * 180.0f) / M_PI)`;
            case 'ln': return `log(${n})`;
            case 'log': return `log10(${n})`;
            case 'e ^': return `exp(${n})`;
            case '10 ^': return `pow(10, ${n})`;
            default: return '';
        }
    }

    /* Control */
    handleControlRepeat(block) { 
        const times = this.getInput(block, 'TIMES');
        const substack = this.getInput(block, 'SUBSTACK');
        return `for (int i = 0; i < ${times}; ++i) {\n${substack}\n}`; 
    }

    handleControlWhileRepeatUntil(block) { 
        const condition = this.getInput(block, 'CONDITION');
        const substack = this.getInput(block, 'SUBSTACK');
        return `while (${condition}) {\n${substack}\n}`; 
    }

    handlePinsBoardStart() {
        return '';
    }

    handleControlForever(block, isSetup) {
        const substackId = block.inputs.SUBSTACK && block.inputs.SUBSTACK.block;
        
        if (isSetup) {
            this.loopSubstack = substackId;
            return '';
        }
        
        const substackCode = this.traverseBlock(substackId);
        return `for (;;) {\n${substackCode}\n}`;
    }

    handleControlWait(block) { 
        const duration = this.getInput(block, 'DURATION');
        return `delay(${duration} * 1000);\n`; 
    }

    handleControlWaitUntil(block) { 
        const condition = this.getInput(block, 'CONDITION');
        return `while (!${condition}) {\ndelay(5);\n}`; 
    }

    handleControlIf(block) { 
        const condition = this.getInput(block, 'CONDITION');
        const substack = this.getInput(block, 'SUBSTACK');
        return `if (${condition}) {\n${substack}\n}`; 
    }

    handleControlIfElse(block) { 
        const condition = this.getInput(block, 'CONDITION');
        const substack1 = this.getInput(block, 'SUBSTACK');
        const substack2 = this.getInput(block, 'SUBSTACK2');
        return `if (${condition}) {\n${substack1}\n} else {\n${substack2}\n}`; 
    }

    /* Procedures */
    handleProceduresCall(block) {
        const rawFuncName = block.mutation.proccode;
        const funcname = `proc_${this.sanitizeName(rawFuncName)}`;
        const argids_json = JSON.parse(block.mutation.argumentids);
        
        let args = [];
        
        for (let i = 0; i < argids_json.length; i++) {
            const argId = argids_json[i];
            if (block.inputs[argId]) {
                const argValue = this.traverseBlock(block.inputs[argId].block);
                args.push(argValue);
            } else {
                args.push('0');
            }
        }
        
        return `${funcname}(${args.join(', ')});\n`;
    }

    handleArgumentReporter(block) { 
        const argName = this.sanitizeName(block.fields.VALUE.value);
        return `arg_${argName}`; 
    }

    /* Pins */
    handlePinsDigitalWrite(block) {
        const pin = this.getInput(block, 'PIN');
        const value = this.getInput(block, 'VALUE');
        
        this.setups.add(`pinMode(${pin}, OUTPUT);\n`);
        return `digitalWrite(${pin}, ${value});\n`;
    }

    handlePinsPwmWrite(block) {
        const pin = this.getInput(block, 'PIN');
        const value = this.getInput(block, 'VALUE');
        
        this.setups.add(`pinMode(${pin}, OUTPUT);\n`);
        return `analogWrite(${pin}, ${value});\n`;
    }

    handlePinsAnalogWrite(block) {
        const pin = this.getInput(block, 'PIN');
        const value = this.getInput(block, 'VALUE');
        
        this.setups.add(`pinMode(${pin}, OUTPUT);\n`);
        return `analogWrite(${pin}, ${value});\n`;
    }

    handlePinsServoWrite(block) {
        const pin = this.getInput(block, 'PIN');
        const value = this.getInput(block, 'VALUE');

        this.includes.add('#include <Servo.h>');
        this.globals.add(`Servo servo${pin};\n`);
        this.setups.add(`servo${pin}.attach(${pin});\n`);
        
        return `servo${pin}.write(${value});`;
    }

    handlePinsBuzzerWrite(block) { 
        const pin = this.getInput(block, 'PIN');
        const note = block.fields.NOTE.value;
        const beat = block.fields.BEAT.value;
        
        return `tone(${pin}, ${note}, ${beat});`; 
    }

    handlePinsDigitalRead(block) {
        const pin = this.getInput(block, 'PIN');
        
        this.setups.add(`pinMode(${pin}, INPUT);\n`);
        return `digitalRead(${pin})`;
    }

    handlePinsAnalogRead(block) {
        const pin = this.getInput(block, 'PIN');
        
        this.setups.add(`pinMode(${pin}, INPUT);\n`);
        return `analogRead(${pin})`;
    }

    handlePinsUltrasonicRead(block) {
        const trig = this.getInput(block, 'TRIG');
        const echo = this.getInput(block, 'ECHO');
        
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
    }

    handlePinsMap(block) {
        const value = this.getInput(block, 'VALUE');
        const from1 = this.getInput(block, 'FROM1');
        const to1 = this.getInput(block, 'TO1');
        const from2 = this.getInput(block, 'FROM2');
        const to2 = this.getInput(block, 'TO2');
        
        return `((float)(${value} - ${from1}) / (float)(${to1} - ${from1}) * (float)(${to2} - ${from2}))`;
    }

    /* Menus */
    handleMenuDigitalValue(block) { return `${block.fields.digitalValueMenu.value}`; }
    handleMenuAnalogOutputPins(block) { return `${block.fields.analogOutputPinsMenu.value}`; }
    handleMenuDigitalOutputPins(block) { return `${block.fields.digitalOutputPinsMenu.value}`; }
    handleMenuPwmPins(block) { return `${block.fields.pwmPinsMenu.value}`; }
    handleMenuServoPins(block) { return `${block.fields.servoPinsMenu.value}`; }
    handleMenuAnalogInputPins(block) { return `${block.fields.analogInputPinsMenu.value}`; }
    handleMenuDigitalInputPins(block) { return `${block.fields.digitalInputPinsMenu.value}`; }
    handleMenuDisplayType(block) { return `${block.fields.displayTypeMenu.value}`; }
    handleMenuDcMotorKind(block) { return `${block.fields.dcMotorKindMenu.value}`; }

    /* Display */
    handleDisplayEnableI2c(block) {
        const display = block.fields.DISPLAY.value;
        const address = this.getInput(block, 'ADDRESS');
        
        this.globals.add(`#define DISPLAY_TYPE ${display}`);
        this.globals.add(`#define DISPLAY_ADDRESS ${address}`);
        this.includes.add('#include <Wire.h>');
        this.setups.add('Wire.begin();');
        
        if (display === '0') {
            this.includes.add('#include <LiquidCrystal_I2C.h>');
            this.globals.add('LiquidCrystal_I2C lcd(0x27, 16, 2);');
            return `lcd = LiquidCrystal_I2C(DISPLAY_ADDRESS, 16, 2);\nlcd.init();\nlcd.backlight();\nlcd.clear();\nlcd.setCursor(0, 0);\n`;
        } else if (display === '1') {
            this.includes.add('#include "SSD1306Ascii.h"');
            this.includes.add('#include "SSD1306AsciiWire.h"');
            this.globals.add('SSD1306AsciiWire oled;');
            return `oled.begin(&Adafruit128x64, DISPLAY_ADDRESS);\ndelay(50);\noled.setFont(Adafruit5x7);\noled.clear();\noled.setCursor(0, 0);\n`;
        }
        return '';
    }

    handleDisplaySetCursor(block) {
        const col = this.getInput(block, 'COLUMN');
        const row = this.getInput(block, 'ROW');
        
        return `\n#if (DISPLAY_TYPE == 0)\nlcd.setCursor(${col}, ${row});\n#endif\n#if (DISPLAY_TYPE == 1)\noled.setCursor(${col}, ${row});\n#endif\n`;
    }

    handleDisplayClearDisplay(block) {
        return `\n#if (DISPLAY_TYPE == 0)\nlcd.clear();\n#endif\n#if (DISPLAY_TYPE == 1)\noled.clear();\n#endif\n`;
    }

    handleDisplayWriteDisplay(block) {
        const string = this.getInput(block, 'STRING');
        
        return `\n#if (DISPLAY_TYPE == 0)\nlcd.println(${string});\n#endif\n#if (DISPLAY_TYPE == 1)\noled.println(${string});\n#endif\n`;
    }

    /* MRT Motors */
    handleMrtPinsSetMotor(block) {
        const motor = block.fields.MOTOR.value;
        const speed = this.getInput(block, 'SPEED');

        this.includes.add(`#include <avr/io.h>\n#include <avr/interrupt.h>`);
        this.globals.add(`
volatile uint8_t m_speed[4] = {0, 0, 0, 0};
ISR(TIMER2_OVF_vect) {
    static uint8_t m_cnt = 0;
    if (m_cnt < m_speed[0]) PORTC |= 0x40; else PORTC &= ~0x40; // Motor 0
    if (m_cnt < m_speed[1]) PORTC |= 0x10; else PORTC &= ~0x10; // Motor 1
    if (m_cnt < m_speed[2]) PORTD |= 0x40; else PORTD &= ~0x40; // Motor 2
    if (m_cnt < m_speed[3]) PORTB |= 0x10; else PORTB &= ~0x10; // Motor 3
    m_cnt++;
}
`);
        this.procedures.add(`
void mrt_init() {
    DDRC = 0xFF;
    DDRD |= 0x48;
    DDRB |= 0x10;
    PORTC |= 0x07;
    TCCR2 = (1 << CS21);
    TCCR1A = 0;
    TCCR1B = (1 << WGM12) | (1 << CS11);
    OCR1A = 40000;
    TIMSK |= (1 << TOIE2);
    sei();
}`);
        this.procedures.add(`
void mrt_setMotor(char motorID, char speed) {
    char direction = (speed < 0);
    uint8_t s = (speed < 0) ? -speed : speed;
    if (s > 10) s = 10;          // Keep your 0-10 scale
    uint8_t pwmValue = s * 25;   // Scale to 0-250 for the PWM engine
    if (motorID == 1) {
        if (direction) PORTC &= ~0x20; else PORTC |= 0x20; // PC5 (DIR)
        m_speed[1] = pwmValue;
    } else if (motorID == 0) {
        if (direction) PORTC &= ~0x80; else PORTC |= 0x80; // PC7 (DIR)
        m_speed[0] = pwmValue;
    } else if (motorID == 2) {
        if (direction) PORTD &= ~0x08; else PORTD |= 0x08; // PD3 (DIR)
        m_speed[2] = pwmValue;
    } else if (motorID == 3) {
        if (direction) PORTC &= ~0x08; else PORTC |= 0x08; // PC3 (DIR)
        m_speed[3] = pwmValue;
    }
}`);
        this.setups.add('mrt_init();');
        return `mrt_setMotor(${motor}, ${speed});\n`;
    }

    handleMrtPinsGetIRButton (block) {
        const button = block.fields.BUTTON.value;

        this.globals.add(`
const int IR_PIN = 10;
volatile uint32_t lastPulseTime = 0;
volatile uint32_t buttonSignature = 0;
volatile bool newButtonDetected = false;
uint32_t currentActiveButton = 0;
uint32_t lastButtonPressTime = 0;
        `);
        this.setups.add(`mrt_init();`);
        this.setups.add(`
pinMode(IR_PIN, INPUT_PULLUP);
attachInterrupt(digitalPinToInterrupt(IR_PIN), irDecoderISR, FALLING);
        `);
        this.procedures.add(`
void irDecoderISR() {
    uint32_t now = micros();
    uint32_t pulseGap = now - lastPulseTime;
    lastPulseTime = now;
    if (pulseGap > 10000) {
        buttonSignature = 0;
    } else if (pulseGap > 200 && pulseGap < 5000) {
        buttonSignature = (buttonSignature << 8) | (pulseGap / 100);
        newButtonDetected = true;
    }
}
        `)
        this.procedures.add(`
bool isIRButtonPressed(uint32_t targetButton) {
    if (newButtonDetected) {
        delay(10);
        currentActiveButton = buttonSignature;
        lastButtonPressTime = millis();
        newButtonDetected = false;
    }
    if (millis() - lastButtonPressTime > 150) {
        currentActiveButton = 0; 
    }
    return (currentActiveButton == targetButton);
}
        `);
        return `isIRButtonPressed(${button})`;
    }

    /**
     * Handler compiler untuk extension Robots ESP32.
     * Beberapa modul (MP3/display/color) masih noop/fallback
     * sampai command backend khusus tersedia.
     */
    handleRobotEsp32Noop () {
        return '';
    }

    /** Reporter fallback: kembalikan 0 jika modul belum didukung penuh. */
    handleRobotEsp32ZeroReporter () {
        return '0';
    }

    /** Serial print dengan opsi newline on/off. */
    handleRobotEsp32SerialPrint (block) {
        const text = this.getInput(block, 'TEXT');
        const newline = block.fields.NEWLINE && block.fields.NEWLINE.value;
        this.setups.add('Serial.begin(115200);\n');
        if (newline === 'off') {
            return `Serial.print(${text});\n`;
        }
        return `Serial.println(${text});\n`;
    }

    /** Cetak nilai ke Serial. */
    handleRobotEsp32PrintValue (block) {
        const value = this.getInput(block, 'VALUE');
        this.setups.add('Serial.begin(115200);\n');
        return `Serial.println(${value});\n`;
    }

    /** Konstanta pi. */
    handleRobotEsp32ConstantPi () {
        return '3.1415926';
    }

    /** Konversi nilai ke String Arduino. */
    handleRobotEsp32ToStringValue (block) {
        const value = this.getInput(block, 'VALUE');
        return `String(${value})`;
    }

    /**
     * Kontrol DC motor M1/M2 untuk ELF ESP32 (dual-PWM IN1/IN2).
     */
    handleRobotEsp32DcMotor (block) {
        const motor = this.getMenuValue(block, 'MOTOR', 'M1');
        const speed = this.getInput(block, 'SPEED');
        const port = String(motor).trim() === 'M2' ? 'M2' : 'M1';
        this.includes.add('#include <WeELFESP32Motor.h>');
        // M2 wiring fisik terbalik — pass WE_ELF_M2_REVERSE, jangan tukar nomor pin.
        const ctorArgs = port === 'M2'
            ? `WE_ELF_M2_IN1, WE_ELF_M2_IN2, WE_ELF_M2_REVERSE`
            : `WE_ELF_M1_IN1, WE_ELF_M1_IN2`;
        this.globals.add(`WeELFMotor weDcMotor${port}(${ctorArgs});\n`);
        this.setups.add(`weDcMotor${port}.begin();\n`);
        return `weDcMotor${port}.runPercent((int)(${speed}));\n`;
    }

    handleRobotEsp32DcMotor130 (block) {
        const dirPin = this.getInput(block, 'DIRPIN');
        const pwmPin = this.getInput(block, 'PWMPIN');
        const speed = this.getInput(block, 'SPEED');
        this.setups.add(`pinMode(${dirPin}, OUTPUT);\n`);
        this.setups.add(`pinMode(${pwmPin}, OUTPUT);\n`);
        return `digitalWrite(${dirPin}, (${speed}) >= 0 ? HIGH : LOW);\nanalogWrite(${pwmPin}, abs((int)(${speed})));\n`;
    }

    handleRobotEsp32ServoPinAngle (block) {
        const pin = this.getInput(block, 'PIN');
        const angle = this.getInput(block, 'ANGLE');
        this.includes.add('#include <Servo.h>');
        this.globals.add(`Servo servo${pin};\n`);
        this.setups.add(`servo${pin}.attach(${pin});\n`);
        return `servo${pin}.write(${angle});\n`;
    }

    handleRobotEsp32OnboardRgbColor (block) {
        const pin = this.getInput(block, 'PIN');
        const color = this.getInput(block, 'COLOR');
        this.setups.add(`pinMode(${pin}, OUTPUT);\n`);
        return `analogWrite(${pin}, ${color});\n`;
    }

    handleRobotEsp32OnboardRgbValues (block) {
        const pin = this.getInput(block, 'PIN');
        const red = this.getInput(block, 'R');
        this.setups.add(`pinMode(${pin}, OUTPUT);\n`);
        return `analogWrite(${pin}, ${red});\n`;
    }

    handleRobotEsp32BuzzerNoteBeat (block) {
        const pin = this.getInput(block, 'PIN');
        const note = this.getMenuValue(block, 'NOTE', 262);
        const beat = this.getMenuValue(block, 'BEAT', 500);
        return `tone(${pin}, ${note}, ${beat});\n`;
    }

    handleRobotEsp32BuzzerNoteSecond (block) {
        const pin = this.getInput(block, 'PIN');
        const note = this.getMenuValue(block, 'NOTE', 262);
        const second = this.getInput(block, 'SECOND');
        return `tone(${pin}, ${note}, (int)((${second}) * 1000));\n`;
    }

    handleRobotEsp32BuzzerNotationSecond (block) {
        const pin = this.getInput(block, 'PIN');
        const notation = this.getInput(block, 'NOTATION');
        const second = this.getInput(block, 'SECOND');
        return `tone(${pin}, 220 + ((int)(${notation}) * 40), (int)((${second}) * 1000));\n`;
    }

    handleRobotEsp32PirMotionSensor (block) {
        const pin = this.getInput(block, 'PIN');
        this.setups.add(`pinMode(${pin}, INPUT);\n`);
        return `(digitalRead(${pin}) == HIGH)`;
    }

    handleRobotEsp32Lm35Temperature (block) {
        const pin = this.getInput(block, 'PIN');
        this.setups.add(`pinMode(${pin}, INPUT);\n`);
        return `analogRead(${pin})`;
    }

    handleRobotEsp32UltrasonicDistance (block) {
        const trig = this.getInput(block, 'TRIG');
        const echo = this.getInput(block, 'ECHO');
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
    }

    handleRobotEsp32InfraredPressed (block) {
        const pin = this.getInput(block, 'PIN');
        this.setups.add(`pinMode(${pin}, INPUT);\n`);
        return `(digitalRead(${pin}) == HIGH)`;
    }

    handleRobotEsp32DigitalRead (block) {
        return this.handlePinsDigitalRead(block);
    }

    handleRobotEsp32DigitalWrite (block) {
        const pin = this.getInput(block, 'PIN');
        const value = this.getMenuValue(block, 'VALUE', 'LOW');
        this.setups.add(`pinMode(${pin}, OUTPUT);\n`);
        return `digitalWrite(${pin}, ${value});\n`;
    }

    handleRobotEsp32AnalogRead (block) {
        return this.handlePinsAnalogRead(block);
    }

    handleRobotEsp32AnalogWrite (block) {
        return this.handlePinsAnalogWrite(block);
    }

    handleRobotEsp32PullupDigitalRead (block) {
        const pin = this.getInput(block, 'PIN');
        this.setups.add(`pinMode(${pin}, INPUT_PULLUP);\n`);
        return `digitalRead(${pin})`;
    }

    handleRobotEsp32StringOfAscii (block) {
        const code = this.getInput(block, 'CODE');
        return `String((char)(${code}))`;
    }

    handleRobotEsp32AsciiOfString (block) {
        const text = this.getInput(block, 'TEXT');
        return `(int)(${text})[0]`;
    }

    handleMenuRobotEsp32Default (block) {
        const fieldName = Object.keys(block.fields || {})[0];
        return fieldName ? `${block.fields[fieldName].value}` : '0';
    }

    // --- Compiling Engine ---
    generateProcedures() {
        let procedures = {};

        // 1. Find Definitions
        for (const blockId in this.blocks._blocks) {
            const block = this.blocks._blocks[blockId];
            if (block.opcode !== 'procedures_definition') continue;

            const prototype = this.blocks._blocks[block.inputs.custom_block.block];
            const funcname = `proc_${this.sanitizeName(prototype.mutation.proccode)}`;

            const argids_json = JSON.parse(prototype.mutation.argumentids);
            const argnames_json = JSON.parse(prototype.mutation.argumentnames);

            procedures[funcname] = {
                nextId: block.next,
                args: {},
                argIds: argids_json
            };

            for (let i = 0; i < argids_json.length; i++) {
                const id = argids_json[i];
                procedures[funcname].args[id] = {
                    name: `arg_${this.sanitizeName(argnames_json[i])}`,
                    type: 'float' // Default type
                };
            }
        }

        // 2. Infer Types
        for (const blockId in this.blocks._blocks) {
            const block = this.blocks._blocks[blockId];
            if (block.opcode !== 'procedures_call') continue;

            const funcname = `proc_${this.sanitizeName(block.mutation.proccode)}`;
            if (!procedures[funcname]) continue;

            const argids_json = JSON.parse(block.mutation.argumentids);
            for (let i = 0; i < argids_json.length; i++) {
                const argId = argids_json[i];
                if (!block.inputs[argId]) continue;

                const inputBlockId = block.inputs[argId].block;
                const inputBlock = this.blocks.getBlock(inputBlockId);
                if (!inputBlock) continue;

                if (inputBlock.opcode === 'text') {
                    const val = inputBlock.fields.TEXT.value;
                    if (isNaN(val)) procedures[funcname].args[argId].type = 'String';
                } else if (inputBlock.opcode.startsWith('operator_') && 
                          ['equals', 'lt', 'gt', 'and', 'or', 'not', 'contains'].some(op => inputBlock.opcode.includes(op))) {
                    procedures[funcname].args[argId].type = 'bool';
                }
            }
        }

        // 3. Generate Functions
        for (const p in procedures) {
            const proc = procedures[p];
            const argsList = proc.argIds.map(id => `${proc.args[id].type} ${proc.args[id].name}`).join(', ');
            const bodyCode = this.traverseBlock(proc.nextId, false);

            this.procedures.add(`\nvoid ${p}(${argsList}) {\n${bodyCode}\n}\n`);
        }
    }

    generateVariables() {
        const variables = {};
        
        for (const blockId in this.blocks._blocks) {
            const block = this.blocks._blocks[blockId];
            if (block.opcode === 'data_variable' || block.opcode === 'data_setvariableto') {
                if (block.fields && block.fields['VARIABLE']) {
                    const name = this.sanitizeName(block.fields.VARIABLE.value);
                    if (block.inputs && block.inputs.VALUE) {
                        variables[name] = this.traverseBlock(block.inputs.VALUE.block);
                    }
                }
            }
        }

        for (const v in variables) {
            this.globals.add(`auto ${v} = ${variables[v]};`);
        }
    }

    /**
     * Cari blok entry untuk setup().
     * Mendukung hat Pins lama/baru dan Generate Code dari Robots ESP32.
     */
    findSetupEntryBlockId() {
        const topBlocks = this.blocks.getScripts();
        let fallbackId = null;

        for (let i = 0; i < topBlocks.length; i++) {
            const blockId = topBlocks[i];
            const block = this.blocks.getBlock(blockId);
            if (!block) continue;

            // Hat yang menandai awal program upload
            if (block.opcode === 'pins_boardStart' || block.opcode === 'pinsuno_boardStart' ||
                block.opcode === 'pinsesp32_boardStart' || block.opcode === 'robotesp32_generateCode') {
                return block.next || null;
            }

            if (
                !fallbackId &&
                block.opcode !== 'procedures_definition' &&
                block.opcode !== 'procedures_prototype'
            ) {
                fallbackId = blockId;
            }
        }

        return fallbackId;
    }

    renderSketch(setupCode, loopCode) {
        const includesStr = Array.from(this.includes).join('\n').trim();
        const globalsStr = Array.from(this.globals).join('\n').trim();
        const proceduresStr = Array.from(this.procedures).join('\n').trim();
        const setupsStr = Array.from(this.setups).join('\n').trim();

        const code = `
        ${includesStr}

        ${globalsStr}
        ${proceduresStr}
        void setup() {
            ${setupsStr}
            ${setupCode}
        }

        void loop() {
            ${loopCode}
        }
        `;

        return beautify.js(code, {
            "indent_size": "4",
            "indent_char": " ",
            "max_preserve_newlines": "5",
            "preserve_newlines": true,
            "keep_array_indentation": true,
            "break_chained_methods": false,
            "indent_scripts": "normal",
            "brace_style": "collapse",
            "space_before_conditional": true,
            "unescape_strings": false,
            "jslint_happy": false,
            "end_with_newline": false,
            "wrap_line_length": "0",
            "indent_inner_html": false,
            "comma_first": false,
            "e4x": false,
            "indent_empty_lines": false
        });
    }

    generate() {
        this.resetState();

        const target = this.vm && this.vm.editingTarget;
        if (!target || !target.blocks) {
            return this.renderSketch('', '');
        }

        this.blocks = target.blocks;

        this.generateVariables();
        this.generateProcedures();

        const setupEntryId = this.findSetupEntryBlockId();
        const setupCode = this.traverseBlock(setupEntryId, true);

        let loopCode = '';
        if (this.loopSubstack) {
            loopCode = this.traverseBlock(this.loopSubstack, false);
        }

        return this.renderSketch(setupCode, loopCode);
    }
}

export function generateCode(vm) {
    const compiler = new ArduinoCompiler(vm);
    return compiler.generate();
}
