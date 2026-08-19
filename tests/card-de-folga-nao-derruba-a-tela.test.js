/* O CARD DE FOLGA NÃO DERRUBA A TELA DA FASE DE GRUPOS
 * node tests/card-de-folga-nao-derruba-a-tela.test.js
 *
 * A FALHA REAL (Sentry SCOREPLACE-WEB-83, 19/ago/2026, iOS nativo):
 * `ReferenceError: Cannot access 't' before initialization` em renderMatchCard —
 * a tela inteira da fase de grupos morre pro usuário.
 *
 * A CAUSA (regressão da 4.0.84-beta, 30/jun, latente 7 semanas): a varredura
 * "nome ao vivo por uid" (d68b3907) pôs `t ? _resolveSideLive(t, m.p1, …) : m.p1`
 * DENTRO do branch de Folga (`m.isSitOut`, retorno antecipado) — mas o
 * `const t = _findTournamentById(tId)` morava DEPOIS do branch. `const` no corpo
 * da função + uso antes da linha da declaração = zona morta temporal (TDZ):
 * qualquer card de Folga que renderize por aqui explode, não é edge case de dado.
 * Passava batido porque a maioria das Folgas renderiza pelo OUTRO renderizador
 * de card (são dois — ver project_two_participant_card_renderers).
 *
 * O que trava aqui (bracket.js REAL no harness de render):
 *   1. renderMatchCard com card de Folga NÃO lança — e resolve o nome AO VIVO
 *      pelo uid (a intenção da 4.0.84, que nunca funcionou neste branch);
 *   2. Folga por inatividade idem;
 *   3. nenhuma outra função do bracket.js repete o padrão (uso de `t` antes
 *      do seu `const t =` na mesma função).
 */
const fs = require('fs');
const path = require('path');
const { sandbox } = require('./render-harness');
const W = sandbox;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

console.log('──── card de Folga não derruba a tela ────');

// Torneio mínimo com perfil vivo pro _resolveSideLive ter o que resolver.
const t = {
  id: 'T-folga', name: 'R/R', format: 'Torneio', status: 'active',
  participants: [{ uid: 'u1', name: 'Fulano Antigo' }],
  matches: [], rounds: []
};
W.AppStore.tournaments = [t];
W.AppStore.currentUser = { uid: 'org' };
W._findTournamentById = () => t;
W._currentBracketTournament = t;

// 1. Folga comum — era AQUI que a TDZ estourava.
{
  let html = null, erro = null;
  try {
    html = W.renderMatchCard({ id: 'm1', isSitOut: true, p1: 'Fulano Antigo', p1Uid: 'u1', sitOutPoints: 3 }, false, 'T-folga', 1);
  } catch (e) { erro = e; }
  ok(!erro, 'card de Folga renderiza SEM lançar (era ReferenceError: Cannot access \'t\'): ' + (erro || ''));
  ok(html && html.indexOf('Folga') !== -1, 'o card diz que é Folga');
  ok(html && html.indexOf('Fulano') !== -1, 'o nome do jogador está no card');
}

// 2. Folga por inatividade (o outro braço do mesmo branch).
{
  let html = null, erro = null;
  try {
    html = W.renderMatchCard({ id: 'm2', isSitOut: true, sitOutReason: 'inactive', p1: 'Fulano Antigo', p1Uid: 'u1' }, false, 'T-folga', 2);
  } catch (e) { erro = e; }
  ok(!erro, 'Folga por inatividade também não lança: ' + (erro || ''));
  ok(html && html.indexOf('inativo') !== -1, 'o card marca a inatividade');
}

// 3. O padrão não pode voltar: em NENHUMA função do bracket.js pode haver uso de
//    `t` (com o gate `t ?` ou `t.`/`(t,`) ANTES do próprio `const t =` da função.
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'bracket.js'), 'utf8');
  const linhas = src.split('\n');
  const infratores = [];
  let fnInicio = -1, declLinha = -1, usoAntes = -1;
  linhas.forEach((l, i) => {
    if (/^function /.test(l)) { fnInicio = i; declLinha = -1; usoAntes = -1; return; }
    if (fnInicio < 0) return;
    if (/const t = window\.AppStore/.test(l)) {
      if (usoAntes >= 0) infratores.push('função da linha ' + (fnInicio + 1) + ': usa `t` na linha ' + (usoAntes + 1) + ' antes do `const t` da linha ' + (i + 1));
      declLinha = i; return;
    }
    // uso "real" de t: `t ?`, `t.algo`, `(t,` — fora de comentário
    if (declLinha < 0 && usoAntes < 0 && !/^\s*(\/\/|\*)/.test(l) && /[^a-zA-Z0-9_$.]t(\s*\?|\.[a-zA-Z]|,\s)/.test(l) && /\(t[,.)]|\bt \?|\bt\./.test(l)) {
      usoAntes = i;
    }
  });
  ok(infratores.length === 0, 'nenhuma função usa `t` antes do próprio `const t =`: ' + infratores.join(' · '));
}

console.log(`\n  ${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
