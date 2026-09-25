/**
 * Extension blok ESP32 Robots untuk Garudabot / Racero.
 *
 * Isi extension:
 * - General: serial print, string, konstanta
 * - Motor: DC motor, servo
 * - Sound And Light: RGB, buzzer
 * - MP3 / Display / Sensing: modul sensor & output
 * - Other: digital/analog read-write
 *
 * Catatan:
 * - menuIconURI dipakai agar icon hanya muncul di toolbar kiri,
 *   tidak ikut menempel di dalam setiap blok.
 * - Beberapa modul (MP3, 4-digit display, color sensor) masih fallback
 *   sampai command backend khusus tersedia.
 */

const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');

const {
    PinCapability,
    getBoardPinsMenu
} = require('racero-boards');

/** Icon kategori di toolbar (bukan icon di dalam blok). */
const iconURI = "data:image/png;base64,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";

class RaceroRobotsEsp32 {
    constructor (runtime) {
        this.runtime = runtime;
        /** Nama board yang dipakai untuk menu pin dinamis. */
        this.boardName = 'ESP32 Dev Module';
    }

    /**
     * Metadata extension: id, warna, icon toolbar, daftar blok, dan menu.
     * @returns {object} Info extension untuk Racero VM.
     */
    getInfo () {
        return {
            id: 'robotesp32',
            name: 'ESP32 Robots',
            menuIconURI: iconURI,
            color1: '#4C97FF',
            color2: '#3373CC',
            color3: '#2E66C2',
            blocks: [
                'label:General',
                {opcode: 'generateCode', blockType: BlockType.HAT, text: 'Generate Code'},
                {opcode: 'serialPrint', blockType: BlockType.COMMAND, text: 'Serial print [TEXT] newline [NEWLINE]', arguments: {
                    TEXT: {type: ArgumentType.STRING, defaultValue: '100'},
                    NEWLINE: {type: ArgumentType.STRING, menu: 'newlineMenu', defaultValue: 'on'}
                }},
                {opcode: 'printValue', blockType: BlockType.COMMAND, text: 'print [VALUE]', arguments: {
                    VALUE: {type: ArgumentType.STRING, defaultValue: '100'}
                }},
                {opcode: 'constantPi', blockType: BlockType.REPORTER, text: 'constant π'},
                {opcode: 'toStringValue', blockType: BlockType.REPORTER, text: 'String [VALUE]', arguments: {
                    VALUE: {type: ArgumentType.STRING, defaultValue: '0'}
                }},
                {opcode: 'setVarType', blockType: BlockType.COMMAND, text: 'set [VAR] type [TYPE]', arguments: {
                    VAR: {type: ArgumentType.STRING, defaultValue: 'i'},
                    TYPE: {type: ArgumentType.STRING, menu: 'varTypeMenu', defaultValue: 'Number'}
                }},
                '---',
                'label:Motor',

                {opcode: 'dcMotor', blockType: BlockType.COMMAND, text: 'dc motor [MOTOR] speed [SPEED]', arguments: {
                    MOTOR: {type: ArgumentType.STRING, menu: 'motorMenu', defaultValue: 'M1'},
                    SPEED: {type: ArgumentType.SLIDER, defaultValue: 100}
                }},
                {opcode: 'dcMotor130', blockType: BlockType.COMMAND, text: '130 DC motor direction pin connected to [DIRPIN] speed pin (PWM) connected to [PWMPIN] speed [SPEED]', arguments: {
                    DIRPIN: {type: ArgumentType.NUMBER, menu: 'digitalOutputPinsMenu', defaultValue: 5},
                    PWMPIN: {type: ArgumentType.NUMBER, menu: 'pwmPinsMenu', defaultValue: 25},
                    SPEED: {type: ArgumentType.SLIDER, defaultValue: 100}
                }},
                {opcode: 'servoPinAngle', blockType: BlockType.COMMAND, text: 'servo pin [PIN] angle [ANGLE]', arguments: {
                    PIN: {type: ArgumentType.NUMBER, menu: 'servoPinsMenu', defaultValue: 13},
                    ANGLE: {type: ArgumentType.ANGLE, defaultValue: 0}
                }},
                '---',
                'label:Sound And Light',

                {opcode: 'onboardRgbColor', blockType: BlockType.COMMAND, text: 'onboard RGB [PIN] [COLOR]', arguments: {
                    PIN: {type: ArgumentType.NUMBER, menu: 'digitalOutputPinsMenu', defaultValue: 2},
                    COLOR: {type: ArgumentType.COLOR, defaultValue: '#ff8800'}
                }},
                {opcode: 'onboardRgbValues', blockType: BlockType.COMMAND, text: 'onboard RGB [PIN] R [R] G [G] B [B]', arguments: {
                    PIN: {type: ArgumentType.NUMBER, menu: 'digitalOutputPinsMenu', defaultValue: 2},
                    R: {type: ArgumentType.NUMBER, defaultValue: 255},
                    G: {type: ArgumentType.NUMBER, defaultValue: 255},
                    B: {type: ArgumentType.NUMBER, defaultValue: 255}
                }},

                {opcode: 'buzzerNoteBeat', blockType: BlockType.COMMAND, text: 'Buzzer pin [PIN] Frequency [NOTE] duration [BEAT] ms', arguments: {
                    PIN: {type: ArgumentType.NUMBER, menu: 'digitalOutputPinsMenu', defaultValue: 27},
                    NOTE: {type: ArgumentType.STRING, menu: 'buzzerNoteMenu', defaultValue: '262'},
                    BEAT: {type: ArgumentType.STRING, menu: 'buzzerBeatMenu', defaultValue: '500'}
                }},
                {opcode: 'buzzerNoteSecond', blockType: BlockType.COMMAND, text: 'Buzzer pin [PIN] Frequency [NOTE] duration [SECOND] second ms', arguments: {
                    PIN: {type: ArgumentType.NUMBER, menu: 'digitalOutputPinsMenu', defaultValue: 27},
                    NOTE: {type: ArgumentType.STRING, menu: 'buzzerNoteMenu', defaultValue: '262'},
                    SECOND: {type: ArgumentType.NUMBER, defaultValue: 0.5}
                }},
                {opcode: 'buzzerNotationSecond', blockType: BlockType.COMMAND, text: 'Buzzer pin [PIN] Frequency notation [NOTATION] duration [SECOND] second ms', arguments: {
                    PIN: {type: ArgumentType.NUMBER, menu: 'digitalOutputPinsMenu', defaultValue: 27},
                    NOTATION: {type: ArgumentType.NUMBER, defaultValue: 1},
                    SECOND: {type: ArgumentType.NUMBER, defaultValue: 0.5}
                }},
                '---',
                'label:MP3',

                {opcode: 'mp3Info', blockType: BlockType.COMMAND, text: 'Mp3 module Rx is connected to [RX], TX is connected to [TX], and the playback volume [VOL]', arguments: {
                    RX: {type: ArgumentType.NUMBER, menu: 'digitalInputPinsMenu', defaultValue: 16},
                    TX: {type: ArgumentType.NUMBER, menu: 'digitalOutputPinsMenu', defaultValue: 17},
                    VOL: {type: ArgumentType.NUMBER, defaultValue: 20}
                }},
                {opcode: 'mp3PlayTrack', blockType: BlockType.COMMAND, text: 'Mp3 module RX connected to [RX] TX connected to [TX] playing [TRACK]', arguments: {
                    RX: {type: ArgumentType.NUMBER, menu: 'digitalInputPinsMenu', defaultValue: 16},
                    TX: {type: ArgumentType.NUMBER, menu: 'digitalOutputPinsMenu', defaultValue: 17},
                    TRACK: {type: ArgumentType.NUMBER, defaultValue: 1}
                }},
                {opcode: 'mp3PlaybackControl', blockType: BlockType.COMMAND, text: 'Mp3 module RX connected to [RX] TX connected to [TX] playback control [CONTROL]', arguments: {
                    RX: {type: ArgumentType.NUMBER, menu: 'digitalInputPinsMenu', defaultValue: 16},
                    TX: {type: ArgumentType.NUMBER, menu: 'digitalOutputPinsMenu', defaultValue: 17},
                    CONTROL: {type: ArgumentType.STRING, menu: 'mp3ControlMenu', defaultValue: 'play'}
                }},
                {opcode: 'mp3PlaybackMode', blockType: BlockType.COMMAND, text: 'Mp3 module RX connected to [RX] TX connected to [TX] playback mode [MODE]', arguments: {
                    RX: {type: ArgumentType.NUMBER, menu: 'digitalInputPinsMenu', defaultValue: 16},
                    TX: {type: ArgumentType.NUMBER, menu: 'digitalOutputPinsMenu', defaultValue: 17},
                    MODE: {type: ArgumentType.STRING, menu: 'mp3ModeMenu', defaultValue: 'loop all'}
                }},
                {opcode: 'mp3Distance', blockType: BlockType.REPORTER, text: 'Mp3 module RX connected to [RX] TX connected to [TX] playback distance (CM) [TRACK]', arguments: {
                    RX: {type: ArgumentType.NUMBER, menu: 'digitalInputPinsMenu', defaultValue: 16},
                    TX: {type: ArgumentType.NUMBER, menu: 'digitalOutputPinsMenu', defaultValue: 17},
                    TRACK: {type: ArgumentType.NUMBER, defaultValue: 1}
                }},
                '---',
                'label:Display',

                {opcode: 'display4Digit', blockType: BlockType.COMMAND, text: '4-Digital LED module CLK [CLK] DIO [DIO] show number [NUM]', arguments: {
                    CLK: {type: ArgumentType.NUMBER, menu: 'digitalOutputPinsMenu', defaultValue: 18},
                    DIO: {type: ArgumentType.NUMBER, menu: 'digitalOutputPinsMenu', defaultValue: 19},
                    NUM: {type: ArgumentType.NUMBER, defaultValue: 100}
                }},
                'label:Sensing',
                {opcode: 'setColorSensorWhiteBalance', blockType: BlockType.COMMAND, text: 'set color sensor white balance'},
                {opcode: 'colorSensorRead', blockType: BlockType.REPORTER, text: 'color sensor [MODE]', arguments: {
                    MODE: {type: ArgumentType.STRING, menu: 'colorSensorModeMenu', defaultValue: 'light'}
                }},
                '---',
                'label:PIR',
                {opcode: 'pirMotionSensor', blockType: BlockType.BOOLEAN, text: 'pir motion sensor [PIN]', arguments: {
                    PIN: {type: ArgumentType.NUMBER, menu: 'digitalInputPinsMenu', defaultValue: 4}
                }},
                'label:Temperature',
                {opcode: 'lm35Temperature', blockType: BlockType.REPORTER, text: 'LM35 temperature sensor pin [PIN]', arguments: {
                    PIN: {type: ArgumentType.NUMBER, menu: 'analogInputPinsMenu', defaultValue: 34}
                }},
                'label:Ultrasonic',
                {opcode: 'ultrasonicDistance', blockType: BlockType.REPORTER, text: 'Ultrasonic distance (CM) trig pin [TRIG] echo pin [ECHO]', arguments: {
                    TRIG: {type: ArgumentType.NUMBER, menu: 'digitalOutputPinsMenu', defaultValue: 5},
                    ECHO: {type: ArgumentType.NUMBER, menu: 'digitalInputPinsMenu', defaultValue: 18}
                }},
                'label:IR',
                {opcode: 'infraredPressed', blockType: BlockType.BOOLEAN, text: 'Infrared receiving module [PIN] received [KEY] pressed?', arguments: {
                    PIN: {type: ArgumentType.NUMBER, menu: 'digitalInputPinsMenu', defaultValue: 15},
                    KEY: {type: ArgumentType.STRING, menu: 'irKeyMenu', defaultValue: 'Power'}
                }},
                '---',
                'label:Other',

                {opcode: 'digitalRead', blockType: BlockType.REPORTER, text: 'digitalRead [PIN]', arguments: {
                    PIN: {type: ArgumentType.NUMBER, menu: 'digitalInputPinsMenu', defaultValue: 4}
                }},
                {opcode: 'digitalWrite', blockType: BlockType.COMMAND, text: 'digitalWrite [PIN] [VALUE]', arguments: {
                    PIN: {type: ArgumentType.NUMBER, menu: 'digitalOutputPinsMenu', defaultValue: 2},
                    VALUE: {type: ArgumentType.STRING, menu: 'digitalValueMenu', defaultValue: 'HIGH'}
                }},
                {opcode: 'analogRead', blockType: BlockType.REPORTER, text: 'analogRead [PIN]', arguments: {
                    PIN: {type: ArgumentType.NUMBER, menu: 'analogInputPinsMenu', defaultValue: 34}
                }},
                {opcode: 'analogWrite', blockType: BlockType.COMMAND, text: 'analogWrite [PIN] [VALUE]', arguments: {
                    PIN: {type: ArgumentType.NUMBER, menu: 'pwmPinsMenu', defaultValue: 25},
                    VALUE: {type: ArgumentType.NUMBER, defaultValue: 0}
                }},
                {opcode: 'pullupDigitalRead', blockType: BlockType.REPORTER, text: 'PULLUP digitalRead [PIN]', arguments: {
                    PIN: {type: ArgumentType.NUMBER, menu: 'digitalInputPinsMenu', defaultValue: 4}
                }},
                {opcode: 'stringOfAscii', blockType: BlockType.REPORTER, text: 'String of ASCII [CODE]', arguments: {
                    CODE: {type: ArgumentType.NUMBER, defaultValue: 65}
                }},
                {opcode: 'asciiOfString', blockType: BlockType.REPORTER, text: 'ASCII of String [TEXT]', arguments: {
                    TEXT: {type: ArgumentType.STRING, defaultValue: 'A'}
                }}
            ],
            menus: {
                newlineMenu: {acceptReporters: true, items: [{text: 'on', value: 'on'}, {text: 'off', value: 'off'}]},
                varTypeMenu: {acceptReporters: true, items: [{text: 'Number', value: 'Number'}, {text: 'String', value: 'String'}]},
                motorMenu: {acceptReporters: true, items: [{text: 'M1', value: 'M1'}, {text: 'M2', value: 'M2'}]},
                digitalValueMenu: {acceptReporters: true, items: [{text: 'HIGH', value: 'HIGH'}, {text: 'LOW', value: 'LOW'}]},
                buzzerNoteMenu: {acceptReporters: true, items: [{text: 'C4', value: '262'}, {text: 'D4', value: '294'}, {text: 'E4', value: '330'}, {text: 'F4', value: '349'}, {text: 'G4', value: '392'}, {text: 'A4', value: '440'}, {text: 'B4', value: '494'}]},
                buzzerBeatMenu: {acceptReporters: true, items: [{text: 'Whole', value: '1000'}, {text: 'Half', value: '500'}, {text: 'Quarter', value: '250'}, {text: 'Eighth', value: '125'}]},
                mp3ControlMenu: {acceptReporters: true, items: [{text: 'play', value: 'play'}, {text: 'pause', value: 'pause'}, {text: 'stop', value: 'stop'}]},
                mp3ModeMenu: {acceptReporters: true, items: [{text: 'loop all', value: 'loop all'}, {text: 'single', value: 'single'}]},
                colorSensorModeMenu: {acceptReporters: true, items: [{text: 'light', value: 'light'}, {text: 'color', value: 'color'}]},
                irKeyMenu: {acceptReporters: true, items: [{text: 'Power', value: 'Power'}, {text: 'Up', value: 'Up'}, {text: 'Down', value: 'Down'}, {text: 'OK', value: 'OK'}]},
                digitalInputPinsMenu: {acceptReporters: true, items: 'getDigitalInputPins'},
                digitalOutputPinsMenu: {acceptReporters: true, items: 'getDigitalOutputPins'},
                pwmPinsMenu: {acceptReporters: true, items: 'getPwmPins'},
                servoPinsMenu: {acceptReporters: true, items: 'getServoPins'},
                analogInputPinsMenu: {acceptReporters: true, items: 'getAnalogInputPins'}
            }
        };
    }

