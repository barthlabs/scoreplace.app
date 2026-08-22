// ONDE O SET EMPATA É REGRA DA SEÇÃO DE FORMATO — E DE CADA FASE.
//
// Ordem do dono (22/ago/2026), em três mensagens:
//   1. "essa sessão tie break do set não tem mais sentido. temos a sessão formato da partida
//      que já define isso por fase. NÃO PODE TER EM 2 LUGARES NA MESMA FASE."
//   2. "vamos colocar esse controle ... na sessão do formato da partida, mas podendo ser
//      configurado fora dos botões (REFLETE NOS BOTÕES E NAS REGRAS) ... isso nas duas fases
//      possíveis do torneio. tudo igual podendo ser configurado diferente em cada fase."
//   3. "na verdade um toggle 5-5/6-6 que ativado faz virar 5-5 por default."
//
// O bug que isto trava é o de sempre: DUAS FONTES pra mesma regra. A seção solta
// "🎾 Tie-break do set" era phase-agnostic — escrevia no campo da fase INICIAL, então numa
// fase 2 com formato próprio a tela prometia um set e o jogo jogava outro.
// [[feedback_unify_dual_entry_points]] · [[project_formato_da_partida_por_fase]]
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }
const L = (f) => fs.readFileSync(path.join(__dirname, '..', 'js/views/' + f), 'utf8');
const ct = L('create-tournament.js'), f2 = L('format2-ui.js'), rules = L('rules.js');

console.log('\n──── onde o set empata vive no formato da partida ────');

// ── 1. A SEÇÃO SOLTA NÃO EXISTE MAIS ────────────────────────────────────────
ok(!/re-tiebreak-at-block/.test(ct), 'a seção solta "Tie-break do set" saiu do formulário');
ok(!/_reSyncTbAt|_reSetTbAt|_reHighlightTbAt/.test(ct), 'e os manipuladores dela também');
ok(!/gsm-tbat-seg/.test(ct), 'o segmento 5-5/6-6/7-7 saiu do ⚙️ Personalizado (era a 2ª cópia)');

