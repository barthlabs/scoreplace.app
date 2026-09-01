/* CONTADOR E CHAVE NÃO PODEM CONGELAR NO PRIMEIRO QUADRO  (CONFRA.P2)
 * node tests/hidratacao-nao-congela-no-primeiro-quadro.test.js
 *
 * RELATO DO DONO (01/set/2026, sandbox da Confra, web no CELULAR — o desktop está certo):
 * o cartão alterna entre "… inscritos" e "14 inscritos", e às vezes a chave não desenha.
 *
 * ⛔ A CAUSA, e por que só aparece no celular: num torneio DIVIDIDO o elenco e os jogos não
 * moram no documento — o ouvinte entrega o documento-base e as subcoleções chegam DEPOIS.
 * Nessa janela `t.participants` é uma lista INCOMPLETA e `t.matches` está vazio. Quem conta
 * a lista crua devolve um número que parece resposta; quem pergunta "tem chave?" recebe
 * `false`, que é uma AFIRMAÇÃO. No desktop a janela é curta demais pra se ver; no celular
 * (rede pior, retorno de aba, primeiro quadro) ela é visível e o número dança.
 *
 * ⭐ A RÉGUA, já canonizada em `_souInscrito`: ACHAR É FATO, NÃO ACHAR NÃO É. O número do
 * RESUMO (`competitorsCount`) e uma chave encontrada respondem na hora; a resposta negativa
 * só vale depois que as partes chegaram. No meio, `null` — que obriga quem desenha a dizer
 * "carregando" em vez de inventar um zero.
 *
 * ⛔ NADA AQUI RECARREGA, LIMPA CACHE OU ESCREVE: a chegada tardia das partes é simulada
 * mutando o objeto em memória, que é exatamente o que o ouvinte faz.
 */
'use strict';
const H = require('./render-harness');
const W = H.sandbox;
// `_dashNum` (o estado honesto que a tela imprime) mora na dashboard — o harness não a
// carrega por padrão. Carregar aqui é o que faz o teste medir a função REAL da tela.
try { require('./headless').load('dashboard.js'); } catch (e) { /* medido abaixo */ }

let falhas = 0;
const ok = (n, c, extra) => { if (c) console.log('  ✓ ' + n); else { console.log('  ✗ ' + n + (extra ? '\n      ' + extra : '')); falhas++; } };

/* ── o PRIMEIRO QUADRO de um torneio dividido: o documento-base, sem as partes ────────
 * `_semPesados` nomeia o que saiu do documento; `_nPartes` é o contador que o ESCRITOR
 * gravou — é contra ele que se sabe se o que chegou está completo. */
function primeiroQuadro() {
  return {
    id: 'sandbox-confra', name: 'Confra (sandbox)', status: 'open',
    _semPesados: ['participants', 'matches', 'grupos'],
    _nPartes: { participants: 14, matches: 21, grupos: 4 },
    memberUids: ['u1', 'u2', 'u3'],          // testemunha: existe elenco
    participants: [],                         // ⬅ ainda não chegou
    matches: [], rounds: [], groups: []       // ⬅ idem
  };
}
// a chegada tardia das partes é uma MUTAÇÃO do objeto em memória — o que o ouvinte faz.
function chegamAsPartes(t) {
  t.participants = [];
  for (let i = 0; i < 14; i++) t.participants.push({ uid: 'u' + i, name: 'Inscrito ' + i });
  t.matches = [];
  for (let i = 0; i < 21; i++) t.matches.push({ id: 'm' + i, team1: ['A'], team2: ['B'] });
  // ⚠️ os GRUPOS são contados de `rounds[].monarchGroups` (store.js `_quantoTenho`), não de
  // `t.groups`. Pôr a fixture no lugar errado faria o teste medir uma falta que não existe.
  t.rounds = [{ round: 1, monarchGroups: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }] }];
}
// o CONTROLE do desktop: documento completo, nada dividido — tem que seguir idêntico.
function documentoCompleto() {
  const t = { id: 'completo', name: 'Confra', status: 'open', participants: [], matches: [], rounds: [], groups: [] };
  for (let i = 0; i < 14; i++) t.participants.push({ uid: 'u' + i, name: 'Inscrito ' + i });
  for (let i = 0; i < 21; i++) t.matches.push({ id: 'm' + i, team1: ['A'], team2: ['B'] });
  t.groups = [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }];
  return t;
}

console.log('──── ① as portas existem ────');
['_marcaPartesQueFaltam', '_parteFalta', '_elencoCarregado', '_cardCompetidores', '_cardTemChave', '_dashNum', '_dadosConfiaveis']
  .forEach((n) => ok('  ' + n, typeof W[n] === 'function', 'tipo: ' + typeof W[n]));