    /**
     * Memanggil command board (USB Firmata atau BLE Live) dari Live Mode.
     * @param {string} name Nama command Tauri / BLE live.
     * @param {object} payload Argumen command.
     * @returns {Promise<*>}
     */
    _invoke (name, payload) {
        const targetOf = () => (typeof window !== 'undefined' ? window.__garudabotConnectedDevice : null);

        const reportError = err => {
            let error = err instanceof Error ? err : new Error(String(err));
            const raw = error.message || String(error);
            if (/FIRMATA:\s*Board is not connected/i.test(raw) || /board is not connected/i.test(raw)) {
                error = new Error(
                    'Sesi Live Mode putus.\n\nBoard → Turn Live Mode Off → Turn Live Mode On, tunggu selesai, lalu green flag.'
                );
            }
            console.error('[Live]', name, payload, error);
            if (typeof window !== 'undefined' && !window.__garudabotLiveErrorShown) {
                window.__garudabotLiveErrorShown = true;
                window.alert(
                    'Green flag jalan, tapi perintah ke board gagal:\n\n' + error.message
                );
            }
            return error;
        };

        const tryInvoke = () => {
            const bleLive = typeof window !== 'undefined' ? window.__garudabotBleLive : null;
            if (bleLive && typeof bleLive.isActive === 'function' && bleLive.isActive()) {
                return bleLive.invoke(name, payload);
            }
            // Fallback: sesi di window setelah HMR
            const session = typeof window !== 'undefined' ? window.__garudabotBleLiveSession : null;
            if (session && session.active && typeof session.invoke === 'function') {
                return session.invoke(name, payload);
            }
            // BLE bridge ada tapi sesi mati → tetap lewat invoke (auto-reconnect di dalamnya)
            if (bleLive && typeof bleLive.invoke === 'function') {
                const target = targetOf();
                if (target && String(target).startsWith('ble:')) {
                    return bleLive.invoke(name, payload);
                }
            }
            const transport = typeof window !== 'undefined' ? window.__garudabotLiveTransport : null;
            if (transport === 'usb') {
                const tauri = window.__TAURI__;
                if (!tauri) {
                    return Promise.reject(new Error('Live Mode USB belum siap.'));
                }
                return tauri.core.invoke(name, payload);
            }
            const target = targetOf();
            if (target && String(target).startsWith('ble:')) {
                return Promise.reject(new Error(
                    'Sesi BLE Live belum siap.\n\nTunggu dialog Live Mode selesai, atau Turn Live Mode On lagi.'
                ));
            }
            return Promise.reject(new Error(
                'Live Mode belum aktif.\n\nBoard → Turn Live Mode On, tunggu selesai, baru green flag.'
            ));
        };

        const ensure = typeof window !== 'undefined' ? window.__garudabotEnsureLiveMode : null;
        const bleLive = typeof window !== 'undefined' ? window.__garudabotBleLive : null;
        const session = typeof window !== 'undefined' ? window.__garudabotBleLiveSession : null;
        const alreadyLive = (bleLive && bleLive.isActive && bleLive.isActive()) ||
            (session && session.active) ||
            (typeof window !== 'undefined' && window.__garudabotLiveTransport === 'usb');

        if (alreadyLive) {
            return tryInvoke().catch(err => {
                // Sesi putus di tengah jalan → reconnect lalu coba lagi.
                if (typeof ensure === 'function') {
                    return ensure()
                        .then(() => tryInvoke())
                        .catch(err2 => Promise.reject(reportError(err2)));
                }
                return Promise.reject(reportError(err));
            });
        }
        if (typeof ensure === 'function') {
            return ensure()
                .then(() => tryInvoke())
                .catch(err => Promise.reject(reportError(err)));
        }
        // Fallback terakhir: jangan bilang "connect saja" kalau menu Live On.
        const liveOn = typeof window !== 'undefined' && window.__garudabotLiveModeOn;
        return Promise.reject(reportError(new Error(
            liveOn ?
                'Menu Live Mode On, tapi sesi putus.\n\nTurn Live Mode Off → On lagi, tunggu dialog hilang, lalu green flag.' :
                'Live Mode belum aktif.\n\nBoard → Turn Live Mode On, tunggu selesai, baru green flag.'
        )));
    }

