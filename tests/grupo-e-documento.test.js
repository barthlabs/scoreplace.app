/* O GRUPO É UM DOCUMENTO  (2.0.124)
 * node tests/grupo-e-documento.test.js
 *
 * Arquitetura, na palavra do dono: _"cada torneio é um doc, cada jogo é um doc pendurado no
 * torneio e cada inscrito é outro doc pendurado"_. O grupo é da mesma família — é container
 * de jogo — e é o maior termo que ainda cresce com gente: MEDIDO no Confra, 35 grupos ocupam
 * 22,2 KB do documento, 153 B por inscrito (retrato congelado 5,9 KB, uids 4,2, ids de jogo
 * 3,6, nomes 2,3).
 *
 * ⛔ E O QUE ELE GUARDA NÃO SE DERIVA DOS JOGOS: `classifCongelada` é a ordem PUBLICADA, que
 * não se reescreve; `playersUids`, `woAbsent`/`woDest` e `rosterAt` também não estão em jogo
 * nenhum. Derivar seria inventar.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const S = require(path.join(ROOT, 'js/views/tournament-split-core.js'));
let falhas = 0;
const ok = (n, c, extra) => { if (c) console.log('  ✓ ' + n); else { console.log('  ✗ ' + n + (extra ? '\n      ' + extra : '')); falhas++; } };

console.log('──── o grupo é um documento ────');

const grupo = (nome, ps, us, cong) => {
  const g = { name: nome, players: ps, playersUids: us, matchIds: ['a', 'b', 'c'], rosterAt: 'x' };
  if (cong) g.classifCongelada = cong;
  return g;
};
const torneio = () => ({
  id: 't1',
  rounds: [{
    format: 'rei_rainha', status: 'active',
    matches: [{ id: 'm1', p1: 'A', p2: 'B' }],
    monarchGroups: [
      grupo('R1 Grupo A', ['A', 'B'], ['uA', 'uB'], [{ name: 'A', uid: 'uA' }, { name: 'B', uid: 'uB' }]),
      grupo('R1 Grupo B', ['C', 'D'], ['uC', 'uD'])
    ]
  }, {
    format: 'rei_rainha', matches: [],
    monarchGroups: [grupo('R2 Grupo A', ['A', 'C'], ['uA', 'uC'])]   // MESMO nome, outra rodada
  }]
});

// ── ① ida e volta ─────────────────────────────────────────────────────────────
const t0 = torneio();
const p = S.dividir(JSON.parse(JSON.stringify(t0)), ['grupos']);
ok('⭐ os 3 grupos saem do documento', p.grupos.length === 3);
ok('  → e o documento fica com a lista VAZIA, não ausente',
  Array.isArray(p.config.rounds[0].monarchGroups) && p.config.rounds[0].monarchGroups.length === 0,
  '"não tem grupo" e "não veio" precisam ser distinguíveis');
ok('  → mas os JOGOS ficam (só se pediu grupos)', (p.config.rounds[0].matches || []).length === 1);
const v = S.remontar(p);
ok('⭐ remontar(dividir(t)) === t', S.iguais(S.canonico(t0), S.canonico(v)));
ok('  → e o retrato congelado volta inteiro',
  JSON.stringify(v.rounds[0].monarchGroups[0].classifCongelada) === JSON.stringify(t0.rounds[0].monarchGroups[0].classifCongelada),
  'é a ordem PUBLICADA — o que não pode mudar depois');

// ── ② a chave é identidade, e a POSIÇÃO vem do _loc ──────────────────────────
const ks = p.grupos.map((x) => x._chave);
ok('⛔ nenhuma chave se repete', new Set(ks).size === ks.length);
ok('⛔ mesmo NOME em rodadas diferentes NÃO colide (a rodada entra na chave)',
  p.grupos.filter((x) => x.grupo.name === 'R1 Grupo A')[0]._chave !==
  p.grupos.filter((x) => x.grupo.name === 'R2 Grupo A')[0]._chave);
ok('⛔ e a chave NÃO é a posição — grupo que some do meio move o índice de todos',
  ks.every((k) => !/^gi/.test(k)),
  'chave por posição gravaria o retrato de A por cima do de B [[feedback_chave_de_espelho_nunca_e_posicao]]');
ok('⭐ o LUGAR viaja separado, em `_loc`',
  p.grupos.every((x) => x._loc && x._loc.tipo === 'grupos' && typeof x._loc.ri === 'number' && typeof x._loc.gi === 'number'));

// chegando FORA de ordem (o Firestore entrega por id, e id aqui é hash)
const baguncado = Object.assign({}, p, { grupos: p.grupos.slice().reverse() });
const v2 = S.remontar(JSON.parse(JSON.stringify(baguncado)));
ok('⛔ chegando fora de ordem, cada grupo volta pro SEU lugar',
  v2.rounds[0].monarchGroups.map((g) => g.name).join('|') === 'R1 Grupo A|R1 Grupo B' &&
  v2.rounds[1].monarchGroups[0].name === 'R2 Grupo A',
  'sem `_loc.gi`, o Grupo Q apareceria onde estava o Grupo A');

// grupo sem nome: cai nos UIDS, não na posição
const semNome = S.dividir({ rounds: [{ monarchGroups: [{ players: ['A'], playersUids: ['uA'] }] }] }, ['grupos']);
ok('⭐ grupo sem nome se identifica pelos UIDS de quem joga nele',
  semNome.grupos[0]._chave && !/^gi/.test(semNome.grupos[0]._chave));

// ── ③ pedir só o que o marcador diz ──────────────────────────────────────────
/* ⛔ ERA AQUI QUE EU IA REPETIR O ERRO: `dividir` extraía TUDO, e o Confra está dividido só
 * em matches/participants/opponentHistory. A próxima gravação teria mandado
 * `monarchGroups: []` pro documento e APAGADO os 35 grupos — sem erro e sem log. */
