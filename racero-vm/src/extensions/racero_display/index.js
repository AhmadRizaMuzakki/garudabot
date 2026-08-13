const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');

const {
    boards,
    PinCapability,
    getBoardPinsMenu
} = require('racero-boards');

const formatMessage = require('format-message');

const iconURI = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAAAXNSR0IArs4c6QAAAARzQklUCAgICHwIZIgAAAOJSURBVHic7d3PaxRnGMDx531ndtddiOKPWBSTFk3BiyC2CbQ9eejRglAKaXv2JNJ/QBD8BzznbBVFEPTooSerRNpTD0KNEBNikyi1G9gYZ955ei402fGd3bi7z/dz3fedeZf9ws7uDLwiAAAAAAAAAAAAAAAAAABgFLiyA588f/GNijvnRBr9XRKqUJEtJ3p/+vjkvTLjSwXwZGHpirrip6zo7NPKS0Q/ORGp+dY/Tv216RMTV8qM39Hvf74cz5P85Wb+OlEperZQ9I8TL830YEhDeuTMp0fWdxrrux0skzClGjb48IeHSiGqYSOTMNVtbFrlRL89mpe1V+0qh0BFhw/tlc++mImeHx3A3NxtmZw+Kwc+Pxp9clS3/teKzM3dlgsXvouaHxVACEH82Lh8cup01EnRO/vGD8vy0z8khCBJkrz3/K7XAP8nzzKp7WnGTEUf1PY0Jc+yqLlRAWB0EIBxBGAcARhHAMYRgHEEYBwBGEcAxhGAcQRgHAEYRwDGEYBxBGAcARhHAMYRgHEEYBwBGEcAxhGAcQRgHAEYRwDGEYBxBGAcARhHAMYRgHEEYBwBGEcAxhGAcQRgHAEYRwDGEYBxBGAcARhHAMYRgHEEYBwBGEcAxhGAcQRgHAEYRwDGEYBxBGBcVADOOVFlH8FBoVqIc6V3Af6PqADqjYa0Vxblzdpq1EnRO2/WVqW9sij1RtyWztH7Bl66OCs3b9yV139vxB4CPXBw/5hcujgbPb/SzqGz35+rMh0DoOtXgK+HVed8fXeWg15xztd9PXT9ji515TD/fPFOofnX74rOXhE2kB9sTuq+1fYufTBz/ONvu48uaf7Zi8vO66yIq1Ve4wdQSBhTLfd+nRP1kgzpxY1mWribM1OTV8uMjvvtMIQeLjy9noXOD2XG1pLWz1+dOPlj/1f14fFHkHEEYBwBGEcAxhGAcQRgHAEYRwDGVboZNCh+XVpqNvP8o61aLd9uTLHVaYnzpe5fO/Gtx8vLx7Z7vZFl6Waarn45MbEZu+ZBMRIB6Nu3R9uy+UyynR9SKfu3ZxY656XTOb/d6++clyRvTonIwvuuddCMRACFqooE0d26UaUqhehI3BXjGsA4AjCOAIwbiWsASZI80catQkO2G6fzLqmpS7b9xTFMRuZ5gF9U0/VdelxpXMSddW4kAgAAAAAAAAAAAAAAAAAAAAAAAMCQ+hd8g9K2VW3unQAAAABJRU5ErkJggg==";

class RaceroDisplay {
    constructor (runtime) {
        this.runtime = runtime;
    }
    getInfo() {
        return {
            id: 'display',
            name: 'Display',
            color1: '#546E7A',
            color2: '#455A64',
            color3: '#263238',
            blockIconURI: iconURI,
            blocks: [
                {
                    opcode: 'enableI2cDisplay',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'display.enableI2cDisplay',
                        default: 'initialize I2C [DISPLAY] display at address [ADDRESS]',
                        description: 'initialize I2C display at address'
                    }),
                    arguments: {
                        DISPLAY: {
                            type: ArgumentType.STRING,
                            menu: 'displayTypeMenu',
                        },
                        ADDRESS: {
                            type: ArgumentType.STRING,
                            defaultValue: '0x27'
                        }
                    }
                },
                {
                    opcode: 'setCursor',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'display.setCursor',
                        default: 'set cursor at column [COLUMN] row [ROW]',
                        description: 'set i2c cursor position'
                    }),
                    arguments: {
                        COLUMN: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 0
                        },
                        ROW: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 0
                        },
                    }
                },
                {
                    opcode: 'clearDisplay',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'display.clearDisplay',
                        default: 'clear display',
                        description: 'clear i2c display'
                    }),
                    arguments: {
                    }
                },
                {
                    opcode: 'writeDisplay',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'display.writeDisplay',
                        default: 'write [STRING] on display',
                        description: 'write text on i2c display'
                    }),
                    arguments: {
                        STRING: {
                            type: ArgumentType.STRING,
                            defaultValue: 'Hello'
                        },
                    }
                },
            ],
            menus: {
                displayTypeMenu: {
                    items: [
                        { text: '16x2', value: '0'},
                        { text: 'OLED', value: '1'}
                    ]
                },
            }
        };
    }

    enableI2cDisplay (args) {
        const address = parseInt(args.ADDRESS, 16);
        const type = Number(args.DISPLAY);

        const tauri = window.__TAURI__;
        if (!tauri) return;

        console.log(`enable i2c ${address}, ${type}`);
        return tauri.core.invoke('i2c_enable', {
            address: address,
            kind: type
        });
    }

    setCursor (args) {
        const col = Number(args.COLUMN);
        const row = Number(args.ROW);

        const tauri = window.__TAURI__;
        if (!tauri) return;

        return tauri.core.invoke('i2c_set_cursor', {
            col: col,
            row: row
        });
    }

    clearDisplay (args) {
        const tauri = window.__TAURI__;
        if (!tauri) return;

        return tauri.core.invoke('i2c_clear_display');
    }

    writeDisplay (args) {
        const string = String(args.STRING);

        const tauri = window.__TAURI__;
        if (!tauri) return;

        return tauri.core.invoke('i2c_write_string', {
            string: string
        });
    }
}

module.exports = RaceroDisplay;
