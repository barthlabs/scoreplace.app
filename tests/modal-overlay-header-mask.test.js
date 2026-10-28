const fs = require('fs');
const path = require('path');
const assert = require('assert');

const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'components.css'), 'utf8');
const ids = [
  'modal-quick-create', 'casual-match-overlay', 'modal-support-pix',
  'qr-modal-overlay', 'venues-detail-overlay'
];
const headerRule = css.match(/([^{}]+)\{\s*position:\s*relative\s*!important;\s*top:\s*auto\s*!important;[^{}]*\}/);
assert(headerRule, 'Overlay headers need a positioned containing block');
const maskRule = css.match(/(#modal-quick-create \.sticky-back-header::before[^{}]+)\{\s*top:\s*0;\s*bottom:\s*0;\s*\}/);
assert(maskRule, 'Overlay header masks must not overhang their headers');
for (const id of ids) {
  const selector = `#${id} .sticky-back-header`;
  assert(headerRule[1].includes(selector), `${selector} must be positioned`);
  assert(maskRule[1].includes(`${selector}::before`), `${selector} mask must be contained`);
}
console.log('✅ All five overlay header masks are anchored and contained');
