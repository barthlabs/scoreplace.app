#!/bin/bash
# deploy-functions.sh — deploy SEGURO das Cloud Functions: SEMPRE alvejado por nome.
#
# POR QUE EXISTE (incidente 02/ago/2026): os três codebases (functions/,
# functions-autodraw/, functions-stripe/) se enxergam como "default" —
# `firebase deploy --only functions` de qualquer um deles lista as funções dos
# OUTROS como "a deletar". Com `--force` DELETA (aconteceu: a raiz apagou
# autodraw+stripe, o autodraw apagou as ~49 principais; ~15min de outage).
# Sem `--force`, o não-interativo ABORTA. O único caminho seguro é o deploy
# alvejado pelos nomes — que é o que este script monta sozinho, lendo os
# exports do código. Ver memória project_autodraw_deploy_footgun.
#
# Uso:
#   scripts/deploy-functions.sh main            # codebase principal (functions/)
#   scripts/deploy-functions.sh autodraw        # sorteio (functions-autodraw/)
#   scripts/deploy-functions.sh stripe          # Pro/pagamentos (functions-stripe/)
#   scripts/deploy-functions.sh all             # os três, em sequência
#   scripts/deploy-functions.sh main --dry-run  # só mostra o comando, não roda
#   scripts/deploy-functions.sh main --only drainPendingVerifications,drainPendingPasswordResets
#                                              # publica somente funções principais nomeadas
#
# NUNCA rodar `firebase deploy --only functions` puro nem `--force` na mão.

set -euo pipefail

# ⛔⛔ A CONTA DE SERVIÇO TEM DE VENCER A SESSÃO DE USUÁRIO VELHA.
#
# MEDIDO em 14/set/2026: com a chave durável LIGADA, o deploy mesmo assim morreu em
# "For CI servers and headless environments, generate a new token" — a CLI do Firebase
# PREFERE a sessão de usuário guardada (`~/.config/configstore/firebase-tools.json`), e
# aquela sessão tinha expirado. Ou seja: ter a credencial durável não bastava; era preciso
# a CLI não achar a outra.
#
# `XDG_CONFIG_HOME` aponta o cofre de credenciais da CLI para um diretório vazio: sem sessão
# de usuário para achar, ela usa a conta de serviço. Mexe SÓ nisso — trocar `HOME` também
# resolveria, mas levaria junto cache do npm e tudo o mais.
#
# ⚠️ Só entra quando a chave durável existe. Sem ela, o comportamento antigo continua, e a
# mensagem de "não autenticado" segue explicando o caminho que dura.
if [ -n "${GOOGLE_APPLICATION_CREDENTIALS:-}" ] && [ -r "${GOOGLE_APPLICATION_CREDENTIALS}" ]; then
  export _SP_RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
  # ⛔ E SÓ SE ELA REALMENTE CONSEGUIR PUBLICAR. MEDIDO em 14/set/2026: a conta de serviço
  # autentica, mas não tem acesso aos SEGREDOS que três funções declaram — e o deploy morre
  # com 403 do Secret Manager. Esconder a sessão de usuário nesse caso troca um problema por
  # outro: some a credencial que funciona. O teste abaixo é uma leitura barata que usa
  # exatamente a permissão que falta; se passar, a conta de serviço assume (e não expira). Se
  # não, o script segue com a sessão de usuário e DIZ por quê, em vez de falhar no meio.
  _SP_CFG="$(mktemp -d)"
  # ⛔ O TESTE TEM DE COBRIR TUDO QUE O DEPLOY USA, não só o que me mordeu da última vez.
  # MEDIDO em 14/set/2026: a conta de serviço passou no teste do segredo e MESMO ASSIM o deploy
  # morreu depois, em `cloudbilling.googleapis.com ... 403` — a API de faturamento está
  # DESATIVADA no projeto, e a CLI a consulta antes de subir função. Um teste que valida metade
  # dá confiança falsa e falha no meio, que é o pior lugar para falhar.
  # ⛔ A SEGUNDA CONDIÇÃO É A API DE FATURAMENTO, e ela não se testa pela CLI: a consulta só
  # acontece lá dentro do deploy. MEDIDO em 14/set/2026: a conta de serviço passou no teste do
  # segredo e o deploy morreu depois em `cloudbilling.googleapis.com ... 403` — a API está
  # DESATIVADA no projeto. Um teste que valida metade dá confiança falsa e falha no meio.
  if XDG_CONFIG_HOME="$_SP_CFG" firebase --project "${PROJECT:-scoreplace-app}" \
       functions:secrets:get SIGNIN_API_KEY >/dev/null 2>&1 \
     && _SP_RAIZ="$(cd "$(dirname "$0")/.." && pwd)" && node -e '
       const {GoogleAuth}=require(process.env._SP_RAIZ+"/functions/node_modules/google-auth-library");
       (async()=>{const a=new GoogleAuth({scopes:["https://www.googleapis.com/auth/cloud-platform"]});
        const t=(await (await a.getClient()).getAccessToken()).token;
        const r=await fetch("https://serviceusage.googleapis.com/v1/projects/scoreplace-app/services/cloudbilling.googleapis.com",
          {headers:{Authorization:"Bearer "+t}});
        const j=await r.json();
        process.exit(r.ok && j.state==="ENABLED" ? 0 : 1);})().catch(()=>process.exit(1));' >/dev/null 2>&1; then
    export XDG_CONFIG_HOME="$_SP_CFG"
    trap 'rm -rf "$_SP_CFG"' EXIT
    echo "▸ credencial: conta de serviço ($(basename "$GOOGLE_APPLICATION_CREDENTIALS")) — não expira"
  else
    rm -rf "$_SP_CFG"
    # ⛔ DIZER O QUE DE FATO FALTOU, não o último motivo que eu conheci. Esta mensagem já
    # culpou os segredos quando o que faltava era a API de faturamento — e mandar consertar a
    # coisa errada custa mais caro que não dizer nada.
    echo "▸ credencial: sessão de usuário (a conta de serviço não passou no teste)"
    if ! XDG_CONFIG_HOME="$_SP_CFG" firebase --project scoreplace-app \
         functions:secrets:get SIGNIN_API_KEY >/dev/null 2>&1; then
      echo "  Falta: papel de Secret Manager para a conta de serviço."
    else
      echo "  Falta: a API cloudbilling.googleapis.com está DESATIVADA no projeto — a CLI a"
      echo "  consulta antes de subir função, e só a sessão de usuário passa por ela hoje."
    fi
    echo "  Enquanto isso, publicar depende de uma sessão que expira."
  fi
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="scoreplace-app"
DRY=0
ONLY=""

