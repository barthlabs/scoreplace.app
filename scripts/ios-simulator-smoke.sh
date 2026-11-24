#!/usr/bin/env bash
# Smoke de inicialização dos dois aplicativos do candidato, em um par descartável.
set -euo pipefail
cd "$(dirname "$0")/.."
temp="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/scoreplace-sim.XXXXXX")"
evidence="${1:?informe um diretório para as duas capturas}"
mkdir -p "$evidence"
phone=""
watch=""
cleanup() {
  if [[ -n "$watch" ]]; then xcrun simctl delete "$watch" || true; fi
  if [[ -n "$phone" ]]; then xcrun simctl delete "$phone" || true; fi
}
trap cleanup EXIT
create_device() {
  local platform="$1" sdk="$2" family="$3" version runtime type
  version="$(xcrun --sdk "$sdk" --show-sdk-version)"
  runtime="com.apple.CoreSimulator.SimRuntime.$platform-${version//./-}"
  if ! xcrun simctl list runtimes -j | jq -e --arg id "$runtime" '.runtimes[] | select(.identifier == $id and .isAvailable)' >/dev/null; then
    xcodebuild -downloadPlatform "$platform" -buildVersion "$version" >&2
  fi
  type="$(xcrun simctl list runtimes -j | jq -er --arg id "$runtime" --arg family "$family" '
    .runtimes[] | select(.identifier == $id and .isAvailable) |
    first(.supportedDeviceTypes[] | select(.name | startswith($family))) | .identifier')"
  xcrun simctl create "Scoreplace $family" "$type" "$runtime"
}
phone="$(create_device iOS iphonesimulator iPhone)"
watch="$(create_device watchOS watchsimulator 'Apple Watch')"
xcrun simctl pair "$watch" "$phone"
xcrun simctl bootstatus "$phone" -b
xcrun simctl bootstatus "$watch" -b

xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination "platform=iOS Simulator,id=$phone" -derivedDataPath "$temp/derived" \
  CODE_SIGNING_ALLOWED=NO build
app="$temp/derived/Build/Products/Debug-iphonesimulator/App.app"
companion="$app/Watch/ScoreplaceWatch.app"
[[ -d "$companion" ]] || { echo "Companion ausente no bundle do simulador"; exit 1; }
project=ios/App/App.xcodeproj/project.pbxproj
version="$(awk '/MARKETING_VERSION =/{gsub(/;/,"",$3); print $3; exit}' "$project")"
build="$(awk '/CURRENT_PROJECT_VERSION =/{gsub(/;/,"",$3); print $3; exit}' "$project")"
read_plist() { /usr/libexec/PlistBuddy -c "Print :$2" "$1/Info.plist"; }
[[ "$(read_plist "$companion" WKCompanionAppBundleIdentifier)" == app.scoreplace ]]
check_and_launch() {
  local udid="$1" bundle="$2" id="$3" name="$4" installed launch pid
  xcrun simctl install "$udid" "$bundle"
  installed="$(xcrun simctl get_app_container "$udid" "$id" app)"
  [[ "$(read_plist "$installed" CFBundleShortVersionString)" == "$version" ]]
  [[ "$(read_plist "$installed" CFBundleVersion)" == "$build" ]]
  launch="$(xcrun simctl launch "$udid" "$id")"
  echo "$launch"
  pid="${launch##* }"
  [[ "$pid" =~ ^[0-9]+$ ]]
  sleep 8
  # CoreSimulator executa processos no macOS anfitrião, cada um com PID próprio.
  kill -0 "$pid"
  xcrun simctl io "$udid" screenshot "$evidence/$name.png"
}
check_and_launch "$phone" "$app" app.scoreplace iphone
check_and_launch "$watch" "$companion" app.scoreplace.watchapp apple-watch
echo "Simuladores iPhone e Apple Watch abriram $version ($build). O smoke cobre a inicialização deslogada. Partida, sensores e uso em aparelho físico exigem validação própria." | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"
