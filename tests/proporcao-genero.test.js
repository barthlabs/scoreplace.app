/* PROPORÇÃO DE GÊNERO do sorteio equilibrado (v1.7.16). node tests/proporcao-genero.test.js
 *
 * Regra do dono (ago/2026, depois do "R1 Grupo B2" do Confra fechar com 3 homens):
 *   - LIVRE       → sem proporção e sem toggle.
 *   - EQUILIBRADO → proporção (50/50 · 25/75 · 75/25 sobre as 4 pessoas) + toggle "Travar":
 *       TRAVADO    → só fecha grupo na proporção EXATA, nunca flexibiliza;
 *       DESTRAVADO → persegue a proporção enquanto dá e depois flexibiliza pra incluir
 *                    o máximo de gente.
 *   - SEM GÊNERO DECLARADO nunca entra em grupo — nem na flexibilização.
 *
 * Os dois casos REAIS citados pelo dono viram cenário: o Confra é 25/75 e o "Duplas
 * Sorteadas" (encerrado) foi 50/50.
 */
const H = require('./render-harness');
const win = H.window;

let ok = 0, fail = 0;
function t(label, cond, extra) {
  if (cond) { ok++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (extra ? '  → ' + extra : '')); }
}

// pool a partir de contagens: h homens, f mulheres, x sem gênero (ordem estável)
function pool(h, f, x) {
  const out = [];
  for (let i = 1; i <= (h || 0); i++) out.push({ key: 'H' + i, gender: 'masculino' });
  for (let i = 1; i <= (f || 0); i++) out.push({ key: 'M' + i, gender: 'feminino' });
  for (let i = 1; i <= (x || 0); i++) out.push({ key: 'X' + i, gender: '' });
  return out;
}
const plan = (p, ratio, locked) => win._planGroupsByRatio(p, { ratio: ratio, locked: locked, size: 4 });
const conta = (grp, pref) => grp.filter(k => k[0] === pref).length;

console.log('\n──── as 3 proporções sobre 4 pessoas ────');
{
  t('50/50 = 2 homens / 2 mulheres', win._GENDER_RATIOS['50/50'].m === 2 && win._GENDER_RATIOS['50/50'].f === 2);
  t('25/75 = 1 homem / 3 mulheres', win._GENDER_RATIOS['25/75'].m === 1 && win._GENDER_RATIOS['25/75'].f === 3);
  t('75/25 = 3 homens / 1 mulher', win._GENDER_RATIOS['75/25'].m === 3 && win._GENDER_RATIOS['75/25'].f === 1);
  t('rótulo humano', win._ratioLabel('25/75') === '25/75 (1 homem / 3 mulheres)', win._ratioLabel('25/75'));
  t('proporção inválida é recusada', !win._isValidRatio('30/70') && win._isValidRatio('50/50'));
}

console.log('\n──── CONFRA (25/75) — a fila real de hoje: 4 homens + 1 mulher ────');
{
  // Paulo, Renato, Gersom, Vini (homens) + Ana Lúcia (mulher).
  const r = plan(pool(4, 1, 0), '25/75', true);
  t('travado: nenhum grupo fecha', r.groups.length === 0, 'grupos=' + r.groups.length);
  t('os 5 continuam na fila', r.leftover.length === 5, 'leftover=' + r.leftover.length);
  const rd = plan(pool(4, 1, 0), '25/75', false);
  t('destravado: 1 grupo flexibilizado (inclui o máximo)', rd.groups.length === 1 && rd.flexed === 1,
    'grupos=' + rd.groups.length + ' flexed=' + rd.flexed);
  t('e sobra 1 pessoa', rd.leftover.length === 1, 'leftover=' + rd.leftover.length);
}

console.log('\n──── 25/75 EXATA: 4 mulheres não fecham travado, fecham destravado ────');
{
  const r = plan(pool(0, 4, 0), '25/75', true);
  t('travado: 0 homens NÃO atende 25/75 exata', r.groups.length === 0, 'grupos=' + r.groups.length);
  const rd = plan(pool(0, 4, 0), '25/75', false);
  t('destravado: fecha 1 grupo (flexibilizado)', rd.groups.length === 1 && rd.flexed === 1);
}

