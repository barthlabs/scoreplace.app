#!/usr/bin/env node
/* corrigir-duplas-grupo-l.js — FERRAMENTA DE USO ÚNICO (CONFRA · Grupo L da R1)
 *
 * ⛔ NÃO é rota do app, NÃO é callable, NÃO roda sozinha. Uso manual, Admin SDK.
 *
 * O QUE ACONTECEU (medido em 02/set/2026):
 * Os três jogos do R1 Grupo L terminaram 6-1, produzindo EMPATE TRIPLO — Arnaldo,
 * Mariana e Cynthia com 2 vitórias e saldo +5. A classificação PUBLICADA na tela
 * ordena Arnaldo 1º, Mariana 2º, Cynthia 3º. O campo `classifCongelada`, gravado em
 * 2026-08-22T23:27:52.816Z, guardou OUTRA ordem: Cynthia 1º, Arnaldo 2º, Mariana 3º.
 * O avanço para a Fase 2 usou a congelada, e por isso as duplas saíram:
 *     Ouro  = Cynthia + Arnaldo      (deveria ser Arnaldo + Mariana)
 *     Prata = Mariana + Marjorie     (deveria ser Cynthia + Marjorie)
 *
 * Decisão do dono (02/set/2026): _"o que vale é o que foi publicado. o congelado esta
 * errado. (…) na ouro Arnaldo e Mariana e na Prata Cynthia e Marjorie"_.
 *
 * O QUE ESTA FERRAMENTA FAZ: TROCA Cynthia ↔ Mariana entre os dois jogos, levando a
 * PESSOA INTEIRA (uid, nome e a entrada de estatística dentro de `teamNObj.participants`).
 * ⛔ SÓ ISSO. Ordem do dono em 02/set/2026: _"só isso troca"_ — a `classifCongelada` do
 * Grupo L fica como está; corrigi-la não foi pedido e não é preciso para as duplas.
 *
 * OS JOGOS. ⚠️ A TELA numera `_gameNum + 1` — medido: o card "JOGO 164" do print é o
 * doc de `_gameNum` 163. Por isso os dois números:
 *     tela JOGO 117  (doc `_gameNum` 116, gold-VC-R1-P11)  — Mariana entra no lugar da Cynthia
 *     tela JOGO 164  (doc `_gameNum` 163, silver-VC-R1-P9) — Cynthia entra no lugar da Mariana
 * Quem manda é a PESSOA, não o número: estes são os DOIS ÚNICOS jogos da Fase 2 com a
 * Cynthia Calabrese e com a Mariana Ciocci, respectivamente.
 * ⛔ O QUE ELA NUNCA FAZ: mexer em placar, resultado, vencedor, em qualquer outro grupo,
 * em qualquer outro jogo, nos seeds dos adversários ou na estrutura da chave. Os dois
 * jogos continuam sendo os mesmos jogos, contra os mesmos adversários.
 *
 * USO:
 *   node scripts/corrigir-duplas-grupo-l.js --dry-run
 *   node scripts/corrigir-duplas-grupo-l.js --executar --confirmo
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const admin = require(path.join(ROOT, 'functions', 'node_modules', 'firebase-admin'));

const argv = process.argv.slice(2);
const EXECUTAR = argv.indexOf('--executar') !== -1 && argv.indexOf('--confirmo') !== -1;
const DRY = !EXECUTAR;

const JOGO_OURO  = 'ph-tour_1780009816637-1-gold-VC-R1-P11';
const JOGO_PRATA = 'ph-tour_1780009816637-1-silver-VC-R1-P9';
const UID_CYNTHIA  = 'JCLwsoGhZpNKIlkJTiUaV479gP73';
const UID_MARIANA  = 'ZXi9FrfQHhWfFXsJHIVzqVuW7VP2';
const UID_ARNALDO  = 'Nqn097Y48OOdPwPaI5MBOtAfqh62';
const UID_MARJORIE = 'bp7VvoAes8ftTCHB5ykKLWMrEA93';

const falhas = [];
const ok = (c, m) => { if (!c) falhas.push(m); return !!c; };

/* Extrai a PESSOA de um lado (`teamNObj`) pelo uid: nome, uid e a entrada de
 * estatística. É ela que viaja — trocar só a string do nome deixaria a estatística
 * do outro lado, e o card passaria a mostrar números de quem não está ali. */
