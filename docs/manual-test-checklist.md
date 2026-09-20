# Checklist de Teste Manual — Pré-Beta

**Versão atual:** v0.17.78-alpha
**Última revisão:** 2026-04-29

Este checklist guia uma validação manual completa antes de subir pra beta.
**Tempo estimado:** ~45-60 minutos.

> 💡 **Dica:** abre uma aba anônima (Cmd+Shift+N) pra cada cenário. Limpa
> cookies/localStorage entre testes pra simular usuário novo. Use DevTools
> aberto na aba Console o tempo todo — qualquer **erro vermelho** é regressão.

---

## 0. Setup

- [ ] Abre `https://scoreplace.app/` em aba anônima
- [ ] DevTools aberto (Cmd+Option+I) na aba Console
- [ ] Network tab limpo (não precisa "preserve log")
- [ ] Anota a versão visível no canto da landing (ex: `v0.17.78-alpha`)

---

## 1. Landing page (sem login)

- [ ] Carregamento sem erros JS no console
- [ ] Logo do pódio aparece sem pontos brancos nos cantos
- [ ] Tagline "Jogue em outro nível" visível
- [ ] Botão "Crie seu torneio grátis" verde escuro (não claro)
- [ ] 7 sport pills aparecem na fila: Beach Tennis (laranja), Pickleball (amarelo), Tênis, etc.
- [ ] Cards de features carregam (Chaveamento Automático, 5 Formatos, etc.)
- [ ] Footer tem links **Política de Privacidade** e **Termos de Uso** clicáveis

### 1.1 Páginas legais
- [ ] Click "Política de Privacidade" → abre `#privacy` com 6 seções (1. Dados que coletamos, 2. Como usamos, etc.)
- [ ] Volta com botão "Voltar" do header
- [ ] Click "Termos de Uso" → abre `#terms` com banner amarelo "App em fase Alpha" + 6 seções
- [ ] Volta com botão "Voltar"

### 1.2 Sport pills
- [ ] Beach Tennis tem ícone 🎾 com hue-rotate laranja (não verde puro)
- [ ] Vôlei de Praia: ícone 🏐
- [ ] Futevôlei: ícone ⚽

---

## 2. Login (4 métodos)

> **Pré-requisito:** ter conta Google de teste E-mail/senha de teste.

- [ ] Click "Login" no canto direito → modal abre
- [ ] Modal mostra 3 métodos: SMS, e-mail/senha e Google
- [ ] **Disclaimer no fim do modal:** "Ao continuar, você concorda com os Termos de Uso e a Política de Privacidade"
- [ ] Click no link "Termos de Uso" do disclaimer → abre `#terms` em nova aba

### 2.1 Login com Google
- [ ] Click "Continuar com Google"
- [ ] Popup do Google abre
- [ ] Seleciona conta → popup fecha
- [ ] **Modal de aceite de Termos aparece** se primeira vez
  - [ ] Header "⚠️ Antes de continuar…"
  - [ ] 2 links cliáveis (Termos + Privacy) abrem em nova aba
  - [ ] Checkbox "Li e concordo…" desmarcado
  - [ ] Botão "Confirmar" desabilitado
  - [ ] Marca o checkbox → "Confirmar" habilita
  - [ ] Click Confirmar → modal fecha
- [ ] Dashboard renderiza
- [ ] Topbar mostra avatar + nome do usuário

### 2.2 Logout e re-login
- [ ] Click avatar → menu → "Sair"
- [ ] Volta pra landing
- [ ] Click Login → Google → seleciona MESMA conta
- [ ] Modal de Termos **NÃO** aparece (já aceitou)
- [ ] Vai direto pro dashboard

### 2.3 Re-login com conta Google diferente
- [ ] Logout novamente
- [ ] Login com Google → escolhe **outra conta** (deve aparecer picker)
- [ ] Modal de Termos aparece (conta nova)
- [ ] Aceita → dashboard

---

## 3. Perfil

- [ ] Click avatar → "Meu Perfil" → modal abre
- [ ] Edita: gênero (radio buttons), data de nascimento (input dd/mm/aaaa)
- [ ] Modalidades favoritas: pills clicáveis selecionam/desselecionam
- [ ] CEPs preferidos: input texto
- [ ] **Toggles de notificação** (Todas/Importantes/Fundamentais): clicáveis
- [ ] **Toggle "Auto check-in GPS"**: clica e muda visual
- [ ] **Toggle "Mostrar Dicas"**: clica e muda visual
- [ ] **Bandeiras de idioma** 🇧🇷 / 🇺🇸: troca idioma da UI
- [ ] Click "Salvar"
- [ ] Toast de sucesso aparece
- [ ] Reabre modal → campos persistiram

