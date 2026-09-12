'use strict';
/* ⛔ DUAS TELAS IRMÃS NÃO PODEM TER PROTEÇÕES DIFERENTES.
 * A tela "Explorar" é alimentada por dois caminhos: a busca por nome e a lista de quem entrou
 * recentemente. A busca foi limitada em 2026 — antes entregava a ficha inteira de estranhos.
 * A lista de recentes ficou de fora e seguiu devolvendo `doc.data()` cru de até 30 pessoas
 * (telefone, nascimento, gênero, cidades) para o aparelho de quem abre a tela, embora a tela
 * mostre só nome e foto. Achado da L4: "a mitigação cobre um caminho e não o irmão".
 */
const assert = require('assert/strict'), fs = require('fs'), path = require('path');
const D = fs.readFileSync(path.join(__dirname, '..', 'js/firebase-db.js'), 'utf8');
let ok = 0; const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };

must(/^window\._CAMPOS_DE_LISTA = \[/m.test(D), '① a lista de campos é UMA, no topo do arquivo');
must((D.match(/window\._CAMPOS_DE_LISTA = \[/g) || []).length === 1,
  '① ⛔ declarada uma vez só — duas cópias divergem na primeira mudança');
must(/^window\._perfilDeLista = function \(raw\) \{/m.test(D), '① e uma porta única que a aplica');

const rec = D.slice(D.indexOf('async listRecentUsers'), D.indexOf('async listRecentUsers') + 1600);
must(/window\._perfilDeLista\(data\)/.test(rec), '② a lista de recentes passa pela porta');
must(!/results\[doc\.id\] = data;/.test(rec), '② ⛔ e não guarda mais o documento cru');

const bus = D.slice(D.indexOf('async searchUsers'), D.indexOf('async searchUsers') + 2200);
must(/var sanitize = window\._perfilDeLista;/.test(bus), '② a busca por nome usa a MESMA porta');
must(!/var PUBLIC_FIELDS = \[\s*\n/.test(D),
  '② ⛔ nenhuma cópia da lista escrita à mão sobrou');
must(/var PUBLIC_FIELDS = window\._CAMPOS_DE_LISTA\.concat\(\['city', 'preferredLocations'\]\)/.test(D),
  '② a terceira lista ESTENDE a base em vez de repeti-la — city e preferredLocations servem pra AGRUPAR, não pra exibir');

/* ③ o que a porta deixa passar — fixado por escrito, para mudança ser deliberada */
const campos = /window\._CAMPOS_DE_LISTA = \[([\s\S]*?)\]/.exec(D)[1];
/* ⛔ ORDEM DO DONO (12/set/2026): _"se nem aparece na tela, não deveria baixar"_ e _"puxar
 * apenas as informações que aparecem; se pedir mais, aí baixa mais"_. O `email` saiu por isso:
 * a tela mostra nome e foto. Quem não tem nome cai no rótulo genérico, que já existia. */
['email', 'email_lower', 'phone', 'birthDate', 'gender', 'preferredCeps', 'preferredLocations', 'linkedEmails', 'plan']
  .forEach((c) => must(!new RegExp("'" + c + "'").test(campos), '③ ⛔ `' + c + '` NÃO sai na lista'));
must(/'displayName'/.test(campos) && /'photoURL'/.test(campos),
  '③ e o que a tela realmente mostra — nome e foto — continua saindo');

console.log('\n✅ lista de pessoas não entrega a ficha inteira — ' + ok + ' verificações');