function pessoaDe(obj, uid) {
  if (!obj) return null;
  const qual = (obj.p1Uid === uid) ? 1 : (obj.p2Uid === uid) ? 2 : 0;
  if (!qual) return null;
  const parts = Array.isArray(obj.participants) ? obj.participants : [];
  const stat = parts.find((p) => p && p.uid === uid) || null;
  return { qual: qual, uid: uid, name: obj['p' + qual + 'Name'], stat: stat };
}

/* Põe `nova` no lugar de `velha` dentro do lado, mantendo o parceiro intacto. */
function troca(jogo, lado, velha, nova) {
  const obj = jogo['team' + lado + 'Obj'];
  const q = velha.qual;
  obj['p' + q + 'Name'] = nova.name;
  obj['p' + q + 'Uid'] = nova.uid;
  const nomes = [obj.p1Name, obj.p2Name];
  obj.displayName = nomes.join(' / ');
  obj.name = obj.displayName;
  obj.participants = (obj.participants || []).map((p) =>
    (p && p.uid === velha.uid) ? (nova.stat || p) : p);
  jogo['team' + lado + 'Uids'] = [obj.p1Uid, obj.p2Uid];
  jogo['p' + lado] = obj.displayName;
}

(async () => {
  console.log('\n──── Grupo L · duplas da Fase 2 · ' + (DRY ? 'DRY-RUN (não escreve)' : '⚠️ EXECUÇÃO REAL') + ' ────\n');
  admin.initializeApp({ projectId: 'scoreplace-app' });
  const db = admin.firestore();

  const snap = await db.collection('tournaments').get();
  const alvo = snap.docs.filter((d) => {
    const t = d.data();
    return !t.sandboxOf && Array.isArray(t.phases) && t.phases.length > 1 && (t.currentPhaseIndex || 0) >= 1;
  })[0];
  if (!ok(!!alvo, 'torneio alvo não encontrado')) { console.error('✗ ABORTADO\n'); process.exit(1); }
  const ref = alvo.ref, doc = alvo.data();

  const dOuro  = await ref.collection('matches').doc(JOGO_OURO).get();
  const dPrata = await ref.collection('matches').doc(JOGO_PRATA).get();
  ok(dOuro.exists, 'jogo do Ouro não existe: ' + JOGO_OURO);
  ok(dPrata.exists, 'jogo da Prata não existe: ' + JOGO_PRATA);
  if (falhas.length) { console.error('✗ ABORTADO:\n' + falhas.map((f)=>'  • '+f).join('\n') + '\n'); process.exit(1); }

  const regOuro = dOuro.data(), regPrata = dPrata.data();
  const jOuro = JSON.parse(JSON.stringify(regOuro.jogo));
  const jPrata = JSON.parse(JSON.stringify(regPrata.jogo));

  /* ⛔ PRÉ-CONDIÇÕES: nada de resultado, e as pessoas exatamente onde a medição as viu. */
  ok(!(jOuro.winner || jOuro.draw === true || jOuro.wo != null), 'o jogo do Ouro JÁ TEM resultado — recuso mexer');
  ok(!(jPrata.winner || jPrata.draw === true || jPrata.wo != null), 'o jogo da Prata JÁ TEM resultado — recuso mexer');

  const cyn = pessoaDe(jOuro.team2Obj, UID_CYNTHIA);
  const mar = pessoaDe(jPrata.team1Obj, UID_MARIANA);
  ok(!!cyn, 'Cynthia não está no lado esperado do jogo do Ouro');
  ok(!!mar, 'Mariana não está no lado esperado do jogo da Prata');
  ok(!!(jOuro.team2Obj && (jOuro.team2Obj.p1Uid === UID_ARNALDO || jOuro.team2Obj.p2Uid === UID_ARNALDO)),
     'Arnaldo não está no jogo do Ouro');
  ok(!!(jPrata.team1Obj && (jPrata.team1Obj.p1Uid === UID_MARJORIE || jPrata.team1Obj.p2Uid === UID_MARJORIE)),
     'Marjorie não está no jogo da Prata');
  if (falhas.length) { console.error('✗ ABORTADO:\n' + falhas.map((f)=>'  • '+f).join('\n') + '\n'); process.exit(1); }

  ok(Number(jOuro._gameNum) === 116, 'o doc do Ouro não tem _gameNum 116, tem ' + jOuro._gameNum);
  ok(Number(jPrata._gameNum) === 163, 'o doc da Prata não tem _gameNum 163, tem ' + jPrata._gameNum);
  if (falhas.length) { console.error('✗ ABORTADO:\n' + falhas.map((f)=>'  • '+f).join('\n') + '\n'); process.exit(1); }

  console.log('ANTES');
  console.log('  tela JOGO 117 · Ouro  · team2: ' + jOuro.team2Obj.displayName);
  console.log('  tela JOGO 164 · Prata · team1: ' + jPrata.team1Obj.displayName);

  troca(jOuro, 2, cyn, mar);     // Cynthia sai do Ouro, Mariana entra
  troca(jPrata, 1, mar, cyn);    // Mariana sai da Prata, Cynthia entra

  console.log('DEPOIS');
  console.log('  tela JOGO 117 · Ouro  · team2: ' + jOuro.team2Obj.displayName);
  console.log('  tela JOGO 164 · Prata · team1: ' + jPrata.team1Obj.displayName);

  ok(jOuro.team2Obj.displayName.indexOf('Arnaldo') !== -1 && jOuro.team2Obj.displayName.indexOf('Mariana') !== -1,
     'a dupla do Ouro não ficou Arnaldo + Mariana');
  ok(jPrata.team1Obj.displayName.indexOf('Cynthia') !== -1 && jPrata.team1Obj.displayName.indexOf('Marjorie') !== -1,
     'a dupla da Prata não ficou Cynthia + Marjorie');
  ok(jOuro.p1 === regOuro.jogo.p1, 'o ADVERSÁRIO do Ouro mudou — não pode');
  ok(jPrata.p2 === regPrata.jogo.p2, 'a ADVERSÁRIA da Prata mudou — não pode');
  if (falhas.length) { console.error('\n✗ ABORTADO:\n' + falhas.map((f)=>'  • '+f).join('\n') + '\n'); process.exit(1); }


  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  try { fs.mkdirSync(path.join(os.homedir(), 'scoreplace-snapshots'), { recursive: true }); } catch (e) {}
  const destino = path.join(os.homedir(), 'scoreplace-snapshots', 'SNAPSHOT-GRUPO-L-' + ts + '.json');

  if (DRY) {
    console.log('\n✓ DRY-RUN completo. ZERO escritas. Todas as pré-condições passaram.');
    console.log('  (snapshot iria para ' + destino + ')');
    console.log('  Para executar: --executar --confirmo\n');
    process.exit(0);
  }

  fs.writeFileSync(destino, JSON.stringify({
    _meta: { em: new Date().toISOString(), leva: 'CONFRA · Grupo L' },
    antes: { ouro: regOuro, prata: regPrata }
  }, null, 1), { mode: 0o600 });
  fs.chmodSync(destino, 0o600);

  /* Só os DOIS jogos. O documento do torneio não é tocado — mas o `updatedAt` precisa
   * andar para as telas abertas repintarem. */
  const lote = db.batch();
  lote.update(dOuro.ref,  { jogo: jOuro }, { lastUpdateTime: dOuro.updateTime });
  lote.update(dPrata.ref, { jogo: jPrata }, { lastUpdateTime: dPrata.updateTime });
  lote.update(ref, { updatedAt: new Date().toISOString() }, { lastUpdateTime: alvo.updateTime });
  await lote.commit();

  console.log('\n✓ GRAVADO. Snapshot do estado anterior em ' + destino + ' (600).\n');
  process.exit(0);
})().catch((e) => { console.error('\n✗ ERRO:', e && e.message, '\n'); process.exit(1); });
