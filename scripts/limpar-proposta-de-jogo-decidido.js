#!/usr/bin/env node
/* LIMPAR PROPOSTA PENDENTE DE JOGO JÁ DECIDIDO  (2.1.36)
 *
 *   node scripts/limpar-proposta-de-jogo-decidido.js            → ENSAIO (não grava)
 *   node scripts/limpar-proposta-de-jogo-decidido.js --aplicar
 *   node scripts/limpar-proposta-de-jogo-decidido.js <tId> --aplicar
 *
 * POR QUE EXISTE. Em 28/ago/2026 o dono relatou: "lancamos os jogos I2 ontem e agora
 * aparece apenas 1 preenchido". Medido: o subdoc de `results` do grupo V, jogos 1 e 2,
 * estava com `{scoreP1:null, scoreP2:null, winner:null, pendingResult:{...}}` enquanto a
 * subcoleção `matches` — a fonte de verdade — tinha o jogo DECIDIDO. A fusão de leitura
 * copiava os `null` por cima e zerava o placar na tela (o "0-0" do relato).
 *
 * O CÓDIGO JÁ FOI CORRIGIDO nas duas pontas (2.1.29 e 2.1.30): a leitura não deixa mais
 * proposta apagar resultado, e a escrita (agora da CF, dentro da transação do placar)
 * apaga o `pendingResult` quando o jogo tem resultado. ⛔ Mas o DADO já gravado não se
 * conserta sozinho: aqueles dois jogos seguem pedindo confirmação de algo já decidido.
 * Este rito é a limpeza única desse passivo.
 *
 * ⛔ A TRAVA QUE FAZ ISTO SER SEGURO: só age quando a PROPOSTA CONCORDA com o resultado
 * confirmado (mesmo vencedor e mesmo placar). Proposta que DIVERGE é uma disputa de
 * verdade — alguém lançou outro placar — e isso é decisão de gente, não de script: esses
 * casos são listados e deixados intactos.
 * ⛔ E ele só ESCREVE em `results`. A fonte de verdade (`matches`) não é tocada: o que se
 * faz aqui é o subdoc parar de contradizê-la.
 */
'use strict';
const path = require('path');
const { execSync } = require('child_process');

const APLICAR = process.argv.includes('--aplicar');
const SO_ESTE = process.argv.slice(2).find((a) => !a.startsWith('--')) || null;
const BASE = 'https://firestore.googleapis.com/v1/projects/scoreplace-app/databases/(default)/documents';
const tk = execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();

function f(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return parseInt(v.integerValue, 10);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(f);
  if ('mapValue' in v) { const o = {}; Object.entries(v.mapValue.fields || {}).forEach(([k, x]) => { o[k] = f(x); }); return o; }
  return null;
}
const d2o = (d) => { const o = {}; Object.entries((d && d.fields) || {}).forEach(([k, v]) => { o[k] = f(v); }); return o; };

async function lista(url) {
  const out = []; let p = '';
  for (;;) {
    const r = await fetch(url + (url.includes('?') ? '&' : '?') + 'pageSize=300' + (p ? '&pageToken=' + p : ''),
      { headers: { Authorization: 'Bearer ' + tk } });
    if (!r.ok) { if (r.status === 404) return out; throw new Error(r.status + ' ' + url); }
    const j = await r.json();
    (j.documents || []).forEach((d) => out.push({ _id: d.name.split('/').pop(), ...d2o(d) }));
    if (!j.nextPageToken) break; p = j.nextPageToken;
  }
  return out;
}

const decidido = (x) => !!x && ((x.winner != null && x.winner !== '') || x.draw === true || x.wo != null);
const mesmoPlacar = (a, b) => String(a.scoreP1) === String(b.scoreP1) && String(a.scoreP2) === String(b.scoreP2);

