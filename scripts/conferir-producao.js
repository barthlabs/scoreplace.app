#!/usr/bin/env node
/* CONFERIDOR DE PRODUÇÃO — roda o CÓDIGO REAL contra o DADO REAL e denuncia o estranho.
 *
 * ⛔ POR QUE EXISTE. Relato do dono (13/set/2026): _"esses testes nao servem pra nada, depois
 * de concluidos todos verdes frequentemente vejo tudo quebrado e tudo verde"_. Ele está
 * certo, e a prova é o próprio dia: 806 suítes VERDES enquanto, em produção,
 *   · o aviso de placar dizia "Jogador lançou" sem nome de ninguém;
 *   · o sorteio aceitaria rodar com meio elenco;
 *   · 2 contas vivas tinham parado de receber "tem torneio perto de você";
 *   · apagar um sandbox não apagava nada e a tela dizia que apagou.
 * NENHUM desses veio da suíte. Todos vieram de rodar o código real contra o dado real.
 *
 * ⭐ A DIFERENÇA, e é o ponto: a SUÍTE guarda defeito que alguém JÁ ENTENDEU — ela prova que
 * o que foi consertado não volta. Ela não acha o que ninguém olhou. Quem acha é a MEDIDA:
 * pegar a função que o app usa, passar nela os 279 perfis e os 61 torneios de verdade, e
 * perguntar quantos saem esquisitos.
 *
 * ⛔ SÓ LÊ. Nenhuma escrita, nenhuma migração, nenhum efeito. Pode rodar a qualquer hora.
 *
 * Uso:  GOOGLE_APPLICATION_CREDENTIALS=... node scripts/conferir-producao.js
 */
'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));

const ROOT = path.join(__dirname, '..');
if (!admin.apps.length) admin.initializeApp({ projectId: 'scoreplace-app' });
const db = admin.firestore();

/* ── carrega funções REAIS do cliente, sem montar meia aplicação ─────────────── */
function doStore(...nomes) {
  const src = fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8');
  const W = {}; W.window = W;
  nomes.forEach((n) => {
    const i = src.indexOf(n + ' = function');
    if (i < 0) throw new Error('não achei ' + n + ' em js/store.js');
    const ini = src.lastIndexOf('window.', i);
    vm.runInNewContext(src.slice(ini, src.indexOf('\n};', i) + 3),
      { window: W, Array, Object, String, JSON, Math, Number, Date });
  });
  return W;
}

const achados = [];
const conta = (rotulo, n, total, detalhe) => {
  const linha = '  ' + (n ? '⚠️ ' : '✓  ') + rotulo.padEnd(52) + String(n).padStart(4) +
    (total != null ? ' de ' + total : '');
  console.log(linha + (detalhe ? '   ' + detalhe : ''));
  if (n) achados.push(rotulo + ': ' + n + (total != null ? '/' + total : ''));
};

