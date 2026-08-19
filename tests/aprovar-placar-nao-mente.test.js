/* APROVAR PLACAR NÃO PODE MENTIR
 * node tests/aprovar-placar-nao-mente.test.js
 *
 * A FALHA REAL (relato da Sônia, 18/ago/2026): ela confirmou resultados pela notificação,
 * o app disse que confirmou — e, entrando no torneio, os jogos seguiam PENDENTES de
 * aprovação. Aprovar dentro do torneio funcionou.
 *
 * A CAUSA era estrutural, não um caso de borda: `_approveResult` mostrava
 * "✅ Resultado aprovado" ANTES de qualquer gravação (a tela era atualizada de forma
 * otimista) e só DEPOIS chamava a persistência — numa promessa SEM `.catch`. Se ela
 * falhasse (regra do Firestore, rede, contenção), a rejeição virava *unhandled* e sumia:
 * a pessoa ficava com a certeza de ter confirmado e ia embora.
 * `try/catch` não pega isso — ver [[feedback_try_catch_nao_pega_promessa]], que foi a
 * issue nº 1 do Sentry por três meses pela mesma razão.
 *
 * O CONTRATO travado aqui:
 *   1. o aviso de sucesso NÃO existe solto no corpo — ele é consequência da gravação;
 *   2. TODO caminho de persistência tem `.catch`, e o `.catch` AVISA a pessoa;
 *   3. a mensagem de falha diz a verdade operacional: o jogo continua PENDENTE.
 *
 * ⚠️ Vale pros DOIS caminhos: o normal (`commitTournamentTx`) e o deferido
 * (`_closeRound`, usado quando a aprovação fecha a última rodada). Só um deles coberto
 * deixa metade do relato vivo.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let falhas = 0;
function ok(cond, msg) {
  if (cond) { console.log('  ✓ ' + msg); return; }
  falhas++; console.log('  ✗ ' + msg);
}

const src = fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket-ui.js'), 'utf8');

console.log('\nAPROVAR PLACAR NÃO PODE MENTIR');

// isola o corpo de _approveResult
const corpo = (src.match(/window\._approveResult\s*=\s*function[\s\S]*?\n};/) || [''])[0];
ok(corpo.length > 0, 'consegui isolar o corpo de `_approveResult`');

// ── 1. O SUCESSO É CONSEQUÊNCIA DA GRAVAÇÃO ─────────────────────────────────
// A assinatura da falha: a chamada do toast de sucesso como STATEMENT do corpo, isto é,
// numa linha que começa com `showNotification('✅` — fora de qualquer callback.
const soltoNoCorpo = /\n\s{0,4}showNotification\(\s*['"]✅ Resultado aprovado/.test(corpo);
ok(!soltoNoCorpo,
   'o "✅ Resultado aprovado" NÃO é disparado solto no corpo (era a mentira)');
ok(/_avisarOk\s*=\s*function/.test(corpo),
   'o aviso de sucesso vive numa função, pra ser chamado DEPOIS da gravação');
ok(/\.then\(\s*_avisarOk\s*\)/.test(corpo),
   'e é encadeado no `.then` da persistência');

// ── 2. TODO CAMINHO DE PERSISTÊNCIA TEM .catch ──────────────────────────────
ok(/commitTournamentTx[\s\S]{0,400}?\.catch\(\s*_avisarFalha\s*\)/.test(corpo),
   'o caminho normal (commitTournamentTx) trata a rejeição');
ok(/_closeRound[\s\S]{0,400}?\.catch\(\s*_avisarFalha\s*\)/.test(corpo),
   'o caminho deferido (_closeRound, fecho de rodada) também trata');
// `_closeRound` pode não devolver promessa — encapsular protege sem mudar o contrato dele
ok(/Promise\.resolve\(/.test(corpo),
   'as chamadas são encapsuladas em Promise.resolve (funciona devolvendo promessa ou não)');

// ── 3. A FALHA DIZ A VERDADE ────────────────────────────────────────────────
const falhaFn = (corpo.match(/_avisarFalha\s*=\s*function[\s\S]*?\n  \};/) || [''])[0];
ok(/showNotification/.test(falhaFn), 'a falha AVISA a pessoa (não morre no console)');
ok(/PENDENTE/i.test(falhaFn),
   'e diz o estado real do jogo — continua pendente, que é o que a Sônia precisava saber');
ok(/_captureException|_error/.test(falhaFn),
   'e a falha é registrada, pra a causa aparecer no Sentry em vez de sumir');

console.log(falhas === 0
  ? '\n✅ o aviso segue a gravação — não a substitui\n'
  : '\n❌ ' + falhas + ' falha(s)\n');
process.exit(falhas === 0 ? 0 : 1);
