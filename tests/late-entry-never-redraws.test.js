// REPRODUZ o desastre relatado pelo dono (jul/2026, print do SB "Torneio de Férias só Casais"):
// "coloquei a presença do marcelo/karla e ativei a entrada (que estava desligada) e cagou tudo.
//  era para eles entrarem no jogo 7 sem mudar nenhum dos demais 6 jogos. mudou tudo, dupla virou
//  individual; criou jogo 8!"
//
// CAUSA: o fallback de REDRAW em integrateLateEntries fazia _clearTournamentDraw + drawInitial —
// APAGA a chave inteira e re-sorteia. O guard era só "não há resultado lançado", o que protege os
// PLACARES mas NÃO os CONFRONTOS: a chave já estava publicada, todo mundo já tinha visto seu jogo.
// (No print: changed:true com extra:0/duplas:0/monarch:0 → só o redraw podia ter mudado.)
//
// REGRA TRAVADA: entrada tardia é SEMPRE ADITIVA. Com chave já sorteada, os jogos EXISTENTES da 1ª
// rodada são INTOCÁVEIS — o tardio entra num jogo NOVO (vs "a definir"). NUNCA re-sortear.
const H = require('./render-harness');
const W = H.sandbox;
const dc = require('../functions-autodraw/draw-core.js');
// ⏱️ Presença tem CARIMBO DE HORA e caduca em 24h ([[project_presenca_caduca_em_24h]]).
// Produção grava sempre Date.now() (medido: 317/317 valores); o `1` daqui era atalho —
// e atalho que não existe no dado real vira teste que passa sobre código quebrado.
const _AGORA = Date.now();

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }
const isEmpty = v => !v || v === 'TBD' || /a definir/i.test(String(v));

function mkPairs(n) { const a = []; for (let i = 1; i <= n; i++) a.push({ p1Uid: 'a' + i, p1Name: 'A' + i, p2Uid: 'b' + i, p2Name: 'B' + i, displayName: 'A' + i + ' / B' + i, name: 'A' + i + ' / B' + i, ligaActive: true }); return a; }
function mkT(N) {
  const t = {
    id: 'NOREDRAW', sport: 'Beach Tennis',
    fmt2: { disputa: 'dupla', grupos: 1, parceria: 'fixa', classifAtiva: false, eliminatoria: { ativa: true, linhas: 1, formacao: 'sorteio', terceiro: false } },
    participants: mkPairs(N), teamSize: 2, enrollmentMode: 'teams', combinedCategories: [],
    currentPhaseIndex: 0, checkedIn: {}, absent: {}, standbyParticipants: [], waitlist: [],
    teamOrigins: {}, matches: [], lateEnrollment: 'expand', newMatchups: true,
  };
  mkPairs(N).forEach(p => { t.checkedIn[p.p1Uid] = _AGORA; t.checkedIn[p.p2Uid] = _AGORA; });
  dc.compileFromFmt2(t);
  return t;
}
const all = t => W._collectAllMatches(t) || [];
// "jogos da 1ª rodada" = a rodada de menor índice (os 6 do print)
function firstRoundSnapshot(t) {
  const ms = all(t).filter(m => m && m.p1 && m.p2);
  const minR = Math.min.apply(null, ms.map(m => (typeof m.round === 'number' ? m.round : 1)));
  return all(t).filter(m => m && (typeof m.round === 'number' ? m.round : 1) === minR && !isEmpty(m.p1) && !isEmpty(m.p2))
    .map(m => m.id + '|' + m.p1 + '|' + m.p2).sort();
}

