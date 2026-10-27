const CSV_EXAMPLES = [
    ['hello', 'greeting'],
    ['good morning', 'greeting'],
    ['goodbye', 'farewell'],
    ['see you', 'farewell']
];

const exampleClasses = () => CSV_EXAMPLES.reduce((classes, row) => {
    if (!classes.includes(row[1])) classes.push(row[1]);
    return classes;
}, []);

const createCsvTemplate = () => ['text,class']
    .concat(CSV_EXAMPLES.map(row => row.join(',')))
    .join('\r\n')
    .concat('\r\n');

const parseCsv = csv => {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let index = 0; index < csv.length; index++) {
        const character = csv[index];
        if (inQuotes) {
            if (character === '"' && csv[index + 1] === '"') {
                field += '"';
                index++;
            } else if (character === '"') {
                inQuotes = false;
            } else {
                field += character;
            }
        } else if (character === '"' && field.length === 0) {
            inQuotes = true;
        } else if (character === ',') {
            row.push(field);
            field = '';
        } else if (character === '\n' || character === '\r') {
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
            if (character === '\r' && csv[index + 1] === '\n') index++;
        } else {
            field += character;
        }
    }

    if (inQuotes) throw new Error('CSV contains an unclosed quoted field.');
    if (field.length || row.length) {
        row.push(field);
        rows.push(row);
    }
    if (!rows.length) throw new Error('CSV must include a text,class header.');

    const header = rows.shift().map(value => value.trim().replace(/^\uFEFF/, '')
        .toLowerCase());
    if (header.length !== 2 || header[0] !== 'text' || header[1] !== 'class') {
        throw new Error('CSV header must be text,class.');
    }

    return rows
        .filter(values => values.some(value => value.trim()))
        .map(values => {
            if (values.length !== 2) throw new Error('Each CSV row must contain text and class.');
            return {text: values[0], label: values[1]};
        })
        .filter(sample => sample.text.trim() && sample.label.trim());
};

module.exports = {createCsvTemplate, exampleClasses, parseCsv};
