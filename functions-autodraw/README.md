# autoDraw — Cloud Function (codebase separado)

Função scheduled `autoDraw` + `sendPushNotification`, deploy em **us-central1** (nodejs24).
É um codebase SEPARADO do `functions/` principal (que roda em southamerica-east1).

## Bug corrigido (v2.3.70 / 10-jun-2026)
O horário agendado (`drawFirstDate`+`drawFirstTime`) é hora local BRT. O servidor roda
em UTC; sem offset, `new Date("...T19:00:00")` virava 19:00 UTC = 16:00 BRT → sorteio
disparava ~3h ANTES. Fix: anexar `-03:00` (BRT, sem horário de verão desde 2019).

## Testes (rodar SEMPRE antes de deployar — o sorteio é a área mais sensível do app)
```
cd functions-autodraw
node test-draw.js        # sorteio real (73/140/142 + multi-rodada)
node test-groupsby.js    # agrupamento
node test-orphan-uid.js  # identidade por uid / órfãos
node test-format2.js     # format2: paridade cliente×servidor + contrato do doc
```
Mais `npm test` na raiz (85 suítes). Os `test-*.js` são excluídos do deploy (ver `ignore`).

## Cânone de formato no servidor (jul/2026)
`draw-core.compileFromFmt2(t)` recompila `t.phases[]` + campos top-level a partir da config
crua em `t.fmt2` — o MESMO `FORMAT2.compileToPhases` do cliente (vendored).

**Por quê:** `compileToPhases` roda no *salvar* do cliente e grava `t.phases` no doc. App velho
→ format2 velho → doc já errado, e o sorteio (mesmo o do servidor) executaria a config errada.
Recompilar do intent (`t.fmt2`) no servidor mata o bug de versão na raiz.

- **Legado:** torneio sem `t.fmt2` → `{ok:false, reason:'no-fmt2'}`; o caller confia no
  `t.phases` do doc (não inventa config).
- ⚠️ **Só chamar quando `canRecompile(t)` for true** (fase 0, sem chave). Recompilar no meio do
  torneio atropelaria `currentPhaseIndex`/`_phaseMaterialized`.
- `test-format2.js` prova a paridade carregando `js/views/format2.js` e `vendor/format2.js` em
  contextos VM isolados e comparando a saída de uma bateria de configs. Injete um drift no
  vendor e o teste fica vermelho — é a rede que sustenta a canonização.

## Deploy
```
cd functions-autodraw && npm install
firebase deploy --only functions:autoDraw --project scoreplace-app
```
⚠️ **NUNCA** `firebase deploy --only functions` (sem nome) daqui: este `firebase.json` não
define `codebase` → cai no `default`, o mesmo do `functions/`, e o deploy genérico tenta
DELETAR as ~28 funções do outro codebase. Sempre alvejar por nome.
