/* O CARTÃO LÊ O RESUMO **OU** O DOCUMENTO COMPLETO — e dá o MESMO número.
 *
 * DESENHO (ordem do dono): _"na dashboard precisamos da versão reduzida sempre e
 * clicando no torneio traz os detalhes. esse sempre foi o desenho."_
 *
 * Este é o passo INVISÍVEL da troca: o cartão passa a tolerar as duas formas de
 * entrada, mas a fonte de dados ainda não mudou. A leva seguinte é que troca a
 * consulta da tela inicial — fazer as duas na MESMA leva é o erro que já obrigou uma
 * reversão inteira.
 *
 * ⛔ O QUE ISTO TRAVA: número do cartão que MUDA conforme a origem do dado. Já
 * aconteceu neste repo: a 1ª versão do resumo recalculava por conta própria e divergia
 * do app em 10 dos 28 torneios (Confra 143×146 competidores; "Misto FUTVOLEI" 0/7×12/19
 * de progresso). Cartão com número errado é PIOR que cartão lento.
 */
const HARNESS = require('./render-harness');
const W = HARNESS.window;
const M = require('../functions-autodraw/tournament-summary-core.js');
const fs = require('fs');
const path = require('path');

const helpers = M.helpersDe(W);
const buildSummary = (t, id) => M.buildSummary(t, id, helpers);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

console.log('──── o cartão lê o RESUMO ou o DOCUMENTO, com o mesmo resultado ────');

// ── ① sem os campos do resumo, comporta-se EXATAMENTE como antes ─────────────
{
  const arr = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'prod-tournaments.json'), 'utf8'));
  const lista = Array.isArray(arr) ? arr : (arr.tournaments || []);
  let iguais = 0; const divergentes = [];
  lista.forEach((t) => {
    const c = W._cardCompetidores(t), e = W._cardEspera(t), p = W._cardProgresso(t);
    const cRef = W._countCompetitors(t), eRef = W._waitlistPeopleCount(t), pRef = W._getTournamentProgress(t);
    const bate = c.people === cRef.people && c.teams === cRef.teams && e === eRef
      && p.total === pRef.total && p.completed === pRef.completed && p.pct === pRef.pct;
    if (bate) iguais++; else if (divergentes.length < 3) divergentes.push((t.name || '').slice(0, 24));
  });
  ok(lista.length > 10, 'a base real de teste tem torneios de verdade (' + lista.length + ')');
  ok(iguais === lista.length,
     '⛔ com o documento COMPLETO o cartão devolve exatamente o que sempre devolveu (' +
     iguais + '/' + lista.length + ')' + (divergentes.length ? ' — divergem: ' + divergentes.join(' · ') : ''));
}

// ── ② com o RESUMO, os mesmos números ────────────────────────────────────────
{
  const arr = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'prod-tournaments.json'), 'utf8'));
  const lista = Array.isArray(arr) ? arr : (arr.tournaments || []);
  let iguais = 0; const divergentes = [];
  lista.forEach((t) => {
    const resumo = buildSummary(t, t.id || t._docId);
    const cheio = { c: W._cardCompetidores(t), e: W._cardEspera(t), p: W._cardProgresso(t), d: W._cardTemChave(t) };
    const leve = { c: W._cardCompetidores(resumo), e: W._cardEspera(resumo), p: W._cardProgresso(resumo), d: W._cardTemChave(resumo) };
    const bate = cheio.c.people === leve.c.people && cheio.c.teams === leve.c.teams
      && cheio.e === leve.e
      && cheio.p.total === leve.p.total && cheio.p.completed === leve.p.completed && cheio.p.pct === leve.p.pct
      && cheio.d === leve.d;
    if (bate) iguais++;
    else if (divergentes.length < 3) {
      divergentes.push((t.name || '').slice(0, 20) + ' [' + cheio.c.people + '/' + leve.c.people +
        ' · ' + cheio.p.completed + '/' + cheio.p.total + ' vs ' + leve.p.completed + '/' + leve.p.total + ']');
    }
  });
  ok(iguais === lista.length,
     '⭐ RESUMO e DOCUMENTO dão o MESMO cartão nos ' + lista.length + ' torneios reais (' +
     iguais + '/' + lista.length + ')' + (divergentes.length ? ' — divergem: ' + divergentes.join(' · ') : ''));
}

// ── ③ o resumo é MESMO leve (senão a troca não tem propósito) ────────────────
{
  const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'confra-pos-sorteio.json'), 'utf8'));
  const t = fx.tournament || fx;
  const resumo = buildSummary(t, t.id);
  const kbT = JSON.stringify(t).length / 1024, kbR = JSON.stringify(resumo).length / 1024;
  ok(kbR < kbT * 0.15,
     'o resumo do maior torneio pesa ' + kbR.toFixed(1) + ' KB contra ' + kbT.toFixed(0) + ' KB do documento');
  ok(W._cardTemChave(resumo) === true && W._cardTemChave(t) === true,
     '"já sorteou?" funciona SEM as listas viajarem (é o ponto do resumo)');
}

// ── ④ ⛔ nunca inventa número quando não há dado ─────────────────────────────
{
  ok(W._cardCompetidores(null).people === 0 && W._cardEspera(null) === 0,
     'entrada nula devolve zero, não NaN');
  const vazio = { id: 'x' };
  const p = W._cardProgresso(vazio);
  ok(p.total === 0 && p.completed === 0 && p.pct === 0, 'torneio vazio devolve 0/0 (0%)');
  ok(W._cardTemChave(vazio) === false, 'e "já sorteou?" é false, não undefined');
  // ⛔ o campo do resumo pode vir NULL (a CF devolve null quando não tem os helpers do
  // app — melhor não ter número do que ter errado). Nesse caso CALCULA, não mostra null.
  const comNull = { id: 'y', competitorsCount: null, waitlistCount: null, matchesTotal: null,
                    participants: [{ uid: 'a' }, { uid: 'b' }] };
  ok(W._cardCompetidores(comNull).people === W._countCompetitors(comNull).people,
     '⛔ campo do resumo NULL cai no cálculo completo — nunca vira 0 silencioso');
}

// ── ⑤ o cartão de fato passou a usar os acessadores ─────────────────────────
// Sem isto o teste acima passaria com o dashboard ainda chamando as funções antigas.
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'dashboard.js'), 'utf8');
  ok(src.indexOf('_cardCompetidores') !== -1 && src.indexOf('_cardProgresso') !== -1
     && src.indexOf('_cardEspera') !== -1 && src.indexOf('_cardTemChave') !== -1,
     '⛔ o dashboard usa os acessadores (senão nada disto vale no ar)');
}

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + ' ok, ' + fail + ' falha(s)');
process.exit(fail ? 1 : 0);
