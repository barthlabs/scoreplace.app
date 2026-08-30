/* A LIMPEZA NOTURNA NÃO APAGA A LÁPIDE — e não julga idade por carimbo errado
 * node tests/limpeza-nao-apaga-a-lapide.test.js
 *
 * O QUE ACONTECEU (medido ponta a ponta, 30/ago/2026). O dono viu "…" no lugar de um nome
 * no card de um jogo da Confra. A reconstrução pelo PITR:
 *   27/ago 23:03 — a Loraine criou uma conta NOVA, com Google;
 *   27/ago 23:05 — a dedup fundiu a conta antiga (e-mail/senha) na nova e gravou a lápide
 *                  `mergedInto` + `mergedAt` na antiga. Fusão legítima;
 *   28/ago 04:15 — `cleanupAbandonedAuth` apagou a conta antiga INTEIRA — Auth e Firestore,
 *                  lápide junto.
 * O uid antigo continua gravado nos JOGOS. Sem a lápide, o resolvedor não tem como chegar
 * na conta viva — e o card mostra "…" pra sempre.
 *
 * TRÊS DEFEITOS, e o teste trava os três:
 *   ① a idade da lápide era lida de `updatedAt || createdAt`, campos que o merge NÃO toca.
 *      O `updatedAt` dela era de 19/ago: uma lápide de DOIS MINUTOS foi julgada com 9 dias
 *      e morreu na mesma noite. A idade tem que sair de `mergedAt`, que é o que o merge grava.
 *   ② sem carimbo nenhum, `mergedMs` virava 0 e o `if (mergedMs && …)` DEIXAVA PASSAR —
 *      idade desconhecida resultava em APAGAR. O default de rotina destrutiva é não fazer.
 *   ③ apagava o documento Firestore. ⛔ A lápide é CARGA, não lixo
 *      ([[project_lapide_mergedinto_e_carga_nao_lixo]]): ela é a única ponte entre o uid
 *      gravado no jogo e a conta viva.
 *
 * ⛔ POR QUE NÃO BASTA LER O CÓDIGO: um `grep` por "ref.delete()" ficaria verde por acidente
 * (há outros deletes legítimos no arquivo) e não diria nada sobre QUAL carimbo a decisão
 * usa. Aqui a decisão é EXECUTADA, com dublês, e o que se afirma é o efeito.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } }

const SRC = fs.readFileSync(path.join(ROOT, 'functions', 'index.js'), 'utf8');
const INI = SRC.indexOf('exports.cleanupAbandonedAuth = onSchedule(');
ok(INI !== -1, 'achei `cleanupAbandonedAuth` no functions/index.js');
const FIM = SRC.indexOf('\nexports.', INI + 10);
const CORPO = SRC.slice(INI, FIM === -1 ? SRC.length : FIM);

/* ── ① a decisão de idade usa `mergedAt` ─────────────────────────────────────── */
ok(/data\.mergedAt|const _ts = data\.mergedAt/.test(CORPO),
  '① a idade da lápide sai de `mergedAt` — o campo que o merge de fato grava');
ok(!/const mergedAtStr = data\.updatedAt \|\| data\.createdAt/.test(CORPO),
  '   e NÃO de `updatedAt || createdAt`, que descrevem a vida da pessoa, não a da lápide');

/* ── ② idade desconhecida PULA ────────────────────────────────────────────────── */
ok(/if \(!mergedMs\)[\s\S]{0,220}continue;/.test(CORPO),
  '② sem carimbo, PULA (antes o `if (mergedMs && …)` deixava passar direto pra exclusão)');

/* ── ③ a lápide não é apagada ─────────────────────────────────────────────────── */
ok(!/snaps\[j\]\.ref\.delete\(\)/.test(CORPO),
  '③ o documento Firestore (a lápide) NUNCA é apagado');
ok(/auth\.deleteUser\(batch\[j\]\.uid\)/.test(CORPO),
  '   mas a conta Auth órfã continua sendo removida — é ela que é lixo de verdade');

/* ── a decisão, EXECUTADA ─────────────────────────────────────────────────────── */
console.log('\n① a regra de idade, rodando com dublês\n');

/* Réplica FIEL do trecho decisório (as 6 linhas que decidem), extraída do corpo real acima
 * pelas asserções — aqui ela roda contra os casos que mataram a Loraine. */
const GHOST_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;
function decide(data, now) {
  if (!data.mergedInto) return 'não é lápide — não toca';
  const _ts = data.mergedAt;
  const mergedMs = (_ts && typeof _ts.toMillis === 'function') ? _ts.toMillis()
    : (_ts && typeof _ts === 'string') ? new Date(_ts).getTime() : 0;
  if (!mergedMs) return 'pula (sem carimbo)';
  if ((now - mergedMs) < GHOST_THRESHOLD_MS) return 'pula (recente)';
  return 'remove SÓ o Auth';
}
const AGORA = Date.parse('2026-08-28T07:15:00Z');

// O CASO REAL DA LORAINE: lápide de 2 minutos, updatedAt de 9 dias antes.
const loraine = { mergedInto: 'HK2h4EnBv5fgt1zpfC5M0UBDLRq2',
  mergedAt: { toMillis: () => Date.parse('2026-08-27T23:05:03Z') },
  updatedAt: '2026-08-19T00:15:00.579Z', createdAt: '2026-06-15T00:29:50.235Z' };
ok(decide(loraine, AGORA) === 'pula (recente)',
  '⭐ a lápide da Loraine (2 minutos de idade) é PULADA — era aqui que ela morria');

