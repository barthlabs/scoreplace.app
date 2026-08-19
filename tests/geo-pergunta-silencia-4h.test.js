/* "VOCÊ ESTÁ AQUI?" — O "AGORA NÃO" SILENCIA POR 4 HORAS
 * node tests/geo-pergunta-silencia-4h.test.js
 *
 * A FALHA REAL (dono, 19/ago/2026): _"quando abrimos o app num local preferido sem ida
 * programada ele pergunta se viemos para jogar. o problema é que ele faz isso toda vez e
 * seria perfeito se ele fizesse isso quando abre e se a resposta for nao, silenciar essa
 * funcao por 4h."_
 *
 * POR QUE ACONTECIA: o único guard era sessionStorage (1 pergunta por dia POR SESSÃO).
 * No nativo, fechar o app mata a sessão → cada abertura era uma sessão nova → a pergunta
 * voltava TODA vez, mesmo depois de um "Agora não".
 *
 * O QUE ESTE TESTE REPRODUZ (rodando o js/presence-geo.js de verdade num sandbox):
 *   1. abrir o app num preferido → pergunta aparece;
 *   2. responder "Agora não" → o silêncio de 4h é GRAVADO em localStorage;
 *   3. FECHAR e REABRIR o app (sessionStorage novo, localStorage preservado) →
 *      a pergunta NÃO volta — era exatamente aqui que o bug morava;
 *   4. passadas as 4h, abrir de novo → a pergunta VOLTA;
 *   5. responder "Sim, estou aqui" → registra presença e NÃO silencia nada.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗', m); } };

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'presence-geo.js'), 'utf8');

// ── Relógio controlável (o silêncio expira por tempo) ───────────────────────
const RealDate = Date;
let clockOffset = 0;
function FakeDate(...args) {
  return args.length ? new RealDate(...args) : new RealDate(RealDate.now() + clockOffset);
}
FakeDate.now = () => RealDate.now() + clockOffset;
FakeDate.prototype = RealDate.prototype;
FakeDate.parse = RealDate.parse; FakeDate.UTC = RealDate.UTC;

// ── Storages: localStorage sobrevive ao "fechar o app"; sessionStorage não ──
function mkStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k)
  };
}
const localStorageShim = mkStorage();

// ── DOM mínimo: só o que o presence-geo.js toca ─────────────────────────────
function mkDocument() {
  const byId = {};
  const doc = {
    getElementById: (id) => byId[id] || null,
    createElement: () => {
      const el = {
        id: '', style: { cssText: '' }, innerHTML: '', _attrs: {},
        setAttribute(k, v) { this._attrs[k] = v; },
        getAttribute(k) { return this._attrs[k]; },
        addEventListener() {},
        remove() { if (this.id && byId[this.id] === this) delete byId[this.id]; }
      };
      return el;
    },
    // O confirm lê as pills ativas; devolvemos uma pill "Padel" ligada.
    querySelectorAll: () => [{ getAttribute: (k) => (k === 'data-sport' ? 'Padel' : '1') }],
    addEventListener() {},
    head: { appendChild() {} },
    body: { appendChild(el) { if (el.id) byId[el.id] = el; } }
  };
  return doc;
}

const salvas = []; // presenças registradas via savePresence

function mkWindow(doc, sessionStorage) {
  const w = {
    _log() {}, _warn() {}, _error() {},
    showNotification() {},
    showConfirmDialog() {},
    _haversineKm: () => 0, // estamos EM CIMA do local preferido
    AppStore: {
      currentUser: {
        uid: 'u1', email: 'x@y.z', displayName: 'Tester', photoURL: '',
        preferredSports: 'Padel',
        preferredLocations: [{ lat: -23.5, lng: -46.6, label: 'Clube X' }]
      },
      tournaments: []
    },
    PresenceDB: {
      venueKey: (pid, name) => (pid || '') + '|' + String(name || '').toLowerCase(),
      normalizeSport: (s) => String(s || '').trim(),
      CHECKIN_WINDOW_MS: 3 * 60 * 60 * 1000,
      dayKey: (d) => d.toISOString().slice(0, 10),
      loadMyActive: () => Promise.resolve([]),
      savePresence: (p) => { salvas.push(p); return Promise.resolve(); }
    }
  };
  w.window = w;
  w.document = doc;
  w.sessionStorage = sessionStorage;
  w.localStorage = localStorageShim;
  w.navigator = {
    geolocation: {
      getCurrentPosition: (okCb) => okCb({ coords: { latitude: -23.5, longitude: -46.6 } })
    }
  };
  w.Date = FakeDate;
  w.setTimeout = setTimeout; w.clearTimeout = clearTimeout;
  w.JSON = JSON; w.Math = Math; w.Array = Array; w.Object = Object;
  w.String = String; w.Number = Number; w.parseFloat = parseFloat; w.parseInt = parseInt;
  w.isNaN = isNaN; w.Infinity = Infinity; w.Promise = Promise; w.MutationObserver = undefined;
  w.addEventListener = () => {}; w.removeEventListener = () => {};
  return w;
}

// "Abrir o app": sessão NOVA (sessionStorage zerado), roda o arquivo de novo e dispara o check.
function abrirApp() {
  const doc = mkDocument();
  const w = mkWindow(doc, mkStorage());
  vm.createContext(w);
  vm.runInContext(SRC, w, { filename: 'presence-geo.js' });
  w._presenceGeoCheck();
  return { w, doc };
}
const tick = () => new Promise((r) => setImmediate(r));

(async () => {
  console.log('──── "Agora não" silencia a pergunta por 4h ────');

  // 1. Primeira abertura no local preferido → a pergunta aparece.
  let app = await (async () => { const a = abrirApp(); await tick(); await tick(); return a; })();
  ok(!!app.doc.getElementById('geo-checkin-overlay'), 'abrir o app num preferido mostra "Você está aqui?"');

  // 2. "Agora não" → grava o silêncio de 4h no localStorage (sobrevive ao fechar).
  app.w._geoCheckinDismiss();
  ok(!app.doc.getElementById('geo-checkin-overlay'), 'o "Agora não" fecha o overlay');
  const snoozeRaw = localStorageShim.getItem('scoreplace_geo_snooze_u1');
  ok(!!snoozeRaw, 'o "Agora não" PERSISTE o silêncio (localStorage, não sessionStorage)');
  const until = snoozeRaw ? Number(Object.values(JSON.parse(snoozeRaw))[0]) : 0;
  ok(until > FakeDate.now() + 3.9 * 3600 * 1000 && until <= FakeDate.now() + 4 * 3600 * 1000,
     'o silêncio dura 4 horas');

  // 3. FECHAR e REABRIR o app (o bug real: sessão nova re-perguntava).
  app = abrirApp(); await tick(); await tick();
  ok(!app.doc.getElementById('geo-checkin-overlay'),
     'reabrir o app durante o silêncio NÃO re-pergunta (era o "faz isso toda vez")');

  // 4. Depois das 4h, a pergunta volta.
  clockOffset += 4 * 3600 * 1000 + 60 * 1000;
  localStorageShim.removeItem('scoreplace_gps_cache'); // cache de GPS expirou faz tempo
  app = abrirApp(); await tick(); await tick();
  ok(!!app.doc.getElementById('geo-checkin-overlay'), 'passadas as 4h, a pergunta volta a aparecer');

  // 5. "Sim, estou aqui" registra presença e NÃO silencia (senão o próximo local
  //    preferido do dia ficaria mudo sem ninguém ter dito "não").
  localStorageShim.removeItem('scoreplace_geo_snooze_u1');
  app.w._geoCheckinConfirm(); await tick();
  ok(salvas.length === 1 && salvas[0].venueName === 'Clube X' && salvas[0].sports[0] === 'Padel',
     'o "Sim" registra a presença no local com a modalidade');
  ok(!localStorageShim.getItem('scoreplace_geo_snooze_u1'), 'o "Sim" NÃO grava silêncio nenhum');

  console.log(`\n  ${pass} passaram, ${fail} falharam`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
