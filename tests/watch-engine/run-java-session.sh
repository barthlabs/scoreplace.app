#!/bin/bash
# Posse + diário do Wear (WearMatchSession) — Caminho B, fiação.
# Compila os tipos REAIS do :wear (ScoreEngine + WearMatchSession) com o runner
# e exercita a MESMA bateria do runner Swift: quando o motor local arma, quem
# tem a posse, quando desarma, e como o diário acumula/zera. Duas
# implementações da mesma decisão divergem na primeira mudança — os dois
# runners existem pra pegar isso.
#
#   tests/watch-engine/run-java-session.sh
#
# ⚠️ Fora do npm test (exige JDK) — mesmo regime dos outros runners nativos.
# org.json: o Android traz em runtime, mas headless precisa do jar real (o do
# android.jar é stub que lança "Stub!"). Baixado uma vez pro /tmp; sem rede e
# sem cache, o script diz o que fazer em vez de falhar obscuro.
set -euo pipefail
cd "$(dirname "$0")/../.."
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home}"
LIB=/tmp/sp-testlibs/json.jar
if [ ! -f "$LIB" ]; then
  mkdir -p /tmp/sp-testlibs
  echo "▸ baixando org.json (uma vez)…"
  curl -sSfL -o "$LIB" "https://repo1.maven.org/maven2/org/json/json/20240303/json-20240303.jar" \
    || { echo "✗ sem org.json em $LIB e sem rede — baixe o jar e rode de novo"; exit 1; }
fi
OUT=/tmp/sp-wear-session
rm -rf "$OUT" && mkdir -p "$OUT"
"$JAVA_HOME/bin/javac" -encoding UTF-8 -cp "$LIB" -d "$OUT" \
  android/wear/src/main/java/app/scoreplace/wear/ScoreEngine.java \
  android/wear/src/main/java/app/scoreplace/wear/WearMatchSession.java \
  tests/watch-engine/java-session/SessionMain.java
"$JAVA_HOME/bin/java" -cp "$OUT:$LIB" SessionMain
