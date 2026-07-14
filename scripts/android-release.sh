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

# ── TRAVA DE TREE NATIVO ────────────────────────────────────────────────────
# Recusa buildar a partir de um tree SEM a fiação nativa. Buildar do main = app
# QUEBRADO (sem login nativo, 403 em tudo, unsigned). O marcador
# _handleGoogleLoginNative em js/views/auth.js só existe no branch native/v1-submit.
# Bypass consciente: ALLOW_NON_NATIVE_BUILD=1. Ver project_release_pipeline_canonical.
BR="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
if [ "${ALLOW_NON_NATIVE_BUILD:-}" = "1" ]; then
  echo "⚠ ALLOW_NON_NATIVE_BUILD=1 → trava de tree nativo PULADA (branch: $BR)."
elif ! grep -q "_handleGoogleLoginNative" "$REPO_ROOT/js/views/auth.js" 2>/dev/null; then
  echo ""
  echo "❌ TRAVA DE BUILD — este tree NÃO tem a fiação nativa (branch: $BR)."
  echo "   Faltou _handleGoogleLoginNative em js/views/auth.js → buildar daqui"
  echo "   gera app QUEBRADO: sem login nativo, 403 em tudo, unsigned."
  echo ""
  echo "   Builde a partir do worktree do native/v1-submit:"
  echo "     cd .claude/worktrees/native-submit"
  echo "     git merge main            # traz as features novas"
  echo "     scripts/android-release.sh"
  echo ""
  echo "   (Bypass consciente: ALLOW_NON_NATIVE_BUILD=1 scripts/android-release.sh)"
  exit 1
fi
echo "▶ Tree nativo OK (branch: $BR)."
# ────────────────────────────────────────────────────────────────────────────

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

# ── VALIDAÇÃO CRÍTICA: os DOIS artefatos SEPARADOS existem e são distintos? ──
# No Android, celular e relógio são DUAS distribuições SEPARADAS na mesma ficha —
# NUNCA um combinado. Subir só um deixa a outra plataforma pra trás (foi o que
# aconteceu: o :wear ficou em versionCode 1). Aqui falha alto se faltar qualquer
# um, ou se os dois apontarem pro mesmo arquivo (build cruzado).
echo "▶ Validando que os DOIS artefatos separados existem…"
[ -n "$APP_AAB" ]  || { echo "❌ FALHA: :app (celular) não gerou .aab. Os DOIS são obrigatórios."; exit 1; }
[ -n "$WEAR_AAB" ] || { echo "❌ FALHA: :wear (relógio) não gerou .aab. Os DOIS são obrigatórios."; exit 1; }
[ "$APP_AAB" != "$WEAR_AAB" ] || { echo "❌ FALHA: celular e relógio apontam pro MESMO .aab → build cruzado."; exit 1; }
echo "  ✅ Dois .aab distintos presentes (celular + relógio)."

echo "▶ Validando artefato do relógio…"
AAPT="$(ls -t "${ANDROID_HOME:-$HOME/Library/Android/sdk}"/build-tools/*/aapt2 2>/dev/null | head -1)"
if [ -n "$AAPT" ] && [ -n "$WEAR_APK" ]; then
  BADGING="$("$AAPT" dump badging "$WEAR_APK" 2>/dev/null)"
  echo "$BADGING" | grep -q "uses-feature: name='android.hardware.type.watch'" \
    || { echo "❌ FALHA: artefato do relógio SEM uses-feature watch → o Play não entrega pra relógio."; exit 1; }
  echo "$BADGING" | grep -q "package: name='app.scoreplace'" \
    || { echo "❌ FALHA: applicationId do relógio diferente de app.scoreplace → Data Layer não conecta."; exit 1; }
  echo "  ✅ Wear OK (uses-feature watch + applicationId app.scoreplace)."
  # O do CELULAR não pode ser um app watch (senão os dois iriam pra track de relógio).
  APP_APK="$(find app/build/outputs/apk/release -name '*.apk' 2>/dev/null | head -1)"
  if [ -n "$APP_APK" ]; then
    "$AAPT" dump badging "$APP_APK" 2>/dev/null | grep -q "uses-feature: name='android.hardware.type.watch'" \
      && { echo "❌ FALHA: artefato do CELULAR declara uses-feature watch → celular e relógio trocados."; exit 1; }
  fi
else
  echo "  ⚠ aapt2 indisponível — pulei a checagem do manifesto (os .aab existem)."
fi

echo ""
echo "✅ Artefatos:"
echo "   Celular : $APP_AAB"
echo "   Relógio : $WEAR_AAB"
echo ""
echo "⚠ MODELO ANDROID: são DUAS distribuições SEPARADAS na MESMA ficha do Play —"
echo "   • Celular → track do app de telefone"
echo "   • Relógio → track/distribuição de Wear OS (SEPARADA, não embutida)"
echo "   Suba os DOIS .aab. Subir só um deixa a outra plataforma pra trás."
echo "   O do relógio precisa estar ASSINADO com o mesmo upload key — ver nota"
echo "   sobre signingConfig do :wear no README de release."
echo "   (Na Apple é o oposto: watch vai EMBUTIDO num único arquivo — ver ios-archive.sh.)"
echo ""
echo "🚦 GATE OBRIGATÓRIO ANTES DE SUBIR (sem device Android → validação é no emulador):"
echo "   1) Bootar o AVD:  ~/Library/Android/sdk/emulator/emulator -avd sp_test &"
echo "   2) Instalar:      adb install -r <app-release.apk do :app>"
echo "   3) Abrir o app e CONFERIR QUE A ENTRADA NÃO QUEBROU (login/onboarding, sem 403)."
echo "      adb logcat | grep -iE 'PERMISSION_DENIED|403|FirebaseAuth|capacitor'"
echo "   Só depois de a entrada passar no emulador é que o dono sobe os .aab no Play."
