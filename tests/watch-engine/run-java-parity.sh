#!/bin/bash
# Paridade do motor Java do Wear × motor GSM do JS (Caminho B, Leva 2).
# Compila o android/wear/.../ScoreEngine.java REAL (o mesmo que o :wear embarca)
# e reproduz os vetores. Mesmo regime do runner Swift: fora do npm test (exige
# JDK), gate obrigatório pré-build do Wear e a cada regravação de vetores.
set -euo pipefail
cd "$(dirname "$0")/../.."
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home}"
node tests/watch-engine/run-java-parity.js