console.log('\n──── 25/75 travado: forma o máximo de grupos exatos ────');
{
  const r = plan(pool(3, 9, 0), '25/75', true);
  t('3 homens + 9 mulheres = 3 grupos', r.groups.length === 3, 'grupos=' + r.groups.length);
  t('cada grupo com exatamente 1 homem e 3 mulheres',
    r.groups.every(g => conta(g, 'H') === 1 && conta(g, 'M') === 3),
    JSON.stringify(r.groups));
  t('ninguém sobra', r.leftover.length === 0);
}
{
  // o gênero escasso limita: 1 homem só dá 1 grupo, mesmo com 9 mulheres
  const r = plan(pool(1, 9, 0), '25/75', true);
  t('1 homem + 9 mulheres = só 1 grupo travado', r.groups.length === 1, 'grupos=' + r.groups.length);
  t('as 6 mulheres restantes esperam', r.leftover.length === 6, 'leftover=' + r.leftover.length);
  const rd = plan(pool(1, 9, 0), '25/75', false);
  t('destravado: 1 exato + 1 flexibilizado = 2 grupos', rd.groups.length === 2 && rd.flexed === 1,
    'grupos=' + rd.groups.length + ' flexed=' + rd.flexed);
  t('e o 1º grupo continua sendo o EXATO (a proporção é perseguida primeiro)',
    conta(rd.groups[0], 'H') === 1 && conta(rd.groups[0], 'M') === 3, JSON.stringify(rd.groups[0]));
}

console.log('\n──── DUPLAS SORTEADAS (50/50) ────');
{
  const r = plan(pool(4, 4, 0), '50/50', true);
  t('4 homens + 4 mulheres = 2 grupos', r.groups.length === 2, 'grupos=' + r.groups.length);
  t('cada grupo 2 e 2', r.groups.every(g => conta(g, 'H') === 2 && conta(g, 'M') === 2), JSON.stringify(r.groups));
  const r2 = plan(pool(6, 2, 0), '50/50', true);
  t('6 homens + 2 mulheres = só 1 grupo travado', r2.groups.length === 1, 'grupos=' + r2.groups.length);
  t('os 4 homens excedentes esperam', r2.leftover.length === 4, 'leftover=' + r2.leftover.length);
  const r3 = plan(pool(6, 2, 0), '50/50', false);
  t('destravado: 1 exato + 1 só de homens = 2 grupos', r3.groups.length === 2 && r3.flexed === 1);
  t('o grupo flexibilizado é o excedente (4 homens)',
    conta(r3.groups[1], 'H') === 4, JSON.stringify(r3.groups[1]));
}

console.log('\n──── 75/25 (torneio majoritariamente masculino) ────');
{
  const r = plan(pool(6, 2, 0), '75/25', true);
  t('6 homens + 2 mulheres = 2 grupos', r.groups.length === 2, 'grupos=' + r.groups.length);
  t('cada grupo 3 homens e 1 mulher', r.groups.every(g => conta(g, 'H') === 3 && conta(g, 'M') === 1));
}

console.log('\n──── SEM GÊNERO nunca entra em grupo (nos DOIS modos) ────');
{
  const r = plan(pool(1, 3, 4), '25/75', true);
  t('travado: forma o grupo exato e ignora os 4 sem gênero', r.groups.length === 1);
  t('os sem gênero ficam no leftover', r.leftover.length === 4 && r.leftover.every(k => k[0] === 'X'),
    JSON.stringify(r.leftover));
  const rd = plan(pool(1, 3, 4), '25/75', false);
  t('destravado (grupo novo da espera): os 4 sem gênero NÃO viram um grupo',
    rd.groups.length === 1 && rd.flexed === 0, 'grupos=' + rd.groups.length + ' flexed=' + rd.flexed);
  t('e continuam esperando', rd.leftover.length === 4 && rd.leftover.every(k => k[0] === 'X'));
  const rs = plan(pool(0, 0, 8), '25/75', false);
  t('só sem-gênero na espera: nenhum grupo, nem destravado',
    rs.groups.length === 0 && rs.leftover.length === 8);
}

// ── SORTEIO INICIAL flexibilizado: sem gênero ENTRA, por último (regra do dono) ────────
// "se no sorteio inicial for flexibilizada a proporção os sem genero entram depois de todos
// mas entram, participam do sorteio sim. um entrante de ultima hora, nos ultimos segundos
// antes do sorteio entra sim. só nao assume como genero masc ou fem" — e vale SÓ aqui: no
// grupo novo formado da espera a decisão dele foi "nunca, nem flexibilizando" (bloco acima).
console.log('\n──── SORTEIO INICIAL destravado: sem gênero entra POR ÚLTIMO, mas entra ────');
{
  const ini = (p, ratio) => win._planGroupsByRatio(p, { ratio: ratio, locked: false, size: 4, flexIncludesUnknown: true });
  const r = ini(pool(0, 0, 8), '25/75');
  t('8 sem gênero formam 2 grupos no sorteio inicial', r.groups.length === 2, 'grupos=' + r.groups.length);
  const r2 = ini(pool(1, 3, 4), '25/75');
  t('1H+3M+4 sem gênero = 2 grupos', r2.groups.length === 2, 'grupos=' + r2.groups.length);
  t('o 1º grupo é o EXATO (proporção primeiro)',
    conta(r2.groups[0], 'H') === 1 && conta(r2.groups[0], 'M') === 3, JSON.stringify(r2.groups[0]));
  t('os sem gênero ficam no 2º grupo (entram DEPOIS de todos)',
    r2.groups[1].every(k => k[0] === 'X'), JSON.stringify(r2.groups[1]));
  const r3 = ini(pool(2, 2, 1), '25/75');
  t('sem gênero entra atrás da sobra de gênero conhecido',
    r3.groups.length === 1 && r3.groups[0].indexOf('X1') === -1, JSON.stringify(r3.groups));
  // TRAVADO no sorteio inicial continua sem incluir quem não tem gênero
  const r4 = win._planGroupsByRatio(pool(0, 0, 8), { ratio: '25/75', locked: true, size: 4, flexIncludesUnknown: true });
  t('travado não inclui sem-gênero nem no sorteio inicial', r4.groups.length === 0);
}

