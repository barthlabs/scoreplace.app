#!/bin/bash
# Posse + diário do relógio (WatchMatchSession) — Caminho B, fiação.
# Compila os tipos REAIS do app do relógio (ScoreState + ScoreEngine +
# WatchMatchSession) com o runner e exercita as regras que decidem o que a tela
# mostra: quando o motor local arma, quem tem a posse, quando desarma, e como o
# diário acumula/zera.
#
#   tests/watch-engine/run-swift-session.sh
#
# ⚠️ Fora do npm test (exige Xcode) — mesmo regime do run-swift-parity.sh.
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT=/tmp/sp-watch-session
mkdir -p "$OUT"
xcrun swiftc -O \
  ios/WatchApp/Sources/ScoreState.swift \
  ios/WatchApp/Sources/ScoreEngine.swift \
  ios/WatchApp/Sources/WatchMatchSession.swift \
  tests/watch-engine/swift-session/main.swift \
  -o "$OUT/session"
"$OUT/session"