die() { echo "✗ $*" >&2; exit 1; }

ALVO="${1:-}"
shift || true
while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1; shift ;;
    --only)
      [ "$#" -ge 2 ] || die "--only exige uma lista de nomes de funções"
      ONLY="$2"
      shift 2
      ;;
    *) die "opção desconhecida: $1" ;;
  esac
done

# Monta "functions:a,functions:b,…" a partir dos exports CJS (^exports.nome).
targets_cjs() { # $1=arquivo $2=prefixo (ex.: "functions:" ou "functions:stripe:")
  grep -o '^exports\.[A-Za-z0-9_]*' "$1" | sed "s/exports\./$2/" | sort -u | paste -sd, -
}
# Idem pra exports ESM (^export const nome).
targets_esm() {
  grep -o '^export const [A-Za-z0-9_]*' "$1" | sed "s/export const /$2/" | sort -u | paste -sd, -
}

# Limita o deploy a exports existentes. O prefixo faz a mesma validação servir
# tanto ao codebase principal quanto aos codebases nomeados.
selected_targets() { # $1=todos os alvos, $2=prefixo do codebase
  local all="$1" prefix="$2"
  [ -n "$ONLY" ] || { printf '%s' "$all"; return 0; }

  local out="" name candidate
  local IFS=','
  read -r -a names <<< "$ONLY"
  for name in "${names[@]}"; do
    [[ "$name" =~ ^[A-Za-z0-9_]+$ ]] || die "nome de função inválido em --only: $name"
    candidate="${prefix}${name}"
    [[ ",$all," == *",$candidate,"* ]] || die "--only pediu export inexistente: $name"
    out="${out:+$out,}$candidate"
  done
  [ -n "$out" ] || die "--only não selecionou nenhuma função"
  printf '%s' "$out"
}

