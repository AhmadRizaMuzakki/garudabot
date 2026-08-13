const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');

const {
    boards,
    PinCapability,
    getBoardPinsMenu
} = require('racero-boards');

const formatMessage = require('format-message');

const iconURI = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAAAXNSR0IArs4c6QAAAARzQklUCAgICHwIZIgAAAbRSURBVHic7Z3bblNHFIb/7fNhx8GHxDuOU+z2ArVuxaFUqKhCtBxSMNzQN+gT9EF60Qeo+gbtLSoFlKYVCgglapsgRAopCZjgHJzYMfb2afcCeohngwTaM7az1ne5LuZ3vP/MLM9eawZgGIZhGIZhyKE5PeDS0lLA7/d/YVnWsNNjU0bTtG3TNL/PZrN1R8d1crBCoXAUwA8AJpwcl/mXFQCXUqnUbacGdDk10Au+5ocvlYkX37FjODYDLCws+KLRqOnUeMzLKZVK/lwu13BiLMdmgFAo5PRswrwEJ79rfmjEYQMQx6NCpFwuCzFN0zA0NKRCvq/5bW4OO9WqEM9kMhhPp6XrSzdAoVDA77OzgLY736ybJk6fPQtd12V/hL5mcXERB7oedLPVQrFY3BsG6HQ6CPn9yIyO7oovrKzAsizZ8gPBUDAIl+u/1Xh9e1uZNucAxGEDEEdJEsi8mma7DbTbPdFWYgDLsrBULAoxBjAMA/dWV4X4u6mUEn3pBkin07sSnH9wuVz8MxDAJydO9FRfyQyQUuRm5vXhJJA4nAT2mEePHqFeqwnxpGEoWSKlG2BtbQ3Xr15Fd8rn8/lwPp9HIBCQ/RH6mpkbNzAejwvxSqWCw0eOSNeXbgDTNDGWSGB/107gnZUVNJtN8gYAgLFYrGc7gcqWAMeLDxlH4CSQOGwA4ihbAopbW6qkBopQKITZBw+E+IFYTIm+dAOMjo6itLEh/Ap4Kx7nnUAA5y9cQLPZFOJer1eJvnQD+Hw+fHDwoGyZgUbVw7aDcwDiKMkBajY7XS6XC36/X4V8X3P3zh1Unz0T4ul0GknDkK4v3QCrT57g1s2bwj5AvdFAPp9HKByW/RH6mvn5ebwzNrYrZlkWCoXC3jBAq93GvnDYtiaw3enIlh8IorrONYFMb2ADEIdfB/cBFtCz5VCZAVbW1lRJDRTxWAxz9+8L8feTSSX6SmoCW62WEJ/gmkAAwKenT/dUX8kMkMlkVMgwbwAngcThJLDHFItF1OviuU8jIyMIBoPS9aUbYGNjA79MTwtxr8eDM5OT8Pl8sj9CXzM9NQXD5tXvxvr63qgJrNVqiOm6UPh4r1CAaZrkDQAA6Xh879cEet1uVVLMa8BJIHHYAMRRtgRsViqqpAYKn8+H+eVlIb5/3z4l+tINEI/H8SQSQXfVm6rWp37nXD6PRkM88zGsqE5CugGCwSA+OnZMtszA4vV6uSaQ6R1sAOIoOyKmG03jbkEAWF5eti2aHTMMRIblX7kg3QDFYhHXr10ThT0eXLh4kXx38K2ZGaQTCSH+rFrdG1vBjUYDqUTCtiiU28OfY0SjXBTK9AY2AHHYAMRRthW8Wiqpkhoo9HAYtxcXhfh7uZwSfekGMAwD29vbQNdPwUgyyVvBAD7P59G2OSbWrej1uXQDeDwe5BS5eVBR9bDt4ByAOFwU2mPK5TJMU7xtL95VJiYL6QYol8u4NTMjCns8OHHypJI/sp/56coVRG2uzYklkzh0+LB0fSUG8GkaRiKRXfG/1tZQrVbJJ4JWp4O3k0lhJ1DVcfrKloAwb/n2JbTnX4YNQB1lS8COzTtv5vlhWX/aXBmTUJQbSTfAcCSCtsuFp123Y4Z1XVnhYz9zZnLStig0puikUMfKcpaWlgJ+v5//zRVgmmYwm82KHaVvAOcAxOGdwB6zurpqe2XMaDKJUCgkXV9+e/j6On6emhLiXq8Xk+fOke8O/nV6GmM2V8aUSqW9URNYq9eRGB7GRFfh493Hj7k9/AXjFK6McRPf8+9X+KkQhw1AHGVLwEa5rEpqoAgEAvjj4UMhnt0r7eGJRAJPo1F0H4Q6puvkXwXjFe3hKk4IgwoDBAIBfHj0qGyZgcXtdit72HZwDkAc3gnsMbVazXYJGFbQGQwVBqju7GBudlaIuz0efHz8uGz5vufHy5cRtLk7yRgfx8FDh6TrSzdAaWsLHdNErOvV78rmJiqVCvlEsNVq4UA2K+wEdhTdH6BsCYh0v/vf3FQlzbwCTgKJwwYgjrIloG6T6TIANA0Pba7Tidg0i8hAugF0XUe10cD9YnG3sNfb0w2QfuGzU6dsW8MSNucGyYBrAgcQrglkHIMNQBw2AHHYAMRhAxCHDUAcNgBx2ADEYQMQhw1AHDYAcdgAxGEDEIcNQBw2AHHYAMRhAxCHDUAcNgBx2ADEYQMQhw1AHDYAcRy9wrtQKOwA4BOg5VJNpVKOtQ05PQN86/B4jIij37GjMwCezwLfaJr2pWVZtBv/HUbTtIplWd+lUqmvHB3XycH+z8LCAp8B6yC5XI67axmGYRiGYRiGYRiGYZg35282hcutK5p5dAAAAABJRU5ErkJggg==";

