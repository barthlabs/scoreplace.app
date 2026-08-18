/* DE ONDE SAI A LETRA DA CATEGORIA — e o "+" de quem lidera o ranking (1.9.35).
 *
 * Três buracos medidos na base real (14 leituras do letzplay):
 *
 * 1. MEDALHA. Uma atleta tinha 3 competições — "Rodada: 10", "Fem I" e
 *    "T&F Special Edition - torneio MÃES - Bronze" — e NENHUMA diz A–D. A ficha mostrava
 *    "—": sem categoria. Decisão do dono: naquela série, "bronze, prata e ouro" são
 *    "D, C e B".
 * 2. O NOME DA COMPETIÇÃO COMO RESERVA. "Social Fem Iniciante / D- | 2026" traz a letra
 *    no nome, não na categoria. Só vale pra quem ficaria sem letra nenhuma: ligar o nome
 *    pra todo mundo mexia em quem JÁ tem letra (medido: uma C- virava C+), e subir a
 *    categoria de quem já tem uma é o erro que tira a pessoa do torneio que ela pode jogar.
 * 3. TOPO DA TABELA. "estou no centro de D, mas estou no topo da tabela do ranking social
 *    D, entao deveria ganhar o +". A regra por FRAÇÃO existia e era inerte: depende do
 *    tamanho do campo, que o footprint nunca traz. A posição da PRÓPRIA pessoa, essa sim,
 *    está em `standings[].rows[]` — e pódio de ranking é topo em qualquer tabela.
 *    ⚠️ Em TORNEIO a posição lida é a do GRUPO (1..3 num grupo de 4) — não é topo de nada.
 */
const H = require('./render-harness');
const W = H.window;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }
const rot = function (x) { return x ? x.rotulo : '—'; };

console.log('\n== de onde sai a letra da categoria ==');

// ── 1. medalha é nome de categoria ────────────────────────────────────────────
ok(W._lzLetraDeTexto('T&F Special Edition - torneio MÃES - Bronze') === 'D', 'Bronze → D');
ok(W._lzLetraDeTexto('Etapa 3 - Prata') === 'C', 'Prata → C');
ok(W._lzLetraDeTexto('Copa de Verão - Ouro') === 'B', 'Ouro → B');
ok(W._lzLetraDeTexto('Feminina C') === 'C', 'a letra explícita continua ganhando');
ok(W._lzLetraDeTexto('Rodada: 10') === null, '"Rodada: N" não é categoria');
ok(W._lzLetraDeTexto('46 a 50 anos') === null, 'faixa etária não é categoria');

// ── 2. o nome da competição só entra quando NÃO sobra letra nenhuma ───────────
const semLetra = { handle: 'atleta1', footprint: [
  { categoryRaw: 'Rodada: 10', name: 'Ranking Feminino 2026', official: false, wins: 4, losses: 11 },
  { categoryRaw: 'Fem I', name: 'Social Fem Iniciante / D- | 2026', official: false, wins: 6, losses: 6 }
] };
ok(rot(W._lzCategoriaDoImport(semLetra)) !== '—', 'sem letra em lugar nenhum → o nome resolve (não fica "—")');
ok(W._lzCategoriaDoImport(semLetra).categoria === 'D', 'a letra vem do nome: D');

const jaTemLetra = { handle: 'atleta2', footprint: [
  // a categoria diz C; o NOME de outra competição diz B — não pode ser lido
  { categoryRaw: 'Feminina C', name: 'Etapa 2', official: true, wins: 2, losses: 2 },
  { categoryRaw: 'Rodada: 4', name: 'Ranking Feminino B 2026', official: false, wins: 1, losses: 5 }
] };
ok(W._lzCategoriaDoImport(jaTemLetra).categoria === 'C', 'quem já tem letra na categoria NÃO é remexido pelo nome');

// ── 3. topo da tabela do ranking dá o "+" ─────────────────────────────────────
const linha = function (pos, handle) { return { pos: pos, handles: [handle], players: [] }; };
const topoRanking = { handle: 'RodrigoX', footprint: [
  { categoryRaw: 'Masculina D', name: 'Ranking Social D', official: false, wins: 5, losses: 5,
    standings: [{ ranking: true, rows: [linha(1, 'Outro1'), linha(2, 'Outro2'), linha(3, 'RodrigoX')] }] }
] };
const rTopo = W._lzCategoriaDoImport(topoRanking);
ok(rTopo && rTopo.rotulo === 'D+', 'pódio no ranking da própria categoria → D+ (got ' + rot(rTopo) + ')');
ok(rTopo && rTopo.porque === 'topo da tabela do ranking', 'e o motivo diz por quê');

const meioRanking = { handle: 'RodrigoX', footprint: [
  { categoryRaw: 'Masculina D', name: 'Ranking Social D', official: false, wins: 5, losses: 5,
    standings: [{ ranking: true, rows: [linha(1, 'Outro1'), linha(23, 'RodrigoX')] }] }
] };
ok(rot(W._lzCategoriaDoImport(meioRanking)) === 'D', 'no meio da tabela → D pelado (got ' + rot(W._lzCategoriaDoImport(meioRanking)) + ')');

// TORNEIO: 3º lugar é posição de GRUPO, não topo de tabela
const grupoTorneio = { handle: 'RodrigoX', footprint: [
  { categoryRaw: 'Masculina D', name: 'Torneio X - Masculina D', official: true, wins: 2, losses: 2,
    standings: [{ rows: [linha(1, 'Outro1'), linha(2, 'Outro2'), linha(3, 'RodrigoX')] }] }
] };
ok(rot(W._lzCategoriaDoImport(grupoTorneio)) === 'D', 'posição de grupo em torneio NÃO vira "+" (got ' + rot(W._lzCategoriaDoImport(grupoTorneio)) + ')');

// a posição casa por HANDLE, não por nome/ordem da linha
const outroHandle = { handle: 'NaoEsseAqui', footprint: [
  { categoryRaw: 'Masculina D', name: 'Ranking Social D', official: false, wins: 5, losses: 5,
    standings: [{ ranking: true, rows: [linha(1, 'RodrigoX'), linha(40, 'NaoEsseAqui')] }] }
] };
ok(rot(W._lzCategoriaDoImport(outroHandle)) === 'D', 'a linha lida é a DA PESSOA (handle), não a 1ª da tabela');

console.log((fail ? '❌' : '✅') + ' categoria-letra-fontes: ' + pass + ' asserções, ' + fail + ' falha(s)');
process.exit(fail ? 1 : 0);
