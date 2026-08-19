#!/usr/bin/env bash
#
# TRAVA ÚNICA: o bundle EMBARCADO tem que ser o da versão que está sendo empacotada.
#
# Nasceu em 19/ago/2026. `npx cap sync` puro roda só a metade que COPIA o www/ que já
# existir — quem MONTA o www/ é o tools/build-www.js, dentro do `npm run cap:sync`.
# A regra estava copiada (e errada) no ios-archive.sh E no android-release.sh: os dois
# chamavam o sync puro com um `|| echo "seguindo com o www já presente"` que engolia a
# falha. Medido no dia: o www/ nem existia e o embarcado estava sem o toggle .pf-switch
# da 1.9.69 — o "ovo" teria voltado pro TestFlight pela SEGUNDA vez.
#
# Por isso a regra mora AQUI, num arquivo só, e os dois scripts chamam. Regra copiada
# em dois lugares diverge no primeiro ajuste — foi exatamente o que aconteceu.
#
# Por que NÃO conferir o `version.txt` embarcado (o caminho óbvio, e errado): ele fica
# FORA dos ASSETS do build-www.js de propósito, porque é o árbitro do auto-update
# (`fetch('/version.txt')` em js/store.js). Embarcá-lo faria o ping de update ler o
# próprio bundle. O símbolo que viaja junto do JS é o SCOREPLACE_VERSION do store.js.
#
# Uso: scripts/check-embedded-www.sh <ios|android> [repo_root]
#      (repo_root existe pros testes apontarem pra uma árvore de mentira)

set -euo pipefail

PLAT="${1:-}"
REPO_ROOT="${2:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

case "$PLAT" in
  ios)     EMBEDDED_STORE="$REPO_ROOT/ios/App/App/public/js/store.js" ;;
  android) EMBEDDED_STORE="$REPO_ROOT/android/app/src/main/assets/public/js/store.js" ;;
  *)       echo "uso: $0 <ios|android> [repo_root]" >&2; exit 2 ;;
esac

REPO_VER="$(tr -d '[:space:]' < "$REPO_ROOT/version.txt" 2>/dev/null || true)"
if [ -z "$REPO_VER" ]; then
  echo "✖ version.txt da raiz vazio ou ausente ($REPO_ROOT/version.txt)." >&2
  exit 1
fi

if [ ! -f "$EMBEDDED_STORE" ]; then
  echo "✖ EMBARCADO ausente: $EMBEDDED_STORE" >&2
  echo "  O www/ não foi montado. Rode 'npm run cap:sync'." >&2
  exit 1
fi

EMBEDDED_VER="$(sed -n "s/.*SCOREPLACE_VERSION *= *'\([^']*\)'.*/\1/p" "$EMBEDDED_STORE" | head -1)"

if [ -z "$EMBEDDED_VER" ]; then
  echo "✖ EMBARCADO sem SCOREPLACE_VERSION legível: $EMBEDDED_STORE" >&2
  echo "  Bundle corrompido ou de uma forma antiga. Rode 'npm run cap:sync'." >&2
  exit 1
fi

if [ "$EMBEDDED_VER" != "$REPO_VER" ]; then
  echo "✖ EMBARCADO fora de sincronia: store.js='$EMBEDDED_VER' vs version.txt='$REPO_VER'." >&2
  echo "  O www/ não foi montado NESTA leva. Rode 'npm run cap:sync'." >&2
  exit 1
fi

echo "▶ Embarcado conferido ($PLAT): SCOREPLACE_VERSION=$EMBEDDED_VER."