    /** Hat block: titik mulai Generate Code. */
    generateCode () {}

    /** Cetak teks ke serial/console. */
    serialPrint (args) {
        const text = String(args.TEXT);
        if (String(args.NEWLINE) === 'on') {
            console.log(text);
        } else {
            console.log(text);
        }
    }

    printValue (args) {
        console.log(String(args.VALUE));
    }

    constantPi () {
        return Math.PI;
    }

    toStringValue (args) {
        return String(args.VALUE);
    }

    setVarType () {}

    // --- Motor ---

    /**
     * Kontrol DC motor M1/M2.
     * Port silk: M1 = GPIO19/21, M2 = GPIO16/17 (16/17 terbukti = terminal M2).
     */
    dcMotor (args) {
        const motor = String(args.MOTOR);
        const speed = Number(args.SPEED);
        const map = {
            M1: {in1: 19, in2: 21},
            M2: {in1: 16, in2: 17}
        };
        const pins = map[motor] || map.M1;
        const clamped = Math.max(-100, Math.min(100, Math.trunc(speed)));

        return this._invoke('pin_motor_dual', {
            pin1: pins.in1,
            pin2: pins.in2,
            speed: clamped
        });
    }

    dcMotor130 (args) {
        const dirPin = Number(args.DIRPIN);
        const pwmPin = Number(args.PWMPIN);
        const speed = Number(args.SPEED);
        const direction = speed >= 0 ? 1 : 0;
        const pwm = Math.max(0, Math.min(255, Math.abs(Math.trunc(speed))));
        return this._invoke('pin_digital_write', {pin: dirPin, value: direction})
            .then(() => this._invoke('pin_pwm_write', {pin: pwmPin, value: pwm}));
    }

