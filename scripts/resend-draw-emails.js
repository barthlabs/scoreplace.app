/* REENVIO PONTUAL — e-mails do sorteio que a CF não mandou
 *
 * CONTEXTO (02/ago/2026): o sorteio AUTOMÁTICO do Confra rodou às 22:00Z, criou as
 * notificações in-app (e o push) e NÃO mandou e-mail nenhum — a Cloud Function só
 * escrevia o canal in-app (fix em functions-autodraw/index.js, CF_VERSION 1.4).
 * Este script cobre o buraco DAQUELE sorteio: enfileira o e-mail que faltou.
 *
 * Regras deste script:
 *   • a MENSAGEM não é reescrita: sai exatamente a que já está gravada na notificação
 *     in-app de cada pessoa (o texto personalizado com os jogos dela). Zero texto novo,
 *     zero chance de anunciar confronto diferente do que a pessoa viu no app.
 *   • quem recebe é decidido pelas MESMAS regras do app: notifyEmail (opt-out),
 *     notifyLevel (sorteio é 'fundamental'), e-mail principal + linkedEmails, dedup
 *     por endereço. Nada de mandar pra quem pediu pra não receber.
 *   • NÃO envia e-mail: enfileira em `notif_email_queue`, a mesma fila do app — quem
 *     envia é a CF flushNotifEmailDigest (roda a cada 5 min, consolida por pessoa).
 *   • idempotente por marca: grava `resendKey` e pula quem já tem item na fila com a
 *     mesma chave — rodar duas vezes não manda dois e-mails.
 *
 * Uso: node scripts/resend-draw-emails.js               (dry-run — só mostra)
 *      node scripts/resend-draw-emails.js --apply       (enfileira)
 *      SP_TID=<id> SP_ONLY=<e-mail> ... (limita a um torneio / a um destinatário)
 */
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

