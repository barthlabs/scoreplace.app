/* A BUSCA DA CHAVE ACHA O QUE ESTÁ ESCRITO NA TELA (leva 2.1.99)
 *
 * Relato do dono (02/set/2026): _"essa merda de barra de busca nao esta funcionando porra
 * nenhuma. no detalhe do torneio (chaves)"_ — digitou "Arna" com "Arnaldo Menezes" visível
 * no card e a chave inteira ficou VAZIA.
 *
 * ⛔ A MECÂNICA DO DEFEITO: `data-players` é escrito NO RENDER, com o nome resolvido por
 * uid. Quando o perfil ainda não chegou, ele nasce com rótulo provisório (ou vazio),
 * enquanto o nome VISÍVEL do card é preenchido depois, pela hidratação do `data-uid-name`.
 * A partir daí a pessoa LÊ um nome no card e o atributo que a busca varre diz outra coisa.
 * Como "nenhum resultado" esconde tudo, o sintoma não é "não achou": é a tela preta.
 *
 * Existia uma cura em store.js, mas ela só reescreve UM formato de rótulo provisório
 * ("Jogador sem perfil (XXXX)"). Qualquer outro estado de hidratação seguia invisível.
 *
 * ⚠️ ESTE TESTE RODA A FUNÇÃO REAL (`_bracketApplyFilter`) contra um DOM de mentira, e
 * conta quem ficou visível. Um teste de regex sobre o fonte passaria com o bug de pé — foi
 * medindo o DOM que o defeito apareceu.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── a busca da chave acha o que está na tela ────');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket.js'), 'utf8');
const ini = src.indexOf('window._bracketApplyFilter = function');
const bloco = src.slice(ini, src.indexOf('\n};', ini) + 3);

/* ── DOM de mentira: só o que a função toca ────────────────────────────────── */
/* `textoNaTela` são os NOMES que o card mostra — cada um vira um `.sp-name-fit`, que é o
 * que o filtro varre. ⛔ NÃO se devolve o texto do card inteiro: foi assim que a 1ª versão
 * quebrou a busca em produção (o card carrega "Aplicar W.O.", "Cheguei", "Ao Vivo", e
 * digitar "ar" casava com "Aplicar" em todos). O fixture tem que ter a MESMA forma. */
function card(id, dataPlayers, nomesNaTela, myMatch) {
  const nomes = (Array.isArray(nomesNaTela) ? nomesNaTela : [nomesNaTela])
    .map((t) => ({ textContent: String(t == null ? '' : t) }));
  const el = {
    id: id, style: {}, dataset: {},
    textContent: 'JOGO 116 Aplicar W.O. Cheguei Ao Vivo Propor datas ' + nomes.map((n) => n.textContent).join(' '),
    _attrs: { 'data-players': dataPlayers, 'data-my-match': myMatch || '1' },
    getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; },
    setAttribute: function (k, v) { this._attrs[k] = v; },
    contains: function () { return false; },
    parentElement: null,
    querySelectorAll: function (sel) { return /sp-name-fit|data-uid-name/.test(sel) ? nomes : []; }
  };
  return el;
}
function monta(cards, busca) {
  const W = {};
  W.window = W;
  W._bracketNorm = (s) => String(s == null ? '' : s).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  W._showOnlyMyMatches = false;
  W._chaveMontaTudo = function () {};
  const input = { id: 'bracket-search', value: busca, style: {}, dataset: {}, contains: () => false };
  W.document = {
    getElementById: (id) => (id === 'bracket-search' ? input : null),
    querySelectorAll: (sel) => (sel === '[data-players]' ? cards : []),
    body: { contains: () => false },
    documentElement: {}, scrollingElement: null
  };
  vm.createContext(W);
  vm.runInContext(bloco, W, { filename: 'bracketApplyFilter' });
  W._bracketApplyFilter();
  return cards.filter((c) => c.style.display !== 'none');
}

/* ── ① O CASO DO RELATO: o nome está no card, mas não no atributo ─────────── */
const arnaldoNaTela = card('card-gold-11', 'Jogador sem perfil (Nqn0) | Rostanda',
                           ['Rostanda', 'Zilda Quintas', 'Mariana Ciocci', 'Arnaldo Menezes']);
