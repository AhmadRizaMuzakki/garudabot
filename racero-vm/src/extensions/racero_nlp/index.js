const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const log = require('../../util/log');
const {createCsvTemplate, parseCsv} = require('./csv-utils');
const TextClassifier = require('./text-classifier');

class RaceroNlp {
    constructor (runtime) {
        this.runtime = runtime;
        this.classifier = new TextClassifier();
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
                    func: 'NLP_DOWNLOAD_CSV_TEMPLATE',
                    blockType: BlockType.BUTTON,
                    text: 'download CSV template'
                },
                {
                    func: 'NLP_IMPORT_CSV',
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

    downloadCsvTemplate () {
        if (typeof document === 'undefined' || typeof Blob === 'undefined' ||
            typeof URL === 'undefined' || !URL.createObjectURL) return;

        const blob = new Blob([createCsvTemplate()], {type: 'text/csv;charset=utf-8'});
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'nlp-template.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 0);
    }

    importCsv () {
        if (typeof document === 'undefined' || typeof FileReader === 'undefined') return;

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv';
        input.onchange = () => {
            const file = input.files && input.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = () => {
                try {
                    this.classifier.addSamples(parseCsv(reader.result));
                } catch (error) {
                    log.error(`Failed to import NLP CSV: ${error.message}`);
                }
            };
            reader.onerror = () => log.error('Failed to read NLP CSV file.');
            reader.readAsText(file);
        };
        input.click();
    }

    addSample (args) {
        this.classifier.addSample(args.TEXT, args.CLASS);
    }

    trainClassifier () {
        this.classifier.train();
    }

    resetClassifier () {
        this.classifier.reset();
    }

    getClassOf (args) {
        return this.classifier.predict(args.TEXT);
    }
}

module.exports = RaceroNlp;
