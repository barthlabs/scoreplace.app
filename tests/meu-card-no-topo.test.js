/* "Eu estou inscrito?" — node tests/meu-card-no-topo.test.js
 *
 * Pedido do dono (02/ago/2026): "nessa lista, vamos colocar o card do usuário no topo
 * absoluto, acima até dos organizadores. assim eles param de perguntar ao organizador se
 * estão inscritos" — e logo depois: "fazer isso em TODAS as listas de participantes".
 *
 * Numa lista de 105 nomes, achar o próprio é trabalho; quem não acha, pergunta. E quem
 * pergunta é justamente quem NÃO está inscrito — por isso o card também responde "não".
 */
const path = require('path'), fs = require('fs'), vm = require('vm');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } }

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8');
const i = src.indexOf('window._meuCardNoTopo = function');
const j = src.indexOf('// Usados no card de inscritos');
const ctx = { window: {}, console, Object, Array, String, JSON };
vm.createContext(ctx);
ctx.window._safeHtml = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
ctx.window._participantUids = (p) => [p && p.uid, p && p.p1Uid, p && p.p2Uid].filter(Boolean);
ctx.window._profileAvatarUrl = () => 'http://x/a.png';
vm.runInContext(src.slice(i, j), ctx);
const pin = ctx.window._meuCardNoTopo;

const EU = 'uid-eu';
function comUsuario(u, parts) {
  ctx.window.AppStore = { currentUser: u };
  ctx.window._getCompetitors = () => parts;
  return pin({ id: 't1', participants: parts, checkedIn: [], absent: [] });
}

console.log('\n── inscrito: responde antes de a pessoa procurar ──');
{
  const h = comUsuario({ uid: EU, displayName: 'Fabio' },
    [{ uid: 'outro', displayName: 'Kelly' }, { uid: EU, displayName: 'Fabio', category: 'Masc C', enrollSeq: 12 }]);
  ok(/você está inscrito/.test(h), 'diz que está inscrito');
  ok(/Fabio/.test(h), 'com o nome');
  ok(/Masc C/.test(h), 'a categoria');
  ok(/nº 12/.test(h), 'e o número de inscrição');
}

console.log('\n── NÃO inscrito também é resposta ──');
{
  const h = comUsuario({ uid: EU, displayName: 'Fabio' }, [{ uid: 'outro', displayName: 'Kelly' }]);
  ok(/não está inscrito/.test(h), 'diz claramente que não está');
  ok(!/você está inscrito/.test(h), 'e não diz o contrário junto');
}

console.log('\n── dupla: identidade por uid, dos DOIS membros ──');
{
  const h = comUsuario({ uid: EU, displayName: 'Fabio' },
    [{ p1Uid: 'outro', p2Uid: EU, p1Name: 'Kelly', p2Name: 'Fabio', displayName: 'Kelly / Fabio' }]);
  ok(/você está inscrito/.test(h), 'acha a pessoa dentro da dupla');
  ok(/com <b>Kelly<\/b>/.test(h), 'e mostra com quem ela joga');
}

console.log('\n── presença, quando a chamada está aberta ──');
{
  ctx.window.AppStore = { currentUser: { uid: EU, displayName: 'Fabio' } };
  const parts = [{ uid: EU, displayName: 'Fabio' }];
  ctx.window._getCompetitors = () => parts;
  ok(/presente/.test(pin({ id: 't', participants: parts, checkedIn: ['Fabio'], absent: [] })), 'presente aparece');
  ok(/ausente/.test(pin({ id: 't', participants: parts, checkedIn: [], absent: ['Fabio'] })), 'ausente também');
}

console.log('\n── visitante sem login não vê nada ──');
{
  ctx.window.AppStore = { currentUser: null };
  ok(pin({ id: 't', participants: [] }) === '', 'sem usuário, sem card');
}

console.log('\n── EM TODAS AS LISTAS, e no topo ABSOLUTO ──');
{
  const det = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments.js'), 'utf8');
  ok(/_meuCardNoTopo\(visible\[0\]\)/.test(det), 'detalhe do torneio tem o card');
  ok(det.indexOf('_meuCardNoTopo(visible[0])') < det.indexOf('${tournamentId ? _organizersHtml'),
     'e ele vem ANTES da seção ORGANIZAÇÃO (topo absoluto, como pedido)');
  const cha = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'participants.js'), 'utf8');
  ok(/_meuCardNoTopo\(t\)/.test(cha), 'a chamada (#participants) também');
  ok(cha.indexOf('_meuCardNoTopo(t)') < cha.indexOf('${rollCallBanner}'), 'no topo dela também');
}

console.log((fail ? '✗' : '✓') + ' meu-card-no-topo: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
