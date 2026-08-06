/* O NOME EXIBIDO SAI DO PERFIL (uid), NUNCA DO RÓTULO GRAVADO NO SORTEIO
 * node tests/nome-vem-do-perfil-nao-do-sorteio.test.js
 *
 * PRINT DO DONO (05/ago/2026): a MESMA pessoa aparecia como "Fabi2401@" na CLASSIFICAÇÃO DO
 * GRUPO e como "Dani Bataglia" nos cards dos jogos 52 e 53. Ela tinha trocado o displayName;
 * os cards resolvem por uid (novo), a classificação desenhava `s.name` — o rótulo gravado em
 * `monarchGroups[i].players[]` no dia do sorteio, que envelhece.
 *
 * Reação dele: _"por isso que deve ser sempre uid"_. Eram QUATRO renders com o uid à mão sem
 * usá-lo pro texto (classificação do grupo, geral e as duas tabelas de Rei/Rainha).
 *
 * ⚠️ O rótulo guardado CONTINUA sendo a chave de casamento com os jogos e o argumento do
 * _openPlayerProfile — trocar a chave quebraria a contagem. Aqui só o TEXTO muda.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, m, extra) { if (c) pass++; else { fail++; console.error('  ✗ ' + m + (extra ? '  → ' + extra : '')); } }

// ── o resolvedor, extraído do store.js real ─────────────────────────────────
const STORE = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
ok(/window\._liveRowName = function/.test(STORE), 'o resolvedor único existe no store.js');

global.window = {
  _userProfileCache: { uid_dani: { displayName: 'Dani Bataglia' } },
  _profileNameByUid: {},
  _ORPHAN_UID_LABEL: 'Conta removida',
};
window._nameForUid = function (uid) {
  const p = window._userProfileCache[uid];
  return (p && p.displayName) || window._profileNameByUid[uid] || '';
};
window._displayNameForUid = function (uid, stored) {
  if (uid) { const live = window._nameForUid(uid); if (live) return live; }
  return stored || (uid ? window._ORPHAN_UID_LABEL : '');
};
eval(STORE.slice(STORE.indexOf('window._liveRowName = function'),
  STORE.indexOf('};', STORE.indexOf('window._liveRowName = function')) + 2));

// ── O CASO DO PRINT ─────────────────────────────────────────────────────────
(() => {
  const linha = { uid: 'uid_dani', name: 'Fabi2401@' };   // rótulo velho do sorteio
  ok(window._liveRowName(linha) === 'Dani Bataglia',
    'nome trocado no perfil aparece ATUALIZADO na classificação', window._liveRowName(linha));
})();

(() => {
  ok(window._liveRowName({ uid: '', name: 'Ana / Bia' }) === 'Ana / Bia',
    'dupla (sem uid) mantém o rótulo — é a única identidade que ela tem');
  ok(window._liveRowName({ name: 'Convidado' }) === 'Convidado',
    'fictício sem uid mantém o nome digitado');
  ok(window._liveRowName({ uid: 'uid_orfao', name: 'Zé' }) === 'Zé',
    'uid sem perfil cai no rótulo guardado, não some da tela');
  ok(window._liveRowName(null) === '', 'entrada nula não quebra');
})();

// ── nenhum render de classificação pode voltar a desenhar o rótulo cru ──────
(() => {
  const BR = fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket.js'), 'utf8');
  ok(!/_teamNameBreakHtml\(s\.name,/.test(BR),
    'nenhuma tabela desenha `s.name` cru via _teamNameBreakHtml');
  ok(!/_nameWithCrown\(s\.name,/.test(BR),
    'nenhuma tabela desenha `s.name` cru via _nameWithCrown');
  ok((BR.match(/_liveRowName\(s\)/g) || []).length >= 4,
    'os 4 renders de classificação passaram a resolver pelo uid',
    String((BR.match(/_liveRowName\(s\)/g) || []).length));
  // O rótulo guardado SEGUE sendo a chave — se sumir daqui, a contagem quebra.
  ok(/_openPlayerProfile\(\\'\s*\+\s*_gstEsc\(s\.name\)|_openPlayerProfile\('\$\{_safeName\}'/.test(BR),
    'a ficha continua sendo aberta pela CHAVE guardada (não pelo texto exibido)');
})();


// ── A BUSCA também não pode casar com o nome ANTIGO ─────────────────────────
// Regra do dono: _"fica estranho colocarmos fabi e aparecer a dani bataglia… não deve
// aparecer a busca de um nome antigo"_. O filtro da chave varre `data-players`, que era
// montado com o rótulo GRAVADO — o card mostrava o nome novo e o atributo guardava o velho.
(() => {
  const BR = fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket.js'), 'utf8');
  ok(!/\(m\.team1 \|\| \[\]\)\.forEach\(add\)/.test(BR),
    'os times do Rei/Rainha NÃO entram na busca com o nome cru');
  ok(/_addLive\(m\.team1, m\.team1Uids\)/.test(BR) && /_addLive\(m\.team2, m\.team2Uids\)/.test(BR),
    '  → entram resolvidos pelo uid do slot');
  ok(!/data-players="' \+ window\._safeHtml\(_nmPill\)/.test(BR),
    'o chip de quem ficou de fora não indexa o nome guardado');
  ok(!/data-players="' \+ window\._safeHtml\(n\)/.test(BR),
    'o chip da lista de espera não indexa o nome guardado');
  // p1/p2 já resolviam ao vivo desde antes — não pode regredir.
  ok(/_resolveSideLive\(t, m\.p1/.test(BR), 'p1/p2 seguem resolvidos ao vivo na busca');
})();

console.log(fail === 0
  ? `✅ nome-vem-do-perfil-nao-do-sorteio: ${pass} ok, 0 falharam`
  : `❌ nome-vem-do-perfil-nao-do-sorteio: ${fail} falharam, ${pass} ok`);
process.exit(fail ? 1 : 0);
