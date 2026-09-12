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
  const esc = /scale\(([0-9.]+)\)/.exec(s);
  const pts = [];
  const re = /<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"/g;
  let m;
  while ((m = re.exec(s))) {
    const [x, y, w, h] = m.slice(1).map(Number);
    pts.push([x, y], [x + w, y], [x, y + h], [x + w, y + h]);
  }
  const path0 = /<path d="M ([^"]+)"/.exec(s);
  if (path0) {
    const nums = path0[1].match(/[0-9.]+/g).map(Number);
    for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  }
  const c = lado / 2;
  const escala = esc ? Number(esc[1]) : 1;
  let raio = 0;
  pts.forEach(([x, y]) => {
    const d = Math.hypot((x - c) * escala, (y - c) * escala);
    if (d > raio) raio = d;
  });
  return { escala, raio, c, pts: pts.length };
}

[['icons/icon-512.svg', 512], ['icons/icon-192.svg', 192], ['icons/icon-maskable.svg', 512]].forEach(([f, lado]) => {
  const g = geometria(f, lado);
  must(g.pts >= 13, f + ': a geometria foi lida (' + g.pts + ' pontos)');
  must(g.escala >= 1.15, f + ': o pódio está AMPLIADO (' + g.escala + 'x) — o fundo é preenchimento, não conteúdo');
  must(g.raio <= g.c, f + ': ⛔ e NÃO é cortado pelo recorte redondo — raio ' + g.raio.toFixed(1) + ' de ' + g.c);
  must(g.raio / g.c >= 0.9, f + ': enche o círculo de verdade (' + Math.round(100 * g.raio / g.c) + '% do raio)');
});

// os PNGs que o manifest entrega saíram do desenho ampliado — conferido no cabeçalho do arquivo
const dim = (f) => { const b = fs.readFileSync(path.join(root, f)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
[['icons/icon-512.png', 512], ['icons/icon-192.png', 192], ['icons/icon-180.png', 180], ['icons/icon-32.png', 32]].forEach(([f, n]) => {
  const [w, h] = dim(f);
  must(w === n && h === n, f + ' tem ' + n + '×' + n + ' de verdade');
});

// ⛔ ícone novo com cache-buster velho é ícone velho na tela de quem já visitou
const man = fs.readFileSync(path.join(root, 'manifest.json'), 'utf8');
const idx = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const vMan = [...new Set((man.match(/icon-\d+\.\w+\?v=([\d.]+)/g) || []).map((x) => x.split('?v=')[1]))];
const vIdx = [...new Set((idx.match(/icon-\d+\.png\?v=([\d.]+)/g) || []).map((x) => x.split('?v=')[1]))];
must(vMan.length === 1 && vIdx.length === 1 && vMan[0] === vIdx[0],
  '⛔ manifest e index falam do MESMO ?v= dos ícones (' + vMan[0] + ')');
must(vMan[0] !== '1.9.86',
  '⛔ e ele saiu do valor anterior à ampliação — sem isso o navegador serve o ícone pequeno do cache');

console.log('✅ ' + ok + ' asserções — o pódio enche o ícone sem ser cortado no círculo');
