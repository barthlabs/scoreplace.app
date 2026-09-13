/* O QUE É UM CEP PREFERIDO — regra pura, num lugar só, porque o campo tem DUAS FORMAS vivas.
 *
 * ⛔ O DEFEITO QUE ISTO EXISTE PARA FECHAR, medido em produção em 13/set/2026:
 *   • 42 perfis guardam `preferredCeps` como STRING ("04533-010, 01310-000") — é o que o
 *     editor de perfil grava;
 *   • 3 perfis guardam como ARRAY, e os três estão VAZIOS (`[]`).
 *
 * ⭐ E DÁ PARA DIZER DE ONDE VIERAM OS TRÊS, sem chutar. A fusão de contas fazia
 * `unionArr(novo.preferredCeps, velho.preferredCeps)`, e `unionArr` começa com
 * `Array.isArray(a) ? a.slice() : []`. Contra uma STRING isso devolve `[]` — conferido:
 *     unionArr("04533-010,01310-000", undefined) === []
 * Ou seja, a fusão APAGAVA os CEPs da pessoa e ainda trocava o tipo do campo.
 *
 * ⛔ E O TIPO TROCADO MATAVA O AVISO. `_checkNearbyTournaments` fazia
 * `(cu.preferredCeps || '').split(',')`, e `[].split` não existe:
 *     ([]).split(",")  →  TypeError: [].split is not a function
 * A função inteira morria na primeira linha útil — então as 2 contas VIVAS com array (a
 * terceira é lápide) simplesmente pararam de receber "tem torneio perto de você", sem erro
 * visível para ninguém. [[feedback_a_defesa_vaza_pela_borda]]
 *
 * ⚠️ A SAÍDA NÃO É ESCOLHER UM TIPO E MIGRAR. Migrar 45 documentos não impede a próxima
 * gravação de chegar na outra forma — quem grava é o editor, e ele grava string. O que fecha
 * o defeito é TODO LEITOR passar por aqui, aceitando as duas formas. Normalizar o banco vira
 * opcional, não pré-requisito.
 */
'use strict';

/** Os CEPs de um perfil, sempre como lista de dígitos. Aceita string, array ou ausência. */
function cepsComoLista(valor) {
  var bruto = [];
  if (Array.isArray(valor)) bruto = valor;
  else if (typeof valor === 'string') bruto = valor.split(',');
  else if (valor !== null && valor !== undefined) bruto = [valor];
  var fora = [];
  for (var i = 0; i < bruto.length; i++) {
    var d = String(bruto[i] === null || bruto[i] === undefined ? '' : bruto[i]).replace(/\D/g, '');
    // ⚠️ 5 dígitos é o CEP antigo sem sufixo; menos que isso não localiza nada.
    if (d.length >= 5 && fora.indexOf(d) === -1) fora.push(d);
  }
  return fora;
}

/** União de duas formas quaisquer, sem destruir nenhuma — o que a fusão de contas precisa. */
function unirCeps(a, b) {
  var out = cepsComoLista(a);
  cepsComoLista(b).forEach(function (c) { if (out.indexOf(c) === -1) out.push(c); });
  return out;
}

module.exports = { cepsComoLista, unirCeps };
