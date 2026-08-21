/* O ÍCONE DO JOGADOR HIDRATA JUNTO COM O NOME
 * node tests/icone-do-jogador-hidrata-com-o-nome.test.js
 *
 * Pergunta do dono (21/ago/2026), olhando a chave: _"o que aconteceu com as
 * fotos/ícones dos jogadores que virou tudo a mesma merda?"_ — todos os círculos
 * iguais, da mesma cor e SEM inicial nenhuma.
 *
 * CAUSA, e ela é consequência de outra decisão certa: o ícone é gerado a partir
 * do NOME (vira a `seed` do gerador de iniciais). Desde a 1.7.79 — "a lista nasce
 * do UID, não do rótulo" — quem tem uid e perfil ainda não resolvido nasce com o
 * nome VAZIO de propósito, pra ser preenchido pela hidratação. Só que
 * `_hydrateUidNames` preenchia o TEXTO e nunca tocou no ícone.
 * Com `seed` vazia o gerador devolve um círculo sem inicial — e, sendo a MESMA
 * seed pra todo mundo, a MESMA cor. Não era um ícone genérico: era a ausência de
 * nome virando desenho.
 *
 * A REGRA QUE ISTO TRAVA: nome e ícone saem da MESMA fonte e no MESMO momento.
 * Se o nome ainda não resolveu, não se pede ícone nenhum — melhor sem ícone do
 * que com um ícone errado, que é o que dava o círculo mudo.
 */
const fs = require('fs');
const path = require('path');
const bracket = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'bracket.js'), 'utf8');
const store = fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

console.log('──── o ícone do jogador hidrata junto com o nome ────');

// ── lado do RENDER ─────────────────────────────────────────────────────────
ok(/const _semNomeAinda = !dispName && !!_slotUid;/.test(bracket),
   'o render sabe distinguir "sem nome AINDA" (tem uid) de "sem ninguém"');
ok(/const initialsUrl = _semNomeAinda\s*\?\s*''/.test(bracket),
   '⛔ com uid e nome não resolvido NÃO se pede ícone — seed vazia gera círculo mudo, igual pra todos');
ok(/data-uid-avatar="\$\{window\._safeHtml\(_slotUid\)\}"/.test(bracket),
   'o uid viaja no próprio <img>, pra hidratação achá-lo');
const nImg = (bracket.match(/\$\{_avatarUid\}/g) || []).length;
ok(nImg === 2, 'os DOIS <img> do card levam o marcador (o normal e o de substituição pendente) — achei ' + nImg);
ok(/const onerror = cachedPhoto && initialsUrl \?/.test(bracket),
   'e o onerror só existe quando há um fallback de verdade (senão apontaria pra src vazio)');

// ── lado da HIDRATAÇÃO ─────────────────────────────────────────────────────
const iH = store.indexOf('window._hydrateUidNames = function');
ok(iH > 0, 'a hidratação existe');
const hid = store.slice(iH, store.indexOf('data-players', iH));
ok(/var avEls = root\.querySelectorAll\('\[data-uid-avatar\]'\);/.test(hid),
   'a hidratação coleta os ícones pendentes');
ok(/if \(!els\.length && !roleEls\.length && !avEls\.length\) return Promise\.resolve\(\);/.test(hid),
   'e não desiste cedo quando SÓ há ícone pra resolver');
ok(/avEls\.forEach\(function \(e\) \{ var u = e\.getAttribute\('data-uid-avatar'\); if \(u\) uids\.push\(u\); \}\);/.test(hid),
   'os uids dos ícones entram no mesmo preload dos nomes — uma ida só');
ok(/if \(!nm\) return;/.test(hid),
   'sem nome resolvido, o ícone continua vazio — nunca um ícone errado');
ok(/window\._userProfileCache && window\._userProfileCache\[u\]/.test(hid),
   'a FOTO REAL sai do cache de perfis (senão quem tem foto cairia nas iniciais)');
ok(/e\.removeAttribute\('data-uid-avatar'\)/.test(hid),
   'resolvido, o marcador sai — a próxima passada não refaz trabalho');

console.log(`\n  ${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