console.log('\n──── a ordem recebida é respeitada (o sorteio continua sendo do sorteio) ────');
{
  const p = [
    { key: 'M1', gender: 'feminino' }, { key: 'H1', gender: 'masculino' },
    { key: 'M2', gender: 'feminino' }, { key: 'M3', gender: 'feminino' },
    { key: 'M4', gender: 'feminino' }, { key: 'H2', gender: 'masculino' },
    { key: 'M5', gender: 'feminino' }, { key: 'M6', gender: 'feminino' }
  ];
  const r = plan(p, '25/75', true);
  t('2 grupos', r.groups.length === 2);
  t('o 1º homem da lista vai pro 1º grupo', r.groups[0].indexOf('H1') !== -1, JSON.stringify(r.groups));
  t('as mulheres entram na ordem em que chegaram',
    r.groups[0].filter(k => k[0] === 'M').join(',') === 'M1,M2,M3', JSON.stringify(r.groups[0]));
}

console.log('\n──── sem proporção configurada: forma na ordem, mas sem-gênero segue fora ────');
{
  const r = plan(pool(2, 2, 3), '', true);
  t('forma 1 grupo com os 4 de gênero conhecido', r.groups.length === 1);
  t('os 3 sem gênero ficam de fora', r.leftover.length === 3 && r.leftover.every(k => k[0] === 'X'));
}

console.log('\n──── leitura da configuração: fase manda, topo é fallback, livre zera ────');
{
  const base = { phases: [{ genderRatio: '50/50' }, {}], currentPhaseIndex: 0, genderRatio: '25/75',
                 _drawBalanceMode: 'equilibrado' };
  t('fase 0 usa a proporção da FASE', win._ratioForPhase(base, 0) === '50/50', win._ratioForPhase(base, 0));
  t('fase 1 (sem própria) cai no topo', win._ratioForPhase(base, 1) === '25/75', win._ratioForPhase(base, 1));
  t('sorteio LIVRE não tem proporção',
    win._ratioForPhase({ _drawBalanceMode: 'livre', genderRatio: '25/75' }, 0) === '');
  // ⭐ 2.1 — O DEFAULT VIROU 50/50. Ordem do dono (22/ago): _"o default 50-50 para o app. na
  // confra é setado para 25-75, nenhuma divergência."_ O 25/75 era herança de quando a única
  // regra existente era "no máximo 1 homem em 4" na lista de espera; a Confra segue com ele
  // GRAVADO, então nada muda lá — muda o torneio que nunca escolheu.
  // Consequência aceita explicitamente pelo dono ("50/50 travado mesmo"): pool de 1 homem +
  // 3 mulheres deixa de fechar grupo, porque 50/50 exige 2+2.
  t('equilibrado sem proporção escolhida cai no default 50/50',
    win._ratioForPhase({ _drawBalanceMode: 'equilibrado' }, 0) === '50/50');
  t('proporção inválida gravada cai no default',
    win._ratioForPhase({ _drawBalanceMode: 'equilibrado', genderRatio: '10/90' }, 0) === '50/50');
  t('e a proporção GRAVADA sempre vence o default (a Confra é 25/75)',
    win._ratioForPhase({ _drawBalanceMode: 'equilibrado', genderRatio: '25/75' }, 0) === '25/75');
  t('livre continua sem proporção nenhuma',
    win._ratioForPhase({ _drawBalanceMode: 'livre' }, 0) === '');
}