class RaceroPins {
    constructor (runtime) {
        this.runtime = runtime;

        if (this.runtime.boardConfig && this.runtime.boardConfig.name) {
            this.boardName = this.runtime.boardConfig.name;
        } else {
            this.boardName = "Arduino Uno";
            this.runtime.boardConfig = {
                name: this.boardName
            };
        }

        this.runtime.on('PROJECT_LOADED', () => {
            if (this.runtime.boardConfig) {
                this.changeBoard(this.runtime.boardConfig.name);
            }
        });

    }
    changeBoard(boardName) {
        if (this.boardName === boardName) return;
        this.boardName = boardName;
        this.runtime.boardConfig.name = boardName;

        this.runtime.requestBlocksUpdate();
    }
    getInfo() {
        return {
            id: 'pins',
            name: 'Pins',
            color1: '#D84315',
            color2: '#BF360C',
            color3: '#8E2400',
            blockIconURI: iconURI,
            blocks: [
                {
                    opcode: 'boardStart',
                    blockType: BlockType.HAT,
                    text: formatMessage({
                        id: 'pins.boardStart',
                        default: 'when board started',
                        description: 'when board started'
                    }),
                    isEdgeActivated: false
                },
                {
                    opcode: 'digitalWrite',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'pins.digitalWrite',
                        default: 'write digital pin [PIN] to [VALUE]',
                        description: 'write value to digital pin'
                    }),
                    arguments: {
                        PIN: {
                            type: ArgumentType.NUMBER,
                            menu: 'digitalOutputPinsMenu',
                            defaultValue: 0
                        },
                        VALUE: {
                            type: ArgumentType.NUMBER,
                            menu: 'digitalValueMenu',
                            defaultValue: 1
                        }
                    }
                },
                {
                    opcode: 'pwmWrite',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'pins.pwmWrite',
                        default: 'write pwm pin [PIN] to [VALUE]',
                        description: 'write value to pwm pin'
                    }),
                    arguments: {
                        PIN: {
                            type: ArgumentType.NUMBER,
                            menu: 'pwmPinsMenu',
                            defaultValue: 0
                        },
                        VALUE: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 0
                        }
                    }
                },
                {
                    opcode: 'analogWrite',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'pins.analogWrite',
                        default: 'write analog pin [PIN] to [VALUE]',
                        description: 'write value to analog pin'
                    }),
                    arguments: {
                        PIN: {
                            type: ArgumentType.NUMBER,
                            menu: 'analogOutputPinsMenu',
                            defaultValue: 0
                        },
                        VALUE: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 0
                        }
                    }
                },
                {
                    opcode: 'servoWrite',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'pins.servoWrite',
                        default: 'set servo [PIN] rotation to [VALUE]',
                        description: 'set servo rotation'
                    }),
                    arguments: {
                        PIN: {
                            type: ArgumentType.NUMBER,
                            menu: 'servoPinsMenu',
                            defaultValue: 0
                        },
                        VALUE: {
                            type: ArgumentType.ANGLE,
                            defaultValue: 0
                        }
                    }
                },
                {
                    opcode: 'buzzerWrite',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'pins.buzzerWrite',
                        default: 'play tone [PIN] of note [NOTE] & beat [BEAT]',
                        description: 'set servo rotation'
                    }),
                    arguments: {
                        PIN: {
                            type: ArgumentType.NUMBER,
                            menu: 'digitalOutputPinsMenu',
                            defaultValue: 0
                        },
                        NOTE: {
                            type: ArgumentType.NUMBER,
                            menu: 'buzzerNoteMenu'
                        },
                        BEAT: {
                            type: ArgumentType.NUMBER,
                            menu: 'buzzerBeatMenu'
                        }
                    }
                },
                {
                    opcode: 'digitalRead',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'pins.digitalRead',
                        default: 'read digital pin [PIN]',
                        description: 'turn a motor on for some time'
                    }),
                    arguments: {
                        PIN: {
                            type: ArgumentType.NUMBER,
                            menu: 'digitalInputPinsMenu',
                            defaultValue: 0
                        }
                    }
                },
                {
                    opcode: 'analogRead',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'pins.analogRead',
                        default: 'read analog pin [PIN]',
                        description: 'turn a motor on for some time'
                    }),
                    arguments: {
                        PIN: {
                            type: ArgumentType.NUMBER,
                            menu: 'analogInputPinsMenu',
                            defaultValue: 0
                        }
                    }
                },
                {
                    opcode: 'ultrasonicRead',
                    blockType: BlockType.REPORTER,
                    text: 'distance (cm) trig [TRIG] echo [ECHO]',
                    arguments: {
                        TRIG: {
                            type: ArgumentType.NUMBER,
                            menu: 'digitalOutputPinsMenu',
                            defaultValue: 0
                        },
                        ECHO: {
                            type: ArgumentType.NUMBER,
                            menu: 'digitalInputPinsMenu',
                            defaultValue: 0
                        }
                    }
                },
                {
                    opcode: 'map',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'pins.map',
                        default: 'map [VALUE] from [FROM1] ~ [TO1] to [FROM2] ~ [TO2]',
                        description: 'map value from one range to another'
                    }),
                    arguments: {
                        VALUE: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 0
                        },
                        FROM1: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 0
                        },
                        TO1: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 1023
                        },
                        FROM2: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 0
                        },
                        TO2: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 255
                        },
                    }
                },
            ],
            menus: {
                digitalValueMenu: {
                    acceptReporters: true,
                    items: [
                        { text: 'high', value: '1'},
                        { text: 'low', value: '0'}
                    ]
                },
                digitalInputPinsMenu: {
                    acceptReporters: true,
                    items: 'getDigitalInputPins'
                },
                digitalOutputPinsMenu: {
                    acceptReporters: true,
                    items: 'getDigitalOutputPins'
                },
                pwmPinsMenu: {
                    acceptReporters: true,
                    items: 'getPwmPins'
                },
                servoPinsMenu: {
                    acceptReporters: true,
                    items: 'getServoPins'
                },
                analogInputPinsMenu: {
                    acceptReporters: true,
                    items: 'getAnalogInputPins'
                },
                analogOutputPinsMenu: {
                    acceptReporters: true,
                    items: 'getAnalogOutputPins'
                },
                buzzerNoteMenu: {
                    acceptReporters: false,
                    items: 'getBuzzerNote'
                },
                buzzerBeatMenu: {
                    acceptReporters: false,
                    items: [
                        {text: 'Whole', value: '1000'},
                        {text: 'Half', value: '500'},
                        {text: 'Quarter', value: '250'},
                        {text: 'Eighth', value: '125'},
                    ]
                }
            }
        };
    }
    boardStart (args) {
    }
    digitalWrite (args) {
        const pin = Number(args.PIN);
        const value = Number(args.VALUE);
        const tauri = window.__TAURI__;
        if (!tauri) return;
        return tauri.core.invoke('pin_digital_write', {
            pin: pin,
            value: value
        });
    }
    pwmWrite (args) {
        const pin = Number(args.PIN);
        const value = Number(args.VALUE);
        const tauri = window.__TAURI__;
        if (!tauri) return;
        return tauri.core.invoke('pin_pwm_write', {
            pin: pin,
            value: value
        });
    }
    analogWrite (args) {
        const pin = Number(args.PIN);
        const value = Number(args.VALUE);
        const tauri = window.__TAURI__;
        if (!tauri) return;
        return tauri.core.invoke('pin_analog_write', {
            pin: pin,
            value: value
        });
    }
    servoWrite (args) {
        const pin = Number(args.PIN);
        const value = Number(args.VALUE);
        const tauri = window.__TAURI__;
        if (!tauri) return;
        return tauri.core.invoke('pin_servo_write', {
            pin: pin,
            value: value
        });
    }
    buzzerWrite (args) {
        const pin = Number(args.PIN);
        const note = Number(args.NOTE);
        const beat = Number(args.BEAT);
        const tauri = window.__TAURI__;
        if (!tauri) return;
        return tauri.core.invoke('pin_tone', {
            pin: pin,
            frequency: note,
            duration: beat
        });
    }
    digitalRead (args) {
        const pin = Number(args.PIN);
        const tauri = window.__TAURI__;
        if (!tauri) return 0;
        return tauri.core.invoke('pin_digital_read', {
            pin: pin
        }).then(value => {
            return value;
        }).catch(() => 0);
    }
    analogRead (args) {
        const pin = Number(args.PIN);
        const tauri = window.__TAURI__;
        if (!tauri) return 0;
        return tauri.core.invoke('pin_analog_read', {
            pin: pin
        }).then(value => {
            return value;
        }).catch(err => {
            console.error(err);
            return 0;
        });
    }
    ultrasonicRead (args) {
        const trig = Number(args.TRIG);
        const echo = Number(args.ECHO);
        const tauri = window.__TAURI__;
        if (!tauri) return 0;
        return tauri.core.invoke('pin_ultrasonic_read', {
            trig: trig,
            echo: echo,
        }).then(value => {
            return value;
        }).catch(err => {
            console.error(err);
            return 0;
        });

    }
    map (args) {
        const value = Number(args.VALUE);
        const from1 = Number(args.FROM1);
        const from2 = Number(args.FROM2);
        const to1 = Number(args.TO1);
        const to2 = Number(args.TO2);

        return ((value - from1) / (to1 - from1)) * (to2 - from2);
    }

    getDigitalInputPins () {
        const pins = getBoardPinsMenu(this.boardName, PinCapability.INPUT | PinCapability.DIGITAL);
        return pins;
    }

    getDigitalOutputPins () {
        console.log(boards);
        console.log(this.boardName);
        console.log(boards[this.boardName]);
        const pins = getBoardPinsMenu(this.boardName, PinCapability.OUTPUT | PinCapability.DIGITAL);
        return pins;
    }

    getPwmPins () {
        const pins = getBoardPinsMenu(this.boardName, PinCapability.OUTPUT | PinCapability.PWM);
        return pins;
    }

    getServoPins () {
        const pins = getBoardPinsMenu(this.boardName, PinCapability.OUTPUT | PinCapability.SERVO);
        return pins;
    }

    getAnalogInputPins () {
        const pins = getBoardPinsMenu(this.boardName, PinCapability.INPUT | PinCapability.ANALOG);
        return pins;
    }

    getAnalogOutputPins () {
        const pins = getBoardPinsMenu(this.boardName, PinCapability.OUTPUT | PinCapability.ANALOG);
        return pins;
    }

    getBuzzerNote () {
        return [
            // Octave 2
            {text: 'C2', value: '65'}, {text: 'D2', value: '73'},
            {text: 'E2', value: '82'}, {text: 'F2', value: '87'},
            {text: 'G2', value: '98'}, {text: 'A2', value: '110'},
            {text: 'B2', value: '123'},
            // Octave 3
            {text: 'C3', value: '131'}, {text: 'D3', value: '147'},
            {text: 'E3', value: '165'}, {text: 'F3', value: '175'},
            {text: 'G3', value: '196'}, {text: 'A3', value: '220'},
            {text: 'B3', value: '247'},
            // Octave 4
            {text: 'C4', value: '262'}, {text: 'D4', value: '294'},
            {text: 'E4', value: '330'}, {text: 'F4', value: '349'},
            {text: 'G4', value: '392'}, {text: 'A4', value: '440'},
            {text: 'B4', value: '494'},
            // Octave 5
            {text: 'C5', value: '523'}, {text: 'D5', value: '587'},
            {text: 'E5', value: '659'}, {text: 'F5', value: '698'},
            {text: 'G5', value: '784'}, {text: 'A5', value: '880'},
            {text: 'B5', value: '988'},
            // Octave 6
            {text: 'C6', value: '1047'}, {text: 'D6', value: '1175'},
            {text: 'E6', value: '1319'}, {text: 'F6', value: '1397'},
            {text: 'G6', value: '1568'}, {text: 'A6', value: '1760'},
            {text: 'B6', value: '1976'},
            // Octave 7
            {text: 'C7', value: '2093'}, {text: 'D7', value: '2349'},
            {text: 'E7', value: '2637'}, {text: 'F7', value: '2794'},
            {text: 'G7', value: '3136'}, {text: 'A7', value: '3520'},
            {text: 'B7', value: '3951'},
            // Octave 8
            {text: 'C8', value: '4186'}, {text: 'D8', value: '4699'}
        ];
    }
}

module.exports = RaceroPins;
