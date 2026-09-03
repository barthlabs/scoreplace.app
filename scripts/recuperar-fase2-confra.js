#!/usr/bin/env node
/* recuperar-fase2-confra.js — FERRAMENTA OPERACIONAL DE USO ÚNICO (CONFRA.RECOVERY.P0)
 *
 * ⛔ NÃO é rota do app. NÃO é callable. NÃO é exposta ao cliente. Roda à mão, por quem
 * tem Admin SDK, com o backup privado em mãos.
 *
 * O QUE ACONTECEU (medido em 02/set/2026):
 * O avanço para a Fase 2 rodou NO CLIENTE (`advanceMultiPhase` → `commitTournamentTx` →
 * `mutateTournament`), e não por Cloud Function como o sorteio inicial (`_callDrawRound`).
 * Num torneio DIVIDIDO (`_semPesados` inclui "matches"), `mutateTournament` TIRA os jogos
 * do documento — para não desfazer a divisão — e NÃO escreve a subcoleção: quem escreve
 * `tournaments/{id}/matches` é a CF, porque a regra nega o cliente
 * (`firestore.rules`: `allow write: if false`). Resultado: os 99 jogos da Fase 2 foram
 * calculados, saíram do documento, não chegaram à subcoleção e sobreviveram apenas no
 * `localStorage` da aba do organizador.
 *
 * O QUE ESTA FERRAMENTA FAZ: grava esses 99 jogos — os MESMOS, vindos do backup — na
 * subcoleção canônica, e sobe os contadores de 115 para 214.
 * ⛔ O QUE ELA NUNCA FAZ: sortear, reseedar, reordenar, refazer par, tocar em jogo da
 * Fase 1, em placar, resultado, classificação, `phases`, `participants` ou sandbox.
 *
 * USO:
 *   node scripts/recuperar-fase2-confra.js --backup <arquivo.json> --dry-run
 *   node scripts/recuperar-fase2-confra.js --backup <arquivo.json> --executar --confirmo
 *
 * ⚠️ `--dry-run` é o padrão. Sem `--executar --confirmo` NADA é escrito.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const admin = require(path.join(ROOT, 'functions', 'node_modules', 'firebase-admin'));
const S = require(path.join(ROOT, 'functions', 'vendor', 'tournament-split-core.js'));

// ── argumentos ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf(n); return i === -1 ? null : argv[i + 1]; };
const tem = (n) => argv.indexOf(n) !== -1;
const BACKUP = arg('--backup');
const EXECUTAR = tem('--executar') && tem('--confirmo');
const DRY = !EXECUTAR;

if (!BACKUP) { console.error('✗ falta --backup <arquivo.json>'); process.exit(2); }

// ── o MESMO hash FNV-1a que gerou os números do backup ───────────────────────
const fnv = (s) => { let h = 0x811c9dc5; s = String(s);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
  return ('00000000' + h.toString(16)).slice(-8); };

/* ⛔ AS EXPECTATIVAS SÃO CONSTANTES, e é de propósito: elas vêm da medição de
 * 02/set/2026 e são o que torna esta ferramenta de USO ÚNICO. Se o dado mudar, ela
 * ABORTA em vez de se adaptar — adaptar-se seria gravar sobre um estado que ninguém
 * mediu. [[feedback_measure_dont_declare_fixed]] */
const ESPERADO = {
  FASE2_TOTAL: 99,
  HASH_IDS_FASE2: '5e21da9f',
  HASH_CONTEUDO_FASE2: '3cba157b',
  POR_ROUND: { 1: 35, 2: 32, 3: 16, 4: 8, 5: 4, 6: 4 },
  FASE1_NO_BANCO: 115,
  HASH_IDS_FASE1: '40ef84d8',
  NJOGOS_ANTES: 115,
  NJOGOS_DEPOIS: 214
};

const falhas = [];
const ok = (cond, msg) => { if (!cond) falhas.push(msg); return !!cond; };
const linha = (s) => console.log('  ' + s);

