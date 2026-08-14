#!/usr/bin/env node
/* Baixa os torneios REAIS de produção pra tests/fixtures/prod-tournaments.json.
 *
 * Serve ao golden master do motor (tests/motor-golden-master.js): refatorar o motor sem
 * mudar o que já existe só é PROVÁVEL contra os documentos de verdade — fixture inventada
 * não tem os casos que a base tem (dupla sem uid, folga legada, grupo sem categoria,
 * placar em formato antigo…).
 *
 * Uso:  node scripts/baixar-torneios.js
 * Requer: gcloud auth print-access-token (leitura; NÃO escreve nada em produção).
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');

const OUT = path.join(__dirname, '..', 'tests', 'fixtures', 'prod-tournaments.json');
const PROJ = 'scoreplace-app';

function token() {
  try { return execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim(); }
  catch (e) { console.error('✗ sem token do gcloud:', e.message); process.exit(1); }
}
function get(url, tk) {
  return new Promise(function (res, rej) {
    https.get(url, { headers: { Authorization: 'Bearer ' + tk } }, function (r) {
      let b = ''; r.on('data', function (c) { b += c; });
      r.on('end', function () { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
    }).on('error', rej);
  });
}
// Firestore REST → objeto JS puro
function un(v) {
  if (!v || typeof v !== 'object') return v;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('mapValue' in v) { const o = {}; const f = v.mapValue.fields || {}; Object.keys(f).forEach(function (k) { o[k] = un(f[k]); }); return o; }
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(un);
  return v;
}

(async function () {
  const tk = token();
  let url = 'https://firestore.googleapis.com/v1/projects/' + PROJ + '/databases/(default)/documents/tournaments?pageSize=100';
  const out = [];
  for (;;) {
    const d = await get(url, tk);
    (d.documents || []).forEach(function (doc) {
      const o = {}; const f = doc.fields || {};
      Object.keys(f).forEach(function (k) { o[k] = un(f[k]); });
      if (!o.id) o.id = doc.name.split('/').pop();
      out.push(o);
    });
    if (!d.nextPageToken) break;
    url = url.split('&pageToken=')[0] + '&pageToken=' + encodeURIComponent(d.nextPageToken);
  }
  // ── ANONIMIZA ANTES DE GRAVAR ────────────────────────────────────────────────
  // Este repositório é PÚBLICO e o doc de produção traz e-mail e nome de gente real
  // (medido: 73 e-mails). A fixture só pode existir aqui se não carregar isso. O que
  // o motor precisa é da ESTRUTURA e da IDENTIDADE (uid) — o texto do nome é
  // irrelevante pra ele, então trocar por sintético não enfraquece o teste.
  // Determinístico: o MESMO nome vira sempre a MESMA pessoa sintética, senão o golden
  // mudaria a cada download.
  const mapa = new Map();
  let seq = 0;
  const sintetico = (real) => {
    if (mapa.has(real)) return mapa.get(real);
    const v = 'Pessoa ' + (++seq);
    mapa.set(real, v);
    return v;
  };
  // 1ª passada: junta todo nome de pessoa que aparece no doc (na ORDEM em que aparece,
  // pra a numeração ser estável entre execuções).
  const colhe = (n) => {
    if (typeof n !== 'string') return;
    const s = n.trim();
    if (!s || s === 'TBD' || s === 'BYE' || s === 'FOLGA' || s === 'W.O.') return;
    // dupla é tipografia ("A / B"): cada lado é uma pessoa
    s.split(' / ').forEach((x) => { const y = x.trim(); if (y) sintetico(y); });
  };
  const varre = (node) => {
    if (Array.isArray(node)) return node.forEach(varre);
    if (!node || typeof node !== 'object') return;
    ['displayName', 'name', 'p1', 'p2', 'p1Name', 'p2Name', 'winner', 'absentName',
     'subName', 'byName', 'proposedByName'].forEach((k) => colhe(node[k]));
    ['team1', 'team2', 'players', 'participants'].forEach((k) => {
      if (Array.isArray(node[k])) node[k].forEach((x) => { if (typeof x === 'string') colhe(x); });
    });
    Object.keys(node).forEach((k) => { if (k !== 'name' || typeof node[k] === 'object') varre(node[k]); });
  };
  out.forEach((t) => { const nomeT = t.name; varre(t); t.name = nomeT; }); // nome do TORNEIO fica
  // 2ª passada: substitui em QUALQUER string, inclusive dentro de "A / B" e de winner.
  const troca = (s) => {
    if (typeof s !== 'string') return s;
    if (s.indexOf(' / ') !== -1) return s.split(' / ').map((x) => mapa.get(x.trim()) || x).join(' / ');
    return mapa.get(s.trim()) || s;
  };
  // UMA função pra toda string, usada nos DOIS ramos (objeto e array). Antes o ramo de
  // ARRAY só trocava nome — e-mail dentro de `memberEmails[]` passava batido: a auditoria
  // pegou 5 endereços reais sobrevivendo. Uma regra em dois lugares diverge sempre.
  // ⚠️ UID TAMBÉM É PSEUDONIMIZADO. O uid do Firebase é um identificador ESTÁVEL de uma
  // pessoa — publicá-lo num repositório PÚBLICO é expor identidade, mesmo sem nome junto.
  // O motor não precisa que ele seja o real: precisa que seja DISTINTO e CONSISTENTE (é
  // por uid que ele casa jogador, dupla, elenco e classificação). O prefixo `jog_` é
  // PRESERVADO porque o app o usa pra reconhecer jogador FICTÍCIO (sem conta).
  const uids = new Map();
  let useq = 0;
  const pseudoUid = (u) => {
    if (typeof u !== 'string' || !u) return u;
    if (uids.has(u)) return uids.get(u);
    const v = (u.indexOf('jog_') === 0 ? 'jog_' : '') + 'uid' + String(++useq).padStart(4, '0');
    uids.set(u, v);
    return v;
  };
  // ⚠️ POR FORMATO, NUNCA POR LISTA DE CAMPOS. A 1ª versão listava as chaves conhecidas
  // (`uid`, `p1Uid`, `team1Uids`…) e a auditoria encontrou 601 uids reais sobrevivendo em
  // campos fora da lista — a mesma armadilha do `_repairTournaments`: lista à mão sempre
  // esquece um. Uid do Firebase é 26–32 alfanuméricos SEM hífen/underscore; os ids do app
  // (`match-…`, `tour_…`) têm separador e por isso não casam.
  const PARECE_UID = /^[A-Za-z0-9]{26,32}$/;
  // ⚠️ E TAMBÉM DENTRO da string. Os uids não aparecem só sozinhos: o histórico de
  // confrontos usa CHAVE COMPOSTA (`uid:AAA|||uid:BBB`), e a auditoria pegou 591 uids
  // reais sobrevivendo exatamente aí depois de eu só testar a string inteira. Substituir
  // por TOKEN cobre os dois casos e qualquer formato composto que venha a existir.
  // Pula base64/dataURI (logo do torneio): lá não há uid e mexer corromperia a imagem.
  const trocaUidsEm = (str) => {
    if (typeof str !== 'string' || str.length > 300 || str.indexOf('data:') === 0) return str;
    return str.replace(/[A-Za-z0-9]{26,32}/g, (m) => (/^uid\d+$/.test(m) ? m : pseudoUid(m)));
  };

  const limpaString = (k, v) => {
    if (PARECE_UID.test(v)) return pseudoUid(v);
    const comToken = trocaUidsEm(v);
    if (comToken !== v) return comToken;
    if (/@/.test(v)) return 'pessoa' + (Math.abs(hash(v)) % 9999) + '@exemplo.test';
    if (/^\+?\d[\d\s()-]{7,}$/.test(v)) return '';                       // telefone some
    if (k === 'id' || k === 'uid' || k === 'name') return v;               // identidade fica
    return troca(v);
  };
  const aplica = (node) => {
    if (Array.isArray(node)) return node.forEach((x, i) => {
      if (typeof x === 'string') node[i] = limpaString(null, x); else aplica(x);
    });
    if (!node || typeof node !== 'object') return;
    Object.keys(node).forEach((k) => {
      const v = node[k];
      if (typeof v === 'string') node[k] = limpaString(k, v);
      else aplica(v);
      // mapa chaveado por uid (checkedIn, confirms, sitOutHistory…): a CHAVE também é identidade
      const kNovo = PARECE_UID.test(k) ? pseudoUid(k) : trocaUidsEm(k);
      if (kNovo !== k) { node[kNovo] = node[k]; delete node[k]; }
    });
  };
  function hash(str) { let h = 0; for (let i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; } return h; }
  out.forEach((t) => { const nomeT = t.name, idT = t.id; aplica(t); t.name = nomeT; t.id = idT; });

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log('   (anonimizado: ' + mapa.size + ' pessoas → "Pessoa N", ' + uids.size + ' uids → uidNNNN, e-mails → @exemplo.test)');
  console.log('✅ ' + out.length + ' torneios → ' + path.relative(process.cwd(), OUT) +
    ' (' + (fs.statSync(OUT).size / 1024).toFixed(0) + ' KB)');
  out.forEach(function (t) {
    const rd = (t.rounds || []).length, ms = (t.matches || []).length;
    console.log('   • ' + String(t.name || t.id).slice(0, 44).padEnd(46) +
      t.format + ' | ' + t.status + ' | rounds=' + rd + ' matches=' + ms +
      ' inscritos=' + ((t.participants || []).length));
  });
})();
