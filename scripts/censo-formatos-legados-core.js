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
function texto(v) { return String(v == null ? '' : v).trim(); }
function faseCanonica(fase) {
  if (!fase || typeof fase !== 'object') return false;
  if (fase.kind === 'classification') {
    return !!(fase.classification &&
      (fase.classification.structure === 'round_robin' || fase.classification.structure === 'groups'));
  }
  return fase.kind === 'elimination' && !!(fase.elimination &&
    (fase.elimination.bracketType === 'single' || fase.elimination.bracketType === 'double'));
}
function rotuloDeFormatoLegado(t) {
  return ['Liga', 'Ranking', 'Suíço', 'Suico', 'Suíço Clássico', 'Eliminatórias Simples', 'Eliminatória Simples', 'Dupla Eliminatória']
    .indexOf(texto(t && t.format)) !== -1;
}

function classificarTorneio(t) {
  t = t || {};
  const combinado = temLista(t.combinedCategories);
  const eixos = temLista(t.genderCategories) || temLista(t.skillCategories) || temLista(t.customCategories);
  const fases = Array.isArray(t.phases) ? t.phases : [];
  return {
    // Todo torneio usa as partes canônicas. `_semPesados` ainda pode existir
    // exclusivamente para clientes nativos antigos, mas não distingue modelos
    // de torneio nem pode voltar a decidir uma leitura/escrita.
    partesCanonicas: true,
    categoriasCanonicas: combinado,
    categoriasPorEixos: !combinado && eixos,
    // Sem uma lista explícita, a configuração vigente é categoria única. Não
    // é ausência de dados: tratá-la assim produzia um falso alerta em todo
    // torneio inclusivo/de categoria única.
    categoriaUnicaSemConfiguracao: !combinado && !eixos,
    rankingLegado: temAlgumCampo(t, CAMPOS_RANKING_LEGADO),
    ligaAtual: temAlgumCampo(t, CAMPOS_LIGA_ATUAL),
    marcadorDeCompatibilidadeNativa: temCampo(t, '_semPesados'),
    semProjecaoDeFases: fases.length === 0,
    fasesNaoCanonicas: fases.some((fase) => !faseCanonica(fase)),
    rotuloDeFormatoLegado: rotuloDeFormatoLegado(t)
  };
}

function resumir(torneios) {
  const total = (torneios || []).length;
  const soma = {
    total, partesCanonicas: total, categoriasCanonicas: 0,
    categoriasPorEixos: 0, categoriaUnicaSemConfiguracao: 0, rankingLegado: 0,
    ligaAtual: 0, semMarcadorDeCompatibilidadeNativa: 0,
    semProjecaoDeFases: 0, fasesNaoCanonicas: 0, rotuloDeFormatoLegado: 0
  };
  (torneios || []).forEach((t) => {
    const c = classificarTorneio(t);
    ['categoriasCanonicas', 'categoriasPorEixos', 'categoriaUnicaSemConfiguracao', 'rankingLegado', 'ligaAtual',
      'semProjecaoDeFases', 'fasesNaoCanonicas', 'rotuloDeFormatoLegado']
      .forEach((k) => { if (c[k]) soma[k]++; });
    if (!c.marcadorDeCompatibilidadeNativa) soma.semMarcadorDeCompatibilidadeNativa++;
  });
  return soma;
}

module.exports = { classificarTorneio, resumir, CAMPOS_RANKING_LEGADO, CAMPOS_LIGA_ATUAL };
