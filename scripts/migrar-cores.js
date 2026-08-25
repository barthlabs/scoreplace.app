/* MIGRA as cores das INLINE STYLES para a tabela de cor (css/paleta.css).
 *
 *   color:#a5b4fc   ->   color:var(--sp-c-a5b4fc,#a5b4fc)
 *
 * ⛔ SÓ dentro de um `style="..."`. Um <style> no meio do JS é FOLHA DE ESTILO, e as
 * regras `[style*=]` que estamos removendo nunca casavam folha — só atributo. Tokenizar
 * uma regra de folha mudaria cor que hoje o tema claro não toca: pixel diferente.
 *
 * ⛔ SÓ as combinações (propriedade, cor) que as regras removidas de fato casavam. Por
 * isso `border-color:#x` fica de fora: as grafias `;color:` / ` color:` / `^color:`
 * existiam justamente pra NÃO pegar `border-color`.
 *
 * Uso:  node scripts/migrar-cores.js            (relatório, não escreve)
 *       node scripts/migrar-cores.js --escrever
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { gerar, canon, tokenPara } = require(path.join(__dirname, 'gerar-paleta.js'));

const ESCREVE = process.argv.includes('--escrever');
/* ⛔ `var(--nome)` TAMBÉM era remapeado: existia a regra `[style*="color:var(--primary-color)"]`
 * -> `#1d4ed8` no claro (24 usos no js/). Sem incluir essa forma, esses elementos perdiam o
 * remap quando as regras saíssem. A variante COM vírgula (`var(--x,#hex)`) fica de fora de
 * propósito: é a forma já migrada, e casá-la migraria de novo em cima. */
const COR = '(?:#[0-9a-fA-F]{3,8}|rgba?\\([^)]*\\)|var\\(--[a-zA-Z0-9-]+\\))';
const TARJA = 'rgba(30,41,59,0.85)';
/* ⛔ A TARJA TEM DUAS CORES: a do tema claro (0.85 sobre azul-ardósia) e a do escuro
 * (preto 0.60). As regras removidas tratavam as DUAS — marcar só uma deixava metade do
 * comportamento pra trás. Os dois marcadores começam com `--sp-tarja`, então o seletor
 * `[style*="--sp-tarja"]` pega os dois de uma vez. */
/* ⛔ O NOME IMPORTA: o marcador da tarja ESCURA não pode conter `--sp-tarja`, senão o
 * seletor da restauração geral (`[style*="--sp-tarja"]`) o pega também. A tarja escura só
 * precisa alimentar as regras do `.sp-ritmo` — no tema claro ela nem é tarja: é um fundo
 * preto comum, e restaurar a paleta escura ali apagava o remap da barra de progresso. */
const TARJA2 = 'rgba(0,0,0,0.60)';
const MARCA2 = '--sp-leitura2';

function arquivos(dir, ext) {
  const out = [];
  (function anda(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'vendor') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) anda(p); else if (ext.test(e.name)) out.push(p);
    }
  })(dir);
  return out;
}

/* INLINE STYLE ou FOLHA DE ESTILO?
 *
 * As regras `[style*=]` que estamos removendo casavam o ATRIBUTO `style` — folha de
 * estilo nenhuma. Migrar uma declaração de folha mudaria cor que hoje o tema claro não
 * toca; deixar de migrar uma inline style tira dela a correção do tema claro. Os dois
 * erros são visíveis, então o critério precisa ser defensável, não esperto.
 *
 * DOIS SINAIS, ambos verificáveis:
 *   1. está dentro de um `<style>…</style>`?           -> FOLHA
 *   2. o literal de string que a contém tem `{`?       -> FOLHA
 * O resto é inline style. Uma lista de declarações (`padding:8px;color:#fbbf24`) nunca
 * tem chave; um seletor sempre tem. `${` de template não conta como chave.
 *
 * ⛔ Tentei antes por PROFUNDIDADE de chave acumulada no arquivo: um `{` solto em texto
 * ("clique {aqui}") desbalanceava e passava a marcar como folha tudo o que vinha depois —
 * 13 arquivos ficaram desbalanceados e a conta caiu de 1.221 pra 683. Palpite que eu não
 * consigo conferir não entra numa migração de 1.300 pontos.
 */
