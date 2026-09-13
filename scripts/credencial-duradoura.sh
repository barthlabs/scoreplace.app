#!/usr/bin/env bash
# ⛔ FIM DA REAUTENTICAÇÃO A CADA DUAS HORAS.
#
# Ordem do dono (13/set/2026): _"vc precisa parar de usar essas merdas provisórios que caem a
# todo momento e preciso reautenticar. crie tokens duradouros"_.
#
# O QUE CAÍA E POR QUÊ: as duas credenciais que usávamos eram de USUÁRIO —
#   • `firebase login`                        → sessão de usuário, para publicar;
#   • `gcloud auth application-default login` → ADC de usuário, para ler o banco.
# Credencial de usuário do Google tem política de reautenticação obrigatória: ela EXPIRA por
# DESENHO, não por defeito nosso. Nenhum ajuste faz uma credencial de usuário durar.
#
# ⭐ O QUE DURA: uma CONTA DE SERVIÇO. A chave dela não expira, e a MESMA chave serve aos dois
# usos — o `firebase` CLI e o Admin SDK leem `GOOGLE_APPLICATION_CREDENTIALS`.
#
# Uso:  bash scripts/credencial-duradoura.sh                     (ensaio: só diz o que faria)
#       bash scripts/credencial-duradoura.sh --apply             (cria de verdade)
#       bash scripts/credencial-duradoura.sh --apply --ligar-no-shell
#
# ⚠️ PRÉ-REQUISITO, e é o ÚNICO passo humano: `gcloud auth login` uma vez. Criar conta de
# serviço exige um humano autenticado; depois disso, ninguém reautentica mais.
set -euo pipefail

PROJETO="scoreplace-app"
CONTA="scoreplace-deploy"
EMAIL="${CONTA}@${PROJETO}.iam.gserviceaccount.com"
DESTINO="${HOME}/.config/scoreplace"
CHAVE="${DESTINO}/deploy-sa.json"
APLICAR=0; LIGAR=0
for a in "$@"; do
  [ "$a" = "--apply" ] && APLICAR=1
  [ "$a" = "--ligar-no-shell" ] && LIGAR=1
done

# ⛔ A CHAVE NUNCA MORA NO REPOSITÓRIO. Fora da árvore do git não há como um `git add -A`
# distraído levá-la junto — e é um `git add -A` que eu uso o tempo todo.
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
case "$CHAVE" in
  "$RAIZ"*) echo "✗ recuso: a chave cairia dentro do repositório."; exit 1;;
esac

echo "▸ conferindo se há humano autenticado no gcloud…"
if ! gcloud auth print-access-token >/dev/null 2>&1; then
  echo
  echo "✗ O gcloud não tem sessão. Este é o ÚNICO passo que precisa de você, e é uma vez só:"
  echo
  echo "    gcloud auth login"
  echo
  echo "  Depois rode:  bash scripts/credencial-duradoura.sh --apply --ligar-no-shell"
  echo
  exit 1
fi
echo "  ✓ autenticado como: $(gcloud config get-value account 2>/dev/null)"

# ⛔ A CONTA ATIVA PODE NÃO SER A DONA DO PROJETO. MEDIDO em 13/set/2026: a ativa era
# `contato@barthlabs.com`, que NÃO tem `setIamPolicy` — o script morreu no meio, com metade
# dos papéis concedidos. A dona era `rstbarth@gmail.com`, e ela já estava autenticada ao lado.
# Em vez de fazer o dono adivinhar isso, procuro entre as contas autenticadas qual tem
# `roles/owner` e uso ELA, sem mexer no padrão do gcloud dele.
if [ -z "${CLOUDSDK_CORE_ACCOUNT:-}" ]; then
  for _c in $(gcloud auth list --format="value(account)" 2>/dev/null); do
    if gcloud projects get-iam-policy "$PROJETO" --account "$_c" \
         --flatten="bindings[].members" --filter="bindings.members:$_c" \
         --format="value(bindings.role)" 2>/dev/null | grep -q '^roles/owner$'; then
      export CLOUDSDK_CORE_ACCOUNT="$_c"
      echo "  ✓ dona do projeto: $_c — usando esta para conceder os papéis"
      break
    fi
  done
