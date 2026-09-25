'use strict';

/* ⛔⛔ UM "NÃO SOU EU" NÃO PODE TRANCAR A PERGUNTA PARA SEMPRE.
 *
 * MEDIDO em 25/set/2026, na coleção inteira (289 contas, 78 torneios):
 *   · existem 4 dispensas de suspeita de conta duplicada;
 *   · 3 foram gravadas com força 9 — o TOPO da escala, reservado a credencial;
 *   · a pergunta só volta diante de sinal ESTRITAMENTE mais forte. Como 9 é o teto, esses pares
 *     estavam trancados PARA SEMPRE — inclusive contra e-mail igual, que também vale 9;
 *   · o par medido é MÃE E FILHA — Marjorie Cilone (1954) e Ana Carolina Cilone (1981) —, o mesmo
 *     par que a varredura automática fundiu por engano em 19/ago/2026 às 4h45, desfeito em 22/ago.
 *     O veredito "não somos a mesma pessoa" está CERTO; o defeito é o CRÉDITO, que as tornou imunes
 *     a qualquer detecção futura.
 *     ⚠️ E as dispensas são de 18/ago — o DIA ANTERIOR à fusão indevida. Alguém já havia dito "não
 *     somos a mesma" e a varredura fundiu no dia seguinte de todo jeito. É por isso que a asserção ⑤
 *     abaixo — a fusão segue barrada mesmo com o crédito desacreditado — é a que mais importa aqui.
 *     ⚠️ Eu havia escrito "duas irmãs" neste comentário: inventei o parentesco a partir do sobrenome
 *     e nunca o medi. A anotação do incidente diz mãe e filha.
 *   · as 3 são de 18/ago; a regra que passou a exigir SMS dos dois lados para o celular valer como
 *     credencial entrou em 14/set. São registros ANTERIORES à regra que os justificaria.
 *   · e um registro apontava para o PRÓPRIO uid — o detector devolveu a pessoa como duplicata de
 *     si mesma.
 *
 * ⛔ A saída NÃO mexe em dado real: desconta na LEITURA, usando o precedente que o próprio arquivo
 * já tinha para a forma legada — crédito 0, porque "não dá pra afirmar que aquele 'não' cobria o
 * sinal de hoje".
 */
const assert = require('assert/strict');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const core = require(path.join(ROOT, 'functions', 'duplicate-person-core.js'));
const mergeRules = require(path.join(ROOT, 'functions', 'merge-rules.js'));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

console.log('\n──── a dispensa não vale para sempre ────\n');

/* A FORMA REAL, transcrita do documento de produção (uids encurtados). Os dois registros foram
 * gravados no mesmo instante: um para a outra pessoa, outro para a própria conta (o auto-par). */
const REAL = [
  { uid: 'ANA', forca: 9, motivo: 'celular', semelhanca: null, at: '2026-08-18T23:01:51.645Z' },
  { uid: 'MARJORIE', forca: 9, motivo: 'celular', semelhanca: null, at: '2026-08-18T23:01:51.642Z' },
];

// ── ① o crédito herdado vale 0 ───────────────────────────────────────────────
const mapa = core.mapaDeDispensados(REAL, 'MARJORIE');
ok(mapa.ANA === 0,
  '① ⭐⭐ a dispensa por celular de 18/ago vale 0 — antes valia 9, o teto, e trancava para sempre');
ok(!Object.prototype.hasOwnProperty.call(mapa, 'MARJORIE'),
  '① ⛔ e o AUTO-PAR sai do mapa: dispensar-se de si mesma não diz nada');

// ── ② registro sob a regra NOVA continua valendo credencial ──────────────────
const recente = core.mapaDeDispensados(
  [{ uid: 'X', forca: 9, motivo: 'celular', at: '2026-09-20T10:00:00.000Z' }], 'EU');
ok(recente.X === 9,
  '② ⛔ celular gravado DEPOIS da regra nova vale 9 — ali passou pelo SMS dos dois lados');

// ── ③ o nome nunca foi crédito herdado ───────────────────────────────────────
const porNome = core.mapaDeDispensados(
  [{ uid: 'Y', forca: 6, motivo: 'nome', semelhanca: 'identico', at: '2026-08-01T00:00:00.000Z' }], 'EU');
ok(porNome.Y === 6, '③ dispensa por NOME mantém a força: a regra dela não mudou');
ok(core.creditoHerdado({ motivo: 'nome', at: '2026-08-01T00:00:00.000Z' }) === false,
  '③ e o classificador diz isso explicitamente');
ok(core.creditoHerdado({ motivo: 'celular' }) === true,
  '③ ⛔ registro de celular SEM data conta como herdado — não dá pra afirmar que passou pela regra nova');

// ── ④ a forma legada (só uid) segue valendo 0, como já valia ──────────────────
const legado = core.mapaDeDispensados(['Z', 'EU'], 'EU');
ok(legado.Z === 0 && !Object.prototype.hasOwnProperty.call(legado, 'EU'),
  '④ lista legada de uids: crédito 0, e o auto-par também sai');

// ── ⑤ ⛔ MAS A FUSÃO CONTINUA BARRADA ────────────────────────────────────────
/* O desconto serve para VOLTAR A PERGUNTAR, nunca para autorizar fusão: fusão apaga uma conta e
 * não tem volta. É o mesmo sinal bastando para uma coisa e não para a outra. */
/* ⛔ NOME REAL: `dismissalBlocksMerge`. A primeira versão desta suíte chamou um nome inventado e
 * caiu num ramo "não medi" — asserção vazia é o que eu mais evito, e eu escrevi uma. */
const barra = mergeRules.dismissalBlocksMerge({ dupDismissedInfo: REAL }, {}, 'MARJORIE', 'ANA');
ok(barra && barra.dismissed === true,
  '⑤ ⭐⭐ a FUSÃO segue barrada pelo MESMO registro desacreditado — crédito 0 deixa perguntar, não fundir');
ok(barra && barra.by === 'MARJORIE', '⑤ e diz quem dispensou');

/* ⛔ e o auto-par NÃO barra: barrar a fusão da conta com ela mesma fecharia o caminho da
 * reivindicação de conta. */
const auto = mergeRules.dismissalBlocksMerge(
  { dupDismissedInfo: [{ uid: 'EU', forca: 9, motivo: 'celular', at: '2026-08-18T23:01:51.642Z' }] },
  {}, 'EU', 'EU');
ok(auto && auto.dismissed === false,
  '⑤ ⛔ auto-par NÃO barra fusão — senão fechava o caminho de reivindicar a própria conta');

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✅ ') + pass + ' verificações');
process.exit(fail ? 1 : 0);