console.log('\n──── o toggle: TRAVADO é o default; destravar é escolha explícita ────');
{
  t('campo ausente = travado', win._ratioIsLocked({}) === true);
  t("wlGroupBalance:'equilibrado' = travado", win._ratioIsLocked({ wlGroupBalance: 'equilibrado' }) === true);
  t("wlGroupBalance:'livre' = destravado", win._ratioIsLocked({ wlGroupBalance: 'livre' }) === false);
  // 'sorteio livre' e 'proporção destravada' são EIXOS DIFERENTES — não podem se confundir
  t('sorteio livre não implica proporção destravada',
    win._ratioIsLocked({ _drawBalanceMode: 'livre' }) === true);
}

console.log('\n──── VAGA (placeholder) é coringa: completa sem presumir gênero ────');
{
  // 4 vagas puras — o recurso de completar grupo com vagas continua funcionando.
  const vagas = [1,2,3,4].map(i => ({ key: 'V' + i, gender: '', wildcard: true }));
  const r = win._planGroupsByRatio(vagas, { ratio: '25/75', locked: true, size: 4 });
  t('4 vagas formam 1 grupo', r.groups.length === 1, 'grupos=' + r.groups.length);
}
{
  // 1 homem + 2 mulheres + 1 vaga em 25/75 → a vaga entra como a 3ª mulher
  const p = [{ key: 'H1', gender: 'masculino' }, { key: 'M1', gender: 'feminino' },
             { key: 'M2', gender: 'feminino' }, { key: 'V1', gender: '', wildcard: true }];
  const r = win._planGroupsByRatio(p, { ratio: '25/75', locked: true, size: 4 });
  t('a vaga completa o grupo exato', r.groups.length === 1 && r.leftover.length === 0,
    'grupos=' + r.groups.length + ' leftover=' + JSON.stringify(r.leftover));
}
{
  // vaga NÃO salva quem está sem gênero: pessoa real sem o campo segue fora
  const p = [{ key: 'H1', gender: 'masculino' }, { key: 'M1', gender: 'feminino' },
             { key: 'X1', gender: '' }, { key: 'V1', gender: '', wildcard: true }];
  const r = win._planGroupsByRatio(p, { ratio: '25/75', locked: true, size: 4 });
  t('não forma: o sem-gênero real não conta', r.groups.length === 0, 'grupos=' + r.groups.length);
  t('e ele continua no leftover', r.leftover.indexOf('X1') !== -1);
}

// ── ONDE A PROPORÇÃO EXISTE ──────────────────────────────────────────────────────────
// Regra do dono (ago/2026): "essas proporções são sugeridas apenas em torneios em que seja
// tudo misturado, sem categoria por gênero. Se tiver categoria fem e masc ou mesmo misto
// (50/50) separadas, não temos essas proporções e flexibilizações."
// Sem isto a proporção EXATA recusaria TODOS os grupos de uma categoria Feminina (4
// mulheres, 0 homens) — a regra antiga era um TETO e tolerava; a proporção não tolera.
console.log('\n──── proporção só em torneio TODO MISTURADO ────');
{
  const misturado = { genderCategories: [], _drawBalanceMode: 'equilibrado' };
  t('sem categoria de gênero → aplica', win._ratioAppliesTo(misturado) === true);
  t('e a proporção sai no default novo', win._ratioForPhase(misturado) === '50/50');

  const fem = { genderCategories: ['Feminino', 'Masculino'], _drawBalanceMode: 'equilibrado' };
  t('Fem/Masc separados → NÃO aplica', win._ratioAppliesTo(fem) === false);
  t('e a proporção some (não é o default)', win._ratioForPhase(fem) === '');
  t('nem a escolhida sobrevive', win._ratioConfigured({ ...fem, genderRatio: '50/50' }) === '');

  const misto = { genderCategories: ['misto_obrigatorio'], _drawBalanceMode: 'equilibrado' };
  t('Misto separado também NÃO aplica (já é 50/50 por duplas)', win._ratioAppliesTo(misto) === false);
  t('e some da leitura', win._ratioForPhase(misto) === '');

  // habilidade/idade NÃO separam gênero — segue misturado, segue com proporção
  const skill = { genderCategories: [], combinedCategories: ['A', 'B', 'C'], _drawBalanceMode: 'equilibrado' };
  t('categoria de HABILIDADE não desliga a proporção', win._ratioAppliesTo(skill) === true);
  t('e a proporção continua valendo', win._ratioForPhase(skill) === '50/50');

  // a categoria SENDO SORTEADA também desliga, mesmo sem config no topo
  t('categoria "Fem B" sendo sorteada desliga', win._ratioAppliesTo(misturado, 'Fem B') === false);
  t('categoria "Masc A" idem', win._ratioAppliesTo(misturado, 'Masc A') === false);
  t('categoria "Misto C" idem', win._ratioAppliesTo(misturado, 'Misto C') === false);
  t('categoria só de habilidade NÃO desliga', win._ratioAppliesTo(misturado, 'C') === true);
  t('e sem categoria nenhuma segue ligada', win._ratioAppliesTo(misturado, null) === true);
}

