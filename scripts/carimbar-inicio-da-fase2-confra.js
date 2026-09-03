#!/usr/bin/env node
/* carimbar-inicio-da-fase2-confra.js — FERRAMENTA DE USO ÚNICO (CONFRA · Fase 2)
 *
 * POR QUÊ: o cartão da rodada mostra "⏳ Aguardando início" com a Fase 2 já sorteada e as
 * duplas publicadas. Medido no navegador, em produção (02/set/2026): o CÁLCULO já está
 * certo — `_phaseCurrentRoundProgress` devolve `roundNum 1` de `roundsTotal 6`, e
 * `_phaseRoundWindow` fatia a janela até 12/nov 23:00 em 6 rodadas de ~11,9 dias, dando
 * exatamente a regressiva que o dono descreveu. O que falta é o DADO: `phaseStartedAt`
 * está `null`. O avanço rodou no cliente numa versão anterior ao carimbo (2.1.96) e o
 * instante nunca chegou ao banco.
 *
 * O INSTANTE, e por que ele não é chute: as notificações `new_phase` deste torneio saíram
 * em 2026-09-02T14:17:51.424Z (11:17 em Brasília) — a mais antiga do lote. Elas são
 * disparadas PELO avanço, então esse é o registro que sobrou dele. Bate com o que o dono
 * disse: _"o início foi marcado hoje com o avançar fase"_.
 *
 * ⛔ ESCREVE UM CAMPO SÓ: `phaseStartedAt['1']`. Não toca em jogos, duplas, placares,
 * classificação, fases, nem em nenhum outro torneio. Recusa se já houver carimbo.
 *
 * USO:
 *   node scripts/carimbar-inicio-da-fase2-confra.js            (dry-run, não escreve)
 *   node scripts/carimbar-inicio-da-fase2-confra.js --executar --confirmo
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));

const EXECUTAR = process.argv.indexOf('--executar') !== -1 && process.argv.indexOf('--confirmo') !== -1;
const INSTANTE = '2026-09-02T14:17:51.424Z';

(async () => {
  console.log('\n──── carimbo do início da Fase 2 · ' + (EXECUTAR ? '⚠️ EXECUÇÃO REAL' : 'DRY-RUN (não escreve)') + ' ────\n');
  admin.initializeApp({ projectId: 'scoreplace-app' });
  const db = admin.firestore();

  const snap = await db.collection('tournaments').get();
  const alvo = snap.docs.filter((d) => {
    const t = d.data();
    return !t.sandboxOf && Array.isArray(t.phases) && t.phases.length > 1 && (t.currentPhaseIndex || 0) >= 1;
  })[0];
  if (!alvo) { console.error('✗ torneio alvo não encontrado\n'); process.exit(1); }
  const doc = alvo.data();

  const atual = doc.phaseStartedAt || null;
  console.log('  torneio: ' + (doc.name || alvo.id));
  console.log('  phaseStartedAt ANTES  = ' + JSON.stringify(atual));

  if (atual && atual['1']) {
    console.error('\n✗ JÁ existe carimbo da fase 1 (' + atual['1'] + ') — recuso sobrescrever.\n');
    process.exit(1);
  }
  if ((doc.currentPhaseIndex || 0) !== 1) {
    console.error('\n✗ o torneio não está na fase 1 (está na ' + doc.currentPhaseIndex + ').\n');
    process.exit(1);
  }

  const novo = Object.assign({}, atual || {}, { '1': INSTANTE });
  console.log('  phaseStartedAt DEPOIS = ' + JSON.stringify(novo));
  console.log('  (= ' + new Date(INSTANTE).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + ' em Brasília)');

  if (!EXECUTAR) {
    console.log('\n✓ DRY-RUN completo. ZERO escritas.');
    console.log('  Para executar: --executar --confirmo\n');
    process.exit(0);
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  try { fs.mkdirSync(path.join(os.homedir(), 'scoreplace-snapshots'), { recursive: true }); } catch (e) {}
  const destino = path.join(os.homedir(), 'scoreplace-snapshots', 'SNAPSHOT-PHASESTARTEDAT-' + ts + '.json');
  fs.writeFileSync(destino, JSON.stringify({ em: new Date().toISOString(), antes: atual }, null, 1), { mode: 0o600 });
  fs.chmodSync(destino, 0o600);

  await alvo.ref.update({ phaseStartedAt: novo, updatedAt: new Date().toISOString() },
                        { lastUpdateTime: alvo.updateTime });
  console.log('\n✓ GRAVADO. Snapshot do estado anterior em ' + destino + ' (600).\n');
  process.exit(0);
})().catch((e) => { console.error('\n✗ ERRO:', (e && e.message) || e, '\n'); process.exit(1); });
