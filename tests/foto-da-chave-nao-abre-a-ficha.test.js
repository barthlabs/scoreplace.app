'use strict';
/* ⛔ A FOTO E O NOME DA CHAVE NÃO ABREM A FICHA DE NINGUÉM.
 *
 * `_preloadPlayerPhotos` é a GÊMEA de `_preloadUserProfiles`: roda no mesmo momento, sobre as
 * mesmas pessoas — todo mundo que abre a chave —, só que para foto e nome. Ela ficou para trás
 * quando a irmã mudou de coleção, que é o padrão que esta auditoria já tinha nomeado uma vez:
 * "a mitigação cobre um caminho e não o irmão".
 *
 * Ela lia `users` (94 campos, `allow read: if request.auth != null`) para usar DOIS:
 * `displayName` e `photoURL`. MEDIDO em 13/set/2026, comparando as duas coleções:
 * a consulta por nome dá resultado **idêntico nos 263 nomes distintos**, e as **144 fotos**
 * estão todas no espelho. Nada na tela muda.
 *
 * ⚠️ SOBRA UMA LEITURA DE FICHA, E É PROPOSITAL: inscrito antigo sem uid só se reconhece pelo
 * e-mail gravado na inscrição, e o espelho não tem e-mail — é o que ele existe para não ter.
 * MEDIDO sobre os 269 inscritos de produção: 190 têm uid, 78 não têm uid NEM e-mail, e **UM**
 * cai nessa queda (dupla de um torneio ENCERRADO de junho, cujo e-mail resolve para conta com
 * foto). Este portão TRAVA em uma: na segunda, reprova — senão "só mais uma" alarga a porta
 * sem ninguém ver. [[feedback_a_defesa_vaza_pela_borda]]
 */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(raiz, 'js/views/bracket.js'), 'utf8');
let ok = 0;
const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };

/* ⛔ CONTAR SOBRE O CÓDIGO, NUNCA SOBRE O COMENTÁRIO. Hoje mesmo um portão meu deu resultado
 * errado porque a regex casou dentro de um comentário que EU tinha escrito ali para explicar
 * a regra. O texto que descreve a trava não pode acionar a trava. */
const semComentario = SRC.split('\n')
  .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
  .join('\n');

console.log('\n──── a foto da chave não abre a ficha de ninguém ────\n');

// ── ① o carregador existe e foi apontado para o espelho ─────────────────────
const i = semComentario.indexOf('async function _preloadPlayerPhotos');
must(i > 0, '① o carregador de fotos/nomes da chave existe');
const fim = semComentario.indexOf('\n}', semComentario.indexOf('await Promise.all(promises)', i));
const corpo = semComentario.slice(i, fim > i ? fim : undefined);

must(/var COL = window\._COLECAO_PERFIL_PUBLICO \|\| 'usersPublic';/.test(corpo),
  '① ⭐ ele resolve a coleção pelo espelho público, não escreve `users` na mão');
must(/else if \(p && typeof p === 'object'\)/.test(corpo),
  '① entradas nulas no elenco são ignoradas antes de ler displayName — repintar após placar não pode quebrar a tela');
must(/if \(!p \|\| typeof p !== 'object'\) return;/.test(corpo),
  '① os dois percursos de hidratação também descartam entradas nulas');

// ── ② os TRÊS caminhos de leitura por nome/uid vão ao espelho ───────────────
const porNome = /collection\(COL\)\s*\n?\s*\.where\('displayName', '==', name\)/.test(corpo);
must(porNome, '② ⭐ a consulta por NOME lê o espelho');
must(/collection\(COL\)\.where\(_fpId, 'in', lote\)\.get\(\)/.test(corpo),
  '② ⭐ o LOTE por uid (o caminho de 143 pessoas no Confra) lê o espelho');
must(/collection\(COL\)\.doc\(uid\)\.get\(\)/.test(corpo),
  '② ⭐ e o caminho de um uid só também');

// ── ③ a lápide continua sendo atravessada, agora PELO espelho ───────────────
const travessias = (corpo.match(/_userVivo\([^)]*\{ publico: true \}\)/g) || []).length;
must(travessias === 3,
  '③ ⭐ as 3 leituras do espelho atravessam a lápide SEM baixar ficha (achadas: ' + travessias + ')');
const todas = (corpo.match(/_userVivo\(/g) || []).length;
must(todas === 4 && todas - travessias === 1,
  '③ das ' + todas + ' travessias de lápide, exatamente UMA usa o leitor real — a da queda por e-mail');

// ── ④ SOBRA EXATAMENTE UMA leitura de ficha, e é a queda por e-mail ─────────
const fichas = (semComentario.match(/collection\('users'\)/g) || []).length;
must(fichas === 1,
  '④ ⛔ o arquivo inteiro tem UMA leitura de `users` (achadas: ' + fichas + ') — na segunda, este portão reprova');
must(/collection\('users'\)\s*\n?\s*\.where\('email', '==', p\.email\)/.test(semComentario),
  '④ ⭐ e ela é exatamente a queda por e-mail do inscrito SEM uid — o espelho não tem e-mail, de propósito');

// ── ⑤ CONTROLE: o portão tem dentes ────────────────────────────────────────
// ⛔ Um portão que só vê verde não prova nada.
const desfeito = semComentario.replace("var COL = window._COLECAO_PERFIL_PUBLICO || 'usersPublic';",
  "var COL = 'users';");
must(desfeito !== semComentario, '⑤ o controle de fato alterou a fonte');
must(!/var COL = window\._COLECAO_PERFIL_PUBLICO/.test(desfeito),
  '⑤ ⭐ desfeita a troca, a asserção ① iria vermelha — o portão tem dentes');
const aMais = semComentario.replace("window.FirestoreDB.db.collection('users')",
  "window.FirestoreDB.db.collection('users')\n      /*extra*/ && window.FirestoreDB.db.collection('users')");
must((aMais.match(/collection\('users'\)/g) || []).length === 2 &&
     (aMais.match(/collection\('users'\)/g) || []).length !== fichas,
  '⑤ ⭐ e uma segunda leitura de ficha mudaria a contagem — a trava do ④ é real');

console.log('\n✅ ' + ok + ' verificações');
