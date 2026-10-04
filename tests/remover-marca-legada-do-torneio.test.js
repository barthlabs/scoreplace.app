/* REMOÇÃO DE MARCA NÃO PODE RESSUSCITAR BASE64 LEGADO
 *
 * A tela manda `coverUrl: ''` quando o organizador remove a capa. O documento antigo
 * pode ainda conter `coverPhotoData`; se a Function só apagar a URL, o acessor visual
 * cai no base64 e a capa reaparece. Esta trava exige a limpeza dos dois lados.
 */
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync('functions-autodraw/index.js', 'utf8');
const client = fs.readFileSync('js/store.js', 'utf8');
const organizer = fs.readFileSync('js/views/tournaments-organizer.js', 'utf8');
let fail = 0;
function ok(value, message) { if (value) console.log('✓ ' + message); else { fail++; console.error('✗ ' + message); } }

ok(/const removesLegacyBranding = \(patch\.coverUrl === '' && !!\(t\.coverUrl \|\| t\.coverPhotoData\)\)/.test(source),
  'URL vazia de capa é tratada como alteração quando ainda existe marca legada');
ok(/key === 'coverUrl' && patch\[key\] === ''[\s\S]*?delete t\.coverUrl;[\s\S]*?delete t\.coverPhotoData;/.test(source),
  'remover capa apaga URL e base64 legado no documento canônico');
ok(/key === 'logoUrl' && patch\[key\] === ''[\s\S]*?delete t\.logoUrl;[\s\S]*?delete t\.logoData;/.test(source),
  'o mesmo contrato vale para logo, evitando a mesma regressão');
ok(/pair\[0\] === 'coverPhotoData' \|\| pair\[0\] === 'logoData'\)[\s\S]*?Object\.prototype\.hasOwnProperty\.call\(data, pair\[0\]\)[\s\S]*?_editPatch\[pair\[1\]\] = ''/.test(client),
  'capa e logo vazios no formulário mandam remoção mesmo quando o cache local não traz a URL');
ok(/'coverMode','coverColor','coverGradientColor','coverGradientEnabled','coverGradientAngle'/.test(source),
  'a Function aceita a configuração declarativa de fundo, sem abrir campos livres');

// Executa o núcleo REAL que decide foto × cor. Não basta procurar texto: este é o
// contrato que impede uma URL velha de ressuscitar depois que o organizador escolhe cor.
const start = client.indexOf('window._tourLogoSrc = function');
const end = client.indexOf('// ─── SUBIR IMAGEM PRO STORAGE', start);
const sandbox = { window: {} };
try { vm.runInNewContext(client.slice(start, end), sandbox); } catch (err) { fail++; console.error('✗ núcleo de fundo não executou: ' + err.message); }
const bg = sandbox.window._tournamentCoverBackground;
ok(!!bg && sandbox.window._tourUsesCoverPhoto({ coverUrl: 'https://img', coverMode: 'color' }) === false,
  'modo cor vence URL velha de capa — ela não pode reaparecer');
const gradient = bg && bg({ coverMode: 'color', coverColor: '#123456', coverGradientColor: '#abcdef', coverGradientEnabled: true, coverGradientAngle: 271 });
ok(gradient && gradient.css === 'linear-gradient(271deg, #123456, #abcdef)',
  'as duas cores e os 360° do gradiente chegam à renderização canônica');
ok(/coverPhotoData:[\s\S]*?coverMode:[\s\S]*?coverColor:[\s\S]*?coverGradientColor:[\s\S]*?coverGradientEnabled:[\s\S]*?coverGradientAngle:/.test(organizer),
  'clonar torneio preserva foto ou cor/gradiente, não só o logo');
const creator = fs.readFileSync('js/views/create-tournament.js', 'utf8');
ok(/id="cover-hue-wheel"/.test(creator) && /window\._pickCoverHue/.test(creator),
  'a escolha de cor oferece roda visual, não só controles lineares');
ok(/id="cover-angle-wheel"/.test(creator) && /window\._pickCoverAngle/.test(creator) && /_coverPointAngle/.test(creator),
  'a direção do gradiente é uma roda 360° e mantém o valor numérico exato');
ok(/function _startCoverWheelDrag[\s\S]*?setPointerCapture[\s\S]*?pointermove[\s\S]*?pointerup/.test(creator) && /_startCoverWheelDrag\(event, wheel/.test(creator),
  'as duas rodas aceitam clique e arrasto contínuo, inclusive fora da borda da roda');
process.exit(fail ? 1 : 0);