const soJogos = S.dividir(torneio(), ['matches']);
ok('⛔ pedindo só `matches`, os GRUPOS ficam no documento',
  (soJogos.config.rounds[0].monarchGroups || []).length === 2 && soJogos.grupos.length === 0,
  'é exatamente o estado do Confra hoje — extrair sem devolver apagaria os 35 grupos');
const semLista = S.dividir(torneio());
ok('⭐ sem lista (o espelho) segue querendo TUDO', semLista.grupos.length === 3);

// ── ④ os escritores pedem pela lista, e contam o que mandaram pra fora ───────
const cli = fs.readFileSync(path.join(ROOT, 'js/firebase-db.js'), 'utf8');
ok('⛔ o cliente passa o marcador pro `dividir`', /dividir\(JSON\.parse\(JSON\.stringify\(cleanData\)\), _fora\)/.test(cli));
ok('  → e grava `_nGrupos`', /_p\.config\._nGrupos = \(_p\.grupos \|\| \[\]\)\.length/.test(cli),
  'sem o número, "sem grupo" e "não carregou" pintam igual — e só um é honesto');
const cf = fs.readFileSync(path.join(ROOT, 'functions-autodraw/index.js'), 'utf8');
ok('⛔ o servidor idem', /dividir\(_clone\(b\.persist\), fora\)/.test(cf) &&
   /pDepois\.config\._nGrupos = \(pDepois\.grupos \|\| \[\]\)\.length/.test(cf));
ok('  → inclusive no lado ANTES do diff (senão tudo pareceria novo a cada gravação)',
  /dividir\(_clone\(tAntes\), fora\)/.test(cf));

// ── ⑤ A REDE: o documento chegando não pode apagar o que já está na tela ─────
/* ⛔ ESTE É O MODO DE FALHAR DA 2.0.109, em que eu quebrei produção com torneio AO VIVO. O
 * ouvinte do DOCUMENTO entrega o torneio com as partes divididas VAZIAS — é assim que elas
 * ficam lá. Aceitar isso por cima do objeto vivo apaga da tela o que já foi buscado.
 * E a rede citava `participants` e `matches` pelo NOME: ao pôr os GRUPOS pra fora eu
 * quebraria de novo, agora apagando a CHAVE inteira. Agora ela deriva de `_semPesados`. */