// ── 2. UM DESENHO SÓ, AS DUAS FASES ─────────────────────────────────────────
ok(/window\._tieAtToggleHtml = function/.test(ct), 'existe UM construtor do toggle');
ok(/_tieAtToggleHtml\(/.test(f2), 'a fase eliminatória CHAMA o mesmo construtor');
ok((f2.match(/_tieAtToggleHtml\(/g) || []).length >= 1 && !/toggle-switch[^]{0,400}tieat/.test(f2.replace(/_tieAtToggleHtml\([^]*/, '')),
   '⛔ a fase 2 não desenha um toggle próprio');
ok(/id="gsm-tieat-inline"/.test(ct), 'a fase inicial monta o toggle dentro de #gsm-section');

// ── 3. O TOGGLE FAZ O QUE O DONO DISSE ──────────────────────────────────────
const src = ct.slice(ct.indexOf('window._tieAtToggleHtml = function'));
const corpo = src.slice(0, src.indexOf('\n};') + 3) +
              '\n' + (function () {
                const i = ct.indexOf('window._tieAtDesc = function');
                return ct.slice(i, ct.indexOf('\n};', i) + 3);
              })();
const win = { document: { getElementById: () => null } }; win.window = win;
vm.createContext(win); vm.runInContext(corpo, win);

const desligado = win._tieAtToggleHtml({ games: 6, at: 'g', onToggle: 'X' });
const ligado    = win._tieAtToggleHtml({ games: 6, at: 'g-1', onToggle: 'X' });
// ⚠️ o `checked` procurado é o ATRIBUTO, não o `this.checked` do onchange — que aparece nos dois.
ok(/tieat-toggle" checked/.test(ligado) && !/tieat-toggle" checked/.test(desligado),
   'LIGADO = 5-5 (set curto); desligado = 6-6 (o padrão do dono)');
ok(/data-tbat="g-1"/.test(ligado) && /data-tbat="g"/.test(desligado),
   'e o valor que vai pro torneio é g-1 quando ligado, g quando desligado');
ok(/5-5/.test(ligado) && /6-5/.test(ligado), 'ligado, o texto diz que empata em 5-5 e o set fecha em 6-5');
ok(/6-6/.test(desligado) && /7-6/.test(desligado), 'desligado, diz que empata em 6-6 e fecha em 7-6');
// e ESCALA com os games — não é "5-5" cravado
const curto4 = win._tieAtToggleHtml({ games: 4, at: 'g-1', onToggle: 'X' });
ok(/3-3/.test(curto4) && /4-3/.test(curto4), 'com 4 games vira 3-3 / 4-3 (o rótulo deriva, não é fixo)');

// ── 4. REFLETE NAS REGRAS: a descrição do preset NÃO crava g-1 ──────────────
const desc = ct.slice(ct.indexOf('window._gsmBuildDescFromValues = function'));
const descCorpo = desc.slice(0, desc.indexOf('\n};'));
ok(/function\(s, g, tb, tbP, stb, stbP, at\)/.test(descCorpo), 'a descrição recebe o gatilho');
ok(!/var tie = g - 1;/.test(descCorpo), '⛔ e não crava mais `tie = g - 1`');
ok(/_tbLoserGames/.test(descCorpo),
   'ela resolve pelo _tbLoserGames — a MESMA função que o lançamento de placar usa');
ok(/sc\.tiebreakAt\)/.test(rules), 'a ficha de REGRAS do torneio também imprime o gatilho gravado');

// ── 5. CADA FASE GRAVA NO SEU LUGAR ─────────────────────────────────────────
ok(/window\._gsmSetTieAtInline = function[^]*gsm-tiebreakAt/.test(ct),
   'a fase inicial grava no campo dela (gsm-tiebreakAt)');
ok(/window\._f2ElimTieAt = function/.test(f2), 'a eliminatória tem o gravador dela');
ok(/e\.scoring\.tiebreakAt = novo/.test(f2), 'com formato próprio, escreve no scoring da fase');
ok(/if \(novo === herdado\) \{ _rerender\(\); return; \}/.test(f2),
   'e escolher o MESMO da classificatória continua HERDANDO (não congela uma cópia)');
ok(/_mesmoFormato\(e\.scoring, ini\)[^]{0,80}_f2SetElimScoring\(null\)/.test(f2),
   'e VOLTAR ao formato da classificatória devolve a herança (não deixa cópia congelada)');
ok(/JSON\.stringify/.test(f2.slice(f2.indexOf('function _mesmoFormato'), f2.indexOf('function _mesmoFormato') + 700)) === false,
   'a comparação é campo a campo — JSON.stringify mentiria pela ordem das chaves');
ok(/_elimTieAtAtual\(e\)/.test(f2), 'os botões da fase 2 desenham com o gatilho da fase 2');

// ── 6. O ⚙️ PERSONALIZADO PRESERVA a escolha do toggle ──────────────────────
ok(/if \(_tbAtVigente\) out\.tiebreakAt = _tbAtVigente;/.test(ct),
   'abrir e Aplicar o Personalizado NÃO apaga o gatilho escolhido no toggle');
ok(/_gsmConfigTarget === 'elim'[^]{0,200}_f2GetElimScoring/.test(ct),
   'e o valor preservado é o do ALVO aberto (inicial × eliminatória), não sempre o da inicial');

// ── 7. O SAVE grava o gatilho mesmo sem ninguém tocar em nada ───────────────
ok(/else if \(out\.tiebreakEnabled && typeof window\._sportTiebreakAt === 'function'\)/.test(ct),
   'salvar sem abrir o formato ainda deixa o gatilho GRAVADO (era efeito da seção que saiu)');

// ── 8. O MONTADOR RODANDO: aparece onde tem set, some onde não tem ──────────
(function () {
  function pega(nome) {
    const i = ct.indexOf('window.' + nome + ' = function');
    return i < 0 ? '' : ct.slice(i, ct.indexOf('\n};', i) + 3);
  }
  function palco(campos) {
    const nos = {
      'gsm-type': { value: campos.type },
      'gsm-gamesPerSet': { value: String(campos.games) },
      'gsm-tiebreakEnabled': { value: campos.tb ? 'true' : 'false' },
      'gsm-tiebreakPoints': { value: '7' },
      'gsm-tiebreakAt': { value: campos.at || '' },
      'gsm-tieat-inline': { innerHTML: '' }
    };
    const w = {
      document: { getElementById: (id) => nos[id] || null },
      _scoringUsesSets: (sc) => !!(sc && (sc.type === 'sets' || (sc.gamesPerSet && sc.tiebreakEnabled))),
      _sportTiebreakAt: () => 'g',
      _currentSportName: () => 'Tênis'
    };
    w.window = w;
    vm.createContext(w);
    vm.runInContext([pega('_tieAtToggleHtml'), pega('_tieAtDesc'), pega('_gsmTieAtAtual'),
                     pega('_gsmRenderTieAt'), pega('_gsmSetTieAtInline')].join('\n'), w);
    w._gsmRenderTieAt();
    return { html: nos['gsm-tieat-inline'].innerHTML, nos: nos, w: w };
  }

  const comSet = palco({ type: 'sets', games: 6, tb: true });
  ok(/gsm-tieat-toggle/.test(comSet.html), 'formato com SET: o toggle é montado');
  ok(!/tieat-toggle" checked/.test(comSet.html), 'e nasce DESLIGADO (6-6, o padrão do esporte)');

  // torneio real grava type:'simple' COM games+TB — a fonte canônica diz que USA SETS
  const simplesComTb = palco({ type: 'simple', games: 6, tb: true });
  ok(/gsm-tieat-toggle/.test(simplesComTb.html),
     'type:"simple" com games+TB (como os torneios reais gravam) também mostra o toggle');

  const semTb = palco({ type: 'sets', games: 6, tb: false });
  ok(!/gsm-tieat-toggle/.test(semTb.html), 'sem tie-break não há empate a posicionar: some');

  // ligar o toggle GRAVA g-1; desligar volta pra g
  comSet.w._gsmSetTieAtInline(true);
  ok(comSet.nos['gsm-tiebreakAt'].value === 'g-1', 'ligar o toggle grava g-1 (5-5)');
  comSet.w._gsmSetTieAtInline(false);
  ok(comSet.nos['gsm-tiebreakAt'].value === 'g', 'desligar volta pra g (6-6)');

  const jaCurto = palco({ type: 'sets', games: 6, tb: true, at: 'g-1' });
  ok(/tieat-toggle" checked/.test(jaCurto.html), 'torneio gravado em 5-5 abre com o toggle LIGADO');
})();

console.log('  ' + pass + ' asserts OK, ' + fail + ' falhas');
if (fails.length) fails.forEach(f => console.error('  ✗ ' + f));
console.log(fail === 0 ? '✅ empate-do-set-vive-no-formato: OK' : '❌ empate-do-set-vive-no-formato FALHOU');
process.exit(fail > 0 ? 1 : 0);
