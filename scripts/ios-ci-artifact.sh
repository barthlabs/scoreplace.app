#!/usr/bin/env bash
# Exporta apenas um envelope cifrado para o certificado público do operador.
set -euo pipefail
: "${RUNNER_TEMP:?}"
cert="$RUNNER_TEMP/scoreplace-recipient.pem"
if [[ "$1" == validate ]]; then
  (( ${#ARCHIVE_RECIPIENT} > 0 && ${#ARCHIVE_RECIPIENT} <= 16384 ))
  printf '%s' "$ARCHIVE_RECIPIENT" | base64 -D | openssl x509 -out "$cert"
  openssl x509 -in "$cert" -checkend 0 -noout >/dev/null
  bits="$(openssl x509 -in "$cert" -pubkey -noout | openssl rsa -pubin -noout -text | sed -nE 's/^.*\(([0-9]+) bit\).*$/\1/p' | head -1)"
  [[ "$bits" =~ ^[0-9]+$ ]] && (( bits >= 2048 )) || { echo "Certificado requer RSA de 2048 bits ou mais"; exit 1; }
  openssl x509 -in "$cert" -sha256 -fingerprint -noout
  exit 0
fi
[[ "$1" == encrypt && -d "$2" && -f "$cert" ]]
source_dir="$2"
zip_file="$(mktemp "$RUNNER_TEMP/scoreplace-package.XXXXXX")"
trap 'rm -f "$zip_file"' EXIT
if [[ -n "$(find "$source_dir" \( -iname '*.p12' -o -iname '*.p8' -o -iname '*.key' -o -iname '*.pem' \) -print -quit)" ]]; then
  echo "Há material de chave dentro do pacote. Exportação bloqueada."
  exit 1
fi
ditto -c -k --keepParent "$source_dir" "$zip_file"
[[ "$(stat -f %z "$zip_file")" -le 2147483648 ]] || { echo "ZIP excede 2 GiB"; exit 1; }
unzip -tq "$zip_file" >/dev/null
out="$RUNNER_TEMP/scoreplace-upload"
mkdir "$out"
openssl cms -encrypt -binary -stream -aes-256-cbc -outform DER -in "$zip_file" -out "$out/package.cms" "$cert"
[[ -s "$out/package.cms" && "$(ls -A "$out")" == package.cms ]]
