'use strict';
/* SONDA DE ALCANCE das Functions que o app chama. `node scripts/sondar-callables.js [baseline.json]`
 *
 * ⛔ POR QUE EXISTE: em 24/set/2026 medi que 23 callables chamadas pelo cliente respondiam 404 —
 * nunca tinham sido publicadas — e NADA no repo reclamava. `firebase functions:list` não serve:
 * ela corta calado em ordem alfabética ([[feedback_functions_list_corta_calado]]). Quem prova é
 * a requisição.
 *
 * ⛔ A REQUISIÇÃO É INERTE POR CONSTRUÇÃO DO PROTOCOLO, não por confiança no handler:
 * `POST` + `Content-Type: application/json` + corpo `{}` **SEM o campo `data`**. O protocolo
 * callable exige `data`; sem ele o servidor devolve 400 ANTES do handler — então nem as callables
 * públicas de propósito (`sendVerificationEmail`, `sendPasswordReset`) executam. `{"data":{}}` NÃO
 * serviria: dependeria de cada handler se recusar sozinho.
 *
 * ⛔ `onRequest` NÃO É SONDADA (hoje, `createCheckoutSession`): ela não fala esse protocolo, e um
 * payload que passasse na validação CRIA sessão de pagamento. Sai como `naoSondada` — e
 * `naoSondada` é VERMELHO: não sondado é não verificado.
 */
const fs = require('fs');
const path = require('path');
const C = require(path.join(__dirname, '..', 'tests', 'contrato-callables'));

const PRAZO_MS = 15000;

/* 404 = não existe. Qualquer outro status = existe e responde (inclusive 429 e 500: limitado ou
 * falhando É existir). Exceção/abort/timeout = não consegui medir. */
function classificarStatus(status) {
  if (status === 'ERRO') return 'desconhecido';
  if (status === 404) return 'ausente';
  if (typeof status === 'number') return 'presente';
  return 'desconhecido';
}

/* ⛔ `fetch` e o temporizador são INJETÁVEIS: importar este arquivo não pode disparar rede. */
async function sondarUm({ nome, regiao }, deps) {
  const _fetch = (deps && deps.fetch) || globalThis.fetch;
  const _setTimeout = (deps && deps.setTimeout) || setTimeout;
  const _clearTimeout = (deps && deps.clearTimeout) || clearTimeout;
  const ctl = (typeof AbortController === 'function') ? new AbortController() : null;
  const t = _setTimeout(() => { try { ctl && ctl.abort(); } catch (e) {} }, PRAZO_MS);
  try {
    const r = await _fetch(C.montarUrl({ nome, regiao }), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: ctl ? ctl.signal : undefined,
    });
    return r.status;
  } catch (e) {
    return 'ERRO';
  } finally {
    _clearTimeout(t);            // ⛔ nos TRÊS desfechos: resposta, rejeição e abort
  }
}

async function sondarTudo(deps) {
  const out = [];
  for (let i = 0; i < C.TABELA.length; i += 8) {
    const lote = C.TABELA.slice(i, i + 8);
    /* ⛔ `naoSondada` não monta nem dispara requisição: é a trava que impede um `onRequest`
     * de receber a sonda. */
    const res = await Promise.all(lote.map(async (l) => (l.modo === 'naoSondada')
      ? { nome: l.nome, regiao: l.regiao, classificacao: 'naoSondada' }
      : { nome: l.nome, regiao: l.regiao, classificacao: classificarStatus(await sondarUm(l, deps)) }));
    res.forEach((x) => out.push(x));
  }
  return out.sort((a, b) => (a.nome + a.regiao).localeCompare(b.nome + b.regiao));
}

/* Validador PURO do baseline — exportado para a suíte testar sem rede. */
function validarBaseline(v) {
  const erros = [];
  if (!Array.isArray(v)) return ['baseline não é um array'];
  const vistos = new Set();
  v.forEach((it, i) => {
    if (!it || typeof it !== 'object' || Array.isArray(it)) { erros.push('item ' + i + ' não é objeto'); return; }
    const ks = Object.keys(it).sort().join(',');
    if (ks !== 'classificacao,nome,regiao') { erros.push('item ' + i + ' tem campos ' + ks); return; }
    if (typeof it.nome !== 'string' || typeof it.regiao !== 'string' || typeof it.classificacao !== 'string') {
      erros.push('item ' + i + ' tem campo não-string'); return;
    }
    if (!C.REGIOES.includes(it.regiao)) erros.push('item ' + i + ' região inválida: ' + it.regiao);
    if (!C.CLASSIFICACOES.includes(it.classificacao)) erros.push('item ' + i + ' classificação inválida: ' + it.classificacao);
    const k = it.nome + '|' + it.regiao;
    if (vistos.has(k)) erros.push('duplicado: ' + k);
    vistos.add(k);
  });
  return erros;
}

/* Diferença BIDIRECIONAL: item extra OU faltante reprova. */
function compararComBaseline(atual, base) {
  const chave = (x) => x.nome + '|' + x.regiao;
  const mapa = new Map(base.map((x) => [chave(x), x]));
  const difs = [];
  atual.forEach((x) => {
    const b = mapa.get(chave(x));
    if (!b) { difs.push('novo: ' + chave(x)); return; }
    if (b.classificacao !== x.classificacao) difs.push(chave(x) + ': ' + b.classificacao + ' → ' + x.classificacao);
    mapa.delete(chave(x));
  });
  mapa.forEach((_, k) => difs.push('sumiu: ' + k));
  return difs;
}

module.exports = { classificarStatus, sondarUm, sondarTudo, validarBaseline, compararComBaseline, PRAZO_MS };

/* ⛔ CLI só sob require.main: importar este arquivo NUNCA dispara rede. */
if (require.main === module) {
  (async () => {
    const arqBase = process.argv[2] || null;
    const atual = await sondarTudo();
    let ruim = 0;
    atual.forEach((x) => {
      const mau = x.classificacao !== 'presente';
      if (mau) ruim++;
      console.log((mau ? '  ✗ ' : '  ✓ ') + x.nome + '  [' + x.regiao + ']  ' + x.classificacao);
    });
    if (arqBase) {
      let base;
      try { base = JSON.parse(fs.readFileSync(arqBase, 'utf8')); }
      catch (e) { console.error('✗ baseline ilegível: ' + e.message); process.exit(1); }
      const erros = validarBaseline(base);
      if (erros.length) { console.error('✗ baseline inválido:\n  ' + erros.join('\n  ')); process.exit(1); }
      const difs = compararComBaseline(atual, base);
      if (difs.length) { console.error('✗ diferenças contra o baseline:\n  ' + difs.join('\n  ')); process.exit(1); }
      console.log('\n✅ igual ao baseline');
    } else {
      fs.writeFileSync('/dev/stderr', JSON.stringify(atual, null, 1) + '\n');
    }
    console.log('\n' + (ruim ? '✗ ' + ruim + ' não-presente(s)' : '✅ todas presentes'));
    process.exit(ruim ? 1 : 0);
  })();
}