(async () => {
  console.log('\n════ CONFERIDOR DE PRODUÇÃO — código real × dado real ════\n');

  const [usuarios, torneios, espelhos] = await Promise.all([
    db.collection('users').get(),
    db.collection('tournaments').get(),
    db.collection('usersPublic').get(),
  ]);
  console.log('perfis: ' + usuarios.size + ' · torneios: ' + torneios.size +
    ' · espelhos: ' + espelhos.size + '\n');

  /* ── ① O ESPELHO PÚBLICO diz a verdade? ─────────────────────────────────── */
  console.log('── espelho público');
  const C = require(path.join(ROOT, 'functions/perfil-publico-core.js'));
  const vivos = {}; usuarios.forEach((d) => { vivos[d.id] = d.data() || {}; });
  let semEspelho = 0, divergente = 0, vazou = 0, orfao = 0;
  const temEsp = {};
  espelhos.forEach((d) => {
    temEsp[d.id] = 1;
    const v = d.data() || {};
    if (!vivos[d.id]) { orfao++; return; }
    if (C.NUNCA_PUBLICO.some((k) => v[k] !== undefined)) vazou++;
    /* ⚠️ `lastSeenAt` e `updatedAt` ficam FORA da comparação — são os mesmos dois que
     * `espelhoPrecisaMudar` ignora de propósito: são carimbo de presença e mudariam a cada
     * abertura do app, fazendo o gatilho reescrever o espelho sem nada novo na tela. Compará-los
     * aqui acusava 1 divergente que não é defeito. ⛔ Conferidor que grita à toa vira conferidor
     * ignorado, que é exatamente a doença que ele veio curar. */
    const semCarimbo = (o) => { const c = Object.assign({}, o); delete c.lastSeenAt; delete c.updatedAt; return c; };
    if (JSON.stringify(semCarimbo(C.perfilPublico(vivos[d.id]))) !== JSON.stringify(semCarimbo(v))) divergente++;
  });
  Object.keys(vivos).forEach((u) => { if (!temEsp[u]) semEspelho++; });
  conta('perfis SEM espelho', semEspelho, usuarios.size);
  conta('espelhos que NÃO batem com a regra', divergente, espelhos.size);
  conta('espelhos com campo VETADO (e-mail/telefone/token)', vazou, espelhos.size);
  conta('espelhos ÓRFÃOS (pessoa não existe mais)', orfao, espelhos.size);

  /* ── ② CAMPOS COM DOIS TIPOS — a família do `preferredCeps` ─────────────── */
  console.log('\n── campos com mais de um tipo no mesmo lugar');
  const tipos = {};
  usuarios.forEach((d) => {
    const v = d.data() || {};
    Object.keys(v).forEach((k) => {
      const t = Array.isArray(v[k]) ? 'array' : (v[k] === null ? 'null' : typeof v[k]);
      (tipos[k] = tipos[k] || {})[t] = (tipos[k][t] || 0) + 1;
    });
  });
  const mistos = Object.keys(tipos).filter((k) => {
    const t = Object.keys(tipos[k]).filter((x) => x !== 'null');
    return t.length > 1;
  });
  conta('campos de perfil com DOIS tipos', mistos.length, null,
    mistos.length ? mistos.slice(0, 6).map((k) => k + '(' + Object.keys(tipos[k]).join('/') + ')').join(' ') : '');

  /* ── ③ PESO: documento grande é leitura cara para todo mundo ────────────── */
  console.log('\n── peso dos documentos');
  const kb = (o) => Buffer.byteLength(JSON.stringify(o)) / 1024;
  let perfilGordo = 0, maiorPerfil = 0, quemPerfil = '';
  usuarios.forEach((d) => {
    const k = kb(d.data() || {});
    if (k > maiorPerfil) { maiorPerfil = k; quemPerfil = d.id; }
    if (k > 50) perfilGordo++;
  });
  conta('perfis acima de 50 KB', perfilGordo, usuarios.size,
    'maior: ' + maiorPerfil.toFixed(0) + ' KB');
  let tourGordo = 0, maiorTour = 0, quemTour = '';
  torneios.forEach((d) => {
    const k = kb(d.data() || {});
    if (k > maiorTour) { maiorTour = k; quemTour = (d.data() || {}).name || d.id; }
    if (k > 100) tourGordo++;
  });
  conta('torneios acima de 100 KB', tourGordo, torneios.size,
    'maior: ' + maiorTour.toFixed(0) + ' KB (' + String(quemTour).slice(0, 24) + ')');

  /* ── ④ PARTES DIVIDIDAS: o contador bate com a subcoleção? ──────────────── */
  console.log('\n── torneios divididos');
  const S = {}; S.window = S; vm.createContext(S);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/views/tournament-split-core.js'), 'utf8'), S);
  const TS = S._tSplit;
  const W = doStore('window._marcaPartesQueFaltam', 'window._partesFaltandoComCerteza');
  let divididos = 0, incompletos = 0, semProva = 0;
  for (const d of torneios.docs) {
    const t = d.data() || {};
    const fora = Array.isArray(t._semPesados) ? t._semPesados : [];
    if (!fora.length) continue;
    divididos++;
    const partes = {};
    for (const nome of fora) {
      const sub = await d.ref.collection(TS.colecaoDaParte(nome)).get();
      const itens = []; sub.forEach((x) => { const v = x.data() || {}; itens.push(v.item !== undefined ? v.item : v); });
      partes[nome] = itens;
    }
    let montado;
    try { montado = TS.remontar(JSON.parse(JSON.stringify(t)), partes); }
    catch (e) { montado = Object.assign(JSON.parse(JSON.stringify(t)), partes); }
    if (W._partesFaltandoComCerteza(montado).length) incompletos++;
    if (W._marcaPartesQueFaltam(montado)) semProva++;
  }
  conta('divididos INCOMPLETOS com prova (gravação seria recusada)', incompletos, divididos);
  conta('divididos que a TARJA marcaria (só testemunha, sem prova)', semProva, divididos,
    'diferença esperada: elenco vazio com organizador em memberUids');

  /* ── ⑤ AUTORIA: aviso de placar sem nome de gente ───────────────────────── */
  console.log('\n── autoria dos avisos de placar (amostra das caixas)');
  let avisos = 0, genericos = 0;
  const amostra = usuarios.docs.slice(0, 60);
  for (const u of amostra) {
    const ns = await u.ref.collection('notifications').limit(25).get();
    ns.forEach((n) => {
      const v = n.data() || {};
      if (!/^(result|match-pending-approval)$/.test(String(v.type || ''))) return;
      avisos++;
      if (/^(Jogador|Organizador|Alguém) (lançou|confirmou)/.test(String(v.message || ''))) genericos++;
    });
  }
  conta('avisos de placar SEM nome de gente', genericos, avisos,
    'amostra de ' + amostra.length + ' caixas');

  /* ── veredito ───────────────────────────────────────────────────────────── */
  console.log('\n════════════════════════════════════════');
  if (!achados.length) console.log('✅ nada estranho no dado real.');
  else {
    console.log('⚠️  ' + achados.length + ' ponto(s) para olhar:');
    achados.forEach((a) => console.log('   · ' + a));
  }
  console.log('════════════════════════════════════════\n');
})().catch((e) => { console.error('FALHOU:', e.message); process.exit(1); });
