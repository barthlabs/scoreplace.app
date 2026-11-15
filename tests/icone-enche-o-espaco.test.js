'use strict';
/* O favicon maximiza o pódio/estrela sem distorcer nem cortar. Os ícones de
 * instalação mantêm a arte oficial e sua área segura para máscaras do sistema. */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file));
const favicon = read('icons/favicon.svg').toString();
const source = read('icons/logo-podium.svg').toString();
const match = /transform="translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)"/.exec(favicon);
assert.ok(match, 'favicon usa um único transform uniforme');
const [, tx, ty, scale] = match.map(Number);
assert.ok(scale >= 0.2, 'pódio/estrela ampliados no favicon');
const rects = [...source.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"/g)];
const star = /<polygon points="([\d, ]+)"/.exec(source);
assert.equal(rects.length, 3, 'três degraus no símbolo');
assert.ok(star, 'estrela no símbolo');
const points = [];
for (const m of rects) {
  const [x,y,w,h] = m.slice(1).map(Number);
  points.push([x,y],[x+w,y+h]);
}
for (const xy of star[1].split(' ')) points.push(xy.split(',').map(Number));
const xs=points.map(([x])=>tx+x*scale), ys=points.map(([,y])=>ty+y*scale);
assert.ok(Math.min(...xs)>=0.9 && Math.max(...xs)<=63.1 && Math.min(...ys)>=0.9 && Math.max(...ys)<=63.1,
  'pódio/estrela cabem no favicon com cerca de 1 px de margem');
assert.ok((Math.max(...xs)-Math.min(...xs))/64 >= 0.85, 'pódio ocupa ao menos 85% da largura');
for (const [file,expected] of [['icons/icon-192.png',192],['icons/icon-512.png',512],['icons/icon-maskable-512.png',512]]) {
  const data=read(file); assert.equal(data.readUInt32BE(16),expected,file+' largura');
  assert.equal(data.readUInt32BE(20),expected,file+' altura');
}
assert.equal(read('favicon.ico').compare(read('icons/favicon.ico')),0,'favicon da raiz é o mesmo asset novo');
const manifest=JSON.parse(read('manifest.json').toString());
assert.ok(manifest.icons.some(icon=>icon.purpose==='maskable' && icon.src.includes('icon-maskable-512.png')),
  'manifest aponta para ícone seguro para máscara');
console.log('✓ favicon maximizado, íntegro e consistente com os ícones de instalação');
