/* Data da competição vinda do CARD da lista — node tests/lz-list-date.test.js
 * Pedido do dono (31/jul/2026): "ainda está faltando mostrar data antes do nome do torneio".
 * Os textos abaixo foram MEDIDOS na página real (letzplay.me/KellyBarth1/tournaments) —
 * não são exemplos inventados. A data sai do próprio card: zero requisição extra.
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'extension', 'content.js'), 'utf8');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

// extrai as duas funções do arquivo e roda isoladas
const iM = src.indexOf('var _MESES = {');
const iF = src.indexOf('function _cardDe(a)');
const bloco = src.slice(iM, iF);
ok(bloco.length > 200, 'as funções de data existem no content.js');
const ctx = { Date };
vm.createContext(ctx);
vm.runInContext(bloco + '\nthis.__d = _dataDoCard;', ctx);
const dataDoCard = ctx.__d;

// ── textos REAIS dos cards (medidos em 31/jul/2026) ──
const concluido = '5° Morumbi Town de BT by Track & Field Experience - Feminina D Terminou em 28/jun/2026 Concluído Grupo + Chaves Cecília Mange 19 Duplas 37 Jogos QF • Trilha';
const andamento = 'Interno Ciclo 2 Competitivo - Feminina D Jogos em 01/ago Em andamento Grupo único Katia Figueiredo 5 Duplas 10 Jogos Próximo Jogo: 01/ago as 11:00hs';
const maes = 'T&F Special Edition - torneio MÃES - Prata Terminou em 09/mai/2026 Concluído Rei/Rainha da Quadra 12 Duplas 25 Jogos Grupos • Trilha';

const a = dataDoCard(concluido);
ok(a && a.label === '28 jun 26', 'concluído: "Terminou em 28/jun/2026" → 28 jun 26 (veio: ' + (a && a.label) + ')');
ok(a && a.num === 20260628, 'e o número comparável é aaaammdd (' + (a && a.num) + ')');

const b = dataDoCard(andamento);
const anoAtual = String(new Date().getFullYear()).slice(2);
ok(b && b.label === '01 ago ' + anoAtual, 'em andamento sem ano: assume o ano corrente (veio: ' + (b && b.label) + ')');

const c = dataDoCard(maes);
ok(c && c.label === '09 mai 26', 'dia com zero à esquerda preservado (veio: ' + (c && c.label) + ')');

// ordenação: mais recente primeiro
const ord = [a, b, c].sort((x, y) => y.num - x.num).map((x) => x.label);
ok(ord[0] === b.label, 'o mais recente (ago) fica no topo');
ok(ord[2] === c.label, 'e o mais antigo (mai) no fim');

// não inventa data quando não há
ok(dataDoCard('Torneio sem data nenhuma Concluído 4 Duplas') === null, 'card sem data → null, não chute');
ok(dataDoCard('') === null, 'texto vazio → null');
ok(dataDoCard('Terminou em 28/xxx/2026') === null, 'mês inexistente → null (não vira mês 0)');

// e a data chega no feed e no que é gravado
ok(/feed: \{ icon: '🏆', data: P\.data \|\| null, nome: P\.title \}/.test(src),
  'a prévia da lista já sai com a data antes do nome');
ok(/icon: '🏆', data: P\.data \|\| null/.test(src), 'a linha de cada torneio lido também');
ok(/icon: '📊', data: R\.data \|\| null/.test(src), 'e a de ranking');
ok(/title: P\.title \|\| null, data: P\.data \|\| null, dataNum: P\.dataNum \|\| null/.test(src),
  'a data é gravada no tournamentsList (o diálogo passa a ter também)');

// ── PULAR É PULAR, SEM ANUNCIAR ─────────────────────────────────────────────
// "já falei para não colocar essa merda de x pulados sem reler". A linha enchia o feed
// com o que NÃO aconteceu, no meio das linhas do que aconteceu.
ok(!/pulados sem reler'/.test(src), 'nenhuma linha de "N já lidos — pulados sem reler" sobrou');
ok(!/pulT\+\+|pulR\+\+/.test(src), 'e nem o contador que existia só pra isso');
{
  // agora o filtro acontece ANTES de montar os lotes (ext 1.71): quem já foi lido nem
  // entra na lista de trabalho — mais forte que "pular dentro do laço".
  const filtro = src.slice(src.indexOf('var _pendT = toursList.filter'), src.indexOf('var _pendT = toursList.filter') + 1400);
  ok(/return false;/.test(filtro), 'quem já foi lido é retirado antes do lote, sem emitir nada');
  // REVISADO em 03/ago/2026: "já lido" passou a exigir que o DETALHE tenha sobrevivido —
  // o cursor prova que a página abriu, não que o nome/classificação ficaram no documento.
  // A Kelly tinha tournaments:[] com os 8 marcados como lidos, e o violeta não saía nunca.
  // REVISADO DE NOVO em 11/ago/2026 (ext 2.01): torneio também precisa da CHAVE, senão a
  // ficha não tem como dizer a colocação nem a rodada em que a pessoa caiu — medido no
  // @fabiogod, 29 de 35 torneios mudos e a releitura pulando todos por este mesmo `if`.
  // O invariante não mudou; a régua ficou mais dura. Ver tests/lz-contagem-unica.test.js.
  ok(/if \(d0 && \(d0\.name \|\| d0\.standings \|\| d0\.matches\)\) \{ det\[tk\] = d0; return false; \}/.test(filtro),
     'e o que já sabíamos dele é reaproveitado — mas só quando existe de verdade');
}

console.log((fail ? '✗' : '✓') + ' lz-list-date: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
