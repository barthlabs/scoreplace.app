/* venue-geo-core.test.js — O LOCAL DO EVENTO CHEGA AO BANCO COM O TIPO CERTO, e o aviso de
 * fuso diz a verdade.   node tests/venue-geo-core.test.js
 *
 * A FALHA QUE ISTO REPRODUZ (L6.R2.P0, por leitura de código):
 * `create-tournament.js` fazia `latEl.value = place.location.lat()` — atribuir a `.value`
 * CONVERTE PRA TEXTO — e o payload levava esse texto cru pro banco. Do outro lado,
 * `agenda-core.resolverFuso` só aceita coordenada `typeof === 'number'`. Resultado: a alínea
 * de coordenada da resolução de fuso estava MORTA POR TIPO, não por falta de dado, e o
 * sorteio automático não acontecia. E a cidade estruturada que o Places já entregava era
 * usada só pra montar o rótulo e jogada fora.
 *
 * O que este arquivo trava:
 *  ① lat/lon vindas dos inputs (STRINGS) viram `number` no payload;
 *  ② vazio, inválido e fora dos limites viram `null` — nunca string;
 *  ③ cidade/estado/país do `addressComponents` são extraídos e persistidos;
 *  ④ o payload NORMALIZADO resolve fuso por COORDENADA e por TEXTO no `agenda-core` REAL —
 *     e o payload de ANTES (string) não resolvia: é a prova da correção;
 *  ⑤ contrato legado (string) continua aceito na entrada, e a gravação sai normalizada;
 *  ⑥ o aviso: sem local e sem cidade do organizador há aviso; com coordenada, com local
 *     reconhecido ou com cidade do organizador, o aviso some;
 *  ⑦ ⭐ GATE DA CÓPIA: o espelho do resolvedor que vive no cliente responde IGUAL ao
 *     `agenda-core` numa bateria de casos, e as três tabelas são idênticas. Duas cópias de
 *     uma regra só são aceitáveis com um gate que fica vermelho quando divergem.
 */
