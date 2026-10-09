'use strict';
/* ⛔ SABER QUEM ALGUÉM É NÃO PODE EXIGIR ABRIR A FICHA DESSA PESSOA.
 *
 * Seis lugares do cliente perguntavam "essa conta existe?", "quem é a conta viva?" ou
 * "qual o gênero/nível/idade dessa pessoa?" — e respondiam BAIXANDO `users/{uid}`, que é
 * `allow read: if request.auth != null` e guarda 94 campos. Nenhum dos seis usava e-mail,
 * telefone ou qualquer campo privado: usavam `displayName`, `gender`, `skillBySport`,
 * `birthDate`, `mergedInto` — ou só a EXISTÊNCIA do documento.
 *
 * ⛔ O CASO MAIS FEIO ERA UMA GÊMEA DIVERGENTE. A antiga consulta client-side de conflito
 * de nome foi removida: reserva de nome é transacional e exclusivamente server-side.
 *
 * ⚠️ O QUE NÃO ENTROU NESTA LEVA, E POR QUÊ (medido, não estimado):
 *   • a própria caixa de notificações — cada conta segue lendo somente a sua;
 *   • a ficha pública da análise — lê `city`, que ainda não está no espelho (98 de 279
 *     perfis têm cidade preenchida, então tirar o campo da tela seria regressão real).
 */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
let ok = 0;
const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };
const ler = (f) => fs.readFileSync(path.join(raiz, f), 'utf8')
  .split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');  // ⛔ código, não comentário

const STORE = ler('js/store.js');
const AUTH = ler('js/views/auth.js');
const HT = ler('js/views/host-transfer.js');
const DB = ler('js/firebase-db.js');

console.log('\n──── saber quem é não abre a ficha ────\n');

// ── ① perfis por NOME (badges de gênero/nível/idade e o sorteio) ───────────
const i = STORE.indexOf('var _col = window._COLECAO_PERFIL_PUBLICO');
must(i > 0, '① o carregador de perfis por nome resolve pelo espelho');
/* ⚠️ ANCORADO NO FIM DO CONSTRUTO, não numa janela de N caracteres. Escrevi
 * `slice(i, i + 700)` e o portão-meta `teste-nao-recorta-por-tamanho-fixo` me reprovou com
 * a razão certa: janela fixa quebra sozinha assim que um comentário empurra a linha para
 * fora, e teste que falha sem defeito ensina a ignorar teste. */
const bloco = STORE.slice(i, STORE.indexOf('proms.push(', i));
must(/collection\(_col\)\.doc\(pr\.uid\)/.test(bloco), '① ⭐ o caminho por uid lê o espelho');
must(/collection\(_col\)\.where\('displayName', '==', pr\.name\)/.test(bloco),
  '① ⭐ e o caminho por nome também');
must((bloco.match(/\{ publico: true \}/g) || []).length === 2,
  '① ⭐ os dois atravessam a lápide sem baixar ficha');
must(!/collection\('users'\)/.test(bloco), '① ⛔ nenhum dos dois toca `users`');

// ── ② o portão de nome não pode reaparecer no navegador ────────────────────
must(!/isDisplayNameTaken\s*\(/.test(DB),
  '② ⭐ não existe mais checagem client-side de nome com falha aberta');
must(!/displayName_lower',\s*'=='/.test(AUTH),
  '② ⭐ o save do perfil não consulta nomes de terceiros no navegador');

// ── ③ transferência de organização: UID confirmado, nunca ficha ────────────
const htEspelho = (HT.match(/collection\(window\._COLECAO_PERFIL_PUBLICO \|\| 'usersPublic'\)/g) || []).length;
must(htEspelho === 0,
  '③ ⭐ a notificação usa o UID confirmado pela Function e não relê perfil algum (achados: ' + htEspelho + ')');
const htFicha = (HT.match(/collection\('users'\)/g) || []).length;
must(htFicha === 1,
  '③ resta só a caixa de avisos da própria conta (achados: ' + htFicha + ')');
must(!/collection\('users'\)\.where\('email', '==',/.test(HT),
  '③ ⛔ transferência não resolve conta por e-mail no navegador');

// ── ④ CONTROLE: os portões têm dentes ─────────────────────────────────────
const desfeito = STORE.replace("var _col = window._COLECAO_PERFIL_PUBLICO || 'usersPublic';",
  "var _col = 'users';");
must(!/var _col = window\._COLECAO_PERFIL_PUBLICO/.test(desfeito),
  '④ ⭐ apontado de volta para `users`, a asserção ① iria vermelha');
const htDesfeito = HT.replace('_resolveAndSend(uid);',
  "window.FirestoreDB.db.collection('users').doc(uid).get().then(function(){ _resolveAndSend(uid); });");
must((htDesfeito.match(/collection\('users'\)/g) || []).length === 2,
  '④ ⭐ reintroduzida uma consulta de ficha, a contagem do ③ iria de 1 para 2');

console.log('\n✅ ' + ok + ' verificações');
