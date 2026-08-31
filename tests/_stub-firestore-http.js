/* FIXTURE (não é suíte) — dublê de `node:https` e do gcloud, injetado por `--require`.
 *
 * Serve a `tests/conferidor-entrega-o-veredito.test.js`, que precisa executar o
 * CONFERIDOR REAL como subprocesso e capturar stdout/stderr — a única forma de provar que
 * ele ENTREGA o veredito, que foi o defeito relatado (o Codex recebeu saída vazia).
 *
 * ⭐ POR QUE `--require` E NÃO UM PARÂMETRO NO SCRIPT: o preload roda ANTES do script, então
 * dá pra trocar `https.request` e `execSync` sem que o conferidor saiba que existe teste. Se
 * eu tivesse aberto uma variável de ambiente pra apontar outro servidor, teria acrescentado
 * superfície de produção só pra testar — e um script de auditoria que aceita mudar de alvo é
 * pior do que um que não testo.
 *
 * ⛔ Ele também é a prova de que NÃO HÁ ESCRITA: todo método que passar por aqui é anotado em
 * `SP_STUB_METODOS`, e o teste falha se aparecer qualquer coisa além de GET.
 */
'use strict';
const fs = require('fs');
const https = require('node:https');
const cp = require('child_process');

const cenario = JSON.parse(fs.readFileSync(process.env.SP_STUB_CENARIO, 'utf8'));
const anota = process.env.SP_STUB_METODOS;

/* gcloud não existe aqui — e não precisa. */
cp.execSync = function (cmd) {
  if (cenario.tokenFalha) { const e = new Error(cenario.tokenFalha); throw e; }
  return (cenario.token || 'token-de-mentira') + '\n';
};

function respostaPara(caminho) {
  for (const r of (cenario.rotas || [])) {
    if (caminho.indexOf(r.contem) !== -1) return r;
  }
  return { status: 404, body: '{}' };
}

https.request = function (opts, cb) {
  const req = {
    _ouv: {},
    on(ev, fn) { this._ouv[ev] = fn; return this; },
    destroy(err) { if (this._ouv.error) this._ouv.error(err); },
    end() {
      if (anota) fs.appendFileSync(anota, String(opts.method) + ' ' + String(opts.path) + '\n');
      /* ⛔ SILÊNCIO ABSOLUTO — a condição que reprovou a leva contra produção: nenhum socket,
       * nenhum evento, nenhuma resposta. Quem tem que terminar aqui é o DEADLINE do
       * transporte. Sem este caso, o dublê só percorria caminhos que já respondiam. */
      if (cenario.nuncaResponde) return;
      process.nextTick(() => {
        /* falha de rede: o helper decide se retenta, pelo código */
        if (cenario.erroDeRede) {
          const e = Object.assign(new Error('dublê: falha de rede simulada'), { code: cenario.erroDeRede });
          if (this._ouv.error) this._ouv.error(e);
          return;
        }
        const r = respostaPara(String(opts.path || ''));
        const res = {
          statusCode: r.status,
          setEncoding() {},
          _o: {},
          on(ev, fn) { this._o[ev] = fn; return this; }
        };
        cb(res);
        process.nextTick(() => {
          if (res._o.data) res._o.data(r.body == null ? '' : String(r.body));
          if (res._o.end) res._o.end();
        });
      });
    }
  };
  return req;
};