const TID = process.env.SP_TID || 'tour_1780009816637';
const ONLY = (process.env.SP_ONLY || '').trim().toLowerCase();  // teste: só este e-mail
const SINCE = process.env.SP_SINCE || '2026-08-02T21:00:00.000Z'; // notificações do sorteio
const PROJ = 'scoreplace-app';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJ}/databases/(default)/documents`;
const APPLY = process.argv.includes('--apply');
const token = () => execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();

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

// MESMA régua do app (window._notifLevelAllowed, tournaments-utils.js).
function levelAllowed(userLevel, notifLevel) {
  if (!userLevel || userLevel === 'todas') return true;
  if (userLevel === 'none') return false;
  if (userLevel === 'importantes') return notifLevel === 'fundamental' || notifLevel === 'important';
  if (userLevel === 'fundamentais') return notifLevel === 'fundamental';
  return true;
}

(async () => {
  const TK = token();
  const H = { Authorization: `Bearer ${TK}` };
  const J = { ...H, 'Content-Type': 'application/json' };

  // 1) torneio → uids dos inscritos
  const tRes = await fetch(`${BASE}/tournaments/${TID}`, { headers: H });
  if (!tRes.ok) throw new Error('GET torneio falhou: ' + tRes.status);
  const tDoc = await tRes.json();
  const t = {}; Object.entries(tDoc.fields || {}).forEach(([k, v]) => { t[k] = fromF(v); });
  const uids = new Set();
  (Array.isArray(t.participants) ? t.participants : []).forEach((p) => {
    if (!p || typeof p !== 'object') return;
    [p.uid, p.p1Uid, p.p2Uid].forEach((u) => { if (u) uids.add(String(u)); });
    if (Array.isArray(p.participants)) p.participants.forEach((sp) => { if (sp && sp.uid) uids.add(String(sp.uid)); });
  });
  console.log(`torneio: ${t.name} (${TID})`);
  console.log(`sorteio: ${t.lastAutoDrawAt || '?'} · inscritos com uid: ${uids.size}`);
  if (/^\(SB\)/.test(String(t.name || '')) || /_sb$/.test(TID)) {
    console.log('SANDBOX — sandbox não manda e-mail pra ninguém. Abortando.');
    return;
  }

  // 2) por uid: a notificação in-app DAQUELE sorteio (a mensagem sai dela, não de mim)
  //    + o perfil (opt-outs e endereços).
  const alvos = [];         // { uid, email, msg }
  let semNotif = 0, optout = 0, nivel = 0, semEmail = 0;
  for (const uid of uids) {
    const nRes = await fetch(`${BASE}/users/${uid}/notifications?pageSize=300`, { headers: H });
    if (!nRes.ok) { semNotif++; continue; }
    const nd = await nRes.json();
    const draw = (nd.documents || [])
      .map((d) => ({ id: d.name.split('/').pop(), f: Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, fromF(v)])) }))
      .filter((x) => x.f.type === 'draw' && x.f.tournamentId === TID && String(x.f.createdAt || '') >= SINCE)
      .sort((a, b) => String(b.f.createdAt).localeCompare(String(a.f.createdAt)))[0];
    if (!draw) { semNotif++; continue; }

    const uRes = await fetch(`${BASE}/users/${uid}`, { headers: H });
    if (!uRes.ok) { semEmail++; continue; }
    const pf = Object.fromEntries(Object.entries((await uRes.json()).fields || {}).map(([k, v]) => [k, fromF(v)]));
    if (pf.notifyEmail === false) { optout++; continue; }
    if (!levelAllowed(pf.notifyLevel, 'fundamental')) { nivel++; continue; }
    const ems = [pf.email].concat(Array.isArray(pf.linkedEmails) ? pf.linkedEmails : [])
      .map((e) => String(e || '').trim().toLowerCase()).filter(Boolean);
    if (!ems.length) { semEmail++; continue; }
    ems.forEach((email) => alvos.push({ uid, email, msg: String(draw.f.message || '') }));
  }

  // dedup por endereço (a mesma pessoa pode aparecer por 2 uids numa dupla)
  const seen = new Set();
  let fila = alvos.filter((a) => { if (seen.has(a.email)) return false; seen.add(a.email); return !!a.msg; });
  if (ONLY) fila = fila.filter((a) => a.email === ONLY);

  console.log(`\ndestinatários: ${fila.length}`);
  console.log(`descartados → sem notificação do sorteio: ${semNotif} · opt-out de e-mail: ${optout} · nível: ${nivel} · sem e-mail: ${semEmail}`);
  console.log(`\nexemplo (${fila[0] ? fila[0].email : '—'}):\n${fila[0] ? fila[0].msg.slice(0, 220) : ''}\n`);
  if (!APPLY) { console.log('DRY-RUN — nada enfileirado. Rode com --apply pra valer.'); return; }

  // 3) idempotência: quem já tem item na fila com esta chave não entra de novo
  const resendKey = 'resend-draw-' + TID;
  const qRes = await fetch(`${BASE}:runQuery`, {
    method: 'POST', headers: J,
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'notif_email_queue' }], limit: 1000 } })
  });
  const jaNaFila = new Set();
  (await qRes.json()).forEach((r) => {
    if (!r.document) return;
    const f = r.document.fields || {};
    if (fromF(f.resendKey) === resendKey) jaNaFila.add(fromF(f.email));
  });
  if (jaNaFila.size) console.log(`já na fila com esta chave (pulados): ${jaNaFila.size}`);

  const now = Date.now();
  let n = 0, erros = 0;
  for (const a of fila) {
    if (jaNaFila.has(a.email)) continue;
    const body = {
      fields: toF({
        email: a.email,
        level: 'fundamental',
        message: a.msg,
        tournamentName: t.name || '',
        tournamentUrl: 'https://scoreplace.app/#tournaments/' + TID,
        ctaLabel: 'Ver chave',
        ctaUrl: 'https://scoreplace.app/#bracket/' + TID,
        createdAt: now,
        flushAtMs: now,          // já vencido: sai no próximo flush (a cada 5 min)
        resendKey: resendKey
      }).mapValue.fields
    };
    const r = await fetch(`${BASE}/notif_email_queue`, { method: 'POST', headers: J, body: JSON.stringify(body) });
    if (r.ok) n++; else { erros++; console.error('  ✗', a.email, r.status, (await r.text()).slice(0, 120)); }
  }
  console.log(`\n✅ enfileirados: ${n}${erros ? ` · erros: ${erros}` : ''}`);
  console.log('O envio em si é da CF flushNotifEmailDigest (a cada 5 min), um e-mail consolidado por pessoa.');
})();