console.log('\n──── o CONFRA continua com proporção (é todo misturado) ────');
{
  // ⭐ 2.1: a Confra tem 25/75 GRAVADO — foi o dono que setou. É de onde vem o "no máximo 1
  // homem em 4" de agosto: não é regra à parte, é a 25/75 travada sendo aplicada (palavras
  // dele, 22/ago: _"essa ordem é a proporção 25/75 com travado ligado, é só aplicação da
  // regra"_). Por isso o fixture agora GRAVA a proporção, em vez de depender do default —
  // que mudou pra 50/50 e não representa mais a Confra.
  const confra = { genderCategories: [], combinedCategories: [], _drawBalanceMode: 'equilibrado', genderRatio: '25/75' };
  t('aplica', win._ratioAppliesTo(confra) === true);
  t('25/75 travada', win._ratioForPhase(confra) === '25/75' && win._ratioIsLocked(confra) === true);
}

console.log('\n──── a UI some quando não se aplica ────');
{
  const fs6 = require('fs'), path6 = require('path');
  const R6 = (f) => fs6.readFileSync(path6.join(__dirname, '..', 'js', 'views', f), 'utf8');
  const draw6 = R6('tournaments-draw.js'), form6 = R6('create-tournament.js'), brk6 = R6('bracket.js');
  t('diálogo do sorteio esconde a caixa', /ratioApplies/.test(draw6) &&
     /mode === 'equilibrado' && window\._gdCtx\.ratioApplies/.test(draw6));
  t('e não grava proporção quando não se aplica', /_ratioAppliesTo\(t\)\)\) \{/.test(draw6));
  // ⭐ 2.1: quem decide o sumiço é o NÚCLEO (_ratioVisivel), não uma regra escrita na tela —
  // a lista de espera precisa da mesma resposta. E some AVISANDO por quê (_ratioMotivoAusencia):
  // controle que some calado manda a pessoa procurar, e foi assim que este caso apareceu.
  t('formulário esconde a caixa com categoria de gênero',
     /tourn-gender-categories/.test(form6) && /_ratioVisivel\(/.test(form6)
     && /visivel: false/.test(form6) && /_ratioMotivoAusencia/.test(form6));
  t('caixa da espera esconde o toggle sem proporção', /\(!_wlOrg \|\| !_wlRatio\) \? ''/.test(brk6));
}

// ── A PORTA: grupo torto NÃO NASCE ───────────────────────────────────────────────────
// Regra do dono (ago/2026): "só não quero que coloque 4 num grupo para depois perceber que
// quebrou a regra." O planejador já devolve grupos válidos; esta conferência existe pra que
// nenhum OUTRO caminho — nem uma falha de resolução de gênero como a que produziu o
// "R1 Grupo B2" — consiga criar grupo fora da proporção. Na dúvida, não cria.
console.log('\n──── verificação na PORTA (_groupMeetsRatio) ────');
{
  const G = (a, r) => win._groupMeetsRatio(a, r);
  t('25/75 aceita exatamente 1 homem + 3 mulheres',
    G(['masculino', 'feminino', 'feminino', 'feminino'], '25/75') === true);
  t('25/75 RECUSA 3 homens (o grupo B2)',
    G(['masculino', 'masculino', 'masculino', 'feminino'], '25/75') === false);
  t('25/75 RECUSA 2 homens', G(['masculino', 'masculino', 'feminino', 'feminino'], '25/75') === false);
  t('25/75 RECUSA 4 mulheres (exata é exata)',
    G(['feminino', 'feminino', 'feminino', 'feminino'], '25/75') === false);
  t('50/50 aceita 2 e 2', G(['masculino', 'masculino', 'feminino', 'feminino'], '50/50') === true);
  t('75/25 aceita 3 homens + 1 mulher',
    G(['masculino', 'masculino', 'masculino', 'feminino'], '75/25') === true);
  t('QUALQUER desconhecido reprova o grupo travado',
    G(['masculino', 'feminino', 'feminino', ''], '25/75') === false);
  t('sem proporção não há o que violar', G(['', '', '', ''], '') === true);
  // a VAGA tapa buraco de qualquer lado (não é pessoa)
  t('vaga completa o lugar da 3ª mulher',
    G([{ gender: 'masculino' }, { gender: 'feminino' }, { gender: 'feminino' },
       { gender: '', wildcard: true }], '25/75') === true);
  t('mas vaga NÃO salva grupo que já estourou a cota de homens',
    G([{ gender: 'masculino' }, { gender: 'masculino' }, { gender: 'feminino' },
       { gender: '', wildcard: true }], '25/75') === false);
  t('e 4 vagas atendem qualquer proporção',
    G([1, 2, 3, 4].map(() => ({ gender: '', wildcard: true })), '25/75') === true);
}

