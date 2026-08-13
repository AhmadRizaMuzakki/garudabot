import BoardFeature from './boards/BoardFeature';
import PinCapability from './boards/PinCapability';

import ArduinoUNO from './boards/ArduinoUNO';
import ESP32Wroom from './boards/ESP32Wroom';
import HunaRobo2 from './boards/HunaRobo2';
import MRT3 from './boards/MRT3';
import MRTX from './boards/MRTX';
import SmartCoding from './boards/SmartCoding';

export const boards = {
    [ArduinoUNO.name]: ArduinoUNO,
    [ESP32Wroom.name]: ESP32Wroom,
    [HunaRobo2.name]: HunaRobo2,
    [MRT3.name]: MRT3,
    [MRTX.name]: MRTX,
    [SmartCoding.name]: SmartCoding,
};

export function getBoardPinsMenu(name, capabilities) {
    const board = boards[name];
    if (!board || !board.pins) return;

    let pins = [];
    for (let i = 0; i < board.pins.length; i++) {
        const pin = board.pins[i];
        if ((pin.capabilities & capabilities) === capabilities) {
            if ((capabilities & PinCapability.ANALOG) !== 0 && pin.analog !== -1) {
                pins.push({ text: pin.label, value: `${pin.index}` });
            } else {
                pins.push({ text: pin.label, value: `${pin.index}` });
            }
        }
    }

    if (pins.length === 0) {
        return [{ text: 'NONE!', value: '-1' }];
    }

    return pins;
}

export {
    BoardFeature,
    PinCapability
};