console.log('\n──── a rede do enxerto ────');
const vm = require('vm');
const _contaFix = require(path.join(__dirname, '_conta-de-partes-fixture.js'));
const store = fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8');
/* ⚠️ 2.1.89 — a rede saiu da closure de `startRealtimeListener` e virou a porta global
 * `window._preservaPartesMontadas`, chamada TAMBÉM pelo ouvinte de `sandboxes`. O recorte
 * à mão que morava aqui quebrou junto com os outros três na mudança de lugar — quatro
 * falhas para UMA mudança. Agora a âncora é do fixture, num lugar só. */
const iE = store.indexOf('window._preservaPartesMontadas = function (novo, velho) {');
const corpoE = 'var _enxertaJogos = ' + _contaFix.recortarPorta(store) + ';';
const ctx = { window: {} }; vm.createContext(ctx);
/* ⚠️ 2.1.66: a conta do que falta saiu de `_enxertaJogos` e virou
 * `window._marcaPartesQueFaltam` (os dois caminhos, ouvinte e cache, usam a MESMA).
 * Quem recorta uma tem que ter a outra no contexto — o fixture faz isso num lugar só. */
_contaFix.injetar(ctx, store);
vm.runInContext(corpoE + '\nthis.F = _enxertaJogos;', ctx);
const enxerta = ctx.F;

const vivo = () => ({
  id: 't1', _semPesados: ['matches', 'grupos', 'participants'], _nJogos: 1, _nGrupos: 2,
  participants: [{ uid: 'uA' }, { uid: 'uB' }],
  rounds: [{ matches: [{ id: 'm1' }], monarchGroups: [grupo('R1 Grupo A', ['A'], ['uA']), grupo('R1 Grupo B', ['B'], ['uB'])] }]
});
// o que o ouvinte do DOCUMENTO entrega num torneio dividido: tudo vazio
const doDoc = () => ({
  id: 't1', _semPesados: ['matches', 'grupos', 'participants'], _nJogos: 1, _nGrupos: 2,
  name: 'nome novo', participants: [],
  rounds: [{ matches: [], monarchGroups: [] }]
});

const r = enxerta(doDoc(), vivo());
ok('⛔ os GRUPOS não somem quando o documento chega vazio',
  (r.rounds[0].monarchGroups || []).length === 2,
  'sem este ramo a chave apagaria inteira na primeira entrega — o desastre da 2.0.109');
ok('  → os jogos também não', (r.rounds[0].matches || []).length === 1);
ok('  → nem o elenco', (r.participants || []).length === 2);
ok('⭐ e o que o documento REALMENTE traz manda (ele é o fresco)', r.name === 'nome novo');
ok('⭐ nada em falta ⇒ sem a marca de "faltando"', !r._faltamPesados);

// ⛔ Primeira entrega, SEM nada em memória: tem que acusar a falta, não fingir que está vazio.
const r2 = enxerta(doDoc(), null);
ok('⛔ sem objeto vivo, a falta é ACUSADA (não se pinta vazio como se fosse fato)',
  r2._faltamPesados === true,
  'chave sem grupo é tão quebrada quanto sem jogo — falta de qualquer parte é falta');

// ⭐ Torneio que legitimamente não tem grupo nem jogo: os contadores dizem ZERO.
const zerado = enxerta(Object.assign(doDoc(), { _nJogos: 0, _nGrupos: 0 }), null);
ok('⭐ contador ZERO ⇒ não tem MESMO, e não se acusa falta',
  !zerado._faltamPesados,
  '"não sorteou ainda" e "não carregou" pintam igual; só o número separa');

// ⭐ A rede cobre parte que eu ainda nem movi — é o ponto de derivar da lista.
const comPresenca = enxerta(
  { id: 't', _semPesados: ['checkedIn'], checkedIn: {}, rounds: [] },
  { id: 't', checkedIn: { uA: 123 } });
ok('⭐ e cobre `checkedIn` sem ninguém ter escrito um ramo pra ele',
  comPresenca.checkedIn && comPresenca.checkedIn.uA === 123,
  'derivar da lista é o que faz a parte seguinte já nascer coberta');

console.log(falhas === 0 ? '\n✅ grupo-e-documento: OK' : '\n❌ ' + falhas + ' falha(s)');
process.exit(falhas === 0 ? 0 : 1);