(async () => {
  console.log('\n──── recuperar Fase 2 · ' + (DRY ? 'DRY-RUN (não escreve nada)' : '⚠️ EXECUÇÃO REAL') + ' ────\n');

  // ══ 1. O BACKUP ════════════════════════════════════════════════════════════
  const pacote = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));
  const t = pacote.torneio;
  ok(!!t && typeof t === 'object', 'backup sem `torneio`');
  ok(!!t.id, 'backup sem id de torneio');
  const f2 = (t.matches || []).filter((m) => m && m.phaseIndex === 1);

  console.log('① BACKUP');
  ok(f2.length === ESPERADO.FASE2_TOTAL, 'esperava ' + ESPERADO.FASE2_TOTAL + ' jogos de Fase 2, achei ' + f2.length);
  const ids = f2.map((m) => String(m.id)).sort();
  ok(new Set(ids).size === ESPERADO.FASE2_TOTAL, 'ids repetidos na Fase 2');
  ok(f2.every((m) => m.phaseIndex === 1), 'há jogo sem phaseIndex 1');
  ok(f2.every((m) => (m.p1 || m.team1) && (m.p2 || m.team2)), 'há jogo sem os dois lados');
  ok(f2.every((m) => !(m.winner || m.draw === true || m.wo != null)), 'há jogo COM resultado — a Fase 2 não foi jogada');
  const porRound = {}; f2.forEach((m) => { porRound[m.round] = (porRound[m.round] || 0) + 1; });
  ok(JSON.stringify(porRound) === JSON.stringify(ESPERADO.POR_ROUND),
    'topologia de rodadas diferente: ' + JSON.stringify(porRound));
  const hIds = fnv(JSON.stringify(ids));
  const hCont = fnv(JSON.stringify(f2));
  ok(hIds === ESPERADO.HASH_IDS_FASE2, 'HASH de ids diverge: ' + hIds);
  ok(hCont === ESPERADO.HASH_CONTEUDO_FASE2, 'HASH de conteúdo diverge: ' + hCont);
  linha('99 jogos · ids ' + hIds + ' · conteúdo ' + hCont + ' · rodadas ' + JSON.stringify(porRound));

  if (falhas.length) { console.error('\n✗ ABORTADO no backup:\n' + falhas.map((f) => '  • ' + f).join('\n') + '\n'); process.exit(1); }

  // ══ 2. PRÉ-CONDIÇÕES NO FIRESTORE ══════════════════════════════════════════
  admin.initializeApp({ projectId: 'scoreplace-app' });
  const db = admin.firestore();
  const ref = db.collection('tournaments').doc(String(t.id));
  const snap = await ref.get();
  ok(snap.exists, 'torneio alvo não existe no Firestore');
  if (!snap.exists) { console.error('\n✗ ABORTADO\n'); process.exit(1); }
  const doc = snap.data();

  console.log('\n② PRÉ-CONDIÇÕES NO BANCO');
  ok(!doc.sandboxOf && doc.isSandbox !== true, 'o alvo é um SANDBOX — recuso');
  ok(Array.isArray(doc._semPesados) && doc._semPesados.indexOf('matches') !== -1,
    'o torneio não está dividido em `matches`');
  ok((doc.currentPhaseIndex || 0) === 1, 'currentPhaseIndex != 1');

  const msSnap = await ref.collection('matches').get();
  const noBanco = [];
  msSnap.forEach((d) => { const v = d.data() || {}; if (v.jogo) noBanco.push(v.jogo); });
  ok(noBanco.length === ESPERADO.FASE1_NO_BANCO,
    'esperava ' + ESPERADO.FASE1_NO_BANCO + ' jogos no banco, achei ' + noBanco.length);
  const idsBanco = new Set(noBanco.map((m) => String(m.id)));
  const hFase1 = fnv(JSON.stringify([...idsBanco].sort()));
  ok(hFase1 === ESPERADO.HASH_IDS_FASE1, 'HASH da Fase 1 no banco diverge: ' + hFase1);
  const colisoes = ids.filter((i) => idsBanco.has(i));
  ok(colisoes.length === 0, colisoes.length + ' id(s) da Fase 2 JÁ existem no banco — não sobrescrevo');
  ok((doc._nJogos === ESPERADO.NJOGOS_ANTES), '_nJogos != ' + ESPERADO.NJOGOS_ANTES + ' (é ' + doc._nJogos + ')');
  linha('banco: ' + noBanco.length + ' jogos · ids ' + hFase1 + ' · colisões com a Fase 2: ' + colisoes.length);

  /* ⭐ IDEMPOTÊNCIA: se os 99 já estiverem lá, a ferramenta SAI DIZENDO ISSO, sem
   * escrever. Segunda execução não duplica — e não é preciso lembrar de não rodar. */
  if (colisoes.length === ESPERADO.FASE2_TOTAL && noBanco.length === ESPERADO.NJOGOS_DEPOIS) {
    console.log('\n✓ NADA A FAZER: os 99 já estão gravados (execução anterior). Idempotente.\n');
    process.exit(0);
  }
  if (falhas.length) { console.error('\n✗ ABORTADO nas pré-condições:\n' + falhas.map((f) => '  • ' + f).join('\n') + '\n'); process.exit(1); }

  // ══ 3. ENVELOPES CANÔNICOS ═════════════════════════════════════════════════
  /* ⛔ NUNCA montados à mão: passa pelo `dividir()` REAL, com um objeto que tem SÓ os
   * 99 em `t.matches` e nada em rounds/groups. Assim `_loc` sai {tipo:'matches', mi} e
   * não colide com os 115 da Fase 1, que são {tipo:'rounds', ri:0, mi}. */
  const soF2 = { matches: JSON.parse(JSON.stringify(f2)), rounds: [], groups: [] };
  const partes = S.dividir(soF2, ['matches']);
  const regs = partes.matches || [];
  console.log('\n③ ENVELOPES (pela porta canônica `dividir`)');
  ok(regs.length === ESPERADO.FASE2_TOTAL, 'dividir devolveu ' + regs.length + ' envelopes');
  const chaves = regs.map((r) => S.chaveDoRegistro(r));
  ok(chaves.every(Boolean), 'há envelope sem chave');
  ok(new Set(chaves).size === chaves.length, 'chaves repetidas entre os envelopes');
  const jaExiste = [];
  for (const k of chaves) { if (msSnap.docs.some((d) => d.id === k)) jaExiste.push(k); }
  ok(jaExiste.length === 0, jaExiste.length + ' chave(s) de documento já existem — recuso sobrescrever');
  linha(regs.length + ' envelopes · _loc.tipo=' + JSON.stringify([...new Set(regs.map((r) => r._loc && r._loc.tipo))]));

  if (falhas.length) { console.error('\n✗ ABORTADO nos envelopes:\n' + falhas.map((f) => '  • ' + f).join('\n') + '\n'); process.exit(1); }

  // ══ 4. SNAPSHOT PRÉ-RECUPERAÇÃO (privado, fora do repositório) ═════════════
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  try { fs.mkdirSync(path.join(os.homedir(), 'scoreplace-snapshots'), { recursive: true }); } catch (e) {}
  const destino = path.join(os.homedir(), 'scoreplace-snapshots', 'SNAPSHOT-PRE-RECUPERACAO-' + ts + '.json');
  const snapshot = { _meta: { em: new Date().toISOString(), leva: 'CONFRA.RECOVERY.P0' },
    documento: doc, matches_subcolecao: msSnap.docs.map((d) => ({ id: d.id, dados: d.data() })) };
  if (!DRY) {
    fs.writeFileSync(destino, JSON.stringify(snapshot, null, 1), { mode: 0o600 });
    fs.chmodSync(destino, 0o600);
  }
  console.log('\n④ SNAPSHOT PRÉ-RECUPERAÇÃO');
  linha(DRY ? '(dry-run: não gravado) ' + destino : destino + ' · 600 · ' +
    crypto.createHash('sha256').update(fs.readFileSync(destino, 'utf8')).digest('hex').slice(0, 16));

  // ══ 5. ESCRITA ═════════════════════════════════════════════════════════════
  const nPartes = Object.assign({}, doc._nPartes || {}, { matches: ESPERADO.NJOGOS_DEPOIS });
  console.log('\n⑤ ESCRITA');
  linha('marcadores: _nJogos ' + doc._nJogos + ' → ' + ESPERADO.NJOGOS_DEPOIS +
        ' · _nPartes.matches ' + ((doc._nPartes || {}).matches) + ' → ' + ESPERADO.NJOGOS_DEPOIS);
  linha('documentos a criar: ' + regs.length + ' em tournaments/<id>/matches');
  linha('⛔ NÃO toca: jogos da Fase 1, participants, phases, results, classificação, seeds, pares.');

  if (DRY) {
    console.log('\n✓ DRY-RUN completo. ZERO escritas. Todas as ' +
      '(backup + pré-condições + envelopes) verificações passaram.');
    console.log('  Para executar de verdade: --executar --confirmo\n');
    process.exit(0);
  }

  /* Batch atômico com pré-condição relida: o Firestore recusa o lote inteiro se o
   * documento tiver mudado desde a leitura (precondition por updateTime). */
  const lote = db.batch();
  regs.forEach((r) => { lote.create(ref.collection('matches').doc(S.chaveDoRegistro(r)), r); });
  lote.update(ref, { _nJogos: ESPERADO.NJOGOS_DEPOIS, _nPartes: nPartes,
                     updatedAt: new Date().toISOString() },
              { lastUpdateTime: snap.updateTime });
  await lote.commit();

  const depois = await ref.collection('matches').get();
  console.log('\n✓ GRAVADO. Subcoleção agora tem ' + depois.size + ' documentos (esperado ' + ESPERADO.NJOGOS_DEPOIS + ').');
  process.exit(depois.size === ESPERADO.NJOGOS_DEPOIS ? 0 : 1);
})().catch((e) => { console.error('\n✗ ERRO:', e && e.message, '\n'); process.exit(1); });
