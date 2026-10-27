const tokenize = text => String(text).toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) || [];
const normalizeText = text => String(text)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
const textOf = value => String(value == null ? '' : value).trim();

const bestEntry = (entries, scoreOf) => entries.reduce((best, entry) => (
    scoreOf(entry) > scoreOf(best) ? entry : best
));

const fromCounts = counts => {
    const entries = Array.from(counts.entries());
    const total = entries.reduce((sum, entry) => sum + entry[1], 0);
    const best = bestEntry(entries, entry => entry[1]);
    return {label: best[0], confidence: Math.round((best[1] / total) * 100)};
};

const scoreLabel = (model, sampleCount, label, knownTokens) => {
    const classModel = model.classModels.get(label);
    const prior = Math.log(classModel.sampleCount / sampleCount);
    return knownTokens.reduce((score, token) => {
        const frequency = classModel.tokenFrequencies.get(token) || 0;
        return score + Math.log((frequency + 1) / (classModel.tokenCount + model.vocabulary.size));
    }, prior);
};

const fromScores = (classifier, knownTokens) => {
    const scores = classifier.classes.map(label => ({
        label,
        score: scoreLabel(classifier.model, classifier.samples.length, label, knownTokens)
    }));
    const maxScore = Math.max(...scores.map(item => item.score));
    const weights = scores.map(item => Math.exp(item.score - maxScore));
    const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
    const best = bestEntry(scores, item => item.score);
    return {
        label: best.label,
        confidence: Math.round((weights[scores.indexOf(best)] / weightSum) * 100)
    };
};

class TextClassifier {
    constructor () {
        this.samples = [];
        this.isTrained = false;
        this.model = null;
    }

    get classes () {
        return this.samples.reduce((names, sample) => {
            if (!names.includes(sample.label)) names.push(sample.label);
            return names;
        }, []);
    }

    addSample (text, label) {
        const sampleText = textOf(text);
        const sampleLabel = textOf(label);
        if (!sampleText || !sampleLabel) return false;

        this.samples.push({text: sampleText, label: sampleLabel});
        this.isTrained = false;
        this.model = null;
        return true;
    }

    addSamples (samples) {
        samples.forEach(sample => this.addSample(sample.text, sample.label));
    }

    train () {
        if (!this.samples.length) {
            this.isTrained = false;
            this.model = null;
            return false;
        }

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
        this.isTrained = true;
        return true;
    }

    classify (text) {
        if (!this.isTrained || !this.model) return {label: '', confidence: 0};

        const exactLabels = this.model.exactMatches.get(normalizeText(text));
        if (exactLabels) return fromCounts(exactLabels);

        const knownTokens = tokenize(text).filter(token => this.model.vocabulary.has(token));
        if (!knownTokens.length) return {label: '', confidence: 0};
        return fromScores(this, knownTokens);
    }

    reset () {
        this.samples = [];
        this.isTrained = false;
        this.model = null;
    }
}

module.exports = TextClassifier;
