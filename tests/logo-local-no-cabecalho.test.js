'use strict';
/* Regressão Paineiras/Confra: venue.logoUrl (Storage) precisa hidratar o slot
 * legado. Em toda ficha, o brasão do local acompanha o título do torneio;
 * nos cartões de lista continua junto da data textual. */
const fs = require('fs');
let bad = 0;
function ok(value, label) { console.log((value ? '✓ ' : '✗ ') + label); if (!value) bad++; }

const store = fs.readFileSync('js/store.js', 'utf8');
const tournaments = fs.readFileSync('js/views/tournaments.js', 'utf8');
const responsive = fs.readFileSync('css/responsive.css', 'utf8');
const main = fs.readFileSync('js/main.js', 'utf8');
const begin = store.indexOf('function _setupVenueLogos()');
const end = store.indexOf('// ─── (REMOVIDO', begin);
const loader = store.slice(begin, end);
const heroBegin = tournaments.indexOf('<!-- Middle Left: Nome + Logo + Favorito -->');
const heroEnd = tournaments.indexOf('/* v2.8.67:', heroBegin);
const hero = tournaments.slice(heroBegin, heroEnd);
const datesBegin = tournaments.indexOf('<!-- Sem card visual de data, a data textual permanece sob a identidade. -->');
const dates = tournaments.slice(datesBegin, datesBegin + 850);

ok(/window\._venueLogoSrc\s*=\s*function/.test(store), 'acessor canônico de logo do local existe no runtime');
ok(begin >= 0 && /_venueLogoSrc\s*\?\s*window\._venueLogoSrc\(v\)/.test(loader), 'logo do local lê logoUrl/Storage pelo acessor canônico');
ok(/window\._hydrateVenueLogos\s*=\s*function/.test(loader) && /querySelectorAll\('\[data-vlogo-pid\]/.test(loader), 'hidratador busca os slots de logo do local');
ok(/el\.style\.display\s*=\s*'block'/.test(loader), 'hidratador revela o slot ao receber a imagem');
ok(/sp-tournament-right-rail/.test(hero) && /dateCardHtml && !window\._tourLogoSrc\(t\) && t\.venuePlaceId \? '<span data-vlogo-pid=/.test(hero), 'sem logo do evento, o logo do local fica na coluna do coração e na base da data');
ok(/display:flex;flex-direction:column;align-self:stretch/.test(hero), 'coluna do título preserva o contrato responsivo do nome');
ok(/!tournamentId && !dateCardHtml && t\.venuePlaceId/.test(dates), 'na lista, logo do local continua no bloco da data textual');
ok(/sp-tournament-date-stack/.test(tournaments) && /display:\$\{dateCardHtml \? 'none' : 'flex'\};align-items:center;gap:12px;min-width:0/.test(dates), 'a data visual e a textual são alternativas');
ok(/width:clamp\(42px,6vw,64px\)/.test(hero), 'logo do local tem dimensão responsiva junto ao título');
ok(/position:relative;width:33%;min-width:100px;flex-shrink:0;aspect-ratio:/.test(hero), 'logo do evento mantém exatamente a largura original de 33%');
ok(/class="tournament-card-title\$\{/.test(hero), 'o título tem classe própria para a regra responsiva');
ok(/font-size:\s*clamp\(1\.45rem,\s*6\.4vw,\s*2\.25rem\)\s*!important/.test(responsive) && /_fitTournamentTitles/.test(store), 'o título ocupa o maior tamanho que cabe no slot real');
ok(/text-wrap:\s*pretty/.test(responsive) && /overflow-wrap:\s*normal\s*!important/.test(responsive) && /word-break:\s*normal\s*!important/.test(responsive), 'palavras do título não são partidas no meio');
ok(!/@media \(max-width: 430px\)[\s\S]*\.tournament-card-title/.test(responsive), 'não há teto móvel artificial que reduza o título antes de necessário');
ok(!/margin-top:auto;flex-shrink:0;width:clamp\(44px,14vw,64px\)/.test(tournaments), 'não sobra segunda cópia do logo do local no bloco de endereço');
ok(/window\._hydrateVenueLogos\(container\)/.test(tournaments), 'o render do cabeçalho hidrata o logo imediatamente');
ok(/release-notes\.js\?v=' \+ \(window\.SCOREPLACE_VERSION \|\| ''\)/.test(main), 'notas de versão usam o cache-buster dinâmico do release atual');

console.log((bad ? '❌' : '✅') + ' logo-local-no-cabecalho: ' + (17 - bad) + ' ok, ' + bad + ' falha(s)');
process.exitCode = bad ? 1 : 0;
