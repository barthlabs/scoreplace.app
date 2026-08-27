/* O BOX "Fim da rodada / Rodada em andamento" NÃO VOLTA (leva 2.1.9)
 *
 * O dono mandou tirar DUAS vezes:
 *   1ª (26/ago, olhando o detalhe): _"podemos eliminar essa sessao... ela repete as
 *      informacoes que estao logo abaixo da previsao do tempo"_ → v2.1.1
 *   2ª (27/ago, olhando a tela inicial): _"regressao. mandei tirar esse fim da rodada e
 *      rodada em andamento (box/sessao toda) que esta redundante com a sessao de barras de
 *      progressao que já aparece logo depois da previsao do tempo"_ → esta leva.
 *
 * ⚠️ NÃO FOI UM REVERT. A 2.1.1 removeu só do DETALHE, e escreveu — no código e na mensagem
 * do commit — que "no card da dashboard ele é a ÚNICA fonte dessa informação (o card não
 * desenha o box de progresso)". Isso era FALSO: dashboard.js chama
 * `_renderTournamentProgress` desde a v2.1.52, o MESMO box de progresso do detalhe. A
 * meia-remoção saiu de uma afirmação sobre outro trecho do arquivo que ninguém conferiu.
 *
 * É a MESMA classe de erro da 2.1.7 (um comentário em bracket.js afirmava que o "Propor
 * datas" tinha ganhado a exceção do organizador; não tinha). Duas levas seguidas com um
 * comentário descrevendo a INTENÇÃO e sendo lido como se descrevesse o CÓDIGO. Por isso o
 * que guarda esta decisão passa a ser um teste, e não mais um parágrafo.
 *
 * ⚠️ LIMITE HONESTO DESTE TESTE: ele lê o FONTE das views, não um card renderizado. Montar
 * o card do dashboard exige um harness que não existe hoje. O que ele prova é o que basta
 * pra a regressão não voltar: nenhuma tela chama o box, e as duas telas seguem chamando o
 * progresso e a previsão. Se alguém reintroduzir a chamada, isto acusa.
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── o countdown de rodada não volta pra tela ────');

const V = (f) => fs.readFileSync(path.join(__dirname, '..', 'js', 'views', f), 'utf8');
// tira comentários de linha: o texto que EXPLICA a remoção cita o nome da função, e sem
// isto o teste se acusaria sozinho lendo a própria justificativa.
const semComentario = (src) => src.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

const DASH = semComentario(V('dashboard.js'));
const DET  = semComentario(V('tournaments.js'));

// ── 1. NENHUMA tela chama o box ──────────────────────────────────────────────
ok(DASH.indexOf('_ligaCountdownBoxHtml') === -1,
   '⛔ o card da TELA INICIAL não pode chamar _ligaCountdownBoxHtml (foi por aqui que voltou)');
ok(DET.indexOf('_ligaCountdownBoxHtml') === -1,
   '⛔ o DETALHE do torneio não pode chamar _ligaCountdownBoxHtml');

// ── 2. o que SUBSTITUI o box segue de pé nas duas telas ──────────────────────
// Sem isto, "passou verde" poderia significar que alguém apagou a seção inteira — inclusive
// o progresso e a previsão, que é o que o dono QUER ver.
ok(DASH.indexOf('_renderTournamentProgress') !== -1,
   'a tela inicial segue desenhando o box de PROGRESSO (é ele que conta a mesma história)');
ok(DET.indexOf('_renderTournamentProgress') !== -1,
   'o detalhe segue desenhando o box de PROGRESSO');
ok(DASH.indexOf('_weatherSlotHtml') !== -1, 'a previsão do tempo continua na tela inicial');
ok(DET.indexOf('_weatherSlotHtml') !== -1, 'a previsão do tempo continua no detalhe');

// ── 3. a previsão NÃO depende mais de haver countdown ────────────────────────
// Antes, um `if (!_boxD) return _toggleRowDash;` derrubava a previsão junto quando não havia
// box. Com o box fora, essa dependência viraria um sumiço silencioso da previsão.
ok(!/if \(!_boxD\)/.test(DASH),
   'o gate `if (!_boxD)` saiu — a previsão não pode depender de um box que não existe mais');

// ── 4. e ela tem gate PRÓPRIO, então não sobra caixa vazia ───────────────────
const vm = require('vm');
const sandbox = vm.createContext({ window: {}, console: console });
sandbox.window._safeHtml = (s) => String(s == null ? '' : s);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'weather.js'), 'utf8'),
  sandbox, { filename: 'weather.js' });
ok(sandbox.window._weatherSlotHtml({ id: 'x' }) === '',
   'torneio sem coordenadas do local → previsão devolve vazio (gate próprio, sem caixa oca)');
ok(sandbox.window._weatherSlotHtml({ id: 'x', venueLat: -23.6, venueLon: -46.7 }).indexOf('data-weather-slot') !== -1,
   'torneio COM coordenadas → o slot da previsão nasce, independente de countdown');

console.log(pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
