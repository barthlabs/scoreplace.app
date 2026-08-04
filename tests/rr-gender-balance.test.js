/* Rei/Rainha: 2 homens não caem no mesmo grupo — node tests/rr-gender-balance.test.js
 * Pedido do dono (31/jul/2026), num torneio com 91 mulheres e 14 homens: "se a escolha
 * for por equilibrado, não devem cair num mesmo grupo 2 homens — o mais possível".
 * Vale para o sorteio AUTOMÁTICO (data/hora futura) tanto quanto pro manual: o motor é o
 * mesmo, e a CF autoDraw roda este arquivo via vendor.
 */
const { window, load } = require('./headless.js');
load('bracket-logic.js');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

function torneio(nF, nM, equilibrado) {
  const parts = [];
  for (let i = 0; i < nF; i++) parts.push({ uid: 'f' + i, displayName: 'F' + i, gender: 'feminino' });
  for (let i = 0; i < nM; i++) parts.push({ uid: 'm' + i, displayName: 'M' + i, gender: 'masculino' });
  return { id: 't', participants: parts, equilibrado: equilibrado };
}
function grupos(lista, n) { const g = []; for (let i = 0; i < n; i++) g.push(lista.slice(i * 4, i * 4 + 4)); return g; }
function homensPorGrupo(gs) { return gs.map(g => g.filter(n => /^M/.test(n)).length); }

// 1) o caso real: 14 homens entre 104 jogadores → 26 grupos, nenhum com 2 homens.
// 104 e não 105 porque o motor já tirou a sobra (vira lista de espera) antes de chamar
// isto — a função recebe exatamente numGroups*4.
{
  const t = torneio(90, 14, true);
  const nomes = t.participants.map(p => p.displayName);
  // pior entrada possível: todos os homens juntos no fim
  const n = nomes.length / 4;
  ok(n === 26, 'o cenário são 26 grupos cheios (' + nomes.length + ' jogadores)');
  const out = window._spreadMinorityGender(t, nomes, n);
  const h = homensPorGrupo(grupos(out, n));
  ok(out.length === nomes.length, 'ninguém some nem duplica no rearranjo');
  ok(new Set(out).size === nomes.length, 'e a lista continua sem repetidos');
  ok(Math.max(...h) <= 1, 'nenhum grupo com 2 homens (máximo por grupo: ' + Math.max(...h) + ')');
  ok(h.filter(x => x === 1).length === 14, 'os 14 homens ficaram em 14 grupos distintos');
}

// 2) "o mais possível": mais homens que grupos → distribui o melhor que dá, sem falhar
{
  const t = torneio(10, 10, true);
  const nomes = t.participants.map(p => p.displayName);
  const n = Math.floor(nomes.length / 4);            // 5 grupos, 10 homens
  const out = window._spreadMinorityGender(t, nomes, n);
  const h = homensPorGrupo(grupos(out, n));
  ok(out.length === nomes.length, 'não perde ninguém quando não dá pra separar todos');
  ok(h.every(x => x >= 1), 'todo grupo recebe ao menos um da minoria em vez de amontoar');
  ok(Math.max(...h) - Math.min(...h) <= 1, 'e a sobra fica parelha (2 em cada, não 3+1)');
}

