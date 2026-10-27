const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const {createCsvTemplate, exampleClasses, parseCsv} = require('./csv-utils');
const {openCsvFile, saveCsvFile} = require('./csv-file');
const TextClassifier = require('./text-classifier');

const textArgument = (defaultValue, menu) => {
    const argument = {
        type: ArgumentType.STRING,
        defaultValue
    };
    if (menu) argument.menu = menu;
    return argument;
};

class RaceroNlp {
    constructor () {
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
                        TEXT: textArgument('hello'),
                        CLASS: textArgument('greeting')
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
                        TEXT: textArgument('hello')
                    }
                },
                {
                    opcode: 'isClass',
                    blockType: BlockType.BOOLEAN,
                    text: 'is [TEXT] class [CLASS]?',
                    arguments: {
                        TEXT: textArgument('hello'),
                        CLASS: textArgument('greeting', 'classMenu')
                    }
                },
                {
                    opcode: 'getConfidence',
                    blockType: BlockType.REPORTER,
                    text: 'confidence of [TEXT]',
                    arguments: {
                        TEXT: textArgument('hello')
                    }
                },
                {
                    opcode: 'isModelTrained',
                    blockType: BlockType.BOOLEAN,
                    text: 'model trained?'
                },
                {
                    opcode: 'getSampleCount',
                    blockType: BlockType.REPORTER,
                    text: 'number of samples'
                }
            ],
            menus: {
                classMenu: {
                    acceptReporters: true,
                    items: () => this.getClassMenu().map(item => [item, item])
                }
            }
        };
    }

    getClassMenu () {
        const classes = this.classifier.classes;
        return classes.length ? classes : exampleClasses();
    }

    downloadCsvTemplate () {
        return saveCsvFile('nlp-template.csv', createCsvTemplate());
    }

    importCsv () {
        return openCsvFile(csv => this.classifier.addSamples(parseCsv(csv)));
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
        return this.classifier.classify(args.TEXT).label;
    }

    isClass (args) {
        const label = this.classifier.classify(args.TEXT).label;
        const expected = String(args.CLASS == null ? '' : args.CLASS).trim();
        return label !== '' && label === expected;
    }

    getConfidence (args) {
        return this.classifier.classify(args.TEXT).confidence;
    }

    isModelTrained () {
        return this.classifier.isTrained;
    }

    getSampleCount () {
        return this.classifier.samples.length;
    }
}

module.exports = RaceroNlp;