'use strict';
const path = require('path');
const V = require(path.join(__dirname, '..', 'js', 'views', 'venue-geo-core.js'));
const A = require(path.join(__dirname, '..', 'functions-autodraw', 'agenda-core.js'));

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } }
function eq(a, b, m) { ok(a === b, m + ' — esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a)); }

// ── ① e ② tipos ──────────────────────────────────────────────────────────────────────
console.log('\n▸ ① o que vem do input (string) sai number no payload');
{
  const p = V.normalizarLocal({ venueLat: '-23.5613', venueLon: '-46.6565' });
  eq(typeof p.venueLat, 'number', 'venueLat virou number');
  eq(typeof p.venueLon, 'number', 'venueLon virou number');
  eq(p.venueLat, -23.5613, 'e com o valor certo');
  eq(p.venueLon, -46.6565, 'idem longitude');
  const jaNum = V.normalizarLocal({ venueLat: -3.1, venueLon: -60.0 });
  eq(jaNum.venueLat, -3.1, 'number que já chega number continua number');
}

console.log('▸ ② vazio, inválido e fora dos limites viram null — NUNCA string');
{
  const casos = [
    ['', '', 'vazio'],
    ['   ', '  ', 'só espaço'],
    ['abc', 'def', 'texto que não é número'],
    ['91', '0', 'latitude 91 (acima de 90)'],
    ['-91', '0', 'latitude -91'],
    ['0', '181', 'longitude 181'],
    ['0', '-181', 'longitude -181'],
    ['NaN', 'NaN', 'a string NaN'],
    ['Infinity', '0', 'infinito']
  ];
  casos.forEach(function (c) {
    const p = V.normalizarLocal({ venueLat: c[0], venueLon: c[1] });
    ok(p.venueLat === null && p.venueLon === null, c[2] + ' → os dois viram null');
    ok(typeof p.venueLat !== 'string' && typeof p.venueLon !== 'string', c[2] + ' → e nenhum é string');
  });
  const meia = V.normalizarLocal({ venueLat: '-23.5', venueLon: '' });
  ok(meia.venueLat === null && meia.venueLon === null,
    '⛔ coordenada é PAR: metade válida derruba as duas (meia coordenada não localiza nada)');
  const limite = V.normalizarLocal({ venueLat: '-90', venueLon: '180' });
  ok(limite.venueLat === -90 && limite.venueLon === 180, 'os limites EXATOS (-90 / 180) são válidos');
}

// ── ③ estruturados do Places ─────────────────────────────────────────────────────────
console.log('▸ ③ cidade/estado/país do Places são extraídos');
{
  const comps = [
    { types: ['street_number'], longText: '1000' },
    { types: ['locality', 'political'], longText: 'Manaus', shortText: 'Manaus' },
    { types: ['administrative_area_level_2'], longText: 'Manaus' },
    { types: ['administrative_area_level_1', 'political'], longText: 'Amazonas', shortText: 'AM' },
    { types: ['country', 'political'], longText: 'Brasil', shortText: 'BR' }
  ];
  const r = V.doPlaces(comps);
  eq(r.venueCity, 'Manaus', 'cidade pela locality');
  eq(r.venueState, 'AM', 'estado pelo shortText (é a forma que o reconhecedor casa)');
  eq(r.venueCountry, 'BR', 'país pelo shortText');
  const semLocality = V.doPlaces([{ types: ['administrative_area_level_2'], longText: 'Campinas' }]);
  eq(semLocality.venueCity, 'Campinas', 'sem locality, cai no município (nível 2)');
  const vazio = V.doPlaces(null);
  ok(vazio.venueCity === null && vazio.venueState === null && vazio.venueCountry === null,
    'sem componentes: tudo null — nada é inventado');
}

// ── ④ a prova: o payload normalizado resolve fuso no agenda-core REAL ────────────────
console.log('▸ ④ o payload normalizado RESOLVE fuso no agenda-core; o de antes não resolvia');
{
  // por COORDENADA
  const antes = { venueLat: '-3.1', venueLon: '-60.0' };                 // como era gravado
  eq(A.resolverFuso(antes, null).tz, null,
    '⛔ payload ANTIGO (string) NÃO resolvia por coordenada — a falha, reproduzida');
  const depois = V.normalizarLocal({ venueLat: '-3.1', venueLon: '-60.0' });
  eq(A.resolverFuso(depois, null).tz, 'America/Manaus', '⭐ payload normalizado resolve');
  eq(A.resolverFuso(depois, null).fonte, 'evento.coordenada', 'e pela fonte coordenada');

  // por TEXTO (a cidade estruturada que antes era descartada)
  const semCidade = V.normalizarLocal({ venue: 'Arena Central', venueAddress: 'Rua 5, 200' });
  eq(A.resolverFuso(semCidade, null).tz, null, 'sem cidade reconhecível: não resolve');
  const comCidade = V.normalizarLocal({ venue: 'Arena Central', venueAddress: 'Rua 5, 200', venueCity: 'Fortaleza' });
  eq(A.resolverFuso(comCidade, null).tz, 'America/Fortaleza', '⭐ com venueCity persistida, resolve');
  eq(A.resolverFuso(comCidade, null).fonte, 'evento.local', 'e pela fonte local');
}

// ── ⑤ legado ────────────────────────────────────────────────────────────────────────
console.log('▸ ⑤ o contrato LEGADO continua aceito na entrada e sai normalizado');
{
  const legado = { venueLat: '-15.7942', venueLon: '-47.8822', venueCity: '  Brasília  ' };
  const p = V.normalizarLocal(legado);
  eq(typeof p.venueLat, 'number', 'template/torneio legado (string) é lido sem erro');
  eq(p.venueCity, 'Brasília', 'e o texto sai aparado');
  eq(A.resolverFuso(p, null).tz, 'America/Sao_Paulo', 'e o resultado resolve fuso');
  const semCampos = V.normalizarLocal({ name: 'x' });
  ok(semCampos.venueLat === null && semCampos.venueLon === null,
    'documento antigo SEM os campos: vira null, não quebra');
  ok(!('venueCity' in semCampos), 'e não inventa campo que não existia no objeto');
}

// ── ⑥ o aviso ───────────────────────────────────────────────────────────────────────
console.log('▸ ⑥ o aviso: aparece sem local, some quando alguma fonte permitida resolve');
{
  ok(!V.fusoResolvivel({ venue: 'Quadra do condomínio' }, {}),
    'sem local reconhecido e sem cidade do organizador → AVISO');
  ok(!V.fusoResolvivel({}, null), 'formulário vazio → AVISO');
  ok(V.fusoResolvivel(V.normalizarLocal({ venueLat: '-3.1', venueLon: '-60.0' }), {}),
    'informou COORDENADA → aviso some');
  ok(V.fusoResolvivel({ venueCity: 'Recife' }, {}), 'informou CIDADE do evento → aviso some');
  ok(V.fusoResolvivel({ venueAddress: 'Av. X — Cuiabá, MT' }, {}), 'endereço reconhecido → aviso some');
  ok(V.fusoResolvivel({}, { city: 'Salvador' }), 'cidade do ORGANIZADOR → aviso some');
  ok(V.fusoResolvivel({ timeZone: 'America/Belem' }, {}), 'timeZone explícito → aviso some');
  ok(!V.fusoResolvivel({ timeZone: 'Nao/Existe' }, { city: 'Recife' }),
    '⛔ timeZone declarado INVÁLIDO não cai no palpite seguinte — continua avisando');
  // e a agenda automática É calculável exatamente quando o aviso some
  const bom = V.normalizarLocal({ venueLat: '-3.1', venueLon: '-60.0' });
  const tz = A.resolverFuso(bom, null).tz;
  const slot = A.slotK({ drawFirstDate: '2026-09-04', drawFirstTime: '19:00', drawIntervalDays: 7 }, 0, tz);
  ok(typeof slot === 'number' && isFinite(slot),
    '⭐ e com o aviso apagado a agenda automática JÁ pode ser calculada (slot = ' + new Date(slot).toISOString() + ')');
}

// ── ⑦ gate da cópia ─────────────────────────────────────────────────────────────────
console.log('▸ ⑦ o espelho do cliente responde IGUAL ao agenda-core (gate da cópia)');
{
  eq(JSON.stringify(V.FUSO_POR_UF), JSON.stringify(A.FUSO_POR_UF), 'tabela FUSO_POR_UF idêntica');
  eq(JSON.stringify(V.FUSO_POR_CIDADE), JSON.stringify(A.FUSO_POR_CIDADE), 'tabela FUSO_POR_CIDADE idêntica');
  eq(JSON.stringify(V.CAIXAS), JSON.stringify(A.CAIXAS), 'tabela CAIXAS idêntica');

  const bateria = [
    [{ timeZone: 'America/Manaus' }, null],
    [{ timeZone: 'Nao/Existe' }, null],
    [{ venueLat: -3.1, venueLon: -60.0 }, null],
    [{ venueLat: 0, venueLon: 0 }, null],
    [{ venueLat: -23.56, venueLon: -46.65 }, null],
    [{ venueLat: -10.0, venueLon: -55.0 }, null],
    [{ venueAddress: 'Quadra 3 — Cuiabá, MT' }, null],
    [{ venue: 'Arena — Rio Branco' }, null],
    [{ venueCity: 'Fortaleza' }, null],
    [{ venueAddress: 'divisa SP / MS' }, null],
    [{ venue: 'Quadra do condomínio' }, {}],
    [{}, { city: 'Recife' }],
    [{}, { timeZone: 'America/Bahia' }],
    [{}, { state: 'BA' }],
    [{}, null],
    [{ venueAddress: 'Rua A, 10 — Palmas, TO' }, null],
    [{ venueCity: 'Fernando de Noronha' }, null]
  ];
  let iguais = 0;
  bateria.forEach(function (c, i) {
    const a = A.resolverFuso(JSON.parse(JSON.stringify(c[0])), c[1]);
    const b = V.resolverFuso(JSON.parse(JSON.stringify(c[0])), c[1]);
    const mesmo = (a.tz || null) === (b.tz || null) && (a.fonte || null) === (b.fonte || null);
    if (mesmo) iguais++;
    else console.error('    caso ' + i + ': agenda-core=' + JSON.stringify(a) + ' × espelho=' + JSON.stringify(b));
  });
  eq(iguais, bateria.length, '⭐ os dois resolvedores concordam em ' + bateria.length + ' casos');
}

// ── ⑧ a FIAÇÃO: a tela usa mesmo a fronteira ────────────────────────────────────────
console.log('▸ ⑧ create-tournament usa a fronteira, persiste o estruturado e mostra o aviso');
{
  const fs = require('fs');
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'create-tournament.js'), 'utf8');
  ok(/_venueGeo\.normalizarLocal\(tourData\)/.test(src),
    '⭐ o payload do torneio passa por normalizarLocal ANTES de gravar');
  ok(src.indexOf('_venueGeo.normalizarLocal(tourData)') < src.indexOf('if (editId) {'),
    'e a normalização vem ANTES do ramo criar/editar — vale pros dois');
  ok(/_venueGeo\.doPlaces\(place\.addressComponents\)/.test(src),
    'o seletor extrai cidade/estado/país pela função canônica');
  ['tourn-venue-city', 'tourn-venue-state', 'tourn-venue-country'].forEach(function (id) {
    ok(src.indexOf('id="' + id + '"') !== -1, 'existe o input oculto ' + id);
  });
  ok(/venueCity: \(document\.getElementById\('tourn-venue-city'\)/.test(src),
    'e os três entram no payload do torneio');
  ok(/_venueGeo \? window\._venueGeo\.latitude\(get\('tourn-venue-lat'\)\)/.test(src),
    'o TEMPLATE novo também sai com number|null');
  ok(/id="aviso-fuso-indeterminado"/.test(src), 'o aviso existe no formulário');
  ok(/window\._atualizarAvisoFuso = function/.test(src), 'e tem quem o atualize');
  ok((src.match(/_atualizarAvisoFuso\(\)/g) || []).length >= 4,
    'e ele é reavaliado em vários pontos (abrir, editar, escolher local, limpar)');
  /* ⚠️ Testa o CÓDIGO, não a menção: os dois arquivos EXPLICAM em comentário por que não se
   * deduz fuso pelo aparelho, e casar com a explicação daria vermelho pela razão errada —
   * a mesma armadilha que já apareceu no gate do offset fixo. */
  const semComentario = function (s) {
    return String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
  };
  ok(!/resolvedOptions\(\)\s*\.\s*timeZone/.test(semComentario(src)),
    '⛔ e a tela NÃO deduz fuso pelo aparelho (resolvedOptions) em lugar nenhum');
  const geo = semComentario(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'venue-geo-core.js'), 'utf8'));
  ok(!/resolvedOptions\(\)\s*\.\s*timeZone/.test(geo) && !/['"]-03:00['"]/.test(geo) && !/['"]UTC['"]/.test(geo),
    '⛔ nem o módulo de local: sem fuso do aparelho, sem -03:00, sem UTC');
}

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✓ ') + pass + ' asserções');
process.exit(fail ? 1 : 0);
