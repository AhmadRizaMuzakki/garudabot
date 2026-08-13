import BoardFeature from './BoardFeature';
import PinCapability from './PinCapability';

// Shared ESP32 GPIO map (Dev Module style boards)
// Excludes pins 6-11 (internal SPI flash)
const ESP32_PINS = [
    0, 1, 2, 3, 4, 5,
    12, 13, 14, 15, 16, 17, 18, 19,
    21, 22, 23, 25, 26, 27,
    32, 33, 34, 35, 36, 39
];

const INPUT_ONLY_PINS = [34, 35, 36, 39];
const ANALOG_PINS = [0, 2, 4, 12, 13, 14, 15, 25, 26, 27, 32, 33, 34, 35, 36, 39];

export function buildEsp32Pins () {
    return ESP32_PINS.map(gpio => {
        let capabilities = PinCapability.DIGITAL | PinCapability.INPUT;
        let analog = -1;

        if (!INPUT_ONLY_PINS.includes(gpio)) {
            capabilities |= PinCapability.OUTPUT | PinCapability.PULLUP |
                PinCapability.PWM | PinCapability.SERVO;
        }

        if (ANALOG_PINS.includes(gpio)) {
            capabilities |= PinCapability.ANALOG;
            analog = gpio;
        }

        return {
            index: gpio,
            analog: analog,
            label: `GPIO${gpio}`,
            capabilities: capabilities
        };
    });
}

export const ESP32_FEATURES =
    BoardFeature.I2C |
    BoardFeature.SERIAL |
    BoardFeature.SPI |
    BoardFeature.WIFI |
    BoardFeature.BLE |
    BoardFeature.DAC;
