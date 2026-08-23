/**
 * Extension Pins khusus board ESP32 Dev Module.
 *
 * File ini mewarisi RaceroPins (kelas dasar) lalu mengunci:
 * - id kategori: pinsesp32
 * - nama tampilan: Pins ESP32
 * - board: ESP32 Dev Module
 * - default pin GPIO yang umum dipakai di ESP32
 *
 * Dipisah dari Pins UNO supaya pin A0/A4/A5 Arduino
 * tidak bercampur dengan pin GPIO ESP32.
 */

const RaceroPins = require('../racero_pins');

class RaceroPinsEsp32 extends RaceroPins {
    constructor (runtime) {
        super(runtime, {
            extensionId: 'pinsesp32',
            extensionName: 'Pins ESP32',
            forcedBoardName: 'ESP32 Dev Module',
            defaultPins: {
                digital: 2,
                pwm: 25,
                analogWrite: 26,
                servo: 13,
                buzzer: 27,
                digitalRead: 18,
                analogRead: 34,
                trig: 5,
                echo: 18
            }
        });
    }
}

module.exports = RaceroPinsEsp32;