console.log('\n──── todo grupo que o planejador emite PASSA na porta ────');
{
  // varredura: nenhuma combinação travada pode produzir grupo que a porta reprovaria —
  // se um dia divergirem, é aqui que aparece.
  let checados = 0, ruins = 0;
  ['50/50', '25/75', '75/25'].forEach(r => {
    for (let h = 0; h <= 9; h++) for (let f = 0; f <= 9; f++) {
      const res = win._planGroupsByRatio(pool(h, f, 2), { ratio: r, locked: true, size: 4 });
      res.groups.forEach(g => {
        checados++;
        const gen = g.map(k => k[0] === 'H' ? 'masculino' : (k[0] === 'M' ? 'feminino' : ''));
        if (!win._groupMeetsRatio(gen, r)) ruins++;
      });
    }
  });
  t('os ' + checados + ' grupos planejados passam na porta', ruins === 0, ruins + ' reprovado(s)');
}

console.log('\n──── a porta está ligada nos DOIS pontos de criação ────');
{
  const fs5 = require('fs'), path5 = require('path');
  const bl = fs5.readFileSync(path5.join(__dirname, '..', 'js', 'views', 'bracket-logic.js'), 'utf8');
  const ocorr = (bl.match(/_groupMeetsRatio/g) || []).length;
  t('_groupMeetsRatio é consultado 2x (espera + sorteio inicial)', ocorr >= 2, 'ocorrências=' + ocorr);
  t('e o grupo recusado NÃO é criado (return antes do _buildMonarchGroup)',
    /!window\._groupMeetsRatio[\s\S]{0,320}?return;[\s\S]{0,120}?_buildMonarchGroup/.test(bl));
}

// ── PARIDADE CLIENTE × SERVIDOR ──────────────────────────────────────────────────────
// O motor roda nos DOIS lados (o servidor forma grupo da espera na integração tardia), e o
// vendor é uma CÓPIA sincronizada no predeploy. Cópia que envelhece é o bug de versão que a
// canonização quer matar — e já aconteceu neste projeto. Aqui o vendor é carregado num
// contexto próprio e tem que devolver EXATAMENTE a mesma divisão que o cliente.
console.log('\n──── o vendor do servidor decide igual ao cliente ────');
{
  const fs3 = require('fs'), path3 = require('path'), vm3 = require('vm');
  const vpath = path3.join(__dirname, '..', 'functions-autodraw', 'vendor', 'gender-ratio-core.js');
  t('o núcleo está vendorado pro servidor', fs3.existsSync(vpath));
  if (fs3.existsSync(vpath)) {
    const sb = { window: {} }; sb.globalThis = sb;
    vm3.runInContext(fs3.readFileSync(vpath, 'utf8'), vm3.createContext(sb));
    const casos = [
      [pool(4, 1, 0), '25/75', true], [pool(4, 1, 0), '25/75', false],
      [pool(1, 9, 0), '25/75', true], [pool(6, 2, 0), '50/50', false],
      [pool(6, 2, 0), '75/25', true], [pool(1, 3, 4), '25/75', false],
      [pool(0, 0, 8), '25/75', false]
    ];
    let iguais = 0;
    casos.forEach(([p, r, l]) => {
      const a = win._planGroupsByRatio(p, { ratio: r, locked: l, size: 4 });
      const b = sb.window._planGroupsByRatio(p, { ratio: r, locked: l, size: 4 });
      if (JSON.stringify(a) === JSON.stringify(b)) iguais++;
      else console.log('      divergiu em', r, 'locked=' + l, JSON.stringify(a), '!=', JSON.stringify(b));
    });
    t('os ' + casos.length + ' cenários batem nos dois lados', iguais === casos.length, iguais + '/' + casos.length);
    // e a flexibilização do sorteio inicial também
    const a2 = win._planGroupsByRatio(pool(0, 0, 8), { ratio: '25/75', locked: false, size: 4, flexIncludesUnknown: true });
    const b2 = sb.window._planGroupsByRatio(pool(0, 0, 8), { ratio: '25/75', locked: false, size: 4, flexIncludesUnknown: true });
    t('flexIncludesUnknown também bate', JSON.stringify(a2) === JSON.stringify(b2));
    t('e o vendor expõe as mesmas 3 proporções',
      JSON.stringify(Object.keys(sb.window._GENDER_RATIOS)) === JSON.stringify(Object.keys(win._GENDER_RATIOS)));
  }
}

