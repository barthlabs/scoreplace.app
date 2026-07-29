// AVISO PERMANENTE "falta N equipe pra abrir novo confronto" — chave CHEIA.
//
// Dono, 26/jul/2026: _"esta avisando falta um jogo para abrir por toast quando precisa de mais uma
// equipe... isso é efêmero. vamos colocar um aviso permanente na tela"_ + _"logo abaixo do formar
// duplas um aviso do mesmo jeito: 1 equipe para novo confronto; 2 equipes para novo confronto"_.
//
// ⚠️ O AVISO FOI DESATIVADO em jul/2026, e este arquivo passou a travar a AUSÊNCIA dele.
//
// A faixa existia porque, com a chave INFLADA até a potência de 2, uma R1 cheia não tinha vaga:
// o motor recusava o tardio solo com 'falta-par' e ele só entrava aos pares (crescerComPrefixo).
// A ÁRVORE MÍNIMA (o desenho novo SUBSTITUI o anterior — menos repescagens e poucos byes) acabou
// com a recusa: N+1 entrantes sempre cabem em teto((N+1)/2) jogos, e o tardio ocupa a vaga de
// sobra jogando a repescagem, sem mover nenhum confronto já publicado.
//
// Manter a faixa passaria a PROMETER O CONTRÁRIO do que o motor faz — o organizador leria
// "falta 1 equipe para novo confronto" com a inscrição já dentro da chave. Então
// `_lateGrowthPairGap` devolve null sempre. O que este arquivo tranca agora:
//   • em NENHUM cenário (chave cheia ou com vaga, 0/1/2 prontos) o aviso acende;
//   • os renderers toleram o null — faixa e etiqueta nascem como placeholder OCULTO, porque o
//     sync in-place depende de achá-los no DOM;
//   • a AMARRA COM O MOTOR, invertida: a tela cala porque o adapter ACEITA o tardio solo. Se um
//     dia o motor voltar a recusar, esta amarra quebra antes de a tela ficar muda por engano.
// A pill de etapa da porta do tardio não mudou e segue travada no fim do arquivo.
// Ver [[project_pow2_growth_frozen_prefix]] / [[project_new_matchups_independent]].
const { window: W, sandbox, load, E } = require('./headless');
sandbox.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: {} };
sandbox.AppStore = { tournaments: [], logAction: () => {}, sync: () => {} };
const _ss = {};
sandbox.sessionStorage = { getItem: k => (k in _ss ? _ss[k] : null), setItem: (k, v) => { _ss[k] = String(v); }, removeItem: k => { delete _ss[k]; } };
load('identity-core.js');        // _idMapHas/_idMapGet — presença por uid (cânone da identidade)
load('tournaments-draw.js');
load('bracket.js');

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

const CAT = 'Misto Obrig.';
function duplas(n, off) {
  const a = [];
  for (let i = 1; i <= n; i++) {
    const k = (off || 0) + i;
    const nm = 'A' + k + ' / B' + k;
    a.push({ p1Uid: 'a' + k, p1Name: 'A' + k, p2Uid: 'b' + k, p2Name: 'B' + k, displayName: nm, name: nm, categories: [CAT] });
  }
  return a;
}
// chave REAL pelo motor (nada de matches escritos à mão): N duplas, eliminatória simples
function build(n) {
  const cfg = { format: 'Eliminatórias Simples', formatCode: 'elim_simples', teamSize: 2, bracketResolution: 'bye', seedVip: true, source: { type: 'enrollment' }, categories: [CAT] };
  const pool = duplas(n);
  const t = {
    id: 'GAP' + n, format: 'Eliminatórias Simples', teamSize: 2, enrollmentMode: 'teams',
    matches: [], currentPhaseIndex: 0, lateEnrollment: 'expand', newMatchups: true,
    participants: pool.slice(), teamOrigins: {}, standbyParticipants: [], waitlist: [],
    checkedIn: {}, absent: {}, combinedCategories: [CAT]
  };
  pool.forEach(p => { t.checkedIn[p.p1Uid] = 1; t.checkedIn[p.p2Uid] = 1; });
  const built = E.generatePhase(pool, cfg, { idPrefix: 'gp', ordered: true, t, isVip: () => false, catOf: e => (e.categories && e.categories[0]) || '' });
  E.storePhase(t, 0, built);
  W.AppStore.tournaments = [t];
  return t;
}
// dupla na ESPERA, presente (é assim que o coletor a considera "pronta pra entrar")
function espera(t, idx, presente) {
  const p = duplas(1, 100 + idx)[0];
  p._lateJoin = true;
  t.standbyParticipants.push(p);
  if (presente !== false) { t.checkedIn[p.p1Uid] = 1; t.checkedIn[p.p2Uid] = 1; }
  return p;
}

