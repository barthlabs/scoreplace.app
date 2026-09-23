/* A marca da categoria (`skillBySportSource`) nunca sobrevive a uma mudança manual.
 *
 * ⛔ POR QUE ESTE TESTE EXISTE. `skillBySport` guarda a categoria; a marca guarda de onde
 * ela veio (`'letzplay'` = apurada). As portas do servidor que mudavam a categoria não
 * tocavam na marca — então um valor DIGITADO ficava com selo de APURADO. Aqui prova-se a
 * regra; nos testes de emulador prova-se que as portas de fato a usam.
 *
 * ⛔ E prova-se o que o núcleo NÃO pode fazer: atribuir `'letzplay'`. Um reconciliador que
 * atribuísse fabricaria procedência — o abuso que a marca deveria impedir.
 */
const core = require('../functions/skill-source-core.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.error('  ✗', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + '  →  ' + JSON.stringify(a));

console.log('\n── UM LADO: a categoria mudou, saiu ou ficou ──');

eq(core.reconciliar({ 'Beach Tennis': 'B' }, { 'Beach Tennis': 'A' }, { 'Beach Tennis': 'letzplay' }),
  {}, 'categoria ALTERADA apaga a marca dela');

eq(core.reconciliar({ 'Beach Tennis': 'B' }, {}, { 'Beach Tennis': 'letzplay' }),
  {}, 'categoria REMOVIDA apaga a marca dela');

eq(core.reconciliar({ 'Beach Tennis': 'B' }, { 'Beach Tennis': 'B' }, { 'Beach Tennis': 'letzplay' }),
  { 'Beach Tennis': 'letzplay' }, 'categoria INTOCADA conserva a marca');

eq(core.reconciliar(
  { 'Beach Tennis': 'B', 'Tênis': '3ª' },
  { 'Beach Tennis': 'A', 'Tênis': '3ª' },
  { 'Beach Tennis': 'letzplay', 'Tênis': 'letzplay' }),
  { 'Tênis': 'letzplay' }, 'só a MEXIDA perde a marca; a outra modalidade fica intacta');

eq(core.reconciliar({}, { 'Beach Tennis': 'A' }, {}),
  {}, 'mapa sem marca nenhuma: não INVENTA marca');

eq(core.reconciliar({}, { 'Beach Tennis': 'A' }, { 'Beach Tennis': 'letzplay' }),
  {}, 'ÓRFÃ da modalidade que a chamada ACRESCENTA é limpa (é o caso da elegibilidade)');

eq(core.reconciliar({ 'Tênis': '3ª' }, { 'Tênis': '4ª' }, { 'Beach Tennis': 'letzplay' }),
  { 'Beach Tennis': 'letzplay' }, 'ÓRFÃ de modalidade NÃO MEXIDA fica: limpá-la seria agir fora da chamada');

eq(core.reconciliar({ 'Beach Tennis': 'B' }, { 'Beach Tennis': '' }, { 'Beach Tennis': 'letzplay' }),
  {}, 'categoria esvaziada (`\'\'`) é REMOÇÃO: descategorizar apaga a marca');

eq(core.reconciliar({ 'Beach Tennis': ' B ' }, { 'Beach Tennis': 'B' }, { 'Beach Tennis': 'letzplay' }),
  { 'Beach Tennis': 'letzplay' }, 'espaço em volta não é mudança de categoria');

eq(core.reconciliar(null, null, null), {}, 'entradas ausentes não derrubam nada');
eq(core.reconciliar({ x: 'A' }, { x: 'A' }, 'nao-e-mapa'), {}, 'fonte de tipo errado vira mapa vazio');

/* ⛔ O documento lido NÃO pode voltar mutado: quem chama grava o resultado, e mutar a
 * entrada produziria um "já estava assim" falso na comparação da porta. */
const fonteOriginal = { 'Beach Tennis': 'letzplay', 'Tênis': 'letzplay' };
core.reconciliar({ 'Beach Tennis': 'B' }, { 'Beach Tennis': 'A' }, fonteOriginal);
eq(fonteOriginal, { 'Beach Tennis': 'letzplay', 'Tênis': 'letzplay' },
  'o mapa RECEBIDO não é mutado');

const marcaNaoAtribuida = core.reconciliar({}, { 'Beach Tennis': 'A' }, {});
ok(Object.keys(marcaNaoAtribuida).length === 0
  && JSON.stringify(core.reconciliar({ a: '1' }, { a: '2' }, {})) === '{}',
  'o núcleo NUNCA atribui \'letzplay\' em nenhum caminho de um lado');

console.log('\n── DOIS LADOS: fusão de contas ──');
const M = (o) => core.reconciliarMerge(o);

eq(M({ categoriaKeep: { BT: 'A' }, fonteKeep: { BT: 'letzplay' },
  categoriaDrop: {}, fonteDrop: {}, categoriaFinal: { BT: 'A' } }),
  { BT: 'letzplay' }, 'categoria da SOBREVIVENTE vence e a marca é dela: conservada');

eq(M({ categoriaKeep: {}, fonteKeep: {},
  categoriaDrop: { BT: 'B' }, fonteDrop: { BT: 'letzplay' }, categoriaFinal: { BT: 'B' } }),
  { BT: 'letzplay' }, 'modalidade só na ABSORVIDA: a marca vai com ela, já pareada');

eq(M({ categoriaKeep: { BT: 'A' }, fonteKeep: {},
  categoriaDrop: { BT: 'B' }, fonteDrop: { BT: 'letzplay' }, categoriaFinal: { BT: 'A' } }),
  {}, 'CONFLITO e vence a sobrevivente: a marca da absorvida é APAGADA (não cola no valor dela)');

eq(M({ categoriaKeep: {}, fonteKeep: { BT: 'letzplay' },
  categoriaDrop: {}, fonteDrop: {}, categoriaFinal: {} }),
  {}, 'marca ÓRFÃ (sem categoria final) é apagada');

eq(M({ categoriaKeep: { BT: 'A' }, fonteKeep: { BT: 'letzplay' },
  categoriaDrop: { BT: 'A' }, fonteDrop: {}, categoriaFinal: { BT: 'A' } }),
  { BT: 'letzplay' }, 'EMPATE com fonteKeep presente: conserva a marca do KEEP');

eq(M({ categoriaKeep: { BT: 'A' }, fonteKeep: {},
  categoriaDrop: { BT: 'A' }, fonteDrop: { BT: 'letzplay' }, categoriaFinal: { BT: 'A' } }),
  {}, 'EMPATE com fonteKeep AUSENTE: fica SEM marca — nunca se completa com fonteDrop');

eq(M({ categoriaKeep: { BT: 'A' }, fonteKeep: { BT: 'letzplay' },
  categoriaDrop: { BT: 'B' }, fonteDrop: { BT: 'letzplay' }, categoriaFinal: { BT: 'B' } }),
  {}, 'vence a categoria da ABSORVIDA mas o keep tem categoria própria: nenhuma marca sobra');

eq(M({ categoriaKeep: { BT: 'A', 'Tênis': '3ª' }, fonteKeep: { BT: 'letzplay', 'Tênis': 'letzplay' },
  categoriaDrop: { BT: 'B' }, fonteDrop: {}, categoriaFinal: { BT: 'A', 'Tênis': '3ª' } }),
  { BT: 'letzplay', 'Tênis': 'letzplay' }, 'as duas modalidades pareadas do keep sobrevivem');

eq(M({ categoriaKeep: {}, fonteKeep: {},
  categoriaDrop: { BT: 'B' }, fonteDrop: { BT: 'letzplay' }, categoriaFinal: { BT: 'A' } }),
  {}, 'marca da absorvida NÃO pareada com o valor final é apagada');

eq(M({ categoriaKeep: { BT: 'A' }, fonteKeep: { BT: 'letzplay' },
  categoriaDrop: {}, fonteDrop: {}, categoriaFinal: { BT: '' } }),
  {}, 'categoria final vazia: a marca não tem no que grudar');

eq(M({}), {}, 'fusão sem nenhum mapa não inventa marca');
eq(M(null), {}, 'entrada ausente não derruba');

const semLetzplay = M({ categoriaKeep: { BT: 'A' }, fonteKeep: {}, categoriaDrop: { BT: 'A' },
  fonteDrop: {}, categoriaFinal: { BT: 'A' } });
ok(Object.values(semLetzplay).indexOf('letzplay') === -1,
  'o núcleo NUNCA atribui \'letzplay\' em nenhum caminho de fusão');

if (fail) { console.error('\n❌ marca-da-categoria: ' + pass + ' ok, ' + fail + ' falharam'); process.exit(1); }
console.log('\n✅ marca-da-categoria: ' + pass + ' ok');
