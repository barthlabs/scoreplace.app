// AVISO PERMANENTE "falta N equipe pra abrir novo confronto" — chave CHEIA.
//
// Dono, 26/jul/2026: _"esta avisando falta um jogo para abrir por toast quando precisa de mais uma
// equipe... isso é efêmero. vamos colocar um aviso permanente na tela"_ + _"logo abaixo do formar
// duplas um aviso do mesmo jeito: 1 equipe para novo confronto; 2 equipes para novo confronto"_.
//
// A regra NÃO é nova: com a R1 cheia (potência de 2 exata) o motor recusa com 'falta-par' e o tardio
// só entra AOS PARES (chaves-adapter crescerComPrefixo). O que muda é a TELA — o estado deixa de
// viver num toast que some. Este arquivo trava a DERIVAÇÃO do aviso:
//   1. chave cheia + ninguém pronto  → falta 2;
//   2. chave cheia + 1 dupla pronta  → falta 1, e é ELA que leva a etiqueta "aguardando";
//   3. chave cheia + 2 duplas prontas→ falta 2 (as duas entram; nada a esperar);
//   4. chave COM VAGA (bye na R1)    → SEM aviso (entra sozinho pelo recálculo normal);
//   5. "Novos Confrontos" DESLIGADO  → SEM aviso (não prometer o que o motor não fará).
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

// ── 1/2/3: chave CHEIA (8 duplas = potência de 2 exata) ──────────────────────────────────
const t8 = build(8);
const r1 = t8.matches.filter(m => m.round === 1 && (m.bracket === 'main' || m.bracket === 'upper'));
ok(r1.length === 4 && r1.every(m => !m.isBye), 'pré-requisito: N=8 gera R1 CHEIA (4 jogos reais) — got ' + r1.length);

let gap = W._lateGrowthPairGap(t8);
ok(gap && gap.falta === 2 && gap.ready === 0, '(1) chave cheia, ninguém pronto → falta 2 — got ' + JSON.stringify(gap && { r: gap.ready, f: gap.falta }));
ok(/^(?![\s\S]*novas)[\s\S]*2 equipes para novo confronto/.test(W._lateGrowthGapBanner(gap)), '(1) faixa diz "2 equipes para novo confronto"');

const d1 = espera(t8, 1);
gap = W._lateGrowthPairGap(t8);
ok(gap && gap.falta === 1 && gap.ready === 1, '(2) chave cheia + 1 dupla pronta → falta 1 — got ' + JSON.stringify(gap && { r: gap.ready, f: gap.falta }));
ok(/1 equipe para novo confronto/.test(W._lateGrowthGapBanner(gap)), '(2) faixa diz "1 equipe para novo confronto"');
ok(gap.isWaiting(d1), '(2) a etiqueta "aguardando" cai na dupla que está esperando par');
// waitingKeys é o que o sync IN-PLACE usa pra achar a etiqueta certa depois que a presença muda
// (a faixa não pode re-renderizar a lista — cânone dos cards estáticos). Casa por IDENTIDADE.
ok(gap.waitingKeys.length === 1 && gap.waitingKeys[0] === W._lateEntryKey(d1),
  '(2) waitingKeys casa a dupla por identidade (uid), não por posição — got ' + JSON.stringify(gap.waitingKeys));
ok(/data-late-wait-tag="[^"]+"/.test(W._lateGrowthWaitTag(gap, d1)) && !/display:none/.test(W._lateGrowthWaitTag(gap, d1)),
  '(2) a etiqueta da dupla que espera nasce VISÍVEL e chaveada');
ok(/display:none/.test(W._lateGrowthWaitTag(gap, { uid: 'zzz' })),
  '(2) a etiqueta de quem NÃO espera nasce oculta (o sync só alterna display)');
ok(/Aguardando mais 1 equipe/.test(W._lateGrowthWaitTag(gap)), '(2) etiqueta escrita em equipe (torneio de duplas)');

const d2 = espera(t8, 2);
gap = W._lateGrowthPairGap(t8);
ok(gap && gap.ready === 2 && gap.falta === 2, '(3) 2 duplas prontas → entram juntas; volta a faltar 2 — got ' + JSON.stringify(gap && { r: gap.ready, f: gap.falta }));
ok(!gap.isWaiting(d1) && !gap.isWaiting(d2), '(3) ninguém leva etiqueta de "aguardando" quando o par fecha');

// dupla na espera AUSENTE não conta como pronta (o motor só leva presente)
const t8b = build(8);
espera(t8b, 9, false);
ok(W._lateGrowthPairGap(t8b).ready === 0, 'dupla na espera AUSENTE não conta como pronta');

// ── 4: chave COM VAGA (bye na R1) → sem aviso ────────────────────────────────────────────
const t6 = build(6);
const r1_6 = t6.matches.filter(m => m.round === 1 && (m.bracket === 'main' || m.bracket === 'upper'));
ok(r1_6.some(m => m.isBye || !m.p1 || !m.p2 || /bye|a definir|TBD/i.test(String(m.p1) + String(m.p2))), 'pré-requisito: N=6 deixa vaga/bye na R1');
espera(t6, 1);
ok(W._lateGrowthPairGap(t6) === null, '(4) chave COM VAGA → SEM aviso (o tardio entra sozinho)');

// ── 5: "Novos Confrontos" desligado → sem aviso ──────────────────────────────────────────
const t8c = build(8);
espera(t8c, 1);
t8c.newMatchups = false; t8c.lateEnrollment = 'closed';
if (Array.isArray(t8c.phases) && t8c.phases[0]) { t8c.phases[0].newMatchups = false; t8c.phases[0].lateEnrollment = 'closed'; }
ok(W._lateGrowthPairGap(t8c) === null, '(5) Novos Confrontos DESLIGADO → SEM aviso');

// ── individual (teamSize 1): o texto fala em JOGADOR, não equipe ─────────────────────────
const tSolo = { id: 'S8', format: 'Eliminatórias Simples', teamSize: 1, matches: [], currentPhaseIndex: 0, newMatchups: true, lateEnrollment: 'expand', participants: [], standbyParticipants: [], waitlist: [], checkedIn: {}, absent: {} };
tSolo.matches = [
  { id: 'p0-VC-R1-P1', bracket: 'main', round: 1, phaseIndex: 0, p1: 'J1', p2: 'J2' },
  { id: 'p0-VC-R1-P2', bracket: 'main', round: 1, phaseIndex: 0, p1: 'J3', p2: 'J4' }
];
W.AppStore.tournaments = [tSolo];
const gSolo = W._lateGrowthPairGap(tSolo);
ok(gSolo && /2 jogadores para novo confronto/.test(W._lateGrowthGapBanner(gSolo)), 'individual: fala em JOGADORES, não equipes');

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
