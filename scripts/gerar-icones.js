/* GERADOR ÚNICO DOS ÍCONES — uma fonte, uma regra por destino, e ele CONFERE o que gravou.
 *
 * ⛔ POR QUE EXISTE. Em 13/set/2026 o dono mandou "adote esse novo padrão em todo o app",
 * depois de o ícone da web ser corrigido. MEDIDO então, no pixel de cada arquivo:
 *     web  icon-512.png ............ 78%   (já corrigido)
 *     android ic_launcher .......... 50%
 *     android ic_launcher_round .... 54%
 *     iOS AppIcon .................. 54%
 *     Watch AppIcon ................ 54%
 * Ou seja: o conserto da web NÃO alcançava o nativo, e cada família tinha derivado por conta
 * própria porque cada uma foi gerada à mão, uma vez, há muito tempo.
 *
 * ⭐ A REGRA DE CADA DESTINO É DIFERENTE, e é por isso que "copiar o mesmo PNG" não serve:
 *   • web / iOS / Watch / launcher legado → o desenho enche o quadro (78%) e nenhum ponto
 *     sai do círculo inscrito. É o mesmo recorte redondo que o atalho aplica.
 *   • Android ADAPTATIVO (`ic_launcher_foreground`) → a tela só garante o círculo CENTRAL de
 *     72dp num quadro de 108dp (66,7%). O pódio enche ESSE círculo, e o quadro em volta fica
 *     transparente de propósito — é margem do sistema, não desperdício nosso.
 *
 * ⛔ ELE SE RECUSA A GRAVAR ÍCONE RUIM. Depois de renderizar, mede o PNG e falha se o desenho
 * não encher o esperado ou se algum pixel sair do círculo. Foi exatamente um portão que
 * MEDIA O ARQUIVO ERRADO que deixou o ícone pequeno passar verde por semanas.
 * [[feedback_medir_com_dado_real_antes_de_teorizar]]
 *
 * Uso:  node scripts/gerar-icones.js            (ensaio: mede o que existe hoje)
 *       node scripts/gerar-icones.js --apply    (regenera tudo e confere)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const APLICAR = process.argv.includes('--apply');
const FONTE = path.join(ROOT, 'icons/icon-512.svg');

// ── a fonte, partida em fundo e pódio ───────────────────────────────────────
const svg = fs.readFileSync(FONTE, 'utf8');
const DEFS = /<defs>[\s\S]*?<\/defs>/.exec(svg)[0];
const FUNDO = /<rect width="512" height="512" fill="url\(#bg\)"\/>/.exec(svg)[0];
const iG = svg.indexOf('<g transform=');
const PODIO = svg.slice(iG, svg.lastIndexOf('</g>') + 4);

/** SVG completo (fundo + pódio) num lado qualquer. */
function svgCheio(lado) {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="' + lado +
    '" height="' + lado + '">' + DEFS + FUNDO + PODIO + '</svg>';
}
/** Só o pódio, fundo TRANSPARENTE, ocupando `fracao` do quadro (Android adaptativo). */
function svgSoPodio(lado, fracao) {
  const e = fracao, d = 512 * (1 - e) / 2;
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="' + lado +
    '" height="' + lado + '"><g transform="translate(' + d + ',' + d + ') scale(' + e + ')">' +
    PODIO + '</g></svg>';
}
/** Só o fundo (Android adaptativo desenha fundo e frente em camadas separadas). */
function svgSoFundo(lado) {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="' + lado +
    '" height="' + lado + '">' + DEFS + FUNDO + '</svg>';
}

function render(conteudo, destino, lado) {
  const tmp = path.join(os.tmpdir(), 'sp-icone-' + process.pid + '.svg');
  fs.writeFileSync(tmp, conteudo);
  execFileSync('rsvg-convert', ['-w', String(lado), '-h', String(lado), tmp, '-o', path.join(ROOT, destino)]);
  fs.unlinkSync(tmp);
}

