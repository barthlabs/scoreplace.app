/* REATIVAR ALGUÉM PRA LISTA DE ESPERA — o mesmo ato do toggle "Ativado" do app.
 *
 * PRA QUE SERVE: quem levou W.O. vai pros DESATIVADOS (`woDeactivatedAt`). Ao reativar com
 * a fase já sorteada, a regra do dono (v1.6.86/1.6.88/1.7.59) manda pro FIM da lista de
 * espera — e a v2.0.57 tira junto a folga de W.O., porque ninguém pode estar em dois
 * lugares: _"ou está inativa, ou na lista de espera ou no wo ou em jogo."_
 *
 * Normalmente quem faz isso é a própria pessoa (ou o organizador) pelo toggle na tela.
 * Este script existe pra quando é preciso fazer pelo lado de fora — e ele NÃO reimplementa
 * a regra: chama o MESMO código do app (`_waitlistPushBack` e `_sanitizeSitOutsVsRoster`,
 * de js/views/waitlist-core.js, via o shim do autodraw). Lógica paralela aqui viraria uma
 * segunda versão da regra, que é o bug que a canonização quer matar.
 *
 * ⚠️ A folga de W.O. só sai quando a VAGA FOI PREENCHIDA. Com a vaga aberta o marcador
 * ainda é quem dá os 0 pts da rodada e a punição de W.O. — quem decide isso é o próprio
 * `_sanitizeSitOutsVsRoster`, não este script.
 *
 * Grava com precondição `currentDocument.updateTime`: se alguém escrever no meio (torneio
 * ao vivo), a escrita ABORTA em vez de sobrescrever.
 *
 * Uso: SP_UID=<uid> node scripts/reativar-para-espera.js            (dry-run)
 *      SP_UID=<uid> node scripts/reativar-para-espera.js --apply    (grava)
 */
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
require(path.join(ROOT, 'functions-autodraw', 'draw-core.js'));
const win = globalThis.window;

const TID = process.env.SP_TID || 'tour_1780009816637';
const UID = process.env.SP_UID || '';
const PROJ = 'scoreplace-app';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJ}/databases/(default)/documents`;
const APPLY = process.argv.includes('--apply');
const token = () => execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();
if (!UID) { console.error('faltou SP_UID=<uid da pessoa>'); process.exit(1); }

function fromF(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return parseInt(v.integerValue, 10);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromF);
  if ('mapValue' in v) {
    const o = {}; Object.entries(v.mapValue.fields || {}).forEach(([k, x]) => { o[k] = fromF(x); });
    return o;
  }
  return null;
}
function toF(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toF) } };
  if (typeof v === 'object') {
    const f = {}; Object.entries(v).forEach(([k, x]) => { f[k] = toF(x); });
    return { mapValue: { fields: f } };
  }
  return { nullValue: null };
}
const marcadoresWo = (t, uid) => {
  const out = [];
  (t.rounds || []).forEach((r, ri) => ((r && r.matches) || []).forEach((m) => {
    if (!m || !m.isSitOut || m.sitOutReason !== 'wo') return;
    const us = [].concat(m.team1Uids || [], m.p1Uid || []).filter(Boolean);
    if (us.indexOf(uid) !== -1) out.push('R' + (ri + 1) + ' ' + m.id);
  }));
  return out;
};

(async () => {
  const res = await fetch(`${BASE}/tournaments/${TID}`, { headers: { Authorization: `Bearer ${token()}` } });
  if (!res.ok) throw new Error('GET falhou: ' + res.status);
  const doc = await res.json();
  const t = {}; Object.entries(doc.fields || {}).forEach(([k, v]) => { t[k] = fromF(v); });
  const updateTime = doc.updateTime;
  console.log(`torneio: ${t.name} · updateTime: ${updateTime}`);

  const parts = Array.isArray(t.participants) ? t.participants : [];
  const idx = parts.findIndex((p) => p && typeof p === 'object' && p.uid === UID);
  if (idx === -1) {
    const jaNaFila = (win._getWaitlist(t) || []).some((e) => e && e.uid === UID);
    console.log(jaNaFila ? '\njá está na lista de espera — nada a fazer.' : '\nnão está no elenco deste torneio.');
    return;
  }
  const entry = parts[idx];
  console.log(`\nANTES · elenco[${idx}] · ligaActive=${entry.ligaActive} · woDeactivatedAt=${entry.woDeactivatedAt || '-'} · woSentToWaitlistAt=${entry.woSentToWaitlistAt || '-'}`);
  console.log(`  marcadores de W.O.: ${marcadoresWo(t, UID).join(', ') || '(nenhum)'}`);

  // ── o MESMO ato do toggle, na mesma ordem (js/views/tournaments-enrollment.js) ──
  parts.splice(idx, 1);
  t.participants = parts;
  entry.ligaActive = true;
  if (entry.woDeactivatedAt) {
    delete entry.woDeactivatedAt;
    entry.woSentToWaitlistAt = new Date().toISOString();  // o selo de W.O. permanece: ela está na fila POR CAUSA dele
  }
  win._waitlistPushBack(t, entry);                        // FIM da fila (código real)
  const folgasRemovidas = win._sanitizeSitOutsVsRoster(t); // tira a folga de W.O. se a vaga foi preenchida (código real)

  console.log(`\nDEPOIS · na fila? ${(win._getWaitlist(t) || []).some((e) => e && e.uid === UID)} · posição ${(win._getWaitlist(t) || []).findIndex((e) => e && e.uid === UID) + 1} de ${(win._getWaitlist(t) || []).length}`);
  console.log(`  folgas removidas pelo saneamento: ${folgasRemovidas}`);
  console.log(`  marcadores de W.O. restantes: ${marcadoresWo(t, UID).join(', ') || '(nenhum)'}`);
  console.log(`  ainda no elenco? ${(t.participants || []).some((p) => p && p.uid === UID)}`);

  if (!APPLY) { console.log('\n(dry-run — rode com --apply pra gravar)'); return; }

  const fields = {};
  ['participants', 'standbyParticipants', 'waitlist', 'rounds'].forEach((k) => { if (t[k] !== undefined) fields[k] = toF(t[k]); });
  if (t.monarchWaitlist !== undefined) fields.monarchWaitlist = toF(t.monarchWaitlist);
  const hist = Array.isArray(t.history) ? t.history.slice() : [];
  hist.push({ at: new Date().toISOString(), message: `Reativacao manual: ${UID} saiu dos desativados e entrou no fim da lista de espera (folgas de W.O. removidas: ${folgasRemovidas}). A indicacao historica do grupo foi mantida.` });
  fields.history = toF(hist);

  const mask = Object.keys(fields).map((k) => `updateMask.fieldPaths=${k}`).join('&');
  const url = `${BASE}/tournaments/${TID}?${mask}&currentDocument.updateTime=${encodeURIComponent(updateTime)}`;
  const w = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!w.ok) { console.error('PATCH falhou:', w.status, await w.text()); process.exit(1); }
  console.log('\n✓ gravado.');
})();
