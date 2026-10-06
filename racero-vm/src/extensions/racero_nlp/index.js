const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');

class RaceroNlp {
    constructor (runtime) {
        this.runtime = runtime;
    }

    getInfo () {
        return {
            id: 'nlp',
            name: 'NLP',
            color1: '#4C97FF',
            color2: '#4280D7',
            color3: '#3373CC',
            blocks: [
                {
                    func: 'downloadCsvTemplate',
                    blockType: BlockType.BUTTON,
                    text: 'download CSV template'
                },
                {
                    func: 'importCsv',
                    blockType: BlockType.BUTTON,
                    text: 'import CSV'
                },
                {
                    opcode: 'addSample',
                    blockType: BlockType.COMMAND,
                    text: 'add [TEXT] as [CLASS]',
                    arguments: {
                        TEXT: {
                            type: ArgumentType.STRING,
                            defaultValue: 'text'
                        },
                        CLASS: {
                            type: ArgumentType.STRING,
                            defaultValue: 'class'
                        }
                    }
                },
                {
                    opcode: 'trainClassifier',
                    blockType: BlockType.COMMAND,
                    text: 'train text classifier'
                },
                {
                    opcode: 'resetClassifier',
                    blockType: BlockType.COMMAND,
                    text: 'reset text classifier'
                },
                {
                    opcode: 'getClassOf',
                    blockType: BlockType.REPORTER,
                    text: 'get class of [TEXT]',
                    arguments: {
                        TEXT: {
                            type: ArgumentType.STRING,
                            defaultValue: 'text'
                        }
                    }
                }
            ]
        };
    }

    downloadCsvTemplate () {}

    importCsv () {}

    addSample () {}

    trainClassifier () {}

    resetClassifier () {}

    getClassOf () {
        return '';
    }
}

module.exports = RaceroNlp;
