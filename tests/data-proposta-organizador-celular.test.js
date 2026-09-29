/* A data escolhida pela organização precisa abrir os controles nativos do dispositivo.
 * O formato visível é localizado pelo SO; o valor de type=date é ISO, portanto a
 * persistência não pode interpretar texto dd/mm/aa. Data e hora usam a mesma classe
 * para o WebKit não trocar a fonte entre os dois. */
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
ok(/type="date" class="sp-schedule-native-input" id="sch-org-date"/.test(bloco), 'a data do organizador abre o calendário nativo');
ok(/type="time" class="sp-schedule-native-input" id="sch-org-time"/.test(bloco), 'a hora do organizador abre o relógio nativo');
ok(poll.includes("var ymd = /^\\d{4}-\\d{2}-\\d{2}$/.test(dataDigitada) ? dataDigitada : '';"), 'o valor ISO do controle nativo é salvo sem parsear texto localizado');
ok((poll.match(/class="sp-schedule-native-input"/g) || []).length >= 5, 'proposta, proposta semanal e organizador usam a mesma classe nativa');
ok(/\.sp-schedule-native-input[\s\S]*?font-family:\s*var\(--font-body\)\s*!important/.test(css), 'data e hora compartilham a fonte do app');
console.log((fail ? '❌' : '✅') + ' data-proposta-organizador-celular: ' + (fail ? fail + ' falharam' : '8 ok'));
process.exit(fail ? 1 : 0);
