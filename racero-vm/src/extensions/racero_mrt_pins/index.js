const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');

const {
    boards,
    PinCapability,
    getBoardPinsMenu
} = require('racero-boards');

const formatMessage = require('format-message');

const iconURI = "data:image/png;base64,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";

class RaceroMRTMotors {
    constructor (runtime) {
        this.runtime = runtime;
    }
    getInfo() {
        return {
            id: 'mrtpins',
            name: 'MRT Pins',
            blockIconURI: iconURI,
            blocks: [
                {
                    opcode: 'setMotor',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'mrtpins.setMotor',
                        default: 'set [MOTOR] speed to [SPEED]',
                        description: 'set the speed of motor'
                    }),
                    arguments: {
                        MOTOR: {
                            type: ArgumentType.NUMBER,
                            menu: 'dcMotorKindMenu',
                        },
                        SPEED: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 0
                        }
                    }
                }
            ],
            menus: {
                dcMotorKindMenu: {
                    items: 'getMotorMenu'
                },
                rcButtonMenu: {
                    items: [
                        {
                            text: 'left',
                            value: '185081098'
                        },
                        {
                            text: 'right',
                            value: '730378'
                        },
                        {
                            text: 'up',
                            value: '336334858'
                        },
                        {
                            text: 'down',
                            value: '1057034'
                        },
                    ]
                },
            }
        };
    }
    setMotor (args) {
    }
    getIRButton (args) {
    }

    getMotorMenu() {
        return [
            {
                text: 'Motor 1',
                value: '0'
            },
            {
                text: 'Motor 2',
                value: '1'
            },
            {
                text: 'Motor 3',
                value: '2'
            },
            {
                text: 'Motor 4',
                value: '3'
            }
        ];

    }
}

module.exports = RaceroMRTMotors;
