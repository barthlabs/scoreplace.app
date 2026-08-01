/* Uma data só pode ser lida de um jeito — node tests/data-sem-ambiguidade.test.js
 *
 * MEDIDO em 31/jul/2026 no perfil real do dono: jogos de 10/03/26 (10 de março) e
 * 08/05/26 (8 de maio) apareciam como 3 de OUTUBRO e 5 de AGOSTO — no FUTURO — porque
 * `Date.parse` lê barra como mês/dia (americano). E a lista de jogos é ordenada por
 * data, então os errados subiam pro topo. O letzplay entrega ISO no JSON ("2026-03-10");
 * a ambiguidade era 100% nossa, de reler o texto do card.
 */
const path = require('path'), fs = require('fs'), vm = require('vm');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } }

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8');
const i = src.indexOf('window._SP_MES_PT'), j = src.indexOf('// v1.8.8-beta: canonical HH:MM formatter');
const ctx = { window: {}, console, Date };
vm.createContext(ctx);
vm.runInContext(src.slice(i, j), ctx);
const ts = ctx.window._spTsData;
const d = (t) => t ? new Date(t).toLocaleDateString('pt-BR') : '—';

console.log('\n── dd/mm é dia/mês, sempre ──');
ok(d(ts('Terça, 10/03/26')) === '10/03/2026', '10/03/26 é 10 de MARÇO (veio ' + d(ts('Terça, 10/03/26')) + ')');
ok(d(ts('Sexta, 08/05/26')) === '08/05/2026', '08/05/26 é 8 de MAIO (veio ' + d(ts('Sexta, 08/05/26')) + ')');
ok(d(ts('01/02/26')) === '01/02/2026', '01/02/26 é 1º de fevereiro — o caso que Date.parse mais erra');
ok(d(ts('Sábado, 20/06/26')) === '20/06/2026', '20/06/26 continua certo (dia > 12 acertava por acaso)');

console.log('\n── ISO manda, e é o que a fonte dá ──');
ok(d(ts('2026-03-10')) === '10/03/2026', 'ISO 2026-03-10 é 10 de março');
ok(d(ts('2026-03-10T15:00:00Z')) === '10/03/2026', 'ISO com hora não escorrega de dia por fuso');

console.log('\n── mês por extenso, em português ──');
ok(d(ts('12 de jul. de 2026')) === '12/07/2026', '"12 de jul. de 2026"');
ok(d(ts('5 dez 25')) === '05/12/2025', '"5 dez 25" (ano de 2 dígitos)');

console.log('\n── ninguém joga no futuro ──');
const amanha = new Date(Date.now() + 5 * 86400000);
const futuro = amanha.getFullYear() + '-' + String(amanha.getMonth() + 1).padStart(2, '0') + '-' + String(amanha.getDate()).padStart(2, '0');
ok(ts(futuro, { futuroProibido: true, fallback: -1 }) === -1, 'data à frente de hoje cai no fallback quando proibido');
ok(ts(futuro, { fallback: -1 }) !== -1, 'e é aceita quando o contexto permite (torneio agendado)');

console.log('\n── nunca mais duas cópias da regra ──');
for (const f of ['js/views/match-history.js', 'js/views/letzplay-profile.js']) {
  const s = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  ok(/window\._spTsData/.test(s), f + ' usa o parser canônico');
  const linhas = s.split('\n').filter(l => /Date\.parse\(|new Date\(\s*s\s*\)/.test(l) && !/^\s*\/\//.test(l) && !/importedAt|finishedAt|_spTsData/.test(l));
  ok(linhas.length === 0, f + ' não lê data de texto por conta própria' + (linhas.length ? ' (achei: ' + linhas[0].trim().slice(0, 60) + ')' : ''));
}

console.log('\n── a extensão carrega a data ISO da fonte ──');
const imp = fs.readFileSync(path.join(__dirname, '..', 'extension', 'lib', 'letzplay-import.js'), 'utf8');
ok(/dateISO: m\.dateISO \|\| null/.test(imp), 'cada jogo guarda dateISO');
const cnt = fs.readFileSync(path.join(__dirname, '..', 'extension', 'content.js'), 'utf8');
ok(/_datasISO\[String\(id\)\] = String\(d\)\.slice\(0, 10\)/.test(cnt), 'o índice alimenta o mapa lzId → aaaa-mm-dd');
ok(/if \(d\) g\.dateISO = d;/.test(cnt), 'e ela é carimbada nos jogos por lzId');

console.log((fail ? '✗' : '✓') + ' data-sem-ambiguidade: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
