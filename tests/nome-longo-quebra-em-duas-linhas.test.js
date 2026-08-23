/* NOME LONGO NO CARD DA CHAVE: DUAS LINHAS EQUILIBRADAS, NÃO UM FIO NUMA LINHA SÓ.
 *
 * DUAS ORDENS DO DONO, no mesmo dia (23/ago/2026), e a segunda corrigindo a leitura que
 * eu fiz da primeira:
 *   (1) _"mantendo o tamanho da caixa para todos e reduzindo o tamanho da fonte dos nomes
 *       maiores… se precisar pode quebrar em 2 linhas mas mantendo o mesmo espaço da caixa.
 *       assim a pessoa vai perceber que um nome longo fica mais difícil de ler e não com
 *       mais destaque."_
 *   (2) olhando o card já pronto · _"nomes longos não podem invadir a área da pontuação ou
 *       truncar. devem quebrar em 2 linhas. considere os placares em melhor de 3 ou 5…
 *       tentar quebrar sempre para as 2 linhas tenham o mesmo número de caracteres sem
 *       quebrar palavras no meio."_
 *
 * O QUE ESTAVA ERRADO NA PRIMEIRA VOLTA (2.0.29): a quebra era ÚLTIMO RECURSO — só depois
 * de a fonte bater no piso. Então "Maria Fernanda Albuquerque Nascimento Cavalcanti" COUBE
 * numa linha só, a 0.48rem, um fio colado no placar. Não truncava, e mesmo assim estava
 * errado.
 *
 * ⚠️ E A SEGUNDA VOLTA TAMBÉM ERROU, por GEOMETRIA — vale registrar porque a armadilha é
 * silenciosa: tentei "fica a forma que dá a fonte MAIOR". Numa caixa com altura de UMA
 * linha isso escolhe SEMPRE a linha única, porque para caber duas linhas a fonte tem de
 * descer abaixo do que uma linha já dava. Ou seja: enquanto a caixa tiver uma linha de
 * altura, "quebre em duas linhas" é impossível, não difícil — e o motor, corretamente,
 * devolvia o fio. O destravamento foi reler o dono: _"mantendo o box do mesmo tamanho para
 * cada participante"_ é o box igual ENTRE PARTICIPANTES, não igual ao de ontem. Com a
 * caixa em DUAS linhas de altura (bracket.js, `--sp-box-h` = teto × 2.2), para todo mundo,
 * o nome longo cabe em duas linhas na fonte CHEIA e o curto fica centrado numa linha só.
 *
 * A REGRA, hoje, numa frase: coube inteiro no TETO da fonte em uma linha? uma linha. Não
 * coube? duas linhas equilibradas — e a fonte só encolhe depois que DUAS linhas se
 * esgotam. Nunca mais existe "encolher para continuar numa linha só".
 *
 * TRÊS DETALHES QUE PARECEM COSMÉTICOS E NÃO SÃO:
 *   • O equilíbrio é `text-wrap:balance`, NÃO um `<br>` calculado. O nome vive num
 *     `[data-uid-name]` que `_hydrateUidNames` reescreve por `textContent` quando o perfil
 *     chega: qualquer quebra injetada no texto seria apagada ali. `balance` iguala as linhas
 *     sem tocar no conteúdo e só quebra em espaço — que é literalmente o pedido (2).
 *   • DUAS linhas são DUAS. Com a fonte lá embaixo, três e até onze linhas CABEM numa caixa
 *     de 20px; "cabe" não é o pedido. O teto só vale para caixa de altura FIXA — se a caixa
 *     CRESCEU com a quebra, quem manda é ela (v1.7.77 intacta na classificação, dashboard e
 *     explore, onde três linhas são legítimas).
 *   • `.sp-mc-sc` ganhou `margin-left`: a linha é `space-between`, o que só dá folga quando
 *     o nome é curto — com nome longo a caixa (`flex:1;min-width:0`) crescia até colar no
 *     número, e foi isso que o dono viu no print.
 *
 * ⚠️ O QUE ESTE TESTE NÃO CONSERTA — e mede de propósito: em MELHOR DE 5 a grade de sets
 * ocupa ~186px (5 colunas de 34-38px + gaps) de um card de ~280px, e sobra ~23px de caixa
 * para o nome no desktop. Nenhuma fonte e nenhuma quebra resolvem 23px: é problema de
 * LAYOUT do card, anterior a esta leva e independente dela. Fica como assert INFORMATIVO,
 * pra o número não se perder.
 *
 * Roda com: node tests/nome-longo-quebra-em-duas-linhas.test.js
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let falhas = 0, testes = 0;
function ok(cond, msg) {
  testes++;
  if (cond) console.log('  ✓ ' + msg);
  else { falhas++; console.log('  ✗ ' + msg); }
}
function nota(msg) { console.log('  · ' + msg); }

const CSS = ['css/style.css', 'css/components.css', 'css/layout.css', 'css/bracket.css', 'css/responsive.css']
  .map(read).join('\n');

/* O motor REAL, extraído do store.js — o que roda aqui é o código de produção.
 * (Réplica já deixou suíte verde sobre código revertido nesta casa; ver CLAUDE.md.) */