// 2b) O CASO AO VIVO (31/jul, sorteio v1.6.62 do Confra sandbox): 26 grupos, 14 homens,
// e a chave saiu com UM grupo de 2 e treze grupos sem nenhum. "dá perfeitamente para
// colocar 1 homem apenas em cada grupo que tenha homem." A busca antiga era "PRIMEIRO
// grupo com 2+" × "PRIMEIRO com 0" e parava cedo; agora é MAIOR × MENOR.
{
  const t = torneio(90, 14, true);
  const nomes = t.participants.map(p => p.displayName);
  // reproduz a distribuição exata que o dono viu na tela
  const porGrupo = [1,0,1,0,0,1,1,1,2,1,0,1,1,0,0,0,1,0,0,1,0,0,1,1,0,0];
  const F = nomes.filter(n => /^F/.test(n)), M = nomes.filter(n => /^M/.test(n));
  let fi = 0, mi = 0; const lista = [];
  porGrupo.forEach(q => { for (let k = 0; k < 4; k++) lista.push(k < q ? M[mi++] : F[fi++]); });
  ok(mi === 14 && lista.length === 104, 'cenário montado: 104 jogadores, 14 homens');
  ok(Math.max(...homensPorGrupo(grupos(lista, 26))) === 2, 'a entrada É a chave que saiu errada');
  const out = window._spreadMinorityGender(t, lista, 26);
  const h = homensPorGrupo(grupos(out, 26));
  ok(Math.max(...h) <= 1, 'depois do reparo, nenhum grupo com 2 (máx: ' + Math.max(...h) + ')');
  ok(h.filter(x => x === 1).length === 14, 'os 14 homens em 14 grupos distintos');
  ok(new Set(out).size === 104, 'ninguém sumiu nem duplicou');
}

// 2c) MAIS minoria que grupos: nivela — ninguém recebe 2 antes de todos terem 1, ninguém
// recebe 3 antes de todos terem 2. 12 homens em 8 grupos → 4 grupos com 2 e 4 com 1.
{
  const t = torneio(20, 12, true);                   // 32 jogadores, 8 grupos, minoria = 12 homens
  const nomes = t.participants.map(p => p.displayName);
  const out = window._spreadMinorityGender(t, nomes, 8);
  const h = homensPorGrupo(grupos(out, 8));
  ok(h.every(x => x >= 1), 'todo grupo tem ao menos 1 antes de qualquer um ter 2');
  ok(Math.max(...h) - Math.min(...h) <= 1, 'e a distribuição fica parelha (' + h.join(',') + ')');
}

// 3) LIVRE não mexe em nada
{
  const t = torneio(91, 14, false);
  const nomes = t.participants.map(p => p.displayName);
  ok(t.equilibrado === false, 'torneio marcado como livre');
  // o motor só chama o espalhamento quando equilibrado !== false; aqui provamos a função pura
  const out = window._spreadMinorityGender(torneio(91, 14, true), nomes, 26);
  ok(out.join('|') !== nomes.join('|'), 'no equilibrado a ordem MUDA (prova de que o reparo agiu)');
}

// 4) um gênero só → não mexe (não existe minoria a espalhar)
{
  const t = torneio(20, 0, true);
  const nomes = t.participants.map(p => p.displayName);
  const out = window._spreadMinorityGender(t, nomes, 5);
  ok(out.join('|') === nomes.join('|'), 'só mulheres → lista intacta');
}

// 5) "misto" NÃO é gênero de pessoa — não pode virar minoria
{
  const t = { id: 't', equilibrado: true, participants: [
    { uid: 'a', displayName: 'A', gender: 'misto' }, { uid: 'b', displayName: 'B', gender: 'misto' },
    { uid: 'c', displayName: 'C', gender: 'feminino' }, { uid: 'd', displayName: 'D', gender: 'feminino' },
    { uid: 'e', displayName: 'E', gender: 'feminino' }, { uid: 'f', displayName: 'F', gender: 'feminino' },
    { uid: 'g', displayName: 'G', gender: 'feminino' }, { uid: 'h', displayName: 'H', gender: 'feminino' } ] };
  ok(window._monarchGenderOf(t, 'A') === '', '"misto" gravado no gênero da pessoa é ignorado');
  ok(window._monarchGenderOf(t, 'C') === 'f', 'feminino continua sendo lido');
  const nomes = ['A','B','C','D','E','F','G','H'];
  ok(window._spreadMinorityGender(t, nomes, 2).join('|') === nomes.join('|'),
    'sem minoria real, nada é reordenado');
}

console.log((fail ? '✗' : '✓') + ' rr-gender-balance: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
