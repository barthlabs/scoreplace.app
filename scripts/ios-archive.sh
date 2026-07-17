#!/usr/bin/env bash
#
# Arquiva o app iOS pra App Store GARANTINDO que o app do Apple Watch
# (ScoreplaceWatch.app) foi embutido. Nasceu do incidente 13/jul/2026: a build
# 1.0.1(3) foi arquivada à mão, fora do pipeline, SEM o companion do relógio —
# então o scoreplace não aparecia no app Watch do iPhone. Este script FALHA ALTO
# se o watch app não estiver dentro do .xcarchive, antes de exportar/enviar.
#
# Uso:
#   scripts/ios-archive.sh            # só arquiva + valida (não exporta)
#   scripts/ios-archive.sh --export   # arquiva + valida + exporta .ipa pra App Store
#
# NÃO faz upload sozinho (ação outward-facing da conta Apple). Ao fim mostra o
# comando de upload. Assinatura automática (Team 6724SP9XN7).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$REPO_ROOT/ios/App"
PROJECT="$APP_DIR/App.xcodeproj"
SCHEME="App"
STAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE="${TMPDIR:-/tmp}/scoreplace-$STAMP.xcarchive"
EXPORT_DIR="${TMPDIR:-/tmp}/scoreplace-$STAMP-export"
EXPORT_OPTS="$REPO_ROOT/scripts/ios-exportOptions.plist"
EMBEDDED_WATCH="Products/Applications/App.app/Watch/ScoreplaceWatch.app"

# ── TRAVA DE TREE NATIVO ────────────────────────────────────────────────────
# Recusa arquivar a partir de um tree SEM a fiação nativa. Arquivar do main = app
# QUEBRADO (sem login nativo, 403 em tudo). O marcador _handleGoogleLoginNative em
# js/views/auth.js só existe no branch native/v1-submit.
# Bypass consciente: ALLOW_NON_NATIVE_BUILD=1. Ver project_release_pipeline_canonical.
BR="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
if [ "${ALLOW_NON_NATIVE_BUILD:-}" = "1" ]; then
  echo "⚠ ALLOW_NON_NATIVE_BUILD=1 → trava de tree nativo PULADA (branch: $BR)."
elif ! grep -q "_handleGoogleLoginNative" "$REPO_ROOT/js/views/auth.js" 2>/dev/null; then
  echo ""
  echo "❌ TRAVA DE BUILD — este tree NÃO tem a fiação nativa (branch: $BR)."
  echo "   Faltou _handleGoogleLoginNative em js/views/auth.js → arquivar daqui"
  echo "   gera app QUEBRADO: sem login nativo, 403 em tudo."
  echo ""
  echo "   Arquive a partir do worktree do native/v1-submit:"
  echo "     cd .claude/worktrees/native-submit"
  echo "     git merge main            # traz as features novas"
  echo "     scripts/ios-archive.sh"
  echo ""
  echo "   (Bypass consciente: ALLOW_NON_NATIVE_BUILD=1 scripts/ios-archive.sh)"
  exit 1
fi
echo "▶ Tree nativo OK (branch: $BR)."
# ────────────────────────────────────────────────────────────────────────────

echo "▶ Sincronizando web assets (cap sync ios)…"
( cd "$REPO_ROOT" && npx --no-install cap sync ios >/dev/null 2>&1 ) \
  || echo "  ⚠ cap sync falhou/ausente — seguindo com o www já presente."

echo "▶ Arquivando esquema '$SCHEME'…  → $ARCHIVE"
xcodebuild \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" \
  -allowProvisioningUpdates \
  archive

# ── VALIDAÇÃO CRÍTICA: o watch app precisa estar embutido ──
WATCH_PATH="$ARCHIVE/$EMBEDDED_WATCH"
echo "▶ Validando companion do relógio embutido…"
if [ ! -d "$WATCH_PATH" ]; then
  echo ""
  echo "❌ FALHA: $EMBEDDED_WATCH NÃO existe no arquive."
  echo "   O app do Apple Watch não foi embutido → NÃO envie esta build."
  echo "   Cheque: target 'ScoreplaceWatch', fase 'Embed Watch Content' e a"
  echo "   dependência do target 'App' no App.xcodeproj/project.pbxproj."
  exit 1
fi
WATCH_ID="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$WATCH_PATH/Info.plist" 2>/dev/null || echo '')"
WATCH_COMPANION="$(/usr/libexec/PlistBuddy -c 'Print :WKCompanionAppBundleIdentifier' "$WATCH_PATH/Info.plist" 2>/dev/null || echo '')"
if [ "$WATCH_ID" != "app.scoreplace.watchapp" ] || [ "$WATCH_COMPANION" != "app.scoreplace" ]; then
  echo "❌ FALHA: bundle ids do watch inesperados (id='$WATCH_ID', companion='$WATCH_COMPANION')."
  exit 1
fi
echo "  ✅ $EMBEDDED_WATCH presente (id=$WATCH_ID, companion=$WATCH_COMPANION)."