// ── O AVISO NÃO EXISTE MAIS: ninguém fica esperando par ──────────────────────────────────
//
// A faixa foi criada porque o motor RECUSAVA o tardio solo numa chave cheia ('falta-par') e
// o organizador só descobria por um toast efêmero. Com a ÁRVORE MÍNIMA (dono, jul/2026 — o
// desenho novo substitui o anterior) essa recusa deixou de existir: N+1 entrantes sempre
// cabem em teto((N+1)/2) jogos, e o tardio ocupa a vaga de sobra jogando a repescagem.
//
// Manter a faixa passaria a MENTIR — "falta 1 equipe para novo confronto" enquanto a
// inscrição já entrou. Então `_lateGrowthPairGap` devolve null sempre, e é isso que este
// bloco tranca, em todos os cenários que antes acendiam o aviso.
const CENARIOS = [
  ['chave CHEIA (8, par) + ninguém pronto', 8, 0],
  ['chave CHEIA (8, par) + 1 dupla pronta', 8, 1],
  ['chave CHEIA (8, par) + 2 duplas prontas', 8, 2],
  ['chave com VAGA (7, ímpar) + 1 pronta', 7, 1],
  ['chave com VAGA (9, ímpar) + 2 prontas', 9, 2],
  ['chave CHEIA (6, par) + 1 pronta', 6, 1],
];
CENARIOS.forEach(([label, N, quantos]) => {
  const t = build(N);
  const r1 = t.matches.filter(m => m.round === 1 && (m.bracket === 'main' || m.bracket === 'upper'));
  ok(r1.length === Math.ceil(N / 2), label + ': pré-requisito — R1 com ' + Math.ceil(N / 2) + ' jogos (got ' + r1.length + ')');
  for (let i = 0; i < quantos; i++) espera(t, i + 1);
  ok(W._lateGrowthPairGap(t) === null, label + ' → SEM aviso (o tardio entra sozinho)');
});

// e os renderers toleram o null: a faixa nasce como placeholder OCULTO (o sync in-place
// procura por ele no DOM) e a etiqueta de "aguardando" idem — nada visível para o usuário.
const gapNulo = W._lateGrowthPairGap(build(8));
ok(gapNulo === null, 'contrato: _lateGrowthPairGap devolve null');
const faixa = W._lateGrowthGapBanner(gapNulo);
ok(/data-late-gap-banner="1"/.test(faixa) && /display:none/.test(faixa),
  'a faixa vira placeholder OCULTO (não some do DOM, o sync depende dela) — got ' + faixa.slice(0, 80));
ok(!/para novo confronto/.test(faixa), 'a faixa não escreve mais "N equipes para novo confronto"');
const tag = W._lateGrowthWaitTag(gapNulo, { uid: 'zzz' });
ok(/display:none/.test(tag), 'a etiqueta "aguardando" nasce oculta');

// ── AMARRA COM O MOTOR (invertida): a tela cala porque o motor ACEITA ────────────────────
// Sem isto o silêncio da tela vira opinião: um dia o motor volta a recusar solo e a tela
// continua muda. Aqui o MESMO estado é levado ao chaves-adapter — e ele tem que aceitar.
(function () {
  const A = W._chavesAdapter;
  const clone = (n) => JSON.parse(JSON.stringify(build(n).matches.filter(m => m.bracket === 'main' || m.bracket === 'upper')));
  [4, 8, 16].forEach((N) => {
    const base = clone(N);
    const roster = A.rosterDoBracket(base);
    const solo = duplas(1, 200 + N);
    const r = A.recalcularComTardio(base, roster.length + 1, 'simples',
      { participantes: roster.concat(solo), ns: 'p0' });
    ok(r.ok, 'motor: com a chave cheia de ' + N + ', 1 tardio SOZINHO entra (got ' + (r.ok ? 'ok' : r.motivo) + ')');
    if (!r.ok) return;
    const nm = solo[0].displayName;
    const seus = r.matches.filter(m => m.p1 === nm || m.p2 === nm);
    ok(seus.length === 1, 'motor: o tardio solo ganhou exatamente 1 jogo em N=' + N + ' (got ' + seus.length + ')');
    ok(seus.length === 1 && seus[0].isRepechageSlot, 'motor: e entrou pela REPESCAGEM (vaga de sobra) em N=' + N);
  });
})();