// ── A FIAÇÃO DA UI (varredura de código) ─────────────────────────────────────────────
// A proporção tem que aparecer nos DOIS lugares pedidos pelo dono: na tela do sorteio
// equilibrado/livre e no criar/editar DENTRO da fase. E o toggle é o MESMO nos dois.
console.log('\n──── a proporção está nas duas telas, com o mesmo toggle ────');
{
  const fs4 = require('fs'), path4 = require('path');
  const R = (f) => fs4.readFileSync(path4.join(__dirname, '..', 'js', 'views', f), 'utf8');
  const draw = R('tournaments-draw.js'), form = R('create-tournament.js'),
        f2 = R('format2-ui.js'), brk = R('bracket.js'), bui = R('bracket-ui.js');

  t('tela do sorteio tem a caixa da proporção', /id="gd-ratio-box"/.test(draw));
  // ⭐ 2.1: as pílulas próprias SAÍRAM das duas telas. O desenho (slider + trava + textos) é
  // um só, no núcleo, e as duas telas o chamam — ordem do dono (22/ago): "mudou aqui muda lá
  // na lista de espera o texto e a proporção. mesma coisa o toggle que trava a proporção."
  t('e o controle vem do NÚCLEO, não desenhado aqui', /_ratioSliderHtml\(/.test(draw));
  t('e a trava também (mesmo texto das duas telas)', /onLock: 'window\._gdSetLock'/.test(draw));
  t('⛔ a tela do sorteio não desenha pílula própria', !/id="gd-ratio-' \+ r\.replace/.test(draw));
  // v1.7.19: a condição ganhou o gate de categoria — a caixa aparece no EQUILIBRADO **e**
  // quando a proporção se aplica (torneio todo misturado). O invariante "no LIVRE não
  // aparece" segue travado.
  t('a caixa só aparece no EQUILIBRADO', /mode === 'equilibrado' && window\._gdCtx\.ratioApplies\) \? 'block' : 'none'/.test(draw));
  t('e a tela do sorteio continua sendo a MESMA (livre/equilibrado intactos)',
     /id="gd-mode-livre"/.test(draw) && /id="gd-mode-equilibrado"/.test(draw) &&
     /Sorteio puro, sem olhar gênero/.test(draw));
  t('a escolha da tela é persistida na FASE', /t\.phases\[_pi\]\.genderRatio = opts\.ratio/.test(draw));
  t('e no LIVRE não grava proporção', /mode === 'equilibrado' && opts\.ratio/.test(draw));

  t('criar/editar tem a caixa da proporção', /id="gender-ratio-box"/.test(form));
  // ⭐ 2.1: "Sem regra" MORREU. O dono fechou que o default do app é 50/50 e que o slider tem
  // 3 paradas — o vazio existia e o equilíbrio acontecia mesmo assim, por outro motor, que é
  // o que ele flagrou ("estava em sem regra e funcionava, o que indica outra razão").
  t('a configuração monta o MESMO controle do núcleo', /_ratioSliderHtml\(/.test(form)
     && /id="gender-ratio-mount"/.test(form));
  t('⛔ sem "Sem regra": não há mais opção de vazio', !/data-ratio=""/.test(form));
  t('e o mesmo toggle Travar proporção (campo que o save lê)', /id="gender-ratio-lock"/.test(form));
  t('vazio de torneio antigo é RESOLVIDO pro default, não deixado em branco',
     /cur = window\._GENDER_RATIO_DEFAULT/.test(form));
  // A asserção cobra a PERTINÊNCIA à lista, não a lista inteira em ordem: em 1.9.111 o
  // bloco "🎾 Formato da Partida" (#gsm-section) entrou na mesma realocação (formato por
  // fase) e derrubava este teste sem que nada da proporção tivesse mudado. O que importa
  // aqui é que a caixa de gênero seja realocada junto com as Datas da fase.
  t('a caixa é REALOCADA pra dentro da fase (padrão das Datas da fase)',
     /_EXT_IDS = \[[^\]]*'gender-ratio-box'[^\]]*\]/.test(f2)
     && /_EXT_IDS = \[[^\]]*'phase-dates-box'[^\]]*\]/.test(f2));
  t('o salvar grava a proporção', /tourData\.genderRatio =/.test(form));
  t('e "Sem regra" APAGA a regra (grava null, não omite)', /: null;/.test(form.split('tourData.genderRatio =')[1].split('\n')[0] + ';'));
  t('editar repopula com o que está gravado', /_ratioConfigured\(t, 0\)/.test(form));

  t('a caixa da lista de espera mostra a proporção vigente', /_wlRatioTxt/.test(brk));
  t('e o rótulo do toggle virou "Travar proporção"', /Travar proporção/.test(brk));
  t('o valor gravado continua equilibrado/livre (compat com torneios vivos)',
     /wlGroupBalance = _eraEquil \? 'livre' : 'equilibrado'/.test(bui));
  t('e o aviso do toggle diz QUAL é a proporção', /_ratioLabel/.test(bui));
}


