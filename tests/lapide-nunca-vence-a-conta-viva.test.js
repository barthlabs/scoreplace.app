/* A LÁPIDE NUNCA VENCE A CONTA VIVA.
 *
 * A FALHA REAL (medida em 18/ago/2026, base de produção): a fusão de contas não apaga a
 * absorvida — grava uma LÁPIDE (`mergedInto` + `mergedAt`) no doc dela. A lápide fica com os
 * MESMOS dados de contato do sobrevivente. Caso na base: M. Delia Fernandez tem doc vivo
 * vfnXkEcUfGUH5MyhQRuOkuab9W02 e lápide FhL8w1Ym9eV3POBohF7hUlJMuX72, as DUAS com telefone
 * +5511996019191 (e a lápide ainda com o e-mail relay da Apple). São 13 lápides na base.
 *
 * Das 36 consultas amplas a collection('users') em js/, só 6 puravam lápide. As outras 30
 * buscavam por email / email_lower / phone / displayName / letzplayHandle e pegavam
 * `snap.docs[0]` — e todas RESOLVEM UMA PESSOA E AGEM SOBRE ELA: transferir organização,
 * convidar co-organizador, mandar aviso, casar conta no login. Agir sobre o uid morto é agir
 * sobre ninguém.
 *
 * Este teste tem duas metades, e as duas são necessárias:
 *   A) COMPORTAMENTO — roda o _userVivo REAL (js/views/user-vivo-core.js) contra um Firestore
 *      falso montado com o par vivo/lápide do caso real. Primeiro DEMONSTRA a falha (o padrão
 *      antigo, `snap.docs[0].id`, devolve o uid morto), depois cobra o resolvedor.
 *   B) INVARIANTE — varre js/ e cobra que TODA busca ampla em users/ por campo de identidade
 *      passe pela porta única. Sem isso, a 31ª consulta nasce quebrada e o teste fica verde.
 *      Isento se declarar `user-vivo:isento` no próprio código, com o motivo ao lado.
 *
 * node tests/lapide-nunca-vence-a-conta-viva.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

console.log('──── lápide nunca vence a conta viva ────');

// ── carrega o resolvedor REAL num contexto limpo (mesmo truque do tests/headless.js) ──
const sandbox = {};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.console = console;
sandbox._warn = function () {};
sandbox._log = function () {};
sandbox._error = function () {};
vm.createContext(sandbox);
const ARQ = path.join(__dirname, '..', 'js', 'views', 'user-vivo-core.js');
vm.runInContext(fs.readFileSync(ARQ, 'utf8'), sandbox, { filename: ARQ });
const W = sandbox;

ok(typeof W._userVivo === 'function', '_userVivo existe');

// ── Firestore falso: só o suficiente pra query snapshot / doc snapshot ──
// BASE = o par REAL da M. Delia: vivo e lápide com o MESMO telefone; a lápide ainda com o
// e-mail relay da Apple que a pessoa usou pra logar.
const VIVO = 'vfnXkEcUfGUH5MyhQRuOkuab9W02';
const LAPIDE = 'FhL8w1Ym9eV3POBohF7hUlJMuX72';
const BASE = {
  [VIVO]: { displayName: 'M. Delia Fernandez', phone: '+5511996019191', email_lower: 'delia@exemplo.com' },
  [LAPIDE]: { displayName: 'M. Delia Fernandez', phone: '+5511996019191',
              email_lower: 'delia@privaterelay.appleid.com', mergedInto: VIVO, mergedAt: '2026-07-01T00:00:00Z' },
};
let leituras = 0;
function leitor(base) {
  return function (uid) {
    leituras++;
    return Promise.resolve(base[uid] ? { uid: uid, data: base[uid], ref: { id: uid } } : null);
  };
}
// docs no formato do SDK compat (o que `.get()` devolve)
function docSnap(base, uid) {
  return { id: uid, exists: !!base[uid], data: () => base[uid] || null, ref: { id: uid } };
}
function querySnap(base, uids) {
  const docs = uids.map((u) => docSnap(base, u));
  return { empty: docs.length === 0, size: docs.length, docs: docs, forEach: (f) => docs.forEach(f) };
}

(async () => {
  // ── A1. A FALHA, reproduzida: busca por telefone que devolve a LÁPIDE primeiro ──
  // (o Firestore não promete ordem; na prática qualquer um dos dois pode vir na frente)
  const porTelefone = querySnap(BASE, [LAPIDE, VIVO]);
  ok(porTelefone.docs[0].id === LAPIDE,
    'CENÁRIO: a busca por +5511996019191 devolve a LÁPIDE em primeiro');
  ok(!!porTelefone.docs[0].data().mergedInto,
    '  → e o padrão antigo (snap.docs[0].id) entregava esse uid MORTO — a falha');

  // ── A2. O conserto ──
  let v = await W._userVivo(porTelefone, { get: leitor(BASE) });
  ok(v && v.uid === VIVO, 'busca por telefone → uid VIVO (got ' + (v && v.uid) + ')');
  ok(v && v.data.displayName === 'M. Delia Fernandez', '  → e os dados são os da conta viva');

  // ── A3. Colapso: lápide + sobrevivente na MESMA busca contam como UMA pessoa ──
  ok(v && v.count === 1,
    'lápide + vivo no mesmo resultado colapsam em 1 (quem exigia size===1 desistia da pessoa) (got ' + (v && v.count) + ')');

  // ── A4. Só a lápide casou (busca pelo e-mail relay da Apple, que só ela tem) ──
  v = await W._userVivo(querySnap(BASE, [LAPIDE]), { get: leitor(BASE) });
  ok(v && v.uid === VIVO, 'busca pelo e-mail relay (só a lápide tem) → segue pra conta viva (got ' + (v && v.uid) + ')');
  ok(v && v.viaLapide === true, '  → marcado como resolvido via lápide');

  // ── A5. Doc único por uid (o uid guardado no torneio pode ser a lápide) ──
  v = await W._userVivo(docSnap(BASE, LAPIDE), { get: leitor(BASE) });
  ok(v && v.uid === VIVO, 'DocumentSnapshot da lápide → conta viva (got ' + (v && v.uid) + ')');
  v = await W._userVivo(LAPIDE, { get: leitor(BASE) });
  ok(v && v.uid === VIVO, 'string de uid da lápide → conta viva (got ' + (v && v.uid) + ')');

  // ── A6. Conta viva passa direto, sem leitura extra ──
  leituras = 0;
  v = await W._userVivo(querySnap(BASE, [VIVO]), { get: leitor(BASE) });
  ok(v && v.uid === VIVO && v.viaLapide === false, 'conta viva passa direto');
  ok(leituras === 0, '  → e sem NENHUMA leitura extra no Firestore (got ' + leituras + ')');

  // ── A7. CADEIA: lápide que aponta pra lápide (fusão em cima de fusão — acontece) ──
  const CADEIA = {
    A: { mergedInto: 'B' }, B: { mergedInto: 'C' }, C: { displayName: 'Fim' },
  };
  v = await W._userVivo(querySnap(CADEIA, ['A']), { get: leitor(CADEIA) });
  ok(v && v.uid === 'C', 'cadeia A→B→C: segue até o fim (got ' + (v && v.uid) + ')');

  // ── A8. CICLO: lápide apontando pra si mesma, e anel de duas ──
  const SELF = { X: { mergedInto: 'X' } };
  v = await W._userVivo(querySnap(SELF, ['X']), { get: leitor(SELF) });
  ok(v === null, '🔒 lápide que aponta pra SI MESMA → null (nunca devolve o uid morto)');

  const ANEL = { P: { mergedInto: 'Q' }, Q: { mergedInto: 'P' } };
  v = await W._userVivo(querySnap(ANEL, ['P']), { get: leitor(ANEL) });
  ok(v === null, '🔒 anel P→Q→P → null, sem laço infinito');

  // ── A9. CORRENTE LONGA DEMAIS: para, não trava ──
  const LONGA = {};
  for (let i = 0; i < 30; i++) LONGA['n' + i] = { mergedInto: 'n' + (i + 1) };
  LONGA.n30 = { displayName: 'Longe demais' };
  v = await W._userVivo(querySnap(LONGA, ['n0']), { get: leitor(LONGA) });
  ok(v === null, '🔒 corrente além do limite de saltos → null (não trava a tela)');

  // ── A10. Sobrevivente sumiu do banco: NÃO cai de volta na lápide ──
  const ORFA = { L: { displayName: 'Fantasma', mergedInto: 'SUMIU' } };
  v = await W._userVivo(querySnap(ORFA, ['L']), { get: leitor(ORFA) });
  ok(v === null, '🔒 lápide apontando pra doc inexistente → null (devolver a lápide era O BUG)');

  // ── A11. Duas pessoas DIFERENTES continuam sendo duas (o colapso não pode fundir gente) ──
  const DOIS = { u1: { displayName: 'Ana' }, u2: { displayName: 'Ana' } };
  v = await W._userVivo(querySnap(DOIS, ['u1', 'u2']), { get: leitor(DOIS) });
  ok(v && v.count === 2, 'duas contas VIVAS homônimas seguem sendo 2 (got ' + (v && v.count) + ')');

  // ── A12. Vazio / nada ──
  ok((await W._userVivo(querySnap(BASE, []), { get: leitor(BASE) })) === null, 'busca vazia → null');
  ok((await W._userVivo(null, { get: leitor(BASE) })) === null, 'null → null');
  ok((await W._userVivo(docSnap(BASE, 'nao-existe'), { get: leitor(BASE) })) === null, 'doc inexistente → null');

  // ── A13. Ordem: a conta encontrada VIVA representa, não a alcançada por lápide ──
  const MIX = { m1: { mergedInto: 'm9' }, m9: { displayName: 'Nove' }, m2: { displayName: 'Dois' } };
  v = await W._userVivo(querySnap(MIX, ['m1', 'm2']), { get: leitor(MIX) });
  ok(v && v.uid === 'm2' && v.count === 2,
    'representante é a viva-direta, não a alcançada por lápide (got ' + (v && v.uid) + ')');

  // ═══════════════════════════════════════════════════════════════════════════
  // B) INVARIANTE: nenhuma busca ampla por identidade escapa da porta única.
  // ═══════════════════════════════════════════════════════════════════════════
  const CAMPOS = ['email', 'email_lower', 'phone', 'displayName', 'displayName_lower', 'letzplayHandle'];
  const RE_CAMPO = new RegExp('\\.where\\(\\s*[\'"](' + CAMPOS.join('|') + ')[\'"]');
  const RE_USERS = /collection\(\s*['"]users['"]\s*\)/;
  const JANELA = 16;  // linhas depois do início da query em que a porta tem de aparecer

  function jsDe(dir, out) {
    out = out || [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) jsDe(f, out);
      else if (e.name.endsWith('.js')) out.push(f);
    }
    return out;
  }

  const RAIZ = path.join(__dirname, '..', 'js');
  const escapou = [];
  let vistos = 0;
  for (const f of jsDe(RAIZ)) {
    const L = fs.readFileSync(f, 'utf8').split('\n');
    for (let i = 0; i < L.length; i++) {
      if (!RE_USERS.test(L[i])) continue;
      // a query pode quebrar em várias linhas (.where encadeado embaixo)
      if (!RE_CAMPO.test(L.slice(i, i + 5).join('\n'))) continue;
      vistos++;
      // a isenção pode estar no comentário LOGO ACIMA da query (é onde o motivo cabe)
      const depois = L.slice(Math.max(0, i - 3), i + JANELA).join('\n');
      if (/_userVivo/.test(depois) || /user-vivo:isento/.test(depois)) continue;
      escapou.push(path.relative(path.join(__dirname, '..'), f) + ':' + (i + 1) + '  ' + L[i].trim().slice(0, 80));
    }
  }
  ok(vistos >= 20, 'a varredura achou as buscas por identidade (got ' + vistos + ')');
  if (escapou.length) {
    console.error('  ↓ buscas amplas em users/ que NÃO passam por _userVivo:');
    escapou.forEach((e) => console.error('     ' + e));
  }
  ok(escapou.length === 0,
    'toda busca por email/phone/displayName/letzplayHandle passa pela porta única ' +
    '(ou declara `user-vivo:isento` com o motivo) — ' + escapou.length + ' escaparam');

  // ── B2. As duas LISTAS pra escolha humana descartam lápide NA FONTE ──
  // Elas são isentas da porta (lista não "resolve uma pessoa"), mas a saída delas é
  // PROJETADA em campos públicos — e `mergedInto` não está na projeção. Filtrar lá na
  // frente (_filterInvitableUsers, explore.js) recebia o campo já apagado e deixava as 13
  // contas mortas aparecerem como gente pra convidar. O descarte tem de ser na fonte.
  const fdb = fs.readFileSync(path.join(__dirname, '..', 'js', 'firebase-db.js'), 'utf8');
  function corpo(marca, fim) {
    const i = fdb.indexOf(marca);
    return i === -1 ? '' : fdb.slice(i, fdb.indexOf(fim, i) + 1);
  }
  const addFrom = corpo('var addFromSnap = function(snap) {', 'var end = q +');
  ok(/mergedInto/.test(addFrom), 'searchUsers descarta lápide na FONTE (o sanitize apaga mergedInto depois)');
  const invit = corpo("collection('users').limit(2000)", 'window._invitableUsersCache =');
  ok(/mergedInto/.test(invit), 'listInvitableUsers descarta lápide na FONTE (PUBLIC_FIELDS não leva mergedInto)');

  // ── B3. Nos cross-refs de login, o PRÓPRIO doc sai ANTES de resolver ──
  // Se a conta em que a pessoa está logada FOR a lápide, resolvê-la devolve o SOBREVIVENTE —
  // que passa no teste `!== uid atual` e vira "conta anterior a mesclar". O app fundiria a
  // conta VIVA dentro da morta. Por isso os 4 cross-refs do auth.js filtram o próprio doc
  // na ENTRADA da porta, não na saída.
  const authSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'auth.js'), 'utf8');
  const chamadas = authSrc.split('\n').filter((l) => /window\._userVivo\(/.test(l));
  ok(chamadas.length === 4, 'auth.js tem os 4 cross-refs passando pela porta (got ' + chamadas.length + ')');
  const semFiltro = chamadas.filter((l) => !/docs\.filter\(/.test(l));
  if (semFiltro.length) semFiltro.forEach((l) => console.error('     ' + l.trim().slice(0, 100)));
  ok(semFiltro.length === 0,
    '🔒 todo cross-ref exclui o próprio doc ANTES de resolver (senão o merge inverte de lado)');

  // A porta tem de estar CARREGADA no app, senão o call site chama undefined.
  const idx = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  ok(/js\/views\/user-vivo-core\.js/.test(idx), 'user-vivo-core.js está no index.html');
  const posPorta = idx.indexOf('js/views/user-vivo-core.js');
  const posStore = idx.indexOf('js/store.js');
  ok(posPorta > 0 && posStore > 0 && posPorta < posStore,
    '  → e carrega ANTES do store.js/views, que são quem consulta');

  console.log(fail === 0 ? `✅ ${pass} asserts ok` : `❌ ${fail} falharam de ${pass + fail}`);
  process.exit(fail === 0 ? 0 : 1);
})();
