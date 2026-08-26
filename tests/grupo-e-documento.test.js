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

console.log(falhas === 0 ? '\n✅ grupo-e-documento: OK' : '\n❌ ' + falhas + ' falha(s)');
process.exit(falhas === 0 ? 0 : 1);
