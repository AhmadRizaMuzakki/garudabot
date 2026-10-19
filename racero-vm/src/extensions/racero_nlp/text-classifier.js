const tokenize = text => String(text).toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) || [];
const normalizeText = text => String(text)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

class TextClassifier {
    constructor () {
        this.samples = [];
        this.classes = [];
        this.isTrained = false;
        this.model = null;
    }

    addSample (text, label) {
        const normalizedText = String(text === null || typeof text === 'undefined' ? '' : text).trim();
        const normalizedLabel = String(label === null || typeof label === 'undefined' ? '' : label).trim();
        if (!normalizedText || !normalizedLabel) return false;

        this.samples.push({text: normalizedText, label: normalizedLabel});
        if (!this.classes.includes(normalizedLabel)) this.classes.push(normalizedLabel);
        this.isTrained = false;
        this.model = null;
        return true;
    }

    addSamples (samples) {
        samples.forEach(sample => this.addSample(sample.text, sample.label));
    }

    train () {
        const vocabulary = new Set();
        const classModels = new Map();
        const exactMatches = new Map();

        this.samples.forEach(sample => {
            const normalizedText = normalizeText(sample.text);
            let exactLabels = exactMatches.get(normalizedText);
            if (!exactLabels) {
                exactLabels = new Map();
                exactMatches.set(normalizedText, exactLabels);
            }
            exactLabels.set(sample.label, (exactLabels.get(sample.label) || 0) + 1);

            let classModel = classModels.get(sample.label);
            if (!classModel) {
                classModel = {sampleCount: 0, tokenCount: 0, tokenFrequencies: new Map()};
                classModels.set(sample.label, classModel);
            }
            classModel.sampleCount++;

            tokenize(sample.text).forEach(token => {
                vocabulary.add(token);
                classModel.tokenCount++;
                classModel.tokenFrequencies.set(token, (classModel.tokenFrequencies.get(token) || 0) + 1);
            });
        });

        this.model = {classModels, vocabulary, exactMatches};
        this.isTrained = this.samples.length > 0 && this.classes.length > 0;
        return this.isTrained;
    }

    predict (text) {
        if (!this.isTrained || !this.model) return '';

        const exactLabels = this.model.exactMatches.get(normalizeText(text));
        if (exactLabels) {
            let bestLabel = '';
            let bestCount = 0;
            exactLabels.forEach((count, label) => {
                if (count > bestCount) {
                    bestLabel = label;
                    bestCount = count;
                }
            });
            return bestLabel;
        }

        const tokens = tokenize(text);
        const knownTokens = tokens.filter(token => this.model.vocabulary.has(token));
        if (!knownTokens.length) return '';

        let bestClass = '';
        let bestScore = -Infinity;
        this.classes.forEach(label => {
            const classModel = this.model.classModels.get(label);
            let score = Math.log(classModel.sampleCount / this.samples.length);
            knownTokens.forEach(token => {
                const frequency = classModel.tokenFrequencies.get(token) || 0;
                score += Math.log((frequency + 1) /
                    (classModel.tokenCount + this.model.vocabulary.size));
            });
            if (score > bestScore) {
                bestClass = label;
                bestScore = score;
            }
        });
        return bestClass;
    }

    reset () {
        this.samples = [];
        this.classes = [];
        this.isTrained = false;
        this.model = null;
    }
}

module.exports = TextClassifier;
