/* A LÁPIDE NUNCA VENCE A CONTA VIVA — AGORA TAMBÉM NO SERVIDOR.
 *
 * A v1.9.33 fechou isso no cliente (js/views/user-vivo-core.js + o teste irmão
 * tests/lapide-nunca-vence-a-conta-viva.test.js). Só que a regra do cliente NÃO alcança as
 * Cloud Functions ([[feedback_functions_must_mirror_app]]): quem manda o comunicado do
 * organizador, quem resolve o login por e-mail/telefone vinculado e quem escolhe o alvo da
 * prova de fusão são CFs, e nenhuma passa pelo js/.
 *
 * MEDIÇÃO QUE MOTIVOU (18/ago/2026), varrendo functions/ e functions-autodraw/:
 *   • 24 buscas amplas em collection("users") no servidor; functions-autodraw/ tem ZERO
 *     (só `.doc(uid)`), logo está fora do assunto;
 *   • a maioria já descartava lápide (detecção de duplicata, autoMerge, nome único);
 *   • 4 NÃO descartavam, e agem: tema do e-mail, comunicado do organizador (notifica o uid
 *     morto), _uidByProfileEmail/_uidByProfilePhone (login) e o alvo da prova de fusão;
 *   • MAIS DOIS caminhadores de corrente escritos à mão (resolveMergedLogin,
 *     resolveLoginRedirect) que, passando de 5 saltos, SAEM COM A LÁPIDE NA MÃO — e o
 *     primeiro emite custom token com ela.
 *
 * ⚠️ O QUE FAZIA O SERVIDOR PARECER SEGURO: a fusão apaga o Auth do absorvido
 * (index.js:774), então todo caminho que termina em `getUser` falha na lápide e vira null.
 * Mas null não é acerto — é a pessoa VIVA sumindo do resultado (login que não acha conta
 * que existe). E os caminhos sem Auth agem direto sobre o uid morto.
 *
 * Três metades, todas necessárias:
 *   A) COMPORTAMENTO — roda o módulo REAL (functions/user-vivo-core.js) contra um Firestore
 *      falso montado com o par real da base. Primeiro DEMONSTRA a falha (`snap.docs[0].id`
 *      devolve o uid morto), depois cobra o resolvedor.
 *   B) FIAÇÃO — o index.js não é `require`-ável (registra onCall e lê secrets no import),
 *      então os call sites são cobrados por varredura de texto.
 *   C) INVARIANTE — varre functions/ e cobra que TODA busca ampla em users/ passe pela porta
 *      ou declare `user-vivo:isento` com o motivo. Sem isso a 25ª consulta nasce quebrada e
 *      o teste fica verde. A varredura pega campo DINÂMICO (`where(t.f, ...)`) de propósito:
 *      no servidor essa é a forma comum, e a do cliente, que só olha literais, não a veria.
 *
 * node tests/user-vivo-no-servidor.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const UV = require(path.join(RAIZ, 'functions', 'user-vivo-core.js'));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

console.log('──── a lápide nunca vence a conta viva (SERVIDOR) ────');

ok(typeof UV.userVivo === 'function', 'userVivo existe');
ok(typeof UV.uidVivo === 'function', 'uidVivo existe');

// ── Firestore falso (superfície do Admin SDK usada pelo módulo) ────────────────────────
// BASE = o par REAL da M. Delia: vivo e lápide com o MESMO telefone.
const VIVO = 'vfnXkEcUfGUH5MyhQRuOkuab9W02';
const LAPIDE = 'FhL8w1Ym9eV3POBohF7hUlJMuX72';
const BASE = {
  [VIVO]: { displayName: 'M. Delia Fernandez', phone: '+5511996019191', email: 'delia@exemplo.com', theme: 'light' },
  [LAPIDE]: { displayName: 'M. Delia Fernandez', phone: '+5511996019191', theme: 'dark',
              email: 'delia@privaterelay.appleid.com', mergedInto: VIVO, mergedAt: '2026-07-01T00:00:00Z' },
};
let leituras = 0;
function docSnap(base, uid) {
  return { id: uid, exists: !!base[uid], data: () => base[uid] || null };
}
function querySnap(base, uids) {
  const docs = uids.map((u) => docSnap(base, u));
  return { empty: docs.length === 0, size: docs.length, docs, forEach: (f) => docs.forEach(f) };
}
// db falso: só `collection('users').doc(uid).get()`, que é tudo que o leitor padrão usa.
function fakeDb(base) {
  return {
    collection(name) {
      if (name !== 'users') throw new Error('coleção inesperada: ' + name);
      return { doc: (uid) => ({ get: () => { leituras++; return Promise.resolve(docSnap(base, uid)); } }) };
    },
  };
}

(async () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // A) COMPORTAMENTO
  // ═══════════════════════════════════════════════════════════════════════════
  const db = fakeDb(BASE);

  // A1. A FALHA, reproduzida (o Firestore não promete ordem entre os dois docs).
  const porTelefone = querySnap(BASE, [LAPIDE, VIVO]);
  ok(porTelefone.docs[0].id === LAPIDE,
    'CENÁRIO: a busca por +5511996019191 devolve a LÁPIDE em primeiro');
  ok(!!porTelefone.docs[0].data().mergedInto,
    '  → e o padrão antigo (snap.docs[0].id) entregava esse uid MORTO — a falha');

  // A2. O conserto.
  let v = await UV.userVivo(db, porTelefone);
  ok(v && v.uid === VIVO, 'busca por telefone → uid VIVO (got ' + (v && v.uid) + ')');
  ok(v && v.data.displayName === 'M. Delia Fernandez', '  → e os dados são os da conta viva');
  ok(v && v.data.theme === 'light', '  → inclusive o tema (a lápide tinha o de antes da fusão)');

  // A3. Colapso: lápide + sobrevivente contam como UMA pessoa.
  ok(v && v.count === 1,
    'lápide + vivo no mesmo resultado colapsam em 1 (got ' + (v && v.count) + ')');

  // A4. Só a lápide casou (o e-mail relay da Apple, que só ela tem).
  v = await UV.userVivo(db, querySnap(BASE, [LAPIDE]));
  ok(v && v.uid === VIVO, 'busca pelo e-mail relay (só a lápide tem) → conta viva');
  ok(v && v.viaLapide === true, '  → marcado como resolvido via lápide');

  // A5. uid solto — é a forma que o inscrito guarda no torneio.
  v = await UV.userVivo(db, LAPIDE);
  ok(v && v.uid === VIVO, 'string de uid da lápide → conta viva');
  v = await UV.userVivo(db, docSnap(BASE, LAPIDE));
  ok(v && v.uid === VIVO, 'DocumentSnapshot da lápide → conta viva');
  ok((await UV.uidVivo(db, LAPIDE)) === VIVO, 'uidVivo devolve o uid direto');
  ok((await UV.uidVivo(db, 'NAO_EXISTE')) === '', 'uidVivo devolve "" quando não resolve');

  // A6. Conta viva passa direto, sem leitura extra.
  leituras = 0;
  v = await UV.userVivo(db, querySnap(BASE, [VIVO]));
  ok(v && v.uid === VIVO && v.viaLapide === false, 'conta viva passa direto');
  ok(leituras === 0, '  → e sem NENHUMA leitura extra no Firestore (got ' + leituras + ')');

  // A7. Cadeia (fusão em cima de fusão).
  const CADEIA = { A: { mergedInto: 'B' }, B: { mergedInto: 'C' }, C: { displayName: 'Fim' } };
  v = await UV.userVivo(fakeDb(CADEIA), querySnap(CADEIA, ['A']));
  ok(v && v.uid === 'C', 'cadeia A→B→C: segue até o fim (got ' + (v && v.uid) + ')');

  // A8. Ciclo — o caso que o laço à mão do index.js NÃO tratava.
  const SELF = { X: { mergedInto: 'X' } };
  ok((await UV.userVivo(fakeDb(SELF), querySnap(SELF, ['X']))) === null,
    '🔒 lápide que aponta pra SI MESMA → null (nunca devolve o uid morto)');
  const ANEL = { P: { mergedInto: 'Q' }, Q: { mergedInto: 'P' } };
  ok((await UV.userVivo(fakeDb(ANEL), querySnap(ANEL, ['P']))) === null,
    '🔒 anel P→Q→P → null, sem laço infinito');

  // A9. Corrente longa demais — o buraco provado do resolveMergedLogin: o laço antigo
  // parava no 5º salto e SEGUIA COM A LÁPIDE, e createCustomToken não confere existência.
  const LONGA = {};
  for (let i = 0; i < 30; i++) LONGA['n' + i] = { mergedInto: 'n' + (i + 1) };
  LONGA.n30 = { displayName: 'Longe demais' };
  ok((await UV.userVivo(fakeDb(LONGA), querySnap(LONGA, ['n0']))) === null,
    '🔒 corrente além do limite de saltos → null (nunca a lápide)');

  // A10. Sobrevivente sumiu: NÃO cai de volta na lápide.
  const ORFA = { L: { displayName: 'Fantasma', mergedInto: 'SUMIU' } };
  ok((await UV.userVivo(fakeDb(ORFA), querySnap(ORFA, ['L']))) === null,
    '🔒 lápide apontando pra doc inexistente → null (não devolve a própria lápide)');

  // A11. Duas pessoas DIFERENTES não colapsam.
  const DOIS = { a1: { displayName: 'Ana' }, b1: { displayName: 'Bia' } };
  v = await UV.userVivo(fakeDb(DOIS), querySnap(DOIS, ['a1', 'b1']));
  ok(v && v.count === 2, 'duas contas vivas distintas → count 2 (got ' + (v && v.count) + ')');

  // A12. excludeUid — as duas pontas, e a de DEPOIS é a que corrige.
  v = await UV.userVivo(fakeDb(DOIS), querySnap(DOIS, ['a1', 'b1']), { excludeUid: 'a1' });
  ok(v && v.uid === 'b1' && v.count === 1, 'excludeUid tira o próprio uid ANTES de resolver');
  v = await UV.userVivo(db, querySnap(BASE, [LAPIDE]), { excludeUid: VIVO });
  ok(v === null,
    '🔒 lápide que resolve PRA MIM é excluída DEPOIS (senão o chamador funde a conta consigo mesma)');

  // A13. Entradas degeneradas não explodem.
  ok((await UV.userVivo(db, null)) === null, 'entrada nula → null');
  ok((await UV.userVivo(db, querySnap(BASE, []))) === null, 'busca vazia → null');
  ok((await UV.userVivo(db, docSnap(BASE, 'NAO_EXISTE'))) === null, 'doc inexistente → null');

  // ═══════════════════════════════════════════════════════════════════════════
  // B) FIAÇÃO: os call sites medidos passaram mesmo a usar a porta.
  // ═══════════════════════════════════════════════════════════════════════════
  const IDX = fs.readFileSync(path.join(RAIZ, 'functions', 'index.js'), 'utf8');

  ok(/require\(["']\.\/user-vivo-core["']\)/.test(IDX), 'index.js requer o módulo');

  // Os 4 que agiam sobre o uid morto.
  ok(/_theme[\s\S]{0,600}?_userVivo\.userVivo\(db, _uSnap\)/.test(IDX),
    'tema do e-mail resolve pela porta');
  ok(/async function _resolvePessoa\(r\)[\s\S]{0,700}?_userVivo\.userVivo/.test(IDX),
    'comunicado do organizador resolve a pessoa pela porta');
  ok(!/async function _resolveUid\(r\)/.test(IDX),
    '  → e o _resolveUid antigo (docs[0].id, sem lápide) não existe mais');
  ok(/_uidByProfileEmail[\s\S]{0,900}?_userVivo\.uidVivo/.test(IDX),
    '_uidByProfileEmail resolve pela porta');
  ok(/_uidByProfilePhone[\s\S]{0,900}?_userVivo\.uidVivo/.test(IDX),
    '_uidByProfilePhone resolve pela porta');
  ok(/requestEmailMerge[\s\S]{0,2500}?_userVivo\.uidVivo/.test(IDX),
    'alvo da prova de fusão resolve pela porta');

  // Os 2 caminhadores à mão morreram. `guard++ < 5` era a assinatura dos dois.
  ok(!/while \(guard\+\+ < 5\)/.test(IDX),
    '🔒 nenhum caminhador de corrente escrito à mão sobrou (era o `while (guard++ < 5)`)');
  ok(/resolveMergedLogin[\s\S]{0,3000}?_userVivo\.uidVivo/.test(IDX),
    'resolveMergedLogin segue a corrente pela porta');
  ok(/resolveLoginRedirect[\s\S]{0,3000}?_userVivo\.uidVivo/.test(IDX),
    'resolveLoginRedirect segue a corrente pela porta');

  // A porta nunca pode virar caminho de ESCRITA — ela responde, não altera.
  const MOD = fs.readFileSync(path.join(RAIZ, 'functions', 'user-vivo-core.js'), 'utf8');
  ok(!/\.(set|update|delete|add)\s*\(/.test(MOD),
    '🔒 o módulo não escreve nada (resolver não é fundir)');

  // ═══════════════════════════════════════════════════════════════════════════
  // C) INVARIANTE: nenhuma busca ampla em users/ escapa da porta sem dizer por quê.
  // ═══════════════════════════════════════════════════════════════════════════
  const RE_USERS = /collection\(\s*['"]users['"]\s*\)/;
  const RE_WHERE = /\.where\(/;                 // QUALQUER campo, inclusive dinâmico
  const ATRAS = 60, FRENTE = 16;

  function jsDe(dir, out) {
    out = out || [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'vendor') continue;
      const f = path.join(dir, e.name);
      if (e.isDirectory()) jsDe(f, out);
      else if (e.name.endsWith('.js') && !e.name.startsWith('test-')) out.push(f);
    }
    return out;
  }

  const alvos = jsDe(path.join(RAIZ, 'functions'))
    .concat(jsDe(path.join(RAIZ, 'functions-autodraw')));
  const escapou = [];
  let vistos = 0;
  for (const f of alvos) {
    const L = fs.readFileSync(f, 'utf8').split('\n');
    for (let i = 0; i < L.length; i++) {
      if (!RE_USERS.test(L[i])) continue;
      if (!RE_WHERE.test(L.slice(i, i + 5).join('\n'))) continue;   // .doc(uid) não conta
      vistos++;
      const janela = L.slice(Math.max(0, i - ATRAS), i + FRENTE).join('\n');
      if (/_userVivo|userVivo\(|uidVivo\(|user-vivo:isento/.test(janela)) continue;
      escapou.push(path.relative(RAIZ, f) + ':' + (i + 1) + '  ' + L[i].trim().slice(0, 80));
    }
  }
  ok(vistos >= 20, 'a varredura achou as buscas amplas do servidor (got ' + vistos + ')');
  if (escapou.length) {
    console.error('  ↓ buscas amplas em users/ que NÃO passam pela porta nem se declaram isentas:');
    escapou.forEach((e) => console.error('     ' + e));
  }
  ok(escapou.length === 0,
    'toda busca ampla em users/ passa pela porta (ou declara `user-vivo:isento` com o motivo) — ' +
    escapou.length + ' escaparam');

  // C2. functions-autodraw/ não tem busca ampla nenhuma — se ganhar uma, ela nasce coberta
  // pela varredura acima. Esta asserção registra a MEDIÇÃO pra ninguém "procurar de novo".
  const adBuscas = jsDe(path.join(RAIZ, 'functions-autodraw'))
    .filter((f) => {
      const L = fs.readFileSync(f, 'utf8').split('\n');
      return L.some((l, i) => RE_USERS.test(l) && RE_WHERE.test(L.slice(i, i + 5).join('\n')));
    });
  ok(adBuscas.length === 0,
    'functions-autodraw/ segue só com .doc(uid) — zero busca ampla (medido em 18/ago/2026)');

  console.log('  ' + pass + ' ok, ' + fail + ' falhas');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e); process.exit(1); });
