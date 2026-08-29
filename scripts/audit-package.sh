#!/usr/bin/env bash
# audit-package.sh — empacota a árvore para auditoria EXTERNA, sem tocar no código.
#
# POR QUE EXISTE: o dono manda o trabalho para uma IA auditora e não quer depender de Git
# para isso. Este script produz UM zip autocontido — metadados, patches e uma cópia dos
# fontes — que o auditor abre sem precisar do repositório.
#
# ⛔ O QUE ELE NUNCA FAZ: alterar arquivo rastreado, commitar, publicar, rodar deploy ou
# rodar a suíte (ela leva minutos; quem decide rodá-la é quem audita).
# Ele só LÊ o repositório e ESCREVE dentro de `.audit/`, que está no .gitignore.
#
# Uso:  ./scripts/audit-package.sh
set -euo pipefail

# 1) precisa ser um repositório Git
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "⛔ não estou dentro de um repositório Git." >&2
  exit 1
fi

# 2) a raiz vem do Git, não de onde o script foi chamado
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

# 3) metadados
TS="$(date +%Y%m%d-%H%M%S)"
BRANCH_RAW="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo desconhecido)"
BRANCH="${BRANCH_RAW//\//-}"                       # `feature/x` → `feature-x`
COMMIT="$(git rev-parse HEAD 2>/dev/null || echo sem-commit)"
SHORT="$(git rev-parse --short HEAD 2>/dev/null || echo nocommit)"
VERSION="$(tr -d ' \n\r' < version.txt 2>/dev/null || echo desconhecida)"
HOSTNAME_="$(hostname 2>/dev/null || echo indisponivel)"

OUTDIR="$ROOT/.audit"
mkdir -p "$OUTDIR"
ZIP="$OUTDIR/scoreplace-audit-${VERSION}-${BRANCH}-${SHORT}-${TS}.zip"

# 4) temporário PRÓPRIO — só ele é apagado no fim
TMP="$(mktemp -d "${TMPDIR:-/tmp}/scoreplace-audit-XXXXXX")"
PKG="$TMP/pacote"
mkdir -p "$PKG/source"
# ⚠️ o trap remove SOMENTE o diretório que este script criou
trap 'rm -rf "$TMP"' EXIT

echo "▸ empacotando auditoria"
echo "  raiz:    $ROOT"
echo "  versão:  $VERSION · branch: $BRANCH_RAW · commit: $SHORT"

# 5) AUDIT-METADATA.txt
SUJA="$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
{
  echo "SCOREPLACE — PACOTE DE AUDITORIA"
  echo "gerado em:        $(date '+%Y-%m-%d %H:%M:%S %Z')"
  echo "host:             $HOSTNAME_"
  echo "raiz:             $ROOT"
  echo "version.txt:      $VERSION"
  echo "branch:           $BRANCH_RAW"
  echo "commit (HEAD):    $COMMIT"
  echo "commit (curto):   $SHORT"
  if [ "$SUJA" = "0" ]; then
    echo "árvore:           LIMPA (nada fora do último commit)"
  else
    echo "árvore:           SUJA — $SUJA entrada(s) não commitadas (ver GIT-STATUS.txt e WORKTREE.patch)"
  fi
  echo
  echo "--- tags apontando para HEAD ---"
  git tag --points-at HEAD 2>/dev/null || true
  echo
  echo "--- git remote -v ---"
  if [ -n "$(git remote 2>/dev/null)" ]; then
    git remote -v
  else
    echo "(nenhum remote configurado)"
  fi
  echo
  echo "--- último commit ---"
  git log -1 --format='%H%n%an <%ae>%n%ad%n%s' 2>/dev/null || echo "(sem commits)"
  echo
  echo "--- git status --short ---"
  git status --short 2>/dev/null || true
} > "$PKG/AUDIT-METADATA.txt"

# 6) status, log e patches
git status --short              > "$PKG/GIT-STATUS.txt" 2>&1 || true
git log --oneline --decorate -20 > "$PKG/GIT-LOG.txt"   2>&1 || true

