# Migração do WhatsApp (Evolution API): Railway → VPS (Hetzner) + backup no Google Drive

Substitui o Railway por um VPS de custo fixo, com Evolution + Postgres + Caddy (HTTPS automático)
e **backup diário do Postgres pro Google Drive** (via rclone). Acaba o "used all your available resources".

Stack: `docker-compose.yml` (Evolution v2.3.7 + Postgres 16 + Caddy 2). Backup: `backup/pg-backup.sh`
disparado por `scoreplace-pg-backup.timer` (systemd), 1x/dia às 03:30, com rotação de 7 dias.

---

## O que é automatizado vs. o que é seu

**Automatizado (já pronto no repo, roda via `bootstrap.sh`):** instala Docker + rclone, firewall,
sobe os 3 containers, HTTPS automático (Caddy/Let's Encrypt), agenda o backup pro Drive.

**Irredutivelmente seu (não dá pra eu fazer):**
1. Criar a conta Hetzner e **pôr forma de pagamento** (ação financeira).
2. **Autorizar o rclone** na sua conta Google, uma vez (`rclone config` → conceder OAuth).
3. Apontar 1 registro **DNS** e **escanear o QR** do WhatsApp.

---

## Passo a passo

### 1. Criar o VPS (você, ~5 min)
- [hetzner.com/cloud](https://www.hetzner.com/cloud) → conta + pagamento.
- New Server → **Ubuntu 24.04** → tipo **CX22** (2 vCPU / 4 GB) → região à escolha.
- Adicione sua **chave SSH** (pra entrar sem senha).
- Anote o **IP** do servidor.

### 2. DNS (você, ~2 min)
- No painel do domínio `scoreplace.app`, crie um registro **A**: `wa` → `<IP do VPS>`.
  (Resultado: `wa.scoreplace.app` aponta pro VPS. O Caddy cuida do HTTPS sozinho.)

### 3. Subir a stack (automático)
No seu Mac, mande a pasta pro servidor e rode o bootstrap:
```bash
cd "infra/whatsapp"
scp -r . root@<IP>:/root/scoreplace-wa-setup
ssh root@<IP> "cd /root/scoreplace-wa-setup && sudo bash bootstrap.sh"
```
O bootstrap pergunta o domínio (`wa.scoreplace.app`), gera os segredos e sobe tudo.
**Guarde a `EVOLUTION_API_KEY` que ele imprime.**

### 4. Backup pro Google Drive (você autentica uma vez)
```bash
ssh root@<IP>
rclone config
#  n (new) → name: gdrive → storage: drive → siga o link de login do Google
#  (use "headless"/remote auth: ele te dá um comando pra rodar no seu Mac e colar o token)
```
Testar o backup imediatamente:
```bash
/opt/scoreplace-wa/backup/pg-backup.sh && tail /var/log/scoreplace-pg-backup.log
```
Deve aparecer `OK: evolution-....sql.gz enviado`. Confira a pasta `scoreplace-wa-backups` no seu Drive.

### 5. Parear o WhatsApp (você, ~3 min)
- Abra `https://wa.scoreplace.app/manager` → login com a `AUTHENTICATION_API_KEY`.
- Create instance → nome **`scoreplace`** → escaneie o QR no **WhatsApp Business** do eSIM Vivo.
  - *(Alternativa sem re-parear: migrar o dump do Postgres do Railway — ver "Preservar a sessão" abaixo.)*

### 6. Apontar o Firebase pro host novo (você roda, ~2 min)
```bash
firebase functions:secrets:set EVOLUTION_API_URL   # https://wa.scoreplace.app
firebase functions:secrets:set EVOLUTION_API_KEY   # a key do passo 3
firebase functions:secrets:set EVOLUTION_INSTANCE  # scoreplace
firebase deploy --only functions:processWhatsAppQueue --project scoreplace-app
```
Mande um WhatsApp de teste pelo app pra confirmar a entrega.

### 7. Desligar o Railway (depois de validar)
Só **depois** de tudo funcionando no VPS: no Railway, remova o serviço/projeto
`scoreplace-whatsapp` (e os volumes órfãos) pra parar a cobrança.

---

## Preservar a sessão (opcional — evita re-parear o QR)
A sessão do WhatsApp vive no Postgres. Pra não escanear o QR de novo, migre o banco:
```bash
# 1) dump do Postgres do Railway (precisa da DATABASE_URL do Railway)
pg_dump "<DATABASE_URL_DO_RAILWAY>" | gzip > railway-evolution.sql.gz
# 2) restaurar no VPS, ANTES de criar a instância no /manager
gunzip -c railway-evolution.sql.gz | ssh root@<IP> "docker exec -i scoreplace-postgres psql -U evolution -d evolution"
# 3) reiniciar o Evolution
ssh root@<IP> "cd /opt/scoreplace-wa && docker compose restart evolution"
```
Se der ruído, é só seguir o pareamento normal por QR (passo 5).

## Restaurar de um backup do Drive (caso o VPS morra)
```bash
rclone copy gdrive:scoreplace-wa-backups/evolution-AAAA-MM-DD_HHMM.sql.gz .
gunzip -c evolution-*.sql.gz | docker exec -i scoreplace-postgres psql -U evolution -d evolution
docker compose restart evolution
```

## Operação do dia a dia
- Logs:        `docker compose -f /opt/scoreplace-wa/docker-compose.yml logs -f evolution`
- Reiniciar:   `cd /opt/scoreplace-wa && docker compose restart evolution`
- Backup já:   `/opt/scoreplace-wa/backup/pg-backup.sh`
- Ver timer:   `systemctl status scoreplace-pg-backup.timer` · `systemctl list-timers | grep scoreplace`
- Atualizar Evolution: bump da tag em `docker-compose.yml` → `docker compose pull && docker compose up -d`
