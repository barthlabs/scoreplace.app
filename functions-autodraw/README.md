# autoDraw — Cloud Function (codebase separado)

Função scheduled `autoDraw` + `sendPushNotification`, deploy em **us-central1** (nodejs24).
É um codebase SEPARADO do `functions/` principal (que roda em southamerica-east1).

## Bug corrigido (v2.3.70 / 10-jun-2026)
O horário agendado (`drawFirstDate`+`drawFirstTime`) é hora local BRT. O servidor roda
em UTC; sem offset, `new Date("...T19:00:00")` virava 19:00 UTC = 16:00 BRT → sorteio
disparava ~3h ANTES. Fix: anexar `-03:00` (BRT, sem horário de verão desde 2019).

## Deploy
```
cd functions-autodraw && npm install
firebase deploy --only functions:autoDraw --project scoreplace-app
```
