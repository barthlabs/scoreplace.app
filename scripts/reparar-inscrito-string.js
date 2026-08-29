#!/usr/bin/env node
/* REPARA INSCRITO GRAVADO COMO STRING  (2.1.41)
 *
 *   node scripts/reparar-inscrito-string.js <tId>            → ENSAIO (não grava)
 *   node scripts/reparar-inscrito-string.js <tId> --aplicar
 *
 * POR QUE EXISTE. Em 28/ago/2026 o dono relatou duas coisas que eram o MESMO defeito:
 * _"ao formar a dupla isso se inverteu. e ao desformar, cagou a numeração"_ e _"removi e
 * ele voltou"_. Medido no banco: entradas de roster gravadas como STRING (`"Jogador 01"`)
 * em vez de objeto — foi assim que `computeSplitPair` devolvia quem não tem conta.
 * String não guarda campo: o nº de inscrição morre; e `chaveDoInscrito` devolvia a
 * constante `'x'` pra qualquer string, então DUAS delas viravam o MESMO doc da subcoleção
 * `inscritos` (7 docs pra 8 inscritos) — apagar um trazia o outro de volta.
 *
 * O CÓDIGO JÁ FOI CORRIGIDO (2.1.41) nas duas pontas. ⛔ Mas o dado já gravado não se
 * conserta sozinho. Este rito é a limpeza dele.
 *
 * ⛔ AS TRAVAS QUE FAZEM ISTO SER SEGURO:
 *   · só toca ENTRADAS QUE SÃO STRING. Objeto não é lido nem reescrito.
 *   · o nº de inscrição de quem JÁ TEM um é preservado, sempre.
 *   · a string só recebe número quando o nome dela diz a ordem sem ambiguidade
 *     (`Jogador NN` / `Vaga NN`); fora disso ela vira objeto SEM número e o rank denso
 *     resolve (`_ensureEnrollSeqs` aloca no fim, que é o cânone pra quem não tem).
 *   · as chaves da subcoleção saem do MÓDULO REAL (`dividir`), nunca reimplementadas aqui.
 *   · doc órfão só é apagado se a chave dele não existe mais no conjunto novo.
 */
'use strict';
const path = require('path');
const { execSync } = require('child_process');
const S = require(path.join(__dirname, '..', 'functions', 'vendor', 'tournament-split-core.js'));

const ARGS = process.argv.slice(2);
const APLICAR = ARGS.includes('--aplicar');
const TID = ARGS.find((a) => !a.startsWith('--'));
if (!TID) { console.error('✗ uso: node scripts/reparar-inscrito-string.js <tId> [--aplicar]'); process.exit(1); }

