'use strict';
/* O SALDO É SEMPRE NA UNIDADE MAIS RICA — rally > games > sets, a mais rica que EXISTE nos dois lados.
 * node tests/saldo-e-sempre-na-unidade-mais-rica.test.js
 *
 * ⛔⛔ ORDEM DO DONO, repetida três vezes em 26/set/2026: _"o saldo é sempre pelo dado mais rico:
 * sets, games, pontos ao vivo porra"_ — e antes: _"saldo de sets quando nao tem games e saldo de games
 * quando nao tem pontos ao vivo. assim deve ser considerado o saldo de pontos"_.
 *
 * ⛔ O DEFEITO NÃO ESTAVA NO DOMÍNIO, ESTAVA NOS COLETORES. `RIQUEZA_DO_SALDO` já dizia
 * `pontos > games > sets` e `unidadeMaisRicaComum` já escolhia certo — mas NENHUM construtor de linha
 * preenchia `rallyFor`/`rallyAgainst`. Com o campo sempre ausente, `temUnidade('pontos')` reprovava
 * sempre e o degrau mais rico era INALCANÇÁVEL: mesmo com placar ao vivo aplicado, o saldo caía para
 * games. Régua certa que ninguém alimenta é régua que não vale.
 *
 * ⚠️ SÃO DOIS COLETORES e conferir um só deixaria o outro vazando:
 *   ① `_rankByTiebreakers` — é por onde a REPESCAGEM ordena os derrotados;
 *   ② `_accumulateGSM`, dentro do construtor de classificação — é por onde a TABELA sai.
 * [[feedback_enumerar_todos_os_caminhos_antes_de_dar_por_pronto]]
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

console.log('\n──── o saldo é sempre na unidade mais rica ────\n');

/* ── ① A ESCADA, no domínio ─────────────────────────────────────────────────── */
const S = require(path.join(ROOT, 'js/domain/standings.js'));
const D = S.Standings || S.standings || S;
ok(Array.isArray(D.RIQUEZA_DO_SALDO), '① a escada existe');
ok(String((D.RIQUEZA_DO_SALDO || []).join('>')) === 'pontos>games>sets',
  '① ⛔⛔ e é exatamente rally > games > sets (achei "' + (D.RIQUEZA_DO_SALDO || []).join('>') + '")');

const linha = (o) => Object.assign({ setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0 }, o);
if (typeof D.unidadeMaisRicaComum === 'function') {
  const u = D.unidadeMaisRicaComum;
  ok(u(linha({ setsWon: 2, setsLost: 0 }), linha({ setsWon: 0, setsLost: 2 })) === 'sets',
    '① só sets gravados ⇒ o saldo é de SETS');
  ok(u(linha({ setsWon: 2, setsLost: 0, gamesWon: 12, gamesLost: 5 }),
       linha({ setsWon: 0, setsLost: 2, gamesWon: 5, gamesLost: 12 })) === 'games',
    '① ⛔ havendo games, sets NÃO decide mais');
  ok(u(linha({ setsWon: 2, gamesWon: 12, rallyFor: 60, rallyAgainst: 40 }),
       linha({ setsLost: 2, gamesLost: 12, rallyFor: 40, rallyAgainst: 60 })) === 'pontos',
    '① ⛔⛔ havendo ponto de rally, ele vence games e sets — é o degrau mais rico');
  /* ⛔ a régua tem de existir nos DOIS: rally de um contra games do outro não compara nada */
  ok(u(linha({ setsWon: 2, gamesWon: 12, gamesLost: 5, rallyFor: 60, rallyAgainst: 40 }),
       linha({ setsLost: 2, gamesWon: 5, gamesLost: 12 })) === 'games',
    '① rally só de um lado: desce para a régua que os dois têm');
  /* ⛔ CAMPO PRESENTE E ZERADO NÃO É RÉGUA — foi um defeito real: todo torneio virava "games" numa
   * régua vazia onde todos empatam em 0. */
  ok(u(linha({ setsWon: 2, setsLost: 0, gamesWon: 0, gamesLost: 0 }),
       linha({ setsWon: 0, setsLost: 2, gamesWon: 0, gamesLost: 0 })) === 'sets',
    '① ⛔⛔ games presentes mas ZERADOS não contam como régua');
}

/* ── ② OS DOIS COLETORES PREENCHEM rallyFor/rallyAgainst ────────────────────── */
const bl = fs.readFileSync(path.join(ROOT, 'js/views/bracket-logic.js'), 'utf8');
const blCodigo = bl.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
/* ⛔ recorte pelo PRÓPRIO identificador, nunca por janela de tamanho fixo */
const bloco = (nome) => {
  const i = blCodigo.indexOf(nome);
  if (i < 0) return '';
  const j = blCodigo.indexOf('\n  }', i);
  return j < 0 ? blCodigo.slice(i) : blCodigo.slice(i, j);
};
const rank = bloco('function _rankByTiebreakers(');
ok(rank.length > 200, '② o ranker dos derrotados foi achado pelo identificador');
ok(/rallyFor/.test(rank) && /liveStats\.pointsP1/.test(rank),
  '② ⛔⛔ o ranker da REPESCAGEM coleta ponto de rally');
ok(/rallyFor: rallyFor/.test(rank) && /rallyAgainst: rallyAgainst/.test(rank),
  '② e devolve os dois na linha — coletar sem devolver não serve de nada');

const gsm = bloco('function _accumulateGSM(');
ok(gsm.length > 200, '② o construtor da classificação foi achado');
ok(/rallyFor/.test(gsm) && /liveStats\.pointsP1/.test(gsm),
  '② ⛔⛔ o construtor da TABELA também coleta — um só deixaria o outro vazando');
/* ⛔ e a coleta vem ANTES do `return` que pula quem não tem sets: jogo medido só ao vivo não pode
 * perder o rally por não ter array de sets. */
const iRally = gsm.indexOf('rallyFor');
const iRet = gsm.indexOf("if (!Array.isArray(m.sets)");
ok(iRally > 0 && iRet > 0 && iRally < iRet,
  '② ⛔ e coleta ANTES da saída antecipada dos sets — senão jogo só-ao-vivo perderia o rally');

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✅ ') + pass + ' verificações');
process.exit(fail ? 1 : 0);