console.log('──── ② primeiro quadro incompleto: NADA é afirmado ────');
const t1 = primeiroQuadro();
{
  ok('⭐ o motor reconhece que faltam partes', W._marcaPartesQueFaltam(t1) === true,
    '_faltaOQue=' + JSON.stringify(t1._faltaOQue));
  ok('  → e diz QUAIS faltam', (t1._faltaOQue || []).indexOf('participants') >= 0 && (t1._faltaOQue || []).indexOf('matches') >= 0,
    JSON.stringify(t1._faltaOQue));
  ok('  → o elenco NÃO está carregado', W._elencoCarregado(t1) === false);
  const cc = W._cardCompetidores(t1);
  ok('⭐⭐ o contador NÃO devolve número — devolve "não sei"', cc.people === null && cc.carregando === true,
    JSON.stringify(cc));
  ok('⛔ e em especial NÃO devolve 0 (zero afirmado é indistinguível de zero verdadeiro)',
    cc.people !== 0, JSON.stringify(cc));
  ok('⭐⭐ a chave NÃO é dada como ausente', W._cardTemChave(t1) === null,
    'obtido: ' + JSON.stringify(W._cardTemChave(t1)));
  ok('⭐⭐ e o que a tela imprime é o estado honesto de carregando', W._dashNum(cc.people, t1) === '…',
    'obtido: ' + JSON.stringify(W._dashNum(cc.people, t1)));
}

console.log('──── ③ chegada tardia das partes: conta e chave sozinhas, sem recarregar ────');
{
  chegamAsPartes(t1);
  ok('⭐ não falta mais nada', W._marcaPartesQueFaltam(t1) === false, JSON.stringify(t1._faltaOQue));
  const cc = W._cardCompetidores(t1);
  ok('⭐⭐ agora o contador afirma, e afirma 14', cc.people === 14 && cc.carregando === false, JSON.stringify(cc));
  ok('⭐⭐ e a chave passa a existir', W._cardTemChave(t1) === true);
  ok('  → e a tela imprime o número, não mais reticências', W._dashNum(cc.people, t1) === 14,
    'obtido: ' + JSON.stringify(W._dashNum(cc.people, t1)));
  ok('  → nada foi recarregado nem reescrito: só o objeto em memória mudou',
    t1._semPesados.length === 3 && t1._nPartes.participants === 14);
}

console.log('──── ④ parte que chega PELA METADE ainda não é resposta ────');
{
  const t2 = primeiroQuadro();
  t2.participants = [{ uid: 'u1', name: 'Um' }, { uid: 'u2', name: 'Dois' }];   // 2 de 14
  ok('⭐⭐ 2 de 14 continua sendo "falta" — a pergunta é QUANTIDADE, não presença',
    W._marcaPartesQueFaltam(t2) === true && (t2._faltaOQue || []).indexOf('participants') >= 0,
    JSON.stringify(t2._faltaOQue));
  ok('  → e o contador segue sem afirmar', W._cardCompetidores(t2).people === null);
  ok('⛔ em especial NÃO afirma 2 (era o "2 inscritos de 152" do incidente)',
    W._cardCompetidores(t2).people !== 2);
}

console.log('──── ⑤ vazio DE VERDADE não é carregando ────');
{
  const t3 = primeiroQuadro();
  t3._nPartes = { participants: 0, matches: 0, grupos: 0 };
  ok('⭐ contador zero do escritor = vazio de verdade, não falta nada',
    W._marcaPartesQueFaltam(t3) === false, JSON.stringify(t3._faltaOQue));
  const cc = W._cardCompetidores(t3);
  ok('  → aí sim o contador afirma 0', cc.people === 0 && cc.carregando === false, JSON.stringify(cc));
  ok('  → e a chave é ausente DE VERDADE (false, não null)', W._cardTemChave(t3) === false);
}

console.log('──── ⑥ o resumo responde na hora, sem esperar parte nenhuma ────');
{
  const t4 = primeiroQuadro();
  t4.competitorsCount = 14; t4.teamsCount = 7;
  const cc = W._cardCompetidores(t4);
  ok('⭐⭐ com o número do resumo, o contador afirma mesmo faltando partes (achar é fato)',
    cc.people === 14 && cc.teams === 7 && cc.carregando === false, JSON.stringify(cc));
  const t5 = primeiroQuadro();
  t5.hasDraw = true;
  ok('⭐⭐ e `hasDraw` do resumo responde na hora', W._cardTemChave(t5) === true);
}

console.log('──── ⑦ CONTROLE DESKTOP: documento completo, comportamento inalterado ────');
{
  const d = documentoCompleto();
  ok('⭐ nada falta num documento não dividido', W._marcaPartesQueFaltam(d) === false);
  const cc = W._cardCompetidores(d);
  const cru = W._countCompetitors(d);
  ok('⭐⭐ o contador dá EXATAMENTE o que a contagem canônica sempre deu',
    cc.people === cru.people && cc.teams === cru.teams && cc.carregando === false,
    'acessador=' + JSON.stringify({ p: cc.people, t: cc.teams }) + ' canônico=' + JSON.stringify({ p: cru.people, t: cru.teams }));
  ok('  → 14 inscritos', cc.people === 14, 'obtido ' + cc.people);
  ok('⭐⭐ e a chave é `true` (booleano, nunca `null`) — o desktop não vê o terceiro estado',
    W._cardTemChave(d) === true);
  const vazio = { id: 'z', participants: [], matches: [], rounds: [], groups: [] };
  ok('  → e um torneio completo SEM chave segue dando `false`, não `null`',
    W._cardTemChave(vazio) === false);
  ok('  → e o número segue saindo, sem reticências', W._dashNum(W._cardCompetidores(d).people, d) === 14);
}

console.log(falhas === 0 ? '\n✅ hidratacao-nao-congela-no-primeiro-quadro: OK' : '\n❌ ' + falhas + ' falha(s)');
process.exit(falhas === 0 ? 0 : 1);
