/* Classificação pura do censo L9.
 *
 * Não escolhe migração nem escreve dados. Seu único trabalho é dizer quais
 * contratos antigos ainda aparecem em documentos reais, para que a retirada de
 * um fallback só ocorra com evidência mensurável.
 */
function temLista(v) { return Array.isArray(v) && v.length > 0; }
function temCampo(o, nome) { return Object.prototype.hasOwnProperty.call(o || {}, nome); }

function classificarTorneio(t) {
  t = t || {};
  const combinado = temLista(t.combinedCategories);
  const eixos = temLista(t.genderCategories) || temLista(t.skillCategories) || temLista(t.customCategories);
  return {
    dividido: temLista(t._semPesados),
    categoriasCanonicas: combinado,
    categoriasPorEixos: !combinado && eixos,
    categoriasSemDados: !combinado && !eixos,
    rankingNovo: temCampo(t, 'rankingNewPlayerScore'),
    rankingInatividade: temCampo(t, 'rankingInactivity') || temCampo(t, 'rankingInactivityX'),
    ligaLegada: temCampo(t, 'ligaNewPlayerScore') || temCampo(t, 'ligaInactivity') || temCampo(t, 'ligaInactivityX'),
    marcadorDeFonte: temCampo(t, '_semPesados')
  };
}

function resumir(torneios) {
  const total = (torneios || []).length;
  const soma = {
    total, divididos: 0, inteiros: 0, categoriasCanonicas: 0,
    categoriasPorEixos: 0, categoriasSemDados: 0, rankingNovo: 0,
    rankingInatividade: 0, ligaLegada: 0, semMarcadorDeFonte: 0
  };
  (torneios || []).forEach((t) => {
    const c = classificarTorneio(t);
    if (c.dividido) soma.divididos++; else soma.inteiros++;
    ['categoriasCanonicas', 'categoriasPorEixos', 'categoriasSemDados', 'rankingNovo', 'rankingInatividade', 'ligaLegada']
      .forEach((k) => { if (c[k]) soma[k]++; });
    if (!c.marcadorDeFonte) soma.semMarcadorDeFonte++;
  });
  return soma;
}

module.exports = { classificarTorneio, resumir };
