/* TROCA MANUAL — Grupo D do Confra: Vivian (não jogou) → Jogador X (coringa que cobriu)
 *
 * Ordem do dono (26/ago/2026): _"no grupo D temos ajustes manuais para fazer. Vivian nao
 * jogou. Jogador X jogou no lugar dela. troque nos jogos e nas estatisticas a Vivian por
 * jogador x"_ + _"na classificacao, coloque o jogador x em 5o, vivian em 4o, Fernando em
 * 3o, Zilda em 2o, mantendo a rostanda em 1o"_ + _"o jogador x cobriu um buraco e nao
 * segue nem pontua"_ + _"caso isolado"_.
 *
 * ⛔ POR QUE ISTO É UM SCRIPT E NÃO O BOTÃO DO APP: a rota canônica (`_rewriteSlot`,
 * js/views/liga-substitution.js) tem o guard `_jogoJaTemPlacar` — jogo com placar NÃO se
 * renomeia. Esse guard nasceu da ordem do dono de 22/ago: _"a pessoa que sai mantém o que
 * fez e a que entra herda a posição. nenhum placar alterado ou apagado. SEMPRE."_ — escrita
 * depois de um W.O. num grupo já jogado ter zerado três placares do R1 Grupo M.
 *
 * A EXCEÇÃO, e o que a torna legítima: o guard protege o PASSADO DE QUEM JOGOU. Aqui a
 * Vivian NÃO jogou — quem jogou foi o Jogador X. Renomear o slot faz o registro apontar
 * pra quem de fato esteve em quadra. O princípio é o mesmo; só a premissa é outra.
 *
 * ⛔ E A LIÇÃO DAQUELE INCIDENTE FICA: este script RENOMEIA E SÓ. Não encosta em
 * `scoreP1`, `scoreP2`, `winner` numérico, `sets`, `setsWon*`, `totalGames*`, `resultAt`
 * nem `startedAt`. O `winner`/`p1`/`p2` são strings de NOME e são reescritas — trocar o
 * rótulo não é trocar o resultado.
 *
 * ⭐ JOGADOR X É FICTÍCIO: não tem uid. [[feedback_uid_controls_everything_name_only_ficticio]]
 * — "a única situação que pode ser por nome é o participante fictício digitado pelo
 * organizador". Então o slot fica com o NOME e o uid vira null, exatamente como o
 * `_rewriteSlot` faz quando o substituto é convidado sem conta (`_toUid = null`).
 *
 * Uso:  node scripts/trocar-vivian-por-jogador-x-grupo-d.js           (ENSAIO, não grava)
 *       node scripts/trocar-vivian-por-jogador-x-grupo-d.js --apply   (grava)
 */
'use strict';
const { execSync } = require('child_process');

const APPLY = process.argv.includes('--apply');
const ID = 'tour_1780009816637';
const BASE = 'https://firestore.googleapis.com/v1/projects/scoreplace-app/databases/(default)/documents';
const token = () => execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();
const H = () => ({ Authorization: 'Bearer ' + token() });

const DE = 'Vivian';
const PARA = 'Jogador X';
const UID_VIVIAN = 'WOwzuvwAf9e8ZmZY1RoGosO9x6c2';
const JOGOS = [
  'match-rr-r1-g3-0-1785708005103', // jogo 10
  'match-rr-r1-g3-1-1785708005103', // jogo 11
  'match-rr-r1-g3-2-1785708005103', // jogo 12
];
/* Ordem ditada pelo dono. O Jogador X vai por ÚLTIMO de propósito: cobriu buraco, não
 * pontua e não avança. A Vivian fica na tabela (4ª) porque o rastro de quem saiu não
 * some — foi exigência dos participantes do grupo.
 *
 * ⛔ O FORMATO NÃO É LISTA DE NOMES — é `[{name, uid}]`. Conferido no dado REAL (24 dos 35
 * grupos do Confra já congelados; ex. R1 Grupo B). Gravar strings faria o leitor não casar
 * ninguém e o grupo inteiro cairia pro fim da tabela (ordem 9999) — o erro do "congelador
 * cego". [[feedback_congelador_cego_procurava_o_jogo_no_escopo_errado]]
 * Jogador X é fictício: `uid: null`, casa pelo nome. */
