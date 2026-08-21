#!/usr/bin/env bash
# deploy-hosting.sh — O ÚNICO jeito de publicar o site. Alinha o `main` ANTES de subir.
#
# POR QUE EXISTE (12/ago/2026): produção ficou em 1.8.27 com `origin/main` em 1.8.24. Não
# foi comando errado — era o comportamento normal do fluxo: cada sessão publica de um
# branch/worktree próprio e nada obriga a empurrar pro main. A leva seguinte publicada a
# partir do main REBAIXARIA a produção.
# Ordem do dono: "as coisas precisam estar alinhadas… apenas as versoes da loja ficam
# desalinhadas por um curto periodo de tempo por logistica apenas."
#
# O QUE ELE FAZ, nesta ordem (a ordem é o ponto):
#   1. árvore limpa? (o que sobe tem que ser o que está no git)
#   1.5 GERA o snapshot (index.html/version.txt) e commita se mudou — ANTES do push.
#      Sem isso, quem gera é só o `hosting.predeploy`, dentro da cópia em /tmp: o
#      arquivo gerado vai pro ar e nunca volta pro repo. Medido na 1.9.106 — commit com
#      version.txt 1.9.105 e o ar em 1.9.106. Com o pre-commit instalado
#      (scripts/install-hooks.sh) não há o que commitar aqui e o passo é um no-op.
#   2. empurra HEAD pro `main` — fast-forward. Divergiu? ABORTA e diz o que fazer.
#      ⚠️ É o main que passa a descrever o ar, então ele é atualizado ANTES do upload:
#      falhar aqui é barato; falhar depois de publicar deixa exatamente o desalinhamento
#      que este script existe pra impedir.
#   3. extrai o commit com `git archive` (só o que está commitado — o Drive tem lixo solto
#      e `hosting.public` é ".", então tudo que estiver na pasta iria pro ar)
#   4. liga node_modules do repo (o predeploy roda testes com Chromium)
#   5. escreve o CARIMBO de alinhamento — é o que o check aceita numa cópia sem .git
#   6. firebase deploy --only hosting  (o predeploy roda testes + prerender + os checks)
#   7. confere no ar: version.txt servido == version.txt publicado
#
# Uso:  scripts/deploy-hosting.sh            # publica
#       scripts/deploy-hosting.sh --dry-run  # faz tudo menos o upload
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

DRY=0
[[ "${1:-}" == "--dry-run" ]] && DRY=1

VERSAO="$(tr -d '[:space:]' < version.txt)"
COMMIT="$(git rev-parse HEAD)"

echo "▸ repo:   $RAIZ"
echo "▸ commit: ${COMMIT:0:8}  ·  versão: $VERSAO"

# ── 1. árvore limpa ──────────────────────────────────────────────────────────
if [[ -n "$(git status --porcelain)" ]]; then
  echo
  echo "✗ árvore SUJA — o que subiria não é o que está no git:"
  git status --short | head -12
  echo
  echo "  commite (ou guarde) antes de publicar."
  exit 1
fi

# ── 1.5 snapshot gerado, DENTRO do repo, antes de empurrar ───────────────────
# index.html (snapshot da landing) e version.txt são DERIVADOS de
# window.SCOREPLACE_VERSION (store.js). O hosting.predeploy também roda o prerender,
# mas lá dentro da cópia em /tmp — o resultado publica e evapora. Rodando aqui, o
# commit que vira `main` carrega exatamente o que foi pro ar.
echo "▸ gerando o snapshot (prerender) no repo…"
npm run --silent prerender
if [[ -n "$(git status --porcelain)" ]]; then
  INESPERADO="$(git status --porcelain | grep -v -E ' (index\.html|version\.txt)$' || true)"
  if [[ -n "$INESPERADO" ]]; then
    echo
    echo "✗ o prerender mexeu em arquivo que não era esperado — não vou commitar às cegas:"
    echo "$INESPERADO" | head -12
    exit 1
  fi
  if [[ $DRY -eq 1 ]]; then
    # --dry-run não commita nada; desfaz e só avisa.
    echo "  ⚠️  o snapshot está VELHO (v$(tr -d '[:space:]' < version.txt)) — no deploy de"
    echo "     verdade eu commitaria isso. (dry-run: desfiz, árvore intacta)"
    git checkout -q -- index.html version.txt
  else
    VERSAO="$(tr -d '[:space:]' < version.txt)"
    git add index.html version.txt
    git commit -q -m "$VERSAO — snapshot do prerender que está no ar"
    COMMIT="$(git rev-parse HEAD)"
    echo "  ▸ snapshot estava velho — commitado em ${COMMIT:0:8} (v$VERSAO)"
    echo "    (instale os hooks e isso vira no-op: scripts/install-hooks.sh)"
  fi
else
  echo "  ✓ snapshot já em dia"
fi

# ── 2. alinhar o main ANTES de publicar ──────────────────────────────────────
echo "▸ conferindo origin/main…"
git fetch -q origin main || echo "  ⚠️  não deu pra atualizar origin/main (rede?) — seguindo com o local"