// ── a medida: decodifica o PNG e olha o desenho, não o cabeçalho ────────────
function desenho(arquivo) {
  const d = fs.readFileSync(path.join(ROOT, arquivo));
  const w = d.readUInt32BE(16), h = d.readUInt32BE(20), tipo = d[25];
  const canais = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[tipo];
  let i = 8; const partes = [];
  while (i < d.length) {
    const ln = d.readUInt32BE(i);
    if (d.toString('ascii', i + 4, i + 8) === 'IDAT') partes.push(d.slice(i + 8, i + 8 + ln));
    i += 12 + ln;
  }
  const px = zlib.inflateSync(Buffer.concat(partes));
  const passo = w * canais; let prev = Buffer.alloc(passo); let pos = 0;
  let x0 = w, y0 = h, x1 = -1, y1 = -1, fora = 0, total = 0;
  const c = w / 2, R = w / 2;
  for (let y = 0; y < h; y++) {
    const f = px[pos++]; const linha = Buffer.from(px.slice(pos, pos + passo)); pos += passo;
    for (let x = 0; x < passo; x++) {
      const a = x >= canais ? linha[x - canais] : 0, b = prev[x], cc = x >= canais ? prev[x - canais] : 0;
      if (f === 1) linha[x] = (linha[x] + a) & 255;
      else if (f === 2) linha[x] = (linha[x] + b) & 255;
      else if (f === 3) linha[x] = (linha[x] + ((a + b) >> 1)) & 255;
      else if (f === 4) {
        const pp = a + b - cc, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - cc);
        linha[x] = (linha[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : cc)) & 255;
      }
    }
    for (let x = 0; x < w; x++) {
      if ((canais === 2 || canais === 4) && linha[x * canais + canais - 1] < 16) continue;
      const r0 = linha[x * canais], g0 = canais >= 3 ? linha[x * canais + 1] : r0, b0 = canais >= 3 ? linha[x * canais + 2] : r0;
      if ((r0 * 299 + g0 * 587 + b0 * 114) / 1000 <= 110) continue;
      total++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (Math.hypot(x + 0.5 - c, y + 0.5 - c) > R) fora++;
    }
    prev = linha;
  }
  return { w, h, total, fora, canais, largura: x1 < 0 ? 0 : (x1 - x0 + 1) / w };
}

// ── o catálogo: destino, lado, o que desenhar, e quanto se espera ───────────
const ANDROID = [['ldpi', 36, 81], ['mdpi', 48, 108], ['hdpi', 72, 162],
                 ['xhdpi', 96, 216], ['xxhdpi', 144, 324], ['xxxhdpi', 192, 432]];
const SAFE_ADAPTATIVO = 72 / 108;   // o círculo que a tela garante no ícone adaptativo

const alvos = [];
[['icons/icon-512.png', 512], ['icons/icon-192.png', 192], ['icons/icon-180.png', 180],
 ['icons/icon-32.png', 32], ['icons/icon-16.png', 16]].forEach(([f, n]) =>
  alvos.push({ f, n, tipo: 'cheio', minimo: n >= 32 ? 0.74 : 0.6 }));

ANDROID.forEach(([dpi, legado, adapt]) => {
  const base = 'android/app/src/main/res/mipmap-' + dpi + '/';
  alvos.push({ f: base + 'ic_launcher.png', n: legado, tipo: 'cheio', minimo: legado >= 48 ? 0.74 : 0.6 });
  alvos.push({ f: base + 'ic_launcher_round.png', n: legado, tipo: 'cheio', minimo: legado >= 48 ? 0.74 : 0.6 });
  // ⚠️ o adaptativo enche o círculo CENTRAL de 72/108 — o resto do quadro é margem do sistema
  alvos.push({ f: base + 'ic_launcher_foreground.png', n: adapt, tipo: 'podio', minimo: 0.45 });
  alvos.push({ f: base + 'ic_launcher_background.png', n: adapt, tipo: 'fundo', minimo: 0 });
});

