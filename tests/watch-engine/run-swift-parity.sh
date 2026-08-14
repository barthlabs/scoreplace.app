#!/bin/bash
# Paridade do motor Swift do relógio × motor GSM do JS (Caminho B, Leva 2).
# Compila o ScoreEngine.swift REAL (o mesmo arquivo que os targets do relógio
# embarcam) + o runner, e reproduz os vetores de tests/watch-engine/vectors/.
#
#   tests/watch-engine/run-swift-parity.sh
#
# ⚠️ Fora do npm test de propósito (exige Xcode; a CI não tem Swift) — mesmo
# regime dos testes de emulador. É GATE OBRIGATÓRIO antes de qualquer build
# nativo do relógio, e deve ser re-rodado sempre que os vetores forem
# regravados (mudança de comportamento no motor JS).
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT=/tmp/sp-watch-parity
mkdir -p "$OUT"
xcrun swiftc -O \
  ios/WatchApp/Sources/ScoreEngine.swift \
  tests/watch-engine/swift/main.swift \
  -o "$OUT/runner"
"$OUT/runner" tests/watch-engine/vectors
