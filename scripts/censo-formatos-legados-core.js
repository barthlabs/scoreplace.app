/* Classificação pura do censo L9.
 *
 * Não escolhe migração nem escreve dados. Seu único trabalho é dizer quais
 * contratos antigos ainda aparecem em documentos reais, para que a retirada de
 * um fallback só ocorra com evidência mensurável.
 */
function temLista(v) { return Array.isArray(v) && v.length > 0; }
function temCampo(o, nome) { return Object.prototype.hasOwnProperty.call(o || {}, nome); }

// `Liga` é o contrato atual. `ranking*` são os nomes que o precederam e que a
// etapa 8 vai copiar para `liga*` antes de qualquer remoção de compatibilidade.
const CAMPOS_RANKING_LEGADO = [
  'rankingNewPlayerScore', 'rankingInactivity', 'rankingInactivityX',
  'rankingSeasonMonths', 'rankingOpenEnrollment'
];
const CAMPOS_LIGA_ATUAL = [
  'ligaNewPlayerScore', 'ligaInactivity', 'ligaInactivityX',
  'ligaSeasonMonths', 'ligaOpenEnrollment'
];
function temAlgumCampo(o, campos) { return campos.some((nome) => temCampo(o, nome)); }

function classificarTorneio(t) {
  t = t || {};
  const combinado = temLista(t.combinedCategories);
  const eixos = temLista(t.genderCategories) || temLista(t.skillCategories) || temLista(t.customCategories);
  return {
    dividido: temLista(t._semPesados),
    categoriasCanonicas: combinado,
    categoriasPorEixos: !combinado && eixos,
    categoriasSemDados: !combinado && !eixos,
    rankingLegado: temAlgumCampo(t, CAMPOS_RANKING_LEGADO),
    ligaAtual: temAlgumCampo(t, CAMPOS_LIGA_ATUAL),
    marcadorDeFonte: temCampo(t, '_semPesados')
  };
}

function resumir(torneios) {
  const total = (torneios || []).length;
  const soma = {
    total, divididos: 0, inteiros: 0, categoriasCanonicas: 0,
    categoriasPorEixos: 0, categoriasSemDados: 0, rankingLegado: 0,
    ligaAtual: 0, semMarcadorDeFonte: 0
  };
  (torneios || []).forEach((t) => {
    const c = classificarTorneio(t);
    if (c.dividido) soma.divididos++; else soma.inteiros++;
    ['categoriasCanonicas', 'categoriasPorEixos', 'categoriasSemDados', 'rankingLegado', 'ligaAtual']
      .forEach((k) => { if (c[k]) soma[k]++; });
    if (!c.marcadorDeFonte) soma.semMarcadorDeFonte++;
  });
  return soma;
}

module.exports = { classificarTorneio, resumir, CAMPOS_RANKING_LEGADO, CAMPOS_LIGA_ATUAL };
