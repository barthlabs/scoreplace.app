'use strict';
/* ⛔ NÚMERO QUE NÃO SE PODE PROVAR É PIOR QUE NÚMERO NENHUM.
 * L16.P0 (11/set/2026) inventariou os `catch` que não registram nada em functions/. Dois
 * achados de risco alto, ambos no caminho de EXCLUSÃO DE CONTA — o lugar onde um número
 * errado vira promessa de privacidade não cumprida:
 *   ① `_sweepDeletionLeftovers` tinha CINCO catch vazios em nove consultas. A consulta que
 *     falhava não entrava em `sobras[]`, e o relatório saía `sobras=0` — "está tudo limpo"
 *     dito justamente quando ninguém conseguiu conferir.
 *   ② `deleteAccount` incrementava `out.notificationsDeleted` DENTRO do laço, antes do
 *     `commit()`, com a falha do commit engolida: dizia ter apagado o que não apagou.
 * Esta trava prende os dois consertos e a forma deles.
 */
const assert = require('assert/strict'), fs = require('fs'), path = require('path');
const F = fs.readFileSync(path.join(__dirname, '..', 'functions/index.js'), 'utf8');
let ok = 0; const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };
const semComentario = (s) => s.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

// ── ① o auditor de sobras ───────────────────────────────────────────────────
const ini = F.indexOf('async function _sweepDeletionLeftovers');
assert.ok(ini > 0, 'âncora: o auditor de sobras');
const fim = F.indexOf('exports.accountDeletionEmail', ini);
assert.ok(fim > ini, 'âncora: o fim do auditor');
const varre = semComentario(F.slice(ini, fim));

must(/const naoConsegui = \[\];/.test(varre),
  '① existe uma lista separada do que NÃO pôde ser verificado');
must(/console\.error\("\[sweepLeftovers\] NÃO CONSEGUI OLHAR/.test(varre),
  '① toda falha de verificação vai para o log de ERRO, nomeando o que falhou');
const vazios = (varre.match(/catch \(e\) \{\s*\}/g) || []).length;
must(vazios === 0, '① ⛔ nenhum catch VAZIO sobrou no auditor (achei ' + vazios + ')');
/* ⚠️ O catch de `admin.auth().getUser` CONTINUA engolindo, e está certo: ali a exceção É a
 * resposta ("não existe no Auth"), como a L16.P0 classificou. O que ele não pode é ser
 * INDISTINGUÍVEL de descuido — então a trava exige a marca escrita. */
const bruto = F.slice(ini, fim);
must(/getUser\(uid\); authVivo = true; \} catch \(e\) \{ \/\* a exceção É a resposta/.test(bruto),
  '① o único catch que engole de propósito diz POR ESCRITO que é deliberado');
must(/if \(naoConsegui\.length\) \{[\s\S]{0,400}sobras\.push\(/.test(varre),
  '① ⛔ e a falha entra na MESMA lista que o relatório lê — senão o conserto morreria no console');
must(/INCONCLUSIVO/.test(F.slice(ini, fim)),
  '① a entrada diz a palavra que muda a decisão de quem lê: inconclusivo');

// toda verificação passa pela porta única
const getsSoltos = (varre.match(/\n\s*try \{[\s\S]{0,200}?\.get\(\)/g) || []).length;
must(getsSoltos === 0,
  '① ⛔ nenhuma consulta ficou fora da porta `olha()` (achei ' + getsSoltos + ' try solto com .get)');
must(/const conta = \(label, q\) => olha\(label,/.test(varre),
  '① o contador de coleções também entra pela porta única');

// ── ② o contador de notificações ────────────────────────────────────────────
const iniD = F.indexOf('// 6) Notificações + perfil → TOMBSTONE');
assert.ok(iniD > 0, 'âncora: o passo 6 da exclusão de conta');
const passo6 = semComentario(F.slice(iniD, iniD + 1400));
must(!/b\.delete\(d\.ref\); out\.notificationsDeleted\+\+/.test(passo6),
  '② ⛔ o incremento dentro do laço — antes do commit — não existe mais');
must(/await b\.commit\(\); out\.notificationsDeleted \+= n;/.test(passo6),
  '② o contador soma por LOTE CONFIRMADO, depois do commit');
const posCommitFinal = passo6.indexOf('if (n) { await b.commit();');
must(posCommitFinal > 0, '② o lote final também é confirmado antes de contar');
must(/out\.notificationsFailed = true;/.test(passo6),
  '② e a falha do commit vira sinal no RETORNO, não só no log');
must(/console\.error\("\[deleteAccount\] notificações:/.test(passo6),
  '② com o erro nomeado no log — antes era catch vazio');

console.log('\n✅ auditor não mente quando não consegue olhar — ' + ok + ' verificações');

/* ─── L16.P3 — A GUARDA DA EXCLUSÃO NÃO PODE FALHAR ABERTA ────────────────────
 * Terceiro achado, e o mais grave dos três: as três consultas que decidem se a exclusão é
 * BLOQUEADA por a pessoa organizar torneio tinham `catch (e) {}`. A consulta que falhasse não
 * trazia nada, `organizando` ficava vazio e a conta era APAGADA — exatamente porque ninguém
 * conseguiu conferir. A mesma confusão entre "não achei" e "não consegui olhar", agora com a
 * resposta errada sendo a destrutiva. */
(function () {
  const iniG = F.indexOf('// organizados: as MESMAS 3 consultas que o passo (1) usa pra apagar');
  assert.ok(iniG > 0, 'âncora: a guarda das 3 consultas');
  const guarda = semComentario(F.slice(iniG, F.indexOf('const todos = Array.from(vistos.values());', iniG)));
  must(!/catch \(e\) \{\s*\}/.test(guarda),
    '③ ⛔ a guarda não tem mais catch vazio — era ela que deixava apagar sem conferir');
  must(/throw new HttpsError\("unavailable"/.test(guarda),
    '③ falha de leitura INTERROMPE a exclusão: não conferiu, não apaga');
  must(/Tente de novo em instantes/.test(F.slice(iniG, iniG + 1800)),
    '③ e a pessoa recebe um recado acionável, não um erro cru');
  must(/console\.error\("\[deleteAccount\] guarda:/.test(guarda),
    '③ com o motivo real no log do servidor');

  const iniT = F.indexOf('// 1) Torneios que ela ORGANIZA');
  assert.ok(iniT > 0, 'âncora: o passo 1 da exclusão');
  const passo1 = semComentario(F.slice(iniT, iniT + 1700));
  must(!/await ref\.delete\(\)\.catch\(\(\) => \{\}\); out\.tournamentsDeleted\+\+/.test(passo1),
    '③ ⛔ o contador que somava com o delete engolido não existe mais');
  must(/await ref\.delete\(\); out\.tournamentsDeleted\+\+;/.test(passo1),
    '③ só conta torneio que REALMENTE foi apagado');
  must(/out\.tournamentsDeleteFailed = \(out\.tournamentsDeleteFailed \|\| 0\) \+ 1;/.test(passo1),
    '③ e a falha de exclusão é contada à parte, no retorno');
  must(/out\.tournamentsQueryFailed = true;/.test(passo1),
    '③ consulta que falhou no passo 1 também vira sinal no retorno');
})();

console.log('✅ (+ L16.P3) guarda da exclusão falha FECHADA — total ' + ok + ' verificações');
