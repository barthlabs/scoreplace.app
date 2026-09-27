/* A data escolhida pela organização não pode quebrar no campo nativo do iPhone.
 * O iOS não deixa controlar o formato de type=date; por isso a data é dd/mm/aa
 * explícita e a hora permanece hh:mm, nos dois tamanhos de tela. */
const fs = require('fs');
const path = require('path');
const poll = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'schedule-poll.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'components.css'), 'utf8');
let fail = 0;
function ok(v, label) { if (!v) { fail++; console.error('  ✗ ' + label); } }

const start = poll.indexOf('function _orgBloco');
const bloco = poll.slice(start, poll.indexOf('window._schOrgDefinir', start));
ok(start >= 0, 'formulário do organizador existe');
ok(/class="sp-org-schedule-datetime"/.test(bloco), 'formulário recebe o gancho responsivo próprio');
ok(/id="sch-org-date"/.test(bloco) && /id="sch-org-time"/.test(bloco), 'campos canônicos de data e hora continuam os mesmos');
ok(/type="text"[\s\S]*?inputmode="numeric"[\s\S]*?pattern="\[0-9\]\{2\}\/\[0-9\]\{2\}\/\[0-9\]\{2\}"/.test(bloco), 'a data usa formato digitável dd/mm/aa, não o texto longo imposto pelo iOS');
ok(/aria-label="Data \(dd\/mm\/aa\)"/.test(bloco) && /placeholder="dd\/mm\/aa"/.test(bloco), 'o formato curto é informado para leitura e digitação');
ok(poll.includes("var ymd = dataPartes ? ('20' + dataPartes[3] + '-' + dataPartes[2] + '-' + dataPartes[1]) : '';"), 'dd/mm/aa é convertido antes de salvar');
const mobile = css.match(/@media \(max-width: 600px\) \{[\s\S]*?\n\}/);
ok(!!mobile, 'existe regra específica para o formulário no celular');
ok(!!mobile && /\.sp-org-date-short\s*\{\s*min-width:\s*0/.test(mobile[0]), 'o campo curto não recebe piso que o faria truncar no celular');
console.log((fail ? '❌' : '✅') + ' data-proposta-organizador-celular: ' + (fail ? fail + ' falharam' : '8 ok'));
process.exit(fail ? 1 : 0);
