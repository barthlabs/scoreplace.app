/* NOME DE PESSOA NUNCA É CORTADO — node tests/nome-nunca-e-cortado.test.js
 *
 * ORDEM DO DONO (07/ago/2026): "nao quero que corte o nome. considera o box
 * invisivel e reduz a fonte para caber ocupando o espaco da melhor forma, mas
 * com fonte reduzida."
 *
 * POR QUE ESTE TESTE EXISTE, e não é zelo: o cânone da caixa invisível
 * (`.sp-name-fit` + `_fitNameToBox`, store.js) foi construído INTEIRO em
 * jul/2026 — com piso (`data-minrem`), ResizeObserver, integração com a escala
 * por área e memória escrita — e foi aplicado em TRÊS lugares. A chave, que é
 * onde o nome mais aparece, seguia com `text-overflow: ellipsis` puro. Pior:
 * `_fitNames` era chamado à mão em 2 telas e o MutationObserver disparava
 * OUTRO sistema (`_fitTwoLineNames`), então o cânone não rodava nem onde a
 * classe estava. Reação do dono: "eu peço as coisas vc faz, ou nem faz. depois
 * esquece e vira o samba do criolo doido. as coisas estao lá mas nao funcionam
 * como deveriam."
 *
 * Regra que virou comentário volta a ser esquecida. Aqui ela vira GATE.
 *
 * O teste trava DUAS coisas:
 *   1. FIAÇÃO — o ciclo do observer TEM que rodar `_fitNames`, senão a classe
 *      não ajusta nada e o conserto seria decorativo.
 *   2. ADOÇÃO — os renders de NOME DE PESSOA das telas já convertidas não
 *      podem voltar a cortar com reticências.
 *
 * ⚠️ Ele NÃO exige que todo `text-overflow` do app suma: reticências em
 * ENDEREÇO, nome de LOCAL ou nome de TORNEIO são legítimas (não é gente, e a
 * pedagogia de nome curto não se aplica). O escopo é nome de pessoa.
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } }

const raiz = path.join(__dirname, '..');
const ler = (p) => fs.readFileSync(path.join(raiz, p), 'utf8');

// ── 1. FIAÇÃO: o cânone precisa TER gatilho automático ─────────────────────
console.log('\n1. O cânone da caixa é disparado por quem varre o DOM');
{
  const store = ler('js/store.js');

  ok(/window\._fitNameToBox\s*=/.test(store),
     'o ajustador da caixa (_fitNameToBox) existe em store.js');
  ok(/window\._fitNames\s*=\s*function/.test(store),
     'a varredura (_fitNames) existe em store.js');

  // O corpo do _run() do observer — é ele que roda a cada mudança de DOM.
  const mObs = store.match(/function _run\(\)\s*\{[\s\S]{0,600}?\n\s*\}/g) || [];
  const runComFit = mObs.some(b => /_fitNames\s*\(/.test(b));
  ok(runComFit,
     'o ciclo do MutationObserver chama _fitNames — sem isto a classe .sp-name-fit ' +
     'não ajusta nada e o cânone volta a ser decoração (foi exatamente o bug)');

  ok(/_fitNames\s*\(document,\s*0\)/.test(store),
     'o resize da janela também re-ajusta (escala por área muda a caixa)');

  // O piso é o que impede o nome de virar ilegível pra quem só LÊ a chave.
  ok(/data-minrem/.test(store),
     'a caixa tem PISO (data-minrem): encolhe até um limite, nunca até sumir');
}

// ── 2. ADOÇÃO: telas convertidas não podem voltar a cortar nome ────────────
console.log('\n2. As telas convertidas usam a caixa, não reticências');
{
  // Cada entrada: arquivo + trechos que marcam um render de NOME DE PESSOA.
  const convertidas = [
    { arq: 'js/views/bracket.js', oque: 'chave (card de jogo)' }
  ];

  convertidas.forEach(({ arq, oque }) => {
    const src = ler(arq);
    ok(/class="sp-name-fit"/.test(src),
       oque + ': usa a caixa invisível (.sp-name-fit)');
    ok(/data-maxrem=/.test(src) && /data-minrem=/.test(src),
       oque + ': declara teto E piso da fonte');

    // O pecado específico: o MESMO span que imprime o nome trazer ellipsis.
    const linhasNome = src.split('\n').filter(l =>
      /_safeHtml\((dispName|name)\)|_nameWithCrown\(/.test(l));
    const comEllipsis = linhasNome.filter(l => /text-overflow\s*:\s*ellipsis/.test(l));
    ok(comEllipsis.length === 0,
       oque + ': nenhum render de nome corta com reticências' +
       (comEllipsis.length ? ' — reincidiu em ' + comEllipsis.length + ' linha(s)' : ''));
  });
}

// ── 3. A caixa precisa ser CAIXA: dimensão própria e overflow contido ──────
console.log('\n3. A caixa tem dimensão própria (senão o fit não tem contra o quê medir)');
{
  const src = ler('js/views/bracket.js');
  // O pai do .sp-name-fit é quem define o espaço; sem altura/overflow o
  // _fitOne devolve "layout pendente" pra sempre e nada é ajustado.
  // 1.9.39: a caixa deixou de ser `style="…"` repetido 400× e virou a CLASSE
  // `.sp-mc-box` (peso de HTML era 2/3 do custo de pintar a chave). O invariante não
  // mudou de conteúdo, mudou de ENDEREÇO — então é lá que ele é cobrado. O que segue
  // inline é só a ALTURA, como variável, porque ela depende do teto de fonte do nome.
  ok(/_boxNome\s*=/.test(src), 'a chave declara a caixa num ponto único');
  const box = (src.match(/const _boxNome\s*=\s*`([^`]*)`/) || [])[1] || '';
  ok(/--sp-box-h\s*:/.test(box) && /rem/.test(box),
     'a ALTURA da caixa é em rem — herda a escala por área, não px cravado');
  ok(/class="sp-mc-box"/.test(src), 'quem desenha o nome usa a caixa (.sp-mc-box)');
  const css = ler('css/components.css');
  const regra = (css.match(/\.sp-mc-box\s*\{([^}]*)\}/) || [])[1] || '';
  ok(/overflow\s*:\s*hidden/.test(regra), 'a caixa contém o conteúdo (overflow:hidden)');
  ok(/min-width\s*:\s*0/.test(regra),
     'min-width:0 — sem isto o flex recusa encolher e a caixa estoura a linha');
  ok(/height\s*:\s*var\(--sp-box-h/.test(regra), 'a classe consome a altura declarada pelo render');
}

console.log('\n' + (fail === 0 ? '✅' : '❌') +
  ' nome-nunca-e-cortado: ' + pass + ' asserções, ' + fail + ' falha(s)');
process.exit(fail === 0 ? 0 : 1);
