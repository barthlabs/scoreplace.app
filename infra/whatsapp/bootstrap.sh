#!/usr/bin/env bash
# scoreplace.app — bootstrap do VPS (Ubuntu 22.04/24.04) pro Evolution API.
# Instala Docker + rclone, sobe Evolution+Postgres+Caddy e agenda o backup diário.
#
# Uso (como root, num Hetzner zerado, de dentro da pasta infra/whatsapp):
#   sudo bash bootstrap.sh
#
# Idempotente: pode rodar de novo sem quebrar (pula o que já existe).
set -euo pipefail

APP_DIR=/opt/scoreplace-wa
DOMAIN_DEFAULT="wa.scoreplace.app"
SRC="$(cd "$(dirname "$0")" && pwd)"

if [ "$(id -u)" -ne 0 ]; then echo "Rode como root: sudo bash bootstrap.sh"; exit 1; fi

echo "==> 1/7 sistema + dependências base"
apt-get update -y
apt-get install -y ca-certificates curl gnupg ufw openssl

echo "==> 2/7 Docker"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi

echo "==> 3/7 rclone"
command -v rclone >/dev/null 2>&1 || curl -fsSL https://rclone.org/install.sh | bash

echo "==> 4/7 firewall (SSH, HTTP, HTTPS)"
ufw allow OpenSSH >/dev/null 2>&1 || true
ufw allow 80/tcp  >/dev/null 2>&1 || true
ufw allow 443/tcp >/dev/null 2>&1 || true
yes | ufw enable   >/dev/null 2>&1 || true

echo "==> 5/7 copiando arquivos pra ${APP_DIR}"
mkdir -p "$APP_DIR/backup"
cp "$SRC/docker-compose.yml"               "$APP_DIR/"
cp "$SRC/Caddyfile"                         "$APP_DIR/"
cp "$SRC/backup/pg-backup.sh"               "$APP_DIR/backup/"
chmod +x "$APP_DIR/backup/pg-backup.sh"
cp "$SRC/backup/scoreplace-pg-backup.service" /etc/systemd/system/
cp "$SRC/backup/scoreplace-pg-backup.timer"   /etc/systemd/system/

echo "==> 6/7 gerando .env (segredos aleatórios)"
DOMAIN=""
if [ ! -f "$APP_DIR/.env" ]; then
  read -rp "Domínio público do Evolution [${DOMAIN_DEFAULT}]: " DOMAIN
  DOMAIN="${DOMAIN:-$DOMAIN_DEFAULT}"
  PGPASS="$(openssl rand -hex 24)"
  APIKEY="$(openssl rand -hex 32)"
  sed -e "s|__DOMAIN__|${DOMAIN}|g" \
      -e "s|__POSTGRES_PASSWORD__|${PGPASS}|g" \
      -e "s|__AUTHENTICATION_API_KEY__|${APIKEY}|g" \
      "$SRC/.env.vps.example" > "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  echo ""
  echo "   >>> GUARDE (vão pros secrets do Firebase): "
  echo "       EVOLUTION_API_URL = https://${DOMAIN}"
  echo "       EVOLUTION_API_KEY = ${APIKEY}"
  echo ""
else
  DOMAIN="$(grep -E '^DOMAIN=' "$APP_DIR/.env" | cut -d= -f2)"
  echo "   .env já existe — mantido (DOMAIN=${DOMAIN})."
fi

echo "==> 7/7 subindo containers + agendando backup diário"
cd "$APP_DIR"
docker compose pull
docker compose up -d
systemctl daemon-reload
systemctl enable --now scoreplace-pg-backup.timer

cat <<EOF

============================================================
 PRONTO. Faltam 4 passos manuais (rápidos):

 1) DNS  — crie um registro A:  ${DOMAIN}  ->  <IP deste VPS>
           (o Caddy emite o HTTPS sozinho quando o DNS propagar)

 2) Drive — autentique o rclone (uma vez):
           rclone config
           # n) new remote -> nome: gdrive -> tipo: drive -> siga o login Google

 3) WhatsApp — pareie a instância:
           https://${DOMAIN}/manager  (login = AUTHENTICATION_API_KEY)
           Create instance: "scoreplace" -> escaneie o QR no WhatsApp Business (eSIM)

 4) Firebase — aponte as functions pro host novo e redeploy:
           firebase functions:secrets:set EVOLUTION_API_URL   # https://${DOMAIN}
           firebase functions:secrets:set EVOLUTION_API_KEY   # a key do .env
           firebase deploy --only functions:processWhatsAppQueue --project scoreplace-app

 Testar o backup já:
           /opt/scoreplace-wa/backup/pg-backup.sh && tail /var/log/scoreplace-pg-backup.log
============================================================
EOF
