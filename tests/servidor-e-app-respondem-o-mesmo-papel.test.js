'use strict';
/* ⛔⛔ O SERVIDOR E O APLICATIVO TÊM DE RESPONDER O MESMO "É SEU?" (24/set/2026).
 *
 * Pergunta do dono: _"porque vc acha que é a forma certa de trabalhar com um banco de dados?"_
 *
 * A resposta honesta é: o documento guarda FATOS (quem criou, quem são os co-organizadores
 * ativos) e não guarda a RESPOSTA, porque a resposta depende de quem pergunta — ela não cabe
 * num documento compartilhado. Servidor e aplicativo derivam dos mesmos fatos: o servidor
 * DECIDE (nas regras, onde o cliente não alcança) e o aplicativo só decide que botão desenhar.
 *
 * ⚠️ MAS há um ponto em que ele está certo, e é este teste: a regra do Firestore não consegue
 * percorrer uma lista de objetos e filtrar por `status`. Então o co-organizador ativo é
 * ACHATADO em `adminUids`, recomputado em todo save — ou seja, uma RESPOSTA DERIVADA guardada
 * no banco, que é justamente o que cria duas verdades. Medido em produção em 24/set: 78
 * torneios, ZERO divergências — mas só 1 torneio tem co-organizador ativo, então essa
 * sincronia quase nunca foi exercitada. Este teste a exercita.
 */
/* ⛔ UID DE FIXTURE TEM DE PARECER UID. Na primeira versão usei 'uid-cohost-0001' e 'uid-criador-0001' curtos, e o
 * recomputo os DESCARTOU por um piso de tamanho — o teste acusou "o servidor nega quem o app
 * mostra" e eu quase reportei defeito de produção que não existe. Segunda vez no dia em que a
 * fixture me engana. [[feedback_medir_com_dado_real_antes_de_teorizar]] */
const path = require('path');
const C = require(path.join(__dirname, '..', 'functions', 'cohost-core.js'));

let fail = 0, pass = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.error('  ✗ ' + msg); } }

console.log('──── servidor e app respondem o mesmo papel ────');

/* A regra do Firestore: `creatorUid == uid || uid in adminUids`. */
const servidorDeixa = (t, uid) => !!(uid && ((t.creatorUid && t.creatorUid === uid)
  || (Array.isArray(t.adminUids) && t.adminUids.indexOf(uid) !== -1)));

/* O aplicativo (AppStore.isOrganizer): dono do sandbox, criador, ou co-organizador ATIVO. */
const appMostra = (t, uid) => !!(uid && ((t.sandboxOwnerUid && t.sandboxOwnerUid === uid)
  || (t.creatorUid && t.creatorUid === uid)
  || (Array.isArray(t.coHosts) && t.coHosts.some((c) => c && c.status === 'active' && c.uid === uid))));

function conferir(nome, t, uids) {
  const lista = Array.isArray(t.adminUids) ? t.adminUids : [];
  const recomputado = C.computeAdminUids(t);
  ok(JSON.stringify(lista.slice().sort()) === JSON.stringify(recomputado.slice().sort()),
    nome + ': a lista achatada do servidor bate com o recomputo dos fatos');
  uids.forEach((uid) => {
    ok(servidorDeixa(Object.assign({}, t, { adminUids: recomputado }), uid) === appMostra(t, uid),
      nome + ': mesma resposta para ' + uid + ' (servidor ' + (servidorDeixa(Object.assign({}, t, { adminUids: recomputado }), uid) ? 'deixa' : 'nega')
      + ' · app ' + (appMostra(t, uid) ? 'mostra' : 'esconde') + ')');
  });
}

// ① o caso comum: só o criador
{
  const t = { creatorUid: 'uid-criador-0001' };
  t.adminUids = C.computeAdminUids(t);
  conferir('só criador', t, ['uid-criador-0001', 'uid-estranho-0001']);
}

// ② co-organizador ATIVO — o caso que a base quase não tem
{
  const t = { creatorUid: 'uid-criador-0001', coHosts: [{ uid: 'uid-cohost-0001', status: 'active' }] };
  t.adminUids = C.computeAdminUids(t);
  conferir('co-organizador ativo', t, ['uid-criador-0001', 'uid-cohost-0001', 'uid-estranho-0001']);
}

// ③ co-organizador INATIVO: os dois têm de NEGAR
{
  const t = { creatorUid: 'uid-criador-0001', coHosts: [{ uid: 'uid-cohost-0001', status: 'revoked' }] };
  t.adminUids = C.computeAdminUids(t);
  ok(t.adminUids.indexOf('uid-cohost-0001') === -1, 'inativo NÃO entra na lista do servidor');
  conferir('co-organizador inativo', t, ['uid-criador-0001', 'uid-cohost-0001']);
}

// ④ misto: um ativo, um revogado, um pendente
{
  const t = { creatorUid: 'uid-criador-0001', coHosts: [
    { uid: 'uid-cohost-0001', status: 'active' }, { uid: 'uid-cohost-0002', status: 'revoked' }, { uid: 'uid-cohost-0003', status: 'pending' }] };
  t.adminUids = C.computeAdminUids(t);
  conferir('misto', t, ['uid-criador-0001', 'uid-cohost-0001', 'uid-cohost-0002', 'uid-cohost-0003']);
}

// ⑤ A DIVERGÊNCIA, nomeada: lista achatada VELHA (o save não recomputou)
{
  const t = { creatorUid: 'uid-criador-0001', coHosts: [{ uid: 'uid-cohost-0001', status: 'revoked' }],
    adminUids: ['uid-criador-0001', 'uid-cohost-0001'] };   // ficou de quando co1 era ativo
  ok(servidorDeixa(t, 'uid-cohost-0001') === true && appMostra(t, 'uid-cohost-0001') === false,
    '⛔ REGRESSÃO NOMEADA: lista achatada velha faz o SERVIDOR deixar quem o APP já esconde');
  ok(C.computeAdminUids(t).indexOf('uid-cohost-0001') === -1,
    'e o recomputo dos FATOS corrige — é por isso que ele roda em todo save');
}

// ⑥ o recomputo nunca inventa ninguém
{
  const t = { creatorUid: 'uid-criador-0001', coHosts: [{ status: 'active' }, { uid: '', status: 'active' }, null] };
  const r = C.computeAdminUids(t);
  ok(r.length === 1 && r[0] === 'uid-criador-0001', 'co-organizador sem uid não entra — identidade é uid');
}

console.log(fail ? `❌ servidor-e-app-respondem-o-mesmo-papel: ${fail} falha(s), ${pass} ok`
                 : `✅ servidor-e-app-respondem-o-mesmo-papel: ${pass} ok`);
process.exit(fail ? 1 : 0);