git diff --binary               > "$PKG/WORKTREE.patch" 2>/dev/null || : > "$PKG/WORKTREE.patch"
git diff --cached --binary      > "$PKG/STAGED.patch"   2>/dev/null || : > "$PKG/STAGED.patch"

if git rev-parse --verify -q HEAD^ >/dev/null 2>&1; then
  git diff --binary HEAD^ HEAD  > "$PKG/HEAD.patch" 2>/dev/null || : > "$PKG/HEAD.patch"
  git diff --name-status HEAD^ HEAD > "$PKG/CHANGED-FILES.txt" 2>/dev/null || true
else
  echo "(HEAD não tem commit pai — nada a comparar)" > "$PKG/HEAD.patch"
  git show --name-status --format= HEAD > "$PKG/CHANGED-FILES.txt" 2>/dev/null || true
fi
# soma o que ainda não foi commitado, senão a lista mente sobre a árvore
{
  echo
  echo "--- não commitado (árvore de trabalho) ---"
  git status --short
} >> "$PKG/CHANGED-FILES.txt"

echo "tests not executed by audit-package" > "$PKG/TEST-RESULTS.txt"
{
  echo "Para rodar a suíte:  npm test"
  echo "Integração no emulador (Firestore+Functions+Auth):  npm run test:amizade"
  echo "Rules:  npm run test:rules"
} >> "$PKG/TEST-RESULTS.txt"

# 7) cópia dos fontes
#    Lista vinda do próprio Git (rastreados + não rastreados NÃO ignorados): assim o
#    .gitignore é a única fonte da verdade sobre o que é fonte — e credencial, backup,
#    dump e node_modules ficam de fora por construção, não por lista à mão.
{
  git ls-files -z
  git ls-files -z --others --exclude-standard
} | sort -z -u > "$TMP/lista.z"

# poda o que é pesado/gerado e não serve à auditoria
LC_ALL=C tr '\0' '\n' < "$TMP/lista.z" \
  | grep -vE '^(node_modules|\.audit)/' \
  | grep -vE '^android/(app|wear)/build/' \
  | grep -vE '^android/(\.gradle|build)/' \
  | grep -vE '^ios/App/(Pods|build)/' \
  | grep -vE '^docs/lighthouse/' \
  | grep -vE '\.(zip|tar|tar\.gz|tgz)$' \
  > "$TMP/lista.txt"

# mantém os arquivos nativos MÍNIMOS que os gates leem
for f in ios/App/App.xcodeproj/project.pbxproj android/app/build.gradle capacitor.config.json; do
  [ -f "$ROOT/$f" ] && echo "$f" >> "$TMP/lista.txt"
done
sort -u "$TMP/lista.txt" -o "$TMP/lista.txt"

if command -v rsync >/dev/null 2>&1; then
  rsync -a --files-from="$TMP/lista.txt" "$ROOT/" "$PKG/source/"
else
  # fallback sem rsync
  while IFS= read -r f; do
    [ -f "$ROOT/$f" ] || continue
    mkdir -p "$PKG/source/$(dirname "$f")"
    cp "$ROOT/$f" "$PKG/source/$f"
  done < "$TMP/lista.txt"
fi

# 8) o ZIP
if command -v zip >/dev/null 2>&1; then
  ( cd "$TMP" && zip -qr "$ZIP" pacote -x '*.DS_Store' )
elif command -v ditto >/dev/null 2>&1; then
  ditto -c -k --sequesterRsrc "$PKG" "$ZIP"          # fallback nativo do macOS
else
  echo "⛔ nem 'zip' nem 'ditto' disponíveis — não consigo empacotar." >&2
  exit 1
fi

# 9) conferência do que saiu
N="$(unzip -Z1 "$ZIP" 2>/dev/null | wc -l | tr -d ' ')"
LIXO="$(unzip -Z1 "$ZIP" 2>/dev/null | grep -cE '(^|/)(\.git/|node_modules/|\.audit/)' || true)"
echo "✅ pacote: $ZIP"
echo "   arquivos: $N · entradas indevidas (.git/node_modules/.audit): $LIXO"
if [ "${LIXO:-0}" != "0" ]; then
  echo "⛔ o pacote levou coisa que não devia — confira antes de enviar." >&2
  exit 1
fi
