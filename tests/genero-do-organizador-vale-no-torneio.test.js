/* ⭐ A DECISÃO DE GÊNERO DO ORGANIZADOR VALE NO TORNEIO — e sobrevive ao save e à hidratação.
 *
 * ⛔ POR QUE ESTE TESTE EXISTE. As duas portas do sorteio escreviam `gender` no perfil GLOBAL de
 * terceiro. Ser organizador não prova consentimento: inscrever terceiro é fluxo suportado
 * (`selfEnrolled:false`, `addedByUid`), então qualquer conta inscrevia a vítima no próprio torneio
 * e reescrevia o cadastro dela. As escritas saíram; a decisão passou a viver no INSCRITO, marcada.
 *
 * ⛔ E O QUE MATA ESSE CONSERTO, se ninguém olhar: o sanitizador de persistência APAGA campos de
 * perfil de quem tem uid — apagaria o gênero decidido, e a decisão evaporaria no próximo save.
 * Por isso metade deste arquivo é sobre o sanitizador, não sobre a regra.
 *
 * ⭐ MEDIDO na base antes de tirar as escritas: 181 slots com uid, ZERO divergências entre o gênero
 * do inscrito e o do perfil. Ou seja, a escrita não sustentava nada do que já existe.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.error('  ✗', m); } };

/* ── O sanitizador, no comportamento (não por texto) ───────────────────────── */
global.window = { _nameForUid: () => 'Fulano' };   // cache QUENTE: o ramo de perfil é percorrido
require(path.join(RAIZ, 'js/views/identity-core.js'));
/* A porta pública é a que sanitiza a LISTA; aqui se olha uma entrada por vez. */
const limpar = (e) => window._stripStoredNamesForUidEntries([e])[0];
ok(typeof window._stripStoredNamesForUidEntries === 'function',
  'o sanitizador de persistência está exposto');

{
  console.log('\n── o gênero decidido pelo organizador SOBREVIVE ──');
  let e = limpar({ uid: 'u1', gender: 'masculino', genderSource: 'organizador' });
  ok(e.gender === 'masculino' && e.genderSource === 'organizador',
    'inscrito com uid + marca: o PAR fica inteiro');

  e = limpar({ uid: 'u1', gender: 'masculino' });
  ok(e.gender === undefined, 'sem marca, o gênero continua saindo (é retrato velho do perfil)');

  e = limpar({ uid: 'u1', genderSource: 'organizador' });
  ok(e.genderSource === undefined, '⛔ marca ÓRFÃ (sem valor) é apagada — ela viraria "decidiu" sem decisão');

  e = limpar({ uid: 'u1', gender: 'misto', genderSource: 'organizador' });
  ok(e.gender === undefined && e.genderSource === undefined,
    '⛔ `misto` NUNCA é gênero de pessoa: o par inteiro cai');

  e = limpar({ uid: 'u1', gender: 'feminino', genderSource: 'perfil' });
  ok(e.gender === undefined && e.genderSource === undefined, 'marca de outra origem não protege nada');

  console.log('\n── e por MEMBRO de dupla ──');
  e = limpar({ p1Uid: 'a', p2Uid: 'b', p1Gender: 'feminino', p1GenderSource: 'organizador', p2Gender: 'masculino' });
  ok(e.p1Gender === 'feminino' && e.p1GenderSource === 'organizador', 'membro 1 marcado: fica');
  ok(e.p2Gender === undefined, 'membro 2 sem marca: sai, como antes');

  console.log('\n── CACHE FRIO: a limpeza do par não pode depender do perfil resolver ──');
  /* ⛔ O ramo de perfil só roda quando `_nameForUid` resolve. Num save logo após abrir, com o cache
   * vazio, a marca órfã e o `misto` passariam intactos — e o "limpa no próximo save" seria mentira. */
  window._nameForUid = () => '';
  e = limpar({ uid: 'u1', genderSource: 'organizador' });
  ok(e.genderSource === undefined, 'marca órfã cai mesmo com o cache de perfis vazio');
  e = limpar({ uid: 'u1', gender: 'misto', genderSource: 'organizador' });
  ok(e.genderSource === undefined, '`misto` cai mesmo com o cache vazio');
  window._nameForUid = () => 'Fulano';
}

/* ── O resolvedor do cliente ───────────────────────────────────────────────── */
console.log('\n── o resolvedor: decidido vence o perfil; sem marca, nada muda ──');
const perfis = { u1: { gender: 'feminino' } };
global.window._userProfileCache = perfis;
global.window._genderForUid = function (uid) { const p = uid && perfis[uid]; return (p && p.gender) || ''; };
const storeSrc = fs.readFileSync(path.join(RAIZ, 'js/store.js'), 'utf8');
const trecho = storeSrc.slice(storeSrc.indexOf('window._GENEROS_DE_PESSOA'), storeSrc.indexOf('window._pDefaultCat'));
eval(trecho);   // só o trecho do resolvedor — o arquivo inteiro é a SPA