const BASE = 'https://firestore.googleapis.com/v1/projects/scoreplace-app/databases/(default)/documents';
const tk = execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();
const H = { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' };

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
function enc(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  if (typeof v === 'object') { const o = {}; Object.entries(v).forEach(([k, x]) => { o[k] = enc(x); }); return { mapValue: { fields: o } }; }
  return { nullValue: null };
}

/* Ordem só quando o NOME a diz: "Jogador 07" → 7. É a vaga que o organizador cria em
 * série, e o número dela É a ordem de criação. Qualquer outro nome devolve null — e aí
 * a entrada vira objeto SEM número, que o rank denso resolve. Não se inventa ordem. */
function ordemPeloNome(nm) {
  const m = String(nm || '').trim().match(/^(?:jogador|vaga|player)\s*0*(\d{1,3})$/i);
  return m ? parseInt(m[1], 10) : null;
}

(async () => {
  console.log('▶ inscrito gravado como STRING — ' + TID + (APLICAR ? '  (APLICANDO)' : '  (ensaio — nada é gravado)') + '\n');

  const doc = await (await fetch(BASE + '/tournaments/' + TID, { headers: H })).json();
  if (!doc.fields) { console.error('✗ torneio não encontrado'); process.exit(1); }
  const parts = f(doc.fields.participants) || [];
  const strings = parts.filter((p) => typeof p === 'string');
  /* SEM NÚMERO também é estrago do mesmo defeito: quem entrou numa dupla sem `enrollSeq`
   * gravado sai dela sem número, e o rank denso o joga pro FIM — o "voltou como inscrito
   * 8" do relato. A partir da 2.1.41 a CF faz o backfill antes de formar; o que já está
   * gravado é este rito que conserta. */
  const semNum = parts.filter((p) => p && typeof p === 'object' && p.enrollSeq == null &&
    !((p.p1Uid || p.p1Name) && (p.p2Uid || p.p2Name)));
  const _toChk = f(doc.fields.teamOrigins) || {};
  const _temDupla = parts.some((p) => p && typeof p === 'object' && (p.p1Uid || p.p1Name) && (p.p2Uid || p.p2Name));
  const _toSuspeito = Object.keys(_toChk).length > 0 && !_temDupla;
  if (!strings.length && !semNum.length && !_toSuspeito) { console.log('✓ nada a consertar'); return; }

  if (strings.length) console.log('  ' + strings.length + ' de ' + parts.length + ' entrada(s) em string: ' + JSON.stringify(strings));
  if (semNum.length) console.log('  ' + semNum.length + ' sem nº de inscrição: ' +
    JSON.stringify(semNum.map((p) => p.displayName || p.name)));
  console.log('');

  // ── ① string vira objeto. Objeto existente NÃO é tocado. ────────────────────────
  const novos = parts.map((p) => {
    if (typeof p !== 'string') return p;
    const nm = p.trim();
    const o = { name: nm, displayName: nm, isPlaceholder: true };
    const ord = ordemPeloNome(nm);
    if (ord != null) o.enrollSeq = ord;
    return o;
  });

  /* ── SÉRIE COMPLETA: quando TODOS os inscritos são vagas em série (`Jogador NN`) e os
   * números que os nomes ditam formam um conjunto SEM repetição, o nome é a ordem de
   * criação e não há nada a interpretar. Aqui a renumeração é TOTAL — inclusive dos
   * objetos —, porque a sequência gravada já está corrompida pelo próprio defeito: no
   * torneio do relato o "Jogador 03" carregava o nº 1, herdado quando os dois primeiros
   * viraram string e sumiram da fila. Sem isto o reparo deixaria o 01 e o 02 no FIM, que
   * é justamente o que o dono reclamou.
   * ⛔ FORA dessa condição nada disso acontece: objeto não é tocado e a string só recebe
   * número se ele estiver livre. Não se renumera torneio de gente. */
  const ordens = novos.map((p) => ordemPeloNome(p && (p.name || p.displayName)));
  const serieCompleta = ordens.length > 1 && ordens.every((o) => o != null) &&
    new Set(ordens).size === ordens.length;
  if (serieCompleta) {
    console.log('  ⭐ SÉRIE COMPLETA: todos os ' + novos.length + ' inscritos são vagas numeradas —');
    console.log('     o nome É a ordem de criação, então a numeração toda volta pro nome.');
    novos.forEach((p, i) => {
      const antes = (parts[i] && typeof parts[i] === 'object') ? parts[i].enrollSeq : null;
      p.enrollSeq = ordens[i];
      if (antes != null && antes !== ordens[i]) console.log('     · ' + p.name + ': nº ' + antes + ' → ' + ordens[i]);
    });
  }

  // ⚠️ colisão: se o número que o nome dita já é de OUTRA entrada, não se força — a
  // string fica sem número e o rank denso a coloca no fim. Melhor sem número que
  // roubando o de alguém.
  const usados = {};
  novos.forEach((p, i) => { if (p && typeof p === 'object' && p.enrollSeq != null && typeof parts[i] !== 'string') usados[p.enrollSeq] = i; });
  novos.forEach((p, i) => {
    if (serieCompleta) return;
    if (typeof parts[i] !== 'string' || !p.enrollSeq) return;
    if (usados[p.enrollSeq] != null) {
      console.log('  ⚠️  "' + p.name + '": o nº ' + p.enrollSeq + ' já é de outra entrada — fica SEM número (o rank o põe no fim)');
      delete p.enrollSeq;
    } else usados[p.enrollSeq] = i;
  });

  novos.forEach((p, i) => {
    if (typeof parts[i] !== 'string') return;
    console.log('  · "' + parts[i] + '"  →  objeto' + (p.enrollSeq != null ? '  nº ' + p.enrollSeq : '  (sem nº)'));
  });
  /* quem ficou sem número FORA da série completa entra no FIM (max+1) — o cânone: novo
   * nunca preenche vago de quem saiu, senão passa na frente de quem chegou antes. */
  if (!serieCompleta) {
    let max = 0;
    novos.forEach((p) => { if (p && typeof p === 'object' && p.enrollSeq != null && p.enrollSeq > max) max = p.enrollSeq; });
    novos.forEach((p) => {
      if (!p || typeof p !== 'object' || p.enrollSeq != null) return;
      if ((p.p1Uid || p.p1Name) && (p.p2Uid || p.p2Name)) return;
      p.enrollSeq = ++max;
      console.log('  · "' + (p.displayName || p.name) + '" estava SEM nº → ' + p.enrollSeq + ' (fim da fila)');
    });
  }

  // ── ② as chaves da subcoleção saem do MÓDULO REAL ──────────────────────────────
  const regsAntes = S.dividir({ id: TID, participants: parts }, ['participants']).participants || [];
  const regsDepois = S.dividir({ id: TID, participants: novos }, ['participants']).participants || [];
  const kAntes = regsAntes.map((r) => r._k);
  const kDepois = regsDepois.map((r) => r._k);
  console.log('\n  chaves ANTES : ' + JSON.stringify(kAntes) + '  (distintas: ' + new Set(kAntes).size + ')');
  console.log('  chaves DEPOIS: ' + JSON.stringify(kDepois) + '  (distintas: ' + new Set(kDepois).size + ')');
  if (new Set(kDepois).size !== kDepois.length) { console.error('\n✗ ABORTADO: as chaves novas ainda colidem'); process.exit(1); }

  /* ── DUPLA FANTASMA no `teamOrigins` ────────────────────────────────────────────
   * O mapa registra "A / B" → 'formada'. Quando a dupla é desfeita, a marca ficava (a CF
   * só passou a apagá-la na 2.1.41). Registro de dupla que não existe é mentira guardada
   * — e como o mapa é chaveado por NOME, ele casa com qualquer dupla futura de mesmo nome
   * e a marca como formada sem que ninguém tenha formado.
   * ⛔ TRAVA: só sai a chave que NÃO tem dupla correspondente no elenco de agora. */
  const toAntes = f(doc.fields.teamOrigins) || {};
  const duplasVivas = {};
  novos.forEach((p) => {
    if (!p || typeof p !== 'object') return;
    if (!((p.p1Uid || p.p1Name) && (p.p2Uid || p.p2Name))) return;
    [p.displayName, p.name, (p.p1Name || '') + ' / ' + (p.p2Name || '')].forEach((k) => { if (k) duplasVivas[k] = 1; });
  });
  const toNovo = {}; const fantasmas = [];
  Object.keys(toAntes).forEach((k) => { if (duplasVivas[k]) toNovo[k] = toAntes[k]; else fantasmas.push(k); });
  const toLimpo = fantasmas.length > 0;
  if (toLimpo) console.log('\n  teamOrigins — dupla(s) fantasma a remover: ' + JSON.stringify(fantasmas));

  const sub = await (await fetch(BASE + '/tournaments/' + TID + '/inscritos?pageSize=300', { headers: H })).json();
  const existentes = (sub.documents || []).map((d) => d.name.split('/').pop());
  const orfaos = existentes.filter((id) => kDepois.indexOf(id) === -1);
  console.log('  subcoleção: ' + existentes.length + ' doc(s) pra ' + parts.length + ' inscrito(s)' +
              (orfaos.length ? '  ·  órfãos a apagar: ' + JSON.stringify(orfaos) : ''));

  if (!APLICAR) { console.log('\n(ensaio) rode com --aplicar pra gravar'); return; }

  // ③ o documento (+ teamOrigins, se houver dupla fantasma)
  const campos = { participants: enc(novos) };
  let mask = 'updateMask.fieldPaths=participants';
  if (toLimpo) { campos.teamOrigins = enc(toNovo); mask += '&updateMask.fieldPaths=teamOrigins'; }
  let r = await fetch(BASE + '/tournaments/' + TID + '?' + mask,
    { method: 'PATCH', headers: H, body: JSON.stringify({ fields: campos }) });
  if (!r.ok) { console.error('✗ doc: ' + r.status + ' ' + (await r.text()).slice(0, 300)); process.exit(1); }
  console.log('\n  ✓ documento gravado');

  // ④ a subcoleção — um doc por inscrito, com a chave certa
  for (const reg of regsDepois) {
    const body = { fields: { _k: enc(reg._k), _idx: enc(reg._idx), item: enc(reg.item) } };
    r = await fetch(BASE + '/tournaments/' + TID + '/inscritos/' + encodeURIComponent(reg._k),
      { method: 'PATCH', headers: H, body: JSON.stringify(body) });
    if (!r.ok) { console.error('  ✗ ' + reg._k + ': ' + r.status + ' ' + (await r.text()).slice(0, 200)); continue; }
  }
  console.log('  ✓ ' + regsDepois.length + ' inscrito(s) na subcoleção');

  for (const id of orfaos) {
    r = await fetch(BASE + '/tournaments/' + TID + '/inscritos/' + encodeURIComponent(id), { method: 'DELETE', headers: H });
    console.log(r.ok ? '  ✓ órfão apagado: ' + id : '  ✗ órfão ' + id + ': ' + r.status);
  }

  const dep = await (await fetch(BASE + '/tournaments/' + TID + '/inscritos?pageSize=300', { headers: H })).json();
  console.log('\n✓ CONFERÊNCIA: ' + (dep.documents || []).length + ' doc(s) pra ' + novos.length + ' inscrito(s)');
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
