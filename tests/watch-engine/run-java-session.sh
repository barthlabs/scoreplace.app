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
# android.jar é stub que lança "Stub!"). O jar JÁ VIVE NO DISCO — o npm o traz
# dentro de @trapezedev/gradle-parse — então procuramos ele PRIMEIRO e a rede é
# só o último recurso: o repo mora no Google Drive e a máquina nem sempre tem
# rede na hora do build; gate que depende de download não roda offline.
# ⚠️ A subida de diretórios não é enfeite: em worktree (.claude/worktrees/*) NÃO
# existe node_modules próprio — o do repo PAI é que vale (é assim que o Node
# resolve). Olhar só "$PWD/node_modules" cairia no download com o jar ali do lado.
# O glob json-*.jar é de propósito: bump do pacote muda a versão do arquivo, e
# caminho cravado voltaria a exigir rede sem ninguém perceber.
set -euo pipefail
cd "$(dirname "$0")/../.."
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home}"

_find_json_jar() {
  local d="$PWD" j
  while [ "$d" != "/" ]; do
    for j in "$d"/node_modules/@trapezedev/gradle-parse/lib/json-*.jar; do
      if [ -f "$j" ]; then echo "$j"; return 0; fi
    done
    d="$(dirname "$d")"
  done
  for j in "$HOME"/scoreplace-build/node_modules/@trapezedev/gradle-parse/lib/json-*.jar; do
    if [ -f "$j" ]; then echo "$j"; return 0; fi
  done
  return 1
}

LIB="$(_find_json_jar || true)"
if [ -z "$LIB" ]; then
  LIB=/tmp/sp-testlibs/json.jar
  if [ ! -f "$LIB" ]; then
    mkdir -p /tmp/sp-testlibs
    echo "▸ nenhum org.json no disco — baixando (uma vez)…"
    curl -sSfL -o "$LIB" "https://repo1.maven.org/maven2/org/json/json/20240303/json-20240303.jar" \
      || { echo "✗ sem org.json no disco, sem cache em $LIB e sem rede."; \
           echo "  Rode 'npm i' (o jar vem em node_modules/@trapezedev/gradle-parse/lib/)"; \
           echo "  ou copie um json-*.jar pra $LIB e rode de novo."; exit 1; }
  fi
fi
echo "▸ org.json: $LIB"
OUT=/tmp/sp-wear-session
rm -rf "$OUT" && mkdir -p "$OUT"
"$JAVA_HOME/bin/javac" -encoding UTF-8 -cp "$LIB" -d "$OUT" \
  android/wear/src/main/java/app/scoreplace/wear/ScoreEngine.java \
  android/wear/src/main/java/app/scoreplace/wear/WearMatchSession.java \
  tests/watch-engine/java-session/SessionMain.java
"$JAVA_HOME/bin/java" -cp "$OUT:$LIB" SessionMain
