'use strict';
/* ⛔ SABER QUEM ALGUÉM É NÃO PODE EXIGIR ABRIR A FICHA DESSA PESSOA.
 *
 * Seis lugares do cliente perguntavam "essa conta existe?", "quem é a conta viva?" ou
 * "qual o gênero/nível/idade dessa pessoa?" — e respondiam BAIXANDO `users/{uid}`, que é
 * `allow read: if request.auth != null` e guarda 94 campos. Nenhum dos seis usava e-mail,
 * telefone ou qualquer campo privado: usavam `displayName`, `gender`, `skillBySport`,
 * `birthDate`, `mergedInto` — ou só a EXISTÊNCIA do documento.
 *
 * ⛔ O CASO MAIS FEIO ERA UMA GÊMEA DIVERGENTE. `FirestoreDB.isDisplayNameTaken` e a
 * checagem de conflito dentro do save do perfil fazem a consulta IDÊNTICA
 * (`displayName_lower`, limite 8, ignorando lápide). A primeira passou para o espelho na
 * 2.3.2; a segunda ficou em `users` e seguiu baixando até 8 fichas inteiras para ler `id` e
 * `mergedInto`. Mesma pergunta, duas coleções — o padrão que esta auditoria já nomeou:
 * "a mitigação cobre um caminho e não o irmão". [[feedback_unify_dual_entry_points]]
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

// ── ② a GÊMEA divergente: mesma pergunta, agora uma coleção só ─────────────
const iAuth = AUTH.indexOf("where('displayName_lower', '==', _nameLower).limit(8)");
must(iAuth > 0, '② a checagem de conflito de nome no save do perfil existe');
// idem: ancorado no início da declaração, não em 300 caracteres para trás.
const antes = AUTH.slice(AUTH.lastIndexOf('var _nameSnap', iAuth), iAuth);
must(/_COLECAO_PERFIL_PUBLICO/.test(antes),
  '② ⭐ ela passou a ler o espelho — baixava até 8 fichas para ler `id` e `mergedInto`');
const _iq = DB.indexOf("where('displayName_lower', '==', q)");
must(/_COLECAO_PERFIL_PUBLICO/.test(DB.slice(DB.lastIndexOf('var snap', _iq), _iq)),
  '② ⭐ e a gêmea `isDisplayNameTaken` continua no espelho — as duas na MESMA coleção');

// ── ③ transferência de organização: existência e conta viva, nunca ficha ───
const htEspelho = (HT.match(/collection\(window\._COLECAO_PERFIL_PUBLICO \|\| 'usersPublic'\)/g) || []).length;
must(htEspelho === 1,
  '③ ⭐ o caminho que só pergunta "existe?/quem está vivo?" lê o espelho (achados: ' + htEspelho + ')');
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
const htDesfeito = HT.replace(/collection\(window\._COLECAO_PERFIL_PUBLICO \|\| 'usersPublic'\)/g,
  "collection('users')");
must((htDesfeito.match(/collection\('users'\)/g) || []).length === 2,
  '④ ⭐ desfeita a consulta pública, a contagem do ③ iria de 1 para 2');

console.log('\n✅ ' + ok + ' verificações');