(async () => {
  console.log('▶ proposta pendente em jogo JÁ DECIDIDO' + (APLICAR ? '  (APLICANDO)' : '  (ensaio — nada é gravado)') + '\n');
  let ids = [];
  if (SO_ESTE) ids = [SO_ESTE];
  else {
    let p = '';
    for (;;) {
      const r = await fetch(BASE + '/tournaments?pageSize=300' + (p ? '&pageToken=' + p : ''), { headers: { Authorization: 'Bearer ' + tk } });
      const j = await r.json();
      (j.documents || []).forEach((d) => ids.push(d.name.split('/').pop()));
      if (!j.nextPageToken) break; p = j.nextPageToken;
    }
  }

  let limpos = 0, divergentes = 0, torneios = 0;
  for (const tid of ids) {
    const matches = await lista(BASE + '/tournaments/' + tid + '/matches');
    const results = await lista(BASE + '/tournaments/' + tid + '/results');
    if (!results.length) continue;
    const M = {}; matches.forEach((m) => { if (m.jogo && m.jogo.id != null) M[String(m.jogo.id)] = m.jogo; });
    const alvos = [];
    for (const res of results) {
      if (!res.pendingResult) continue;          // sem proposta: nada a fazer
      const jogo = M[res._id];
      if (!decidido(jogo)) continue;             // jogo não decidido: a proposta é legítima
      const pr = res.pendingResult;
      const concorda = String(pr.winner || '') === String(jogo.winner || '') && mesmoPlacar(pr, jogo);
      if (!concorda) {
        divergentes++;
        console.log('  ⚠️  DIVERGE (deixado intacto): ' + tid + '/' + res._id +
          '\n        confirmado: ' + jogo.winner + '  ' + jogo.scoreP1 + 'x' + jogo.scoreP2 +
          '\n        proposta  : ' + pr.winner + '  ' + pr.scoreP1 + 'x' + pr.scoreP2 +
          '  (por ' + (pr.proposedByName || pr.proposedBy) + ')');
        continue;
      }
      alvos.push({ id: res._id, jogo: jogo, label: jogo.label || res._id, por: pr.proposedByName || pr.proposedBy });
    }
    if (!alvos.length) continue;
    torneios++;
    console.log('  ═══ ' + tid);
    for (const a of alvos) {
      console.log('     · ' + a.label + '  →  ' + a.jogo.winner + '  ' + a.jogo.scoreP1 + 'x' + a.jogo.scoreP2 +
        '   (proposta idêntica, de ' + a.por + ')');
      if (!APLICAR) { limpos++; continue; }
      /* PATCH com máscara: escreve os campos do resultado e REMOVE `pendingResult`.
       * A máscara nomeia `pendingResult` sem que ele venha no corpo — é assim que o
       * Firestore apaga um campo por REST. Os demais campos do subdoc (playerUids,
       * replay, tournamentName…) não estão na máscara e sobrevivem intactos. */
      const campos = ['winner', 'scoreP1', 'scoreP2', 'sets', 'setsWonP1', 'setsWonP2',
        'totalGamesP1', 'totalGamesP2', 'draw', 'wo', 'woAbsent', 'woAbsentSide', 'resultAt'];
      const fields = {};
      const enc = (v) => {
        if (v === null || v === undefined) return { nullValue: null };
        if (typeof v === 'string') return { stringValue: v };
        if (typeof v === 'boolean') return { booleanValue: v };
        if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
        if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
        if (typeof v === 'object') { const o = {}; Object.entries(v).forEach(([k, x]) => { o[k] = enc(x); }); return { mapValue: { fields: o } }; }
        return { nullValue: null };
      };
      const mask = [];
      campos.forEach((k) => { if (a.jogo[k] !== undefined) { fields[k] = enc(a.jogo[k]); mask.push(k); } });
      mask.push('pendingResult');   // na máscara e FORA do corpo ⇒ apagado
      fields.updatedAt = enc(new Date().toISOString()); mask.push('updatedAt');
      const url = BASE + '/tournaments/' + tid + '/results/' + a.id +
        '?' + mask.map((k) => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
      const r = await fetch(url, { method: 'PATCH', headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
      if (!r.ok) { console.log('       ✗ FALHOU: ' + r.status + ' ' + (await r.text()).slice(0, 200)); continue; }
      limpos++;
    }
  }

  console.log('\n' + (APLICAR ? '✓ ' + limpos + ' proposta(s) limpa(s)' : '(ensaio) ' + limpos + ' proposta(s) seriam limpas') +
    ' em ' + torneios + ' torneio(s)' + (divergentes ? '  ·  ⚠️ ' + divergentes + ' DIVERGENTE(S) deixada(s) pra decisão humana' : ''));
  if (!APLICAR && limpos) console.log('   rode com --aplicar pra gravar');
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
