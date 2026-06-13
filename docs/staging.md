# Ambiente de staging — scoreplace.app

Ambiente **isolado** pra testar mudanças arriscadas sem encostar nos dados reais
do Confra / produção. Criado em 2026-06-13.

- **URL:** https://scoreplace-staging.web.app
- **Projeto Firebase:** `scoreplace-staging` (separado de `scoreplace-app` = produção)
- **Banco/Auth/contas:** próprios e isolados — nada vaza pra produção.

## Como a troca prod↔staging funciona

`js/views/auth.js` escolhe a config do Firebase por **hostname**:
- host contém `scoreplace-staging` → projeto **staging**
- qualquer outro host (scoreplace.app, localhost) → projeto **produção** (intocado)

Exposto em `window.SCOREPLACE_ENV` (`'staging'` | `'prod'`). O MESMO código roda
nos dois ambientes; só o backend muda. Por isso testar no staging exercita o
código real que vai pra produção.

## Deploy pro staging (comandos)

Sempre com `--project scoreplace-staging` explícito. **Nunca** usar `--only functions`
solto aqui (footgun: ameaça apagar o outro codebase — ver [[project_autodraw_deploy_footgun]]).

```bash
# Cara do app (frontend) — serve o diretório atual (working dir, inclui WIP):
firebase deploy --only hosting --project scoreplace-staging

# Regras + índices do Firestore (replicados de produção):
firebase deploy --only firestore:rules,firestore:indexes --project scoreplace-staging
```

## Estado atual

- ✅ Projeto criado, app web registrado, config fiada no código.
- ✅ Firestore (default db, location nam5) + regras + índices replicados de prod.
- ✅ Frontend publicado e verificado (env switch funcionando nos dois lados).
- ⏳ **Login com Google** — precisa ser habilitado 1x no console (tarefa do dono):
  Firebase console → scoreplace-staging → Authentication → Get started →
  Sign-in method → Google → Enable → escolher support email → Save.
  Os domínios `scoreplace-staging.web.app`/`.firebaseapp.com` já entram como
  autorizados automaticamente.
- ⏳ **Cloud Functions** (autoDraw / WhatsApp / email) — NÃO replicadas ainda.
  O núcleo (login + Firestore) já permite testar quase tudo. Replicar quando
  precisar testar sorteio automático / notificações.

## Dado real pra reproduzir bug

Staging começa vazio. Pra reproduzir um bug que só aparece com dado real
bagunçado, puxar uma cópia recente de produção pro staging (backup diário +
acesso REST já existem) — o original de produção fica intocado.
