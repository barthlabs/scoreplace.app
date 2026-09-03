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
const _contaFix = require(path.join(__dirname, '_conta-de-partes-fixture.js'));
const ROOT = path.join(__dirname, '..');
let falhas = 0;
const ok = (n, c, extra) => { if (c) console.log('  ✓ ' + n); else { console.log('  ✗ ' + n + (extra ? '\n      ' + extra : '')); falhas++; } };

console.log('──── cache quente não esconde parte que falta ────');

const store = fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8');
/* ⚠️ 2.1.89 — a rede saiu da closure de `startRealtimeListener` e virou a porta global
 * `window._preservaPartesMontadas`, chamada TAMBÉM pelo ouvinte de `sandboxes`. O recorte
 * à mão que morava aqui quebrou junto com os outros três na mudança de lugar — quatro
 * falhas para UMA mudança. Agora a âncora é do fixture, num lugar só. */
const i = store.indexOf('window._preservaPartesMontadas = function (novo, velho) {');
const corpo = 'var _enxertaJogos = ' + _contaFix.recortarPorta(store) + ';';
const ctx = { window: {} }; vm.createContext(ctx);
/* ⚠️ 2.1.66: a conta do que falta saiu de dentro de `_enxertaJogos` e virou
 * `window._marcaPartesQueFaltam`, pra que o caminho do CACHE use a MESMA função. */
const _m0 = store.indexOf('window._marcaPartesQueFaltam = function (t) {');
const _m1 = store.indexOf('window._userProfileCache = window._userProfileCache || {};');
vm.runInContext(store.slice(_m0, _m1), ctx);
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
/* ⚠️ `_nJogos: 2` aqui é DE PROPÓSITO (2.1.65): a asserção é sobre o ELENCO sem contador e
 * sem testemunha. Com o `_nJogos: 115` do fixture original, quem acusava era `matches` (2 em
 * memória contra 115 prometidos) e a asserção media outra coisa. Igualando o contador ao que
 * o cache tem, sobra só a pergunta que ela quer fazer. */
const semTestemunha = enxerta(Object.assign(doDoc(), { memberUids: [], _nJogos: 2 }), cacheQuente());
ok('⚠️ sem contador E sem testemunha, NÃO acusa (senão vira busca em laço a cada snapshot)',
  !semTestemunha._faltamPesados);

// ── com o contador novo, não depende de testemunha nenhuma ───────────────────
const comContador = enxerta(
  Object.assign(doDoc(), { memberUids: [], _nPartes: { matches: 115, participants: 148, opponentHistory: 3 } }),
  cacheQuente());
ok('⭐ com `_nPartes`, a falta é sabida sem testemunha', comContador._faltamPesados === true);
ok('  → e cobre TODA parte da lista, não só o elenco',
  comContador._faltaOQue.indexOf('opponentHistory') !== -1);

/* ⚠️ `matches: 2` casa com o que o cache traz (2.1.65) — a asserção é sobre contador ZERO do
 * ELENCO. Com 115 no marcador e 2 em memória, quem acusava era `matches`, e o teste passava
 * a medir outra coisa. */
const contadorZero = enxerta(
  Object.assign(doDoc(), { memberUids: [], _nPartes: { matches: 2, participants: 0, opponentHistory: 0 } }),
  cacheQuente());
ok('⛔ contador ZERO é "vazio DE VERDADE" — não se busca nada',
  !contadorZero._faltamPesados,
  'torneio recém-criado não pode ficar buscando um elenco que não existe');

// ── tudo em memória ⇒ nada a buscar ──────────────────────────────────────────
/* ⚠️ "TUDO em memória" agora quer dizer TUDO MESMO (2.1.65): o fixture dava 1 jogo contra os
 * 115 do marcador e mesmo assim esperava "nada é pedido" — era o defeito escrito como teste.
 * Os contadores aqui descrevem exatamente o que a memória tem. */
const completo = enxerta(
  Object.assign(doDoc(), { _nJogos: 1, _nPartes: { matches: 1, participants: 1, opponentHistory: 1 } }),
  { id: 'confra', participants: [{ uid: 'u1' }], opponentHistory: [{ uid: 'u1' }],
    rounds: [{ matches: [{ id: 'm1' }] }] });
ok('⭐ com tudo em memória, nada é pedido', !completo._faltamPesados);

/* ⛔ e o inverso, que é o incidente de 31/ago: 1 jogo de 115 NÃO é "tudo em memória". */
const parcial = enxerta(doDoc(), {
  id: 'confra', participants: [{ uid: 'u1' }], opponentHistory: [{ uid: 'u1' }],
  rounds: [{ matches: [{ id: 'm1' }] }]
});
ok('⛔ 1 jogo de 115 em memória NÃO passa por completo', parcial._faltamPesados === true);

// ── a conta deriva da LISTA, não de nomes ────────────────────────────────────
/* ⚠️ 2.1.66: o LAÇO da conta mudou de casa — saiu de `_enxertaJogos` e foi para
 * `window._marcaPartesQueFaltam`, que os DOIS caminhos (ouvinte e cache) chamam. A
 * asserção continua a mesma: a conta percorre a LISTA, não nomes escritos à mão. */