---

## 4. Criar Torneio (fluxo crítico)

- [ ] Dashboard → "Novo Torneio" verde
- [ ] Modal "Criação Rápida" aparece
- [ ] Seletor de modalidade (Beach Tennis, Padel, etc.)
- [ ] Click "Detalhes Avançados"
- [ ] Modal completo abre

### 4.1 Modal completo — labels traduzidos
- [ ] **Nenhuma label aparece como key crua** (ex: `create.nameLabel`, `btn.save`, `format.single`)
- [ ] Voltar / Carregar Template / Salvar Template / Descartar / Salvar (botões topo)
- [ ] Nome do torneio: input
- [ ] Esporte: pills
- [ ] Logo: gerar/upload/lock/clear/download
- [ ] Toggle "Público": funciona

### 4.2 Formato + Sorteio
- [ ] 4 botões de formato: Eliminatórias / Dupla / Grupos+Elim / Liga
- [ ] Click "Grupos + Elim." → 2 botões drawMode aparecem (Sorteio / Rei-Rainha)
- [ ] **Quando clica Grupos+Elim, o botão Rei-Rainha some automaticamente** (foi correção da v0.17.75)
- [ ] Click "Liga" → drawMode visível, com sub-toggle de Round Format

### 4.3 Toggles W.O.
- [ ] Toggle "Individual" 👤 ON → desc "W.O. afeta só o jogador ausente…"
- [ ] Click toggle OFF → label muda pra "Time Inteiro" 👥, desc atualiza

### 4.4 Toggles Inscrições após encerramento
- [ ] "Fechadas" inicia ON, "Novos Confrontos" inicia OFF
- [ ] Click "Novos Confrontos" → "Fechadas" automaticamente vai pra OFF
- [ ] Click "Fechadas" → "Novos Confrontos" automaticamente vai pra OFF
- [ ] Ambos podem ficar OFF (= "standby")

### 4.5 Salvar
- [ ] Preenche nome, datas, formato Eliminatórias Simples
- [ ] Click "Salvar"
- [ ] Toast sucesso
- [ ] Volta pro dashboard com torneio listado

### 4.6 Detalhes do torneio
- [ ] Click no card do torneio
- [ ] Página detalhe abre
- [ ] Voltar / Hamburger no topo (sticky header padrão)
- [ ] Botão "Convidar" funciona — gera QR + link
- [ ] Botão "+Bot" adiciona bot
- [ ] Botão "Apagar" — confirma antes de deletar

---

## 5. Sortear torneio (Eliminatórias Simples)

> **Pré-req:** torneio criado em §4 com 4-8 participantes (use bots).

- [ ] Adiciona 8 bots
- [ ] Click "Encerrar Inscrições"
- [ ] Click "Sortear"
- [ ] Bracket renderiza com 4 jogos da Rodada 1
- [ ] Cards de jogo mostram p1 vs p2 corretamente
- [ ] **Não há rotação de parceiros** (não é Rei/Rainha)

### 5.1 Lançar placar
- [ ] Click no input de placar do primeiro jogo: digita "6" e "3"
- [ ] Click "Confirmar"
- [ ] Sem erro vermelho no console
- [ ] Card mostra vencedor com badge verde
- [ ] Próxima rodada gera automaticamente quando todos os jogos terminam

---

## 6. Grupos + Eliminatórias (regressão da v0.17.75)

- [ ] Cria torneio Grupos+Elim com **21 participantes** (ou 16/32)
- [ ] Encerra Inscrições → painel "Configuração dos Grupos" aparece
- [ ] **Para 21 participantes:** primeira opção (RECOMENDADO) deve ser "1 grupo de 6 + 3 grupos de 5" (8 avançam, ✓ POT.2). NÃO "1 grupo de 11 + 1 grupo de 10".
- [ ] Para 16: recomenda "4 grupos de 4"
- [ ] Para 32: recomenda "8 grupos de 4"
- [ ] Confirma config → sorteia → grupos aparecem
- [ ] **Cada jogo é p1 vs p2 simples (não rotação Rei/Rainha)**

---

## 7. Classificação (Liga)

