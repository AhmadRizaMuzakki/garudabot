/**
 * Currently supported locales for the Scratch Project
 * @type {Object} Key Value pairs of locale code: Language name written in the language
 */

const locales = {
    'id': {name: 'Bahasa Indonesia'},
    'jv': {name: 'Basa Jawa'},
    'en': {name: 'English'},
};

const customLocales = {
    'jv': {
        locale: 'jv',
        parentLocale: 'id' 
    }
};

const localeMap = {
};

// list of RTL locales supported, and a function to check whether a locale is RTL
const rtlLocales = [
];

const isRtl = locale => {
    return rtlLocales.indexOf(locale) !== -1;
};

module.exports = {
    __esModule: true,
    default: locales,
    customLocales: customLocales,
    localeMap: localeMap,
    isRtl: isRtl
};