ok(window._pGender({ uid: 'u1', gender: 'masculino', genderSource: 'organizador' }) === 'masculino',
  '⭐ decidido pelo organizador VENCE o perfil');
ok(window._pGender({ uid: 'u1', gender: 'masculino' }) === 'feminino',
  'sem marca, o perfil continua vindo primeiro — comportamento de hoje, intocado');
ok(window._pGender({ uid: 'u1' }) === 'feminino', 'sem gênero local, o perfil');
ok(window._pGender({ uid: 'zz', gender: 'outro', genderSource: 'organizador' }) === 'outro',
  'decidido vale mesmo sem perfil nenhum');
ok(window._pGender({ uid: 'u1', gender: 'misto', genderSource: 'organizador' }) === 'feminino',
  '⛔ `misto` marcado não vira gênero de pessoa: cai no perfil');
ok(window._pGenderMembro({ p1Uid: 'u1', p1Gender: 'masculino', p1GenderSource: 'organizador' }, 'p1') === 'masculino',
  '⭐ por membro de dupla, idem');
ok(window._pGenderMembro({ p1Uid: 'u1', p1Gender: 'masculino' }, 'p1') === 'masculino',
  'sem marca, o membro mantém o que cada leitor já fazia (campo local)');

/* ── A COROA de Rei/Rainha respeita a decisão ──────────────────────────────── */
console.log('\n── Rei/Rainha: a coroa não pode ignorar a decisão do organizador ──');
{
  /* ⛔ É AQUI QUE A DECISÃO MAIS APARECE: a coroa. Sem esta precedência, o organizador define o
   * gênero e o torneio coroa pelo perfil — decisão que não vale onde ela é vista. */
  /* ⚠️ `eval` de declaração de função dentro de bloco não a expõe fora do escopo do eval — por isso
   * a função é devolvida por expressão, e não "declarada e usada depois". */
  const bl = fs.readFileSync(path.join(RAIZ, 'js/views/bracket-logic.js'), 'utf8');
  const fonte = bl.slice(bl.indexOf('function _monarchGenderOf'), bl.indexOf('// Espalha a MINORIA'));
  const _monarchGenderOf = eval('(' + fonte.slice(0, fonte.lastIndexOf('}') + 1) + ')');
  window._displayNameForUid = function (uid, n) { return n; };
  const t = { participants: [
    { uid: 'u1', displayName: 'Solo', gender: 'masculino', genderSource: 'organizador' },
    { p1Uid: 'u1', p1Name: 'Membro', p1Gender: 'masculino', p1GenderSource: 'organizador',
      p2Uid: 'zz', p2Name: 'Outro', p2Gender: 'feminino' },
  ] };
  ok(_monarchGenderOf(t, 'Solo') === 'm', '⭐ solo: a decisão do organizador vence o perfil (que diz feminino)');
  ok(_monarchGenderOf(t, 'Membro') === 'm', '⭐ membro de dupla: idem, pela marca do próprio membro');
  ok(_monarchGenderOf(t, 'Outro') === 'f', 'sem marca, segue como antes');
  const tMisto = { participants: [{ uid: 'u1', displayName: 'X', gender: 'misto', genderSource: 'organizador' }] };
  ok(_monarchGenderOf(tMisto, 'X') === 'f', '⛔ `misto` marcado não coroa ninguém: cai no perfil');
}

/* ── O sanitizador com cache FRIO tira o par INTEIRO ───────────────────────── */
console.log('\n── cache frio: valor inválido não fica órfão ──');
{
  window._nameForUid = function () { return ''; };
  const e = limpar({ uid: 'u1', gender: 'misto', genderSource: 'organizador' });
  ok(e.gender === undefined && e.genderSource === undefined,
    '⛔ com o cache vazio, `misto` sai INTEIRO — limpar só a marca deixaria lixo passando por perfil');
  window._nameForUid = function () { return 'Fulano'; };
}

/* ── As portas não escrevem mais perfil ────────────────────────────────────── */
console.log('\n── as duas portas do sorteio não tocam em perfil de ninguém ──');
const ad = fs.readFileSync(path.join(RAIZ, 'functions-autodraw/index.js'), 'utf8');
const porta = (nome) => {
  const i = ad.indexOf('exports.' + nome + ' = onCall(');
  const j = ad.indexOf('\nexports.', i + 10);
  return ad.slice(i, j < 0 ? ad.length : j);
};
['applyEnrollmentAssignments', 'setDrawBalanceChoice'].forEach((nome) => {
  const bloco = porta(nome);
  ok(bloco.indexOf('genderSetBy') === -1, nome + ': não carimba gênero em perfil alheio');
  ok(!/collection\('users'\)\.doc\([^)]*\)[\s\S]{0,200}?tx\.update/.test(bloco),
    nome + ': não atualiza `users/{uid}`');
});

if (fail) { console.error('\n❌ genero-do-organizador: ' + pass + ' ok, ' + fail + ' falharam'); process.exit(1); }
console.log('\n✅ genero-do-organizador: ' + pass + ' ok');
