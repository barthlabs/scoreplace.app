#!/usr/bin/env bash
#
# Builda os DOIS artefatos que o scoreplace precisa no Google Play:
#   1) :app   → AAB do celular
#   2) :wear  → AAB/APK do app do Apple... digo, do Wear OS (relógio Android)
#
# No Android o app do relógio NÃO fica embutido no APK/AAB do celular (isso era o
# modelo Wear 1.x, morto). Ele é um artefato SEPARADO que precisa ser enviado
# à MESMA ficha do Play. Buildar só o :app deixa o relógio de fora — foi o que
# aconteceu (o :wear nunca subiu; ficou em versionCode 1). Este script builda os
# dois e VALIDA que o do relógio é um artefato Wear de verdade (uses-feature
# watch + mesmo applicationId), falhando alto se não for.
#
# NÃO faz upload (ação outward-facing da conta Google). Ao fim aponta os .aab.
#
# Uso:  scripts/android-release.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$REPO_ROOT/android"

# ── Toolchain: JDK 21 (Homebrew) + Android SDK (local.properties) ──
if [ -z "${JAVA_HOME:-}" ]; then
  for cand in /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
              /Library/Java/JavaVirtualMachines/*/Contents/Home; do
    [ -x "$cand/bin/java" ] && export JAVA_HOME="$cand" && break
  done
fi
[ -z "${ANDROID_HOME:-}" ] && [ -d "$HOME/Library/Android/sdk" ] && export ANDROID_HOME="$HOME/Library/Android/sdk"
echo "▶ JAVA_HOME=${JAVA_HOME:-<unset>}  ANDROID_HOME=${ANDROID_HOME:-<unset>}"

cd "$ANDROID_DIR"

echo "▶ Sincronizando web assets (cap sync android)…"
( cd "$REPO_ROOT" && npx --no-install cap sync android >/dev/null 2>&1 ) \
  || echo "  ⚠ cap sync falhou/ausente — seguindo com o www já presente."

# Alerta de assinatura: sem keystore.properties o release sai unsigned (Play recusa).
if [ ! -f "$ANDROID_DIR/keystore.properties" ]; then
  echo "  ⚠ android/keystore.properties ausente → artefatos SAIRÃO UNSIGNED."
  echo "    (rode na branch native/v1-submit, onde o keystore vive.)"
fi

echo "▶ Buildando celular (:app) + relógio (:wear)…"
# bundleRelease → .aab (formato do Play). assembleRelease do wear → APK só p/ validar o manifesto.
./gradlew :app:bundleRelease :wear:bundleRelease :wear:assembleRelease --console=plain --no-daemon

APP_AAB="$(find app/build/outputs/bundle/release -name '*.aab' | head -1)"
WEAR_AAB="$(find wear/build/outputs/bundle/release -name '*.aab' | head -1)"
WEAR_APK="$(find wear/build/outputs/apk/release -name '*.apk' | head -1)"

# ── VALIDAÇÃO CRÍTICA: o artefato do relógio é mesmo um app Wear? ──
echo "▶ Validando artefato do relógio…"
[ -n "$WEAR_AAB" ] || { echo "❌ FALHA: :wear não gerou .aab."; exit 1; }
AAPT="$(ls -t "${ANDROID_HOME:-$HOME/Library/Android/sdk}"/build-tools/*/aapt2 2>/dev/null | head -1)"
if [ -n "$AAPT" ] && [ -n "$WEAR_APK" ]; then
  BADGING="$("$AAPT" dump badging "$WEAR_APK" 2>/dev/null)"
  echo "$BADGING" | grep -q "uses-feature: name='android.hardware.type.watch'" \
    || { echo "❌ FALHA: artefato do relógio SEM uses-feature watch → o Play não entrega pra relógio."; exit 1; }
  echo "$BADGING" | grep -q "package: name='app.scoreplace'" \
    || { echo "❌ FALHA: applicationId do relógio diferente de app.scoreplace → Data Layer não conecta."; exit 1; }
  echo "  ✅ Wear OK (uses-feature watch + applicationId app.scoreplace)."
else
  echo "  ⚠ aapt2 indisponível — pulei a checagem do manifesto (o .aab existe)."
fi

echo ""
echo "✅ Artefatos:"
echo "   Celular : $APP_AAB"
echo "   Relógio : $WEAR_AAB"
echo ""
echo "Envie os DOIS pra MESMA ficha no Play Console (o Play entrega cada um pro"
echo "device certo). O do relógio precisa estar ASSINADO com o mesmo upload key —"
echo "ver nota sobre signingConfig do :wear no README de release."