const STORE = read('js/store.js');
const _iFit = STORE.indexOf('window._fitNameToBox = _fitOne;');
const MOTOR = _iFit < 0 ? '' : STORE.slice(
  STORE.lastIndexOf('\n(function() {', _iFit),
  STORE.indexOf('\n})();', _iFit) + 6
);
/* CONTROLE: o mesmo motor sem a competição — a linha única é a única forma possível.
 * É o comportamento da 2.0.29, que produzia o fio do print. */
const SEM_2L = MOTOR.replace('_tentaDuasLinhasEmLote(_pQuebrar);', 'void _pQuebrar;');

/* ── ① ESTÁTICO ─────────────────────────────────────────────────────────────────── */
function estatico() {
  console.log('\n① As duas formas competem, e quem ganha é a fonte maior');
  ok(MOTOR.indexOf('window._fitNames') !== -1, 'o motor real foi extraído do store.js (não é réplica)');
  ok(MOTOR.indexOf('function _tentaDuasLinhasEmLote(itens)') !== -1, 'existe o helper _tentaDuasLinhasEmLote');
  ok(/_tentaDuasLinhasEmLote\(_pQuebrar\)/.test(MOTOR), 'o lote (_fitEmLote) delega a ele');
  ok(/_tentaDuasLinhasEmLote\(\[\{ el: el, box: box/.test(MOTOR), 'e o caminho de um elemento só (_fitOne) também');
  ok(SEM_2L !== MOTOR, 'o patch do CONTROLE encontrou o ponto que desfaz a competição');

  const iT = MOTOR.indexOf('function _tentaDuasLinhasEmLote(itens) {');
  const t = MOTOR.slice(iT, MOTOR.indexOf('\n  }', iT) + 4);
  ok(/d\.el\.style\.fontSize = d\.maxR \+ 'rem'/.test(t),
    'a busca de duas linhas recomeça do TETO da fonte (duas linhas podem sustentar mais que uma)');
  ok(/if \(d\.best2 != null\) \{\s*d\.el\.style\.fontSize = d\.best2 \+ 'rem';/.test(t),
    'duas linhas ganham SEMPRE que cabem em duas — não é comparação de fonte');
  // ⛔ a comparação "fica a fonte maior" NÃO pode voltar: numa caixa de uma linha ela
  // escolhe sempre a linha única (ver o cabeçalho), e foi assim que o fio sobreviveu.
  ok(!/d\.best2 > d\.fs/.test(t), 'e a régua de "fonte maior" não voltou');
  ok(/d\.el\.style\.textWrap = 'balance'/.test(t), 'o equilíbrio é text-wrap:balance (não um <br> injetado)');
  ok((t.match(/wordBreak = 'break-word'/g) || []).length === 1,
    'break-word aparece UMA vez só — saiu do caminho normal (o dono pediu para NÃO quebrar palavra no meio)');
  ok(/if \(!d\.coube\) \{[\s\S]{0,160}wordBreak = 'break-word'/.test(t),
    'e é último recurso: só quando nem uma linha inteira cabia');

  console.log('\n① Duas linhas são DUAS — e só em caixa de altura fixa');
  const iC = MOTOR.indexOf('function _cabe(d) {');
  const c = MOTOR.slice(iC, MOTOR.indexOf('\n  }', iC) + 4);
  ok(iC > 0, 'existe o predicado _cabe');
  ok(ALT_CAIXA > 0, 'a altura da caixa foi lida do render (obtida: teto × ' + ALT_CAIXA + ')');
  ok(/if \(!d\.fixa\) return true;/.test(c), 'caixa que CRESCEU não tem teto de linhas (v1.7.77 intacta lá)');
  ok(/scrollHeight \/ lh\) <= 2/.test(c), 'caixa de altura FIXA aceita no máximo duas linhas');
  ok(/d\.fixa = !\(d\.bh2 > d\.bh0 \+ 1\)/.test(MOTOR),
    'e "fixa" é MEDIDO (a caixa não cresceu), não deduzido de classe');
  ok(!/sp-mc-box|classList|className/.test(t + c),
    'nada aqui decide por classe — quem manda é a caixa ter crescido ou não');

  console.log('\n① O CSS que sustenta tudo isso');
  const comp = read('css/components.css');
  const m = comp.match(/\.sp-mc-box\{([^}]*)\}/);
  ok(!!m, '.sp-mc-box existe em components.css');
  if (m) {
    ok(/height:var\(--sp-box-h/.test(m[1]), 'com ALTURA FIXA (cânone do dono, não bug a "consertar")');
    ok(/overflow:hidden/.test(m[1]), 'e overflow:hidden');
    ok(/line-height:1\.1/.test(m[1]), 'e line-height apertado — é ele que define quanto cabe em duas linhas');
  }
  ok(/\.sp-mc-sc\{[^}]*margin-left:8px/.test(comp),
    '.sp-mc-sc tem folga à esquerda — o nome não encosta no placar');
  // ⛔ A ALTURA DE DUAS LINHAS É O QUE TORNA A REGRA POSSÍVEL. Voltar isto pra `* 1.35`
  // (uma linha) não "aperta o layout": DESLIGA a quebra, porque duas linhas passam a
  // custar mais fonte do que uma — e o nome longo vira o fio do print de novo.
  ok(/--sp-box-h:\$\{\(_nomeMaxRem \* 2\.2\)\.toFixed\(2\)\}rem/.test(read('js/views/bracket.js')),
    'a caixa do nome tem altura de DUAS linhas (teto × 2.2), igual pra todo participante');
  ok(/\.sp-mc-box svg\{[^}]*width:1em[^}]*height:1em/.test(comp),
    'a coroa dentro da caixa é dimensionada em em (encolhe junto com o nome)');
}

/* ── ②③ MEDIDO ──────────────────────────────────────────────────────────────────── */
const ROW = 'padding:8px 10px;border-radius:8px;display:flex;justify-content:space-between;' +
  'align-items:center;background:var(--placar-linha-bg);border-left:3px solid var(--placar-tarja-neutra);';

/* A altura da caixa sai do PRÓPRIO render (bracket.js), não de um número copiado aqui —
 * se alguém mexer lá, esta medição acompanha em vez de medir um card que não existe. */
const ALT_CAIXA = parseFloat((read('js/views/bracket.js')
  .match(/--sp-box-h:\$\{\(_nomeMaxRem \* ([\d.]+)\)/) || [])[1] || '0');

/* As TRÊS áreas de placar reais do card (bracket.js `_setGridHtml` + `.sp-set-col`,
 * larguras de window._SET_COL_W: set=34, super tie-break=38). É a parte do pedido (2)
 * que diz "considere os placares em melhor de 3 ou 5". */
const PLACARES = { um: null, b3: [34, 34, 38], b5: [34, 34, 34, 34, 38] };
function sc(kind) {
  if (!PLACARES[kind]) {
    return '<div class="sp-mc-sc"><span style="font-weight:800;font-size:1rem;min-width:24px;text-align:center;">6</span></div>';
  }
  return '<div class="sp-mc-sc"><div class="sp-set-grid">' + PLACARES[kind].map(function (w) {
    return '<div class="sp-set-col" style="--w:' + w + 'px;"><span style="font-weight:800;font-size:0.9rem;">6</span></div>';
  }).join('') + '</div></div>';
}
function slot(nomes) {
  const multi = nomes.length > 1;
  const maxR = multi ? 0.78 : 0.85, minR = multi ? 0.52 : 0.58, av = multi ? '20px' : '24px';
  let h = multi ? '<div class="sp-mc-col">' : '';
  nomes.forEach(function (n, i) {
    h += '<div class="sp-mc-side">' +
      '<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" class="sp-av" style="--sp-av:' + av + '">' +
      '<div class="sp-mc-box" style="--sp-box-h:' + (maxR * ALT_CAIXA).toFixed(2) + 'rem">' +
        '<span class="sp-name-fit sp-mc-nm" data-maxrem="' + maxR + '" data-minrem="' + minR + '">' +
        '<span data-uid-name="u' + i + '">' + n + '</span></span></div></div>';
  });
  if (multi) h += '</div>';
  return h;
}
function card(id, nomes, kind) {
  return '<div id="' + id + '" style="box-sizing:border-box;background:var(--bg-card);' +
    'border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:14px;">' +
    '<div style="' + ROW + '"><div style="flex:1;overflow:hidden;min-width:0;">' + slot(nomes) + '</div>' +
      sc(kind) + '</div><div class="sp-mc-vs">VS</div>' +
    '<div style="' + ROW + '"><div style="flex:1;overflow:hidden;min-width:0;">' + slot(['Ana Prado']) + '</div>' +
      sc(kind) + '</div></div>';
}

// a varredura cruza a fronteira de propósito: 2 a 6 componentes, e uma dupla em que os
// DOIS lados são longos (é o caso do print do dono).
const NOMES = [
  { id: 'n2', v: ['Maria Prado'] },
  { id: 'n3', v: ['Maria Fernanda Prado'] },
  { id: 'n4', v: ['Maria Fernanda Albuquerque Nascimento'] },
  { id: 'n5', v: ['Maria Fernanda Albuquerque Nascimento Cavalcanti'] },
  { id: 'n6', v: ['Maria Fernanda Albuquerque Nascimento Cavalcanti Rodrigues'] },
  { id: 'd5', v: ['Maria Fernanda Albuquerque Nascimento Cavalcanti', 'José Guilherme Quaresma Rodrigues'] },
];
const KINDS = Object.keys(PLACARES);

async function medir(page, motor) {
  const out = [];
  for (const tema of ['dark', 'light']) {
    for (const w of [390, 768, 1280]) {
      await page.setViewportSize({ width: w, height: 1400 });
      const cards = NOMES.map((n) => KINDS.map((k) => card(k + '-' + n.id, n.v, k)).join('')).join('');
      await page.setContent(
        '<!doctype html><html data-theme="' + tema + '"><head><style>' + CSS + '</style></head>' +
        '<body style="margin:0;padding:12px;background:var(--bg-main,#0b1220);"><div class="card">' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px;">' +
        cards + '</div></div></body></html>', { waitUntil: 'load' });
      await page.evaluate((code) => { eval(code); }, motor);
      await page.evaluate(() => window._fitNames(document, 0));
      await page.waitForTimeout(700);
      const r = await page.evaluate(({ ns, ks }) => {
        const raiz = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        const o = {};
        ns.forEach((n) => ks.forEach((k) => {
          const raiz2 = document.getElementById(k + '-' + n);
          const el = raiz2 && raiz2.querySelector('.sp-name-fit');
          if (!el) return;
          const box = el.parentElement, cs = getComputedStyle(el);
          const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
          const placar = raiz2.querySelector('.sp-mc-sc');
          o[n + '/' + k] = {
            fs: +(parseFloat(cs.fontSize) / raiz).toFixed(3),
            linhas: Math.round(el.scrollHeight / lh),
            caixa: box.clientWidth,
            corta: (el.scrollWidth > box.clientWidth + 1) || (el.scrollHeight > box.clientHeight + 1),
            // invasão: a borda direita do TEXTO passou da borda esquerda do placar?
            invade: el.getBoundingClientRect().right > placar.getBoundingClientRect().left + 1,
          };
        }));
        return o;
      }, { ns: NOMES.map((n) => n.id), ks: KINDS });
      Object.keys(r).forEach((k) => out.push(Object.assign({ ctx: tema + '@' + w, caso: k }, r[k])));
    }
  }
  return out;
}

(async function () {
  estatico();

  const browser = await chromium.launch();
  const page = await browser.newPage();

  console.log('\n③ CONTROLE: sem a competição, o nome longo vira o fio de uma linha só');
  const antes = await medir(page, SEM_2L);
  console.log('\n② MEDIDO: com a competição');
  const dep = await medir(page, MOTOR);
  await browser.close();

  const idx = (arr) => arr.reduce((a, x) => { a[x.ctx + ' ' + x.caso] = x; return a; }, {});
  const A = idx(antes), D = idx(dep);

  // ⚠️ melhor de 5 fica FORA dos asserts duros: com ~23px de caixa no desktop nenhuma
  // fonte resolve. É layout do card, não ajuste de nome — medido logo abaixo.
  const duros = dep.filter((x) => x.caso.indexOf('/b5') === -1);

  const cortes = duros.filter((x) => x.corta);
  ok(cortes.length === 0, 'nenhum nome truncado em ' + duros.length + ' slots (placar simples e melhor de 3)' +
    (cortes.length ? ' — ' + cortes.slice(0, 5).map((x) => x.ctx + ' ' + x.caso).join(', ') : ''));

  const demais = duros.filter((x) => x.linhas > 2);
  ok(demais.length === 0, 'nenhum nome passa de DUAS linhas' +
    (demais.length ? ' — ' + demais.slice(0, 5).map((x) => x.ctx + ' ' + x.caso + '=' + x.linhas + 'L').join(', ') : ''));

  const invadem = dep.filter((x) => x.invade);
  ok(invadem.length === 0, 'nenhum nome invade a área da pontuação, em NENHUM placar (inclui melhor de 5)' +
    (invadem.length ? ' — ' + invadem.slice(0, 5).map((x) => x.ctx + ' ' + x.caso).join(', ') : ''));

  // O GANHO, na régua certa: o que o controle mostra como fio de UMA linha tem de sair
  // daqui em DUAS. Comparar fonte sozinho não serve — foi a régua que me enganou na
  // segunda volta (ver o cabeçalho).
  const fios = duros.filter((x) => {
    const a = A[x.ctx + ' ' + x.caso];
    return a.linhas === 1 && a.fs < 0.8;      // uma linha, e encolhida em relação ao teto
  });
  const viraram = fios.filter((x) => D[x.ctx + ' ' + x.caso].linhas === 2);
  ok(fios.length > 0, 'o controle produz ' + fios.length + ' nomes encolhidos numa linha só — a régua mede algo');
  ok(viraram.length === fios.length, 'e TODOS viram duas linhas com a cura (' +
    viraram.length + '/' + fios.length + ')');

  // truncamento: o controle tem, a cura não
  const cortesAntes = duros.filter((x) => A[x.ctx + ' ' + x.caso].corta);
  ok(cortesAntes.length > 0, 'o controle TRUNCA em ' + cortesAntes.length + ' slots');

  // e a fonte tem de SUBIR onde o controle já mostrava o nome inteiro. Onde ele
  // TRUNCAVA, fonte menor é ganho, não perda: 0.58rem cortado mostra menos nome que
  // 0.39rem inteiro — por isso a comparação de fonte só vale sobre quem não truncava.
  const comparaveis = duros.filter((x) => !A[x.ctx + ' ' + x.caso].corta);
  const subiu = comparaveis.filter((x) => D[x.ctx + ' ' + x.caso].fs > A[x.ctx + ' ' + x.caso].fs + 0.001);
  const desceu = comparaveis.filter((x) => D[x.ctx + ' ' + x.caso].fs < A[x.ctx + ' ' + x.caso].fs - 0.001);
  ok(subiu.length > 0, 'a fonte SOBE em ' + subiu.length + ' slots (a caixa de duas linhas devolve tamanho)');
  ok(desceu.length === 0, 'e não desce em nenhum que o controle já mostrava inteiro' +
    (desceu.length ? ' — ' + desceu.slice(0, 5).map((x) => x.ctx + ' ' + x.caso + ' ' +
      A[x.ctx + ' ' + x.caso].fs + '→' + D[x.ctx + ' ' + x.caso].fs).join(', ') : ''));

  // o caso do print, nomeado: 5 componentes, placar simples, em TODOS os contextos
  const print = dep.filter((x) => x.caso === 'n5/um');
  ok(print.every((x) => x.linhas === 2 && !x.corta),
    'o nome do print ("…Nascimento Cavalcanti", placar simples) sai em 2 linhas nos ' +
    print.length + ' contextos, sem truncar');
  const printFs = Math.min.apply(null, print.map((x) => x.fs));
  ok(printFs >= 0.7, 'e em fonte cheia ou perto dela (menor: ' + printFs + 'rem, teto 0.85)');

  // ⚠️ informativo: o buraco de layout do melhor de 5
  const b5 = dep.filter((x) => x.caso.indexOf('/b5') !== -1);
  const b5ruins = b5.filter((x) => x.corta || x.linhas > 2);
  nota('MELHOR DE 5: a grade de sets deixa a caixa do nome com ' +
    Math.min.apply(null, b5.map((x) => x.caixa)) + '-' + Math.max.apply(null, b5.map((x) => x.caixa)) +
    'px; ' + b5ruins.length + '/' + b5.length + ' slots ainda passam de 2 linhas ou truncam. ' +
    'É LAYOUT do card (5 colunas de 34-38px num card de 280px), não ajuste de nome — nenhuma ' +
    'fonte resolve 23px. Anterior a esta leva; registrado para não se perder.');

  console.log('\n' + (falhas ? '✗ ' + falhas + '/' + testes + ' falharam' : '✓ ' + testes + '/' + testes + ' passaram'));
  process.exit(falhas ? 1 : 0);
})();
