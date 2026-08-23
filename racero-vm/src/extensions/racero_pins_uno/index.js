/**
 * Extension Pins khusus board Arduino Uno.
 *
 * File ini mewarisi RaceroPins (kelas dasar) lalu mengunci:
 * - id kategori: pinsuno
 * - nama tampilan: Pins UNO
 * - board: Arduino Uno
 * - default pin yang umum dipakai di Uno (digital/PWM/analog)
 *
 * Dipisah dari Pins ESP32 supaya pengguna tidak bingung
 * antara nomenklatur pin Uno dan GPIO ESP32.
 */

const RaceroPins = require('../racero_pins');

class RaceroPinsUno extends RaceroPins {
    constructor (runtime) {
        super(runtime, {
            extensionId: 'pinsuno',
            extensionName: 'Pins UNO',
            forcedBoardName: 'Arduino Uno',
            defaultPins: {
                digital: 13,
                pwm: 3,
                analogWrite: 3,
                servo: 10,
                buzzer: 8,
                digitalRead: 2,
                analogRead: 14,
                trig: 7,
                echo: 6
            }
        });
    }
}

module.exports = RaceroPinsUno;
