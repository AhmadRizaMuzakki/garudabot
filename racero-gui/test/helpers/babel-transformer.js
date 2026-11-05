const fs = require('fs');
const path = require('path');
const babel = require('babel-core');

const babelConfig = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, '../../.babelrc'),
    'utf8'
));

module.exports = {
    process (source, filename) {
        return babel.transform(source, Object.assign({}, babelConfig, {filename})).code;
    }
};