alvos.push({ f: 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', n: 1024, tipo: 'cheio', minimo: 0.74 });
alvos.push({ f: 'ios/App/Watch/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png', n: 1024, tipo: 'cheio', minimo: 0.74 });

/* ── favicon.ico TAMBÉM SAI DAQUI (18/set/2026) ─────────────────────────────────────────
 * Relato do dono: _"o favicon parece que nunca foi mudado e continua naquela versão antiga
 * pequena"_. Ele estava certo por DOIS motivos, os dois medidos:
 *   • `favicon.ico` na raiz não estava no catálogo — ficou na 1,25x de 12/set enquanto
 *     todos os PNGs passaram por 1,432 e agora 1,375;
 *   • os <link rel="icon"> do index.html estavam com `?v=2.3.1` desde a 2.3.1 — o navegador
 *     seguia servindo o PNG velho do cache. A trava de cache-buster só olhava JS/CSS.
 * O .ico é montado com Pillow a partir dos PNGs que este script acabou de renderizar E
 * medir (16/32 + um 48 renderizado aqui), então não tem como divergir deles. */
function gerarFavicon() {
  const tmp48 = path.join(os.tmpdir(), 'sp-icone-48-' + process.pid + '.png');
  const tmpSvg = path.join(os.tmpdir(), 'sp-icone-48-' + process.pid + '.svg');
  fs.writeFileSync(tmpSvg, svgCheio(48));
  execFileSync('rsvg-convert', ['-w', '48', '-h', '48', tmpSvg, '-o', tmp48]);
  const py = [
    'from PIL import Image',
    'import sys',
    // ⚠️ o Pillow DESCARTA tamanhos maiores que a imagem-base: com o 16 na frente saía um
    // .ico de 1 imagem só (medido). A base é o MAIOR; os menores vêm por append_images.
    'imgs=sorted([Image.open(p).convert("RGBA") for p in sys.argv[2:]], key=lambda i: -i.width)',
    'imgs[0].save(sys.argv[1], format="ICO", sizes=[(i.width,i.height) for i in imgs], append_images=imgs[1:])',
  ].join('\n');
  execFileSync('python3', ['-c', py, path.join(ROOT, 'favicon.ico'),
    path.join(ROOT, 'icons/icon-16.png'), path.join(ROOT, 'icons/icon-32.png'), tmp48]);
  fs.unlinkSync(tmpSvg); fs.unlinkSync(tmp48);
  const ico = fs.readFileSync(path.join(ROOT, 'favicon.ico'));
  const qtd = ico.readUInt16LE(4);
  if (ico.readUInt16LE(2) !== 1 || qtd !== 3) throw new Error('favicon.ico inválido: ' + qtd + ' imagens');
  console.log('  ✓ favicon.ico                                              3 tamanhos (16/32/48), dos PNGs medidos');
}

let ruins = 0;
console.log((APLICAR ? '▸ REGERANDO' : '▸ ENSAIO — medindo o que existe hoje') + '\n');
if (APLICAR) gerarFavicon();
for (const a of alvos) {
  if (!fs.existsSync(path.join(ROOT, a.f))) { console.log('  (não existe) ' + a.f); continue; }
  if (APLICAR) {
    const conteudo = a.tipo === 'cheio' ? svgCheio(a.n)
      : a.tipo === 'podio' ? svgSoPodio(a.n, SAFE_ADAPTATIVO) : svgSoFundo(a.n);
    render(conteudo, a.f, a.n);
  }
  const g = desenho(a.f);
  const okTam = g.w === a.n && g.h === a.n;
  const okEnche = a.tipo === 'fundo' ? true : g.largura >= a.minimo;
  // ⛔ o corte redondo só vale para quem é desenhado no quadro inteiro; o adaptativo tem o
  // próprio círculo, menor, e é a fração acima que o garante.
  const okCorte = a.tipo === 'cheio' ? g.fora === 0 : true;
  /* ⛔ ALFA: a Apple RECUSA ícone de app com transparência, e o adaptativo do Android EXIGE
   * — a frente tem de flutuar sobre o fundo que o sistema desenha. São regras opostas, e
   * errar qualquer uma das duas só aparece na submissão ou no aparelho. */
  const precisaAlfa = a.tipo === 'podio';
  const temAlfa = g.canais === 2 || g.canais === 4;
  const okAlfa = precisaAlfa ? temAlfa : !temAlfa;
  const bom = okTam && okEnche && okCorte && okAlfa;
  if (!bom) ruins++;
  console.log('  ' + (bom ? '✓' : '✗') + ' ' + a.f.padEnd(58) +
    g.w + 'x' + g.h + '  desenho ' + Math.round(100 * g.largura) + '%' +
    (a.tipo === 'cheio' ? '  fora do círculo: ' + g.fora : '  (adaptativo/fundo)') +
    (okAlfa ? '' : '  ⛔ ALFA ' + (precisaAlfa ? 'FALTANDO' : 'INDEVIDO')));
}
console.log('');
if (!APLICAR) { console.log('(ENSAIO — nada gravado. Rode com --apply)'); process.exit(ruins ? 1 : 0); }
if (ruins) { console.error('✗ ' + ruins + ' ícone(s) não passaram na medida — NÃO confie nesta rodada.'); process.exit(1); }
console.log('✅ todos os ícones regerados e conferidos no pixel.');
