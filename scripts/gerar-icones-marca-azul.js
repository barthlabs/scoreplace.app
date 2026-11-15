#!/usr/bin/env node
/* Regenera os ícones da marca azul a partir do pódio oficial. `--apply` grava;
 * sem argumento, confere dimensões, área ocupada e ausência de cortes. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const apply = process.argv.includes('--apply');
const source = fs.readFileSync(path.join(root, 'icons/logo-podium.svg'), 'utf8');
const defs = source.match(/<defs>[\s\S]*?<\/defs>/)?.[0];
const rects = [...source.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"[^>]*\/>/g)];
const star = source.match(/<polygon points="([\d, ]+)"[^>]*\/>/);
if (!defs || rects.length !== 3 || !star) throw new Error('pódio oficial incompleto');
const art = rects.map((match) => match[0]).join('') + star[0];
const bg = '<rect width="512" height="512" fill="url(#azul)"/>' +
  '<rect width="512" height="512" fill="url(#luz)"/>';
const points = rects.flatMap((match) => {
  const [x, y, w, h] = match.slice(1, 5).map(Number);
  return [[x, y], [x + w, y], [x, y + h], [x + w, y + h]];
}).concat(star[1].split(' ').map((xy) => xy.split(',').map(Number)));

// Círculo mínimo do desenho: centro vertical próximo de 284. As escalas deixam
// ~10 px no ícone comum, ~5 px na zona segura do PWA e ~5 px na do Android.
const commonScale = 1.33;
const maskableScale = 1.08;
const androidScale = 0.82;
const fits = (scale, radius) => points.every(([x, y]) =>
  Math.hypot((x - 256) * scale, (y - 284) * scale) <= radius);
if (!fits(commonScale, 256) || !fits(maskableScale, 512 * 0.4) ||
    !fits(androidScale, 512 * 66 / 108 / 2)) {
  throw new Error('o pódio ultrapassa a máscara circular de algum destino');
}

function svg(size, scale, background = true) {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size +
    '" height="' + size + '" viewBox="0 0 512 512" role="img" ' +
    'aria-label="ScorePlace.app — símbolo do pódio"><title>ScorePlace.app — pódio</title>' + defs +
    (background ? bg : '') +
    '<g transform="translate(256 256) scale(' + scale + ') translate(-256 -284)">' +
    art + '</g></svg>';
}
function backgroundSvg(size) {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size +
    '" height="' + size + '" viewBox="0 0 512 512">' + defs + bg + '</svg>';
}
function render(content, dest, size) {
  const temp = path.join(os.tmpdir(), 'sp-brand-icon-' + process.pid + '.svg');
  fs.writeFileSync(temp, content);
  try {
    execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size), temp,
      '-o', path.join(root, dest)]);
  } finally { fs.rmSync(temp, { force: true }); }
}

const targets = [
  ['icons/icon-512.png', 512, 'common', 0.70],
  ['icons/icon-192.png', 192, 'common', 0.70],
  ['icons/icon-180.png', 180, 'common', 0.70],
  ['icons/icon-maskable-512.png', 512, 'maskable', 0.56],
  ['icons/icon-maskable-192.png', 192, 'maskable', 0.56],
  ['icons/icon-32.png', 32, 'favicon', 0.82],
  ['icons/icon-16.png', 16, 'favicon', 0.75],
  ['assets/icon.png', 1024, 'common', 0.70],
  ['ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', 1024, 'common', 0.70],
  ['ios/App/Watch/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png', 1024, 'common', 0.70],
];
for (const [dpi, legacy, adaptive] of [
  ['ldpi', 36, 81], ['mdpi', 48, 108], ['hdpi', 72, 162],
  ['xhdpi', 96, 216], ['xxhdpi', 144, 324], ['xxxhdpi', 192, 432],
]) {
  const base = 'android/app/src/main/res/mipmap-' + dpi + '/';
  targets.push([base + 'ic_launcher.png', legacy, 'common', 0.65]);
  targets.push([base + 'ic_launcher_round.png', legacy, 'common', 0.65]);
  targets.push([base + 'ic_launcher_foreground.png', adaptive, 'foreground', 0.42]);
  targets.push([base + 'ic_launcher_background.png', adaptive, 'background', 0]);
}

function analyze(file, radiusFraction) {
  const data = fs.readFileSync(path.join(root, file));
  const width = data.readUInt32BE(16), height = data.readUInt32BE(20);
  const channels = { 2: 3, 6: 4 }[data[25]];
  if (!channels) throw new Error(file + ': PNG deve ser RGB ou RGBA');
  const chunks = []; let offset = 8;
  while (offset < data.length) {
    const length = data.readUInt32BE(offset);
    if (data.toString('ascii', offset + 4, offset + 8) === 'IDAT')
      chunks.push(data.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const decoded = zlib.inflateSync(Buffer.concat(chunks));
  const stride = width * channels;
  let previous = Buffer.alloc(stride), position = 0;
  let left = width, right = -1, outside = 0, colored = 0;
  for (let y = 0; y < height; y++) {
    const filter = decoded[position++];
    const row = Buffer.from(decoded.subarray(position, position + stride));
    position += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? row[i - channels] : 0;
      const b = previous[i];
      const c = i >= channels ? previous[i - channels] : 0;
      if (filter === 1) row[i] = (row[i] + a) & 255;
      else if (filter === 2) row[i] = (row[i] + b) & 255;
      else if (filter === 3) row[i] = (row[i] + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const p = a + b - c;
        const da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c);
        row[i] = (row[i] + (da <= db && da <= dc ? a : db <= dc ? b : c)) & 255;
      } else if (filter !== 0) throw new Error(file + ': filtro PNG inválido');
    }
    for (let x = 0; x < width; x++) {
      const i = x * channels;
      if (channels === 4 && row[i + 3] < 16) continue;
      // O fundo azul tem R < 180. Prata, ouro e bronze têm R > 200.
      if (row[i] < 180) continue;
      colored++;
      if (x < left) left = x;
      if (x > right) right = x;
      if (radiusFraction && Math.hypot(x + 0.5 - width / 2, y + 0.5 - height / 2) >
          width * radiusFraction) outside++;
    }
    previous = row;
  }
  return { width, height, channels, colored, outside,
    fraction: right < left ? 0 : (right - left + 1) / width };
}

function faviconIco() {
  const temp = path.join(os.tmpdir(), 'sp-brand-ico-48-' + process.pid + '.png');
  try {
    execFileSync('rsvg-convert', ['-w', '48', '-h', '48',
      path.join(root, 'icons/favicon.svg'), '-o', temp]);
    const files = ['icons/icon-16.png', 'icons/icon-32.png'];
    const images = files.map((file) => fs.readFileSync(path.join(root, file)));
    images.push(fs.readFileSync(temp));
    const header = Buffer.alloc(6 + images.length * 16);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(images.length, 4);
    let position = header.length;
    images.forEach((image, i) => {
      const at = 6 + i * 16, size = image.readUInt32BE(16);
      header[at] = size; header[at + 1] = size;
      header.writeUInt16LE(1, at + 4); header.writeUInt16LE(32, at + 6);
      header.writeUInt32LE(image.length, at + 8);
      header.writeUInt32LE(position, at + 12);
      position += image.length;
    });
    const ico = Buffer.concat([header, ...images]);
    fs.writeFileSync(path.join(root, 'icons/favicon.ico'), ico);
    fs.writeFileSync(path.join(root, 'favicon.ico'), ico);
  } finally { fs.rmSync(temp, { force: true }); }
}

if (apply) {
  fs.writeFileSync(path.join(root, 'icons/icon-512.svg'), svg(512, commonScale));
  fs.writeFileSync(path.join(root, 'icons/icon-192.svg'), svg(192, commonScale));
  fs.writeFileSync(path.join(root, 'icons/icon-maskable.svg'), svg(512, maskableScale));
  for (const [file, size, kind] of targets) {
    const content = kind === 'favicon' ? fs.readFileSync(path.join(root, 'icons/favicon.svg'), 'utf8')
      : kind === 'background' ? backgroundSvg(size)
      : kind === 'foreground' ? svg(size, androidScale, false)
      : svg(size, kind === 'maskable' ? maskableScale : commonScale);
    render(content, file, size);
  }
  faviconIco();
}
let failures = 0;
for (const [file, size, kind, minimum] of targets) {
  const radius = kind === 'common' ? 0.5 : kind === 'maskable' ? 0.4
    : kind === 'foreground' ? 66 / 108 / 2 : 0;
  const result = analyze(file, radius);
  const okay = result.width === size && result.height === size &&
    (kind === 'background' || (result.fraction >= minimum && result.outside === 0)) &&
    ((kind === 'foreground' || kind === 'favicon')
      ? result.channels === 4 : result.channels === 3);
  if (!okay) failures++;
  console.log((okay ? '✓ ' : '✗ ') + file + ': ' + size + 'px, pódio ' +
    Math.round(result.fraction * 100) + '%, fora da máscara ' + result.outside);
}
if (!fs.readFileSync(path.join(root, 'favicon.ico')).equals(
  fs.readFileSync(path.join(root, 'icons/favicon.ico')))) {
  failures++; console.error('✗ favicon.ico da raiz diverge do arquivo em icons/');
}
if (failures) { console.error('✗ ' + failures + ' ícone(s) reprovado(s)'); process.exitCode = 1; }
else console.log('✓ ícones íntegros e dentro das áreas seguras');
