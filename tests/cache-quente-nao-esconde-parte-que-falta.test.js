/* CACHE QUENTE NÃO PODE ESCONDER PARTE QUE FALTA  (2.0.128)
 * node tests/cache-quente-nao-esconde-parte-que-falta.test.js
 *
 * ⛔ RELATO DO DONO, com print, no PWA do Safari: o Confra mostrava "0 INSCRITOS" e "você
 * não está inscrito" — sendo ele o ORGANIZADOR. No desktop, tudo normal. E continuou igual
 * depois de duas versões que eu publiquei atrás da causa ERRADA (achei que era o service
 * worker prendendo o aparelho numa versão velha; era real, mas não era isto).
 *
 * ⛔ NÃO ERA O DADO: `tournaments_summary` com 148, documento coerente, `memberUids` com 148.
 * ⛔ NÃO ERA A VERSÃO: continuou na 2.0.127, recém-publicada.
 *
 * ⭐ A CAUSA: a conta de "o que falta buscar" só perguntava por `matches` (e depois
 * `grupos`). `participants` NUNCA entrava. No celular o cache local já tinha os JOGOS — o
 * enxerto os encontrava, a conta concluía "não falta nada", `_faltamPesados` era APAGADO e a
 * busca do elenco NUNCA disparava. Elenco vazio pra sempre. No desktop o cache estava frio,
 * a busca rodou uma vez e encheu. Cache quente satisfazendo METADE da pergunta.
 *
 * A lição é a mesma que este arquivo inteiro repete: a pergunta é `_semPesados`, não um
 * nome escrito à mão.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
let falhas = 0;
const ok = (n, c, extra) => { if (c) console.log('  ✓ ' + n); else { console.log('  ✗ ' + n + (extra ? '\n      ' + extra : '')); falhas++; } };

console.log('──── cache quente não esconde parte que falta ────');

const store = fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8');
const i = store.indexOf('    function _enxertaJogos(novo, velho) {');
const corpo = store.slice(i, store.indexOf('\n    }\n', i) + 6);
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(corpo + '\nthis.F = _enxertaJogos;', ctx);
const enxerta = ctx.F;

// ── O CASO REAL: o Confra como ele está ──────────────────────────────────────
const doDoc = () => ({
  id: 'confra', _semPesados: ['matches', 'participants', 'opponentHistory'],
  _nJogos: 115, memberUids: new Array(148).fill(0).map((_, k) => 'u' + k),
  participants: [], opponentHistory: [],
  rounds: [{ matches: [] }]
});
// o CACHE do celular: tinha os jogos, nunca teve o elenco
const cacheQuente = () => ({
  id: 'confra', participants: [], opponentHistory: [],
  rounds: [{ matches: [{ id: 'm1' }, { id: 'm2' }] }]
});

const r = enxerta(doDoc(), cacheQuente());
ok('⛔⛔ com os JOGOS no cache e o elenco vazio, a busca TEM que ser pedida',
  r._faltamPesados === true,
  'foi exatamente aqui que o app dizia "não falta nada" e o elenco ficava vazio pra sempre');
ok('  → e diz O QUE falta (pra não virar adivinhação no próximo defeito)',
  Array.isArray(r._faltaOQue) && r._faltaOQue.indexOf('participants') !== -1,
  'faltando: ' + JSON.stringify(r._faltaOQue));
ok('⭐ os jogos do cache continuam sendo aproveitados (não se rebusca o que já se tem)',
  (r.rounds[0].matches || []).length === 2);

// `memberUids` é a TESTEMUNHA que cura os documentos que já existem, sem contador nenhum
const semTestemunha = enxerta(Object.assign(doDoc(), { memberUids: [] }), cacheQuente());
ok('⚠️ sem contador E sem testemunha, NÃO acusa (senão vira busca em laço a cada snapshot)',
  !semTestemunha._faltamPesados);

// ── com o contador novo, não depende de testemunha nenhuma ───────────────────
const comContador = enxerta(
  Object.assign(doDoc(), { memberUids: [], _nPartes: { matches: 115, participants: 148, opponentHistory: 3 } }),
  cacheQuente());
ok('⭐ com `_nPartes`, a falta é sabida sem testemunha', comContador._faltamPesados === true);
ok('  → e cobre TODA parte da lista, não só o elenco',
  comContador._faltaOQue.indexOf('opponentHistory') !== -1);

const contadorZero = enxerta(
  Object.assign(doDoc(), { memberUids: [], _nPartes: { matches: 115, participants: 0, opponentHistory: 0 } }),
  cacheQuente());
ok('⛔ contador ZERO é "vazio DE VERDADE" — não se busca nada',
  !contadorZero._faltamPesados,
  'torneio recém-criado não pode ficar buscando um elenco que não existe');

// ── tudo em memória ⇒ nada a buscar ──────────────────────────────────────────
const completo = enxerta(doDoc(), {
  id: 'confra', participants: [{ uid: 'u1' }], opponentHistory: [{ uid: 'u1' }],
  rounds: [{ matches: [{ id: 'm1' }] }]
});
ok('⭐ com tudo em memória, nada é pedido', !completo._faltamPesados);

// ── a conta deriva da LISTA, não de nomes ────────────────────────────────────
const trecho = store.slice(i, store.indexOf('\n    }\n', i));
ok('⛔ a conta percorre `_semPesados` (nome escrito à mão foi o defeito)',
  /fora\.forEach\(function \(nome\) \{[\s\S]*?_temEmMemoria\(nome\)/.test(trecho),
  'com `if (fora.indexOf(\'matches\')...)` solto, a parte seguinte fica de fora de novo');
ok('⛔ e nenhum `if` isolado por nome decide a falta',
  !/if \(fora\.indexOf\('matches'\) !== -1\) \{\s*var _nJ/.test(trecho));

// ── os escritores gravam o contador de TODA parte ────────────────────────────
const cli = fs.readFileSync(path.join(ROOT, 'js/firebase-db.js'), 'utf8');
ok('⭐ o cliente grava `_nPartes` derivando do marcador', /_p\.config\._nPartes = _fora\.reduce/.test(cli));
const cf = fs.readFileSync(path.join(ROOT, 'functions-autodraw/index.js'), 'utf8');
ok('⭐ o servidor idem', /pDepois\.config\._nPartes = fora\.reduce/.test(cf));

console.log(falhas === 0 ? '\n✅ cache-quente-nao-esconde-parte-que-falta: OK' : '\n❌ ' + falhas + ' falha(s)');
process.exit(falhas === 0 ? 0 : 1);