    servoPinAngle (args) {
        return this._invoke('pin_servo_write', {pin: Number(args.PIN), value: Number(args.ANGLE)});
    }

    onboardRgbColor (args) {
        const pin = Number(args.PIN);
        const hex = String(args.COLOR || '#000000').replace('#', '');
        const red = parseInt(hex.substring(0, 2), 16);
        return this._invoke('pin_pwm_write', {pin: pin, value: red || 0});
    }

    onboardRgbValues (args) {
        const pin = Number(args.PIN);
        const red = Number(args.R);
        return this._invoke('pin_pwm_write', {pin: pin, value: Math.max(0, Math.min(255, red))});
    }

    buzzerNoteBeat (args) {
        return this._invoke('pin_tone', {
            pin: Number(args.PIN),
            frequency: Number(args.NOTE),
            duration: Number(args.BEAT)
        });
    }

    buzzerNoteSecond (args) {
        return this._invoke('pin_tone', {
            pin: Number(args.PIN),
            frequency: Number(args.NOTE),
            duration: Math.max(1, Math.trunc(Number(args.SECOND) * 1000))
        });
    }

    buzzerNotationSecond (args) {
        const notation = Math.max(1, Number(args.NOTATION) || 1);
        const frequency = 220 + (notation * 40);
        return this._invoke('pin_tone', {
            pin: Number(args.PIN),
            frequency: Math.trunc(frequency),
            duration: Math.max(1, Math.trunc(Number(args.SECOND) * 1000))
        });
    }

