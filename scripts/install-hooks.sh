#!/usr/bin/env bash
# install-hooks.sh — liga os hooks versionados de scripts/hooks/ neste clone.
#
# POR QUE EXISTE. Hook NÃO viaja no git: vive em `.git/hooks/`, que não é versionado.
# O repo foi movido pra ~/dev/scoreplace.app em 16/ago/2026 e o `pre-push` que existia
# antes simplesmente NÃO VEIO — ninguém percebeu até a 1.9.106 ir pro ar com o
# `version.txt` do commit em 1.9.105. Manter o código em `scripts/hooks/` (versionado)
# e só LINKAR daqui faz o próximo clone ser um comando, não uma arqueologia.
#
# Uso:  scripts/install-hooks.sh            # instala (symlink)
#       scripts/install-hooks.sh --check    # só confere; sai 1 se faltar algo
#
# ⚠️ Worktree: todas compartilham o `.git/hooks` do repo PAI — instalar uma vez cobre
#    todas (é o que `git rev-parse --git-common-dir` resolve).
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

COMUM="$(cd "$(git rev-parse --git-common-dir)" && pwd)"
DEST="$COMUM/hooks"

# ⚠️ O symlink tem que apontar pra árvore PRINCIPAL, nunca pra worktree de onde este
# script por acaso foi chamado: worktree é descartável (.claude/worktrees/* somem), e um
# hook apontando pra uma que foi apagada é um hook que não roda — silenciosamente, que é
# exatamente a falha que estamos consertando.
PRINCIPAL="$(git worktree list --porcelain | awk '/^worktree /{print substr($0,10); exit}')"
[[ -z "${PRINCIPAL:-}" || ! -d "$PRINCIPAL/scripts/hooks" ]] && PRINCIPAL="$RAIZ"
FONTE="$PRINCIPAL/scripts/hooks"
HOOKS=(pre-commit pre-push)

SO_CONFERE=0
[[ "${1:-}" == "--check" ]] && SO_CONFERE=1

echo "▸ hooks de:  $FONTE"
if [[ ! -d "$FONTE" ]]; then
  echo "✗ $FONTE não existe — a árvore principal está num branch sem os hooks versionados?"
  exit 1
fi
echo "▸ hooks pra: $DEST"

if PATH_CONF="$(git config --get core.hooksPath 2>/dev/null)"; then
  echo "⚠️  core.hooksPath está setado ('$PATH_CONF') — o git vai IGNORAR $DEST."
  echo "   remova com: git config --unset core.hooksPath"
fi

mkdir -p "$DEST"
FALTA=0
for h in "${HOOKS[@]}"; do
  alvo="$DEST/$h"
  if [[ -L "$alvo" && "$(readlink "$alvo")" == "$FONTE/$h" ]]; then
    echo "  ✓ $h já instalado"
    continue
  fi
  FALTA=1
  if [[ $SO_CONFERE -eq 1 ]]; then
    echo "  ✗ $h NÃO instalado"
    continue
  fi
  if [[ -e "$alvo" && ! -L "$alvo" ]]; then
    cp "$alvo" "$alvo.bak-$(date +%Y%m%d%H%M%S)"
    echo "  ▸ $h existia como arquivo próprio — guardei cópia em $alvo.bak-*"
  fi
  ln -sfn "$FONTE/$h" "$alvo"
  chmod +x "$FONTE/$h"
  echo "  ✓ $h instalado"
done

if [[ $SO_CONFERE -eq 1 ]]; then
  [[ $FALTA -eq 1 ]] && { echo; echo "✗ faltam hooks — rode: scripts/install-hooks.sh"; exit 1; }
  echo "✓ todos os hooks instalados"
  exit 0
fi
echo "✓ pronto — vale pra este repo e pra todas as worktrees dele."
