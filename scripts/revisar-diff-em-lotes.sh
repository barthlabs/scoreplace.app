#!/usr/bin/env bash
# Mantém a segunda opinião obrigatória quando o corte excede o limite de uma
# chamada. Todo arquivo entra em exatamente um lote e todos precisam aprovar.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
BASE="${SP_REVIEW_BASE:-origin/main}"
MAX_BYTES="${SP_REVIEW_BATCH_BYTES:-120000}"
[[ "$MAX_BYTES" =~ ^[1-9][0-9]*$ ]] || { echo "✗ SP_REVIEW_BATCH_BYTES inválido" >&2; exit 2; }
MODE="${1:-run}"
[[ "$MODE" == run || "$MODE" == --plan ]] || { echo "Uso: $0 [--plan]" >&2; exit 2; }

TMP="$(mktemp -d "${TMPDIR:-/tmp}/sp-review-batches.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
ALL="$TMP/all-files"
{
  git diff --name-only "$BASE"...HEAD 2>/dev/null || true
  git diff --name-only HEAD 2>/dev/null || true
  git ls-files --others --exclude-standard 2>/dev/null || true
} | sed '/^$/d' | sort -u > "$ALL"
[[ -s "$ALL" ]] || { echo "✓ nenhum arquivo para revisar"; exit 0; }

batch=1; bytes=0; current="$TMP/batch-$batch"
touch "$current"
while IFS= read -r file; do
  size=$( { git diff "$BASE"...HEAD -- "$file" 2>/dev/null; git diff HEAD -- "$file" 2>/dev/null; if git ls-files --error-unmatch "$file" >/dev/null 2>&1; then :; elif [[ -f "$file" ]]; then sed -n '1,400p' "$file"; fi; } | wc -c | tr -d ' ')
  if [[ $bytes -gt 0 && $((bytes + size)) -gt $MAX_BYTES ]]; then
    batch=$((batch + 1)); bytes=0; current="$TMP/batch-$batch"; touch "$current"
  fi
  printf '%s\n' "$file" >> "$current"
  bytes=$((bytes + size))
done < "$ALL"

count=$(find "$TMP" -name 'batch-*' -type f | wc -l | tr -d ' ')
echo "▸ revisão completa em $count lote(s), teto de $MAX_BYTES bytes por lote"
for file in "$TMP"/batch-*; do
  n="${file##*-}"; file_count=$(wc -l < "$file" | tr -d ' ')
  echo "── lote $n/$count: $file_count arquivo(s)"
  if [[ "$MODE" == --plan ]]; then sed 's/^/   /' "$file"; continue; fi
  validate=0; [[ "$n" == 1 ]] && validate=1
  SP_REVIEW_BASE="$BASE" SP_REVIEW_FILE_LIST="$file" SP_REVIEW_PART="$n-de-$count" \
    SP_REVIEW_VALIDATE="$validate" "$ROOT/scripts/revisar.sh" diff
done
if [[ "$MODE" == --plan ]]; then
  echo "✓ plano de $count lotes montado; nenhuma revisão foi executada"
else
  echo "✅ todos os $count lotes receberam parecer APROVADO"
fi
