'use strict';
/* ⛔ O PÓDIO ENCHE O ÍCONE — E NÃO É CORTADO PELO RECORTE REDONDO.
 * Ordem do dono (12/set/2026, print do Chrome com o atalho ao lado de instagram e youtube):
 * _"nosso ícone é pequeno em relação aos demais. a parte azul não conta; é preenchimento. o
 * que conta é o pódio com as barras e a estrela. devem encher o espaço sem cortar nos cantos"_.
 *
 * As duas metades da ordem brigam entre si, e é por isso que este teste existe: crescer é fácil,
 * crescer SEM SER CORTADO é que é a conta. O atalho recorta em CÍRCULO, então o limite não é o
 * lado do quadrado — é o raio. Os pontos mais distantes do centro são os cantos INFERIORES do
 * pódio (prata e bronze), a 204,6 de um raio de 256: acima de 1,251x eles passam da borda.
 * Aqui se afirma que o desenho está ampliado E que continua dentro do círculo, medido pela
 * geometria do próprio SVG. [[feedback_medir_com_dado_real_antes_de_teorizar]]
 */
const assert = require('assert/strict'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
let ok = 0; const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };

function geometria(arquivo, lado) {
  const s = fs.readFileSync(path.join(root, arquivo), 'utf8');
  /* ⛔ LER O `transform` DE VERDADE, não `scale(` em qualquer lugar do arquivo. O regex solto
   * casava com a palavra dentro de um COMENTÁRIO — eu mesmo escrevi um que citava a escala
   * antiga e o portão passou a medir o texto em vez do desenho. E ele ignorava o
   * `translate`, que é justamente o que esta leva mudou. */
  const tr = /<g transform="translate\(([-0-9.]+),([-0-9.]+)\) scale\(([0-9.]+)\) translate\(([-0-9.]+),([-0-9.]+)\)"/.exec(s);
  assert.ok(tr, arquivo + ': não achei o transform do grupo');
  const esc = [null, tr[3]];
  const cx = Number(tr[1]), cy = Number(tr[2]);
  const pts = [];
  /* ⛔ CANTO ARREDONDADO NÃO É CANTO QUADRADO. Esta conta usava (x,y), (x+w,y)… cruas e
   * dava o pódio como CORTADO (raio 263,6 de 256) quando a medição no PIXEL do PNG diz
   * 255,6 e ZERO pixel fora. As barras têm `rx`, e o ponto extremo de um canto arredondado
   * fica a rx/√2 para dentro em cada eixo. A conta pessimista reprovaria um ícone correto —
   * que é tão ruim quanto aprovar um errado. */
  const re = /<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"[^>]*rx="(\d+)"/g;
  let m;
  while ((m = re.exec(s))) {
    const [x, y, w, h, rx] = m.slice(1).map(Number);
    const d = rx / Math.SQRT2;
    pts.push([x + rx - d, y + rx - d], [x + w - rx + d, y + rx - d],
             [x + rx - d, y + h - rx + d], [x + w - rx + d, y + h - rx + d]);
  }
  const path0 = /<path d="M ([^"]+)"/.exec(s);
  if (path0) {
    const nums = path0[1].match(/[0-9.]+/g).map(Number);
    for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  }
  const c = lado / 2;
  const escala = Number(esc[1]);
  let raio = 0;
  // o grupo escala em torno de (lado/2, lado/2) e é POSICIONADO em (cx, cy) — subir o
  // conjunto é mexer em `cy`, e é isso que permite crescer sem sair do círculo.
  pts.forEach(([x, y]) => {
    const px = cx + (x - c) * escala;
    const py = cy + (y - c) * escala;
    const d = Math.hypot(px - c, py - c);
    if (d > raio) raio = d;
  });
  return { escala, raio, c, pts: pts.length, subiu: c - cy };
}

[['icons/icon-512.svg', 512], ['icons/icon-192.svg', 192], ['icons/icon-maskable.svg', 512]].forEach(([f, lado]) => {
  const g = geometria(f, lado);
  must(g.pts >= 13, f + ': a geometria foi lida (' + g.pts + ' pontos)');
  must(g.escala >= 1.40, f + ': o pódio está AMPLIADO (' + g.escala + 'x) — o fundo é preenchimento, não conteúdo');
  must(g.subiu > 0, f + ': ⭐ e o conjunto SOBE ' + g.subiu.toFixed(1) + 'px — foi subir que permitiu crescer sem cortar');
  must(g.raio <= g.c, f + ': ⛔ e NÃO é cortado pelo recorte redondo — raio ' + g.raio.toFixed(1) + ' de ' + g.c);
  must(g.raio / g.c >= 0.9, f + ': enche o círculo de verdade (' + Math.round(100 * g.raio / g.c) + '% do raio)');
});