/* ⛔ A FAIXA DE UM `<style>` TEM QUE SER PLAUSÍVEL. Casar `<style` com o `</style>` mais
 * próximo parece óbvio e produzia faixas de 520 KB no store.js: basta um `<style` que não
 * fecha por perto (num comentário, ou montado em outro pedaço) pra engolir metade do
 * arquivo — e tudo lá dentro passava a ser lido como folha de estilo. Uma folha embutida
 * real tem alguns milhares de caracteres; acima disso o par está errado e é melhor não
 * marcar nada do que marcar o arquivo inteiro. */
const MAX_STYLE = 8000;
function regioesStyle(src) {
  const z = []; const re = /<style[^>]*>/g; let m;
  while ((m = re.exec(src))) {
    const f = src.indexOf('</style>', m.index);
    if (f === -1 || f - m.index > MAX_STYLE) continue;
    z.push([m.index, f]);
  }
  return z;
}

/* O literal de string que contém o índice. Volta {ini, fim} ou null. Percorre o arquivo
 * uma vez, respeitando escape e comentário — adivinhar a aspa olhando pra trás erra em
 * apóstrofo dentro de comentário, que este código tem aos montes (português). */
function literaisDe(src) {
  const lits = [];
  let i = 0, aspa = null, ini = 0;
  while (i < src.length) {
    const c = src[i];
    if (aspa) {
      if (c === '\\') { i += 2; continue; }
      if (c === aspa) { lits.push([ini, i]); aspa = null; }
      i++; continue;
    }
    if (c === '"' || c === "'" || c === '`') { aspa = c; ini = i + 1; i++; continue; }
    if (c === '/' && src[i + 1] === '/') { const f = src.indexOf('\n', i); i = f === -1 ? src.length : f; continue; }
    if (c === '/' && src[i + 1] === '*') { const f = src.indexOf('*/', i + 2); i = f === -1 ? src.length : f + 2; continue; }
    i++;
  }
  return lits;
}

