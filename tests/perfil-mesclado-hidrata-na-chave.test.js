/* PERFIL MESCLADO HIDRATA NA CHAVE
 *
 * Um jogo pode carregar o UID antigo de uma conta que foi absorvida. A tela não pode
 * mostrar o nome da lápide, nem deixar "…" para sempre: usa _userVivo para alcançar o
 * perfil ativo e o associa ao UID antigo apenas para exibição.
 */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8');
let fail = 0;
function ok(c, m) { if (c) console.log('  ✓ ' + m); else { fail++; console.error('  ✗ ' + m); } }

/* ⚠️ ANCORADO NA FORMA DA CONSULTA, NÃO NO NOME DA COLEÇÃO. Em 2.3.6 a hidratação trocou
 * `users` pelo espelho público `usersPublic`, e a âncora antiga (que citava `users`) levou
 * este portão a recortar o arquivo inteiro e reprovar cinco linhas de uma vez — sem que
 * nada do que ele mede tivesse mudado. O que importa aqui é a travessia da lápide. */
const i = src.indexOf("db.collection(COL).where(_fb, 'in', lote).get().then");
const bloco = src.slice(i, src.indexOf('}).catch(function (e) {', i));
ok(i > 0, 'o preload em lote existe');
ok(/d\.mergedInto && typeof window\._userVivo === 'function/.test(bloco),
  'lápide de merge passa pelo resolvedor canônico');
ok(/window\._userVivo\(docLapide, \{ publico: true \}\)/.test(bloco),
  'o doc da lápide é resolvido até a conta viva — e PELO ESPELHO, sem baixar a ficha');
ok(/guardarPerfil\(uidAntigo, vivo\.data\)/.test(bloco),
  'o UID antigo do jogo recebe o perfil vivo somente no cache de exibição');
ok(/Promise\.all\(redirects\)/.test(bloco),
  'a hidratação espera a conta viva antes de concluir');

console.log(fail ? '❌ perfil-mesclado-hidrata-na-chave: ' + fail + ' falha(s)' : '✅ perfil-mesclado-hidrata-na-chave: OK');
process.exit(fail ? 1 : 0);
