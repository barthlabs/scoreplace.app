/* A PÍLULA "ver mais/ver menos", DE VERDADE, PRO SANDBOX DOS TESTES.
 *
 * ⚠️ POR QUE ISTO EXISTE: em 26/ago a definição foi IÇADA de dentro de `renderDashboard`
 * pro escopo do arquivo — porque, presa lá dentro, ela só existia depois de a dashboard ter
 * renderizado, e quem abria um TORNEIO direto não tinha botão nenhum (relato do dono:
 * _"cadê o ver mais/ver menos?"_).
 * Só que os harnesses RECORTAM o corpo de `renderDashboard` e o rodam em `with (window)` —
 * e o recorte deixou de conter a definição.
 *
 * ⛔ E STUB AQUI FALSIFICARIA O TESTE: duas suítes afirmam a MARCAÇÃO da pílula. Um stub
 * devolvendo `''` (ou um `<span>` inventado) faria elas passarem sem provar nada.
 * ⇒ Extrai a função REAL do fonte e devolve ela. Se o desenho mudar, os testes veem a
 * mudança — que é exatamente o que eles existem pra fazer.
 */
module.exports = function pilulaDoFonte(src) {
  var ini = src.indexOf('function _verMaisTag(id, colapsado, extra) {');
  if (ini < 0) throw new Error('[pilula-ver-mais] não achei `_verMaisTag` no fonte da dashboard — ' +
    'ela mudou de nome ou de lugar; conserte AQUI em vez de stubar, senão o teste passa sem provar.');
  var fim = src.indexOf('\n}', ini);
  if (fim < 0) throw new Error('[pilula-ver-mais] não achei o fim da função');
  // eslint-disable-next-line no-new-func
  return new Function('return (' + src.slice(ini, fim + 2).replace(/^function /, 'function ') + ');')();
};
