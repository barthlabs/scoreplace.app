#!/usr/bin/env bash
# build-ext-zip.sh — empacota extension/ no zip que o organizador instala.
#
# POR QUE ISTO EXISTE (incidente de 14/jul/2026): a extensão foi bumpada pra 1.36 no
# repo, mas o zip nunca foi reconstruído — o zip mais novo era 1.35. O organizador
# instalou a 1.35 (única disponível), o gate velho deixou passar, e a busca completa
# gravou ZERO jogos. Empacotar À MÃO é o passo que sempre esquece; agora é um comando.
#
# O nome do zip sai do manifest — nunca digitado. Rode depois de bumpar a extensão:
#   npm run ext:zip && npm run check:ext
set -euo pipefail
cd "$(dirname "$0")/.."

VER=$(node -p "require('./extension/manifest.json').version")
OUT="scoreplace-letzplay-ext-${VER}.zip"

rm -f "$OUT"
cd extension
# -x: nada de lixo do macOS/editor dentro do pacote enviado à Chrome Web Store.
zip -r -q "../$OUT" . -x '*.DS_Store' -x '__MACOSX/*' -x '*.map'
cd ..

echo "✓ $OUT"
unzip -l "$OUT" | tail -3
