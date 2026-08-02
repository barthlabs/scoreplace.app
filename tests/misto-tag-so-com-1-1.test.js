/* Tag "Misto" no card do torneio: obrigatório sempre; senão SÓ com 1:1 exata
 * — node tests/misto-tag-so-com-1-1.test.js
 *
 * Relato do dono (02/ago/2026): o card do "Confra BT Alta da Clínica 2026" mostrava
 * "Misto 7" sem o torneio ser misto OBRIGATÓRIO.
 *
 * MEDIDO no Firestore de produção antes do fix (tour_1780009816637):
 *   • genderCategories = ['Misto'] e combinedCategories = ['Misto'] — nome PURO, sem
 *     'Obrig.' em lugar nenhum → o torneio NÃO é misto obrigatório;
 *   • as 8 inscrições com categoria 'Misto' são de MULHERES: Paula Vescovi, Roberta
 *     Lukaisus, Ana Paula Schmidt, Vanessa Bianchini, Rostanda, Glauce Assunção e
 *     Roberta Rocchi com gender='feminino' no perfil, e Monique Traldi SEM gênero.
 *     Zero homens. A tag "Misto" não descrevia nada.
 *   • as inscrições NÃO carregam gender (o strip da 1.6.77 tira perfil de entrada com
 *     uid) → o gênero tem que ser resolvido pelo uid, no perfil vivo.
 *
 * REGRA (dono): misto OBRIGATÓRIO → tag é configuração, aparece sempre. Não obrigatório
 * → tag é afirmação sobre os inscritos, só vale com proporção 1:1 EXATA.
 *
 * FALHA no código anterior: _buildCategoryCountHtml pintava a pílula de toda categoria de
 * combinedCategories, sem olhar gênero nenhum — o caso (1) abaixo devolvia "Misto 8".
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
const eq = (a, b, m) => ok(a === b, m + ' (esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a) + ')');

// Contexto mínimo: o arquivo é uma IIFE de definições (nada roda no load).
function ctx(profiles) {
  const s = {};
  s.window = s; s.globalThis = s; s.console = console;
  s.document = { getElementById: () => null };
  s._t = (k) => k;
  s._userProfileCache = {};
  Object.keys(profiles || {}).forEach(u => { s._userProfileCache[u] = { gender: profiles[u] }; });
  s._genderForUid = function (uid) { const p = uid && s._userProfileCache[uid]; return (p && p.gender) || ''; };
  s._canonGender = function (g) {
    const t = String(g || '').trim().toLowerCase();
    if (!t) return 'none';
    if (t.indexOf('fem') === 0 || t === 'f') return 'Fem';
    if (t.indexOf('masc') === 0 || t === 'm') return 'Masc';
    if (t.indexOf('mist') === 0) return 'Misto';
    return 'none';
  };
  s._participantUids = function (p) {
    if (!p || typeof p !== 'object') return [];
    const seen = {}, out = [];
    const add = u => { if (u && !seen[u]) { seen[u] = true; out.push(u); } };
    add(p.uid); add(p.p1Uid); add(p.p2Uid);
    if (Array.isArray(p.participants)) p.participants.forEach(x => x && add(x.uid));
    return out;
  };
  s.location = { hash: '#dashboard' };
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js/views/tournaments-categories.js'), 'utf8'), s,
    { filename: 'js/views/tournaments-categories.js' });
  return s;
}

const solo = (uid, cat) => ({ uid: uid, category: cat, categories: [cat] });
const dupla = (u1, u2, cat) => ({ p1Uid: u1, p2Uid: u2, p1Name: 'A', p2Name: 'B', category: cat, categories: [cat] });

console.log('──── misto-tag-so-com-1-1 ────');

// ═══ (1) O CASO REAL: Confra BT Alta da Clínica 2026 ══════════════════════════
(function () {
  const uids = ['lqHRqvHJ', 'QKNGiCqy', 'tN0To8Ji', 'yjNjUNXd', 'M7fdUxce', 'nWPV2jiA', 'FzTG3nei'];
  const profiles = {}; uids.forEach(u => { profiles[u] = 'feminino'; });
  profiles['s8fdVIzb'] = '';                       // Monique traldi — perfil SEM gênero
  const s = ctx(profiles);
  const t = {
    id: 'tour_1780009816637', name: 'Confra BT Alta da Clínica 2026',
    format: 'Liga', genderCategories: ['Misto'], skillCategories: [], combinedCategories: ['Misto'],
    participants: uids.concat(['s8fdVIzb']).map(u => solo(u, 'Misto'))
  };
  const html = s._buildCategoryCountHtml(t);
  ok(html.indexOf('Misto') === -1, '[real] a tag "Misto" NÃO aparece (8 inscritas, zero homens)');
  eq(html, '', '[real] sem nenhuma categoria visível, o bloco inteiro some (não sobra div vazia)');
  const tally = s._categoryGenderTally('Misto', t.participants);
  eq(tally.fem, 7, '[real] 7 mulheres com gênero declarado no perfil');
  eq(tally.masc, 0, '[real] nenhum homem');
  eq(tally.unknown, 1, '[real] 1 pessoa sem gênero declarado');
  ok(!s._isMistoObrigatorio('Misto', t), '[real] "Misto" puro não é obrigatório');
})();

// ═══ (2) Misto OBRIGATÓRIO: a tag é da CONFIGURAÇÃO — aparece sempre ══════════
(function () {
  const s = ctx({ a1: 'feminino', a2: 'feminino', a3: 'feminino' });
  const t = {
    id: 't2', genderCategories: ['misto_obrigatorio'], skillCategories: [], combinedCategories: ['Misto Obrig.'],
    participants: [solo('a1', 'Misto Obrig.'), solo('a2', 'Misto Obrig.'), solo('a3', 'Misto Obrig.')]
  };
  const html = s._buildCategoryCountHtml(t);
  ok(html.indexOf('Misto') !== -1, '[obrig] tag aparece mesmo com 3 mulheres e zero homens');
  ok(html.indexOf('>3<') !== -1, '[obrig] com a contagem certa (3)');
  ok(s._isMistoObrigatorio('Misto Obrig.', t), '[obrig] detectado pelo rótulo da categoria');
  ok(s._isMistoObrigatorio('Misto', { genderCategories: ['misto_obrigatorio'] }), '[obrig] detectado pela chave crua do torneio');
})();

// ═══ (3) Não obrigatório COM 1:1 exata → aparece ══════════════════════════════
(function () {
  const s = ctx({ f1: 'feminino', f2: 'feminino', m1: 'masculino', m2: 'masculino' });
  const t = {
    id: 't3', genderCategories: ['Misto'], skillCategories: [], combinedCategories: ['Misto'],
    participants: [solo('f1', 'Misto'), solo('f2', 'Misto'), solo('m1', 'Misto'), solo('m2', 'Misto')]
  };
  const html = s._buildCategoryCountHtml(t);
  ok(html.indexOf('Misto') !== -1, '[1:1] 2 mulheres + 2 homens → tag aparece');
  ok(html.indexOf('>4<') !== -1, '[1:1] contagem 4');
})();

// ═══ (4) Não obrigatório SEM 1:1 → some ═══════════════════════════════════════
(function () {
  const s = ctx({ f1: 'feminino', f2: 'feminino', f3: 'feminino', m1: 'masculino' });
  const t = {
    id: 't4', genderCategories: ['Misto'], skillCategories: [], combinedCategories: ['Misto'],
    participants: [solo('f1', 'Misto'), solo('f2', 'Misto'), solo('f3', 'Misto'), solo('m1', 'Misto')]
  };
  eq(s._buildCategoryCountHtml(t), '', '[3x1] 3 mulheres + 1 homem → tag some');
})();

// ═══ (5) Prova incompleta (alguém sem gênero) → some ══════════════════════════
(function () {
  const s = ctx({ f1: 'feminino', m1: 'masculino', x1: '' });
  const t = {
    id: 't5', genderCategories: ['Misto'], skillCategories: [], combinedCategories: ['Misto'],
    participants: [solo('f1', 'Misto'), solo('m1', 'Misto'), solo('x1', 'Misto')]
  };
  eq(s._buildCategoryCountHtml(t), '', '[incompleto] 1x1 + 1 sem gênero → não dá pra afirmar 1:1 → some');
})();

// ═══ (6) DUPLA conta os DOIS membros, um a um ═════════════════════════════════
(function () {
  const s = ctx({ f1: 'feminino', m1: 'masculino', f2: 'feminino', m2: 'masculino' });
  const t = {
    id: 't6', genderCategories: ['Misto'], skillCategories: [], combinedCategories: ['Misto'],
    participants: [dupla('f1', 'm1', 'Misto'), dupla('f2', 'm2', 'Misto')]
  };
  ok(s._buildCategoryCountHtml(t).indexOf('Misto') !== -1, '[dupla] 2 duplas fem+masc → 2x2 → tag aparece');
  const g = s._entryGenderList(dupla('f1', 'm1', 'Misto'));
  eq(g.length, 2, '[dupla] a dupla devolve 2 gêneros (uma pessoa não cobre a outra)');
  eq(g.join(','), 'Fem,Masc', '[dupla] gêneros resolvidos pelo uid de cada slot');

  const s2 = ctx({ f1: 'feminino', f2: 'feminino', f3: 'feminino', f4: 'feminino' });
  const t2 = {
    id: 't6b', genderCategories: ['Misto'], skillCategories: [], combinedCategories: ['Misto'],
    participants: [dupla('f1', 'f2', 'Misto'), dupla('f3', 'f4', 'Misto')]
  };
  eq(s2._buildCategoryCountHtml(t2), '', '[dupla] 2 duplas femininas → tag some');
})();

// ═══ (7) A regra é SÓ da tag mista — Fem/Masc/habilidade nunca são tocadas ════
(function () {
  const s = ctx({ f1: 'feminino', f2: 'feminino', f3: 'feminino', m1: 'masculino' });
  const t = {
    id: 't7', genderCategories: ['fem', 'masc', 'Misto'], skillCategories: ['C'],
    combinedCategories: ['Fem C', 'Masc C', 'Misto C'],
    participants: [solo('f1', 'Fem C'), solo('f2', 'Fem C'), solo('m1', 'Masc C'), solo('f3', 'Misto C')]
  };
  const html = s._buildCategoryCountHtml(t);
  ok(html.indexOf('Fem C') !== -1, '[misto-only] "Fem C" continua na tela');
  ok(html.indexOf('Masc C') !== -1, '[misto-only] "Masc C" continua na tela');
  ok(html.indexOf('Misto C') === -1, '[misto-only] "Misto C" (1 mulher, 0 homens) some');
  ok(s._categoryTagVisible(t, 'Fem C', t.participants), '[misto-only] tag Fem sempre visível');
  ok(s._categoryTagVisible(t, 'Masc C', t.participants), '[misto-only] tag Masc sempre visível');
  ok(!s._categoryTagVisible(t, 'Misto C', t.participants), '[misto-only] tag Misto reprovada');
})();

// ═══ (8) Categoria sem gênero nenhum (só habilidade) passa direto ═════════════
(function () {
  const s = ctx({ f1: 'feminino', f2: 'feminino' });
  const t = {
    id: 't8', genderCategories: [], skillCategories: ['C', 'D'], combinedCategories: ['C', 'D'],
    participants: [solo('f1', 'C'), solo('f2', 'D')]
  };
  const html = s._buildCategoryCountHtml(t);
  ok(html.indexOf('>C<') !== -1 && html.indexOf('>D<') !== -1, '[skill] categorias de habilidade não dependem de gênero');
})();

// ═══ (9) Perfis são PRÉ-REQUISITO: cache frio esconde E dispara a carga ═══════
(function () {
  const s = ctx({});                                  // nenhum perfil no cache
  let asked = null, reRendered = 0;
  s.FirestoreDB = { db: {} };
  s._preloadUserProfiles = function (uids) {
    asked = uids.slice();
    // Assíncrono como o real (Firestore .get()): no render que dispara a carga o cache
    // ainda está frio — é exatamente por isso que a tag some e volta no re-render.
    return Promise.resolve().then(function () {
      uids.forEach(u => { s._userProfileCache[u] = { gender: u[0] === 'f' ? 'feminino' : 'masculino' }; });
    });
  };
  s._dashRerender = function () { reRendered++; };
  const t = {
    id: 't9', genderCategories: ['Misto'], skillCategories: [], combinedCategories: ['Misto'],
    participants: [solo('f1', 'Misto'), solo('m1', 'Misto')]
  };
  eq(s._buildCategoryCountHtml(t), '', '[frio] sem perfil carregado, gênero é desconhecido → tag some');
  ok(!!asked && asked.indexOf('f1') !== -1 && asked.indexOf('m1') !== -1, '[frio] dispara a carga dos perfis da categoria mista');
  return new Promise(r => setTimeout(r, 0)).then(() => {
    eq(reRendered, 1, '[frio] re-renderiza a dashboard UMA vez quando os perfis chegam');
    ok(s._buildCategoryCountHtml(t).indexOf('Misto') !== -1, '[frio] com os perfis no cache, o 1:1 aparece');
    // Sem Firestore não pode disparar carga (viraria laço numa tela sensível a re-render).
    const s2 = ctx({});
    let called = 0;
    s2._preloadUserProfiles = function () { called++; return Promise.resolve(); };
    s2._buildCategoryCountHtml({ id: 't9b', genderCategories: ['Misto'], skillCategories: [], combinedCategories: ['Misto'], participants: [solo('f1', 'Misto')] });
    eq(called, 0, '[frio] sem FirestoreDB.db não dispara carga nenhuma');
  });
})().then(function () {
  console.log(pass + ' ok, ' + fail + ' falhas');
  process.exit(fail ? 1 : 0);
});
