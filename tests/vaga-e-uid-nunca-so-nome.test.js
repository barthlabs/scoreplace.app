'use strict';
/* A VAGA É O UID — NINGUÉM ENTRA NUM SLOT SÓ COM O NOME.
 * node tests/vaga-e-uid-nunca-so-nome.test.js
 *
 * ⛔⛔⛔ ORDEM DO DONO, 27/set/2026, depois de o mesmo defeito sobreviver a TRÊS publicações:
 * _"deve ser só uid! só uid sem nome em lugar nenhum que nao na porra do perfil da onde hidrata a
 * porra do nome, telefone email"_ · _"nao é pra remendar que regride no minuto seguinte"_.
 *
 * ⛔ O DEFEITO, MEDIDO no jogo 153 da Confra: o slot guardava DUAS fontes de verdade — o rótulo
 * (`p1`) e a identidade (`team1Obj`/`team1Uids`). Sete pontos deste motor trocavam o ocupante
 * escrevendo SÓ O RÓTULO, e a identidade ficava a do ocupante anterior. Resultado gravado:
 *     p1        = "Sandra Bighetto / Flávia Barchetta"     (certo)
 *     team1Uids = uids de Rodrigo Godinho e Betsy          (a dupla ELIMINADA)
 * O card desenha pela IDENTIDADE. Então a tela mostrava os eliminados jogando enquanto a
 * classificação, lida do rótulo, os dava como fora — a contradição que o dono fotografou. Três
 * publicações minhas não pegaram nisso porque eu corrigia o rótulo.
 *
 * ⇒ ESTE PORTÃO É O QUE IMPEDE A VOLTA. Ele reprova qualquer ponto do motor que escreva rótulo de
 * slot fora da porta única. Consertar sem ele seria o remendo que o dono nomeou.
 * [[feedback_uid_controls_everything_name_only_ficticio]] [[project_slot_se_decide_por_uid]]
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

console.log('\n──── a vaga é o uid, nunca só o nome ────\n');

const src = fs.readFileSync(path.join(ROOT, 'js/views/bracket-logic.js'), 'utf8');
const codigo = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/* ── ① A PORTA ÚNICA EXISTE E MOVE TUDO JUNTO ──────────────────────────────── */
const i0 = codigo.indexOf('function _poeTimeNoSlot(');
const porta = i0 < 0 ? '' : codigo.slice(i0, codigo.indexOf('\n}', i0));
ok(porta.length > 200, '① a porta única existe');
['team1Obj', 'team1Uids', 'p1Uid', 'team2Obj', 'team2Uids', 'p2Uid'].forEach(function (c) {
  ok(porta.indexOf(c) >= 0, '① ela move "' + c + '" junto com o rótulo');
});
ok(/if \(!uids\.length\) return false;/.test(porta),
  '① ⛔⛔ e RECUSA mover quem não tem identidade — nome sem uid é o estado que causou tudo isto');

/* ── ② RÓTULO NUNCA É ESCRITO SEM IDENTIDADE NO MESMO GESTO ────────────────
 * ⛔⛔ ESTA É A INVARIANTE, e ela é mais forte que "use uma função só". O portão varre o arquivo
 * inteiro e reprova qualquer escrita de rótulo de slot que não venha acompanhada da identidade na
 * MESMA instrução.
 * ⚠️ Havia DUAS portas legítimas já no código — a do avanço do vencedor (`_setSlot`, que sempre
 * moveu uid e objeto junto) e a nova `_poeTimeNoSlot`. O avanço nunca teve este defeito; quem
 * tinha era a repescagem e o jogo de 3º. Exigir "uma função só" reprovaria código correto e me
 * faria reescrever o caminho do avanço sem motivo — risco sem ganho. O que importa não é por qual
 * porta se passa: é nunca separar rótulo de identidade. */
const linhas = codigo.split('\n');
const proibidas = [];
linhas.forEach(function (ln, i) {
  if (!/(\.p1|\.p2|\[s\.slot\]|\[sl\]|\[side\])\s*=\s*[^=]/.test(ln)) return;
  if (/(p1Uid|p2Uid|p1Name|p2Name|team1|team2|Uids|Obj)\s*=/.test(ln)) return;   // é identidade
  if (/=\s*(null|undefined|'TBD'|"TBD"|'BYE'|"BYE"|''|"")/.test(ln)) return;      // esvaziar
  if (/_setSlot\(|_poeTimeNoSlot\(/.test(ln)) return;                            // identidade junto
  if (/^\s*(m|match)\.(p1|p2)\s*=\s*fonte\./.test(ln)) return;                 // corpo da porta
  proibidas.push((i + 1) + ': ' + ln.trim().slice(0, 90));
});
ok(proibidas.length === 0,
  '② ⛔⛔ nenhum rótulo de slot é escrito sem identidade no mesmo gesto (achei ' + proibidas.length + ')');
if (proibidas.length) proibidas.slice(0, 8).forEach(function (l) { console.error('      · ' + l); });

/* ⛔ e as DUAS portas movem identidade — se alguém esvaziar uma delas, o portão acima passaria a
 * aceitar linha sem identidade nenhuma. */
const iSet = codigo.indexOf('function _setSlot(');
const setSlot = iSet < 0 ? '' : codigo.slice(iSet, codigo.indexOf('\n}', iSet));
ok(setSlot.length > 60 && /Uids/.test(setSlot) && /Obj/.test(setSlot),
  '② a porta do avanço do vencedor continua movendo uid e objeto');

/* ── ③ OS PONTOS QUE TROCAVAM OCUPANTE USAM A PORTA ───────────────────────── */
['_poeTimeNoSlot(s.m, s.slot', '_poeTimeNoSlot(targetMatch', '_poeTimeNoSlot(t.thirdPlaceMatch'].forEach(function (p) {
  ok(codigo.indexOf(p) >= 0, '③ "' + p + '…" passa pela porta');
});
ok(/if \(!querL \|\| !querL\.uids\.length \|\| _mesmoTimePorUid\(atual, querL\)\)/.test(codigo),
  '③ ⛔ a troca da repescagem exige UIDs do novo ocupante antes de mover');
ok(/if \(!quer \|\| !quer\.uids\.length\) return;/.test(codigo),
  '③ ⛔⛔ o preenchimento normal desiste sem UID, em vez de escrever só o rótulo');

/* ── ④ A LEITURA DA IDENTIDADE NÃO INVENTA ────────────────────────────────── */
const i1 = codigo.indexOf('function _identidadeDoTime(');
const leitor = i1 < 0 ? '' : codigo.slice(i1, codigo.indexOf('\n}', i1));
ok(/_slotUids\(m, sl\)/.test(leitor) && /_slotObj\(m, sl\)/.test(leitor),
  '④ a identidade vem dos leitores canônicos do slot, não de campo escolhido a dedo');
ok(/if \(u\.length \|\| o\) return/.test(leitor),
  '④ ⛔ e só devolve quando REALMENTE achou identidade — devolver vazio reabriria o buraco');

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✅ ') + pass + ' verificações');
process.exit(fail ? 1 : 0);