// ── PILL DE ETAPA: "R1 superior" enquanto a porta é essa; depois "suplentes" ─────────────
// Dono: _"seria legal constar R1 superior (enquanto for isso) depois R1 inferior e depois
// suplentes"_. "R1 inferior" NÃO é etapa do motor hoje — `_collectLateCandidates` devolve vazio
// assim que a 2ª superior tem resultado; a porta fecha, não muda de chave. A pill não pode
// prometer entrada que não existe. Ver [[project_late_entry_door_upper_then_lower]].
(function () {
  const tD = build(8);
  tD.format = 'Dupla Eliminatória';
  tD.matches.push({ id: 'p0-LB-R1-P1', bracket: 'lower', round: 1, phaseIndex: 0, p1: 'TBD', p2: 'TBD' });
  ok(W._lateDoorStage(tD).label === 'inscrições abertas · R1 superior',
    'pill: Dupla Elim com janela aberta → "inscrições abertas · R1 superior" — got ' + W._lateDoorStage(tD).label);

  const tS = build(8);   // eliminatória simples: não existe "superior", é só R1
  ok(W._lateDoorStage(tS).label === 'inscrições abertas · R1',
    'pill: Elim Simples → "inscrições abertas · R1" — got ' + W._lateDoorStage(tS).label);

  // 1º resultado na 2ª rodada superior → porta fecha → quem está na espera é SUPLENTE
  const tF = build(8);
  tF.matches.push({ id: 'p0-VC-R2-P1', bracket: 'main', round: 2, phaseIndex: 0, p1: 'A1 / B1', p2: 'A3 / B3', winner: 'A1 / B1', scoreP1: 6, scoreP2: 2 });
  ok(W._lateEnrollR2Started(tF), 'pré-requisito: resultado na 2ª rodada superior fecha a janela');
  ok(W._lateDoorStage(tF).label === 'suplentes', 'pill: janela fechada → "suplentes" — got ' + W._lateDoorStage(tF).label);
  ok(W._lateGrowthPairGap(tF) === null, 'janela fechada → sem faixa de "N equipes" (ninguém entra mais)');
})();

// ── AMARRA COM O MOTOR: o aviso tem que dizer a MESMA coisa que a recusa real ────────────
// Sem isto o texto vira opinião da tela: um dia o motor passa a aceitar 1 sozinho e a tela
// continua pedindo 2 (ou vice-versa). Aqui o MESMO estado é levado ao chaves-adapter.
(function () {
  const A = W._chavesAdapter;
  const clone = () => JSON.parse(JSON.stringify(build(8).matches.filter(m => m.bracket === 'main' || m.bracket === 'upper')));
  const um = A.crescerComPrefixo(clone(), duplas(1, 200), 'simples', { ns: 'p0' });
  ok(!um.ok && um.motivo === 'falta-par',
    'motor: 1 tardio sozinho na chave cheia É recusado com falta-par (é o que a tela avisa) — got ' + (um.ok ? 'entrou' : um.motivo));
  const dois = A.crescerComPrefixo(clone(), duplas(2, 300), 'simples', { ns: 'p0' });
  ok(dois.ok, 'motor: com 2 tardios o jogo novo ABRE (a tela pede exatamente 2) — got ' + (dois.ok ? 'ok' : dois.motivo));
})();

console.log((fail ? '❌' : '✅') + ' late-growth-gap-banner: ' + pass + ' ok, ' + fail + ' falhas');
fails.forEach(f => console.log('   ✗ ' + f));
process.exit(fail ? 1 : 0);