function classificador(src) {
  // ⛔ NÃO depende de saber onde começa e termina cada literal de string. Tentei por aí e o
  // scanner dessincroniza em regex com aspas dentro (`/['\"]/g`), e a partir dali o arquivo
  // inteiro é lido errado — 114 inline styles legítimas ficavam de fora sem nenhum sinal.
  // Sobram os dois sinais que se conferem no texto cru:
  //   1. `<style> … </style>`      -> FOLHA
  //   2. `{ declaração` até a `}`  -> FOLHA (é a única forma de uma regra CSS)
  // Fora disso é lista de declarações, que é o que o atributo `style` aceita.
  const zonas = regioesStyle(src);
  const regras = [];
  const re = /\{\s*[a-z-]{2,}\s*:\s*[^;{}\s"'`]/g;
  let m;
  while ((m = re.exec(src))) {
    // A regra termina na `}` — ou no fim da STRING em que ela abriu, o que vier antes.
    // Sem esse segundo limite, uma regra cuja `}` fica noutro pedaço da concatenação
    // estendia o intervalo por 2.000 caracteres e engolia inline styles vizinhas
    // (`el.style.border = '2px solid rgba(...)'` logo abaixo do CSS do mesmo arquivo).
    const cands = ['}', "'", '"', '`'].map((c) => src.indexOf(c, m.index + 1)).filter((x) => x !== -1);
    const j = cands.length ? Math.min.apply(null, cands) : Math.min(src.length, m.index + 2000);
    regras.push([m.index, j]);
    re.lastIndex = m.index + 1;
  }
  const dentro = (i, faixas) => faixas.some(([a, b]) => i >= a && i <= b);

  /* Estar DENTRO de um `style="` é prova direta de atributo, e vence o palpite: sobravam
   * 36 inline styles longas recusadas porque uma abertura de regra achada perto abria um
   * intervalo que as engolia. O palpite de folha só decide o que está FORA do atributo —
   * que é o caso das strings de estilo montadas em variável (`var linha = 'color:#x'`). */
  return function ehFolha(i) {
    if (dentroDeStyleAttr(src, i)) return false;
    return dentro(i, zonas) || dentro(i, regras);
  };
}

/* O índice está dentro de um atributo `style="`? Olha pra trás até o `style=` mais próximo
 * e exige que a aspa de abertura não tenha fechado no caminho. */
function dentroDeStyleAttr(s, i) {
  const tras = s.slice(Math.max(0, i - 900), i);
  const m = tras.lastIndexOf('style=');
  if (m === -1) return false;
  const d = tras.slice(m + 6);
  const abre = d.match(/^\\?["']/);
  if (!abre) return false;
  const fecha = abre[0].replace('\\', '');
  const corpo = d.slice(abre[0].length);
  if (fecha === '"') return corpo.indexOf('"') === -1;
  return !/'\s*(\+|>)/.test(corpo);
}

/* ⛔ HEX EM MAIÚSCULA FICA DE FORA. Seletor de atributo é sensível a maiúscula, então
 * `[style*="color:#25d366"]` NUNCA casou `color:#25D366` — essas cores atravessavam o tema
 * claro sem remap nenhum. Tokenizá-las "consertaria" isso e mudaria a tela: `#25D366` é o
 * verde do WhatsApp, que viraria #166534 no claro. A migração é pra ser invisível; se esse
 * remap é desejado, é decisão à parte, com a cor escrita em minúscula.
 * MEDIDO: são 2 cores (#25D366 e #D5D5E5) — as únicas 2 diferenças que sobraram na prova. */
function temMaiuscula(cor) { return /^#/.test(cor) && cor !== cor.toLowerCase(); }

/* A TRANSFORMAÇÃO, num lugar só.
 *
 * ⛔ A prova de cor tinha uma CÓPIA desta lógica pra dizer "como ficaria a declaração X
 * depois da migração" — e a cópia divergiu duas vezes (na tabela de borda e no casamento
 * por grafia), o que faz a prova atestar uma migração que não é a que roda. Agora as duas
 * chamam esta função: o que a prova mede é literalmente o que o migrador faz.
 */
function migrarTexto(orig, ctx, rel) {
  rel = rel || { ancorado: 0, borda: 0, tarja: 0, dinamico: 0, foraDeAttr: 0, maiuscula: 0, grafia: 0, importante: 0, porArq: {} };
  const ancorados = ctx.ancorados, bordas = ctx.bordas, exatos = ctx.exatos;
    let s = orig;
    /* ⛔ O CLASSIFICADOR TEM QUE SER REFEITO A CADA PASSADA. Cada substituição ALONGA o
     * texto (`#f87171` -> `var(--sp-c-f87171,#f87171)`), então os índices da passada 2 e 3
     * não correspondem mais ao texto de onde as faixas de folha foram calculadas. Com o
     * classificador velho, posições dentro de um `<style>` passavam a ser lidas como inline
     * style (e vice-versa) — foi o que migrou uma regra dentro de `<style>` em
     * tournaments-utils.js. Refazer custa milissegundos e é a única forma de o índice bater. */
    let ehFolha = classificador(orig);

    // 1) propriedade ancorada
    const reA = new RegExp('(^|[;{"\'\\s])(color|background|background-color)(\\s*:\\s*)(' + COR + ')', 'g');
    let atual = s;   // ⛔ o `i` do replace é relativo a ESTE texto, não ao original
    s = atual.replace(reA, (all, pre, prop, sep, cor, i) => {
      const tk = tokenPara(canon(cor), prop);
      // ⛔ casa a GRAFIA, não a cor: `background: #fbbf24` não era remapeado, `background:
      // rgb(251, 191, 36)` era. Casar por cor canônica mudou 282 elementos da tela inicial.
      if (!exatos.has(prop + sep + cor)) { rel.grafia++; return all; }
      if (temMaiuscula(cor)) { rel.maiuscula++; return all; }
      // ⛔ `!important` EM LINHA vence `!important` de folha — essas declarações eram imunes
      // ao remap e têm que continuar imunes.
      if (/^\s*!important/.test(atual.slice(i + all.length, i + all.length + 20))) { rel.importante++; return all; }
      // ⚠️ o `i` do replace aponta pro DELIMITADOR capturado no grupo 1 (o `"` de
      // `style="color:...`), não pra propriedade. Testar ali dizia "fora do atributo"
      // pra 273 inline styles legítimos — e uma inline style não migrada perde a
      // correção do tema claro no instante em que as regras saem.
      if (ehFolha(i + pre.length)) { rel.foraDeAttr++; return all; }
      rel.ancorado++; 
      return pre + prop + sep + 'var(' + tk + ',' + cor + ')';
    });

    // 2) borda: a regra casava `solid <rgb>`
    ehFolha = classificador(s);
    const reB = new RegExp('(solid\\s+)(' + COR + ')', 'g');
    atual = s;
    s = atual.replace(reB, (all, pre, cor, i) => {
      if (!exatos.has('solid ' + cor)) { rel.grafia++; return all; }
      if (temMaiuscula(cor)) { rel.maiuscula++; return all; }
      if (ehFolha(i + pre.length)) { rel.foraDeAttr++; return all; }
      rel.borda++; 
      return pre + 'var(' + tokenPara(canon(cor), 'borda') + ',' + cor + ')';
    });

    ehFolha = classificador(s);
    // 3) COR DINÂMICA: `'color:' + x` -> `'color:' + _spCor(x)`
    //
    // ⛔ ESTE É O CASO QUE QUASE PASSOU BATIDO. Boa parte das cores não está escrita junto
    // da propriedade — ela chega por argumento (`_renderRow('Desativados', lista, '#f87171',
    // …)`) e é concatenada. O navegador vê `color:#f87171` e as regras antigas casavam; um
    // regex no texto não vê nada. MEDIDO na chave do Confra: 44 elementos ficavam sem o
    // remap do tema claro — texto vermelho-claro sobre fundo claro.
    // A concatenação SABE a propriedade, então a tradução acontece aqui, com o mapa de
    // js/paleta-tabela.js. Cor que não está na tabela volta intacta (gradiente, `var()`
    // já pronto, cor de marca).
    // ⛔ a cor também chega por EXPRESSÃO: `'color:' + (_isRed ? '#f87171' : '#fbbf24')`.
    // Só identificador deixava de fora o selo de W.O. da chave (12 elementos).
    const reD = /((?:color|background|background-color)\s*:\s*)(['"`])\s*\+\s*(\([^()]*(?:\([^()]*\)[^()]*)*\)|[_$a-zA-Z][\w$.]*(?:\([^()]*\))?)/g;
    atual = s;
    s = atual.replace(reD, (all, prop, aspa, expr, i) => {
      if (ehFolha(i)) return all;
      if (expr === '_spCor' || /^window$/.test(expr)) return all;
      // ⛔ `!important` EM LINHA vencia o `!important` da folha: essas declarações NUNCA
      // foram remapeadas e não podem passar a ser. No caminho dinâmico o `!important` vem
      // no pedaço seguinte da concatenação (`+ ' !important;'`), não colado no valor.
      // o que separa uma declaração da seguinte é o `;` — e no caminho dinâmico o
      // `!important` vem depois de aspa e `+` (`+ ' !important;'`), então proibir aspa aqui
      // fazia o guarda falhar justamente onde ele importa.
      if (/^[^;]{0,40}!important/.test(atual.slice(i + all.length, i + all.length + 60))) { rel.importante++; return all; }
      rel.dinamico++; 
      return prop + aspa + ' + window._spCor(' + expr + ', \'' + prop.replace(/\s*:\s*$/, '').trim() + '\')';
    });

    // 3b) COR DINÂMICA EM TEMPLATE: `color:${expr}` -> `color:${window._spCor(expr)}`
    //
    // Aqui a expressão é ARBITRÁRIA — `${s.pointsDiff >= 0 ? '#4ade80' : '#f87171'}` — então
    // não dá pra casar com regex de identificador: o fim é a `}` correspondente, achada
    // contando chaves e respeitando aspas. Sem isto sobravam 8 elementos da chave sem remap.
    // 3c) BORDA DINÂMICA: `'border:1px solid ' + x` -> `... + _spCor(x, 'borda')`
    // A tarja de leitura entrega a borda por objeto (`_photoReadBox().border`), e a borda
    // tem TABELA PRÓPRIA — a mesma cor não vai pro mesmo tom como fundo e como borda.
    ehFolha = classificador(s);
    atual = s;
    s = atual.replace(/(solid\s*)(['"`])\s*\+\s*(\([^()]*(?:\([^()]*\)[^()]*)*\)|[_$a-zA-Z][\w$.]*(?:\([^()]*\))?)/g, (all, pre, aspa, expr, i) => {
      if (ehFolha(i) || expr === '_spCor' || expr === 'window') return all;
      rel.dinamico++; 
      return pre + aspa + " + window._spCor(" + expr + ", 'borda')";
    });

    ehFolha = classificador(s);
    s = (function (txt) {
      const re2 = /(color|background|background-color)(\s*:\s*)\$\{/g;
      let m2, saida = '', ult = 0;
      while ((m2 = re2.exec(txt))) {
        const abre = m2.index + m2[0].length;
        if (ehFolha(m2.index)) continue;
        let d = 1, k = abre, aspa = null;
        while (k < txt.length && d > 0) {
          const c = txt[k];
          if (aspa) { if (c === '\\') k++; else if (c === aspa) aspa = null; }
          else if (c === '"' || c === "'" || c === '`') aspa = c;
          else if (c === '{') d++;
          else if (c === '}') d--;
          if (d === 0) break;
          k++;
        }
        if (d !== 0) continue;
        const expr = txt.slice(abre, k);
        if (expr.indexOf('_spCor') !== -1) continue;
        if (/^[^;]{0,30}!important/.test(txt.slice(k + 1, k + 50))) continue;
        saida += txt.slice(ult, m2.index) + m2[1] + m2[2] +
          '${window._spCor(' + expr + ', \'' + m2[1] + '\')}';
        ult = k + 1;
        rel.dinamico++; 
      }
      return saida + txt.slice(ult);
    })(s);

    // 4) a TARJA de leitura ganha o marcador que a linha única procura
    if (s.indexOf(TARJA) !== -1 || s.indexOf(TARJA2) !== -1) {
      const antesT = s;
      s = s.split("'" + TARJA + "'").join("'var(--sp-tarja," + TARJA + ")'");
      s = s.split("'" + TARJA2 + "'").join("'var(" + MARCA2 + "," + TARJA2 + ")'");
      if (s !== antesT) rel.tarja++;
    }

  return s;
}

function contexto() {
  const g = gerar();
  const ancorados = new Set();
  /* ⛔ REMAP IDENTIDADE NÃO VIRA TOKEN. Havia regras cujo destino no claro é a PRÓPRIA cor
   * (`color:var(--text-muted)` -> `var(--text-muted)`): elas existem por organização, não
   * mudam nada. Tokenizá-las inchava 800+ pontos do código sem alterar um pixel — peso no
   * caminho que estamos justamente aliviando. */
  const identidade = new Set();
  [...g.r.ancoradas.values()].forEach((e) => {
    const alvo = [...(e.temas.light || [])][0];
    if (alvo && canon(alvo) === canon(e.cor)) { identidade.add(e.prop + '|' + canon(e.cor)); return; }
    ancorados.add(e.prop + '|' + canon(e.cor));
  });
  /* ⛔ O FILTRO TEM QUE MORAR ONDE A DECISÃO MORA. Ele estava em `ancorados`, e o
   * casamento passou a ser por GRAFIA (`exatos`) — então não filtrava nada: 863 pontos
   * viraram `var(--sp-c-var-text-muted-…, var(--text-muted))`, um token que devolve
   * exatamente o que já estava lá. Aqui as grafias de remap-identidade saem do conjunto. */
  const exatos = new Set();
  g.r.literaisExatos.forEach((lit) => {
    const m = lit.match(/^([a-z-]+):\s*(.+)$/);
    if (m && identidade.has(m[1] + '|' + canon(m[2].trim()))) return;
    exatos.add(lit);
  });
  const bordas = new Set([...g.r.nuas.values()].map((e) => canon(e.cor)));
  return { ancorados, bordas, exatos, g };
}

/* O ARQUIVO MIGRADO SE DEFENDE SOZINHO.
 *
 * As views chamam `window._spCor(cor, prop)`, que vive em js/paleta-tabela.js — carregado
 * primeiro no index.html. Mas os TESTES carregam view por view, cada um com seu sandbox
 * feito à mão, e nenhum conhece a paleta: 32 das 480 suítes morriam com
 * `window._spCor is not a function`.
 *
 * ⛔ Remendar os 32 sandboxes conserta hoje e quebra na próxima suíte que alguém escrever.
 * Esta linha instala um fallback IDENTIDADE quando a tabela não está presente — o que
 * devolve exatamente o comportamento anterior à migração, que é o que o teste espera.
 * No navegador é no-op: a paleta real já está lá (e ela atribui sem condição, então vence
 * em qualquer ordem de carga).
 */
const GUARDA = "/* tabela de cor ausente (teste headless) => devolve a cor crua, como antes da 2.0.94 */\n" +
  "if (typeof window !== 'undefined' && !window._spCor) window._spCor = function (c) { return c; };\n";
function comGuarda(txt) {
  if (txt.indexOf('!window._spCor') !== -1) return txt;
  if (txt.indexOf('window._spCor(') === -1) return txt;
  return GUARDA + txt;
}

function migrar() {
  const ctx = contexto();

  const alvos = arquivos(path.join(ROOT, 'js'), /\.js$/).concat([path.join(ROOT, 'index.html')]);
  const rel = { ancorado: 0, borda: 0, tarja: 0, dinamico: 0, foraDeAttr: 0, jaFeito: 0, maiuscula: 0, grafia: 0, importante: 0, porArq: {} };

  alvos.forEach((f) => {
    const orig = fs.readFileSync(f, 'utf8');
    let s = migrarTexto(orig, ctx, rel);
    if (s !== orig) {
      s = comGuarda(s);
      rel.porArq[path.relative(ROOT, f)] = (rel.porArq[path.relative(ROOT, f)] || 0) + 1;
      if (ESCREVE) fs.writeFileSync(f, s);
    }
  });
  rel.desbalanceados = [];
  return rel;
}

module.exports = { migrar, migrarTexto, contexto, classificador, regioesStyle, literaisDe, dentroDeStyleAttr };

if (require.main === module) {
  const r = migrar();
  console.log((ESCREVE ? 'MIGRADO' : 'SIMULACAO (nada escrito)') + ':');
  console.log('  declaracoes ancoradas (color/background) ... ' + r.ancorado);
  console.log('  bordas (solid rgba) ....................... ' + r.borda);
  console.log('  cores DINAMICAS (\'color:\' + x) ............. ' + r.dinamico);
  console.log('  arquivos com a tarja marcada .............. ' + r.tarja);
  console.log('  em FOLHA de estilo (corretamente fora) ..... ' + r.foraDeAttr);
  console.log('  hex em MAIUSCULA (nunca foi remapeado) ..... ' + r.maiuscula);
  console.log('  GRAFIA que a regra nao casava ............. ' + r.grafia);
  console.log('  com !important em linha (era imune) ....... ' + r.importante);
  if (r.desbalanceados.length) {
    console.log('');
    console.log('  ⚠️ arquivos com chaves desbalanceadas em string (palpite nao vale):');
    r.desbalanceados.forEach((x) => console.log('       ' + x));
  }
  console.log('');
  console.log('  arquivos tocados: ' + Object.keys(r.porArq).length);
  Object.entries(r.porArq).sort((a, b) => b[1] - a[1]).slice(0, 14)
    .forEach(([f, n]) => console.log('    ' + String(n).padStart(4) + '  ' + f));
}
