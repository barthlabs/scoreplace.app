#!/usr/bin/env bash
# Prepara uma identidade efêmera de assinatura para o job de TestFlight.
#
# Este arquivo NUNCA guarda segredo. O workflow recebe todos os valores pelo cofre
# do GitHub Actions e os apaga no encerramento do job. A validação comum da esteira
# não o executa: ela compila sem assinatura para continuar sendo barata e segura.

set -euo pipefail

require_secret() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "❌ Segredo ausente: $name"
    echo "   Configure-o em Settings → Secrets and variables → Actions antes de enviar ao TestFlight."
    return 1
  fi
}

for secret in ASC_KEY_ID ASC_ISSUER_ID ASC_PRIVATE_KEY_BASE64 IOS_DISTRIBUTION_CERTIFICATE_BASE64 IOS_DISTRIBUTION_CERTIFICATE_PASSWORD IOS_APP_PROVISIONING_PROFILE_BASE64 IOS_WATCH_PROVISIONING_PROFILE_BASE64; do
  require_secret "$secret"
done

CI_SIGNING_DIR="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/scoreplace-ios-signing"
CI_KEYCHAIN="$CI_SIGNING_DIR/scoreplace.keychain-db"
CI_KEYCHAIN_PASSWORD="$(openssl rand -base64 32)"
CI_CERTIFICATE="$CI_SIGNING_DIR/distribution.p12"
CI_ASC_KEY="$CI_SIGNING_DIR/AuthKey_${ASC_KEY_ID}.p8"
CI_APP_PROFILE="$CI_SIGNING_DIR/scoreplace-app.mobileprovision"
CI_WATCH_PROFILE="$CI_SIGNING_DIR/scoreplace-watch.mobileprovision"
CI_PROFILE_DIR="$HOME/Library/MobileDevice/Provisioning Profiles"
CI_APP_PROFILE_INSTALLED="$CI_PROFILE_DIR/scoreplace-ci-app.mobileprovision"
CI_WATCH_PROFILE_INSTALLED="$CI_PROFILE_DIR/scoreplace-ci-watch.mobileprovision"

cleanup_ios_ci_signing() {
  security delete-keychain "$CI_KEYCHAIN" >/dev/null 2>&1 || true
  rm -f "$CI_APP_PROFILE_INSTALLED" "$CI_WATCH_PROFILE_INSTALLED"
  rm -rf "$CI_SIGNING_DIR"
}
trap cleanup_ios_ci_signing EXIT

mkdir -p "$CI_SIGNING_DIR"
printf '%s' "$ASC_PRIVATE_KEY_BASE64" | base64 -D > "$CI_ASC_KEY"
printf '%s' "$IOS_DISTRIBUTION_CERTIFICATE_BASE64" | base64 -D > "$CI_CERTIFICATE"
printf '%s' "$IOS_APP_PROVISIONING_PROFILE_BASE64" | base64 -D > "$CI_APP_PROFILE"
printf '%s' "$IOS_WATCH_PROVISIONING_PROFILE_BASE64" | base64 -D > "$CI_WATCH_PROFILE"
mkdir -p "$CI_PROFILE_DIR"
cp "$CI_APP_PROFILE" "$CI_APP_PROFILE_INSTALLED"
cp "$CI_WATCH_PROFILE" "$CI_WATCH_PROFILE_INSTALLED"
chmod 600 "$CI_ASC_KEY" "$CI_CERTIFICATE" "$CI_APP_PROFILE" "$CI_WATCH_PROFILE"

security create-keychain -p "$CI_KEYCHAIN_PASSWORD" "$CI_KEYCHAIN"
security set-keychain-settings -lut 21600 "$CI_KEYCHAIN"
security unlock-keychain -p "$CI_KEYCHAIN_PASSWORD" "$CI_KEYCHAIN"
security import "$CI_CERTIFICATE" -k "$CI_KEYCHAIN" -P "$IOS_DISTRIBUTION_CERTIFICATE_PASSWORD" -A -T /usr/bin/codesign -T /usr/bin/security
security list-keychain -d user -s "$CI_KEYCHAIN"
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$CI_KEYCHAIN_PASSWORD" "$CI_KEYCHAIN"

export ASC_KEY_PATH="$CI_ASC_KEY"
export CI_KEYCHAIN

echo "▶ Credenciais, certificado de distribuição e perfis do app/Watch preparados efemeramente."
