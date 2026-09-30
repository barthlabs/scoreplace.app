'use strict';
/* Regressão Paineiras/Confra: venue.logoUrl (Storage) precisa hidratar o mesmo
 * slot que antes aceitava apenas logoData legado, e o cabeçalho precisa manter a
 * assinatura do local menor, alinhada à base do logo do evento. */
const fs = require('fs');
let bad = 0;
function ok(value, label) { console.log((value ? '✓ ' : '✗ ') + label); if (!value) bad++; }

const store = fs.readFileSync('js/store.js', 'utf8');
const tournaments = fs.readFileSync('js/views/tournaments.js', 'utf8');
const main = fs.readFileSync('js/main.js', 'utf8');
const begin = store.indexOf('function _setupVenueLogos()');
const end = store.indexOf('// ─── (REMOVIDO', begin);
const loader = store.slice(begin, end);
const heroBegin = tournaments.indexOf('<!-- Middle Left: Nome + Logo + Favorito -->');
const heroEnd = tournaments.indexOf('/* v2.8.67:', heroBegin);
const hero = tournaments.slice(heroBegin, heroEnd);

ok(/window\._venueLogoSrc\s*=\s*function/.test(store), 'acessor canônico de logo do local existe no runtime');
ok(begin >= 0 && /_venueLogoSrc\s*\?\s*window\._venueLogoSrc\(v\)/.test(loader), 'logo do local lê logoUrl/Storage pelo acessor canônico');
ok(/window\._hydrateVenueLogos\s*=\s*function/.test(loader) && /querySelectorAll\('\[data-vlogo-pid\]/.test(loader), 'hidratador busca os slots de logo do local');
ok(/el\.style\.display\s*=\s*'block'/.test(loader), 'hidratador revela o slot ao receber a imagem');
ok(/data-vlogo-pid/.test(hero), 'cabeçalho do torneio tem slot para o logo do local');
ok(/display:flex;flex-direction:column;align-self:stretch/.test(hero), 'coluna do título cria a base comum do logo do evento e do local');
ok(/display:none;margin-top:auto/.test(hero), 'logo menor do local fica abaixo do nome e alinhado pela base');
ok(/width:clamp\(34px,8vw,56px\)/.test(hero), 'logo do local fica menor que o logo principal');
ok(/position:relative;width:33%;min-width:100px;flex-shrink:0;aspect-ratio:/.test(hero), 'logo do evento mantém exatamente a largura original de 33%');
ok(!/margin-top:auto;flex-shrink:0;width:clamp\(44px,14vw,64px\)/.test(tournaments), 'não sobra segunda cópia do logo do local no bloco de endereço');
ok(/window\._hydrateVenueLogos\(container\)/.test(tournaments), 'o render do cabeçalho hidrata o logo imediatamente');
ok(/release-notes\.js\?v=' \+ \(window\.SCOREPLACE_VERSION \|\| ''\)/.test(main), 'notas de versão usam o cache-buster dinâmico do release atual');

console.log((bad ? '❌' : '✅') + ' logo-local-no-cabecalho: ' + (11 - bad) + ' ok, ' + bad + ' falha(s)');
process.exitCode = bad ? 1 : 0;
