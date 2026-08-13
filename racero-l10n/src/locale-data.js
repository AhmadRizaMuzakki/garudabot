// temporarily we have all the locale data in scratch-l10n

import en from './locale-data/en';
import id from './locale-data/id';
import jv from './locale-data/jv';

import {customLocales} from './supported-locales.js';

let localeData = [].concat(
    en,
    id,
    jv
);

for (const lang in customLocales) {
    localeData.push(customLocales[lang]);
}

export {
    localeData as default // data expected for initializing ReactIntl.addLocaleData
};