    // --- MP3 / Display (fallback sampai backend siap) ---
    mp3Info () {}
    mp3PlayTrack () {}
    mp3PlaybackControl () {}
    mp3PlaybackMode () {}
    mp3Distance () { return 0; }
    display4Digit () {}
    setColorSensorWhiteBalance () {}
    colorSensorRead () { return 0; }

    // --- Sensor ---

    /** Baca PIR motion sensor (HIGH = terdeteksi). */
    pirMotionSensor (args) {
        return this._invoke('pin_digital_read', {pin: Number(args.PIN)})
            .then(value => Number(value) > 0)
            .catch(() => false);
    }

    lm35Temperature (args) {
        return this._invoke('pin_analog_read', {pin: Number(args.PIN)})
            .then(value => Number(value))
            .catch(() => 0);
    }

    /** Baca jarak ultrasonic (cm). */
    ultrasonicDistance (args) {
        return this._invoke('pin_ultrasonic_read', {trig: Number(args.TRIG), echo: Number(args.ECHO)})
            .then(value => Number(value))
            .catch(() => 0);
    }

    infraredPressed (args) {
        return this._invoke('pin_digital_read', {pin: Number(args.PIN)})
            .then(value => Number(value) > 0)
            .catch(() => false);
    }

    digitalRead (args) {
        return this._invoke('pin_digital_read', {pin: Number(args.PIN)})
            .then(value => Number(value))
            .catch(() => 0);
    }

