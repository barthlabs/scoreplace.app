#!/usr/bin/env bash
# install-hooks.sh — liga os hooks versionados de scripts/hooks/ neste clone.
#
# POR QUE EXISTE. Hook NÃO viaja no git: vive em `.git/hooks/`, que não é versionado.
# O repo foi movido pra ~/dev/scoreplace.app em 16/ago/2026 e o `pre-push` que existia
# antes simplesmente NÃO VEIO — ninguém percebeu até a 1.9.106 ir pro ar com o
# `version.txt` do commit em 1.9.105. Manter o código em `scripts/hooks/` (versionado)
# e só LIGAR daqui faz o próximo clone ser um comando, não uma arqueologia.
#
# Uso:  scripts/install-hooks.sh            # instala
#       scripts/install-hooks.sh --check    # só confere; sai 1 se faltar algo
#
# ⚠️ O que é instalado é um SHIM de 4 linhas, não um symlink. O shim resolve
#    `git rev-parse --show-toplevel`/scripts/hooks/<nome> na hora de rodar, e isso
#    importa por dois motivos:
#      • worktrees compartilham o `.git/hooks` do repo PAI (git rev-parse
#        --git-common-dir), então UMA instalação vale pra todas — e cada uma roda a
#        versão do hook do PRÓPRIO branch, não a de outro checkout;
#      • se o branch checado não tiver `scripts/hooks/` (branch antigo), o shim avisa
#        e deixa passar em vez de quebrar todo commit com "No such file".
#    Um symlink pra um caminho fixo faria o contrário: apontaria pra árvore de outra
#    worktree (que é descartável) e morreria calado quando ela sumisse — que é
#    exatamente a classe de falha que estamos consertando.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

DEST="$(cd "$(git rev-parse --git-common-dir)" && pwd)/hooks"
HOOKS=(pre-commit pre-push)
MARCA='# gerado por scripts/install-hooks.sh'

SO_CONFERE=0
[[ "${1:-}" == "--check" ]] && SO_CONFERE=1

echo "▸ hooks versionados: $RAIZ/scripts/hooks"
echo "▸ instalando em:     $DEST"

if PATH_CONF="$(git config --get core.hooksPath 2>/dev/null)"; then
  echo "⚠️  core.hooksPath está setado ('$PATH_CONF') — o git vai IGNORAR $DEST."
  echo "   remova com: git config --unset core.hooksPath"
fi

mkdir -p "$DEST"
FALTA=0
for h in "${HOOKS[@]}"; do
  alvo="$DEST/$h"
  if [[ -f "$alvo" && -x "$alvo" ]] && grep -q "$MARCA" "$alvo" 2>/dev/null; then
    echo "  ✓ $h já instalado"
    continue
  fi
  FALTA=1
  if [[ $SO_CONFERE -eq 1 ]]; then
    echo "  ✗ $h NÃO instalado"
    continue
  fi
  if [[ -e "$alvo" || -L "$alvo" ]]; then
    cp -P "$alvo" "$alvo.bak-$(date +%Y%m%d%H%M%S)"
    echo "  ▸ $h já existia — guardei cópia em $alvo.bak-*"
  fi
  cat > "$alvo" <<SHIM
#!/usr/bin/env bash
$MARCA — NÃO edite aqui. O hook de verdade é scripts/hooks/$h (versionado).
REAL="\$(git rev-parse --show-toplevel 2>/dev/null)/scripts/hooks/$h"
[[ -x "\$REAL" ]] || { echo "⚠️  hook '$h' não achado em \$REAL — seguindo sem ele." >&2; exit 0; }
exec "\$REAL" "\$@"
SHIM
  chmod +x "$alvo" "$RAIZ/scripts/hooks/$h"
  echo "  ✓ $h instalado"
done

if [[ $SO_CONFERE -eq 1 ]]; then
  [[ $FALTA -eq 1 ]] && { echo; echo "✗ faltam hooks — rode: scripts/install-hooks.sh"; exit 1; }
  echo "✓ todos os hooks instalados"
  exit 0
fi
echo "✓ pronto — vale pra este clone e pra todas as worktrees dele."