if git merge-base --is-ancestor "$COMMIT" origin/main 2>/dev/null; then
  echo "  ✓ este commit já está em origin/main"
elif git merge-base --is-ancestor origin/main "$COMMIT" 2>/dev/null; then
  ATRAS="$(git rev-list --count origin/main..HEAD)"
  echo "  ▸ main está $ATRAS commit(s) atrás — empurrando (fast-forward)…"
  if [[ $DRY -eq 1 ]]; then
    echo "  (dry-run: não empurrei)"
  else
    # o pre-push roda `npm test` em push pro main; aqui seria a MESMA suíte que o
    # hosting.predeploy roda logo em seguida (2×2min30 pelo mesmo gate). O que barra o
    # upload é o predeploy — ele aborta antes de subir qualquer byte.
    SP_HOOK_SKIP_TEST=1 git push origin "HEAD:main"
    echo "  ✓ main alinhado em ${COMMIT:0:8}"
  fi
else
  echo
  echo "✗ HEAD e origin/main DIVERGIRAM — não dá pra alinhar sozinho sem escolher por você."
  echo "  origin/main: $(git rev-parse --short origin/main)   ·   HEAD: ${COMMIT:0:8}"
  echo
  echo "  O QUE FAZER: traga o main pra dentro (rebase ou merge), rode a suíte, e publique"
  echo "  de novo. NUNCA publicar divergente: o ar passaria a ser um estado que o main não"
  echo "  descreve, que é exatamente o problema que este script existe pra impedir."
  exit 1
fi

# ── 3-5. cópia limpa + carimbo ───────────────────────────────────────────────
DEST="${TMPDIR:-/tmp}/sp-deploy-$$"
rm -rf "$DEST"; mkdir -p "$DEST"
git archive HEAD | tar -x -C "$DEST"
# ⚠️ Procura o node_modules SUBINDO os diretórios, como o Node faz. Publicar de uma
# WORKTREE do git é caso normal aqui, e worktree NÃO tem node_modules próprio — os
# testes só passam nela porque o Node sobe até o do repo pai. Fixar em "$RAIZ" fazia
# o deploy abortar em toda worktree com "node_modules não resolveu", que é a MESMA
# armadilha que a 1.8.2 pagou (lá o symlink apontava pra um caminho sem pai e o
# predeploy morria com "Cannot find module '@playwright/test'" — parecendo regressão
# do commit, quando era só o node_modules fora de alcance).
NM=""
DIR="$RAIZ"
while [[ "$DIR" != "/" ]]; do
  if [[ -e "$DIR/node_modules/@playwright/test" ]]; then NM="$DIR/node_modules"; break; fi
  DIR="$(dirname "$DIR")"
done
if [[ -z "$NM" ]]; then
  echo "✗ node_modules não resolveu a partir de $RAIZ (o predeploy roda testes com Chromium)."
  echo "  rode 'npm ci' no repo (ou no repo PAI, se você está numa worktree) e tente de novo."
  exit 1
fi
ln -s "$NM" "$DEST/node_modules"
# lixo que o Drive cria e que iria pro ar junto (hosting.public = ".")
LIXO="$(find "$DEST" \( -name '* 2' -o -name '* 3' -o -name '.DS_Store' \) | head -5 || true)"
if [[ -n "$LIXO" ]]; then echo "✗ lixo na extração:"; echo "$LIXO"; exit 1; fi

cat > "$DEST/.deploy-alignment.json" <<JSON
{
  "alinhado": true,
  "commit": "$COMMIT",
  "versao": "$VERSAO",
  "em": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "por": "scripts/deploy-hosting.sh"
}
JSON
echo "▸ extraído em $DEST (carimbado)"

if [[ $DRY -eq 1 ]]; then
  echo "✓ dry-run completo — nada foi publicado."
  echo "  (a cópia ficou em $DEST)"
  exit 0
fi

# ── 6. publicar ──────────────────────────────────────────────────────────────
# ⚠️ SEM PIPE. Pipe transforma o exit code no do último comando e o gate do predeploy
# vira decoração — é a armadilha já registrada no CLAUDE.md (deploy-functions.sh).
cd "$DEST"
firebase deploy --only hosting --project scoreplace-app

# ── 7. conferir no ar ────────────────────────────────────────────────────────
cd "$RAIZ"
echo "▸ conferindo o ar…"
for _ in $(seq 1 30); do
  AR="$(curl -s https://scoreplace.app/version.txt || true)"
  [[ "$AR" == "$VERSAO" ]] && break
  sleep 5
done
if [[ "${AR:-}" != "$VERSAO" ]]; then
  echo "✗ o ar responde '${AR:-vazio}' e era esperado '$VERSAO' — confira antes de anunciar."
  exit 1
fi
echo "✓ NO AR: $VERSAO  ·  main alinhado em ${COMMIT:0:8}"
