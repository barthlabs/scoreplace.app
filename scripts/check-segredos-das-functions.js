#!/usr/bin/env node
/* check-segredos-das-functions.js — TRAVA: todo segredo que o código exige tem de existir
 * e ser LEGÍVEL pela conta de publicação ANTES do deploy.
 *
 * POR QUE EXISTE (22/set/2026). A leva 1 da reforma criou uma função com segredo próprio e
 * o deploy falhou TRÊS vezes seguidas, com erros diferentes, porque as permissões de
 * segredo são QUATRO e cada uma só aparece depois que a anterior sai:
 *   1. `secretAccessor` na conta de PUBLICAÇÃO   → ler o valor
 *   2. `secretmanager.viewer` na conta de PUBLICAÇÃO → `secrets.get`, o METADADO, que a
 *      CLI consulta antes de subir. O 403 dela não parece problema de segredo.
 *   3. `secretAccessor` na conta de EXECUÇÃO (`<num>-compute@developer`) → é ela que roda
 *   4. `secretmanager.admin` na conta de PUBLICAÇÃO → a CLI tenta conceder o item 3 sozinha
 *
 * ⛔ E o pior desfecho não é o deploy falhar: é ele PASSAR com o segredo ausente. A função
 * sobe, e toda consulta morre em `failed-precondition` — um defeito que só aparece para o
 * usuário, em produção. A trava anterior só conferia `SIGNIN_API_KEY`, fixo no script.
 *
 * O QUE ELA FAZ: lê os `defineSecret("NOME")` do CÓDIGO (nada fixo aqui dentro) e, para
 * cada um, confere METADADO e VALOR com a credencial em uso.
 *
 * Uso:  node scripts/check-segredos-das-functions.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const CODEBASES = ['functions', 'functions-autodraw', 'functions-stripe'];
const PROJETO = process.env.SP_PROJETO || 'scoreplace-app';

function segredosDoCodigo() {
  const achados = new Map();   // nome → arquivos
  CODEBASES.forEach((cb) => {
    const dir = path.join(RAIZ, cb);
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).filter((f) => f.endsWith('.js')).forEach((f) => {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      const re = /defineSecret\(\s*["']([A-Z0-9_]+)["']\s*\)/g;
      let m;
      while ((m = re.exec(src))) {
        if (!achados.has(m[1])) achados.set(m[1], []);
        achados.get(m[1]).push(cb + '/' + f);
      }
    });
  });
  return achados;
}

async function conferir(nome, token) {
  const base = 'https://secretmanager.googleapis.com/v1/projects/' + PROJETO + '/secrets/' + nome;
  const cab = { headers: { Authorization: 'Bearer ' + token } };
  const meta = await fetch(base, cab);
  if (!meta.ok) return { ok: false, onde: 'metadado', status: meta.status };
  const valor = await fetch(base + '/versions/latest:access', cab);
  if (!valor.ok) return { ok: false, onde: 'valor', status: valor.status };
  return { ok: true };
}

(async () => {
  const segredos = segredosDoCodigo();
  if (!segredos.size) { console.log('✓ nenhum segredo exigido pelo código'); return; }

  let auth;
  try {
    const { GoogleAuth } = require(path.join(RAIZ, 'functions', 'node_modules', 'google-auth-library'));
    auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  } catch (e) {
    console.log('⚠️  google-auth-library indisponível — pulando (rode dentro do repo com node_modules)');
    return;
  }
  let token;
  try {
    token = (await (await auth.getClient()).getAccessToken()).token;
  } catch (e) {
    console.log('⚠️  sem credencial para conferir segredos — pulando');
    return;
  }

  const ruins = [];
  for (const [nome, arquivos] of segredos) {
    const r = await conferir(nome, token);
    if (!r.ok) ruins.push({ nome, arquivos, onde: r.onde, status: r.status });
  }

  if (!ruins.length) {
    console.log('✓ segredos das functions: ' + segredos.size + ' exigido(s) pelo código, todos legíveis');
    return;
  }

  console.error('\n✗ SEGREDO EXIGIDO PELO CÓDIGO E NÃO LEGÍVEL — o deploy passaria e a função');
  console.error('  morreria em produção na primeira consulta:\n');
  ruins.forEach((r) => {
    console.error('  • ' + r.nome + '  (' + r.onde + ': HTTP ' + r.status + ')');
    console.error('      exigido por: ' + r.arquivos.join(', '));
  });
  console.error('\n  São QUATRO concessões, e conceder uma de cada vez custa três deploys:');
  console.error('    gcloud secrets create <NOME> --project=' + PROJETO + ' --replication-policy=automatic --data-file=-');
  console.error('    ...add-iam-policy-binding <NOME> --member=serviceAccount:<PUBLICACAO> --role=roles/secretmanager.secretAccessor');
  console.error('    ...add-iam-policy-binding <NOME> --member=serviceAccount:<PUBLICACAO> --role=roles/secretmanager.viewer');
  console.error('    ...add-iam-policy-binding <NOME> --member=serviceAccount:<PUBLICACAO> --role=roles/secretmanager.admin');
  console.error('    ...add-iam-policy-binding <NOME> --member=serviceAccount:<NUM>-compute@developer.gserviceaccount.com --role=roles/secretmanager.secretAccessor');
  process.exit(1);
})().catch((e) => { console.error('✗ check-segredos-das-functions falhou:', e && e.message); process.exit(1); });
