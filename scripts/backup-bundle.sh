#!/usr/bin/env bash
# Mantém o backup do repo (o .bundle no Google Drive) EMPATADO com o main.
#
# POR QUE ISSO É UM SCRIPT E NÃO UMA LINHA NO CLAUDE.md
# -----------------------------------------------------
# Em 22/ago/2026 o bundle estava em 1.8.93 com o ar em 2.0.6 — 225 commits atrás.
# Ninguém errou comando: o LEIA-ME do Drive descrevia o procedimento à mão, e
# procedimento à mão não é executado. O backup é a segunda rede pra quando o
# GitHub cai (já caiu no meio de uma publicação, em 06/ago/2026); uma segunda
# rede 225 commits atrás não é rede. Ordem do dono: "tem que sempre atualizar
# tudo para tudo ficar junto".
#
# Roda sozinho no fim do scripts/deploy-hosting.sh. Nunca derruba um deploy que
# já foi publicado: se o Drive não estiver montado, ele GRITA e sai 0.
#
#   scripts/backup-bundle.sh           # atualiza se estiver defasado
#   scripts/backup-bundle.sh --check   # só reporta (sai 1 se defasado)
#   scripts/backup-bundle.sh --force   # regenera mesmo já empatado
set -euo pipefail

DRIVE="${SP_DRIVE_BACKUP:-/Users/rtb/Library/CloudStorage/GoogleDrive-rstbarth@gmail.com/Meu Drive/scoreplace.app-main}"
ALVO="$DRIVE/scoreplace-backup.bundle"
TMP="/tmp/scoreplace-backup.$$.bundle"

CHECK=0; FORCE=0
for a in "$@"; do
  case "$a" in
    --check) CHECK=1 ;;
    --force) FORCE=1 ;;
    *) echo "uso: $0 [--check|--force]" >&2; exit 2 ;;
  esac
done

cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
HEAD_MAIN="$(git rev-parse main 2>/dev/null || true)"
if [[ -z "$HEAD_MAIN" ]]; then
  echo "⚠ backup: não achei o branch 'main' — pulando." >&2
  exit 0
fi

if [[ ! -d "$DRIVE" ]]; then
  echo "⚠ backup NÃO atualizado: a pasta do Drive não está montada."
  echo "  $DRIVE"
  echo "  O bundle é a rede de baixo (o GitHub é a de cima). Rode 'scripts/backup-bundle.sh'"
  echo "  quando o Drive voltar — ele guarda também a keystore do Android."
  exit 0
fi

# quanto o backup atual está atrás?
ATUAL=""
if [[ -f "$ALVO" ]]; then
  ATUAL="$(git bundle list-heads "$ALVO" 2>/dev/null | awk '$2=="refs/heads/main"{print $1}' || true)"
fi

if [[ "$ATUAL" == "$HEAD_MAIN" && $FORCE -eq 0 ]]; then
  echo "✓ backup já empatado com main (${HEAD_MAIN:0:8})"
  exit 0
fi

ATRAS="?"
if [[ -n "$ATUAL" ]]; then
  ATRAS="$(git rev-list --count "$ATUAL..main" 2>/dev/null || echo '?')"
fi

if [[ $CHECK -eq 1 ]]; then
  ONDE="${ATUAL:0:8}"; [[ -z "$ONDE" ]] && ONDE="(sem bundle)"
  echo "✗ backup DEFASADO: bundle em $ONDE · main em ${HEAD_MAIN:0:8} (${ATRAS} commits atrás)"
  exit 1
fi

echo "▸ backup: regerando o bundle (${ATRAS} commits atrás)…"

# ⚠️ Gerar em /tmp e SÓ DEPOIS mover: gerar direto no Drive faz o Drive sincronizar
# o arquivo pela metade enquanto ele ainda está sendo escrito.
trap 'rm -f "$TMP"' EXIT
git bundle create "$TMP" --all >/dev/null 2>&1

# ⚠️ Verificar ANTES de trocar. Um bundle corrompido que substitui um bundle bom
# é pior que não ter backup nenhum: parece que existe.
if ! git bundle verify "$TMP" >/dev/null 2>&1; then
  echo "✗ backup: o bundle gerado NÃO passou no verify — o antigo foi mantido." >&2
  exit 0
fi

mv "$TMP" "$ALVO"
trap - EXIT
echo "✓ backup empatado com main (${HEAD_MAIN:0:8}) · $(du -h "$ALVO" | cut -f1) em $ALVO"