deploy_dir() { # $1=dir(de onde rodar o firebase) $2=targets $3=descrição $4=pkgdir(deps; default=$1)
  local dir="$1" targets="$2" desc="$3" pkgdir="${4:-$1}"
  [ -n "$targets" ] || die "$desc: nenhum export encontrado — lista de alvos vazia (abortando por segurança)"
  local n; n=$(echo "$targets" | tr ',' '\n' | wc -l | tr -d ' ')
  echo "── $desc: $n função(ões) alvejada(s)"
  if [ "$DRY" = 1 ]; then
    echo "   (dry-run) cd $dir && firebase deploy --project $PROJECT --non-interactive --only $targets"
    return 0
  fi
  # As deps do CODEBASE, não as de onde o firebase roda — no principal os dois diretórios
  # são diferentes ($ROOT × $ROOT/functions) e a raiz TEM node_modules (dos testes), então
  # checar o do dir dava "instalado" e o deploy morria em "Couldn't find firebase-functions
  # package in your source code" (aconteceu num worktree limpo, 04/ago/2026). Checar o pacote
  # em vez da pasta também cobre node_modules pela metade.
  [ -d "$pkgdir/node_modules/firebase-functions" ] || (cd "$pkgdir" && npm ci)
  # ⛔ O CLI pode imprimir "Deploy complete!" e sair não-zero. Isso não pode derrubar um
  # deploy que chegou ao fim, mas também não pode transformar QUALQUER erro em sucesso: sem o
  # marcador explícito, não há evidência de publicação e o próximo codebase não deve rodar.
  local _rc=0
  local _log
  _log="$(mktemp)"
  if (cd "$dir" && firebase deploy --project "$PROJECT" --non-interactive --only "$targets") >"$_log" 2>&1; then
    _rc=0
  else
    _rc=$?
  fi
  cat "$_log"
  if [[ "$_rc" != "0" ]]; then
    if ! grep -q 'Deploy complete!' "$_log"; then
      rm -f "$_log"
      die "$desc: firebase saiu com código $_rc sem confirmar 'Deploy complete!' — abortando"
    fi
    echo "⚠ firebase saiu com código $_rc DEPOIS de confirmar o deploy; seguindo pela evidência do CLI."
  fi
  rm -f "$_log"
}

do_main() {
  local all targets
  all="$(targets_cjs "$ROOT/functions/index.js" 'functions:')"
  targets="$(selected_targets "$all" 'functions:')" || return $?
  deploy_dir "$ROOT" "$targets" \
    "principal (functions/)" "$ROOT/functions"
}
do_autodraw() {
  local all targets
  all="$(targets_cjs "$ROOT/functions-autodraw/index.js" 'functions:')"
  targets="$(selected_targets "$all" 'functions:')" || return $?
  if [ "$DRY" != 1 ]; then
    [ -d "$ROOT/functions-autodraw/node_modules" ] || (cd "$ROOT/functions-autodraw" && npm ci)
    (cd "$ROOT/functions-autodraw" && node copy-vendor.js && node test-draw.js) \
      || die "autodraw: test-draw.js falhou — NÃO deployar sorteio quebrado"
  fi
  deploy_dir "$ROOT/functions-autodraw" "$targets" "autodraw (functions-autodraw/)"
  [ "$DRY" = 1 ] || echo "⚠️  commitar o diff de functions-autodraw/vendor/ (o predeploy re-sincroniza)"
}
do_stripe() {
  # Codebase NOMEADO ("stripe") → o filtro EXIGE o prefixo do codebase.
  deploy_dir "$ROOT/functions-stripe" \
    "$(targets_esm "$ROOT/functions-stripe/index.js" 'functions:stripe:')" "stripe (functions-stripe/)"
}

case "$ALVO" in
  main)     do_main ;;
  autodraw) do_autodraw ;;
  stripe)   do_stripe ;;
  all)      do_main; do_autodraw; do_stripe ;;
  *) die "uso: scripts/deploy-functions.sh [main|autodraw|stripe|all] [--dry-run] [--only nome[,nome]]" ;;
esac
# ⭐ CARIMBA — e SÓ o escopo que realmente foi publicado, SÓ em deploy de verdade.
# ⛔ Carimbar em `--dry-run`, ou carimbar "backend" ao publicar o codebase `main`, faria o carimbo
# provar o que não aconteceu: a web subiria contra Rules ou sorteio velhos com o portão verde.
# ⛔ E SÓ EM DEPLOY COMPLETO DO CODEBASE: com `--only X` publica-se UMA função, mas o carimbo diria
# que todo o `functions-autodraw` está no ar no SHA mais novo — uma função alterada e não
# selecionada continuaria velha com o portão verde.
if [ "$DRY" != "1" ] && [ -z "${ONLY:-}" ] && { [ "$ALVO" = "autodraw" ] || [ "$ALVO" = "all" ]; }; then
  node "$(dirname "$0")/check-backend-publicado.js" --carimbar autodraw || true
fi
echo "✓ deploy alvejado concluído — conferir com: firebase functions:list --project $PROJECT"
