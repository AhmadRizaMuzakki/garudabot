const test = require('tap').test;
const RaceroNlp = require('../../src/extensions/racero_nlp');
const TextClassifier = require('../../src/extensions/racero_nlp/text-classifier');
const Runtime = require('../../src/engine/runtime');
const {createCsvTemplate, parseCsv} = require('../../src/extensions/racero_nlp/csv-utils');

test('text classifier trains, predicts, and resets', t => {
    const classifier = new TextClassifier();
    classifier.addSample('kucing suka ikan', 'kucing');
    classifier.addSample('anjing suka tulang', 'anjing');

    t.equal(classifier.train(), true);
    t.same(classifier.classes, ['kucing', 'anjing']);
    t.equal(classifier.predict('ikan'), 'kucing');
    t.equal(classifier.predict('tulang'), 'anjing');

    classifier.addSample('ikan segar', 'kucing');
    t.equal(classifier.isTrained, false);
    t.equal(classifier.predict('ikan'), '');
    classifier.train();
    classifier.reset();
    t.same(classifier.samples, []);
    t.same(classifier.classes, []);
    t.equal(classifier.isTrained, false);
    t.equal(classifier.predict('ikan'), '');
    t.end();
});

test('CSV parser supports commas, escaped quotes, and newlines in fields', t => {
    const samples = parseCsv('text,class\r\n"suka, ""teh""",positif\r\n"baris satu\nbaris dua",negatif\r\n');
    t.same(samples, [
        {text: 'suka, "teh"', label: 'positif'},
        {text: 'baris satu\nbaris dua', label: 'negatif'}
    ]);
    t.equal(createCsvTemplate(), 'text,class\r\n');
    t.throws(() => parseCsv('wrong,header'), /header/);
    t.end();
});

test('NLP import button accepts CSV and merges parsed samples', t => {
    const originalDocument = global.document;
    const originalFileReader = global.FileReader;
    const extension = new RaceroNlp({});
    let input;

    global.document = {
        createElement: type => {
            input = {files: [{content: 'text,class\nhello,greeting'}], click: () => input.onchange()};
            t.equal(type, 'input');
            return input;
        }
    };
    global.FileReader = class {
        readAsText (file) {
            this.result = file.content;
            this.onload();
        }
    };

    extension.addSample({TEXT: 'bye', CLASS: 'farewell'});
    extension.importCsv();
    t.equal(input.accept, '.csv');
    t.same(extension.classifier.samples, [
        {text: 'bye', label: 'farewell'},
        {text: 'hello', label: 'greeting'}
    ]);

    if (originalDocument === undefined) delete global.document;
    else global.document = originalDocument;
    if (originalFileReader === undefined) delete global.FileReader;
    else global.FileReader = originalFileReader;
    t.end();
});

test('NLP buttons are registered as supported extension callbacks', t => {
    const runtime = new Runtime();
    runtime.on(Runtime.EXTENSION_ADDED, category => {
        t.equal(category.id, 'nlp');
        t.equal(category.blocks[0].xml,
            '<button text="download CSV template" callbackKey="NLP_DOWNLOAD_CSV_TEMPLATE"></button>');
        t.equal(category.blocks[1].xml,
            '<button text="import CSV" callbackKey="NLP_IMPORT_CSV"></button>');
    });

    runtime._registerExtensionPrimitives(new RaceroNlp(runtime).getInfo());
    t.end();
});

test('CSV buttons use Tauri dialogs and filesystem when running in the app', async t => {
    const originalWindow = Object.getOwnPropertyDescriptor(global, 'window');
    const extension = new RaceroNlp({});
    const calls = [];
    global.window = {
        __TAURI__: {
            core: {
                invoke: (command, args) => {
                    calls.push({command, args});
                    if (command === 'plugin:dialog|save') {
                        return Promise.resolve('C:/projects/nlp-template.csv');
                    }
                    if (command === 'plugin:dialog|open') {
                        return Promise.resolve('C:/projects/training.csv');
                    }
                    if (command === 'plugin:fs|read_text_file') {
                        return Promise.resolve('text,class\nhello,greeting');
                    }
                    return Promise.resolve();
                }
            }
        }
    };

    await extension.downloadCsvTemplate();
    await extension.importCsv();

    t.same(calls.map(call => call.command), [
        'plugin:dialog|save',
        'plugin:fs|write_text_file',
        'plugin:dialog|open',
        'plugin:fs|read_text_file'
    ]);
    t.same(calls[1].args, {
        path: 'C:/projects/nlp-template.csv',
        contents: 'text,class\r\n'
    });
    t.same(extension.classifier.samples, [{text: 'hello', label: 'greeting'}]);

    if (originalWindow) Object.defineProperty(global, 'window', originalWindow);
    else delete global.window;
    t.end();
});
