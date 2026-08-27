/* 🌤️ PREVISÃO DO TEMPO — agora / hoje / próximos dias
 *   node tests/previsao-tempo-agora-hoje-proximos.test.js
 *
 * PEDIDO DO DONO (15/ago/2026, print do detalhe do torneio):
 *   "abaixo de rodada em andamento, poderia aparecer a previsão do tempo que já temos no
 *    app e está no editar/criar torneio. seria legal ter uma apresentação
 *    agora/hoje/próximos dias."
 *
 * A previsão já existia, mas presa ao FORMULÁRIO (`_checkWeather`, create-tournament.js):
 * lia ids fixos do form, mostrava UM ponto só — a entrada mais próxima da data de início —
 * e carregava a chave da API dentro dela. Reusar no detalhe exigiria copiar as três coisas.
 * A busca virou `js/views/weather.js`; o formulário passou a consumi-la.
 *
 * ⚠️ CUSTO É O ASSUNTO, NÃO DETALHE. O projeto acabou de levar um incidente de conta com o
 * Places (`project_places_api_cost`): a MESMA foto era recomprada a cada render porque a URL
 * paga estava pintada no CSS. Aqui o risco é idêntico — o detalhe do torneio re-renderiza a
 * cada snapshot do Firestore e o Modo TV se redesenha sozinho. Por isso os invariantes
 * abaixo travam CACHE e DEDUPLICAÇÃO, não só o desenho.
 *
 * INVARIANTES CONGELADOS AQUI:
 *   A. o resumo separa agora / hoje / próximos dias, com mín-máx por dia;
 *   B. "hoje" nunca se repete dentro de "próximos dias";
 *   C. o ícone do dia sai do MEIO-DIA (o das 3h sempre sai "noite" e mentiria o dia);
 *   D. chuva é o PICO do dia (`pop` do próprio OpenWeather), não a média;
 *   E. dado ruim/ausente devolve null em vez de estourar ou inventar número;
 *   F. UMA chave de API no repositório, e o formulário usa a MESMA busca;
 *   G. o slot é marcado como feito ANTES da rede — re-render não gera requisição nova.
 */

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

// Carrega o módulo REAL (IIFE que só precisa de `window`).
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'views', 'weather.js'), 'utf8');
const W = { _safeHtml: (s) => String(s == null ? '' : s) };
// ⚠️ dobra-core ANTES do weather: a seção "próximos dias" virou dobrável (2.1.25) e chama
// window._spDobra. Sem este load a suíte morre com "_spDobra is not a function" — foi o que
// aconteceu no dia em que o helper nasceu. Mesma ordem do index.html.
new Function('window', 'localStorage', 'document',
  fs.readFileSync(path.join(ROOT, 'js', 'views', 'dobra-core.js'), 'utf8'))(
  W, { getItem: () => null, setItem: () => {} }, { querySelectorAll: () => [] });
new Function('window', 'document', 'sessionStorage', 'fetch', SRC)(
  W, { querySelectorAll: () => [], body: { contains: () => false } },
  { getItem: () => null, setItem: () => {} }, () => Promise.resolve({ json: () => ({}) })
);

// ═══════════════════════════════════════════════════════════════════════════
// Fixture: a FORMA do /data/2.5/forecast — passos de 3h, `main.temp_*`, `pop`.
// Ancorado num instante fixo pra o teste não mudar de resultado conforme a hora.
// ═══════════════════════════════════════════════════════════════════════════
const AGORA = new Date('2026-08-15T14:00:00-03:00').getTime();
function passo(iso, temp, min, max, icon, desc, pop) {
  return { dt: Math.round(new Date(iso).getTime() / 1000),
    main: { temp: temp, temp_min: min, temp_max: max, humidity: 62 },
    weather: [{ icon: icon, description: desc }], wind: { speed: 5 }, pop: pop };
}
const DADOS = { list: [
  // hoje (15/08)
  passo('2026-08-15T09:00:00-03:00', 19, 17, 21, '02d', 'algumas nuvens', 0.1),
  passo('2026-08-15T12:00:00-03:00', 24, 22, 26, '01d', 'céu limpo', 0.2),
  passo('2026-08-15T15:00:00-03:00', 26, 24, 28, '01d', 'céu limpo', 0.5),
  passo('2026-08-15T21:00:00-03:00', 20, 18, 22, '01n', 'céu limpo', 0.0),
  // amanhã (16/08)
  passo('2026-08-16T03:00:00-03:00', 15, 14, 16, '01n', 'céu limpo', 0.0),
  passo('2026-08-16T12:00:00-03:00', 23, 21, 25, '10d', 'chuva leve', 0.8),
  passo('2026-08-16T18:00:00-03:00', 19, 18, 20, '10d', 'chuva leve', 0.6),
  // 17, 18, 19, 20/08
  passo('2026-08-17T12:00:00-03:00', 21, 19, 23, '04d', 'nublado', 0.3),
  passo('2026-08-18T12:00:00-03:00', 25, 23, 27, '01d', 'céu limpo', 0.0),
  passo('2026-08-19T12:00:00-03:00', 27, 25, 29, '01d', 'céu limpo', 0.1),
  passo('2026-08-20T12:00:00-03:00', 28, 26, 30, '01d', 'céu limpo', 0.1)
] };

