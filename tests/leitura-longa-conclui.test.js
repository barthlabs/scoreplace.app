/* A LEITURA DE UM PERFIL LONGO TEM QUE CABER NO TEMPO QUE ELA TEM.
 *
 * Relato do dono (17/ago/2026): _"o letzplay demora demais nos perfis mais longos e nao
 * conclui, nao ficam verdes e dai nao puxa mais nada"_. Os três sintomas são o mesmo
 * defeito, e ele é ARITMÉTICO — dá pra provar sem rede nenhuma:
 *
 *   • o freio DOBRA a cada bloqueio (gap × 2 + 400) até um teto;
 *   • com o teto antigo de 60 s por operação, ~140 requisições em 2 correntes levavam
 *     ~87 min — contra um teto de RODADA de 30 min. A rodada estourava, encadeava outra,
 *     e a leitura nunca fechava: "demora demais e não conclui";
 *   • a soltura era 10% a cada 12 sucessos: 40 reduções, ou seja 480 requisições
 *     BEM-SUCEDIDAS SEGUIDAS para voltar ao passo de fábrica. Um perfil grande tem ~140
 *     no total — a leitura NUNCA saía do castigo;
 *   • e o castigo fica gravado por 6 h: "daí não puxa mais nada".
 *
 * O invariante que este arquivo guarda: **o pior caso do passo tem que caber no teto da
 * rodada, e sair do castigo tem que custar menos requisições do que uma leitura tem.**
 * Forma nova de "a leitura não termina" entra NESTE arquivo.
 *
 * Roda com: node tests/leitura-longa-conclui.test.js
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let falhas = 0, testes = 0;
function ok(cond, msg) {
  testes++;
  if (cond) console.log('  ✓ ' + msg);
  else { falhas++; console.log('  ✗ ' + msg); }
}

const bg = read('extension/background.js');
const ct = read('extension/content.js');

// ── os números REAIS, lidos do arquivo (nunca copiados pra cá) ──────────────────────
const mDef = bg.match(/var _Q_DEFAULTS = \{ gap: (\d+), floor: (\d+), min: (\d+), max: (\d+) \};/);
ok(!!mDef, 'os parâmetros da fila são legíveis no background.js');
const GAP = +mDef[1], MAX = +mDef[4];
// ⚠️ O TETO (60s) NÃO É O LIMITE DE VIABILIDADE, e essa distinção é o coração do conserto.
// O teto existe pra NÃO martelar durante bloqueio sustentado (lição da v1.36, travada em
// letzplay-pace.test.js — baixá-lo prolonga o castigo do letzplay). O limite de
// viabilidade é outro: acima dele a leitura não cabe mais na rodada, e a resposta certa é
// PARAR e dizer, nunca acelerar.
const mInv = bg.match(/var _Q_INVIAVEL = (\d+);/);
ok(!!mInv, 'existe um limite de VIABILIDADE, separado do teto do freio');
const INVIAVEL = mInv ? +mInv[1] : MAX;
ok(INVIAVEL < MAX, 'VIABILIDADE · o limite de viabilidade (' + INVIAVEL + 'ms) é menor que o teto do freio (' + MAX + 'ms)');
ok(MAX >= 60000, 'FREIO · o teto continua em 60s — baixá-lo prolongaria o bloqueio (lição da v1.36)');

const mSlots = bg.match(/var _Q_SLOTS = (\d+);/);
const SLOTS = mSlots ? +mSlots[1] : 1;
ok(SLOTS >= 1, 'o número de correntes é legível (' + SLOTS + ')');

const mTeto = ct.match(/var limite = Date\.now\(\) \+ (\d+);/);
ok(!!mTeto, 'o teto da rodada é legível no content.js');
const TETO_RODADA = +mTeto[1];

// ── 1. O PIOR CASO TEM QUE CABER NO TETO DA RODADA ──────────────────────────────────
// Perfil grande medido em produção: Camila Calia, 487 jogos declarados. Em requisições:
// ~24 páginas de histórico + ~35 torneios + ~30 rankings + índice ≈ 140.
const REQS_PERFIL_GRANDE = 140;
// a espera real é sorteada 0,7×–1,8× do gap → média 1,25×
const piorCasoMs = (REQS_PERFIL_GRANDE / SLOTS) * INVIAVEL * 1.25;
ok(piorCasoMs < TETO_RODADA,
   'PIOR CASO · ' + REQS_PERFIL_GRANDE + ' requisições no limite de viabilidade (' + INVIAVEL + 'ms) levam ' +
   Math.round(piorCasoMs / 60000) + 'min e cabem no teto de ' + Math.round(TETO_RODADA / 60000) + 'min');
// e acima dele, arrastar deixa de ser opção
ok((REQS_PERFIL_GRANDE / SLOTS) * MAX * 1.25 > TETO_RODADA,
   'PIOR CASO · no teto do freio a leitura NÃO caberia — por isso ali ela tem que parar, não insistir');

// ── 2. SAIR DO CASTIGO TEM QUE CUSTAR MENOS QUE UMA LEITURA ─────────────────────────
const mSol = bg.match(/if \(_q\.okStreak < (\d+)\) return;/);
const mFat = bg.match(/Math\.round\(_q\.gap \* (0\.\d+)\)\)/);
ok(!!mSol && !!mFat, 'os parâmetros de soltura são legíveis');
const STREAK = +mSol[1], FATOR = +mFat[1];
let g = MAX, reducoes = 0;
while (g > GAP && reducoes < 500) { g = Math.max(700, Math.round(g * FATOR)); reducoes++; }
const custoSaida = reducoes * STREAK;
ok(custoSaida <= REQS_PERFIL_GRANDE,
   'SOLTURA · voltar do teto ao passo normal custa ' + custoSaida +
   ' requisições boas — cabe numa leitura de ' + REQS_PERFIL_GRANDE);

// ── 3. SUBIR E DESCER PRECISAM SER COMPARÁVEIS ──────────────────────────────────────
// O castigo dobra; se a soltura for muito mais lenta que isso, um bloqueio isolado
// contamina a leitura inteira. Não precisam ser simétricos — precisam ser da mesma ordem.
const passosParaTeto = (() => { let x = GAP, n = 0; while (x < MAX && n < 50) { x = Math.min(MAX, Math.round(x * 2) + 400); n++; } return n; })();
ok(reducoes <= passosParaTeto * 4,
   'EQUILÍBRIO · sobe em ' + passosParaTeto + ' bloqueios e desce em ' + reducoes +
   ' reduções (a descida não pode ser ordens de grandeza mais lenta)');

// ── 4. O TETO ENCOSTADO PRECISA SER OBSERVÁVEL ──────────────────────────────────────
// Sem isto, "o letzplay está limitando" é indistinguível de "o app travou" — para o
// usuário E para mim, que passei a investigar isso às cegas.
ok(/function _qNoTeto\(\)/.test(bg), 'SINAL · existe como perguntar se o passo encostou no teto');
ok(/_q\.gap >= _Q_INVIAVEL && _q\.blocks > 0/.test(bg),
   'SINAL · inviável = passou do limite de viabilidade E houve bloqueio de verdade');
ok(/noTeto: _qNoTeto\(\)/.test(bg), 'SINAL · o estado sai junto com as estatísticas da fila');

// ── 4b. PARAR E DIZER, EM VEZ DE ARRASTAR EM SILÊNCIO ───────────────────────────────
// Sem isto, ficar 87 min no teto é indistinguível de travar — e foi assim que o sintoma
// chegou até mim: "demora demais e não conclui", sem nenhum sinal de POR QUÊ.
ok(/_lerPace\(\);/.test(ct), 'PARAR · a leitura consulta o ritmo da fila durante o trabalho');
ok(/Date\.now\(\) - _paceLidoEm < 10000/.test(ct),
   'PARAR · a consulta é limitada no tempo (não uma pergunta por operação)');
// sem prender ao nome da variável local — isso é detalhe de escrita, não invariante
ok(/\.code = 'rate-limit-duro'/.test(ct), 'PARAR · há um motivo próprio pra limitação dura');
ok(/Date\.now\(\) - _inviavelDesde > 60000/.test(ct),
   'PARAR · tolera um pico isolado (60s) antes de desistir — não aborta leitura que ia terminar');
ok(/e\.code === 'rate-budget' \|\| e\.code === 'rate-limit-duro'/.test(ct),
   'PARAR · limitação dura é PAUSA, não falha: o que já foi lido continua valendo');
// ⚠️ e o inverso: sem bloqueio, nada disso pode disparar
ok(/_inviavelDesde = 0;/.test(ct), 'PARAR · o contador zera assim que o ritmo volta ao normal');

// ── 5. O QUE NÃO PODE REGREDIR: o freio continua existindo ──────────────────────────
// ⚠️ Afrouxar demais é pior que travar: leva a bloqueio de verdade, e aí não é lentidão,
// é a conta do usuário apanhando.
ok(/_q\.gap = Math\.min\(_q\.max, Math\.round\(_q\.gap \* 2\) \+ 400\)/.test(bg),
   'FREIO · o castigo continua dobrando a cada bloqueio');
ok(GAP >= 600, 'FREIO · o passo de fábrica não virou rajada (' + GAP + 'ms)');
ok(SLOTS <= 2, 'FREIO · o paralelismo continua baixo (' + SLOTS + ' correntes)');
// ⚠️ o castigo TEM que expirar — e num prazo compatível com uma sessão de trabalho. Com
// 6h, reler 12 perfis fazia a fila apanhar e as leituras seguintes herdavam o passo lento
// pela tarde inteira: 20 jogos levaram mais de 3 min. Se o bloqueio não passou, o freio
// sobe de novo na primeira resposta ruim, que é barato.
const mExp = bg.match(/desde > (\d+) \* (\d+)/);
ok(!!mExp, 'FREIO · o castigo aprendido continua expirando');
const expMs = mExp ? (+mExp[1] * +mExp[2]) : 0;
ok(expMs > 0 && expMs <= 30 * 60000,
   'FREIO · a expiração cabe numa sessão de trabalho (' + Math.round(expMs / 60000) + 'min)');
ok(/_qSave\(true\)/.test(bg), 'FREIO · frear ainda grava na hora (o service worker pode morrer)');

console.log('\n' + (falhas ? '❌ ' + falhas + ' falha(s) de ' + testes : '✅ ' + testes + ' asserções, 0 falhas') + '\n');
process.exit(falhas ? 1 : 0);
