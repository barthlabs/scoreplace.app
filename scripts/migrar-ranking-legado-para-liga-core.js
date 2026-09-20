/* Plano puro da etapa 8: `ranking*` → `liga*`.
 *
 * Não conhece Firestore e não escreve. O executor usa este plano para garantir
 * que uma migração de produção não tenha uma segunda regra escondida no script.
 */
const CAMPOS = Object.freeze({
  rankingNewPlayerScore: 'ligaNewPlayerScore',
  rankingInactivity: 'ligaInactivity',
  rankingInactivityX: 'ligaInactivityX',
  rankingSeasonMonths: 'ligaSeasonMonths',
  rankingOpenEnrollment: 'ligaOpenEnrollment'
});

const proprio = (obj, chave) => Object.prototype.hasOwnProperty.call(obj || {}, chave);
// false e 0 são configurações válidas; só null, undefined e string vazia significam ausência.
const preenchido = (valor) => valor !== null && valor !== undefined && valor !== '';

function planoDeMigracao(torneio) {
  const t = torneio || {};
  const preencher = {};
  const conflitos = [];
  const legado = [];

  Object.entries(CAMPOS).forEach(([antigo, atual]) => {
    if (!proprio(t, antigo)) return;
    legado.push(antigo);
    if (!preenchido(t[antigo])) return;
    if (!preenchido(t[atual])) {
      preencher[atual] = t[antigo];
    } else if (t[atual] !== t[antigo]) {
      // Nunca escolhe entre dois valores existentes: requer decisão humana.
      conflitos.push({ antigo, atual, valorLegado: t[antigo], valorAtual: t[atual] });
    }
  });

  return { legado, preencher, conflitos, prontoParaAposentar: legado.length > 0 && !conflitos.length };
}

module.exports = { CAMPOS, planoDeMigracao };