const trecho = store.slice(_m0, _m1);
ok('⛔ a conta percorre `_semPesados` (nome escrito à mão foi o defeito)',
  /_semPesados\.forEach\(function \(nome\) \{[\s\S]*?_quantoTenho\(nome\)/.test(trecho),
  'com `if (fora.indexOf(\'matches\')...)` solto, a parte seguinte fica de fora de novo');
ok('⭐ e a conta é UMA só — o caminho do cache chama a mesma função',
  /_loadFromCache\(\)[\s\S]*?window\._marcaPartesQueFaltam\(t\)[\s\S]*?_montaPesadosQueFaltam\(/.test(store),
  'era só o ouvinte que contava; o cache pintava parte incompleta e ninguém pedia o resto');
ok('⛔ e nenhum `if` isolado por nome decide a falta',
  !/if \(fora\.indexOf\('matches'\) !== -1\) \{\s*var _nJ/.test(trecho));

// ── os escritores gravam o contador de TODA parte ────────────────────────────
const cli = fs.readFileSync(path.join(ROOT, 'js/firebase-db.js'), 'utf8');
ok('⭐ o cliente grava `_nPartes` derivando do marcador', /_p\.config\._nPartes = _fora\.reduce/.test(cli));
/* ⚠️ 2.2 — O GRAVADOR MUDOU DE ENDEREÇO, NÃO DE COMPORTAMENTO. O que era um bloco dentro
 * de `_gravaTorneio` virou um planejador puro em `functions-autodraw/write-plan.js`
 * (`planWrites`) mais um executor (`applyPlan`), por ordem do revisor: a checagem de teto e
 * a escrita real precisam consumir o MESMO plano, senão o teto mede uma coisa e o banco
 * recebe outra. Estas asserções continuam valendo palavra por palavra — só que o CAMINHO DE
 * ESCRITA da CF agora são dois arquivos. Varrer só o index.js daria vermelho por endereço
 * errado, que é o pior tipo de falso negativo: some a cobertura e parece regressão. */
const _cfIdx = fs.readFileSync(path.join(ROOT, 'functions-autodraw', 'index.js'), 'utf8');
const _cfPlan = fs.readFileSync(path.join(ROOT, 'functions-autodraw', 'write-plan.js'), 'utf8');
const cf = _cfIdx + '\n/* ── write-plan.js (mesmo caminho de escrita) ── */\n' + _cfPlan;
ok('⭐ o servidor idem', /pDepois\.config\._nPartes = fora\.reduce/.test(cf));

// ── ABRIR O TORNEIO NÃO PODE ACEITAR OBJETO INCOMPLETO ───────────────────────
/* ⛔ `_ensureTournamentLoaded` já tratava DUAS formas de estar incompleto — resumo e cache —
 * e ignorava a terceira: o objeto que veio do ouvinte do DOCUMENTO, que num torneio dividido
 * chega com elenco e jogos VAZIOS. Não é resumo nem é do cache, então passava direto como
 * "já carregado" e a tela do DETALHE renderizava em cima dele. Foi assim que o dono,
 * ORGANIZADOR do Confra, leu "você não está inscrito" no celular.
 * `loadTournamentById` já busca as subcoleções — bastava deixar de atalhar até ele. */
console.log('\n──── abrir o torneio exige o torneio inteiro ────');
const src = fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8');
const iL = src.indexOf('window._ensureTournamentLoaded = function');
const corpoL = src.slice(iL, src.indexOf('\n};', iL));
ok('⛔ resumo não serve pra abrir', /local\._resumo === true\) local = null/.test(corpoL));
ok('⛔ cache não serve pra abrir', /local\._doCache === true\) local = null/.test(corpoL));
ok('⛔⛔ e objeto com PARTE FALTANDO também não',
  /local\._faltamPesados === true\) local = null/.test(corpoL),
  'sem isto o detalhe abre em cima de `participants: []` e diz "você não está inscrito"');
const iChk = corpoL.indexOf('_faltamPesados === true');
const iUso = corpoL.indexOf('if (local) { cb(local); return; }');
ok('  → e a checagem vem ANTES de entregar o objeto', iChk > 0 && iUso > iChk);
ok('⭐ e o caminho completo busca as subcoleções',
  /_montaDeSubcolecoes\(id, _t, _fora\)/.test(fs.readFileSync(path.join(ROOT, 'js/firebase-db.js'), 'utf8')));

// ── o leitor de diagnóstico: medir no aparelho em vez de deduzir de longe ────
ok('⭐ existe `?diag=1` pra LER o estado no aparelho (no PWA do iOS não há console)',
  /_diagPartes/.test(src) && /diag=1/.test(src),
  'três versões atrás da causa errada foi o preço de deduzir de longe');
ok('  → e ele NÃO roda sem a URL pedir (instrumentação não cobra pedágio)',
  /if \(typeof window !== 'undefined' && \/\[\?&\]diag=1\//.test(src));
ok('  → e a falha de busca fica guardada pra ele mostrar',
  /_falhasDePartes/.test(src));

console.log(falhas === 0 ? '\n✅ cache-quente-nao-esconde-parte-que-falta: OK' : '\n❌ ' + falhas + ' falha(s)');
process.exit(falhas === 0 ? 0 : 1);
