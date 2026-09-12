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

# ── TRAVA: nota de versão antes de gerar o .aab (mesmo motivo do iOS) ─────────
node "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/scripts/check-release-notes.js"

# ── TRAVA: a versão NATIVA é a MESMA da web (ordem do dono, 27/ago/2026) ──────
# Antes a loja usava MAJOR.MINOR e a web MAJOR.MINOR.PATCH — "alinhado" virava julgamento,
# e a build 265 chegou a subir como "2.1" carregando o código da 2.1.6. Agora é comparação
# de string. Roda ANTES de arquivar: falhar aqui custa segundos; falhar depois custa uma
# volta inteira na fila da loja.
node "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/scripts/check-versao-nativa.js" android

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

# ── TRAVA: montar o www/ ANTES de copiar ────────────────────────────────
# Mesma regra do scripts/ios-archive.sh — e ela estava copiada errada nos DOIS.
# `npx cap sync` puro roda só a segunda metade: COPIA o www/ que já existir, seja
# de quando for. Quem MONTA o www/ é o tools/build-www.js, dentro do `npm run cap:sync`.
# Falhar aqui custa segundos; subir .aab com bundle velho custa uma leva inteira.
echo "▶ Sincronizando web assets (npm run cap:sync)…"
( cd "$REPO_ROOT" && npm run cap:sync )

# A regra do EMBARCADO mora em UM arquivo só — estava copiada aqui e no outro
# script de release, e divergiu. Ver scripts/check-embedded-www.sh.
"$REPO_ROOT/scripts/check-embedded-www.sh" android

# Alerta de assinatura: sem keystore.properties o release sai unsigned (Play recusa).
if [ ! -f "$ANDROID_DIR/keystore.properties" ]; then
  echo "  ⚠ android/keystore.properties ausente → artefatos SAIRÃO UNSIGNED."
  echo "    (rode na branch native/v1-submit, onde o keystore vive.)"
fi

echo "▶ Buildando celular (:app) + relógio (:wear)…"
# bundleRelease → .aab (formato do Play). assembleRelease do wear → APK só p/ validar o manifesto.
# ⛔ :app:assembleRelease NÃO é opcional. Ordem do dono (12/set/2026): o .aab não se instala
# em aparelho nenhum — quem ele testa é o APK do CELULAR, direto, ANTES de qualquer subida.
# Sem este alvo, a leva chega ao fim sem a peça que o gate exige. [[project_apk_direto_e_o_gate]]
./gradlew :app:bundleRelease :app:assembleRelease :wear:bundleRelease :wear:assembleRelease --console=plain --no-daemon

APP_AAB="$(find app/build/outputs/bundle/release -name '*.aab' | head -1)"
APP_APK_REL="$(find app/build/outputs/apk/release -name '*.apk' | head -1)"
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
# ⛔ E o APK do CELULAR, que é o que o dono instala para APROVAR a leva.
[ -n "$APP_APK_REL" ] || { echo "❌ FALHA: :app não gerou APK. É ELE que o dono instala para dar o OK."; exit 1; }
echo "  ✅ APK do celular presente (o que vai para o aparelho do dono)."

# ── ENTREGA: o APK precisa CHEGAR ao aparelho, e o caminho é o Drive do dono ──
# Pôr no Drive montado é o único passo que não depende de Play, faixa de teste nem cabo:
# o celular vê o arquivo em segundos pelo app do Drive.
DRIVE="$HOME/Library/CloudStorage/GoogleDrive-rstbarth@gmail.com/Meu Drive"
APK_ENTREGUE=""
if [ -d "$DRIVE" ]; then
  # nome com a VERSÃO REAL: dois APKs indistinguíveis no Drive já custaram uma volta inteira.
  _VER="$(tr -d ' \n\r' < "$REPO_ROOT/version.txt" 2>/dev/null)"
  [ -n "$_VER" ] || _VER="$(date +%Y%m%d-%H%M)"
  APK_ENTREGUE="$DRIVE/scoreplace-$_VER.apk"
  cp "$APP_APK_REL" "$APK_ENTREGUE" && echo "  ✅ APK copiado para o Drive: $APK_ENTREGUE"
else
  echo "  ⚠ Drive não montado — o APK ficou só em $APP_APK_REL; leve-o ao aparelho na mão."
fi

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
echo "   Celular (.aab p/ o Play) : $APP_AAB"
echo "   Celular (.apk p/ o DONO) : $APP_APK_REL"
[ -n "$APK_ENTREGUE" ] && echo "   Celular (no Drive)       : $APK_ENTREGUE"
echo "   Relógio (.aab p/ o Play) : $WEAR_AAB"
echo ""
echo "⚠ MODELO ANDROID: são DUAS distribuições SEPARADAS na MESMA ficha do Play —"
echo "   • Celular → track do app de telefone"
echo "   • Relógio → track/distribuição de Wear OS (SEPARADA, não embutida)"
echo "   Suba os DOIS .aab. Subir só um deixa a outra plataforma pra trás."
echo "   O do relógio precisa estar ASSINADO com o mesmo upload key — ver nota"
echo "   sobre signingConfig do :wear no README de release."
echo "   (Na Apple é o oposto: watch vai EMBUTIDO num único arquivo — ver ios-archive.sh.)"
echo ""
echo "🚦 GATE OBRIGATÓRIO — quem aprova é o DONO, no aparelho dele (ordem de 12/set/2026):"
echo "   1) O APK já está no Drive dele. Ele instala DIRETO e testa."
echo "      ⚠ precisa DESINSTALAR o app vindo do Play antes: este é assinado com a chave de"
echo "        UPLOAD e o do Play com a de assinatura do Google — o Android recusa a troca."
echo "   2) Ele dá o OK."
echo "   3) SÓ ENTÃO os .aab sobem — e vão DIRETO para a faixa ABERTA/Produção."
echo "   ⛔ Emulador e faixa de teste interno saíram do caminho: não valem como aprovação"
echo "      e não se usam por hábito. O aparelho real do dono substituiu os dois."