const R = W._weatherResumo(DADOS, AGORA);

// ═══════════════════════════════════════════════════════════════════════════
// A. AGORA / HOJE / PRÓXIMOS DIAS
// ═══════════════════════════════════════════════════════════════════════════
ok(!!R, 'A0. o resumo é produzido');
ok(R.agora.temp === 26,
  'A1. "agora" é a leitura mais próxima do instante atual (15h, 26°) — vi ' + R.agora.temp);
ok(R.agora.desc === 'céu limpo' && R.agora.umidade === 62,
  'A2. "agora" traz descrição e umidade');
ok(R.agora.vento === 18, 'A3. o vento vem em km/h (5 m/s → 18) — vi ' + R.agora.vento);
ok(!!R.hoje && R.hoje.min === 17 && R.hoje.max === 28,
  'A4. "hoje" é o mín-máx do DIA inteiro (17°/28°) — vi ' + (R.hoje && R.hoje.min + '/' + R.hoje.max));
ok(Array.isArray(R.dias) && R.dias.length === 4,
  'A5. "próximos dias" traz 4 dias — vi ' + (R.dias || []).length);
ok(R.dias[0].nome === 'amanhã', 'A6. o primeiro dos próximos é "amanhã" — vi ' + R.dias[0].nome);
ok(R.dias[0].min === 14 && R.dias[0].max === 25,
  'A7. o mín-máx de amanhã cobre a madrugada e a tarde (14°/25°) — vi ' + R.dias[0].min + '/' + R.dias[0].max);

// ═══════════════════════════════════════════════════════════════════════════
// B. "HOJE" NÃO SE REPETE NOS PRÓXIMOS
// ═══════════════════════════════════════════════════════════════════════════
ok(R.dias.filter(function (d) { return d.nome === 'hoje'; }).length === 0,
  'B1. "hoje" não aparece de novo dentro de "próximos dias"');

// ═══════════════════════════════════════════════════════════════════════════
// C. O ÍCONE DO DIA É O DO MEIO-DIA
// ═══════════════════════════════════════════════════════════════════════════
// Amanhã tem 3 leituras e a PRIMEIRA é 03:00 com ícone de noite ('01n'). Pegar a
// primeira (ou a "do meio" por índice) faria o dia inteiro parecer noite/limpo.
ok(R.dias[0].icon === '10d' && R.dias[0].desc === 'chuva leve',
  'C1. amanhã usa o ícone do meio-dia (10d, chuva leve) e não o das 3h da manhã — vi ' + R.dias[0].icon);

// ═══════════════════════════════════════════════════════════════════════════
// D. CHUVA É O PICO DO DIA
// ═══════════════════════════════════════════════════════════════════════════
ok(R.hoje.chuva === 50, 'D1. hoje: pico de 50% (não a média das 4 leituras) — vi ' + R.hoje.chuva);
ok(R.dias[0].chuva === 80, 'D2. amanhã: pico de 80% — vi ' + R.dias[0].chuva);

