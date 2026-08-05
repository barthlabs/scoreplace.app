#!/bin/bash
# deploy-functions.sh — deploy SEGURO das Cloud Functions: SEMPRE alvejado por nome.
#
# POR QUE EXISTE (incidente 02/ago/2026): os três codebases (functions/,
# functions-autodraw/, functions-stripe/) se enxergam como "default" —
# `firebase deploy --only functions` de qualquer um deles lista as funções dos
# OUTROS como "a deletar". Com `--force` DELETA (aconteceu: a raiz apagou
# autodraw+stripe, o autodraw apagou as ~49 principais; ~15min de outage).
# Sem `--force`, o não-interativo ABORTA. O único caminho seguro é o deploy
# alvejado pelos nomes — que é o que este script monta sozinho, lendo os
# exports do código. Ver memória project_autodraw_deploy_footgun.
#
# Uso:
#   scripts/deploy-functions.sh main            # codebase principal (functions/)
#   scripts/deploy-functions.sh autodraw        # sorteio (functions-autodraw/)
#   scripts/deploy-functions.sh stripe          # Pro/pagamentos (functions-stripe/)
#   scripts/deploy-functions.sh all             # os três, em sequência
#   scripts/deploy-functions.sh main --dry-run  # só mostra o comando, não roda
#
# NUNCA rodar `firebase deploy --only functions` puro nem `--force` na mão.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="scoreplace-app"
DRY=0
ALVO="${1:-}"
[ "${2:-}" = "--dry-run" ] && DRY=1

die() { echo "✗ $*" >&2; exit 1; }

# Monta "functions:a,functions:b,…" a partir dos exports CJS (^exports.nome).
targets_cjs() { # $1=arquivo $2=prefixo (ex.: "functions:" ou "functions:stripe:")
  grep -o '^exports\.[A-Za-z0-9_]*' "$1" | sed "s/exports\./$2/" | sort -u | paste -sd, -
}
# Idem pra exports ESM (^export const nome).
targets_esm() {
  grep -o '^export const [A-Za-z0-9_]*' "$1" | sed "s/export const /$2/" | sort -u | paste -sd, -
}

deploy_dir() { # $1=dir(de onde rodar o firebase) $2=targets $3=descrição $4=pkgdir(deps; default=$1)
  local dir="$1" targets="$2" desc="$3" pkgdir="${4:-$1}"
  [ -n "$targets" ] || die "$desc: nenhum export encontrado — lista de alvos vazia (abortando por segurança)"
  local n; n=$(echo "$targets" | tr ',' '\n' | wc -l | tr -d ' ')
  echo "── $desc: $n função(ões) alvejada(s)"
  if [ "$DRY" = 1 ]; then
    echo "   (dry-run) cd $dir && firebase deploy --project $PROJECT --non-interactive --only $targets"
    return 0
  fi
  # As deps do CODEBASE, não as de onde o firebase roda — no principal os dois diretórios
  # são diferentes ($ROOT × $ROOT/functions) e a raiz TEM node_modules (dos testes), então
  # checar o do dir dava "instalado" e o deploy morria em "Couldn't find firebase-functions
  # package in your source code" (aconteceu num worktree limpo, 04/ago/2026). Checar o pacote
  # em vez da pasta também cobre node_modules pela metade.
  [ -d "$pkgdir/node_modules/firebase-functions" ] || (cd "$pkgdir" && npm ci)
  (cd "$dir" && firebase deploy --project "$PROJECT" --non-interactive --only "$targets")
}

do_main() {
  deploy_dir "$ROOT" "$(targets_cjs "$ROOT/functions/index.js" 'functions:')" \
    "principal (functions/)" "$ROOT/functions"
}
do_autodraw() {
  if [ "$DRY" != 1 ]; then
    [ -d "$ROOT/functions-autodraw/node_modules" ] || (cd "$ROOT/functions-autodraw" && npm ci)
    (cd "$ROOT/functions-autodraw" && node copy-vendor.js && node test-draw.js) \
      || die "autodraw: test-draw.js falhou — NÃO deployar sorteio quebrado"
  fi
  deploy_dir "$ROOT/functions-autodraw" \
    "$(targets_cjs "$ROOT/functions-autodraw/index.js" 'functions:')" "autodraw (functions-autodraw/)"
  [ "$DRY" = 1 ] || echo "⚠️  commitar o diff de functions-autodraw/vendor/ (o predeploy re-sincroniza)"
}
do_stripe() {
  # Codebase NOMEADO ("stripe") → o filtro EXIGE o prefixo do codebase.
  deploy_dir "$ROOT/functions-stripe" \
    "$(targets_esm "$ROOT/functions-stripe/index.js" 'functions:stripe:')" "stripe (functions-stripe/)"
}

case "$ALVO" in
  main)     do_main ;;
  autodraw) do_autodraw ;;
  stripe)   do_stripe ;;
  all)      do_main; do_autodraw; do_stripe ;;
  *) die "uso: scripts/deploy-functions.sh [main|autodraw|stripe|all] [--dry-run]" ;;
esac
echo "✓ deploy alvejado concluído — conferir com: firebase functions:list --project $PROJECT"
