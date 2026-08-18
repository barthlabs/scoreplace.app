/* "Jogador sem perfil (XXXX)" no lugar de gente que TEM perfil — o caso do Confra real
 * (tour_1780009816637, print do dono 18/ago/2026): 1 desativado, 5 W.O. e 1 na lista de
 * espera, TODOS com users/{uid} vivo e displayName preenchido (medido: 143/143 dos uids
 * do elenco resolvem). O defeito é de RENDER, não de dado:
 *
 *   1. O elenco em produção é STRIPPADO (o inscrito guarda só `uid`). Com o cache de
 *      perfis ainda FRIO — `_preloadPlayerPhotos` é assíncrono e são 143 leituras —,
 *      `_pName(entrada)` devolve o RÓTULO NEUTRO, que é truthy. `_resolveSideLive` lê
 *      esse rótulo pelo pool e o prefere ao nome GRAVADO na folga ("Fernanda Martins").
 *      Ou seja: o resolvedor não sabe dizer "não sei" — a mesma lição da v1.8.29, que
 *      só tinha sido aprendida no card da chave.
 *   2. Os chips de "Ficaram de fora desta rodada" desenham o nome como TEXTO CONGELADO.
 *      Quando os perfis chegam, `_hydrateUidNames` não tem o que curar (não há
 *      [data-uid-name]) e o `_softRefreshView` do preload cai no gate de assinatura do
 *      detalhe (o doc não mudou) → o rótulo fica na tela até navegar pra fora e voltar.
 *
 * Ver [[feedback_rotulo_por_perfil_nunca_congelado_no_render]].
 */
const H = require('./render-harness');
const W = H.window;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }

console.log('\n== rótulo órfão não vence o nome (cache frio) ==');

const t = H.buildViaDraw('Liga', 8, { drawMode: 'rei_rainha', ligaRoundFormat: 'rei_rainha', drawManual: true });
t.phases = [{ name: 'RR', formatCode: 'liga', reiRainha: true, source: { type: 'enrollment' } }];
t.currentPhaseIndex = 0;

// elenco como em produção: inscrito guarda SÓ uid (sem displayName/name)
t.participants.forEach(function (p) { delete p.displayName; delete p.name; });
// quem ficou de fora: entrada só-uid no elenco + folga com o rótulo GRAVADO no sorteio
t.participants.push({ uid: 'u9', ligaActive: false }, { uid: 'u10', ligaActive: true });
const r = t.rounds[0];
r.matches.push({ id: 'so1', isSitOut: true, sitOutReason: 'inactive', p1: 'Fernanda Martins', p1Uid: 'u9', team1Uids: ['u9'], sitOutPoints: 0 });
r.matches.push({ id: 'so2', isSitOut: true, sitOutReason: 'wo', p1: 'Denise Mamesso', p1Uid: 'u10', team1Uids: ['u10'] });
// lista de espera: entrada só-uid (nenhum nome gravado em lugar nenhum)
t.standbyParticipants = [{ uid: 'u11', ligaActive: true, addedAt: '2026-08-14T13:35:59.174Z' }];

// CACHE FRIO — é o estado da 1ª pintura, antes de o preload de perfis responder
W._profileNameByUid = {};
W._userProfileCache = {};
W.AppStore.currentUser = { uid: 'u1', displayName: 'J1', email: 'x@y.z' };

// o que o USUÁRIO lê: texto e tooltip. `onclick=` fica de fora de propósito — ali o rótulo
// é CHAVE de casamento com os jogos (comentário do _liveRowName), não texto de tela; e
// `data-players` é o índice da BUSCA, curado por _hydrateUidNames quando os perfis chegam.
const _visivel = function (h) { return String(h).replace(/onclick="[^"]*"/g, '').replace(/data-players="[^"]*"/g, ''); };
const html = _visivel(String(W.renderStandings(t, true, true, '', '') || ''));

ok(html.indexOf('Ficaram de fora') !== -1, 'a seção "Ficaram de fora desta rodada" renderizou');
ok(html.indexOf('Jogador sem perfil') === -1,
  'nenhum "Jogador sem perfil" na tela com cache frio (o rótulo neutro não é resposta)');
ok(html.indexOf('Fernanda Martins') !== -1, 'desativado: o nome GRAVADO na folga aparece (não o rótulo)');
ok(html.indexOf('Denise Mamesso') !== -1, 'W.O.: o nome GRAVADO na folga aparece (não o rótulo)');
// e o que cura quando o perfil chega: o chip declara o uid pro hidratador
ok(/data-uid-name="u9"/.test(html), 'chip do desativado declara data-uid-name (cura na hidratação)');
ok(/data-uid-name="u10"/.test(html), 'chip do W.O. declara data-uid-name');
ok(/data-uid-name="u11"/.test(html), 'chip da lista de espera declara data-uid-name (só-uid: só o perfil resolve)');

// com o cache QUENTE o nome VIVO do perfil vence o rótulo gravado (nome não envelhece)
W._profileNameByUid = { u9: 'Fernanda M. Silva', u10: 'Denise M.', u11: 'Vanessa K.' };
const html2 = _visivel(String(W.renderStandings(t, true, true, '', '') || ''));
ok(html2.indexOf('Fernanda M. Silva') !== -1, 'cache quente: nome do PERFIL vence o gravado');
ok(html2.indexOf('Vanessa K.') !== -1, 'cache quente: quem só tem uid ganha o nome do perfil');
ok(html2.indexOf('Jogador sem perfil') === -1, 'cache quente: nenhum rótulo órfão');

// a CLASSIFICAÇÃO (geral e do grupo) segue o mesmo cânone: com o cache frio a linha declara
// o uid e espera a hidratação — medido no doc real do Confra: 142 de 142 linhas saíam com o
// rótulo neutro porque `_computeStandings` lê a entrada STRIPPADA do elenco.
W._profileNameByUid = {}; W._userProfileCache = {};
const html3 = _visivel(String(W.renderStandings(t, true, true, '', '') || ''));
ok(html3.indexOf('Jogador sem perfil') === -1, 'classificação: nenhuma linha congela o rótulo neutro');
ok(/data-uid-name="u1"/.test(html3), 'classificação: a linha declara o uid pro hidratador');

console.log((fail ? '❌' : '✅') + ' rotulo-orfao-nao-vence-o-nome: ' + pass + ' asserções, ' + fail + ' falha(s)');
process.exit(fail ? 1 : 0);