/* ⛔ ESTE PORTÃO MEDIA O ARQUIVO ERRADO — e por isso deu VERDE com a tela errada.
 * Ele conferia a geometria do SVG e, do PNG, só o CABEÇALHO (largura × altura). O navegador
 * serve o PNG, e o desenho DENTRO dele continuava pequeno: relato do dono em 13/set/2026,
 * com o conserto anterior já no ar — _"o nosso icone continua ridiculamente pequeno aqui"_.
 * MEDIDO então, no pixel: o pódio ocupava 68% da largura.
 * ⭐ Agora o portão DECODIFICA o PNG e mede o desenho. É a diferença entre afirmar que o
 * conserto saiu e conferir o que de fato é entregue.
 * [[feedback_unify_dual_entry_points]] · [[feedback_medir_com_dado_real_antes_de_teorizar]] */
const zlib = require('zlib');
function pixels(arquivo) {
  const d = fs.readFileSync(path.join(root, arquivo));
  const w = d.readUInt32BE(16), h = d.readUInt32BE(20), tipo = d[25];
  const canais = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[tipo];
  let i = 8; const partes = [];
  while (i < d.length) {
    const ln = d.readUInt32BE(i); const tp = d.toString('ascii', i + 4, i + 8);
    if (tp === 'IDAT') partes.push(d.slice(i + 8, i + 8 + ln));
    i += 12 + ln;
  }
  const px = zlib.inflateSync(Buffer.concat(partes));
  const passo = w * canais; let prev = Buffer.alloc(passo); const linhas = []; let pos = 0;
  for (let y = 0; y < h; y++) {
    const f = px[pos++]; const linha = Buffer.from(px.slice(pos, pos + passo)); pos += passo;
    for (let x = 0; x < passo; x++) {
      const a = x >= canais ? linha[x - canais] : 0, b = prev[x], c = x >= canais ? prev[x - canais] : 0;
      if (f === 1) linha[x] = (linha[x] + a) & 255;
      else if (f === 2) linha[x] = (linha[x] + b) & 255;
      else if (f === 3) linha[x] = (linha[x] + ((a + b) >> 1)) & 255;
      else if (f === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        linha[x] = (linha[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    }
    linhas.push(linha); prev = linha;
  }
  return { w, h, canais, linhas };
}
/* O fundo é azul-escuro em degradê e o pódio é claro: o brilho separa os dois sem depender
 * de cor exata. `> 110` deixa o degradê (que não passa de ~62) inteiramente de fora. */
function desenho(arquivo) {
  const { w, h, canais, linhas } = pixels(arquivo);
  let x0 = w, y0 = h, x1 = -1, y1 = -1, fora = 0, total = 0;
  const c = w / 2, R = w / 2;
  for (let y = 0; y < h; y++) {
    const r = linhas[y];
    for (let x = 0; x < w; x++) {
      const brilho = (r[x * canais] * 299 + r[x * canais + 1] * 587 + r[x * canais + 2] * 114) / 1000;
      if (brilho <= 110) continue;
      total++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (Math.hypot(x + 0.5 - c, y + 0.5 - c) > R) fora++;
    }
  }
  return { w, h, largura: (x1 - x0 + 1) / w, altura: (y1 - y0 + 1) / h, fora, total };
}

[['icons/icon-512.png', 512], ['icons/icon-192.png', 192], ['icons/icon-180.png', 180], ['icons/icon-32.png', 32]].forEach(([f, n]) => {
  const g = desenho(f);
  must(g.w === n && g.h === n, f + ' tem ' + n + '×' + n + ' de verdade');
  must(g.total > 0, f + ': o desenho foi encontrado dentro do PNG (' + g.total + ' pixels)');
  must(g.largura >= 0.74,
    f + ': ⭐ o pódio ENCHE o quadro — ocupa ' + Math.round(100 * g.largura) + '% da largura (era 68%)');
  must(g.fora === 0,
    f + ': ⛔ e ZERO pixel fora do recorte redondo (achei ' + g.fora + ')');
});

// ⛔ ícone novo com cache-buster velho é ícone velho na tela de quem já visitou
const man = fs.readFileSync(path.join(root, 'manifest.json'), 'utf8');
const idx = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const vMan = [...new Set((man.match(/icon-\d+\.\w+\?v=([\d.]+)/g) || []).map((x) => x.split('?v=')[1]))];
const vIdx = [...new Set((idx.match(/icon-\d+\.png\?v=([\d.]+)/g) || []).map((x) => x.split('?v=')[1]))];
must(vMan.length === 1 && vIdx.length === 1 && vMan[0] === vIdx[0],
  '⛔ manifest e index falam do MESMO ?v= dos ícones (' + vMan[0] + ')');
must(vMan[0] !== '1.9.86' && vMan[0] !== '2.2.72',
  '⛔ e ele saiu dos valores anteriores às ampliações (1.9.86 e 2.2.72) — sem isso o navegador '
  + 'serve do cache o ícone pequeno, e o conserto não chega a quem já visitou');

console.log('✅ ' + ok + ' asserções — o pódio enche o ícone sem ser cortado no círculo');