- [ ] Cria torneio Liga com 5 participantes
- [ ] Encerra Inscrições → Sortear
- [ ] Bracket renderiza primeira rodada
- [ ] Lança placares 6-2, 4-6, 7-5 etc. nos jogos
- [ ] Tabela "Classificação — Rodada 1" aparece
- [ ] **Coluna E (Empates) NÃO deve aparecer** se tournament tem scoring sets-based (Beach Tennis padrão)
- [ ] **Scrollbar horizontal visível** na tabela
- [ ] Click em coluna PTS → reordena
- [ ] Click no nome do jogador → modal de Estatísticas Detalhadas

---

## 8. Partida Casual

- [ ] Dashboard → "⚡ Partida Casual"
- [ ] Modal abre — tela cheia
- [ ] Define 2 jogadores ou times
- [ ] Click "Iniciar"
- [ ] Placar ao vivo aparece
- [ ] Tap "+1" no placar → atualiza
- [ ] Click "Encerrar" → confirma → resultado salvo

---

## 9. Presença

- [ ] Dashboard → "📍 Place"
- [ ] Mapa carrega (pode pedir permissão GPS — aceita)
- [ ] Cards de venues aparecem em ordem de distância
- [ ] Click "📍 Estou aqui agora"
- [ ] Modal seletor de modalidade
- [ ] Confirma → toast aparece
- [ ] Card do venue ficou focado com gráfico de barras

---

## 10. PWA / Offline

- [ ] DevTools → Application → Service Workers — está "activated and is running"
- [ ] Manifest tem icons 192/512 SVG
- [ ] Network tab → Offline checkbox → reload página → ainda funciona (cache)
- [ ] Voltar online → reload → versão atual

---

## 11. Themes

- [ ] Botão de tema na topbar (🌙)
- [ ] Click → muda tema (cicla 4 temas: Noturno → Claro → Sunset → Oceano → repeat)
- [ ] Em **Sunset (light cream)**: cards de torneio têm fundo amarelado, texto escuro
- [ ] Em **Oceano**: tons de azul-marinho profundo, texto branco
- [ ] Reload → tema persiste

---

## 12. Notificações

- [ ] Header tem ícone de sino com dot vermelho se há notif não-lida
- [ ] Click no sino → vai pra `#notifications`
- [ ] Lista de notifs aparece
- [ ] Click numa notif → marca como lida + navega pro contexto

---

## 13. Console errors

Após percorrer todos os fluxos acima:

- [ ] Console NÃO tem nenhuma linha **vermelha** (erros)
- [ ] **Warnings amarelas são OK** se forem de extensões do browser ou Firebase auth domain
- [ ] Se aparecer erro, copia a stack trace + URL + reporta

---

## 14. Critérios de saída pra beta (verificação final)

Comparar com `docs/beta-readiness.md`:

- [ ] **Performance Lighthouse ≥ 60** ✅ (atual 64)
- [ ] **Acessibilidade ≥ 95** ✅ (atual 100)
- [ ] **0 erros JS no console** após smoke completo
- [ ] **Sentry recebendo eventos** — descomentar linha em `index.html` quando criar projeto
- [ ] **E2E ≥ 10 cenários green** ✅ (34 testes em 2 projects)
- [ ] **Backup Firestore** — `firebase deploy --only functions:backupFirestore` após setup gcloud
- [ ] **Privacy + Termos** ✅ publicados, ⚙️ aguardando revisão jurídica
- [ ] **Reset de dados** — comunicar amigos-testers + limpar collections no console Firebase
- [ ] **Quotas Firebase** — Console > Functions > Alerts (3 alerts: reads spike, writes spike, 5xx errors) + Cloud Billing budget alerts ($20, $50, $100)

---

## Se algo falhar

**Erros não-críticos (warning amarelo, layout meio quebrado):**
- Anota mas continua o checklist
- Reporta tudo junto no fim

**Erros críticos (página em branco, dados perdidos, login impossível):**
- Para imediatamente
- Captura screenshot + console
- Reporta com versão + passo exato pra reproduzir
- Eu reverto a release problemática

**Critério de saída:** **TODOS os 14 itens** passam. Se algum falhar e não for trivial, **NÃO subir pra beta**.

---

## Tempo de execução

- Itens 0-3: ~10 min (setup + landing + login + perfil)
- Itens 4-7: ~25 min (torneios — coração do app)
- Itens 8-12: ~15 min (casual + presença + PWA + temas + notif)
- Item 13: ~3 min (console review)
- Item 14: ~5 min (resumo)
- **Total: ~58 min** com calma

Pode quebrar em sessões — não precisa fazer tudo de uma vez. Salva progresso anotando qual item parou.
