/* form-nao-perde-div — o HTML do formulário de torneio não pode ficar com <div> aberta.
 *
 * FALHA REAL (2.0.10, 22/ago/2026): ao trocar as 4 pílulas de proporção pelo controle único,
 * o `</div>` que fechava `#gender-ratio-box` foi apagado junto. Uma div a menos, e o
 * navegador ANINHA todo o resto dentro dela — `#tiebreaker-section` foi parar DENTRO de
 * `#fase1-box`.
 *
 * O estrago não ficou no visual. O reorder do setup faz
 *     tb.parentNode.insertBefore(f1, tb.nextSibling)
 * e, com tb dentro de f1, isso é enfiar o pai dentro do filho:
 *     HierarchyRequestError: The new child element contains the parent.
 * A exceção derruba `setupCreateTournamentModal()` NO MEIO — e tudo que ela define depois
 * daquela linha deixa de existir: `openEditTournamentModal`, `openCreateTournament`,
 * `_recalcDuration`, `_ctSetRatio`, `_f2MountInEditForm`…
 *
 * Resultado em produção: CRIAR e EDITAR torneio pararam. E em silêncio — o call-site da
 * edição testa `typeof window.openEditTournamentModal === 'function'`, dá falso, e abre um
 * formulário em branco "Criar Novo Torneio". Zero erro no console.
 *
 * Mesma lição do css-nao-perde-regra.test.js: bloco sem fechamento não dá erro de sintaxe —
 * engole o resto calado. `node --check` passa, o arquivo serve, e a tela quebra.
 */
const fs = require('fs');
const path = require('path');

let falhas = 0;
const ok = (nome, cond, extra) => {
  if (cond) { console.log('  ✓ ' + nome); return; }
  console.log('  ✗ ' + nome + (extra ? '\n      ' + extra : '')); falhas++;
};

console.log('──── o formulário de torneio não perde <div> ────');

const ARQ = path.join(__dirname, '..', 'js', 'views', 'create-tournament.js');
const src = fs.readFileSync(ARQ, 'utf8');

// O template literal do modal: de `const modalHtml = \`` até o uso em createInteractiveElement.
const iDecl = src.indexOf('const modalHtml');
const iIni = src.indexOf('`', iDecl) + 1;
const iUso = src.indexOf('createInteractiveElement(modalHtml)');
ok('achei o template do modal no create-tournament.js', iDecl > 0 && iIni > 0 && iUso > iIni);

const bloco = src.slice(iIni, src.lastIndexOf('`', iUso));
const abre = (bloco.match(/<div\b/g) || []).length;
const fecha = (bloco.match(/<\/div>/g) || []).length;
ok('<div> abertas === </div> fechadas', abre === fecha,
  'abre ' + abre + ', fecha ' + fecha + ' → saldo ' + (abre - fecha) +
  (abre > fecha ? ' (falta fechar: o resto do form vira filho dessa div)' : ' (sobra fechamento)'));

// Além do saldo: as seções que o reorder do setup move TÊM que ser irmãs, nunca aninhadas.
// É a condição exata que lançava o HierarchyRequestError.
const pos = (id) => bloco.indexOf('id="' + id + '"');
const idsDoReorder = ['tiebreaker-section', 'fase1-box', 'phases-section'];
idsDoReorder.forEach((id) => ok('a seção #' + id + ' existe no form', pos(id) >= 0));

// Profundidade de aninhamento no ponto em que cada id aparece: se forem irmãs, a
// profundidade é a MESMA. Difere → uma está dentro da outra e o insertBefore explode.
function profundidadeEm(indice) {
  const ate = bloco.slice(0, indice);
  return (ate.match(/<div\b/g) || []).length - (ate.match(/<\/div>/g) || []).length;
}
const profs = idsDoReorder.map((id) => ({ id: id, p: profundidadeEm(pos(id)) }));
const todasIguais = profs.every((x) => x.p === profs[0].p);
ok('as 3 seções do reorder estão no MESMO nível (irmãs)', todasIguais,
  profs.map((x) => x.id + '=' + x.p).join('  ') +
  '  → níveis diferentes significam aninhada, e aí tb.parentNode.insertBefore(f1, …) ' +
  'tenta pôr o pai dentro do filho (HierarchyRequestError) e derruba o setup no meio');

console.log(falhas === 0
  ? '\n✅ form-nao-perde-div: OK'
  : '\n❌ form-nao-perde-div: ' + falhas + ' falha(s)');
process.exit(falhas === 0 ? 0 : 1);
