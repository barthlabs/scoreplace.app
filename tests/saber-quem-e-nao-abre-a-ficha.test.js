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
 *   • resolução por E-MAIL (13 lugares) — o espelho não tem e-mail, de propósito;
 *   • o relatório de inscritos do organizador — ele MOSTRA e-mail, é o roster dele;
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
const bloco = STORE.slice(i, i + 700);
must(/collection\(_col\)\.doc\(pr\.uid\)/.test(bloco), '① ⭐ o caminho por uid lê o espelho');
must(/collection\(_col\)\.where\('displayName', '==', pr\.name\)/.test(bloco),
  '① ⭐ e o caminho por nome também');
must((bloco.match(/\{ publico: true \}/g) || []).length === 2,
  '① ⭐ os dois atravessam a lápide sem baixar ficha');
must(!/collection\('users'\)/.test(bloco), '① ⛔ nenhum dos dois toca `users`');

// ── ② a GÊMEA divergente: mesma pergunta, agora uma coleção só ─────────────
const iAuth = AUTH.indexOf("where('displayName_lower', '==', _nameLower).limit(8)");
must(iAuth > 0, '② a checagem de conflito de nome no save do perfil existe');
const antes = AUTH.slice(Math.max(0, iAuth - 300), iAuth);
must(/_COLECAO_PERFIL_PUBLICO/.test(antes),
  '② ⭐ ela passou a ler o espelho — baixava até 8 fichas para ler `id` e `mergedInto`');
must(/_COLECAO_PERFIL_PUBLICO/.test(DB.slice(Math.max(0, DB.indexOf("where('displayName_lower', '==', q)") - 300),
  DB.indexOf("where('displayName_lower', '==', q)"))),
  '② ⭐ e a gêmea `isDisplayNameTaken` continua no espelho — as duas na MESMA coleção');

// ── ③ transferência de organização: existência e conta viva, nunca campo ───
const htEspelho = (HT.match(/collection\(window\._COLECAO_PERFIL_PUBLICO \|\| 'usersPublic'\)/g) || []).length;
must(htEspelho === 3,
  '③ ⭐ os 3 caminhos que só perguntam "existe?/quem está vivo?" leem o espelho (achados: ' + htEspelho + ')');
const htFicha = (HT.match(/collection\('users'\)/g) || []).length;
must(htFicha === 3,
  '③ restam ' + htFicha + ' em `users`: as 2 resoluções por E-MAIL e a caixa de avisos do destinatário');
must((HT.match(/collection\('users'\)\.where\('email', '==',/g) || []).length === 2,
  '③ ⭐ e as duas por e-mail são mesmo por e-mail — o espelho não tem e-mail, de propósito');

// ── ④ CONTROLE: os portões têm dentes ─────────────────────────────────────
const desfeito = STORE.replace("var _col = window._COLECAO_PERFIL_PUBLICO || 'usersPublic';",
  "var _col = 'users';");
must(!/var _col = window\._COLECAO_PERFIL_PUBLICO/.test(desfeito),
  '④ ⭐ apontado de volta para `users`, a asserção ① iria vermelha');
const htDesfeito = HT.replace(/collection\(window\._COLECAO_PERFIL_PUBLICO \|\| 'usersPublic'\)/g,
  "collection('users')");
must((htDesfeito.match(/collection\('users'\)/g) || []).length === 6,
  '④ ⭐ e desfeitas as 3 da transferência, a contagem do ③ iria de 3 para 6');

console.log('\n✅ ' + ok + ' verificações');