// ═══════════════════════════════════════════════════════════════════════════
// E. DADO RUIM NÃO ESTOURA
// ═══════════════════════════════════════════════════════════════════════════
ok(W._weatherResumo(null, AGORA) === null, 'E1. sem dados → null');
ok(W._weatherResumo({}, AGORA) === null, 'E2. resposta sem `list` → null');
ok(W._weatherResumo({ list: [] }, AGORA) === null, 'E3. `list` vazia → null');
ok(W._weatherWidgetHtml(null) === '', 'E4. sem resumo, o widget não desenha nada');
{
  // leitura sem temp_min/temp_max não pode virar "NaN°" na tela
  const magro = { list: [{ dt: Math.round(AGORA / 1000), main: { temp: 20 }, weather: [{ icon: '01d', description: 'x' }] }] };
  const r2 = W._weatherResumo(magro, AGORA);
  const h2 = W._weatherWidgetHtml(r2, 'lg');
  ok(h2.indexOf('NaN') === -1 && h2.indexOf('undefined') === -1,
    'E5. leitura sem mín/máx não vaza NaN/undefined no desenho');
  ok(h2.indexOf('—') !== -1, 'E6. mín/máx ausente vira travessão, não zero inventado');
}

// ═══════════════════════════════════════════════════════════════════════════
// Desenho — as três seções aparecem
// ═══════════════════════════════════════════════════════════════════════════
const HTML = W._weatherWidgetHtml(R, 'lg');
ok(HTML.indexOf('agora') !== -1, 'F1. o widget rotula "agora"');
ok(HTML.indexOf('hoje') !== -1, 'F2. o widget rotula "hoje"');
ok(HTML.indexOf('próximos dias') !== -1, 'F3. o widget rotula "próximos dias"');
ok((HTML.match(/openweathermap\.org\/img\/wn\//g) || []).length === 6,
  'F4. um ícone pra agora, um pra hoje e um por dia seguinte (6) — vi ' + (HTML.match(/openweathermap\.org\/img\/wn\//g) || []).length);

// ═══════════════════════════════════════════════════════════════════════════
// G. CUSTO — uma chave, uma busca, um disparo por slot
// ═══════════════════════════════════════════════════════════════════════════
const CRIAR = fs.readFileSync(path.join(ROOT, 'js', 'views', 'create-tournament.js'), 'utf8');
ok(CRIAR.indexOf("'8fc3ddd6'") === -1,
  'G1. a chave do OpenWeather não está mais duplicada em create-tournament.js');
ok((SRC.match(/8fc3ddd6/g) || []).length === 1,
  'G2. a chave existe UMA vez no repositório (dentro do módulo do tempo)');
ok(CRIAR.indexOf('window._weatherFetch(lat, lon)') !== -1,
  'G3. o formulário usa a MESMA busca do widget (cache e chave compartilhados)');
ok((CRIAR.match(/api\.openweathermap\.org/g) || []).length === 0,
  'G4. o formulário não chama a API por conta própria');
ok(SRC.indexOf("el.setAttribute('data-w-done', '1');") !== -1 &&
   SRC.indexOf("data-weather-slot]:not([data-w-done])") !== -1,
  'G5. o slot é marcado como feito ANTES da rede — re-render não dispara requisição nova');
ok(SRC.indexOf('_voando[k]') !== -1,
  'G6. requisições concorrentes pro mesmo local compartilham a MESMA promessa');
ok(/TTL_MS = 30 \* 60 \* 1000/.test(SRC), 'G7. o cache vale 30 minutos');
ok(SRC.indexOf("toFixed(2)") !== -1,
  'G8. a chave de cache arredonda o local (~1km) — dois torneios no mesmo clube não pagam duas vezes');
// sem local, nem slot existe (não há o que consultar)
ok(W._weatherSlotHtml({ id: 't1' }, 'lg') === '', 'G9. torneio sem coordenadas não gera slot');
ok(W._weatherSlotHtml({ venueLat: -23.5, venueLon: -46.6 }, 'lg').indexOf('data-weather-slot') !== -1,
  'G10. com coordenadas, o slot nasce com lat/lon embutidos');

console.log('\n🌤️ PREVISÃO — agora / hoje / próximos dias');
console.log('   ' + pass + ' ok, ' + fail + ' falhas');
if (fail) { fails.forEach(f => console.log('   ✗ ' + f)); process.exit(1); }
console.log('   ✅ tudo verde');
