#!/usr/bin/env node
/* Corrige o jogo 160 do Confra, que teve o aviso enviado sem a proposta chegar ao banco.
 *
 * O alvo é deliberadamente fechado: torneio, jogo, lados, fase e placar. Sem
 * `--aplicar`, apenas prova o estado. Com `--aplicar`, grava o resultado APROVADO
 * tanto na estrutura canônica quanto no espelho `results/160`, e relê ambos.
 */
'use strict';

const path = require('path');
const ROOT = path.join(__dirname, '..');
const admin = require(path.join(ROOT, 'functions', 'node_modules', 'firebase-admin'));
require('./preflight-alvo').preflight('correcao-confra-jogo-160', 'scoreplace-app');

const APLICAR = process.argv.includes('--aplicar');
const TID = 'tour_1780009816637';
const P1 = 'FABIANA VIEIRA / Suely';
const P2 = 'Fernando Bernacchi / Vivian';
const agora = () => new Date().toISOString();
const falhar = (m) => { throw new Error('ABORTADO: ' + m); };
const normalizar = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

function campos(m) {
  return {
    scoreP1: m.scoreP1, scoreP2: m.scoreP2, sets: m.sets,
    setsWonP1: m.setsWonP1, setsWonP2: m.setsWonP2,
    totalGamesP1: m.totalGamesP1, totalGamesP2: m.totalGamesP2,
    winner: m.winner, draw: m.draw, pendingResult: m.pendingResult || null
  };
}

function resultadoDefinitivo(momento, p2) {
  return {
    scoreP1: 0, scoreP2: 2,
    sets: [{ gamesP1: 1, gamesP2: 6 }, { gamesP1: 3, gamesP2: 6 }],
    setsWonP1: 0, setsWonP2: 2,
    totalGamesP1: 4, totalGamesP2: 12,
    winner: p2, draw: false,
    resultAt: momento, startedAt: momento
  };
}

function conferirJogo(m) {
  if (!m || typeof m !== 'object') falhar('envelope não contém `jogo`');
  if (normalizar(m.p1) !== normalizar(P1) || normalizar(m.p2) !== normalizar(P2)) {
    falhar('lados divergentes: ' + JSON.stringify({ p1: m.p1, p2: m.p2 }));
  }
  if (Number(m.phaseIndex) !== 1 || Number(m.round) !== 1) falhar('não é a primeira rodada eliminatória: ' + JSON.stringify({ phaseIndex: m.phaseIndex, round: m.round }));
}

(async () => {
  if (!admin.apps.length) admin.initializeApp({ projectId: 'scoreplace-app' });
  const db = admin.firestore();
  const torneio = db.collection('tournaments').doc(TID);
  const antes = await Promise.all([torneio.get(), torneio.collection('matches').get()]);
  if (!antes[0].exists) falhar('torneio não existe');
  const candidatos = antes[1].docs.filter((d) => {
    const m = (d.data() || {}).jogo || {};
    return normalizar(m.p1) === normalizar(P1) && normalizar(m.p2) === normalizar(P2) &&
      Number(m.phaseIndex) === 1 && Number(m.round) === 1;
  });
  if (candidatos.length !== 1) falhar('esperava uma chave eliminatória R2 para os dois lados; encontrei ' + candidatos.length);
  const jogoRef = candidatos[0].ref;
  const jogoAntes = candidatos[0].data() || {};
  const MID = String((jogoAntes.jogo || {}).id || '');
  if (!MID) falhar('jogo encontrado sem id interno');
  const resultadoRef = torneio.collection('results').doc(MID);
  const resultadoAntes = await resultadoRef.get();
  conferirJogo(jogoAntes.jogo);
  console.log('▸ alvo confirmado: Fase 2 eliminatória, R2 global, jogo visível 160 (id interno ' + MID + ', envelope ' + jogoRef.id + ')');
  console.log('  estrutura antes: ' + JSON.stringify(campos(jogoAntes.jogo)));
  console.log('  espelho antes:   ' + JSON.stringify(resultadoAntes.exists ? campos(resultadoAntes.data() || {}) : null));
  if (!APLICAR) {
    console.log('\n✓ DRY-RUN: nenhuma escrita. Rode com --aplicar para confirmar o placar excepcional.');
    return;
  }

  const momento = Date.now();
  const final = resultadoDefinitivo(momento, jogoAntes.jogo.p2);
  await db.runTransaction(async (tx) => {
    const [jogoSnap, resultadoSnap] = await Promise.all([tx.get(jogoRef), tx.get(resultadoRef)]);
    if (!jogoSnap.exists) falhar('o jogo sumiu antes da transação');
    const envelope = jogoSnap.data() || {};
    conferirJogo(envelope.jogo);
    const jogo = Object.assign({}, envelope.jogo, final);
    delete jogo.pendingResult;
    const espelhoAnterior = resultadoSnap.exists ? (resultadoSnap.data() || {}) : {};
    const espelho = Object.assign({}, espelhoAnterior, final, {
      matchId: MID, tournamentId: TID, p1: P1, p2: P2, updatedAt: agora()
    });
    delete espelho.pendingResult;
    tx.update(jogoRef, { jogo: jogo });
    tx.set(resultadoRef, espelho);
  });

  const depois = await Promise.all([jogoRef.get(), resultadoRef.get()]);
  const jogoDepois = (depois[0].data() || {}).jogo;
  const espelhoDepois = depois[1].data() || {};
  conferirJogo(jogoDepois);
  const esperado = JSON.stringify(campos(Object.assign({}, resultadoDefinitivo(momento, jogoAntes.jogo.p2), { pendingResult: null })));
  const estrutura = JSON.stringify(campos(jogoDepois));
  const espelho = JSON.stringify(campos(espelhoDepois));
  if (estrutura !== esperado || espelho !== esperado) falhar('releitura divergente; estrutura=' + estrutura + ' espelho=' + espelho);
  console.log('\n✓ CORRIGIDO e relido: 1–6, 3–6; Fernando Bernacchi / Vivian vencedor; sem pendência.');
})().catch((e) => { console.error('\n✗ ' + (e && e.message || e)); process.exit(1); });