# ── PISO DE watchOS: o relógio do dono é um Series 3 (A1859), que só vai até o
# watchOS 8.8.2. Se o mínimo do watch app subir acima de 8.0, o scoreplace some
# da lista do app Relógio no iPhone — SEM erro nenhum, só desaparece. Foi o que
# aconteceu na 1.2.1 (mínimo 10.0, empurrado por um único .onChange de 2 params).
# Uma API nova de watchOS 9/10 sobe esse mínimo sozinha: esta trava grita antes.
WATCH_MIN="$(/usr/libexec/PlistBuddy -c 'Print :MinimumOSVersion' "$WATCH_PATH/Info.plist" 2>/dev/null || echo '')"
WATCH_MIN_MAX="8.0"
if [ -z "$WATCH_MIN" ] || [ "$(printf '%s\n%s\n' "$WATCH_MIN" "$WATCH_MIN_MAX" | sort -V | tail -1)" != "$WATCH_MIN_MAX" ]; then
  echo ""
  echo "❌ FALHA: mínimo do watch app = '$WATCH_MIN' (máximo tolerado: $WATCH_MIN_MAX)."
  echo "   Acima de $WATCH_MIN_MAX o app SOME da lista do app Relógio no Apple Watch"
  echo "   Series 3 (máx 8.8.2) — silenciosamente, sem erro. NÃO envie esta build."
  echo "   Cheque WATCHOS_DEPLOYMENT_TARGET e APIs novas demais (ex: .onChange de"
  echo "   2 params = watchOS 10+) nas fontes do watch."
  exit 1
fi
echo "  ✅ mínimo do watch = $WATCH_MIN (≤ $WATCH_MIN_MAX → Series 3 enxerga o app)."
echo "  ⚠ MODELO APPLE: watch vai EMBUTIDO neste ÚNICO arquivo — NUNCA arquive/suba"
echo "    o watch como artefato separado. (No Android é o oposto: 2 .aab separados.)"

if [ "${1:-}" != "--export" ]; then
  echo ""
  echo "✅ Arquive válido: $ARCHIVE"
  echo "   Rode de novo com --export pra gerar o .ipa e ver o comando de envio."
  exit 0
fi

echo "▶ Exportando pra App Store Connect…  → $EXPORT_DIR"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportPath "$EXPORT_DIR" \
  -exportOptionsPlist "$EXPORT_OPTS" \
  -allowProvisioningUpdates

IPA="$(find "$EXPORT_DIR" -name '*.ipa' -maxdepth 1 | head -1)"

# ── VALIDAÇÃO DO IPA: o que sobe é o .ipa, NÃO o .xcarchive. Validar só o archive
# (como era até aqui) deixa passar qualquer perda de watch no export/re-assinatura
# — o script dizia "✅ Export pronto" sem nunca ter olhado dentro do IPA.
if [ -z "$IPA" ]; then
  echo "❌ FALHA: nenhum .ipa gerado em $EXPORT_DIR."
  exit 1
fi
echo "▶ Validando o companion do relógio DENTRO do .ipa…"
IPA_CHECK="${TMPDIR:-/tmp}/scoreplace-$STAMP-ipacheck"
rm -rf "$IPA_CHECK"; mkdir -p "$IPA_CHECK"
unzip -qq "$IPA" -d "$IPA_CHECK" || { echo "❌ FALHA: não consegui abrir o .ipa."; exit 1; }
IPA_WATCH="$(find "$IPA_CHECK/Payload" -maxdepth 3 -type d -name 'ScoreplaceWatch.app' | head -1)"
if [ -z "$IPA_WATCH" ]; then
  echo "❌ FALHA: o .ipa NÃO contém Watch/ScoreplaceWatch.app."
  echo "   O archive tinha o relógio, mas o export o perdeu → NÃO envie esta build."
  exit 1
fi
IPA_WATCH_ID="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$IPA_WATCH/Info.plist" 2>/dev/null || echo '')"
IPA_WATCH_MIN="$(/usr/libexec/PlistBuddy -c 'Print :MinimumOSVersion' "$IPA_WATCH/Info.plist" 2>/dev/null || echo '')"
if [ "$IPA_WATCH_ID" != "app.scoreplace.watchapp" ]; then
  echo "❌ FALHA: bundle id do watch no .ipa inesperado ('$IPA_WATCH_ID')."
  exit 1
fi
echo "  ✅ .ipa contém o relógio (id=$IPA_WATCH_ID, mínimo=$IPA_WATCH_MIN)."
rm -rf "$IPA_CHECK"

echo ""
echo "✅ Export pronto: $IPA"
echo ""
echo "Pra enviar (precisa das credenciais da conta Apple — ação sua):"
echo "  xcrun altool --upload-app -f \"$IPA\" --type ios \\"
echo "    --apiKey <KEY_ID> --apiIssuer <ISSUER_ID>"
echo "  (ou abrir no app Transporter / Xcode Organizer)."
echo ""
echo "🚦 GATE OBRIGATÓRIO (Apple): este IPA vai pro TESTFLIGHT PRIMEIRO."
echo "   NÃO submeta à ANÁLISE ainda. O dono instala pelo TestFlight no iPhone e"
echo "   confirma que A ENTRADA NÃO QUEBROU (login/onboarding). Só DEPOIS dessa"
echo "   confirmação é que se manda pra revisão no App Store Connect."