    digitalWrite (args) {
        const value = String(args.VALUE).toUpperCase() === 'HIGH' ? 1 : 0;
        return this._invoke('pin_digital_write', {pin: Number(args.PIN), value: value});
    }

    analogRead (args) {
        return this._invoke('pin_analog_read', {pin: Number(args.PIN)})
            .then(value => Number(value))
            .catch(() => 0);
    }

    analogWrite (args) {
        return this._invoke('pin_pwm_write', {pin: Number(args.PIN), value: Number(args.VALUE)});
    }

    pullupDigitalRead (args) {
        return this.digitalRead(args);
    }

    stringOfAscii (args) {
        return String.fromCharCode(Number(args.CODE) || 0);
    }

    asciiOfString (args) {
        const text = String(args.TEXT || '');
        return text.length ? text.charCodeAt(0) : 0;
    }

    // --- Menu pin dinamis berdasarkan board ESP32 ---

    /** Pin digital input yang tersedia di board. */
    getDigitalInputPins () {
        return getBoardPinsMenu(this.boardName, PinCapability.INPUT | PinCapability.DIGITAL);
    }

    /** Pin digital output yang tersedia di board. */
    getDigitalOutputPins () {
        return getBoardPinsMenu(this.boardName, PinCapability.OUTPUT | PinCapability.DIGITAL);
    }

    /** Pin PWM yang tersedia di board. */
    getPwmPins () {
        return getBoardPinsMenu(this.boardName, PinCapability.OUTPUT | PinCapability.PWM);
    }

    /** Pin servo yang tersedia di board. */
    getServoPins () {
        return getBoardPinsMenu(this.boardName, PinCapability.OUTPUT | PinCapability.SERVO);
    }

    /** Pin analog input yang tersedia di board. */
    getAnalogInputPins () {
        return getBoardPinsMenu(this.boardName, PinCapability.INPUT | PinCapability.ANALOG);
    }
}

module.exports = RaceroRobotsEsp32;