const UIDS = {
  'Rostanda': 'M7fdUxce2wTrpSYB0XKc8YjBuMj1',
  'Zilda Quintas': 'fuQ4MbHS03eI1G4yCk4WoDwKLTD2',
  'Fernando Bernacchi': 'XqOVCgyAWOatjMmIXggibbP0x022',
  [DE]: UID_VIVIAN,
  [PARA]: null,
};
const ORDEM = ['Rostanda', 'Zilda Quintas', 'Fernando Bernacchi', DE, PARA]
  .map((n) => ({ name: n, uid: UIDS[n] || null }));

/* ── Firestore REST: valor → JS e JS → valor ──────────────────────────────── */
function plain(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(plain);
  if ('mapValue' in v) { const o = {}; Object.entries(v.mapValue.fields || {}).forEach(([k, x]) => { o[k] = plain(x); }); return o; }
  return null;
}
function fs_(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(fs_) } };
  if (typeof v === 'object') { const f = {}; Object.entries(v).forEach(([k, x]) => { f[k] = fs_(x); }); return { mapValue: { fields: f } }; }
  return { nullValue: null };
}

/* ⛔ CAMPOS DE RESULTADO — nenhum deles pode aparecer no diff. É a trava desta operação:
 * se o script tentar mexer em qualquer um, ele ABORTA em vez de gravar. */
const INTOCAVEIS = ['scoreP1', 'scoreP2', 'sets', 'setsWonP1', 'setsWonP2',
  'totalGamesP1', 'totalGamesP2', 'resultAt', 'startedAt', 'draw'];

/* Troca o nome no slot. Decide por UID quando o slot tem uid; por nome só quando não tem
 * — a régua do `_rewriteSlot`. O destino é fictício, então o uid do slot vira null. */
function trocaSlots(names, uids) {
  if (!Array.isArray(names)) return { names, uids, mexeu: 0 };
  let mexeu = 0;
  const out = names.map((n, i) => {
    const slotU = (Array.isArray(uids) && uids[i]) ? String(uids[i]) : '';
    const hit = slotU ? (slotU === UID_VIVIAN) : (n === DE);
    if (!hit) return n;
    mexeu++;
    if (Array.isArray(uids)) uids[i] = null;   // fictício: nome sem uid
    return PARA;
  });
  return { names: out, uids, mexeu };
}
const trocaTexto = (s) => (typeof s === 'string' && s.includes(DE)) ? s.split(DE).join(PARA) : s;

