#!/usr/bin/env bash
# Fonte comum para os dois únicos publicadores do projeto.
#
# A sessão de `firebase login` é de um usuário e pode exigir reautenticação. Publicação
# não pode cair nela como plano B: quando a conta de serviço não estiver apta, parar antes
# do preflight é melhor que gastar minutos e pedir um token expirado ao final.

sp_preparar_credencial_firebase() { # $1=raiz do projeto; $2=projeto Firebase
  local raiz="${1:?raiz obrigatória}" projeto="${2:?projeto obrigatório}"
  local padrao="${HOME}/.config/scoreplace/deploy-sa.json"
  local credencial="${GOOGLE_APPLICATION_CREDENTIALS:-$padrao}"
  local cofre

  if [ ! -r "$credencial" ]; then
    echo "✗ Credencial persistente indisponível: $credencial" >&2
    echo "  A publicação foi interrompida antes do preflight; ela nunca recorre a firebase login." >&2
    return 1
  fi

  export GOOGLE_APPLICATION_CREDENTIALS="$credencial"
  cofre="$(mktemp -d)"

  # Isola a CLI da sessão OAuth de usuário; com ela ausente, o Firebase usa somente a chave.
  if ! XDG_CONFIG_HOME="$cofre" firebase --project "$projeto" \
       functions:secrets:get SIGNIN_API_KEY >/dev/null 2>&1; then
    rm -rf "$cofre"
    echo "✗ A conta de serviço não consegue ler o pré-requisito de publicação." >&2
    echo "  Corrija as permissões da conta de serviço; não use firebase login --reauth." >&2
    return 1
  fi

  # A CLI consulta a API de faturamento antes de publicar Functions. Confere isso aqui,
  # para não descobrir a falta depois de testes e revisão.
  if ! SP_FIREBASE_RAIZ="$raiz" SP_FIREBASE_PROJETO="$projeto" node -e '
    const {GoogleAuth}=require(process.env.SP_FIREBASE_RAIZ+"/functions/node_modules/google-auth-library");
    const timer=setTimeout(()=>process.exit(1),15000);
    (async()=>{const auth=new GoogleAuth({scopes:["https://www.googleapis.com/auth/cloud-platform"]});
      const token=(await (await auth.getClient()).getAccessToken()).token;
      const response=await fetch("https://serviceusage.googleapis.com/v1/projects/"+process.env.SP_FIREBASE_PROJETO+"/services/cloudbilling.googleapis.com", {headers:{Authorization:"Bearer "+token}});
      const body=await response.json(); clearTimeout(timer);
      process.exit(response.ok && body.state==="ENABLED" ? 0 : 1);
    })().catch(()=>{clearTimeout(timer);process.exit(1);});' >/dev/null 2>&1; then
    rm -rf "$cofre"
    echo "✗ A conta de serviço não passou na validação da API exigida pelo deploy." >&2
    echo "  Corrija a conta de serviço; a publicação não recorrerá a token de usuário." >&2
    return 1
  fi

  export XDG_CONFIG_HOME="$cofre"
  export SP_FIREBASE_COFRE="$cofre"
  trap 'rm -rf "$SP_FIREBASE_COFRE"' EXIT
  echo "▸ credencial: conta de serviço ($(basename "$credencial")) — persistente"
}
