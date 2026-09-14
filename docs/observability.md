# Observability — Sentry boilerplate

**Status:** Sentry ativo no bundle público. A versão 2.3.14 declara o DSN
antes de carregar `js/sentry-init.js`; os helpers de captura, portanto, não
estão em modo no-op em produção. O modo sem DSN continua sendo uma reserva
para previews e desenvolvimento local.
**Arquivo:** `js/sentry-init.js`
**Carregamento:** sync no `<head>`, antes de qualquer outro script — captura
erros em qualquer ponto do boot, inclusive em scripts deferidos.

---

## Estado sem DSN

Sem DSN o app boota normal. Os helpers `_captureException`/
`_captureMessage` ficam expostos como no-op — callers podem usá-los sem
ramificar o fluxo. Essa reserva atende previews e desenvolvimento local; não
descreve a produção atual.

## Como ativar em DEV (sem commitar DSN)

Numa aba qualquer do app:
```js
localStorage.setItem('scoreplace_sentry_dsn', 'https://SEU_DSN');
location.reload();
```

Pra desativar:
```js
localStorage.removeItem('scoreplace_sentry_dsn');
```

## Configuração padrão

| Setting | Valor | Justificativa |
|---|---|---|
| `release` | `scoreplace@<SCOREPLACE_VERSION>` | Agrupa errors por versão deployada |
| `environment` | `production` se hostname=`scoreplace.app`, `preview` caso contrário | Distingue prod de localhost/preview |
| `sampleRate` | `1.0` | Capturar 100% dos errors em alpha/beta — volume baixo |
| `tracesSampleRate` | `0.05` | 5% das transações pra perf budget — controla custo |
| `ignoreErrors` | Filtra `ResizeObserver`, `chrome-extension://`, etc. | Ruído conhecido do ecossistema |
| `beforeSend` | Anonimiza email/displayName, adiciona tag `route` | Privacy + agrupa por área |

## Pré-init buffer

Errors entre o boot do app e o load do SDK CDN (~100ms-1s) são bufferizados.
`window.onerror` e `window.onunhandledrejection` empilham eventos num array
local; quando o SDK termina de carregar, o array é drenado pra Sentry.

Importante: **as funções helpers já no boot** (`_captureException`,
`_captureMessage`) **também usam o buffer** se chamadas antes do SDK estar
pronto.

## Como usar nos call sites

```js
try {
  doSomethingDangerous();
} catch (err) {
  // Silent fail pro user, mas captura pra Sentry
  window._captureException(err, { tournament: t.id, action: 'save' });
  showNotification('⚠️ Algo deu errado', 'Tente novamente', 'error');
}

// Custom message (ex: estado inesperado)
if (foundStaleData) {
  window._captureMessage('Stale data on tournament load', 'warning');
}
```

Não envolver TODO try/catch — só callsites onde o usuário enxerga erro
genérico (ex: "tente novamente") e a equipe precisa diagnosticar.

## Privacy

`beforeSend` deleta:
- `event.user.email`
- `event.user.username`

E o DSN público (não o secret) tem acesso só de write. Sem leak de PII.

Nunca enviar pra Sentry: senhas, tokens, mensagens privadas, dados de torneio
de usuários reais. Já filtra automaticamente — se precisar adicionar mais
campos sensíveis, estender o `beforeSend` em `js/sentry-init.js`.

## Custos

Sentry free tier: 5K errors/mês + 10K transactions/mês. Suficiente pra alpha
e início de beta. Se o volume estourar, desativar `tracesSampleRate` (vai
pra zero) ou pegar paid plan.

## Logger centralizado (v0.17.67)

`js/logger.js` define wrappers compatíveis com `console`:

```js
window._log('debug info');      // dev: console.log; prod: silenciado
window._debug('verbose');       // dev: console.debug; prod: silenciado
window._warn('alguma coisa');   // sempre console.warn + Sentry breadcrumb
window._error('falhou', err);   // sempre console.error + Sentry breadcrumb
```

**Detecção dev vs prod:**
- `location.hostname === 'scoreplace.app'` → modo prod
- Qualquer outro → modo dev (localhost, preview, deploy alternativo)

**Forçar verbose em prod:**
```js
localStorage.setItem('scoreplace_debug', '1');
location.reload();
```

`window._loggerMode` expõe o modo atual (`'dev'`, `'prod-quiet'`, `'prod-debug'`).

**Sentry breadcrumbs:** quando DSN estiver plugada, todos os `_log/_debug/_warn/_error`
populam breadcrumbs automaticamente — quando um erro acontecer, o Sentry mostra
o trail completo do que aconteceu antes. Sem DSN, breadcrumbs são no-op
(`window.Sentry` não existe).

**Migração progressiva (não-bloqueante):** call-sites antigos com `console.log`
direto continuam funcionando. Novos código pode usar o wrapper. Refactor
massivo dos 200+ `console.*` existentes pode ser feito em sprint dedicada
quando fizer sentido.

## Próximos passos (não-bloqueantes pra beta)

- [ ] Adicionar Sentry Releases via GitHub Action no deploy (`sentry-cli releases`).
- [ ] Source maps upload se algum dia vier minificação/build step.
- [ ] Migrar `console.log/warn/error` em arquivos críticos pra `window._log/_warn/_error`
      progressivamente — começar por `auth.js` (81 calls) e `firebase-db.js` (40 calls).

## Resposta operacional

| Sinal | Primeira verificação | Ação se persistir |
|---|---|---|
| Erro novo no Sentry | release, rota e primeiro stack trace; confirmar que não há dado pessoal no evento | interromper nova publicação da mesma linha e abrir correção reproduzível |
| Pico de leituras ou escritas Firestore | intervalo de tempo, métrica afetada e última release | comparar com tráfego e identificar a consulta/escrita antes de mexer em quota ou Rules |
| Erros de Cloud Functions | nome da função, código e `cloud_run_revision` da execução | conferir logs da execução; recusar reprocessamento manual até distinguir falha transitória de efeito parcial |
| Dois e-mails de verificação ou reset próximos | horários, release e erros/retries de `sendVerificationEmail` ou `sendPasswordReset` na mesma janela | preservar os dois IDs de outbox para análise; não reenfileirar manualmente antes de distinguir retry do cliente de reentrega do servidor |
| Alerta de orçamento | serviço que cresceu e tendência diária | pausar trabalho que aumente consumo e definir limite ou correção com base na métrica |

Não registrar tokens, e-mails, documentos de torneio ou mensagens de pessoas
na investigação. A identificação operacional é versão, rota, função, janela
de tempo e código de erro.