(async () => {
  console.log('▶ ' + (APPLY ? 'APLICANDO' : 'ENSAIO (não grava)') + ' — Grupo D: ' + DE + ' → ' + PARA + '\n');
  const h = H();
  let abortar = null;
  const escritas = [];

  /* ── 1. os três jogos ──────────────────────────────────────────────────── */
  for (const id of JOGOS) {
    const r = await fetch(BASE + '/tournaments/' + ID + '/matches/' + id, { headers: h });
    const raw = await r.json();
    if (raw.error) { console.log('  ✗ não li ' + id + ': ' + JSON.stringify(raw.error).slice(0, 160)); abortar = 'leitura'; continue; }
    const doc = plain({ mapValue: { fields: raw.fields || {} } });
    const j = doc.jogo || {};
    const antesJ = JSON.stringify(j);
    const num = j._gameNum;

    const t1 = trocaSlots(j.team1, j.team1Uids);
    const t2 = trocaSlots(j.team2, j.team2Uids);
    j.team1 = t1.names; j.team1Uids = t1.uids;
    j.team2 = t2.names; j.team2Uids = t2.uids;
    j.p1 = trocaTexto(j.p1); j.p2 = trocaTexto(j.p2);
    j.winner = trocaTexto(j.winner);
    if (Array.isArray(doc.playerUids)) doc.playerUids = doc.playerUids.filter((u) => u !== UID_VIVIAN);

    console.log('  jogo ' + num + ' (' + id.slice(0, 22) + ')');
    console.log('     time1: ' + JSON.stringify(j.team1) + '  uids ' + JSON.stringify(j.team1Uids));
    console.log('     time2: ' + JSON.stringify(j.team2) + '  uids ' + JSON.stringify(j.team2Uids));
    console.log('     vencedor: ' + j.winner + '   | placar INTOCADO: ' + j.scoreP1 + '-' + j.scoreP2);
    console.log('     slots trocados: ' + (t1.mexeu + t2.mexeu));

    /* trava: nenhum campo de resultado pode ter mudado */
    const jAntes = JSON.parse(antesJ);
    const feridos = INTOCAVEIS.filter((k) => JSON.stringify(jAntes[k]) !== JSON.stringify(j[k]));
    if (feridos.length) { console.log('     ⛔ ABORTA: mexeu em campo de resultado → ' + feridos.join(', ')); abortar = 'resultado'; }
    if (t1.mexeu + t2.mexeu !== 1) { console.log('     ⛔ ABORTA: esperado 1 slot por jogo, achei ' + (t1.mexeu + t2.mexeu)); abortar = 'slots'; }

    escritas.push({ path: '/tournaments/' + ID + '/matches/' + id, doc, updateTime: raw.updateTime });
  }

  /* ── 2. a classificação congelada do grupo ─────────────────────────────── */
  const rDoc = await fetch(BASE + '/tournaments/' + ID, { headers: h });
  const rawDoc = await rDoc.json();
  const t = plain({ mapValue: { fields: rawDoc.fields || {} } });
  const grupos = (t.rounds && t.rounds[0] && t.rounds[0].monarchGroups) || [];
  const g = grupos[3];   // g3 = Grupo D
  console.log('\n  GRUPO D (rounds[0].monarchGroups[3])');
  if (!g) { console.log('     ⛔ ABORTA: não achei o grupo'); abortar = 'grupo'; }
  else {
    console.log('     players ANTES : ' + JSON.stringify(g.players));
    console.log('     uids    ANTES : ' + JSON.stringify(g.playersUids));
    console.log('     congelada ANTES: ' + JSON.stringify(g.classifCongelada));
    const s = trocaSlots(g.players, g.playersUids);
    // o rastro de quem saiu NÃO some: a Vivian volta pra lista, sem jogos
    if (!s.names.includes(DE)) { s.names.push(DE); if (Array.isArray(g.playersUids)) g.playersUids.push(UID_VIVIAN); }
    g.players = s.names;
    g.classifCongelada = ORDEM.slice();
    console.log('     players DEPOIS: ' + JSON.stringify(g.players));
    console.log('     uids    DEPOIS: ' + JSON.stringify(g.playersUids));
    console.log('     CONGELADA     : ' + JSON.stringify(g.classifCongelada));
    escritas.push({ path: '/tournaments/' + ID, campo: 'rounds', valor: t.rounds, updateTime: rawDoc.updateTime });
  }

  if (abortar) { console.log('\n❌ ABORTADO (' + abortar + ') — nada foi gravado.'); process.exit(1); }
  if (!APPLY) { console.log('\n(ensaio — rode com --apply pra gravar)'); return; }

  /* ── 3. gravação, com precondição de updateTime em cada alvo ───────────── */
  for (const e of escritas) {
    let url, body;
    if (e.campo) {
      url = BASE + e.path + '?updateMask.fieldPaths=' + e.campo + '&updateMask.fieldPaths=updatedAt'
          + '&currentDocument.updateTime=' + encodeURIComponent(e.updateTime);
      body = { fields: { rounds: fs_(e.valor), updatedAt: fs_(new Date().toISOString()) } };
    } else {
      url = BASE + e.path + '?currentDocument.updateTime=' + encodeURIComponent(e.updateTime);
      const f = {}; Object.entries(e.doc).forEach(([k, v]) => { f[k] = fs_(v); });
      body = { fields: f };
    }
    const r = await fetch(url, { method: 'PATCH', headers: Object.assign({ 'Content-Type': 'application/json' }, H()), body: JSON.stringify(body) });
    const out = await r.json();
    console.log(out.error ? '  ✗ ' + e.path + ' → ' + JSON.stringify(out.error).slice(0, 200)
                          : '  ✓ gravado ' + e.path);
    if (out.error) process.exit(1);
  }
  console.log('\n✅ troca aplicada. Confira na tela do Grupo D.');
})().catch((e) => { console.error(e); process.exit(1); });