// e a regra ANTIGA, no mesmo caso, para provar que o teste mede a falha
function decideAntigo(data, now) {
  if (!data.mergedInto) return 'não é lápide — não toca';
  const mergedAtStr = data.updatedAt || data.createdAt || '';
  const mergedMs = mergedAtStr ? new Date(mergedAtStr).getTime() : 0;
  if (mergedMs && (now - mergedMs) < GHOST_THRESHOLD_MS) return 'pula (recente)';
  return 'APAGA Auth + Firestore';
}
ok(decideAntigo(loraine, AGORA) === 'APAGA Auth + Firestore',
  '⛔ a regra ANTIGA, no mesmo caso, APAGA — é a falha que motivou o conserto');

// sem carimbo nenhum
const semCarimbo = { mergedInto: 'X' };
ok(decide(semCarimbo, AGORA) === 'pula (sem carimbo)', 'idade desconhecida → PULA');
ok(decideAntigo(semCarimbo, AGORA) === 'APAGA Auth + Firestore', '⛔ a antiga, sem carimbo, APAGAVA');

// lápide velha de verdade: o Auth sai, o documento fica
const velha = { mergedInto: 'X', mergedAt: { toMillis: () => AGORA - 30 * 24 * 3600 * 1000 } };
ok(decide(velha, AGORA) === 'remove SÓ o Auth', 'lápide realmente velha: só o Auth órfão sai, o documento fica');

// conta real nunca é tocada
ok(decide({ displayName: 'Fulano' }, AGORA) === 'não é lápide — não toca', 'conta real segue intocada');

/* ── ② A TRAVA GERAL: NENHUMA ROTINA AGENDADA APAGA UM users/{uid} ─────────────
 * ⛔ Consertar só a `cleanupAbandonedAuth` conserta o caso, não a CLASSE. O pedido do dono
 * foi _"corrija isso para nunca mais acontecer"_ — e "nunca mais" não cabe numa função.
 * Um documento de `users/` é a identidade de uma pessoa OU a lápide que liga um uid antigo
 * à conta viva; nos dois casos, apagá-lo de madrugada, em lote e sem ninguém olhando é a
 * operação que não pode existir. Subcoleção (notificações, dispositivos) é outra história e
 * segue liberada — quem limpa notificação velha não está apagando ninguém.
 * ⭐ A trava varre TODAS as rotinas `onSchedule` do arquivo, então a próxima que alguém
 * escrever já nasce coberta.
 */
console.log('\n② a trava geral: nenhuma rotina agendada apaga um `users/{uid}`\n');

function blocosAgendados(src) {
  const out = [];
  const re = /exports\.(\w+)\s*=\s*onSchedule\(/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const ini = m.index;
    const prox = src.indexOf('\nexports.', ini + 10);
    out.push({ nome: m[1], corpo: src.slice(ini, prox === -1 ? src.length : prox) });
  }
  return out;
}
/* Apaga documento de PESSOA? Duas formas de escrever isso:
 *   • `collection("users").doc(X).delete()` — direto;
 *   • `db.getAll(...refs)` de `collection("users").doc(...)` e depois `snap.ref.delete()`.
 * ⚠️ NÃO conta subcoleção: `collection("users").doc(u).collection("notifications")…delete()`
 * tem o `.collection(` no meio, e é legítimo. */
function apagaDocDePessoa(corpo) {
  const motivos = [];
  if (/collection\(["']users["']\)\s*\.doc\([^)]*\)\s*\.delete\(\)/.test(corpo)) motivos.push('collection("users").doc(…).delete()');
  const pegaRefsDeUsers = /collection\(["']users["']\)\s*\.doc\(/.test(corpo);
  if (pegaRefsDeUsers && /\.ref\.delete\(\)/.test(corpo)) motivos.push('.ref.delete() sobre refs de users/');
  return motivos;
}

const agendadas = blocosAgendados(SRC);
ok(agendadas.length >= 10, 'a varredura achou as rotinas agendadas (' + agendadas.length + ')');
const infratoras = agendadas.map((b) => ({ nome: b.nome, motivos: apagaDocDePessoa(b.corpo) })).filter((x) => x.motivos.length);
if (infratoras.length) infratoras.forEach((x) => console.log('      ⛔ ' + x.nome + ' → ' + x.motivos.join(' · ')));
ok(infratoras.length === 0, '⭐ NENHUMA das ' + agendadas.length + ' rotinas agendadas apaga um documento de `users/`');

/* ⛔ E A TRAVA TEM QUE DETECTAR — senão ela é decoração, e decoração fica verde pra sempre.
 * Aqui roda o CORPO ANTIGO (o que apagava a Loraine) pela mesma peneira. */
const corpoAntigo = [
  'exports.cleanupFalso = onSchedule({ schedule: "every day 04:15" }, async () => {',
  '  const refs = batch.map((u) => db.collection("users").doc(u.uid));',
  '  const snaps = await db.getAll(...refs);',
  '  await snaps[j].ref.delete();',
  '});'
].join('\n');
ok(apagaDocDePessoa(corpoAntigo).length > 0, '   e a peneira ACUSA o corpo antigo (a que apagou a Loraine)');
ok(apagaDocDePessoa('const x = db.collection("users").doc(u).collection("notifications").doc(k); await x.delete();').length === 0,
  '   e NÃO acusa limpeza de subcoleção (notificação velha é lixo de verdade)');

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s) de ' + (pass + fail) : '✅ ' + pass + '/' + pass + ' ok') + '\n');
process.exit(fail ? 1 : 0);
