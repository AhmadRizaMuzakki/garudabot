const b = require('./racero-l10n/locales/blocks-msgs.js');
const e = require('./racero-l10n/locales/editor-msgs.js');

console.log('blocks locales', Object.keys(b).filter(k => ['su', 'min', 'mdn', 'id', 'en'].includes(k)));
console.log('editor locales', Object.keys(e).filter(k => ['su', 'min', 'mdn', 'id', 'en'].includes(k)));

['en', 'id', 'su', 'min', 'mdn'].forEach(l => {
  console.log(l, 'block keys', b[l] ? Object.keys(b[l]).length : 0);
});

const re = /["'<>&]/
['su', 'min', 'mdn', 'id'].forEach(l => {
  const bad = Object.entries(b[l]).filter(([, v]) => re.test(v));
  console.log(l, 'xml-risky', bad.length);
  bad.slice(0, 25).forEach(([k, v]) => console.log(' ', k, JSON.stringify(v)));
});

console.log('EVENT_WHENFLAGCLICKED', {
  en: b.en.EVENT_WHENFLAGCLICKED,
  id: b.id.EVENT_WHENFLAGCLICKED,
  su: b.su.EVENT_WHENFLAGCLICKED,
  min: b.min.EVENT_WHENFLAGCLICKED,
  mdn: b.mdn.EVENT_WHENFLAGCLICKED
});

// placeholder mismatches vs en
const placeholderRe = /%\d+/g;
const mismatches = [];
Object.keys(b.en).forEach(k => {
  const enPh = (b.en[k].match(placeholderRe) || []).sort().join(',');
  ['su', 'min', 'mdn'].forEach(l => {
    if (!b[l][k]) return;
    const ph = (b[l][k].match(placeholderRe) || []).sort().join(',');
    if (ph !== enPh) mismatches.push({locale: l, key: k, en: b.en[k], local: b[l][k]});
  });
});
console.log('placeholder mismatches', mismatches.length);
mismatches.forEach(m => console.log(m));