// ═══════════════════════════════════════════════════════════════════════════
// ⭐ 2.1 — O CONTROLE RODANDO DE VERDADE (não só o arquivo lido)
// O dono flagrou a proporção "funcionando por outra razão". Ler o fonte não pega isso;
// rodar, pega. Aqui o controle é montado num DOM falso e a gente confere o que ele DEIXA
// GRAVADO — a prova mora no dado. [[feedback_proof_lives_in_the_data_not_in_a_stamp]]
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  const fsX = require('fs'), pathX = require('path'), vmX = require('vm');
  const raiz = pathX.join(__dirname, '..');
  const nucleo = fsX.readFileSync(pathX.join(raiz, 'js/views/gender-ratio-core.js'), 'utf8');
  const ctX = fsX.readFileSync(pathX.join(raiz, 'js/views/create-tournament.js'), 'utf8');
  function corpo(nome) {
    const i = ctX.indexOf('window.' + nome + ' = function');
    if (i < 0) return '';
    return ctX.slice(i, ctX.indexOf('\n};', i) + 3);
  }

  function palco(catGenero, generos) {
    const nos = {
      'tourn-gender-categories': { value: catGenero || '' },
      'gender-ratio': { value: '' },
      'gender-ratio-lock': { checked: true },
      'gender-ratio-mount': { innerHTML: '' }
    };
    const win = { document: { getElementById: (id) => nos[id] || null } };
    win.window = win;
    vmX.createContext(win);
    vmX.runInContext(nucleo, win);
    vmX.runInContext([corpo('_ctSetRatio'), corpo('_ctSetRatioLock'), corpo('_ctPaintRatio')].join('\n'), win);
    win._ctRatioGeneros = generos;
    win._ctPaintRatio();
    return { html: nos['gender-ratio-mount'].innerHTML, gravado: nos['gender-ratio'].value, win: win };
  }

  console.log('\n  ── o controle rodando ──');
  const criando = palco('', null);
  t('criação (ninguém inscrito): o slider APARECE', /id="grct-slider"/.test(criando.html));
  t('e o vazio vira 50/50 GRAVADO, não fica em branco', criando.gravado === '50/50');
  t('e a leitura mostra a composição E o percentual', /2H \/ 2M/.test(criando.html) && /grct-pct/.test(criando.html));
  t('com a trava ligada por padrão', /id="grct-lock" checked/.test(criando.html));

  const misto = palco('', ['masculino', 'feminino', 'feminino']);
  t('torneio misto: o slider aparece', /id="grct-slider"/.test(misto.html));

  const soElas = palco('', ['feminino', 'feminino', 'feminino']);
  t('só mulheres: a seção some', !/id="grct-slider"/.test(soElas.html));
  t('e diz POR QUÊ (não some calada)', /só há mulheres/.test(soElas.html));
  t('e não deixa proporção gravada', soElas.gravado === '');

  const semGenero = palco('', ['feminino', '', 'feminino']);
  t('com alguém SEM gênero declarado, a seção fica (ainda pode virar misto)',
     /id="grct-slider"/.test(semGenero.html));

  const porCategoria = palco('fem', ['masculino', 'feminino']);
  t('com categoria de gênero: a seção some', !/id="grct-slider"/.test(porCategoria.html));
  t('e o motivo é a categoria, não o pool', /categorias já separam/.test(porCategoria.html));

  // o slider mexe: 3 paradas, e o valor que sai é o que o motor entende
  const w = criando.win;
  t('parada 0 = 25/75, 1 = 50/50, 2 = 75/25',
     w._ratioSliderValue(0) === '25/75' && w._ratioSliderValue(1) === '50/50' && w._ratioSliderValue(2) === '75/25');
  t('e as 3 são proporções que o motor conhece',
     [0, 1, 2].every((i) => !!w._GENDER_RATIOS[w._ratioSliderValue(i)]));
  t('o texto da trava é UM só (as duas telas chamam a mesma função)',
     typeof w._ratioLockDesc === 'function' && w._ratioLockDesc(true) !== w._ratioLockDesc(false));
})();


console.log('\n' + ok + ' asserts OK, ' + fail + ' falha(s)');
if (fail) { console.log('❌ proporcao-genero: FALHOU'); process.exit(1); }
console.log('✅ proporcao-genero: OK');