console.log('── entrada tardia NÃO pode re-sortear a chave já publicada ──');
(function () {
  const t = mkT(8);   // 8 duplas → 4 jogos na 1ª rodada, potência de 2 (SEM bye ⇒ nenhum jogo
                      // decidido ⇒ o guard "não há resultado" não segura o redraw: o cenário do dono)
  W.AppStore.tournaments = [t];
  const rd = dc.drawInitial(t, {});
  ok(rd && rd.ok, 'sorteio inicial ok');
  const before = firstRoundSnapshot(t);
  ok(before.length === 4, 'pré: 4 jogos reais na 1ª rodada (got ' + before.length + ')');

  // CHAVE CHEIA (8 duplas: 4 jogos, zero folga).
  //
  // A regra de 25/jul/2026 era _"avisa na 9a que precisa da 10a… só cria jogo entre 9 e 10"_:
  // com a chave inflada até a potência de 2 não havia vaga, e encaixar UM só exigiria
  // redesenhar a semeadura — o desastre que este arquivo impede.
  //
  // Com a ÁRVORE MÍNIMA (jul/2026, o desenho novo substitui o anterior) essa restrição CAIU:
  // 9 entrantes dão 5 jogos (4 normais + 1 para a sobra), e a sobra é a posição que o 9º
  // ocupa. Ele entra SOZINHO, por REPESCAGEM, e os 4 confrontos publicados continuam
  // intocados. Quando a 10ª chega, ela apenas COMPLETA aquele mesmo jogo, que deixa de ser
  // repescagem e vira confronto normal — de novo sem mexer em nada.
  //
  // O invariante deste arquivo é o mesmo de sempre e continua travado abaixo: entrada tardia
  // é SEMPRE ADITIVA, jogo publicado é INTOCÁVEL, nunca re-sortear. O que mudou é que agora
  // ninguém precisa ficar esperando um par para poder jogar.
  const nm = 'Marcello / Karla';
  const chega = (nome, u1, n1, u2, n2) => {
    t.participants.push({ p1Uid: u1, p1Name: n1, p2Uid: u2, p2Name: n2, displayName: nome, name: nome, ligaActive: true });
    t.teamOrigins[nome] = 'formada';
    t.checkedIn[u1] = _AGORA; t.checkedIn[u2] = _AGORA;   // presença é POR MEMBRO, nunca pelo nome da dupla
  };

  // ── 9ª dupla sozinha: ENTRA por repescagem. Nada na chave se move. ──
  chega(nm, 'mm', 'Marcello', 'kf', 'Karla');
  const rA = dc.integrateLateEntries(t, {});
  ok(before.every(b => firstRoundSnapshot(t).indexOf(b) !== -1),
     '9ª sozinha: os jogos ORIGINAIS seguem INTACTOS');
  const jogosDa9 = all(t).filter(m => m && (m.p1 === nm || m.p2 === nm));
  ok(jogosDa9.length === 1, '9ª sozinha ENTRA e tem exatamente 1 jogo (got ' + jogosDa9.length + ')');
  ok(jogosDa9.length === 1 && jogosDa9[0].isRepechageSlot,
     '…e entra pela REPESCAGEM (a sobra da 1ª rodada é a vaga do último inscrito)');
  ok(!(rA.recusas || []).some(x => x && x.motivo === 'falta-par'),
     'ninguém mais fica esperando par: sem recusa "falta-par" [' + JSON.stringify(rA.recusas || []) + ']');
  ok(firstRoundSnapshot(t).length === before.length,
     'a 9ª não criou confronto REAL novo — ela ocupa a vaga de sobra, que ainda espera adversário');

  // ── 10ª chega: COMPLETA o jogo da 9ª (a repescagem vira confronto normal) ──
  const nm2 = 'Ana / Bia';
  chega(nm2, 'an', 'Ana', 'bi', 'Bia');
  const r = dc.integrateLateEntries(t, {});

  const after = firstRoundSnapshot(t);
  // ⚠️ O ASSERT CENTRAL: os jogos que já existiam continuam EXATAMENTE iguais.
  ok(before.every(b => after.indexOf(b) !== -1),
     '✅ os jogos ORIGINAIS seguem INTACTOS (mesmos ids e confrontos) [' + JSON.stringify(r) + ']');
  // e nenhum rótulo quebrado tipo "/ Camila Putignani" (dupla virando individual)
  const broken = all(t).filter(m => m && [m.p1, m.p2].some(x => typeof x === 'string' && /^\s*\/|\/\s*$/.test(x)));
  ok(broken.length === 0, 'nenhum rótulo de dupla quebrado ("/ Fulano") — got ' + broken.length);
  // as duas entraram, e entraram UMA CONTRA A OUTRA — é o "jogo 5"
  const jogo = all(t).filter(m => m && [m.p1, m.p2].indexOf(nm) !== -1 && [m.p1, m.p2].indexOf(nm2) !== -1);
  ok(jogo.length === 1, 'as 2 tardias entraram NO MESMO jogo novo (got ' + jogo.length + ')');
  ok(all(t).filter(m => m && (m.p1 === nm || m.p2 === nm)).length === 1, 'a 9ª tem exatamente 1 jogo');
  ok(all(t).filter(m => m && (m.p1 === nm2 || m.p2 === nm2)).length === 1, 'a 10ª tem exatamente 1 jogo');
  ok(after.length === before.length + 1,
     'a 1ª rodada cresceu de ' + before.length + ' pra ' + after.length + ' — 1 jogo novo, só');
  ok(jogo.every(m => m.p1 !== m.p2), 'não joga contra si mesma');
})();

console.log('\n' + (fail === 0 ? '✅ late-entry-never-redraws: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { console.error('\nFALHAS:'); fails.forEach(f => console.error('  ✗ ' + f)); }
process.exit(fail > 0 ? 1 : 0);