const outro = card('card-gold-12', 'Sandra Bighetto | Flávia Barchetta',
                   ['Sandra Bighetto', 'Flávia Barchetta', 'Daniel Oliveira']);
let vis = monta([arnaldoNaTela, outro], 'Arna');
ok(vis.length === 1, '① ⭐ acha 1 card procurando "Arna" — antes achava 0 e escondia tudo · achou ' + vis.length);
ok(vis[0] === arnaldoNaTela, '① ⭐ e é o card em que o nome está ESCRITO na tela');

/* ── ①b ⛔ A REGRESSÃO QUE EU CAUSEI, guardada por nome ────────────────────────
 * A 1ª versão do fallback casava com `c.textContent` — o card INTEIRO. Como todo card
 * carrega "Aplicar W.O.", "Cheguei", "Ao Vivo" e "Propor datas", digitar duas letras ("ar")
 * casava com "Aplicar" em TODOS e o filtro deixava de filtrar. O dono viu na hora:
 * _"agora nem no desktop que funcionava"_. Esta asserção é o que impede a volta. */
/* nomes SEM "ar" de propósito — "Clark" e "Soares" têm, e o fixture erraria o alvo */
vis = monta([card('card-x', 'Toninho | Silvia', ['Toninho', 'Silvia']),
             card('card-y', 'Inga | Denise', ['Inga', 'Denise'])], 'ar');
ok(vis.length === 0,
   '①b ⭐ "ar" NÃO casa com o texto dos botões do card ("Aplicar W.O.") — ' + vis.length + ' visível(is)');
vis = monta([card('card-z', '', ['Toninho', 'Silvia Moura']), card('card-w', '', ['Inga'])], 'silvia');
ok(vis.length === 1, '①b mas casa com o NOME que está na tela');

/* ── ② o caminho que já funcionava não muda ───────────────────────────────── */
const porAtributo = card('card-a', 'Mariana Ciocci / Arnaldo Menezes | Arnaldo Menezes', ['texto qualquer']);
vis = monta([porAtributo, card('card-b', 'Outra Pessoa', ['Outra Pessoa'])], 'arnaldo');
ok(vis.length === 1 && vis[0] === porAtributo, '② quem casa pelo `data-players` continua casando');

/* ── ③ acento e caixa não atrapalham (é o que a pessoa digita no celular) ─── */
vis = monta([card('card-c', '', ['Verônica Frasso', 'Maria Betânia'])], 'veronica');
ok(vis.length === 1, '③ "veronica" acha "Verônica" — a normalização vale nos dois lados');

/* ── ④ busca vazia mostra tudo; busca sem dono não mostra nada ────────────── */
vis = monta([card('card-d', 'A', ['A']), card('card-e', 'B', ['B'])], '');
ok(vis.length === 2, '④ sem busca, ninguém é escondido');
vis = monta([card('card-f', 'A', ['A']), card('card-g', 'B', ['B'])], 'zzzz');
ok(vis.length === 0, '④ e busca sem resultado esconde mesmo — o vazio é honesto');

/* ── ⑤ ⛔ O ATRIBUTO CONTINUA SENDO A CHAVE, o texto é só rede ────────────── */
const iHit = bloco.indexOf('data-players');
const iTxt = bloco.indexOf('textContent');
ok(iHit !== -1 && iTxt > iHit,
   '⑤ ⭐ o `data-players` é testado ANTES; o `textContent` só entra quando ele não casou');
ok(/querySelectorAll\('\.sp-name-fit, \[data-uid-name\]'\)/.test(bloco),
   '⑤ ⭐ e a rede lê só os ELEMENTOS DE NOME — nunca o card inteiro');
ok(!/_bracketNorm\(c\.textContent/.test(bloco),
   '⑤ ⛔ o card inteiro NÃO é palheiro: ele carrega "Aplicar W.O.", e "ar" casaria com tudo');

console.log(fail ? ('  ' + fail + ' FALHA(S), ' + pass + ' ok') : ('  ✓ ' + pass + ' asserções'));
process.exit(fail ? 1 : 0);
