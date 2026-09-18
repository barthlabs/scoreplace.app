'use strict';
/* ⛔ CONTAR PESSOAS NÃO PODE SIGNIFICAR BAIXAR PESSOAS.
 *
 * A pilha "N jogadores" da tela inicial mostra UM INTEIRO. Quando a contagem agregada do
 * Firestore não estava disponível, a queda fazia `collection('users').get()` — SEM limite —
 * e lia `.size`: os **279 documentos INTEIROS** (e-mail, celular, data de nascimento, token de
 * push) descarregados no aparelho de QUALQUER pessoa que abre a dashboard, para produzir um
 * número de três dígitos e jogar o resto fora.
 *
 * ⭐ O NÚMERO NÃO MUDA. Medido em 13/set/2026: `users` 279 · `usersPublic` 279, sem órfão nem
 * faltante. O espelho é escrito por Function, um documento por perfil.
 *
 * ⚠️ E os DOIS caminhos têm de mudar juntos. Trocar só o agregado deixaria a exposição viva
 * exatamente no caso raro — que é quando ninguém olha. É a forma do defeito que esta auditoria
 * já pegou duas vezes hoje. [[feedback_a_defesa_vaza_pela_borda]]
 */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(raiz, 'js/views/dashboard.js'), 'utf8');
let ok = 0;
const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };
// ⛔ contar sobre o CÓDIGO, nunca sobre o comentário que descreve a trava.
const semComentario = SRC.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

console.log('\n──── contar gente não é baixar gente ────\n');

// ── ① o contador existe e os DOIS caminhos vão ao espelho ──────────────────
const i = semComentario.indexOf("var COL = window._COLECAO_PERFIL_PUBLICO || 'usersPublic';");
must(i > 0, '① o contador resolve a coleção pelo espelho público');
const bloco = semComentario.slice(i, semComentario.indexOf('scoreplace_total_users_cache', i));
must(bloco.length > 0 && bloco.length < 2000, '① achei o bloco do contador inteiro');

must(/collection\(COL\)/.test(bloco) && /\.count\(\)\.get\(\)/.test(bloco),
  '① ⭐ caminho 1 (contagem agregada) conta o espelho');
must(/await window\.FirestoreDB\.db\.collection\(COL\)\.get\(\)/.test(bloco),
  '① ⭐ caminho 2 (a QUEDA, o que baixava os 279 inteiros) também');
must(!/collection\('users'\)/.test(bloco),
  '① ⛔ nenhum dos dois caminhos toca `users` — trocar só um deixaria o vazamento no caso raro');

// ── ② a queda continua existindo: não foi "consertada" apagando o recurso ──
must(/fullSnap/.test(bloco) && /\.size/.test(bloco),
  '② a queda por `.size` continua lá — o número segue aparecendo quando o agregado falha');

// ── ③ CONTROLE: o portão tem dentes ───────────────────────────────────────
const desfeito = bloco.replace(/collection\(COL\)/g, "collection('users')");
must(/collection\('users'\)/.test(desfeito),
  '③ ⭐ apontado de volta para `users`, a asserção ① iria vermelha — o portão tem dentes');

// ── ④ O QUE SOBRA NO ARQUIVO, E É OUTRO ASSUNTO ───────────────────────────
/* ⚠️ HONESTIDADE SOBRE O ESCOPO: esta leva é o CONTADOR. Sobram DOIS usos de `users` na
 * dashboard, e eles foram olhados um a um — não estimados:
 *   • 2 no documento do PRÓPRIO usuário (`.doc(cu.uid)` — caixa de avisos e o perfil dele),
 *     que não são ficha de terceiro e não têm por que sair daqui.
 *
 * ⭐ ERAM QUATRO até a etapa 7 (17/set/2026). Os outros 2 resolviam E-MAIL → conta
 * (`email_lower` e `email`) e SAÍRAM do navegador: a resolução por e-mail passou para o
 * servidor, na callable `getOwnEmailMergeCandidates`, que exige `email_verified` e exclui o
 * próprio uid (`excludeUid`). Baixar o teto de 4 para 2 não afrouxa o portão — aperta: a
 * asserção logo abaixo prova que os DOIS que ficaram são o doc do PRÓPRIO usuário, e a
 * terceira prova que NENHUMA resolução por e-mail sobrou no navegador.
 * O número fica travado aqui para que crescer seja VISÍVEL. */
const restantes = (semComentario.match(/collection\('users'\)/g) || []).length;
must(restantes === 2,
  '④ restam ' + restantes + ' usos de `users` na dashboard (esperado 2, ambos no doc PRÓPRIO)');
const proprios = (semComentario.match(/collection\('users'\)\s*\n?\s*\.?doc\(cu\.uid\)/g) || []).length;
must(proprios === 2,
  '④ ⭐ os dois são o documento do PRÓPRIO usuário — não é ficha de terceiro (achados: ' + proprios + ')');
const porEmail = (semComentario.match(/collection\('users'\)\.where\('email(?:_lower)?', '==',/g) || []).length;
must(porEmail === 0,
  '④ ⭐ e NENHUMA resolução e-mail→conta sobrou no navegador — ela vive na CF (achados: ' + porEmail + ')');

console.log('\n✅ ' + ok + ' verificações');