fi
if [ -z "${CLOUDSDK_CORE_ACCOUNT:-}" ]; then
  echo "  ⚠️ nenhuma conta autenticada é dona de $PROJETO — a concessão de papéis pode falhar."
  echo "     Autentique a conta dona:  gcloud auth login"
fi

# Papéis MÍNIMOS para o que a gente realmente faz: publicar hosting, subir functions de 2ª
# geração (que passam por Cloud Build / Artifact Registry / Cloud Run), publicar rules e ler
# o Firestore pelo Admin SDK. ⛔ Sem `owner` e sem `editor`: a conta que publica não precisa
# poder apagar o projeto.
PAPEIS=(
  roles/firebase.admin                # hosting + rules + firestore (nível console)
  roles/cloudfunctions.admin          # deploy das functions
  roles/run.admin                     # functions de 2ª geração rodam em Cloud Run
  roles/cloudbuild.builds.editor      # o build das functions
  roles/artifactregistry.admin        # onde a imagem do build fica
  roles/storage.admin                 # upload do código-fonte das functions
  roles/datastore.user                # leitura/escrita do Firestore pelo Admin SDK
  roles/iam.serviceAccountUser        # anexar a conta de runtime às functions
)

if [ -f "$CHAVE" ]; then
  echo "▸ JÁ EXISTE chave em $CHAVE — não crio outra."
  echo "  (cada chave nova é mais um segredo vivo por aí; para trocar, apague a antiga antes)"
else
  echo "▸ criaria a conta de serviço $EMAIL e a chave em $CHAVE"
fi

if [ "$APLICAR" != "1" ]; then
  echo
  echo "(ENSAIO — nada foi criado. Rode com --apply)"
  printf '  papéis que seriam concedidos:\n'
  printf '    · %s\n' "${PAPEIS[@]}"
  exit 0
fi

if ! gcloud iam service-accounts describe "$EMAIL" --project "$PROJETO" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$CONTA" --project "$PROJETO" \
    --display-name "scoreplace — publicação e leitura (sem expirar)"
  echo "  ✓ conta de serviço criada"
else
  echo "  ✓ conta de serviço já existia"
fi

for p in "${PAPEIS[@]}"; do
  gcloud projects add-iam-policy-binding "$PROJETO" \
    --member "serviceAccount:${EMAIL}" --role "$p" --condition=None >/dev/null
  echo "  ✓ papel $p"
done

if [ ! -f "$CHAVE" ]; then
  mkdir -p "$DESTINO"; chmod 700 "$DESTINO"
  # ⚠️ Se a organização proibir chave de conta de serviço
  # (política iam.disableServiceAccountKeyCreation), este passo falha — e o caminho então é
  # o console do Firebase: Configurações do projeto → Contas de serviço → Gerar nova chave.
  gcloud iam service-accounts keys create "$CHAVE" --iam-account "$EMAIL" --project "$PROJETO"
  chmod 600 "$CHAVE"
  echo "  ✓ chave gravada em $CHAVE (só o seu usuário lê)"
fi

LINHA="export GOOGLE_APPLICATION_CREDENTIALS=\"$CHAVE\""
if [ "$LIGAR" = "1" ]; then
  if ! grep -qF "$LINHA" "${HOME}/.zshrc" 2>/dev/null; then
    printf '\n# scoreplace — credencial que não expira (scripts/credencial-duradoura.sh)\n%s\n' "$LINHA" >> "${HOME}/.zshrc"
    echo "  ✓ ligada no ~/.zshrc"
  else
    echo "  ✓ já estava ligada no ~/.zshrc"
  fi
else
  echo
  echo "Falta ligar no shell — acrescente ao ~/.zshrc (ou rode com --ligar-no-shell):"
  echo "  $LINHA"
fi

echo
echo "✅ PRONTO. A partir daqui ninguém reautentica:"
echo "   • publicar    → scripts/deploy-hosting.sh   (o firebase CLI usa a chave)"
echo "   • ler o banco → Admin SDK usa a MESMA chave"
echo "   ⚠️ Conferir numa aba NOVA do terminal (a atual ainda não tem a variável)."
