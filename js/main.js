// Retiramos o DOMContentLoaded event para evitar condição de corrida com ES Modules (type="module")
// já que o script está no final do <body> e o DOM já estará parseado.

// === Modal Ajuda / Manual ===
// v1.3.11-beta: convertido de IIFE pra função regular — permite rebuild
// quando o user navega pra fora de #help (view-container clear destrói
// o .modal) e volta. Auto-chamado uma vez no final do arquivo, preserva
// o comportamento original (DOM existe na body imediatamente após load).
function setupHelpModal() {
  if (document.getElementById('modal-help')) return;

  var _t = window._t || function(k) { return k; };
  var helpSections = [
    {
      id: 'instalar-app',
      title: 'Instalar o app na tela inicial',
      icon: '📲',
      content: '<p>O <b>scoreplace.app</b> funciona como um <b>aplicativo</b> no seu celular ou computador — basta adicionar o ícone à tela inicial. Sem App Store, sem download — abre direto no navegador, mas com cara de app: <b>tela cheia, ícone próprio, abre rápido</b> e funciona até offline (cache local).</p>' +
        '<div style="background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.15);border-radius:10px;padding:12px;margin-bottom:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">📱 iPhone / iPad — Safari</div>' +
          '<p style="font-size:0.78rem;color:var(--text-muted);margin:0 0 8px;"><b>⚠️ Tem que ser pelo Safari</b>. No iPhone, o Chrome <b>não consegue</b> instalar PWAs (limitação da Apple) — abra <code style="background:rgba(255,255,255,0.06);padding:1px 5px;border-radius:3px;">scoreplace.app</code> no Safari pra esse passo-a-passo funcionar.</p>' +
          '<ol style="padding-left:20px;margin:6px 0;">' +
            '<li>Abra <b>scoreplace.app</b> no <b>Safari</b> (não em Navegação Privativa)</li>' +
            '<li>Toque no ícone <b>Compartilhar</b> <span style="display:inline-block;border:1px solid currentColor;border-radius:4px;padding:0 5px;margin:0 2px;vertical-align:middle;font-size:0.75rem;">⬆</span> na barra de baixo:' +
              '<ul style="padding-left:18px;margin:4px 0;font-size:0.78rem;">' +
                '<li><b>iOS 16 e anterior</b>: ícone aparece direto na barra inferior</li>' +
                '<li><b>iOS 17+</b>: barra ficou compacta — toque nos <b>•••</b> no canto direito → "Compartilhar". Alternativa: toque em <b>"Aa"</b> ao lado do endereço → "Compartilhar"</li>' +
              '</ul>' +
            '</li>' +
            '<li>Role pra baixo até <b>"Adicionar à Tela de Início"</b>. Se não aparecer, toque em <b>"Editar Ações"</b> no fim da lista e ative a opção</li>' +
            '<li>Toque em <b>Adicionar</b> no canto superior direito</li>' +
            '<li>Pronto — o ícone do <b>scoreplace.app</b> aparece na tela inicial junto com seus apps. Toque pra abrir em tela cheia</li>' +
          '</ol>' +
        '</div>' +
        '<div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);border-radius:10px;padding:12px;margin-bottom:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">🤖 Android — Chrome (ou Edge / Firefox)</div>' +
          '<p style="font-size:0.78rem;color:var(--text-muted);margin:0 0 8px;">Funciona em qualquer navegador moderno no Android. O Chrome geralmente já oferece sozinho — se não, segue o passo manual.</p>' +
          '<ol style="padding-left:20px;margin:6px 0;">' +
            '<li>Abra <b>scoreplace.app</b> no <b>Chrome</b></li>' +
            '<li>Geralmente aparece um <b>banner "Adicionar scoreplace à tela inicial"</b> automaticamente — toque em <b>Instalar</b></li>' +
            '<li>Se não aparecer banner: toque nos <b>três pontinhos ⋮</b> no canto superior direito → <b>"Instalar app"</b> (ou <b>"Adicionar à tela inicial"</b>)</li>' +
            '<li>Toque em <b>Instalar</b> na confirmação</li>' +
            '<li>O ícone aparece na sua tela inicial. Abre como app nativo, fora do navegador</li>' +
          '</ol>' +
        '</div>' +
        '<div style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.15);border-radius:10px;padding:12px;margin-bottom:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">💻 Computador — Chrome / Edge / Brave</div>' +
          '<ol style="padding-left:20px;margin:6px 0;">' +
            '<li>Abra <b>scoreplace.app</b> no Chrome / Edge / Brave</li>' +
            '<li>Na barra do endereço, à direita, procure o ícone <b>➕ Instalar</b> (parece um monitor com seta)</li>' +
            '<li>Se não aparecer: menu <b>⋮</b> no canto superior direito → <b>"Instalar scoreplace.app..."</b></li>' +
            '<li>Confirme em <b>Instalar</b></li>' +
            '<li>Vira app independente: aparece na taskbar (Windows) ou Dock/Launchpad (Mac), abre em janela própria sem barra de URL</li>' +
          '</ol>' +
          '<p style="font-size:0.75rem;color:var(--text-muted);margin-top:6px;">No <b>Safari Mac</b> (macOS Sonoma+) também rola: menu <b>Arquivo</b> → <b>"Adicionar ao Dock"</b>.</p>' +
        '</div>' +
        '<div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);border-radius:10px;padding:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">✨ Por que vale a pena instalar</div>' +
          '<ul style="padding-left:20px;margin:6px 0;">' +
            '<li><b>Ícone</b> próprio na tela — abre num toque, sem digitar URL</li>' +
            '<li><b>Tela cheia</b> — sem barra do navegador, mais espaço pra placar e bracket</li>' +
            '<li><b>Notificações push</b> mais confiáveis (especialmente no iOS, onde só funcionam pra app instalado)</li>' +
            '<li><b>Funciona offline</b> — cache local guarda telas e dados. Útil em quadra com sinal ruim</li>' +
            '<li><b>Abre rápido</b> — assets pré-carregados, sem cold start</li>' +
          '</ul>' +
        '</div>'
    },
    {
      id: 'about',
      title: _t('help.about'),
      icon: '🏆',
      content: '<div style="text-align:center; margin-bottom:1rem;">' +
        '<div style="font-size:2.2rem; margin-bottom:0.3rem;">🏆</div>' +
        '<div style="font-size:1.3rem; font-weight:800; color:var(--text-bright);">scoreplace.app</div>' +
        '<div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">Versão ' + (window.SCOREPLACE_VERSION || '1.0.0-beta') + '</div>' +
        '<div style="font-size:0.8rem; color:var(--text-main); margin-top:8px; line-height:1.6;">Jogue em outro nível — torneios, partidas casuais, presença e locais esportivos.</div>' +
        '<div style="font-size:0.7rem; color:var(--text-muted); opacity:0.6; margin-top:4px;">Fase Beta — funcionalidades estáveis, dados persistem.</div>' +
        '</div>' +
        '<div style="background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.3); border-radius:10px; padding:12px 14px; margin-bottom:1rem;">' +
        '<div style="font-weight:700; font-size:0.85rem; color:#10b981; margin-bottom:6px;">🚀 App em Beta</div>' +
        '<p style="font-size:0.78rem; color:var(--text-main); line-height:1.6; margin:0;">Saímos do alpha em 29 de Abril, 2026. Funcionalidades estáveis, dados persistem. Bugs ainda podem aparecer — seu feedback nos ajuda a melhorar.</p>' +
        '</div>' +
        '<div style="text-align:center; margin-bottom:1rem;">' +
        '<button class="btn btn-indigo hover-lift" onclick="(function(){' +
        "var v=window.SCOREPLACE_VERSION||'?';" +
        "var ua=navigator.userAgent;" +
        "var user=(window.AppStore&&window.AppStore.currentUser)?window.AppStore.currentUser.displayName:'(não logado)';" +
        "var email=(window.AppStore&&window.AppStore.currentUser)?window.AppStore.currentUser.email:'';" +
        "var subject=encodeURIComponent('scoreplace.app v'+v+' — Feedback');" +
        "var body=encodeURIComponent(" +
        "'Olá equipe scoreplace!\\n\\n'" +
        "+'Descreva aqui o problema ou sugestão:\\n\\n\\n'" +
        "+'---\\n'" +
        "+'Versão: '+v+'\\n'" +
        "+'Usuário: '+user+'\\n'" +
        "+'Email: '+email+'\\n'" +
        "+'Dispositivo: '+ua+'\\n'" +
        "+'Data: '+new Date().toLocaleString('pt-BR')+'\\n'" +
        ");" +
        "window.open('mailto:scoreplace.app@gmail.com?subject='+subject+'&body='+body,'_blank');" +
        '})()">' +
        '<span style="font-size:1.1rem;">📩</span> Reportar Problema ou Sugestão</button>' +
        '</div>' +
        '<p style="font-size:0.7rem; color:var(--text-muted); text-align:center; margin-bottom:0.5rem;">Ao clicar, será aberto seu app de e-mail com informações técnicas preenchidas automaticamente para nos ajudar a resolver mais rápido.</p>' +
        '<div style="font-size:0.7rem; color:var(--text-muted); margin-top:8px; text-align:center;">© 2026 scoreplace.app. Todos os direitos reservados.</div>'
    },
    {
      id: 'primeiros-passos',
      title: _t('help.firstSteps'),
      icon: '🚀',
      content: '<p><b>Bem-vindo ao scoreplace.app!</b> O app cobre 5 pilares complementares:</p>' +
        '<div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);border-radius:10px;padding:12px;margin-bottom:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">Os 5 pilares</div>' +
          '<p>🏆 <b>Torneios</b> — Crie, organize, participe. Eliminatórias, Dupla Elim., Grupos + Elim., Liga, Rei/Rainha. Check-in, sorteio, resultados ao vivo.</p>' +
          '<p>⚡ <b>Partida Casual</b> — Partidas avulsas sem criar torneio. Placar ao vivo em tela cheia, sincronizado entre jogadores via código de sala/QR. Estatísticas detalhadas no perfil.</p>' +
          '<p>📍 <b>Presença</b> — "Status online" pra quadras e clubes. Check-in imediato ou ida planejada; amigos veem no dashboard e podem se juntar.</p>' +
          '<p>🏢 <b>Locais</b> — Descubra clubes e arenas na sua cidade ou em viagens. Mapa com pins, filtros, reviews, integração com torneios e presença. <i>(Presença + Locais ficam unificados na tela "📍 Place".)</i></p>' +
          '<p>📊 <b>Stats/Perfil</b> — Estatísticas detalhadas: vitórias, derrotas, sets, games, pontos, tiebreaks. Confrontos diretos (H2H), top adversários, top parceiros. Sobrevive à exclusão de torneio/partida casual.</p>' +
          '<p style="font-size:0.78rem;color:var(--text-muted);margin-top:6px;">Os 5 pilares se conectam: criar torneio num local visto em Place prefilla o venue; ver presenças lista torneios agendados no mesmo lugar; stats acumulam de qualquer fonte (casual ou torneio).</p>' +
        '</div>' +
        '<div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);border-radius:10px;padding:12px;margin-bottom:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">Passo 1: Fazer Login</div>' +
          '<p>Clique no botão <b>"Entrar"</b> no canto superior direito da tela.</p>' +
          '<p style="font-weight:600;color:#34d399;margin-top:8px;">Forma mais rápida: Google</p>' +
          '<ol style="padding-left:20px;margin:6px 0;">' +
            '<li>Clique no botão <b>"Entrar com Google"</b> (botão branco grande no topo)</li>' +
            '<li>Uma janela do Google vai abrir. <b>Escolha sua conta</b> Google (ou digite seu e-mail Google)</li>' +
            '<li>O Google pode perguntar: <b>"Continuar para scoreplace.app?"</b> — clique em <b>"Continuar"</b></li>' +
            '<li>Se pedir permissões, clique em <b>"Permitir"</b> — usamos apenas para identificar você</li>' +
            '<li>Pronto! Você já está logado. Seu nome e foto aparecem no canto superior direito</li>' +
          '</ol>' +
          '<p style="font-size:0.75rem;color:var(--text-muted);margin-top:6px;">Outras opções: Link Mágico (recebe um link por e-mail, sem senha), SMS (código no celular), ou E-mail e Senha tradicional.</p>' +
        '</div>' +
        '<div style="background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.15);border-radius:10px;padding:12px;margin-bottom:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">Passo 2: Completar o Perfil</div>' +
          '<ol style="padding-left:20px;margin:6px 0;">' +
            '<li>Clique no seu <b>avatar</b> (foto ou iniciais) no canto superior direito</li>' +
            '<li>Preencha: <b>nome</b>, <b>gênero</b>, <b>cidade</b>, <b>esportes preferidos</b></li>' +
            '<li>Adicione seu <b>telefone</b> para receber notificações por WhatsApp</li>' +
            '<li>Marque seus <b>locais de preferência</b> no mapa para ser notificado de torneios próximos</li>' +
            '<li>Clique em <b>"Salvar"</b></li>' +
          '</ol>' +
        '</div>' +
        '<div style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.15);border-radius:10px;padding:12px;margin-bottom:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">Passo 3: Criar ou Participar de um Torneio</div>' +
          '<ol style="padding-left:20px;margin:6px 0;">' +
            '<li><b>Criar:</b> Na dashboard, clique em <b>"+ Novo Torneio"</b>, escolha o esporte e clique em "Criar Torneio"</li>' +
            '<li><b>Participar:</b> Na dashboard o <b>feed de descoberta</b> já lista torneios públicos abertos — clique em <b>"Inscrever-se"</b> direto do card. Para encontrar jogadores e ver os torneios deles, use o botão <b>👥 Pessoas</b> na dashboard</li>' +
            '<li><b>Convite:</b> Se recebeu um link de convite, clique nele, faça login e você será inscrito automaticamente</li>' +
          '</ol>' +
        '</div>' +
        '<div style="background:rgba(168,85,247,0.06);border:1px solid rgba(168,85,247,0.15);border-radius:10px;padding:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">Passo 4: Convidar Amigos</div>' +
          '<ol style="padding-left:20px;margin:6px 0;">' +
            '<li>Dentro de um torneio, clique em <b>"Convidar"</b></li>' +
            '<li>Compartilhe via <b>WhatsApp</b>, <b>e-mail</b>, <b>QR Code</b> ou <b>link direto</b></li>' +
            '<li>Quem clicar no link e fizer login será inscrito automaticamente</li>' +
          '</ol>' +
        '</div>'
    },
    {
      id: 'dashboard',
      title: _t('help.dashboard'),
      icon: '📊',
      content: '<p>A <b>Dashboard</b> é sua página principal — concentra torneios, próximas partidas, amigos no local e atalhos para as 4 áreas principais do app.</p>' +
        '<div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);border-radius:10px;padding:12px;margin-bottom:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">Hero e Ações Rápidas</div>' +
          '<p><b>Welcome para usuário novo</b> — Sem nenhum torneio criado ou disponível, você vê um card de boas-vindas com 4 CTAs coloridos: 🏆 Criar torneio, 🏢 Descobrir locais, 📍 Registrar presença, 👥 Encontrar amigos. Some assim que existir qualquer torneio visível pra você.</p>' +
          '<p><b>Barra de ações (linha 1)</b> — ⚡ <b>Partida Casual</b> (placar ao vivo sem criar torneio), 🏆 <b>Novo Torneio</b>, 📍 <b>Place</b> (descobre locais, faz check-in, planeja ida). <b>Linha 2:</b> 👥 <b>Pessoas</b> (explorar jogadores, amigos, torneios da comunidade), <b>Convidar</b> (QR Code do app), <b>Pro</b>, <b>Apoie</b>.</p>' +
          '<p><b>Contadores de resumo</b> — Todos, Organizados, Participando, <b>Inscrições Abertas</b>, Favoritos, Encerrados. Clique para filtrar.</p>' +
          '<p><b>"Inscrições Abertas"</b> — União dos <i>seus</i> torneios com inscrição aberta + torneios públicos do feed de descoberta que você ainda não entrou. Clicar "Inscrever-se" num card de descoberta aqui mesmo inscreve em 1 clique (sem precisar abrir a página do torneio).</p>' +
          '<p><b>Filtros secundários</b> — Pills coloridas por modalidade (roxo), local (verde), formato (amarelo). "✕ Limpar filtros" reseta.</p>' +
          '<p><b>Visualização</b> — Toggle Cards/Lista. Cards = visual completo; Lista = uma linha por torneio (compacto, bom pra muitos torneios).</p>' +
        '</div>' +
        '<div style="background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.15);border-radius:10px;padding:12px;margin-bottom:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">Widgets inline</div>' +
          '<p><b>Próximas partidas</b> — Widget no topo lista suas partidas pendentes (sem resultado ainda) em torneios ativos. Clique pra ir direto pra página de resultado.</p>' +
          '<p><b>Amigos no local</b> — Até 6 amigos com check-in ativo ou presença planejada hoje. Avatar com borda dourada, horário relativo ("🟢 agora · há X min" ou "🗓️ HH:mm"). Clicar prefilla a view de Presença com o mesmo venue/modalidade. Tem empty states: zero amigos mostra CTA pra #explore; zero presenças mostra linha discreta com link pra Minha presença.</p>' +
          '<p><b>Sua presença ativa</b> — Pill no topo da dashboard quando você tem check-in, plan ativo OU partida casual em andamento. <b>Check-in</b> mostra "📍 Você está em [Local] · expira em Xh" com dot verde. <b>Plan</b> mostra "🗓️ Planejado: [Local] hoje às HH:mm". <b>Partida casual</b> mostra "⚡ Partida casual em andamento · Sala ABC123" com botão "⚡ Voltar" que leva direto pro live scoring. Botões "Ver local" (abre modal do venue) e "Cancelar" (remove a presença) nas entradas de presença. Silent quando não há nenhum dos 3.</p>' +
          '<p><b>Complete seu perfil (banner âmbar)</b> — Aparece quando você já tem torneios mas faltam <i>cidade, modalidades preferidas ou locais preferidos</i> no perfil. Explica o que falta e os benefícios (torneios perto de você, parceiros da sua modalidade, presença rápida). "✕" descarta na sessão atual; reaparece no próximo login se os campos continuarem vazios.</p>' +
          '<p><b>🏟️ Meus locais</b> — Widget com até 5 locais onde você joga (preferências do perfil + venues dos seus torneios). Clique no nome abre a modal do venue. Botão "📍" verde à direita faz check-in direto: prefilla <code>#presence</code> e te leva pra lá com o local já selecionado. Link "Descobrir outros →" leva pra <code>#venues</code>. Só aparece quando existe pelo menos 1 venue relacionado.</p>' +
        '</div>' +
        '<div style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.15);border-radius:10px;padding:12px;margin-bottom:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">Cards de Torneio</div>' +
          '<p>Cada card mostra: nome, esporte, formato, inscritos, barra de progresso, countdown e status. Cor de fundo indica seu papel (organizador = índigo, participante = teal).</p>' +
          '<p><b>Coração ♥</b> — Favoritar/desfavoritar. Aparecem no filtro "Favoritos".</p>' +
          '<p><b>Foto do local</b> — Fundo do card quando o venue tem <code>venuePhotoUrl</code>.</p>' +
          '<p><b>Logo do torneio</b> — Miniatura 56×56. Gerada automaticamente ou upload manual em Editar Torneio.</p>' +
          '<p><b>Botão de inscrição inline</b> — ✅ Inscrever-se / 🛑 Desinscrever-se / ✓ INSCRITO (badge), conforme seu estado atual. Funciona inclusive com torneios do feed de descoberta (hidratação defensiva injeta o doc em <code>AppStore.tournaments</code> antes do enroll).</p>' +
        '</div>' +
        '<div style="background:rgba(139,92,246,0.06);border:1px solid rgba(139,92,246,0.15);border-radius:10px;padding:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">Paginação e Agrupamento</div>' +
          '<p>Torneios carregam em lotes de 12. Botão "Carregar mais" aparece quando há mais pra mostrar.</p>' +
          '<p>No filtro "Todos", torneios encerrados ficam em <code>&lt;details&gt;</code> colapsável no final, separados em "seus encerrados" (se participou/organizou) e "outros encerrados".</p>' +
          '<p>No filtro "Abertos" com discovery esgotado, botão "🔍 Descobrir mais" pede a próxima página do feed público via cursor.</p>' +
        '</div>'
    },
    {
      id: 'criar-torneio',
      title: _t('help.createTournament'),
      icon: '➕',
      content: '<p>Duas formas de criar um torneio:</p>' +
        '<div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);border-radius:10px;padding:12px;margin-bottom:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">Criação Rápida</div>' +
          '<p>Clique em "+ Novo Torneio" → escolha o esporte → "Criar Torneio". Pronto! Nome automático, formato Eliminatórias, inscrição individual.</p>' +
        '</div>' +
        '<div style="background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.15);border-radius:10px;padding:12px;margin-bottom:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">Formulário Completo</div>' +
          '<p>Na criação rápida, clique em "Detalhes Avançados" ou use "Editar" em um torneio existente.</p>' +
          '<p><b>Esporte</b> — Beach Tennis, Pickleball, Tênis, Tênis de Mesa, Padel, Vôlei de Praia, Futevôlei. Cada um tem padrões de pontuação próprios.</p>' +
          '<p><b>Formato</b> — Eliminatórias, Dupla Eliminatória, Grupos + Elim., Liga. Cada formato tem configurações específicas.</p>' +
          '<p><b>Modo de Sorteio</b> — Sorteio (aleatório) ou Rei/Rainha da Praia (grupos de 4 com parceiros rotativos).</p>' +
          '<p><b>Modo de Inscrição</b> — Individual, Apenas Times ou Misto (aceita ambos).</p>' +
          '<p><b>Tipo de Jogo</b> — Simples (1v1) ou Duplas (2v2). Ambos ligados = chaves paralelas.</p>' +
        '</div>' +
        '<div style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.15);border-radius:10px;padding:12px;margin-bottom:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">Campos do Formulário</div>' +
          '<p><b>Local</b> — Busca automática no Google Maps com foto e previsão do tempo.</p>' +
          '<p><b>Quadras</b> — Número de quadras (1-50) e nomes personalizados. Afeta a duração estimada.</p>' +
          '<p><b>Datas</b> — Início, fim e prazo de inscrição. Contagem regressiva automática nos cards.</p>' +
          '<p><b>Máximo de participantes</b> — Limite opcional. Pode auto-encerrar inscrições ao atingir.</p>' +
          '<p><b>Público/Privado</b> — Público aparece na aba Explorar. Endereço pode ser público ou restrito.</p>' +
          '<p><b>Categorias</b> — Gênero (Fem/Masc/Misto) × Habilidade (A/B/C). Gera chaveamentos separados.</p>' +
          '<p><b>Pontuação (GSM)</b> — Configure sets, games, tiebreaks e super tiebreak por esporte.</p>' +
          '<p><b>Logo</b> — Geração automática por Canvas ou upload. Cadeado trava contra auto-regeneração.</p>' +
          '<p><b>W.O.</b> — Individual (só o ausente perde) ou Time Inteiro (time eliminado).</p>' +
          '<p><b>Inscrições tardias</b> — Fechado, Lista de Espera ou Expansão (aceita e ajusta chave).</p>' +
          '<p><b>Desempate</b> — Arraste para reordenar critérios: confronto direto, saldo, Buchholz, etc.</p>' +
          '<p><b>Templates</b> — Salve configurações como template. Carregue em torneios futuros.</p>' +
        '</div>'
    },
    {
      id: 'formatos',
      title: _t('help.formats'),
      icon: '🎯',
      content: '<p>O scoreplace.app suporta <b>4 formatos</b> de torneio + modo de sorteio Rei/Rainha:</p>' +
        '<div style="background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.15);border-radius:10px;padding:12px;margin-bottom:10px;">' +
          '<p style="margin:0;"><b>🏆 Eliminatórias Simples</b> — Perdeu, está fora. Opcional: disputa de 3º lugar, repescagem (melhores perdedores da R1 disputam vagas extra). Quando inscritos não são potência de 2, painel inteligente sugere: BYE, Play-in, reabrir, Lista de Espera ou enquete entre participantes.</p>' +
        '</div>' +
        '<div style="background:rgba(168,85,247,0.06);border:1px solid rgba(168,85,247,0.15);border-radius:10px;padding:12px;margin-bottom:10px;">' +
          '<p style="margin:0;"><b>🔄 Dupla Eliminatória</b> — Precisa perder 2x para sair. Chave de vencedores (Winners) e perdedores (Losers). Grande final entre o campeão de cada chave.</p>' +
        '</div>' +
        '<div style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.15);border-radius:10px;padding:12px;margin-bottom:10px;">' +
          '<p style="margin:0;"><b>⚽ Fase de Grupos + Eliminatórias</b> — Estilo Copa do Mundo. Participantes divididos em grupos, todos jogam entre si. Os N melhores de cada grupo avançam para mata-mata. Configurável: número de grupos e classificados por grupo. Recomendação automática (ex: 21 inscritos → 1 grupo de 6 + 3 grupos de 5).</p>' +
        '</div>' +
        '<div style="background:rgba(236,72,153,0.06);border:1px solid rgba(236,72,153,0.15);border-radius:10px;padding:12px;margin-bottom:10px;">' +
          '<p style="margin:0;"><b>📊 Liga</b> — Temporada contínua com classificação por pontos. Duração configurável (3, 6, 12 meses ou custom). Inscrições sempre abertas (opcional). Sorteios automáticos (agendados) ou manuais. Cada jogador tem um toggle "Ativo" no seu card: desativado = folga com 0 pontos; quem fica de fora por número ímpar recebe a média dos seus pontos. Rodadas podem usar 3 modos:</p>' +
          '<ul style="margin:6px 0 0 16px;font-size:0.78rem;">' +
            '<li><b>Padrão (1v1)</b> — Pairing dinâmico por pontuação a cada rodada.</li>' +
            '<li><b>Rei/Rainha</b> — Grupos de 4 com parceiros rotativos (AB vs CD, AC vs BD, AD vs BC).</li>' +
            '<li><b>🔄 Todos contra todos</b> — O organizador define o número de turnos e o app gera o calendário completo antecipadamente (ex: 10 jogadores × 2 turnos = 90 partidas distribuídas em rodadas). Ideal para ligas com confrontos pré-agendados. Cada jogador enfrenta cada adversário uma vez por turno; anti-repetição por Monte Carlo (200 tentativas) evita que o mesmo par jogue em rodadas consecutivas.</li>' +
          '</ul>' +
        '</div>' +
        '<div style="background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.15);border-radius:10px;padding:12px;">' +
          '<p style="margin:0;"><b>👑 Rei/Rainha da Praia</b> — Modo de sorteio (não é formato): grupos de 4 jogadores com parceiros rotativos (AB vs CD, AC vs BD, AD vs BC) e pontuação individual, dentro de uma fase de Pontos Corridos. Quem vence os 3 jogos do grupo fica invicto e ganha a coroa. Para coroar por eliminatória, adicione uma fase eliminatória no construtor de fases — a transição é do motor de fases.</p>' +
        '</div>'
    },
    {
      id: 'inscricao',
      title: _t('help.enrollment'),
      icon: '✍️',
      content: '<p><b>Inscrever-se</b> — Abra o torneio e clique em "Inscrever-se". Em torneios com categorias, escolha sua categoria. Em torneios por times, preencha os nomes da equipe.</p>' +
        '<p><b>Por convite</b> — Clique no link recebido, faça login e será inscrito automaticamente (+ amizade com quem convidou).</p>' +
        '<p><b>Cancelar inscrição</b> — Botão "Cancelar Inscrição" na página do torneio. Confirmação obrigatória.</p>' +
        '<p><b>Encerramento automático</b> — Inscrições encerram ao atingir o limite ou na data/hora de prazo.</p>' +
        '<p><b>Inscrições tardias</b> — Dependendo da configuração: Fechado (bloqueado), Lista de Espera (suplente) ou Expansão (aceita e ajusta chave).</p>' +
        '<p><b>Lista de espera</b> — Suplentes podem substituir ausentes no check-in. Contagem separada no card.</p>' +
        '<p><b>Modos</b> — Individual (cada um por si), Times (duplas/equipes inscritas juntas) ou Misto (aceita ambos).</p>'
    },
    {
      id: 'sorteio',
      title: _t('help.draw'),
      icon: '🎲',
      content: '<div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);border-radius:10px;padding:12px;margin-bottom:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">Antes do Sorteio</div>' +
          '<p>O organizador encerra inscrições (manual ou automático) e clica em "Sortear".</p>' +
          '<p><b>Painel de resolução</b> — Se os inscritos não são potência de 2 (eliminatórias), painel inteligente com Nash sugere: BYE, Play-in, Repescagem, Suíço, Reabrir, Lista de Espera ou Enquete.</p>' +
          '<p><b>Times incompletos</b> — Se há sobra de jogadores que não formam time completo: Reabrir, Bots, Lista de Espera ou Ajuste Manual.</p>' +
          '<p><b>Cabeças de chave (VIP)</b> — Marque jogadores como VIP na lista de inscritos para prioridade no seeding.</p>' +
        '</div>' +
        '<div style="background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.15);border-radius:10px;padding:12px;margin-bottom:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">O Sorteio</div>' +
          '<p><b>Eliminatórias</b> — Confrontos aleatórios respeitando VIPs. BYEs distribuídos intercalados.</p>' +
          '<p><b>Grupos</b> — Painel mostra todas as distribuições possíveis (grupos iguais e mistos). Classificados por grupo configurável.</p>' +
          '<p><b>Liga</b> — Gera rodada por pontuação. Sorteios podem ser automáticos (agendados) ou manuais. Inscrições continuam abertas durante a temporada.</p>' +
          '<p><b>Rei/Rainha</b> — Grupos de 4 com rotação de parceiros (3 partidas por grupo).</p>' +
          '<p><b>Divulgação imediata</b> — Todos recebem notificação quando o sorteio é realizado.</p>' +
        '</div>' +
        '<div style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.15);border-radius:10px;padding:12px;margin-bottom:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">Enquete entre Participantes</div>' +
          '<p>Quando há impasse (potência de 2, times incompletos), crie uma enquete para os participantes votarem.</p>' +
          '<p>Prazo padrão: 48h. Contagem regressiva ao vivo. Recomendação por Nash (justiça 45%, inclusão 35%, praticidade 20%).</p>' +
          '<p>Antes de votar: apenas descrições. Após votar: resultado parcial e seu voto visíveis. Pode mudar o voto até encerrar.</p>' +
        '</div>'
    },
    {
      id: 'checkin',
      title: _t('help.checkin'),
      icon: '✅',
      content: '<p><b>Check-in</b> — Após iniciar o torneio, faça a chamada na aba "Inscritos". Toggle Presente/Ausente por participante.</p>' +
        '<p><b>Filtros</b> — Todos, Presentes, Ausentes, Pendentes. Facilita o controle no dia do evento.</p>' +
        '<p><b>Indicadores nas chaves</b> — Ponto verde (presente), vermelho (ausente), cinza (pendente). Partida verde quando ambos presentes.</p>' +
        '<p><b>W.O. (Walkover)</b> — Marque ausente → botão W.O. dá vitória automática ao adversário. Escopo configurável: Individual (só o ausente) ou Time Inteiro.</p>' +
        '<p><b>Substituição automática</b> — Marque W.O. e o próximo presente da lista de espera entra no lugar.</p>' +
        '<p><b>Limpar check-in</b> — Botão "Limpar" reseta todos os check-ins para recomeçar.</p>' +
        '<p><b>Ordenação</b> — Botões A-Z (alfabética) e 🕐 (cronológica) no cabeçalho da lista.</p>'
    },
    {
      id: 'resultados',
      title: _t('help.results'),
      icon: '📝',
      content: '<div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);border-radius:10px;padding:12px;margin-bottom:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">Lançando Resultados</div>' +
          '<p><b>Placar simples</b> — Digite o placar diretamente nos campos numéricos do card da partida e clique ✓ para confirmar.</p>' +
          '<p><b>Game-Set-Match (GSM)</b> — Para torneios com sets, clique em "Lançar Sets" para abrir o overlay dedicado. Insira o placar set a set; tiebreaks aparecem automaticamente quando necessário.</p>' +
          '<p><b>Editar resultado</b> — Clique no ✏️ para reabrir os campos e corrigir o placar.</p>' +
        '</div>' +
        '<div style="background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.15);border-radius:10px;padding:12px;margin-bottom:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">Progressão Automática</div>' +
          '<p><b>Eliminatórias</b> — Vencedor avança automaticamente. Ao completar todas as partidas, o torneio encerra e exibe o pódio.</p>' +
          '<p><b>Grupos</b> — Ao completar todos os jogos do grupo, os classificados avançam para eliminatória automaticamente.</p>' +
          '<p><b>Liga</b> — Classificação atualizada em tempo real. "Fechar Rodada" gera a próxima. Jogadores inativos (toggle desativado) ficam de folga com 0 pontos; quem fica de fora por número insuficiente de jogadores recebe a média dos seus pontos.</p>' +
          '<p><b>Rei/Rainha</b> — Standings individuais por grupo. Top jogadores avançam para eliminatória.</p>' +
        '</div>' +
        '<div style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.15);border-radius:10px;padding:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">Compartilhar e Exportar</div>' +
          '<p><b>Compartilhar resultado</b> — Botão de compartilhar em cada partida concluída (WhatsApp, clipboard).</p>' +
          '<p><b>Exportar CSV</b> — Baixe todos os resultados em planilha para Excel/Google Sheets.</p>' +
          '<p><b>Imprimir</b> — Imprima o chaveamento completo (orientação paisagem automática).</p>' +
          '<p><b>📅 Adicionar à agenda</b> — Na página do torneio, botão abre picker com 3 opções: <b>Google Calendar</b> (abre em nova aba com o evento pré-preenchido), <b>Outlook.com</b> (equivalente pra Microsoft), <b>Apple/Outlook (.ics)</b> (download de arquivo .ics que o Apple Calendar, Outlook desktop e Thunderbird importam). Preenche título, data, duração (assume 4h se endDate ausente), local (venue + endereço) e link do torneio. Só aparece se <code>startDate</code> está definido.</p>' +
          '<p><b>🏢 Local (botão)</b> — Na linha do endereço (ao lado do 🗺️ Google Maps), botão azul ciano leva pra modal do venue no scoreplace: movimento ao vivo (check-ins + torneios hoje), contatos (📞 💬 📷 ✉️), avaliações. Atalho "torneio → local" num tap — útil quando usuário quer ver quem mais está jogando ali ou entrar em contato com o clube.</p>' +
        '</div>'
    },
    {
      id: 'convidar',
      title: _t('help.invite'),
      icon: '👥',
      content: '<p>Clique em "Convidar" dentro do torneio para abrir o painel com 5 canais:</p>' +
        '<p><b>👥 Amigos na plataforma</b> — Envie convites para todos os seus amigos com um clique. Eles recebem notificação direta.</p>' +
        '<p><b>📱 QR Code</b> — Código exclusivo para projetar no evento. Escaneie com a câmera e se inscreva na hora.</p>' +
        '<p><b>💬 WhatsApp</b> — Link formatado aberto direto no WhatsApp. Ideal para grupos.</p>' +
        '<p><b>📧 E-mail</b> — Envie convite por e-mail digitando o endereço do destinatário.</p>' +
        '<p><b>🔗 Copiar link</b> — Copie o link para colar em Instagram, Telegram, SMS ou qualquer rede.</p>' +
        '<p><b>Auto-inscrição</b> — Quem clicar no link e fizer login é inscrito automaticamente + amizade com quem convidou.</p>' +
        '<p><b>Sem login</b> — Visitantes podem ver o torneio sem login. Ao clicar em "Inscrever-se", o login é solicitado.</p>'
    },
    {
      id: 'perfil',
      title: _t('help.profile'),
      icon: '👤',
      content: '<p><b>Acessar</b> — Clique no seu avatar (foto ou iniciais) no canto superior direito.</p>' +
        '<div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);border-radius:10px;padding:12px;margin-bottom:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">Informações Pessoais</div>' +
          '<p><b>Nome de exibição</b> — Exibido em torneios, chaveamentos e classificações. <b>Deve ser único na plataforma:</b> ao salvar, o app verifica se outro usuário já usa o mesmo nome (sem diferença de maiúsculas/minúsculas). Se houver conflito com uma conta que compartilha seu telefone ou e-mail, o fluxo de mesclagem de contas é acionado automaticamente. Caso contrário, um alerta pede que você escolha outro nome.</p>' +
          '<p><b>Gênero</b> — Usado para atribuição automática de categorias (Fem/Masc).</p>' +
          '<p><b>Data de nascimento</b> — Usada para atribuição automática de categorias por faixa etária (40+, 50+, 60+, 70+) nos torneios. Não é exibida publicamente para outros jogadores.</p>' +
          '<p><b>Cidade e localização</b> — Busca automática no mapa. Botão 📍 usa GPS.</p>' +
          '<p><b>Esportes preferidos</b> — <b>Pills toggleáveis</b> com 9 modalidades (Beach Tennis, Pickleball, Tênis, Tênis de Mesa, Padel, Squash, Badminton, Vôlei de Praia, Futevôlei). Marcar seu(s) esporte(s) tem efeito em várias partes do app:<br>' +
            '&nbsp;&nbsp;• <b>Feed de torneios</b> — a dashboard só exibe torneios do(s) esporte(s) marcado(s). Sem esporte marcado, mostra tudo.<br>' +
            '&nbsp;&nbsp;• <b>📍 Place (locais)</b> — filtro de modalidade pré-aplicado; só aparecem venues que oferecem o esporte.<br>' +
            '&nbsp;&nbsp;• <b>Check-in e Planejar ida</b> — as pills de modalidade já vêm pré-selecionadas com o(s) seu(s) esporte(s); não precisa escolher toda vez.<br>' +
            '&nbsp;&nbsp;• <b>Nível por esporte (skillBySport)</b> — ao marcar uma modalidade, aparecem 5 mini-pills de habilidade (A / B / C / D / FUN) específicas para ela. Você pode ser nível A em Beach Tennis e C em Tênis ao mesmo tempo; o app usa o nível correto ao inscrevê-lo em torneios com categorias.<br>' +
            '&nbsp;&nbsp;• <b>👥 Pessoas</b> — matching com jogadores que praticam os mesmos esportes; aparece como subtítulo nos cards.<br>' +
            '&nbsp;&nbsp;• <b>Sugestões de torneios e parceiros</b> — base para notificações de torneios próximos da sua modalidade.</p>' +
          '<p><b>Locais de preferência</b> — Busca <b>dinâmica</b> conforme você digita (2+ caracteres, debounce de 150ms). Dropdown de sugestões do Google Places aparece automaticamente. Botão 📍 ao lado usa GPS. Adicione múltiplos locais no mapa — eles aparecem no widget "🏟️ Meus locais" da dashboard pra check-in rápido.</p>' +
          '<p><b>Categoria/nível</b> — Seu nível de jogo (A, B, C, etc.).</p>' +
          '<p><b>Telefone</b> — Com código do país para notificações por WhatsApp. <b>Mesclagem automática de contas:</b> ao salvar seu telefone ou e-mail, o app verifica se já existe outra conta com o mesmo valor — se existir, as duas contas são mescladas automaticamente: histórico de partidas transferido, torneios atualizados, conta duplicada desativada. Isso resolve situações comuns como "criei conta pelo Google e outra pelo celular".</p>' +
          '<p><b>Avatar</b> — Círculo com as iniciais do seu nome (índigo). Se você fez login com Google e tem foto de perfil, ela é usada automaticamente no lugar das iniciais.</p>' +
        '</div>' +
        '<div style="background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.15);border-radius:10px;padding:12px;margin-bottom:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">Configurações</div>' +
          '<p><b>Idioma</b> — 🇧🇷 Português ou 🇺🇸 English. Bandeiras clicáveis com destaque visual.</p>' +
          '<p><b>Tema</b> — Noturno (escuro), Claro, Pôr do Sol, Oceano. 4 opções visuais.</p>' +
          '<p><b>Notificações</b> — Todas (padrão), Só Importantes ou Só Fundamentais. Canais: Plataforma, E-mail, WhatsApp.</p>' +
          '<p><b>Dicas visuais</b> — Ative/desative as dicas que aparecem quando você fica parado.</p>' +
          '<p><b>Arbitrar</b> — Toggle por modalidade na seção de esportes preferidos. Quando ativado em uma modalidade, seu nome aparece na lista de "🧑‍⚖️ Árbitros disponíveis" para organizadores de torneios daquela modalidade próximos à sua localização. O organizador convida via página <b>Árbitros</b> nas ferramentas do torneio.</p>' +
        '</div>' +
        '<div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);border-radius:10px;padding:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">Estatísticas e Conta</div>' +
          '<p><b>Meu Desempenho</b> — Torneios, partidas, vitórias, derrotas, aproveitamento e títulos.</p>' +
          '<p><b>Histórico</b> — Últimos 8 torneios com posição final e link direto.</p>' +
          '<p><b>Excluir conta</b> — Exclusão permanente com dupla confirmação (digitar "EXCLUIR"). Remove todos os dados.</p>' +
        '</div>'
    },
    {
      id: 'notificacoes',
      title: _t('help.notifications'),
      icon: '🔔',
      content: '<p>O scoreplace.app notifica sobre tudo que acontece nos seus torneios:</p>' +
        '<p><b>Inscrição</b> — Confirmação ao se inscrever. Organizador também é notificado.</p>' +
        '<p><b>Alterações</b> — Data, local, formato ou configurações mudaram? Você sabe.</p>' +
        '<p><b>Sorteio e resultados</b> — Notificação quando rodada é sorteada e quando resultado é lançado.</p>' +
        '<p><b>Comunicados</b> — Mensagens do organizador com nível: Fundamental, Importante ou Geral.</p>' +
        '<p><b>Lembretes</b> — Automáticos: 7 dias, 2 dias e no dia do torneio.</p>' +
        '<p><b>Torneios próximos</b> — Baseado na sua localização (perfil). Avisado quando abrem inscrições perto.</p>' +
        '<p><b>Amizade e co-organização</b> — Pedidos de amizade e convites para co-organizar aparecem nas notificações. Aceite ou recuse diretamente.</p>' +
        '<p><b>Presença de amigos (🗓️ plan / 📡 check-in)</b> — Dois tipos de aviso quando um amigo se mexe num local. <b>Planejando (🗓️):</b> "Fulano vai jogar X em Y às HH:mm. Quer ir junto?" — botão "🏢 Ver local". <b>Check-in imediato (📡, vermelho):</b> "Fulano chegou em Y pra jogar X agora. Vem junto!" — botão "📡 Vou também". Check-in tem throttle: 1 notificação por venue+modalidade+dia pra evitar spam quando o usuário faz/refaz check-in várias vezes.</p>' +
        '<p><b>Níveis</b> — <span style="color:#ef4444;">Fundamentais</span> (inscrição, dia do torneio), <span style="color:#f59e0b;">Importantes</span> (alterações, 2 dias antes), <span style="color:#60a5fa;">Gerais</span> (7 dias antes, comunicados, proximidade, presença de amigos).</p>' +
        '<p><b>Push</b> — Notificações push no navegador (requer permissão). Funcionam mesmo com o app fechado.</p>' +
        '<p><b>Ações inline</b> — Convites (amizade, co-host, transferência de host) permitem aceitar/recusar direto da notificação. Avisos com <code>tournamentId</code> têm botão "Ver torneio" / "Ver chaveamento". <code>presence_plan</code> e <code>presence_checkin</code> levam pro venue. <code>casual_invite</code> (⚡) leva direto pra sala da partida casual.</p>'
    },
    {
      id: 'explorar',
      title: _t('help.explore'),
      icon: '👥',
      content: '<p><b>Botão 👥 Pessoas</b> (segunda linha da dashboard) — Encontre jogadores, expanda sua rede e descubra torneios da comunidade. Acessível também via busca rápida (Ctrl+K) ou rota <code>#explore</code>.</p>' +
        '<p><b>Pedidos pendentes</b> — No topo, aceite ou recuse pedidos de amizade recebidos.</p>' +
        '<p><b>Seus amigos</b> — Cards horizontais com avatar, cidade (quando diferente da sua) e modalidades preferidas. Remova amigos pelo ✕ no card.</p>' +
        '<p><b>Conhecidos</b> — Jogadores de torneios que você participou mas que ainda não são amigos. Envie convite de amizade com 1 toque.</p>' +
        '<p><b>Outros usuários</b> — Grid 2–4 colunas com todos os usuários cadastrados. Nomes abreviados no primeiro token. Envie pedido de amizade diretamente.</p>' +
        '<p><b>Busca</b> — Encontre jogadores por nome, cidade ou esporte. Envie convites diretamente.</p>' +
        '<p><b>Cancelar pedido</b> — Cancele um pedido de amizade enviado que ainda está pendente.</p>' +
        '<p><b>Perfil rico do jogador</b> — Toque em qualquer card de usuário para abrir o perfil completo: aniversário, confrontos diretos (H2H), parcerias em duplas (quantas vezes jogaram juntos e aproveitamento), torneios em comum com comparação de desempenho por barras coloridas. Badges 🏆 (torneios) e ⚡ (casuais) identificam o tipo de partida nos confrontos.</p>'
    },
    {
      id: 'organizador',
      title: _t('help.organizers'),
      icon: '🛠️',
      content: '<p>Você é organizador automaticamente nos torneios que cria. Ferramentas de admin (Editar, Comunicar, +Participante, etc.) aparecem dentro do card do torneio quando você tem permissão.</p>' +
        '<div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);border-radius:10px;padding:12px;margin-bottom:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">Ferramentas do Organizador</div>' +
          '<p><b>Editar</b> — Reabra o formulário completo para alterar qualquer configuração.</p>' +
          '<p><b>Comunicar</b> — Envie mensagens para todos os inscritos com nível de importância (Fundamental/Importante/Geral).</p>' +
          '<p><b>+ Participante / + Time</b> — Adicione inscritos manualmente.</p>' +
          '<p><b>Add Bot</b> — Preencha vagas com jogadores fictícios para testes.</p>' +
          '<p><b>Categorias</b> — Gerencie categorias: mova, mescle, atribua participantes.</p>' +
          '<p><b>Exportar CSV</b> — Baixe resultados em planilha.</p>' +
          '<p><b>Salvar Template</b> — Salve configurações para reusar em futuros torneios.</p>' +
          '<p><b>QR Code</b> — Gere QR para projetar no evento.</p>' +
          '<p><b>Modo TV</b> — Projete placar ao vivo em telão (fullscreen, auto-refresh 30s).</p>' +
          '<p><b>Apagar Torneio</b> — Remove permanentemente o torneio e todos os dados. Disponível apenas para o criador original (co-organizadores não têm acesso). Requer confirmação dupla — a operação não tem desfazer.</p>' +
        '</div>' +
        '<div style="background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.15);border-radius:10px;padding:12px;margin-bottom:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">Fluxo do Organizador</div>' +
          '<ol style="padding-left:20px;margin:6px 0;">' +
            '<li>Crie o torneio (rápido ou detalhado)</li>' +
            '<li>Convide participantes</li>' +
            '<li>Gerencie categorias (se aplicável)</li>' +
            '<li>Encerre inscrições (manual ou automático)</li>' +
            '<li>Sorteie o chaveamento</li>' +
            '<li>Inicie o torneio + check-in</li>' +
            '<li>Lance resultados ou aguarde os jogadores</li>' +
            '<li>Feche rodadas (Liga) ou aguarde encerramento automático</li>' +
            '<li>Encerre e veja o pódio!</li>' +
          '</ol>' +
        '</div>' +
        '<div style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.15);border-radius:10px;padding:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">Co-organização</div>' +
          '<p><b>Compartilhar organização</b> — Convide um participante para ser co-organizador (botão 👑 Organização).</p>' +
          '<p><b>Transferir</b> — Transfira a organização completa para outro participante.</p>' +
          '<p>Co-organizadores têm acesso a todas as ferramentas exceto excluir o torneio.</p>' +
        '</div>'
    },
    {
      id: 'categorias',
      title: _t('help.categories'),
      icon: '🏷️',
      content: '<p>O organizador pode definir categorias para qualquer formato de torneio, permitindo que participantes de diferentes perfis disputem separadamente:</p>' +
        '<p><b>Categorias de gênero</b> — Botões de alternância: Feminino (♀), Masculino (♂), Misto Aleatório (⚥) e Misto Obrigatório (⚤). Não são excludentes — o organizador pode ativar quantos quiser.</p>' +
        '<p><b>Categorias de habilidade</b> — Campo de texto livre onde o organizador digita as categorias separadas por vírgula (ex: A, B, C, D).</p>' +
        '<p><b>Categorias combinadas</b> — O sistema combina automaticamente gênero × habilidade. Exemplo: ativando Fem + Masc e digitando A, B gera: Fem A, Fem B, Masc A, Masc B.</p>' +
        '<p><b>Inscrição com categoria</b> — Ao se inscrever em um torneio com categorias, o participante escolhe a categoria desejada. Se o perfil já tiver gênero preenchido, as opções são filtradas automaticamente.</p>' +
        '<p><b>Sorteio e chaves por categoria</b> — O sorteio gera confrontos separados por categoria. Participantes só enfrentam adversários da mesma categoria.</p>' +
        '<p><b>Classificação por categoria</b> — A tabela de classificação mostra resultados separados por categoria no formato Liga.</p>' +
        '<p><b>Misto Obrigatório</b> — Times devem ter 50% homens e 50% mulheres.</p>' +
        '<p><b>Misto Aleatório</b> — Aceita homens e mulheres sem restrição de proporção. A composição é definida pelo sorteio.</p>' +
        '<p><b>Gerenciar categorias</b> — O botão "Categorias" permite ao organizador: ver quantos inscritos há em cada categoria (agrupados por gênero), mesclar categorias por arrastar e soltar (ex: Fem A + Fem B → Fem A/B), e atribuir categoria a participantes sem categoria. Clique em uma categoria para ver os inscritos. Categorias mescladas exibem um ícone de desmesclagem no canto superior direito, permitindo desfazer a mesclagem e reatribuir participantes às categorias originais.</p>' +
        '<p><b>Remover participante da categoria</b> — Na visualização detalhada de uma categoria, cada card de participante tem um botão para removê-lo daquela categoria. O participante fica "sem categoria" e pode ser reatribuído a qualquer outra.</p>' +
        '<p><b>Atribuição automática</b> — Quando o organizador cria categorias em um torneio que já tem inscritos, os participantes com gênero no perfil são atribuídos automaticamente. O badge "(perfil)" indica que a categoria veio do perfil do participante.</p>' +
        '<p><b>Notificação de categoria</b> — Participantes atribuídos a uma categoria recebem uma notificação ao acessar o torneio, com opção de questionar o organizador por e-mail.</p>' +
        '<p><b>Histórico</b> — Participantes que se inscreveram sem categoria e depois foram alocados mostram o indicador "(sem cat.)" ao lado da categoria, mantendo o histórico de que a inscrição ocorreu antes das categorias.</p>'
    },
    {
      id: 'local',
      title: _t('help.venue'),
      icon: '📍',
      content: '<p><b>Busca automática</b> — Digite o nome do local e o Google Maps sugere endereços reais com foto e coordenadas.</p>' +
        '<p><b>Localização GPS</b> — Botão 📍 usa sua localização atual para preencher o campo.</p>' +
        '<p><b>Acesso</b> — Público (visível para todos), Sócios ou Convite.</p>' +
        '<p><b>Endereço público/privado</b> — Toggle controla se o endereço aparece na aba Explorar.</p>' +
        '<p><b>Quadras</b> — 1 a 50 quadras com nomes personalizados (ex: Quadra Central, Quadra 2).</p>' +
        '<p><b>Duração estimada</b> — Cálculo automático: duração da partida × número de partidas ÷ quadras + aquecimento + chamada.</p>' +
        '<p><b>Previsão do tempo</b> — Quando o local tem coordenadas e a data é nos próximos 5 dias, exibe previsão automática.</p>' +
        '<p><b>Foto do local</b> — Aparece como fundo nos cards do dashboard e na página de detalhes.</p>'
    },
    {
      id: 'chaveamento',
      title: _t('help.bracket'),
      icon: '🏅',
      content: '<div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);border-radius:10px;padding:12px;margin-bottom:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">Navegação no Chaveamento</div>' +
          '<p><b>Zoom</b> — Slider e botões +/- para ajustar o tamanho. Arraste para navegar.</p>' +
          '<p><b>Ocultar rodadas</b> — Clique para esconder rodadas concluídas e economizar espaço.</p>' +
          '<p><b>Navegação por grupos</b> — Botões coloridos (A, B, C...) para pular direto ao grupo desejado.</p>' +
          '<p><b>Só meus jogos</b> — Toggle filtra para mostrar apenas suas partidas.</p>' +
        '</div>' +
        '<div style="background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.15);border-radius:10px;padding:12px;margin-bottom:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">Classificação (Liga)</div>' +
          '<p><b>Tabela de standings</b> — Colunas: Posição, Nome, Pts, V, E, D, PF, PC, Saldo. GSM adiciona ±S e ±G.</p>' +
          '<p><b>Ordenação</b> — Clique nos cabeçalhos (▲/▼) para ordenar por qualquer coluna.</p>' +
          '<p><b>Clique no nome</b> — Abre estatísticas globais do jogador ou histórico de partidas no torneio.</p>' +
          '<p><b>Confrontos diretos</b> — Matriz NxN expansível abaixo da classificação (verde=vantagem, vermelho=desvantagem).</p>' +
          '<p><b>Rodadas anteriores</b> — Seção colapsável mostrando resultados de rodadas passadas.</p>' +
          '<p><b>Estatísticas do torneio</b> — Destaques automáticos: mais vitórias, maior sequência, total de partidas.</p>' +
        '</div>' +
        '<div style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.15);border-radius:10px;padding:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">Ferramentas</div>' +
          '<p><b>Modo TV</b> — Fullscreen para projetar em telão. Auto-refresh 30s. Sair com ESC.</p>' +
          '<p><b>Imprimir</b> — CSS otimizado para impressão (paisagem, bordas, fundo branco).</p>' +
          '<p><b>Exportar CSV</b> — Classificação ou resultados em planilha.</p>' +
          '<p><b>Compartilhar resultado</b> — Cada partida tem botão de compartilhar (WhatsApp/clipboard).</p>' +
          '<p><b>Pódio</b> — Torneios encerrados exibem podio visual com medalhas (🥇🥈🥉).</p>' +
        '</div>'
    },
    {
      id: 'partida-casual',
      title: 'Partida Casual',
      icon: '📡',
      content: '<p>Jogue partidas avulsas com placar ao vivo em tela cheia — sem precisar criar um torneio.</p>' +
        '<div style="background:rgba(56,189,248,0.06);border:1px solid rgba(56,189,248,0.15);border-radius:10px;padding:12px;margin-bottom:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">Como funciona</div>' +
          '<p><b>1. Abrir</b> — Botão "📡 Partida Casual" na dashboard ou menu.</p>' +
          '<p><b>2. Configurar</b> — Escolha esporte, single/dupla, pontuação (sets, games, tie-break). Configurações salvas por esporte.</p>' +
          '<p><b>3. Convidar</b> — QR Code ou código da sala (6 caracteres). Jogadores logados entram automaticamente no lobby.</p>' +
          '<p><b>4. Montar times</b> — "Sortear" ON = duplas aleatórias ao iniciar. OFF = arraste jogadores para Time 1 / Time 2.</p>' +
          '<p><b>5. Jogar</b> — Placar ao vivo em tela cheia. Todos os participantes veem e podem marcar pontos em tempo real.</p>' +
        '</div>' +
        '<div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);border-radius:10px;padding:12px;margin-bottom:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">Placar ao Vivo</div>' +
          '<p><b>Pontuação</b> — Toque ▲ para marcar ponto, ▼ para corrigir. Placares grandes para fácil visualização.</p>' +
          '<p><b>AD (vantagem no game)</b> — Toggle logo abaixo da contagem (15-30-40 / 1-2-3). Ligado: em 40-40 (deuce) exige 2 pontos de vantagem para fechar o game. Desligado: ponto de ouro (quem fizer o próximo ponto vence). Padrão por modalidade — Tênis e Padel ligado, Beach Tennis / Pickleball / Tênis de Mesa desligado.</p>' +
          '<p><b>Vantagem de 2 pontos (set)</b> — <b>Ativada por padrão em todas as modalidades.</b> Ligada: o set não termina em 5-6 — ao empatar em (g-1)-(g-1) ou a cada novo empate que impossibilite a vantagem de 2 games, o app pergunta "Prorrogar ou Tie-break". Desligada: o set acaba no primeiro a chegar em g games, sem extensão e sem tie-break.</p>' +
          '<p><b>Sets/Games</b> — Automático: ao completar games, avança set. Empate (ex: 5×5) oferece Prorrogar ou Tie-break (quando "Vantagem de 2 pontos" ligada).</p>' +
          '<p><b>Prorrogação</b> — Continua até vantagem de 2 games. Botão "⚡ Tie-break" ganha destaque com <b>glow pulsante</b> durante a prorrogação para facilitar a mudança a qualquer momento.</p>' +
          '<p><b>Tie-break</b> — Vence quem fizer 7 pontos primeiro com 2 de vantagem; se empatar em 7 continua até alguém abrir 2.</p>' +
          '<p><b>Ordem de saque</b> — Arraste a bolinha 🎾 para trocar o sacador. Após o 1º game o time que começou trava; após o 2º game a ordem inteira trava com um cadeado 🔒.</p>' +
          '<p><b>Decisões restritas aos jogadores</b> — Escolha de prorrogar vs tie-break e botão de tie-break só aparecem para usuários cadastrados envolvidos na partida. Não-jogadores veem "Aguardando decisão".</p>' +
          '<p><b>Nomes editáveis</b> — Toque no nome para alterar. Fotos de perfil exibidas para jogadores logados.</p>' +
        '</div>' +
        '<div style="background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.20);border-radius:10px;padding:12px;margin-bottom:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">Tela de Resultado</div>' +
          '<p><b>Layout</b> — Vencedor no topo com troféu, placar e nomes clicáveis. Logo abaixo vem o gráfico Momentum (animação visível de imediato). Depois a seção Comparação dos Times e os stats do perdedor.</p>' +
          '<p><b>Gráfico Momentum</b> — Duas linhas cumulativas animadas: azul para o Time 1, vermelha para o Time 2. Linhas desenham da esquerda para a direita em ~3s com marcadores de ponto final e divisores de set (S1, S2...). Botão ↻ Replay reexecuta a animação.</p>' +
          '<p><b>Comparação dos Times</b> — Barras lado a lado: Sets, Games, Pontos, % Pontos no Saque, % Pontos na Recepção, Games Mantidos, Quebras de Saque, Killer Points (40-40), Maior Sequência e Maior Vantagem.</p>' +
          '<p><b>Cards de jogador clicáveis</b> — Toque em qualquer jogador para ver suas estatísticas individuais: games servidos/mantidos, aproveitamento, maior sequência, e também pts servidos/ganhos/% no saque.</p>' +
          '<p><b>Jogar Novamente + 📤 Compartilhar + Re-sortear duplas</b> — Botões fixos no rodapé da tela de resultado (não somem ao rolar). <b>Jogar Novamente</b> recomeça a partida com placar zerado — todos os jogadores conectados são levados automaticamente de volta ao lobby com os mesmos nomes/slots (sem precisar compartilhar o código novamente). <b>📤 Compartilhar</b> dispara Web Share API (WhatsApp, Instagram DM, SMS) com placar set-a-set, vencedor e link do app; clipboard como fallback em desktop. Toggle <b>Re-sortear</b> (só em duplas) redistribui os jogadores aleatoriamente entre os times antes de reiniciar.</p>' +
          '<p><b>Botões não cortam</b> — O rodapé usa 100dvh + safe-area-inset para não ficar escondido pelo URL bar do navegador ou pelo home-indicator.</p>' +
        '</div>' +
        '<div style="background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.15);border-radius:10px;padding:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">Lobby e Compartilhamento</div>' +
          '<p><b>Código da sala</b> — 6 caracteres. Digite na dashboard ("📷 Escanear QR") ou acesse #casual/CODIGO.</p>' +
          '<p><b>👥 Avisar amigos do scoreplace</b> — Botão no modal de convite (abaixo de Copiar link e WhatsApp) dispara notificação direta pra todos os amigos da scoreplace com link pra entrar na partida. Eles recebem "Fulano começou uma partida casual de X" com botão "⚡ Entrar na partida". Mais direto que WhatsApp pra quem já tá no app.</p>' +
          '<p><b>Lobby em tempo real</b> — Organizador e participantes veem quem já entrou. Atualização automática a cada 3s.</p>' +
          '<p><b>Times visíveis no lobby</b> — Quando o organizador monta os times (arraste jogadores, edite nomes), as mudanças aparecem em tempo real no lobby dos outros usuários sob "⚔ Times formados".</p>' +
          '<p><b>Sair libera a vaga</b> — Clicar em Sair (ou Voltar ao Dashboard) remove seu uid do slot e te redireciona para o dashboard — outro jogador pode ocupar a vaga imediatamente.</p>' +
          '<p><b>Fechar partida</b> — O botão ✕ Fechar durante a partida pede confirmação; ao confirmar o abandono, sua vaga é liberada e você volta para o dashboard.</p>' +
          '<p><b>Resultado</b> — Ao finalizar, confirme o resultado. Estatísticas detalhadas salvas no seu perfil (persistentes).</p>' +
        '</div>' +
        '<div style="background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.20);border-radius:10px;padding:12px;margin-bottom:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">⚥ Gênero por Slot + Duplas Mistas</div>' +
          '<p>Cada jogador exibe um ícone de gênero no seu card durante a configuração: ♂ (azul), ♀ (rosa), ⚥ (roxo) ou ? (âmbar — não definido).</p>' +
          '<p><b>Origem do gênero</b> — Jogadores logados com gênero preenchido no perfil ficam com o ícone automático. Para convidados (sem conta) ou usuários sem gênero no perfil, o "?" fica com animação pulse para indicar que é clicável. Qualquer participante da sala pode tocar nele para definir o gênero daquele slot — a escolha é local à partida e não altera o perfil.</p>' +
          '<p><b>Toggle "Duplas Mistas"</b> — Aparece automaticamente abaixo de "Sortear Duplas" quando há exatamente 2M + 2F entre os 4 slots. Ao ativar, o sorteio garante 1M + 1F por dupla. Quando as duplas já estão formadas manualmente, o toggle reorganiza os times para satisfazer a regra mista.</p>' +
          '<p><b>Sincronização</b> — Os ícones de gênero são salvos no Firestore (<code>slotGenders</code>) e propagados para todos os dispositivos da sala em até 3s, garantindo que todos vejam a mesma configuração.</p>' +
        '</div>' +
        '<div style="background:rgba(168,85,247,0.06);border:1px solid rgba(168,85,247,0.20);border-radius:10px;padding:12px;margin-bottom:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">🔗 Amigos nos Slots (Autocomplete)</div>' +
          '<p>No setup da partida, ao digitar o nome de um jogador num slot editável, um dropdown de sugestões aparece automaticamente com amigos do scoreplace cujo nome bata com o digitado.</p>' +
          '<ul style="margin:4px 0 8px 18px;font-size:0.78rem;">' +
            '<li>Selecionar preenche o nome, avatar e gênero do perfil do amigo — sem digitar tudo manualmente.</li>' +
            '<li>O slot vinculado exibe a foto/iniciais do amigo com ✕ para desvincular a qualquer momento.</li>' +
            '<li>O vínculo é propagado para todos os dispositivos da sala em tempo real.</li>' +
            '<li>Ao encerrar a partida, o amigo recebe notificação de confirmação e pode aceitar ou recusar — se aceitar, as stats são salvas no perfil dele; se recusar, o vínculo é removido.</li>' +
          '</ul>' +
          '<p><b>No modo Técnico</b> — O autocomplete funciona normalmente em todos os slots. Slots vinculados mostram avatar com ✕; slots sem vínculo mostram o handle ⠿ para arrastar.</p>' +
        '</div>' +
        '<div style="background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.15);border-radius:10px;padding:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">🎽 Modo Técnico</div>' +
          '<p>Toggle "🎽 Técnico" na tela de configuração (visível apenas para usuários logados). Ative quando você não vai jogar — apenas gerenciar a partida de fora da quadra.</p>' +
          '<p><b>O que muda com o modo técnico ativo:</b></p>' +
          '<ul style="margin:4px 0 8px 18px;font-size:0.78rem;">' +
            '<li>Seu nome e avatar deixam de preencher automaticamente o slot do Jogador 1 — todos os slots começam em branco para o técnico preencher.</li>' +
            '<li>Botões de arrastar (⠿) aparecem em todos os cards de jogador para reorganizar times com facilidade.</li>' +
            '<li>O app não te identifica como participante da partida, então os resultados não são salvos no seu histórico pessoal.</li>' +
            '<li>Ao desativar o modo técnico, os vínculos de slots são limpos para evitar atribuição incorreta de UIDs.</li>' +
          '</ul>' +
          '<p><b>Quando usar</b> — Professor dando aula, pai acompanhando o filho, organizador gerenciando várias partidas ao mesmo tempo, ou qualquer pessoa que apenas quer marcar pontos sem participar.</p>' +
        '</div>'
    },
    {
      id: 'presenca',
      title: 'Presença no Local',
      icon: '📍',
      content: '<p>Registre quando você está num local esportivo pra que seus amigos saibam e possam se juntar. Funciona como "status online" para quadras e clubes.</p>' +
        '<div style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.18);border-radius:10px;padding:12px;margin-bottom:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">Como acessar</div>' +
          '<p><b>Hero do dashboard</b> — Botão "📍 Presença" abre a view completa. Na dashboard também há o widget "Amigos no local" mostrando até 6 amigos com avatar + horário.</p>' +
          '<p><b>Atalho</b> — Hash direto: <code>#presence</code>.</p>' +
          '<p><b>A partir de um local</b> — Abra o card de um venue em Descobrir Locais e use "📍 Estou aqui agora" ou "🗓️ Planejar ida" direto na modal — evita navegar até a view de Presença.</p>' +
        '</div>' +
        '<div style="background:rgba(56,189,248,0.06);border:1px solid rgba(56,189,248,0.18);border-radius:10px;padding:12px;margin-bottom:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">Dois tipos de presença</div>' +
          '<p><b>📍 Estou aqui agora</b> — Check-in imediato. Válido por 3h (janela padrão) a partir do momento da marcação. Aparece como "🟢 agora" pros amigos. <b>Amigos recebem notificação "📡 Fulano chegou em X pra jogar Y. Vem junto!"</b> (throttled: 1 por venue+modalidade+dia pra não spammar).</p>' +
          '<p><b>🗓️ Planejar ida</b> — Agendamento futuro. Escolha data/hora de início e (opcionalmente) de saída — deixe em branco se não quiser fixar horário de fim. Amigos recebem notificação "🗓️ Fulano vai jogar X em Y às HH:mm. Quer ir junto?". <b>Botão 📅 na linha</b> abre o picker de agenda (Google Calendar / Outlook / .ics) pra você não esquecer.</p>' +
        '</div>' +
        '<div style="background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.18);border-radius:10px;padding:12px;margin-bottom:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">Multi-modalidade</div>' +
          '<p>Um local pode oferecer várias modalidades (Beach Tennis + Tênis + Pickleball, por ex). Selecione todas com pills toggleáveis e o doc de presença fica com todas gravadas. Filtros respeitam a seleção e o "Movimento" consolida tudo num único lugar.</p>' +
          '<p><b>Check-in multi-sport</b> — Quando você está disponível pra jogar mais de uma modalidade, basta deixar todas selecionadas antes de clicar "Estou aqui". O doc guarda <code>sports[]</code> e fica queryable por qualquer uma delas.</p>' +
        '</div>' +
        '<div style="background:rgba(139,92,246,0.06);border:1px solid rgba(139,92,246,0.18);border-radius:10px;padding:12px;margin-bottom:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">Visibilidade e privacidade</div>' +
          '<p><b>Amigos (padrão)</b> — Só seus amigos veem sua presença. Aparece com avatar no mapa/ widget da dashboard.</p>' +
          '<p><b>Público</b> — Qualquer usuário logado vê (sem expor sua identidade — conta como "+1" anônimo no "👥 Agora no local").</p>' +
          '<p><b>Desligado</b> — Nada é escrito. Use quando quiser jogar sem sinalizar presença. Configurável em Perfil → Presença.</p>' +
          '<p><b>Silenciar temporariamente</b> — No perfil, escolha silenciar 1h/4h/dia/semana. Seu check-in fica desativado até o timer acabar; widgets ignoram presenças de amigos durante esse período também (simétrico).</p>' +
        '</div>' +
        '<div style="background:rgba(168,85,247,0.06);border:1px solid rgba(168,85,247,0.18);border-radius:10px;padding:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">Integração com torneios e partidas casuais</div>' +
          '<p><b>Torneios no local</b> — O gráfico de barras por hora inclui torneios agendados no mesmo venue/modalidade/dia como presenças virtuais ("🏆 Torneio X às 18h").</p>' +
          '<p><b>Modal do venue</b> — Em Descobrir Locais, a seção "Movimento no local" mostra avatares de amigos com check-in ativo + "+N" de outros usuários e torneios acontecendo hoje.</p>' +
        '</div>'
    },
    {
      id: 'locais',
      title: 'Descobrir Locais',
      icon: '🏢',
      content: '<p>Encontre clubes, arenas e quadras abertas ao público — útil pra viagens, descobrir sua cidade ou compartilhar o local onde você joga.</p>' +
        '<div style="background:rgba(14,165,233,0.06);border:1px solid rgba(14,165,233,0.20);border-radius:10px;padding:12px;margin-bottom:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">Como acessar</div>' +
          '<p>Botão "🏢 Locais" no hero do dashboard ou hash <code>#venues</code>. Público — funciona sem login (descoberta de onboarding).</p>' +
        '</div>' +
        '<div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.18);border-radius:10px;padding:12px;margin-bottom:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">Filtros e busca</div>' +
          '<p><b>Local</b> — Digite endereço, bairro ou cidade. O geocoder resolve em lat/lng e centraliza o mapa.</p>' +
          '<p><b>📍 GPS</b> — Botão ao lado do campo usa sua localização precisa (tem prioridade sobre o texto digitado).</p>' +
          '<p><b>Modalidade</b> — Filtra por Beach Tennis, Pickleball, Tênis, Tênis de Mesa, Padel. "Qualquer" traz todos.</p>' +
          '<p><b>Mín. quadras</b> — Default 1. Útil pra filtrar clubes com mais infraestrutura.</p>' +
          '<p><b>Distância (km)</b> — Raio a partir do centro. Default 10km. O raio vira círculo visual no mapa.</p>' +
          '<p><b>Faixa de preço</b> — $/$$/$$$ ou "Qualquer". Filtra cadastrados; sugestões do Google ignoram.</p>' +
          '<p>Filtros persistem entre sessões em <code>localStorage</code> — você volta e o filtro ainda tá do jeito que deixou.</p>' +
        '</div>' +
        '<div style="background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.18);border-radius:10px;padding:12px;margin-bottom:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">Mapa vs Lista</div>' +
          '<p>Toggle no topo. <b>Mapa</b> é o default — descoberta é intrinsecamente espacial.</p>' +
          '<p><b>Pins do mapa</b>: 🏢 <b>âmbar</b> = local cadastrado (free). 🏢 <b>índigo</b> = local cadastrado (Pro). 🔎 <b>cinza translúcido</b> = sugestão do Google (não cadastrado). 📍 <b>verde</b> = sua localização.</p>' +
          '<p><b>Clique num pin âmbar/índigo</b> abre a modal de detalhe do venue (com Movimento, Reviews, CTAs). <b>Clique num pin cinza</b> abre o local direto no Google Maps em nova aba (ainda não existe na base do scoreplace — o dono pode reivindicar depois).</p>' +
          '<p><b>Gesture cooperative</b> — No mobile, o mapa exige dois dedos pra mexer (scroll com um dedo passa pra página). No desktop, Ctrl+scroll pra zoom. Isso evita o bug antigo de "ficar preso no mapa" ao tentar scrollar a tela.</p>' +
          '<p><b>Barra de resumo acima do mapa</b> — Mostra "🏢 N cadastrados · 🔎 M sugestões Google" em tempo real. Se zero resultados no raio atual, oferece botão "🔍 Expandir para Xkm" (triplica o raio) em 1 clique pra sair do beco sem saída.</p>' +
        '</div>' +
        '<div style="background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.20);border-radius:10px;padding:12px;margin-bottom:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">Modal de detalhe do venue</div>' +
          '<p><b>Tags de proveniência</b>: "✅ Informações oficiais" quando reivindicado pelo proprietário; "📝 Cadastrado por [nome]" quando é cadastro colaborativo (qualquer usuário pode cadastrar um local que frequenta, estilo Wikipedia).</p>' +
          '<p><b>Contatos</b> — Botões 📞 Ligar, 💬 WhatsApp (auto-prefixo 55), 📷 Instagram, ✉️ E-mail quando disponíveis.</p>' +
          '<p><b>Movimento no local</b> — Amigos com check-in ativo (avatares com borda dourada), "+N outros" (presenças públicas/torneios em andamento), e eventos agendados "Mais tarde hoje" ordenados por horário.</p>' +
          '<p><b>Torneios neste local</b> — Próximos e recentes, linkados pra <code>#tournaments/&lt;id&gt;</code>. Usa o cache <code>AppStore.tournaments</code> (sem fetch extra).</p>' +
          '<p><b>Avaliações</b> — Estrelas 1–5 + texto opcional. Cada usuário logado deixa uma review (substitui se re-envia). Opção de anônimo quando só dá estrela sem texto. Média visível no header.</p>' +
          '<p><b>Ações</b>: <b>📍 Estou aqui agora</b> (check-in inline com toast — não navega), <b>🗓️ Planejar ida</b> (vai pra #presence com o dialog de agendamento auto-aberto), <b>🗺️ Ver no mapa</b> (Google Maps externo), <b>📍 Ver presenças</b> (view completa com gráfico por hora), <b>🏆 Criar torneio aqui</b> (abre criação rápida com o venue pré-preenchido), <b>📤 Compartilhar</b> (Web Share API nativa no mobile ou clipboard como fallback — link canônico <code>/#venues/&lt;placeId&gt;</code> que abre a mesma modal pra quem receber).</p>' +
        '</div>' +
        '<div style="background:rgba(139,92,246,0.06);border:1px solid rgba(139,92,246,0.18);border-radius:10px;padding:12px;margin-bottom:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">Cadastro em duas camadas (v0.15.36)</div>' +
          '<p><b>Camada 1 — Estabelecimento</b>: nome, endereço, horário, contatos, descrição, política de acesso (🌐 público, 👥 só sócios, 👥🏆 sócios + convidados de torneios, 🔒 privado). Qualquer usuário pode cadastrar (Wikipedia-style).</p>' +
          '<p><b>Camada 2 — Quadras (colaborativo)</b>: seção "🎾 Quadras do local" no form de edição. Qualquer jogador contribui com entradas tipo "4 quadras de Beach Tennis compartilhadas com Futevôlei" ou "2 quadras de saibro exclusivas de Tênis". Cada entrada tem: modalidade, quantidade, piso/tipo (opcional), flag compartilhada/exclusiva, observação. Cada doc rastreia o contribuidor.</p>' +
          '<p><b>Duas fases de edição:</b></p>' +
          '<ul style="margin:4px 0 8px 18px;font-size:0.78rem;">' +
            '<li><b>Colaborativa (sem dono)</b>: qualquer autenticado adiciona. Cada um edita/apaga apenas as entradas que criou.</li>' +
            '<li><b>Assumida pelo dono</b>: quando alguém reivindica o local como proprietário, passa a ser o <b>único editor de TUDO</b> — inclusive as quadras cadastradas antes pela comunidade. Contributors perdem o acesso de edição (a entrada fica, mas gerenciada pelo dono). Outros usuários não podem mais adicionar novas.</li>' +
          '</ul>' +
          '<p><b>Agregação</b>: na modal de detalhe do venue, a seção "🎾 Quadras disponíveis" soma todas as entradas por modalidade e mostra "6 quadras de Beach Tennis (saibro, areia) · 2 de Tênis (piso duro)" com tag 🔁 compartilhada quando aplicável. Rodapé lista quantos jogadores contribuíram.</p>' +
          '<p><b>Autocomplete do Google</b> — Digite o nome do local; o Google Places sugere. Ao selecionar, nome, endereço, lat/lng, telefone, site, horário e faixa de preço são pré-preenchidos quando disponíveis.</p>' +
          '<p><b>Reivindicar como dono</b> — Dentro do modal do venue cadastrado (sem dono ainda), botão "🏢 Reivindicar como dono" leva pra #my-venues em modo de edição com checkbox "Sou proprietário". Ao aceitar, o dono assume todas as informações (incluindo quadras) e vira o único editor. Se outro usuário já reivindicou, o sistema bloqueia e orienta contato com o suporte.</p>' +
        '</div>' +
        '<div style="background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.18);border-radius:10px;padding:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">Plano Pro para proprietários</div>' +
          '<p><b>Destaque visual</b> — Cards e pins em índigo com glow (em vez do âmbar padrão). Ordenação server-side prioriza Pro no topo.</p>' +
          '<p><b>Painel analytics</b> — Visualizações (viewCount), check-ins nos últimos 7 dias, total de torneios cadastrados no local.</p>' +
          '<p><b>Como ativar</b> — Lista "Meus locais" no perfil mostra botão "🚀 Pro" pra cada venue free. Clique envia manifestação de interesse pra scoreplace.app@gmail.com com os dados do proprietário. Ativação manual no alpha; automação via Stripe quando a demanda justificar.</p>' +
        '</div>'
    },
    {
      id: 'estatisticas-detalhadas',
      title: 'Estatísticas Detalhadas',
      icon: '📊',
      content: '<p>O scoreplace guarda estatísticas detalhadas de cada partida na sua conta. Essas estatísticas sobrevivem mesmo se o torneio for apagado ou se a partida casual for encerrada.</p>' +
        '<p><b>Como acessar</b> — Toque no nome de qualquer jogador em qualquer tela (dashboard, chaveamento, classificação, resultado de partida casual) para abrir o modal de estatísticas. O botão <b>Voltar</b> fica fixo no topo, logo abaixo do menu, sempre visível durante o scroll.</p>' +
        '<div style="background:rgba(56,189,248,0.06);border:1px solid rgba(56,189,248,0.15);border-radius:10px;padding:12px;margin-bottom:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">O que é registrado</div>' +
          '<p><b>Por partida</b> — Sets, games, pontos, % pontos no saque, % pontos na recepção, games mantidos no saque, quebras, killer points (40-40), maior sequência, maior vantagem, duração, esporte.</p>' +
          '<p><b>Por jogador</b> — Games servidos, games mantidos, aproveitamento (%), maior sequência de games mantidos, pontos servidos, pontos ganhos no saque e % no saque por ponto.</p>' +
          '<p><b>Casuais vs Torneios</b> — Estatísticas mantidas separadas entre partidas casuais (⚡) e torneios (🏆). Barras divergentes e ícones lado a lado em cada linha.</p>' +
        '</div>' +
        '<div style="background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.15);border-radius:10px;padding:12px;margin-bottom:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">Barras Divergentes (Desempenho)</div>' +
          '<p>Derrotas à esquerda (vermelho), vitórias à direita (verde). O tamanho é proporcional ao total. Ordem das linhas:</p>' +
          '<p><b>1. Vitórias/Derrotas</b> — V-D totais.</p>' +
          '<p><b>2. Sets</b> — Sets vencidos e perdidos.</p>' +
          '<p><b>3. Games</b> — Games vencidos e perdidos.</p>' +
          '<p><b>4. Pontos</b> — Pontos vencidos e perdidos.</p>' +
          '<p><b>5. Tiebreaks</b> — TBs vencidos e perdidos.</p>' +
          '<p><b>6. Pontos TB Médios</b> — Média do placar vencedor em cada TB. À direita (verde): média dos seus pontos nos TBs que você venceu. À esquerda (vermelho): média dos pontos do adversário nos TBs em que ele venceu contra você.</p>' +
          '<p><b>7. TB Vencidos (mín/máx pts)</b> — Pontos que você marcou nos TBs que venceu. <b>Máx</b> = recorde positivo (o maior placar que você fez ganhando um TB). <b>Mín</b> = recorde negativo (seu menor placar em um TB vencido, geralmente o 7 limpo). Ambos os lados em verde — é o seu mesmo placar.</p>' +
          '<p><b>8. TB Perdidos (mín/máx pts)</b> — Pontos que o adversário marcou nos TBs em que ele venceu contra você. <b>Máx</b> = a maior surra (placar mais alto do adversário quando ganhou). <b>Mín</b> = a derrota mais apertada (menor placar do adversário ao vencer um TB, geralmente 7). Ambos os lados em vermelho.</p>' +
          '<p style="color:var(--text-muted);font-size:0.78rem;">As 3 linhas de TB (6-8) aparecem apenas quando há tiebreaks registrados.</p>' +
        '</div>' +
        '<div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);border-radius:10px;padding:12px;margin-bottom:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">Top 3 Adversários / Parceiros</div>' +
          '<p><b>Adversários</b> — Contra quem você mais joga: casuais e torneios listados separadamente.</p>' +
          '<p><b>Parceiros</b> — Com quem você mais forma dupla: descubra sua dupla ideal pelas vitórias compartilhadas.</p>' +
        '</div>' +
        '<div style="background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.20);border-radius:10px;padding:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">Persistência</div>' +
          '<p>Os dados ficam salvos em <code>users/{seu_uid}/matchHistory</code> — cada jogador cadastrado envolvido recebe sua própria cópia. Mesmo que o torneio seja deletado ou a sala casual expire, seu histórico permanece.</p>' +
          '<p>Seção <b>📋 Torneios Disputados</b> no rodapé do modal lista cada torneio com link direto.</p>' +
        '</div>'
    },
    {
      id: 'desempate',
      title: _t('help.tiebreak'),
      icon: '⚖️',
      content: '<p>Critérios de desempate configuráveis pelo organizador (arraste para reordenar prioridade na criação/edição do torneio). A ordem padrão recomendada segue padrões internacionais (ITF tênis, FIDE xadrez, FIBA basquete):</p>' +
        '<p><b>1. Confronto Direto</b> — Quem ganhou no jogo entre os empatados fica à frente. Critério mais justo quando 2 jogadores empatam, porque é uma decisão direta.</p>' +
        '<p><b>2. Saldo de Pontos</b> — Diferença entre pontos a favor e pontos contra. Premia placares mais dominantes (ex.: vencer 6-0 vale mais que vencer 6-5).</p>' +
        '<p><b>3. Número de Vitórias</b> — Total de jogos vencidos. Favorece quem venceu mais (e empatou menos).</p>' +
        '<p><b>4. Força dos Adversários (Buchholz)</b> — <b>Soma dos pontos de todos os seus adversários no torneio</b>. Quem enfrentou adversários mais fortes (que terminaram com mais pontos) fica à frente. <i>Exemplo:</i> você e João empatam em 8 pts; seus 5 adversários somaram 30 pts no torneio, os do João somaram 22 → você fica à frente porque seu caminho foi mais difícil. <i>De onde veio:</i> criado por <b>Bruno Buchholz em 1932</b> pra torneios de xadrez no Sistema Suíço, hoje é o critério #1 da FIDE pra desempate em Suíço. <i>Quando aplicar:</i> principalmente em <b>Sistema Suíço</b> (cada jogador enfrenta sub-conjuntos diferentes); em Liga round-robin todos enfrentam todos, então tende a ser parecido pra todos os empatados.</p>' +
        '<p><b>5. Qualidade das Vitórias (Sonneborn-Berger)</b> — <b>Soma dos pontos dos adversários que você venceu, mais metade dos pontos dos adversários com quem você empatou</b>. Adversários que você perdeu não contam. Recompensa quem venceu adversários FORTES (não só quantidade, mas qualidade das vitórias). <i>Exemplo:</i> você venceu 3 jogadores que somaram 20 pts + empatou com 1 que fez 6 → SB = 20 + 3 = 23. Já o João venceu 3 jogadores fracos que somaram 9 → SB = 9, você fica à frente. <i>De onde veio:</i> criado por <b>William Sonneborn e Johann Berger entre 1873-1886</b> pra torneios de xadrez round-robin (originalmente "Neustadtl score"). É o critério #2 da FIDE em Suíço e round-robin. <i>Quando aplicar:</i> útil quando Buchholz ainda empata (raro); mais relevante em torneios longos.</p>' +
        '<p><b>6. Sorteio</b> — Desempate aleatório como último recurso quando todos os critérios anteriores empatam.</p>' +
        '<p><b>GSM extras</b> — Torneios com sets entram automaticamente com critérios extras na ordem: saldo de sets (±S), saldo de games (±G), sets vencidos, games vencidos, tiebreaks vencidos. Inseridos entre Saldo de Pontos e Número de Vitórias.</p>' +
        '<p><b>⚡ Pontos Avançados</b> — Quando o Sistema de Pontos Avançado está ativo (Liga), entra como o PRIMEIRO critério (antes de Confronto Direto), porque é uma medida ponderada de dominância configurada pelo organizador.</p>' +
        '<p style="margin-top:1rem;padding:10px;background:rgba(88,166,255,0.08);border-left:3px solid #58a6ff;border-radius:6px;"><b>💡 Dica:</b> no modal de criação do torneio, passe o mouse sobre cada critério pra ver tooltip resumida. Em Buchholz e Sonneborn, clique no ícone <b>ℹ️</b> ao lado pra abrir explicação completa com exemplo numérico e contexto histórico.</p>'
    },
    {
      id: 'atalhos-teclado',
      title: _t('help.shortcuts'),
      icon: '⌨️',
      content: '<div style="display:grid;grid-template-columns:80px 1fr;gap:8px 16px;font-size:0.85rem;">' +
        '<kbd style="background:rgba(255,255,255,0.1);padding:4px 8px;border-radius:6px;text-align:center;font-family:monospace;color:var(--text-bright);font-size:0.8rem;">Ctrl+K</kbd><span style="color:var(--text-main);display:flex;align-items:center;">Abrir busca rápida global</span>' +
        '<kbd style="background:rgba(255,255,255,0.1);padding:4px 8px;border-radius:6px;text-align:center;font-family:monospace;color:var(--text-bright);font-size:0.8rem;">/</kbd><span style="color:var(--text-main);display:flex;align-items:center;">Abrir busca rápida</span>' +
        '<kbd style="background:rgba(255,255,255,0.1);padding:4px 8px;border-radius:6px;text-align:center;font-family:monospace;color:var(--text-bright);font-size:0.8rem;">D</kbd><span style="color:var(--text-main);display:flex;align-items:center;">Ir para Dashboard</span>' +
        '<kbd style="background:rgba(255,255,255,0.1);padding:4px 8px;border-radius:6px;text-align:center;font-family:monospace;color:var(--text-bright);font-size:0.8rem;">E</kbd><span style="color:var(--text-main);display:flex;align-items:center;">Ir para Pessoas (explorar jogadores e torneios)</span>' +
        '<kbd style="background:rgba(255,255,255,0.1);padding:4px 8px;border-radius:6px;text-align:center;font-family:monospace;color:var(--text-bright);font-size:0.8rem;">N</kbd><span style="color:var(--text-main);display:flex;align-items:center;">Criar novo torneio</span>' +
        '<kbd style="background:rgba(255,255,255,0.1);padding:4px 8px;border-radius:6px;text-align:center;font-family:monospace;color:var(--text-bright);font-size:0.8rem;">?</kbd><span style="color:var(--text-main);display:flex;align-items:center;">Abrir/fechar esta ajuda</span>' +
        '<kbd style="background:rgba(255,255,255,0.1);padding:4px 8px;border-radius:6px;text-align:center;font-family:monospace;color:var(--text-bright);font-size:0.8rem;">ESC</kbd><span style="color:var(--text-main);display:flex;align-items:center;">Fechar modal atual</span>' +
        '</div>' +
        '<p style="font-size:0.78rem;color:var(--text-muted);margin-top:12px;">Os atalhos funcionam quando nenhum campo de texto está focado.</p>' +
        '<div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);border-radius:10px;padding:12px;margin-top:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">🔍 Busca rápida — o que ela encontra</div>' +
          '<p><b>Torneios</b> — Seus (scoped) + torneios públicos do feed de descoberta. Match por nome, esporte, local, formato. Clique navega direto pra página do torneio.</p>' +
          '<p><b>Locais</b> — Venues extraídos dos torneios no cache (via <code>venuePlaceId</code>). Match por nome e endereço. Clique abre a modal de detalhe do venue em <code>#venues/&lt;placeId&gt;</code>.</p>' +
          '<p><b>Jogadores</b> — Nomes de participantes em qualquer torneio (scoped + discovery), com contexto dos torneios em que aparecem.</p>' +
          '<p><b>Ações rápidas</b> — Quando o campo tá vazio, lista atalhos: Novo Torneio, Dashboard, Explorar, Notificações, Ajuda.</p>' +
        '</div>'
    },
    {
      id: 'apoio-suporte',
      title: 'Apoio e Suporte',
      icon: '💚',
      content: '<p>O scoreplace.app é <b>gratuito</b>. Todo o desenvolvimento, infra (Firebase, Sentry, Cloud Functions, hospedagem) e manutenção é mantido pelo criador do app.</p>' +
        '<div style="background:rgba(37,211,102,0.08);border:1px solid rgba(37,211,102,0.25);border-radius:10px;padding:12px;margin-bottom:10px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:#25d366;margin-bottom:8px;">💬 Fale com o Desenvolvedor (WhatsApp)</div>' +
          '<p>Botão verde <b>"Fale com o Desenvolvedor"</b> ao lado do <b>Ler QR Code</b> no dashboard (e logo abaixo do nome do torneio, pra organizadores). É a sua <b>linha direta</b> com o desenvolvedor do scoreplace.app pelo WhatsApp.</p>' +
          '<p>Tem dúvida, crítica ou sugestão? Achou algo que não funcionou como esperava? Precisa de ajuda com algo no app? <b>Fale conosco</b> — estamos em versão beta e queremos muito te ouvir!</p>' +
        '</div>' +
        '<div style="background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.15);border-radius:10px;padding:12px;margin-bottom:10px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:#10b981;margin-bottom:8px;">💚 Apoie via PIX</div>' +
          '<p>Página: <b>Apoie</b> (botão verde no dashboard ou rota <code>#support</code>).</p>' +
          '<p>Lá tem o QR Code PIX e a chave copia-e-cola (CNPJ). Qualquer valor ajuda — estimulou a evolução do app, conta como contribuição voluntária.</p>' +
          '<p style="font-size:0.78rem;color:var(--text-muted);">Não tem assinatura recorrente nem cobrança automática. Você decide quando e quanto contribuir.</p>' +
        '</div>' +
        '<div style="background:rgba(168,85,247,0.06);border:1px solid rgba(168,85,247,0.15);border-radius:10px;padding:12px;margin-bottom:10px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:#a78bfa;margin-bottom:8px;">⭐ Plano Pro (R$ 19,90/mês)</div>' +
          '<p>Pra quem organiza muitos torneios ou dirige um clube cadastrado:</p>' +
          '<p>• Torneios ilimitados (free tem limite de 3 ativos simultâneos)<br>' +
            '• Até 64 participantes por torneio (free: 32)<br>' +
            '• Upload de logo personalizada<br>' +
            '• Modo TV sem marca scoreplace<br>' +
            '• Local cadastrado destacado em índigo no mapa</p>' +
          '<p>Botão "🚀 Pro" no dashboard abre checkout Stripe seguro. Cancela a qualquer momento.</p>' +
        '</div>' +
        '<div style="background:rgba(251,146,60,0.06);border:1px solid rgba(251,146,60,0.15);border-radius:10px;padding:12px;margin-bottom:10px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:#fb923c;margin-bottom:8px;">📩 Reportar Bugs ou Sugestões</div>' +
          '<p>Botão <b>"Reportar Problema ou Sugestão"</b> na seção Sobre deste manual. Abre seu app de e-mail com:</p>' +
          '<p>• Versão atual do app<br>' +
            '• Seu nome/email<br>' +
            '• User-agent (browser + OS)</p>' +
          '<p>Tudo já preenchido. Você só descreve o problema/sugestão e envia. E-mail direto pra <code>scoreplace.app@gmail.com</code>.</p>' +
          '<p style="font-size:0.78rem;color:var(--text-muted);">Bugs com screenshot resolvem 10x mais rápido. Print do problema + descrição do que esperava acontecer = ouro.</p>' +
        '</div>' +
        '<div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);border-radius:10px;padding:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:#818cf8;margin-bottom:8px;">📲 Convidar amigos</div>' +
          '<p>Botão <b>"Convidar"</b> no dashboard ou rota <code>#invite</code>. QR Code do app + link curto pra compartilhar via WhatsApp, Instagram, SMS.</p>' +
          '<p>Quando alguém entra pelo link e cria uma conta, você ganha amizade automática (combinada com torneios e presenças).</p>' +
        '</div>' +
        '<div style="background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.15);border-radius:10px;padding:12px;margin-top:10px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:#60a5fa;margin-bottom:8px;">📜 Privacidade e Termos</div>' +
          '<p>Páginas <code>#privacy</code> e <code>#terms</code> (links no rodapé da landing).</p>' +
          '<p>Em <b>fase Beta</b> os dados persistem — torneios, partidas, presenças, perfis ficam salvos. No primeiro login você precisa marcar checkbox aceitando os termos. Conformidade LGPD em andamento (revisão jurídica formal pendente pra v1.0 estável).</p>' +
        '</div>'
    },
    {
      id: 'dicas-app',
      title: _t('help.hints'),
      icon: '💡',
      content: '<p>O scoreplace.app exibe <b>dicas visuais contextuais</b> quando você fica parado por alguns segundos. Elas aparecem como balões com seta apontando para o elemento. Clique "Entendi" para dispensar ou "Desativar dicas" para parar.</p>' +
        '<p style="font-size:0.78rem;color:var(--text-muted);margin-bottom:12px;">Você pode reativar as dicas no seu Perfil. São mais de 200 dicas ao todo, organizadas por área:</p>' +

        // ── Global / Topbar ──
        '<div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);border-radius:10px;padding:12px;margin-bottom:10px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:#818cf8;margin-bottom:8px;">🔝 Barra Superior (7)</div>' +
          '<p style="margin:0;font-size:0.8rem;line-height:1.7;">' +
            '• <b>Login</b> — Faça login para criar e gerenciar torneios<br>' +
            '• <b>Menu ☰</b> — Abra o menu para navegar pelo app<br>' +
            '• <b>Perfil</b> — Acesse estatísticas e configurações<br>' +
            '• <b>Tema</b> — Noturno, Claro, Pôr do Sol e Oceano<br>' +
            '• <b>Ajuda (?)</b> — Manual completo com todas as funcionalidades<br>' +
            '• <b>Busca rápida</b> — Ctrl+K para buscar torneios e jogadores<br>' +
            '• <b>Notificações</b> — Avisos de torneios e convites' +
          '</p>' +
        '</div>' +

        // ── Strategic ──
        '<div style="background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.15);border-radius:10px;padding:12px;margin-bottom:10px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:#fbbf24;margin-bottom:8px;">💡 Apoie / Pro (4)</div>' +
          '<p style="margin:0;font-size:0.8rem;line-height:1.7;">' +
            '• <b>Apoie (Dashboard)</b> — PIX mantém a plataforma gratuita<br>' +
            '• <b>Pro (Dashboard)</b> — Torneios ilimitados, logo, Modo TV sem marca<br>' +
            '• <b>Apoie (Torneio)</b> — Cada contribuição faz diferença<br>' +
            '• <b>Pro (Torneio)</b> — Criar torneios ilimitados e personalizar' +
          '</p>' +
        '</div>' +

        // ── Dashboard ──
        '<div style="background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.15);border-radius:10px;padding:12px;margin-bottom:10px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:#34d399;margin-bottom:8px;">📊 Dashboard (15)</div>' +
          '<p style="margin:0;font-size:0.8rem;line-height:1.7;">' +
            '• <b>+ Novo Torneio</b> — Crie em menos de 1 minuto<br>' +
            '• <b>Filtro Todos</b> — Veja todos os torneios de uma vez<br>' +
            '• <b>Filtro Organizados</b> — Só os que você organiza<br>' +
            '• <b>Filtro Participando</b> — Só onde está inscrito<br>' +
            '• <b>Filtro Abertos</b> — Inscrições disponíveis<br>' +
            '• <b>Filtro Favoritos</b> — Seus favoritados<br>' +
            '• <b>Filtro Encerrados</b> — Classificação final e pódio<br>' +
            '• <b>Filtros gerais</b> — Por tipo, esporte, local, formato<br>' +
            '• <b>Cards/Lista</b> — Alterne visualização compacta<br>' +
            '• <b>Coração ♥</b> — Favoritar torneio<br>' +
            '• <b>Filtro por esporte</b> — Beach Tennis, Tênis, Padel...<br>' +
            '• <b>Filtro por local</b> — Torneios perto de você<br>' +
            '• <b>Filtro por formato</b> — Eliminatórias, Dupla, Fase de Grupos, Pontos Corridos<br>' +
            '• <b>Carregar mais</b> — Próximos torneios (paginação)' +
          '</p>' +
        '</div>' +

        // ── Tournament Detail: Participant ──
        '<div style="background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.15);border-radius:10px;padding:12px;margin-bottom:10px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:#60a5fa;margin-bottom:8px;">🏆 Detalhe do Torneio — Participante (6)</div>' +
          '<p style="margin:0;font-size:0.8rem;line-height:1.7;">' +
            '• <b>Convidar</b> — WhatsApp, QR Code, link<br>' +
            '• <b>Inscrever-se</b> — Organizador notificado automaticamente<br>' +
            '• <b>Cancelar inscrição</b> — Se inscrições abertas, pode voltar<br>' +
            '• <b>QR Code</b> — Projetar no evento<br>' +
            '• <b>Inscritos</b> — Lista, check-in, gerenciar<br>' +
            '• <b>Regras</b> — Configurações, desempate, histórico' +
          '</p>' +
        '</div>' +

        // ── Tournament Detail: Organizer ──
        '<div style="background:rgba(168,85,247,0.06);border:1px solid rgba(168,85,247,0.15);border-radius:10px;padding:12px;margin-bottom:10px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:#a855f7;margin-bottom:8px;">🛠️ Ferramentas do Organizador (17)</div>' +
          '<p style="margin:0;font-size:0.8rem;line-height:1.7;">' +
            '• <b>Editar</b> — Local, datas, formato, categorias<br>' +
            '• <b>Comunicar</b> — Mensagens para todos os inscritos<br>' +
            '• <b>Sortear</b> — Gerar chaveamento automaticamente<br>' +
            '• <b>+ Participante</b> — Adicionar manualmente<br>' +
            '• <b>+ Time</b> — Adicionar dupla/equipe<br>' +
            '• <b>Add Bot</b> — Jogadores fictícios para completar<br>' +
            '• <b>Categorias</b> — Mover, mesclar, atribuir<br>' +
            '• <b>Abrir/Fechar inscrições</b> — Controlar período<br>' +
            '• <b>Salvar Template</b> — Reusar configurações<br>' +
            '• <b>Clonar</b> — Copiar torneio sem participantes<br>' +
            '• <b>Encerrar</b> — Finalizar e exibir pódio<br>' +
            '• <b>Excluir</b> — Remover permanentemente<br>' +
            '• <b>Co-organização</b> — Convidar ou transferir<br>' +
            '• <b>Iniciar Torneio</b> — Liberar partidas<br>' +
            '• <b>Ver Chaves</b> — Chaveamento completo<br>' +
            '• <b>Exportar CSV</b> — Planilha de resultados<br>' +
            '• <b>Liga ativo</b> — Toggle de participação: ativo = entra nos sorteios; inativo = folga com 0 pts' +
          '</p>' +
        '</div>' +

        // ── Create Tournament ──
        '<div style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.15);border-radius:10px;padding:12px;margin-bottom:10px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:#f59e0b;margin-bottom:8px;">➕ Criar/Editar Torneio (32)</div>' +
          '<p style="margin:0;font-size:0.8rem;line-height:1.7;">' +
            '• <b>Esporte</b> — Padrões de pontuação por modalidade<br>' +
            '• <b>Formato</b> — Eliminatória, Dupla, Fase de Grupos, Pontos Corridos<br>' +
            '• <b>Modo de sorteio</b> — Sorteio ou Rei/Rainha<br>' +
            '• <b>Modo de inscrição</b> — Individual, Times, Misto<br>' +
            '• <b>Tipo de jogo</b> — Simples (1v1) ou Duplas (2v2)<br>' +
            '• <b>Local</b> — Busca Google Maps + previsão do tempo<br>' +
            '• <b>Endereço público</b> — Visível ou privado<br>' +
            '• <b>Quadras</b> — Quantidade e nomes<br>' +
            '• <b>Categorias gênero</b> — Fem, Masc, Misto<br>' +
            '• <b>Categorias habilidade</b> — A, B, C separados por vírgula<br>' +
            '• <b>Pontuação (GSM)</b> — Sets, games, tiebreaks<br>' +
            '• <b>Logo</b> — Gerar automático ou upload<br>' +
            '• <b>Público/Privado</b> — Visível no Explorar<br>' +
            '• <b>Data de início</b> — Contagem regressiva nos cards<br>' +
            '• <b>Prazo de inscrição</b> — Encerramento automático<br>' +
            '• <b>Máximo participantes</b> — Limite opcional<br>' +
            '• <b>Auto-encerrar</b> — Ao atingir o limite<br>' +
            '• <b>Duração da partida</b> — Para estimativa total<br>' +
            '• <b>Classificados Rei/Rainha</b> — 1 ou 2 por grupo<br>' +
            '• <b>Grupos</b> — Número e classificados por grupo<br>' +
            '• <b>Rodadas Suíço</b> — Recomendado: log₂ participantes (aparece se Suíço foi escolhido como solução em torneio Eliminatórias)<br>' +
            '• <b>W.O.</b> — Individual ou Time Inteiro<br>' +
            '• <b>Inscrições tardias</b> — Fechado, Standby, Expansão<br>' +
            '• <b>Desempate</b> — Arrastar para reordenar critérios<br>' +
            '• <b>Template</b> — Carregar configuração salva<br>' +
            '• <b>Liga: temporada</b> — Duração em meses<br>' +
            '• <b>Liga: inscrições abertas</b> — Durante toda temporada<br>' +
            '• <b>Liga: sorteio manual</b> — Ou agendar automáticos<br>' +
            '• <b>Liga: agendamento</b> — Data, hora e intervalo<br>' +
            '• <b>Liga: novos jogadores</b> — Zero, Mínimo, Média<br>' +
            '• <b>Liga: inatividade</b> — Manter, Decair, Remover<br>' +
            '• <b>Liga: formato rodada</b> — Padrão ou Rei/Rainha' +
          '</p>' +
        '</div>' +

        // ── Invite Modal ──
        '<div style="background:rgba(34,211,238,0.06);border:1px solid rgba(34,211,238,0.15);border-radius:10px;padding:12px;margin-bottom:10px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:#22d3ee;margin-bottom:8px;">👥 Modal de Convite (5)</div>' +
          '<p style="margin:0;font-size:0.8rem;line-height:1.7;">' +
            '• <b>Amigos</b> — Convidar da plataforma com um clique<br>' +
            '• <b>WhatsApp</b> — Link direto para grupos<br>' +
            '• <b>Copiar link</b> — Instagram, Telegram, SMS<br>' +
            '• <b>QR Code</b> — Projetar no evento<br>' +
            '• <b>E-mail</b> — Enviar por e-mail' +
          '</p>' +
        '</div>' +

        // ── Power of 2 + Incomplete Teams ──
        '<div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);border-radius:10px;padding:12px;margin-bottom:10px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:#f87171;margin-bottom:8px;">🔢 Painéis de Resolução (10)</div>' +
          '<p style="margin:0;font-size:0.8rem;line-height:1.7;">' +
            '• <b>Nash (P2)</b> — Cores indicam equilíbrio: verde=melhor<br>' +
            '• <b>Reabrir (P2)</b> — Completar potência de 2<br>' +
            '• <b>BYE</b> — Avançar sem jogar na 1ª rodada<br>' +
            '• <b>Play-in</b> — Rodada extra para excedentes<br>' +
            '• <b>Suíço</b> — Várias rodadas antes de afunilar<br>' +
            '• <b>Enquete</b> — Participantes votam na solução<br>' +
            '• <b>Nash (Times)</b> — Score de equilíbrio por opção<br>' +
            '• <b>Reabrir (Times)</b> — Novos jogadores completam times<br>' +
            '• <b>Bots</b> — Preencher vagas com nomes fictícios<br>' +
            '• <b>Ajuste Manual</b> — Arrastar e soltar entre times' +
          '</p>' +
        '</div>' +

        // ── Poll ──
        '<div style="background:rgba(168,85,247,0.06);border:1px solid rgba(168,85,247,0.15);border-radius:10px;padding:12px;margin-bottom:10px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:#c084fc;margin-bottom:8px;">📊 Enquete (3)</div>' +
          '<p style="margin:0;font-size:0.8rem;line-height:1.7;">' +
            '• <b>Prazo</b> — Encerramento automático<br>' +
            '• <b>Opções</b> — Marcar e ver Nash<br>' +
            '• <b>Votar</b> — Mudar voto até encerrar' +
          '</p>' +
        '</div>' +

        // ── GSM ──
        '<div style="background:rgba(236,72,153,0.06);border:1px solid rgba(236,72,153,0.15);border-radius:10px;padding:12px;margin-bottom:10px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:#ec4899;margin-bottom:8px;">🎾 Pontuação GSM (8)</div>' +
          '<p style="margin:0;font-size:0.8rem;line-height:1.7;">' +
            '• <b>Sets para vencer</b> — 1 a 5 (amador vs profissional)<br>' +
            '• <b>Games por set</b> — 6 (tênis), 11 (mesa), 25 (vôlei)<br>' +
            '• <b>Tiebreak</b> — Para sets empatados<br>' +
            '• <b>Super tiebreak</b> — Set decisivo curto (10 pts)<br>' +
            '• <b>Contagem</b> — Numérica ou Tênis (15-30-40)<br>' +
            '• <b>Vantagem</b> — Deuce/advantage em 40-40<br>' +
            '• <b>Placar dos sets</b> — Entrada set a set automática<br>' +
            '• <b>Salvar sets</b> — Vencedor determinado automaticamente' +
          '</p>' +
        '</div>' +

        // ── Partida Casual ──
        '<div style="background:rgba(56,189,248,0.06);border:1px solid rgba(56,189,248,0.15);border-radius:10px;padding:12px;margin-bottom:10px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:#38bdf8;margin-bottom:8px;">📡 Partida Casual (8)</div>' +
          '<p style="margin:0;font-size:0.8rem;line-height:1.7;">' +
            '• <b>Partida Casual</b> — Jogue sem criar torneio<br>' +
            '• <b>Esporte</b> — Pontuação ajustada por modalidade<br>' +
            '• <b>Single/Dupla</b> — Toggle na configuração<br>' +
            '• <b>Sortear Duplas</b> — ON = aleatório, OFF = arrastar<br>' +
            '• <b>QR Code / Código</b> — Convide jogadores presentes<br>' +
            '• <b>Lobby</b> — Veja quem entrou em tempo real<br>' +
            '• <b>Ordem de saque</b> — ⇅ troca sacador no time<br>' +
            '• <b>Tie-break</b> — Ative a qualquer momento na prorrogação' +
          '</p>' +
        '</div>' +

        // ── Bracket ──
        '<div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);border-radius:10px;padding:12px;margin-bottom:10px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:#818cf8;margin-bottom:8px;">🏅 Chaveamento / Classificação (15)</div>' +
          '<p style="margin:0;font-size:0.8rem;line-height:1.7;">' +
            '• <b>Zoom</b> — Slider + arraste para navegar<br>' +
            '• <b>Imprimir</b> — Para colar na parede do evento<br>' +
            '• <b>Exportar CSV</b> — Excel / Google Sheets<br>' +
            '• <b>Ordenar colunas</b> — Clique nos cabeçalhos<br>' +
            '• <b>Compartilhar resultado</b> — WhatsApp / clipboard<br>' +
            '• <b>Modo TV</b> — Telão fullscreen, auto-refresh 30s<br>' +
            '• <b>Placar inline</b> — Digitar direto no card<br>' +
            '• <b>Confirmar placar</b> — Registrar resultado<br>' +
            '• <b>Editar resultado</b> — Reabrir campos<br>' +
            '• <b>Ocultar rodada</b> — Economizar espaço<br>' +
            '• <b>Fechar rodada</b> — Gerar próxima automaticamente<br>' +
            '• <b>Avançar eliminatória</b> — Classificados dos grupos<br>' +
            '• <b>Estatísticas do jogador</b> — Clique no nome<br>' +
            '• <b>Histórico de partidas</b> — Adversários e placares<br>' +
            '• <b>Só meus jogos</b> — Filtrar suas partidas' +
          '</p>' +
        '</div>' +

        // ── Check-in ──
        '<div style="background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.15);border-radius:10px;padding:12px;margin-bottom:10px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:#34d399;margin-bottom:8px;">✅ Participantes / Check-in (8)</div>' +
          '<p style="margin:0;font-size:0.8rem;line-height:1.7;">' +
            '• <b>VIP</b> — Prioridade no cabeçamento<br>' +
            '• <b>Remover</b> — Excluir participante<br>' +
            '• <b>Toggle check-in</b> — Confirmar presença<br>' +
            '• <b>Filtros</b> — Todos, Presentes, Ausentes<br>' +
            '• <b>Limpar</b> — Resetar todos os check-ins<br>' +
            '• <b>Ordenar</b> — A-Z ou cronológico<br>' +
            '• <b>W.O.</b> — Marcar ausente/walkover<br>' +
            '• <b>Substituir W.O.</b> — Próximo da lista de espera' +
          '</p>' +
        '</div>' +

        // ── Pre-draw ──
        '<div style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.15);border-radius:10px;padding:12px;margin-bottom:10px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:#f59e0b;margin-bottom:8px;">🎲 Pré-Sorteio (3)</div>' +
          '<p style="margin:0;font-size:0.8rem;line-height:1.7;">' +
            '• <b>Confirmar sorteio</b> — Gerar chaveamento<br>' +
            '• <b>Renomear categoria</b> — Antes do sorteio<br>' +
            '• <b>Mesclar categorias</b> — Unir poucas inscrições' +
          '</p>' +
        '</div>' +

        // ── Explore ──
        '<div style="background:rgba(34,211,238,0.06);border:1px solid rgba(34,211,238,0.15);border-radius:10px;padding:12px;margin-bottom:10px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:#22d3ee;margin-bottom:8px;">👥 Pessoas / Explorar (2)</div>' +
          '<p style="margin:0;font-size:0.8rem;line-height:1.7;">' +
            '• <b>Busca / Outros usuários</b> — Encontrar por nome, cidade ou esporte<br>' +
            '• <b>Pedido de amizade</b> — Conectar para convites e presença futura' +
          '</p>' +
        '</div>' +

        // ── Notifications ──
        '<div style="background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.15);border-radius:10px;padding:12px;margin-bottom:10px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:#fbbf24;margin-bottom:8px;">🔔 Notificações (2)</div>' +
          '<p style="margin:0;font-size:0.8rem;line-height:1.7;">' +
            '• <b>Aceitar co-organização</b> — Convite para organizar junto<br>' +
            '• <b>Aceitar amizade</b> — Trocar convites de torneio' +
          '</p>' +
        '</div>' +

        // ── Profile ──
        '<div style="background:rgba(168,85,247,0.06);border:1px solid rgba(168,85,247,0.15);border-radius:10px;padding:12px;margin-bottom:10px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:#c084fc;margin-bottom:8px;">👤 Perfil (6)</div>' +
          '<p style="margin:0;font-size:0.8rem;line-height:1.7;">' +
            '• <b>Gênero</b> — Atribuição automática de categorias<br>' +
            '• <b>Idioma</b> — 🇧🇷 Português / 🇺🇸 English<br>' +
            '• <b>Esportes + nível por modalidade</b> — Filtra torneios, locais e check-in; desbloqueia nível A/B/C/D/FUN por esporte<br>' +
            '• <b>Localização</b> — Torneios perto de você<br>' +
            '• <b>Notificações</b> — Todas, Importantes, Fundamentais<br>' +
            '• <b>Dicas visuais</b> — Ativar/desativar este sistema' +
          '</p>' +
        '</div>' +

        // ── Venues (descoberta) ──
        '<div style="background:rgba(14,165,233,0.06);border:1px solid rgba(14,165,233,0.15);border-radius:10px;padding:12px;margin-bottom:10px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:#38bdf8;margin-bottom:8px;">🏢 Descobrir Locais (8)</div>' +
          '<p style="margin:0;font-size:0.8rem;line-height:1.7;">' +
            '• <b>Local</b> — Cidade, bairro ou endereço (geocoder)<br>' +
            '• <b>GPS</b> — Usa localização precisa do dispositivo<br>' +
            '• <b>Modalidade</b> — Filtra por esporte<br>' +
            '• <b>Distância (km)</b> — Raio virando círculo no mapa<br>' +
            '• <b>Mapa</b> — Pins coloridos por tipo<br>' +
            '• <b>Lista</b> — Cards com detalhes<br>' +
            '• <b>Expandir raio</b> — Triplica com 1 clique se zero resultados<br>' +
            '• <b>Cadastrar local</b> — Qualquer jogador (Wikipedia-style)' +
          '</p>' +
        '</div>' +

        // ── Venue Detail Modal ──
        '<div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);border-radius:10px;padding:12px;margin-bottom:10px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:#a5b4fc;margin-bottom:8px;">📍 Modal do Local (6)</div>' +
          '<p style="margin:0;font-size:0.8rem;line-height:1.7;">' +
            '• <b>Estou aqui agora</b> — Check-in inline sem navegar<br>' +
            '• <b>Planejar ida</b> — Dialog de agendamento auto-aberto<br>' +
            '• <b>Compartilhar</b> — Web Share API + link canônico<br>' +
            '• <b>Criar torneio aqui</b> — Venue pré-preenchido<br>' +
            '• <b>Avaliar</b> — Estrelas 1–5 + texto opcional<br>' +
            '• <b>Reivindicar</b> — Tag "✅ Oficial" pra proprietário' +
          '</p>' +
        '</div>' +

        // ── Presence ──
        '<div style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.15);border-radius:10px;padding:12px;margin-bottom:10px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:#fbbf24;margin-bottom:8px;">🗓️ Presença (7)</div>' +
          '<p style="margin:0;font-size:0.8rem;line-height:1.7;">' +
            '• <b>Local</b> — Dropdown combina perfil + torneios<br>' +
            '• <b>Pills de modalidade</b> — Seleção múltipla<br>' +
            '• <b>Estou aqui agora</b> — Check-in 3h (notifica amigos 📡)<br>' +
            '• <b>Planejar ida</b> — Agendamento (notifica amigos 🗓️)<br>' +
            '• <b>Adicionar à agenda</b> — Google/Outlook/.ics<br>' +
            '• <b>Cancelar</b> — Remove sua presença<br>' +
            '• <b>Gráfico por hora</b> — Movimento do dia' +
          '</p>' +
        '</div>' +

        // ── Dashboard Widgets ──
        '<div style="background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.15);border-radius:10px;padding:12px;margin-bottom:10px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:#34d399;margin-bottom:8px;">📊 Widgets da Dashboard (6)</div>' +
          '<p style="margin:0;font-size:0.8rem;line-height:1.7;">' +
            '• <b>Meus locais</b> — Check-in em 1 tap nos venues preferidos<br>' +
            '• <b>Amigos no local</b> — Até 6 amigos com presença ativa hoje<br>' +
            '• <b>Complete seu perfil</b> — Nudge quando faltam campos-chave<br>' +
            '• <b>📍 Place (hero)</b> — Botão para descobrir locais e registrar presença<br>' +
            '• <b>👥 Pessoas (hero)</b> — Botão para explorar jogadores e torneios da comunidade<br>' +
            '• <b>⚡ Partida Casual (hero)</b> — Criar sala de placar ao vivo' +
          '</p>' +
        '</div>' +

        // ── My Venues / Tournament Calendar / Notif CTAs ──
        '<div style="background:rgba(139,92,246,0.06);border:1px solid rgba(139,92,246,0.15);border-radius:10px;padding:12px;margin-bottom:10px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:#a78bfa;margin-bottom:8px;">🔗 Integrações (5)</div>' +
          '<p style="margin:0;font-size:0.8rem;line-height:1.7;">' +
            '• <b>Cadastrar local</b> — Autocomplete do Google Places<br>' +
            '• <b>Reivindicar propriedade</b> — Tag oficial<br>' +
            '• <b>Calendário do torneio</b> — Google/Outlook/.ics<br>' +
            '• <b>Convite casual (notif)</b> — Entrar direto na sala<br>' +
            '• <b>Check-in de amigo (notif)</b> — Vai ao venue' +
          '</p>' +
        '</div>' +

        // ── Meta ──
        '<div style="background:rgba(107,114,128,0.06);border:1px solid rgba(107,114,128,0.15);border-radius:10px;padding:12px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:#9ca3af;margin-bottom:8px;">ℹ️ Meta (1)</div>' +
          '<p style="margin:0;font-size:0.8rem;line-height:1.7;">' +
            '• <b>Sobre as dicas</b> — Como desativar e reativar no Perfil' +
          '</p>' +
        '</div>'
    },
    {
      id: 'notas-versoes',
      title: _t('help.changelog'),
      icon: '📋',
      // Lazy-loaded — full HTML lives in js/release-notes.js (~1MB).
      // Loaded on first open or first search ≥2 chars (see _loadReleaseNotes below).
      content: '<div id="release-notes-placeholder" style="text-align:center; padding:24px 16px;">' +
        '<div style="font-size:2rem; margin-bottom:8px; opacity:0.6;">📋</div>' +
        '<div style="font-weight:700; color:var(--text-bright); margin-bottom:6px; font-size:0.9rem;">Notas de versões</div>' +
        '<div id="release-notes-loading" style="font-size:0.78rem; color:var(--text-muted); opacity:0.85;">Carregando histórico completo…</div>' +
        '</div>'
    }
  ];

  // Build sections HTML
  var sectionsHtml = '';
  for (var i = 0; i < helpSections.length; i++) {
    var s = helpSections[i];
    sectionsHtml += '<div class="help-section" data-help-id="' + s.id + '" data-search="' + (s.title + ' ' + s.content).replace(/<[^>]+>/g, '').toLowerCase().replace(/"/g, '&quot;') + '" style="margin-bottom: 1rem;">' +
      '<div onclick="this.parentElement.classList.toggle(\'open\')" style="display:flex; align-items:center; gap:10px; padding:10px 12px; background:rgba(99,102,241,0.06); border:1px solid rgba(99,102,241,0.12); border-radius:10px; cursor:pointer; transition:all 0.2s; user-select:none;" onmouseover="this.style.background=\'rgba(99,102,241,0.12)\'" onmouseout="this.style.background=\'rgba(99,102,241,0.06)\'">' +
        '<span style="font-size:1.2rem; flex-shrink:0;">' + s.icon + '</span>' +
        '<span style="font-size:0.85rem; font-weight:600; color:var(--text-bright); flex:1;">' + s.title + '</span>' +
        '<span class="help-chevron" style="font-size:0.7rem; color:var(--text-muted); transition:transform 0.2s;">&#9660;</span>' +
      '</div>' +
      '<div class="help-body" style="display:none; padding:12px 14px 8px; font-size:0.8rem; color:var(--text-main); line-height:1.7;">' + s.content + '</div>' +
    '</div>';
  }

  // v1.0.46-beta: cabeçalho usa _renderBackHeader pra padronizar com o resto
  // do app. Pedido: "aqui o cabeçalho está inconstistente. deve ser no
  // padrao de todo o app". Antes era custom (Voltar pill + título + ✕),
  // agora segue o pattern: back button (esq) + título (centro) + hamburger
  // (dir). Search input fica no belowHtml do header.
  var _helpHdr = (typeof window._renderBackHeader === 'function')
    ? window._renderBackHeader({
        label: 'Voltar',
        middleHtml: '<h2 style="margin:0;font-size:1rem;font-weight:800;color:var(--text-bright);text-align:center;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Central de Ajuda</h2>',
        onClickOverride: function() {
          if (typeof closeModal === 'function') closeModal('modal-help');
        },
        belowHtml: '<input type="text" id="help-search-input" placeholder="Buscar no manual..." style="width:100%;box-sizing:border-box;margin-top:10px;padding:10px 14px;border-radius:10px;border:1px solid var(--border-color);background:var(--bg-darker);color:var(--text-color);font-size:0.85rem;outline:none;" oninput="window._filterHelpSections(this.value)">',
        extraStyle: 'position:sticky;top:0;z-index:2;background:var(--bg-card,var(--bg-darker));padding:12px 1.25rem 12px;border-bottom:1px solid rgba(255,255,255,0.06);'
      })
    : // Fallback se _renderBackHeader ainda não tiver carregado (defesa).
      ('<div style="position:sticky;top:0;z-index:2;background:var(--bg-card,var(--bg-darker));padding:12px 1.25rem;border-bottom:1px solid rgba(255,255,255,0.06);">' +
        '<button class="btn btn-outline btn-sm" onclick="if(typeof closeModal===\'function\')closeModal(\'modal-help\');">← Voltar</button>' +
        '<h2 style="display:inline-block;margin:0 1rem;">Central de Ajuda</h2>' +
        '<input type="text" id="help-search-input" placeholder="Buscar no manual..." style="width:100%;margin-top:10px;padding:10px 14px;" oninput="window._filterHelpSections(this.value)">' +
      '</div>');

  var html = '<div class="modal-overlay" id="modal-help">' +
    '<div class="modal" style="max-width:560px; padding:0; max-height:85vh; display:flex; flex-direction:column;">' +
      _helpHdr +
      '<div id="help-sections-container" style="padding:1.25rem 1.5rem 1.5rem; overflow-y:auto; flex:1;">' +
        sectionsHtml +
        '<div id="help-no-results" style="display:none; text-align:center; padding:2rem 1rem; color:var(--text-muted); font-size:0.85rem;">Nenhum resultado encontrado. Tente outras palavras.</div>' +
      '</div>' +
    '</div>' +
  '</div>';

  document.body.insertAdjacentHTML('beforeend', html);

  // Add CSS for open/close animation
  var style = document.createElement('style');
  style.textContent = '.help-section.open .help-body { display: block !important; } .help-section.open .help-chevron { transform: rotate(180deg); } .help-section .help-body p { margin: 0 0 8px; } .help-section .help-body p:last-child { margin-bottom: 0; }';
  document.head.appendChild(style);

  // v1.0.25-beta: auto-open "Instalar o app" por default em vez de "Sobre".
  // Beta testers reclamavam "cadê o ícone? qual o nome do app?" — primeira
  // coisa que abre o Help precisa ensinar a fixar o app na tela inicial.
  var firstSection = document.querySelector('.help-section[data-help-id="instalar-app"]');
  if (firstSection) firstSection.classList.add('open');

  // === Lazy-load das notas de versões (extraídas em v0.17.56 pra dropar ~1MB do first paint) ===
  window._loadReleaseNotes = function () {
    if (window._releaseNotesLoaded || window._releaseNotesLoading) return;
    window._releaseNotesLoading = true;
    var s = document.createElement('script');
    s.src = 'js/release-notes.js?v=' + (window.SCOREPLACE_VERSION || '');
    s.onload = function () {
      // DOM update PRIMEIRO, flag DEPOIS — garante que observadores externos
      // (Playwright, hint system) que esperam pelo flag vejam DOM já atualizado.
      var ph = document.getElementById('release-notes-placeholder');
      if (ph && typeof window._RELEASE_NOTES_HTML === 'string') {
        ph.outerHTML = window._RELEASE_NOTES_HTML;
        // Atualiza data-search da seção pra que busca passe a achar dentro das notas
        var sec = document.querySelector('.help-section[data-help-id="notas-versoes"]');
        if (sec) {
          var body = sec.querySelector('.help-body');
          if (body) {
            var bodyText = (body.innerText || body.textContent || '').toLowerCase();
            sec.setAttribute('data-search', sec.getAttribute('data-search') + ' ' + bodyText.replace(/"/g, '&quot;'));
          }
        }
      }
      window._releaseNotesLoaded = true;
      window._releaseNotesLoading = false;
    };
    s.onerror = function () {
      window._releaseNotesLoading = false;
      var loading = document.getElementById('release-notes-loading');
      if (loading) {
        loading.style.color = '#ef4444';
        loading.textContent = '⚠️ Falha ao carregar — verifique sua conexão e tente reabrir.';
      }
    };
    document.head.appendChild(s);
  };

  // Dispara o load no primeiro clique no header da seção "Notas de versões"
  var notasHeader = document.querySelector('.help-section[data-help-id="notas-versoes"] > div:first-child');
  if (notasHeader) {
    notasHeader.addEventListener('click', function () {
      // setTimeout(0) garante que o toggle da classe .open já rodou antes do load
      setTimeout(window._loadReleaseNotes, 0);
    });
  }

  // Search/filter function
  window._filterHelpSections = function(query) {
    var q = (query || '').toLowerCase().trim();
    // Busca real (≥2 chars) também dispara lazy-load das notas — caso contrário
    // a busca dentro do changelog sempre retorna nada até o usuário abrir manualmente.
    if (q.length >= 2 && !window._releaseNotesLoaded) {
      window._loadReleaseNotes();
    }
    var sections = document.querySelectorAll('#help-sections-container .help-section');
    var noResults = document.getElementById('help-no-results');
    var visibleCount = 0;

    sections.forEach(function(sec) {
      var searchData = sec.getAttribute('data-search') || '';
      if (!q || searchData.indexOf(q) !== -1) {
        sec.style.display = '';
        visibleCount++;
        // Auto-open matching sections when searching, close non-matching
        if (q) {
          sec.classList.add('open');
        }
      } else {
        sec.style.display = 'none';
        sec.classList.remove('open');
      }
    });

    // If search is empty, close all except "instalar-app" (auto-open default)
    if (!q) {
      sections.forEach(function(sec) {
        if (sec.getAttribute('data-help-id') !== 'instalar-app') sec.classList.remove('open');
        else sec.classList.add('open');
      });
    }

    if (noResults) noResults.style.display = visibleCount === 0 ? '' : 'none';
  };

}
window.setupHelpModal = setupHelpModal;
setupHelpModal();

// v1.3.11-beta: page-route #help. Move o .modal já construído pelo
// setupHelpModal pro view-container, com back-header padronizado.
// Padrão centralizado igual a #profile, #support, #privacy, #terms.
window.renderHelpPage = function (container) {
  if (!container) return;
  // Garantir que o DOM do modal existe (pode ter sido destruído quando user
  // navegou pra outra rota — view-container.innerHTML='' destrói o .modal).
  if (!document.getElementById('modal-help') && typeof window.setupHelpModal === 'function') {
    window.setupHelpModal();
  }
  var modalEl = document.getElementById('modal-help');
  var modalInner = modalEl ? modalEl.querySelector('.modal') : null;
  if (!modalInner) {
    if (modalEl) modalEl.remove();
    if (typeof window.setupHelpModal === 'function') window.setupHelpModal();
    modalEl = document.getElementById('modal-help');
    modalInner = modalEl ? modalEl.querySelector('.modal') : null;
  }
  if (!modalInner) return;

  // Remove o back-header interno (built no setupHelpModal com onClickOverride
  // pra closeModal). Vamos colocar um novo apontando pra #dashboard.
  var oldBack = modalInner.querySelector('.sticky-back-header');
  if (oldBack) oldBack.remove();

  var hdr = (typeof window._renderBackHeader === 'function')
    ? window._renderBackHeader({
        href: '#dashboard',
        label: 'Voltar',
        middleHtml: '<span style="font-size:0.88rem;font-weight:700;color:var(--text-bright);">❓ Central de Ajuda</span>',
        belowHtml: '<input type="text" id="help-search-input" placeholder="Buscar no manual..." style="width:100%;box-sizing:border-box;margin-top:10px;padding:10px 14px;border-radius:10px;border:1px solid var(--border-color);background:var(--bg-darker);color:var(--text-color);font-size:0.85rem;outline:none;" oninput="window._filterHelpSections(this.value)">'
      })
    : '';

  container.innerHTML = hdr;
  container.appendChild(modalInner);
  if (modalEl && modalEl.parentNode === document.body) modalEl.remove();

  if (typeof window._reflowChrome === 'function') window._reflowChrome();
};

// === Modal Criação Rápida ===
(function setupQuickCreateModal() {
  if (document.getElementById('modal-quick-create')) return;
  const html = `
    <div class="modal-overlay" id="modal-quick-create">
      <div class="modal" style="max-width:420px;">
        ${typeof window._renderBackHeader === 'function' ? window._renderBackHeader({label:(window._t||function(k){return k;})('btn.back')||'Voltar',onClickOverride:"if(typeof closeModal==='function')closeModal('modal-quick-create');",middleHtml:'<span style="flex:1;text-align:center;font-size:0.9rem;font-weight:700;color:var(--text-bright);">'+ ((window._t||function(k){return k;})('quickCreate.title')||'Novo Torneio') +'</span>'}) : '<div></div>'}
        <div style="padding:1.25rem 2rem 2rem;">
        <div class="form-group" style="margin-bottom:1.25rem;">
          <label class="form-label">${(window._t || function(k){return k;})('quickCreate.sportLabel')}</label>
          <div id="qc-sport-buttons" style="display:flex;gap:6px;flex-wrap:wrap;">
            <button type="button" class="qc-sport-btn qc-sport-active" data-sport="🎾 Beach Tennis" onclick="window._qcSelectSport(this)" style="padding:8px 14px;border-radius:10px;font-size:0.85rem;cursor:pointer;transition:all 0.15s;border:2px solid #fbbf24;background:rgba(251,191,36,0.15);color:#fbbf24;font-weight:600;">${(window._sportIcon && window._sportIcon('Beach Tennis')) || '🎾'} Beach Tennis</button>
            <button type="button" class="qc-sport-btn" data-sport="🥒 Pickleball" onclick="window._qcSelectSport(this)" style="padding:8px 14px;border-radius:10px;font-size:0.85rem;cursor:pointer;transition:all 0.15s;border:2px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.06);color:var(--text-main);font-weight:500;">${(window._sportIcon && window._sportIcon('Pickleball')) || '🥒'} Pickleball</button>
            <button type="button" class="qc-sport-btn" data-sport="🎾 Tênis" onclick="window._qcSelectSport(this)" style="padding:8px 14px;border-radius:10px;font-size:0.85rem;cursor:pointer;transition:all 0.15s;border:2px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.06);color:var(--text-main);font-weight:500;">${(window._sportIcon && window._sportIcon('Tênis')) || '🎾'} Tênis</button>
            <button type="button" class="qc-sport-btn" data-sport="🏓 Tênis de Mesa" onclick="window._qcSelectSport(this)" style="padding:8px 14px;border-radius:10px;font-size:0.85rem;cursor:pointer;transition:all 0.15s;border:2px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.06);color:var(--text-main);font-weight:500;">${(window._sportIcon && window._sportIcon('Tênis de Mesa')) || '🏓'} Tênis de Mesa</button>
            <button type="button" class="qc-sport-btn" data-sport="🏸 Padel" onclick="window._qcSelectSport(this)" style="padding:8px 14px;border-radius:10px;font-size:0.85rem;cursor:pointer;transition:all 0.15s;border:2px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.06);color:var(--text-main);font-weight:500;">${(window._sportIcon && window._sportIcon('Padel')) || '🏸'} Padel</button>
            <button type="button" class="qc-sport-btn" data-sport="🏐 Vôlei de Praia" onclick="window._qcSelectSport(this)" style="padding:8px 14px;border-radius:10px;font-size:0.85rem;cursor:pointer;transition:all 0.15s;border:2px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.06);color:var(--text-main);font-weight:500;">${(window._sportIcon && window._sportIcon('Vôlei de Praia')) || '🏐'} Vôlei de Praia</button>
            <button type="button" class="qc-sport-btn" data-sport="⚽ Futevôlei" onclick="window._qcSelectSport(this)" style="padding:8px 14px;border-radius:10px;font-size:0.85rem;cursor:pointer;transition:all 0.15s;border:2px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.06);color:var(--text-main);font-weight:500;">${(window._sportIcon && window._sportIcon('Futevôlei')) || '⚽'} Futevôlei</button>
          </div>
          <select class="form-control" id="quick-create-sport" style="display:none;">
            <option>🎾 Beach Tennis</option>
            <option>🥒 Pickleball</option>
            <option>🎾 Tênis</option>
            <option>🏓 Tênis de Mesa</option>
            <option>🏸 Padel</option>
            <option>🏐 Vôlei de Praia</option>
            <option>⚽ Futevôlei</option>
          </select>
        </div>
        <div id="qc-template-area" style="margin-bottom:10px;display:none;"></div>
        <div style="display:flex; flex-direction:column; gap:10px;">
          <button class="btn btn-primary btn-block" id="btn-quick-create">
            🏆 ${(window._t || function(k){return k;})('quickCreate.create')}
          </button>
          <button class="btn btn-tool-amber btn-block" id="btn-quick-template">
            💾 Usar Template
          </button>
          <button class="btn btn-secondary btn-block" id="btn-quick-advanced">
            ⚙️ ${(window._t || function(k){return k;})('quickCreate.advanced')}
          </button>
          <button class="btn btn-secondary btn-block" onclick="if(typeof closeModal==='function')closeModal('modal-quick-create');">
            ${(window._t || function(k){return k;})('btn.cancel')}
          </button>
        </div>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);

  // Quick Create sport button selection
  window._qcSelectSport = function(btn) {
    var btns = document.querySelectorAll('#qc-sport-buttons .qc-sport-btn');
    btns.forEach(function(b) {
      b.classList.remove('qc-sport-active');
      b.style.border = '2px solid rgba(255,255,255,0.18)';
      b.style.background = 'rgba(255,255,255,0.06)';
      b.style.color = 'var(--text-main)';
    });
    btn.classList.add('qc-sport-active');
    btn.style.border = '2px solid #fbbf24';
    btn.style.background = 'rgba(251,191,36,0.15)';
    btn.style.color = '#fbbf24';
    // Sync hidden select
    var sel = document.getElementById('quick-create-sport');
    if (sel) {
      var val = btn.getAttribute('data-sport');
      for (var i = 0; i < sel.options.length; i++) {
        if (sel.options[i].text === val) { sel.selectedIndex = i; break; }
      }
    }
  };

  // Criar Torneio (rápido com auto-nome)
  document.getElementById('btn-quick-create').addEventListener('click', function () {
    const sportRaw = document.getElementById('quick-create-sport').value || '';
    const sportClean = sportRaw.replace(/^[^\w\u00C0-\u024F]+/u, '').trim() || 'Esportes';
    const userName = (window.AppStore.currentUser && window.AppStore.currentUser.displayName)
      ? window.AppStore.currentUser.displayName : 'Organizador';
    let autoName = 'Torneio Eliminatórias de ' + sportClean + ' de ' + userName;

    // Impede nome duplicado — adiciona sufixo numérico se necessário
    let suffix = 1;
    while (window.AppStore.tournaments.some(function(t) { return t.name && t.name.trim().toLowerCase() === autoName.toLowerCase(); })) {
      suffix++;
      autoName = 'Torneio Eliminatórias de ' + sportClean + ' de ' + userName + ' (' + suffix + ')';
    }

    // Determine team size from sport defaults
    const _qcSportTeamDefaults = {
      'Beach Tennis': 2, 'Pickleball': 2, 'Tênis': 1, 'Tênis de Mesa': 1, 'Padel': 2
    };
    const qcTeamSize = _qcSportTeamDefaults[sportClean] || 1;

    // Honor _venuePrefill left by #venues "Criar torneio aqui" — turns the
    // discover → create loop into one click.
    var _venuePref = null;
    try {
      var _raw = sessionStorage.getItem('_venuePrefill');
      if (_raw) { _venuePref = JSON.parse(_raw); sessionStorage.removeItem('_venuePrefill'); }
    } catch (e) {}

    const tourData = {
      id: 'tour_' + Date.now(),
      name: autoName,
      sport: sportRaw,
      format: 'Eliminatórias Simples',
      venue: (_venuePref && _venuePref.venueName) || '',
      venuePlaceId: (_venuePref && _venuePref.placeId) || '',
      venueLat: (_venuePref && _venuePref.lat) || null,
      venueLon: (_venuePref && _venuePref.lon) || null,
      isPublic: true,
      enrollmentMode: 'individual',
      teamSize: qcTeamSize,
      gameTypes: qcTeamSize > 1 ? 'duplas' : 'simples',
      thirdPlace: true,
      elimThirdPlace: true,
      status: 'open',
      createdAt: new Date().toISOString(),
      organizerId: window.AppStore.currentUser ? window.AppStore.currentUser.uid : 'local',
      organizerName: window.AppStore.currentUser ? window.AppStore.currentUser.displayName : 'Organizador',
      organizerEmail: window.AppStore.currentUser ? window.AppStore.currentUser.email : 'visitante@local',
      creatorEmail: window.AppStore.currentUser ? window.AppStore.currentUser.email : 'visitante@local',
      creatorUid: window.AppStore.currentUser ? window.AppStore.currentUser.uid : '',
      coHosts: [],
      participants: [],
      matches: [],
      tiebreakers: ['confronto_direto', 'saldo_pontos', 'vitorias', 'buchholz', 'sonneborn_berger', 'sorteio'],
      scoring: (window._sportScoringDefaults && window._sportScoringDefaults[sportClean])
        ? Object.assign({}, window._sportScoringDefaults[sportClean])
        : { type: 'simple', setsToWin: 1, gamesPerSet: 1, tiebreakEnabled: false, tiebreakPoints: 7, tiebreakMargin: 2, superTiebreak: false, superTiebreakPoints: 10, countingType: 'numeric', advantageRule: false }
    };

    window.AppStore.addTournament(tourData);
    if (typeof closeModal === 'function') closeModal('modal-quick-create');
    // Flag to auto-scroll to Edit button and show hint on tournament detail page
    try { sessionStorage.setItem('scoreplace_scroll_to_edit', '1'); } catch (e) {}
    window.location.hash = '#tournaments/' + tourData.id;
    if (typeof showNotification === 'function') {
      showNotification(window._t ? window._t('quickCreate.created') : 'Torneio Criado!', autoName, 'success');
    }
  });

  // Detalhes Avançados — abre formulário completo com sport pré-selecionado
  document.getElementById('btn-quick-advanced').addEventListener('click', function () {
    var _t = window._t || function(k) { return k; };
    const sportVal = document.getElementById('quick-create-sport').value;
    if (typeof closeModal === 'function') closeModal('modal-quick-create');

    // Reset formulário completo
    const form = document.getElementById('form-create-tournament');
    if (form) form.reset();
    // v2.1.33: datas/horários sempre em branco num torneio novo (sem sugestão).
    if (typeof window._blankTournamentDates === 'function') window._blankTournamentDates();
    const editId = document.getElementById('edit-tournament-id');
    if (editId) editId.value = '';
    const title = document.getElementById('create-modal-title');
    if (title) title.innerText = _t('create.newTournament');
    const pub = document.getElementById('tourn-public');
    if (pub) pub.checked = true;
    const liga = document.getElementById('liga-open-enrollment');
    if (liga) liga.checked = true;
    // elimThirdPlace is always true — no toggle needed
    // v4.4.x (Camada 2): construtor de fases 2+ removido. Torneio novo começa limpo — o
    // configurador único (format2) monta com o default do esporte no _f2MountInEditForm.
    window._phase1Name = '';
    window._f2PendingTemplateCfg = null;

    // Pré-selecionar sport
    const sportSelect = document.getElementById('select-sport');
    if (sportSelect) {
      const opt = Array.from(sportSelect.options).find(o => o.value === sportVal || o.text === sportVal);
      if (opt) sportSelect.value = opt.value;
      if (typeof window._onSportChange === 'function') window._onSportChange();
    }

    // Reset format/draw-mode button visuals to match reset hidden selects
    // (form.reset() resets <select> values but not inline-styled button states)
    const fmtSel = document.getElementById('select-formato');
    if (fmtSel) fmtSel.value = 'elim_simples';
    const defaultFmtBtn = document.querySelector('#formato-buttons .formato-btn[data-value="elim_simples"]');
    if (defaultFmtBtn && typeof window._selectFormato === 'function') window._selectFormato(defaultFmtBtn);
    const drawModeHidden = document.getElementById('draw-mode');
    if (drawModeHidden) drawModeHidden.value = 'sorteio';
    const defaultDrawBtn = document.querySelector('#draw-mode-buttons .draw-mode-btn[data-value="sorteio"]');
    if (defaultDrawBtn && typeof window._selectDrawMode === 'function') window._selectDrawMode(defaultDrawBtn);

    // v1.2.1-beta: reset category pill visuals (gênero, idade, habilidade).
    // form.reset() limpa hidden inputs mas não os data-active dos botões.
    if (typeof window._applyGenderCatUI === 'function') window._applyGenderCatUI([]);
    if (typeof window._applyAgeCatUI === 'function') window._applyAgeCatUI([]);
    if (typeof window._loadSkillCategoriesFromArray === 'function') window._loadSkillCategoriesFromArray([]);
    // v1.4.19-beta: guard — form elements are destroyed after each navigation
    // away from #novo-torneio (viewContainer.innerHTML=''). Without the check,
    // both functions throw TypeError (null.value) and abort the handler before
    // _navigateToCreateTournament() is reached, stranding the user on #dashboard.
    if (document.getElementById('tourn-gender-categories') && typeof window._updateCategoryPreview === 'function') window._updateCategoryPreview();

    if (document.getElementById('select-formato') && typeof window._onFormatoChange === 'function') window._onFormatoChange();
    // If a venue prefill arrived from #venues "Criar torneio aqui", populate
    // the venue fields before we open the modal so the user sees it ready.
    var _advVenuePref = null;
    try {
      var _advRaw = sessionStorage.getItem('_venuePrefill');
      if (_advRaw) { _advVenuePref = JSON.parse(_advRaw); sessionStorage.removeItem('_venuePrefill'); }
    } catch (e) {}
    if (_advVenuePref) {
      var _venueInp = document.getElementById('tourn-venue');
      var _latInp = document.getElementById('tourn-venue-lat');
      var _lonInp = document.getElementById('tourn-venue-lon');
      var _pidInp = document.getElementById('tourn-venue-place-id');
      if (_venueInp) _venueInp.value = _advVenuePref.venueName || '';
      if (_latInp)   _latInp.value = _advVenuePref.lat != null ? _advVenuePref.lat : '';
      if (_lonInp)   _lonInp.value = _advVenuePref.lon != null ? _advVenuePref.lon : '';
      if (_pidInp)   _pidInp.value = _advVenuePref.placeId || '';
    }

    // v1.3.13-beta: navega pra rota #novo-torneio. Pre-population (form
    // reset, sport selection, venue prefill) já rolou acima.
    if (typeof window._navigateToCreateTournament === 'function') {
      window._navigateToCreateTournament();
    } else if (typeof openModal === 'function') {
      openModal('modal-create-tournament');
    }
    if (typeof window._refreshTemplateBtn === 'function') window._refreshTemplateBtn();
    // Venue map precisa de extra-init quando há coords do prefill — roda
    // depois que renderCreateTournamentPage moveu o .modal pro container.
    if (_advVenuePref && _advVenuePref.lat != null && _advVenuePref.lon != null) {
      setTimeout(function () {
        if (typeof window._initVenueCreateMap === 'function') {
          window._initVenueCreateMap(parseFloat(_advVenuePref.lat), parseFloat(_advVenuePref.lon), _advVenuePref.venueName || '');
        }
      }, 150);
    }
  });

  // ─── Template Integration ────────────────────────────────────────────────
  // "Usar Template" button handler (always visible, loads on demand)
  document.getElementById('btn-quick-template').addEventListener('click', function() {
    var area = document.getElementById('qc-template-area');
    if (!area) return;
    var templates = typeof window._getTemplates === 'function' ? window._getTemplates() : [];
    var _t = window._t || function(k) { return k; };
    if (templates.length === 0) {
      area.style.display = 'block';
      area.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;text-align:center;">Nenhum template salvo. Salve um a partir de um torneio existente (Ferramentas do Organizador → Salvar como Template).</p>';
      return;
    }
    var html = '<div style="max-height:200px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;">';
    templates.forEach(function(tpl, i) {
      var sportIcon = tpl.sport ? tpl.sport.split(' ')[0] : '🏆';
      html += '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:10px;cursor:pointer;" ' +
        'onclick="window._qcApplyTemplate(' + i + ')">' +
        '<span style="font-size:1.2rem;">' + sportIcon + '</span>' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-weight:600;font-size:0.85rem;color:var(--text-bright);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + window._safeHtml(tpl.name) + '</div>' +
          '<div style="font-size:0.75rem;color:var(--text-muted);">' + window._safeHtml((window._formatLabel ? window._formatLabel(tpl) : tpl.format) || '') + '</div>' +
        '</div>' +
        '<button class="btn btn-micro btn-danger-ghost" onclick="event.stopPropagation();window._qcDeleteTemplate(\'' + window._safeHtml(tpl._id || String(i)) + '\')" title="Apagar">✕</button>' +
      '</div>';
    });
    html += '</div>';
    area.style.display = 'block';
    area.innerHTML = html;
  });

  window._qcApplyTemplate = function(index) {
    var tpl = typeof window._applyTemplate === 'function' ? window._applyTemplate(index) : null;
    if (!tpl) return;
    if (typeof closeModal === 'function') closeModal('modal-quick-create');
    // Open advanced form and pre-fill
    var form = document.getElementById('form-create-tournament');
    if (form) form.reset();
    var editId = document.getElementById('edit-tournament-id');
    if (editId) editId.value = '';
    var title = document.getElementById('create-modal-title');
    if (title) title.innerText = _t('create.newFromTemplate');
    var pub = document.getElementById('tourn-public');
    if (pub) pub.checked = true;

    // v1.2.1-beta: reset category pill visuals before applying template
    if (typeof window._applyGenderCatUI === 'function') window._applyGenderCatUI([]);
    if (typeof window._applyAgeCatUI === 'function') window._applyAgeCatUI([]);
    if (typeof window._loadSkillCategoriesFromArray === 'function') window._loadSkillCategoriesFromArray([]);

    // Pre-fill from template
    if (typeof window._prefillFromTemplate === 'function') {
      window._prefillFromTemplate(tpl);
    }
    // v1.3.13-beta: navega pra rota #novo-torneio (page-route padronizada).
    if (typeof window._navigateToCreateTournament === 'function') {
      window._navigateToCreateTournament();
    } else if (typeof openModal === 'function') {
      openModal('modal-create-tournament');
    }
    if (typeof window._refreshTemplateBtn === 'function') window._refreshTemplateBtn();
  };

  window._qcDeleteTemplate = async function(templateId) {
    if (typeof window._deleteTemplate === 'function') await window._deleteTemplate(templateId);
    var _t = window._t || function(k) { return k; };
    if (typeof showNotification === 'function') showNotification(_t('template.deleted'), '', 'info');
    // Refresh the list
    document.getElementById('btn-quick-template').click();
  };
})();

// Inicializa estrutura base da UI (Modais, Menus).
// v1.3.28-beta: defensive — se um setup* falhar (ex.: arquivo deferred
// não chegou a parsear por race com SW cache), não derruba o resto.
// Bug reportado: usuário viu `setupCreateTournamentModal` undefined
// → erro fatal no main.js → openModal/_toggleHamburger nunca foram
// expostos → landing CTA + hamburger silenciosamente não funcionavam.
function _safeSetup(name) {
  // v1.6.2-beta: iOS Safari sometimes delivers defer scripts slightly out of
  // order under memory pressure — retry once after 1s before sending to Sentry.
  // Sentry #7473970773 + #7473970768 (setupProfileModal/setupLoginModal, count=3+3).
  setTimeout(function() {
    if (typeof window[name] === 'function') {
      try { window[name](); } catch (e) {
        if (typeof console !== 'undefined') window._warn('[main.js] ' + name + ' retry threw:', e);
      }
    } else {
      if (typeof console !== 'undefined' && window._warn) {
        window._warn('[main.js] ' + name + ' indisponível no boot — UI pode estar parcialmente carregada.');
      }
      if (typeof window._captureMessage === 'function') {
        window._captureMessage('Boot: ' + name + ' undefined', 'warning');
      }
    }
  }, 1000);
}

if (typeof setupUI === 'function') { try { setupUI(); } catch (e) { window._warn('[main.js] setupUI threw:', e); } }

if (typeof setupCreateTournamentModal === 'function') {
  try { setupCreateTournamentModal(); } catch (e) { window._warn('[main.js] setupCreateTournamentModal threw:', e); }
} else { _safeSetup('setupCreateTournamentModal'); }

if (typeof setupLoginModal === 'function') {
  try { setupLoginModal(); } catch (e) { window._warn('[main.js] setupLoginModal threw:', e); }
} else { _safeSetup('setupLoginModal'); }

if (typeof setupProfileModal === 'function') {
  try { setupProfileModal(); } catch (e) { window._warn('[main.js] setupProfileModal threw:', e); }
} else { _safeSetup('setupProfileModal'); }
// v0.16.42: setupResultModal/setupEnrollModal removidos — ambos arquivos eram
// dead code (result-modal deprecated v0.4.0; enroll-modal sem callers reais).

// Dois banners complementares para usuários iOS:
//   1. Chrome/Firefox/Edge iOS → sugere abrir no Safari (install só lá)
//   2. Safari iOS ainda não instalou como PWA → explica o passo a passo
// Ambos dismissable, persistidos em localStorage, não atrapalham quem já
// instalou (detectado via display-mode standalone + navigator.standalone).
//
// v1.3.34-beta: gating por engagement — banner só aparece após 3+ sessões
// (cada sessão = uma visita com cooldown de 30min) E nunca mostra se foi
// dismissed nos últimos 30 dias OU se já foi rejeitado 3x. Pedido do dono:
// "caso o usuário responda que não, não pergunta de novo (ou só pergunta
// de novo caso o usuário use o programa várias vezes)".

// Detecta se o app já está instalado como PWA. Funciona em Android Chrome,
// iOS Safari (navigator.standalone), Edge, Firefox.
window._isInstalledAsPWA = function() {
  try {
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.navigator.standalone === true) return true;
    if (window.matchMedia && window.matchMedia('(display-mode: minimal-ui)').matches) return true;
  } catch (e) {}
  return false;
};

// Gating: incrementa session count com cooldown de 30min, retorna true
// se deve mostrar o banner agora.
window._shouldShowInstallBanner = function(opts) {
  opts = opts || {};
  // App nativo (Capacitor) já é "instalado" — sem banner de instalação.
  if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) return false;
  var minSessions = opts.minSessions || 3;
  var maxDismissals = opts.maxDismissals || 3;
  var cooldownDays = opts.cooldownDays || 30;
  try {
    if (window._isInstalledAsPWA()) return false;
    var now = Date.now();
    var lastSession = parseInt(localStorage.getItem('scoreplace_last_session_ts') || '0', 10) || 0;
    var sessionCount = parseInt(localStorage.getItem('scoreplace_install_sessions') || '0', 10) || 0;
    var dismissCount = parseInt(localStorage.getItem('scoreplace_install_dismissed_count') || '0', 10) || 0;
    var dismissedAt = parseInt(localStorage.getItem('scoreplace_install_dismissed_at') || '0', 10) || 0;
    // Cooldown de 30min entre sessões — avita inflar o contador em F5 ou
    // navegação pra outra rota dentro do mesmo dia.
    if (now - lastSession > 30 * 60 * 1000) {
      sessionCount += 1;
      localStorage.setItem('scoreplace_install_sessions', String(sessionCount));
    }
    localStorage.setItem('scoreplace_last_session_ts', String(now));
    // Já dismissed muitas vezes — desiste
    if (dismissCount >= maxDismissals) return false;
    // Dismissed recentemente — espera passar o cooldown
    if (dismissedAt > 0 && (now - dismissedAt) < cooldownDays * 24 * 60 * 60 * 1000) return false;
    // Sessões insuficientes — usuário ainda novo, não polui
    if (sessionCount < minSessions) return false;
    return true;
  } catch (e) { return false; }
};

// Marca dismiss — incrementa contador e seta timestamp.
window._markInstallBannerDismissed = function() {
  try {
    var dismissCount = parseInt(localStorage.getItem('scoreplace_install_dismissed_count') || '0', 10) || 0;
    localStorage.setItem('scoreplace_install_dismissed_count', String(dismissCount + 1));
    localStorage.setItem('scoreplace_install_dismissed_at', String(Date.now()));
  } catch (e) {}
};

// Marca instalado — nunca pergunta de novo.
window._markInstallBannerInstalled = function() {
  try {
    localStorage.setItem('scoreplace_install_dismissed_count', '999'); // efetivamente nunca mais
    localStorage.setItem('scoreplace_install_completed', '1');
  } catch (e) {}
};

// v1.3.34-beta: Android/Chrome/Edge install via beforeinstallprompt.
// Captura o evento (browser dispara só pra apps que passam o
// installability check do PWA: HTTPS + manifest + service worker + ícones).
// Quando o gating permite, mostra um banner próprio com botão "Instalar"
// que dispara o native install prompt.
window._deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', function(e) {
  // Browser abriria o "mini-info bar" automático no Chrome — preferimos
  // controlar quando mostrar via nosso banner gated. preventDefault
  // suprime o automático.
  e.preventDefault();
  window._deferredInstallPrompt = e;
  // Dispara nosso banner se o gating já permite agora
  if (typeof window._showAndroidInstallBanner === 'function') {
    window._showAndroidInstallBanner();
  }
});

// Quando user instala (via banner ou via mini-info bar nativa), apaga o
// prompt e marca como instalado pra nunca mais perguntar.
window.addEventListener('appinstalled', function() {
  window._deferredInstallPrompt = null;
  window._markInstallBannerInstalled();
  var ban = document.getElementById('scoreplace-android-install-banner');
  if (ban) ban.remove();
  // some o botão proativo de instalar, se estiver na tela
  document.querySelectorAll('[data-install-app-btn]').forEach(function(b){ b.style.display='none'; });
});

// ── v2.3.98: botão PROATIVO de instalar (não-gated) — o usuário toca quando quer,
// sem precisar abrir menu do navegador. Android/desktop com prompt nativo → instala
// em 1 toque. iOS Safari → overlay com instruções (Apple NÃO permite install
// programático). Já instalado → avisa. ─────────────────────────────────────────
window._promptAppInstall = async function () {
  if (window._isInstalledAsPWA && window._isInstalledAsPWA()) {
    if (typeof showNotification === 'function') showNotification('✅ Já está instalado', 'O scoreplace.app já está na sua tela inicial.', 'info');
    return;
  }
  if (window._deferredInstallPrompt) { // Android Chrome/Edge, desktop → install real
    try {
      window._deferredInstallPrompt.prompt();
      var choice = await window._deferredInstallPrompt.userChoice;
      if (choice && choice.outcome === 'accepted' && window._markInstallBannerInstalled) window._markInstallBannerInstalled();
      window._deferredInstallPrompt = null;
      return;
    } catch (e) {}
  }
  window._showInstallInstructions(); // iOS Safari sempre; Android quando o evento não disparou
};

window._showInstallInstructions = function () {
  var ua = navigator.userAgent || '';
  var isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isNonSafariIOS = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  var isAndroid = /Android/.test(ua);
  var title, steps;
  if (isNonSafariIOS) {
    title = '🧭 Abra no Safari para instalar';
    steps = 'No iPhone, instalar como app só funciona pelo <b>Safari</b>. Abra <b>scoreplace.app</b> no Safari e toque em <b>Instalar</b> de novo.';
  } else if (isIOS) {
    title = '📲 Instalar no iPhone (Safari)';
    steps =
      '<b>1.</b> Toque no <b>Compartilhar</b> <span style="display:inline-block;border:1px solid currentColor;border-radius:4px;padding:0 5px;margin:0 2px;vertical-align:middle;">⬆</span> (barra de baixo do Safari; no iOS 17+ pode estar nos <b>•••</b> à direita, ou no <b>"Aa"</b> ao lado do endereço).<br><br>' +
      '<b>2.</b> Role e toque em <b>"Adicionar à Tela de Início"</b>.<br><br>' +
      '<b>3.</b> Toque em <b>Adicionar</b>. O ícone aparece na tela inicial.<br><br>' +
      '<span style="color:#fbbf24;font-size:0.82rem;">💡 Dica: <b>instale primeiro e entre depois</b> — assim você fica logado no app e não precisa entrar de novo. (Não funciona em aba Privada.)</span>';
  } else if (isAndroid) {
    title = '📲 Instalar no Android';
    steps = 'Toque nos <b>três pontinhos ⋮</b> no canto superior direito do Chrome → <b>"Instalar app"</b> (ou <b>"Adicionar à tela inicial"</b>).';
  } else {
    title = '📲 Instalar no computador';
    steps = 'No Chrome/Edge, clique no ícone de <b>instalar</b> (⊕/monitor) na barra de endereço (à direita) → <b>Instalar</b>.';
  }
  var old = document.getElementById('sp-install-overlay'); if (old) old.remove();
  var ov = document.createElement('div');
  ov.id = 'sp-install-overlay';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:10060;display:flex;align-items:center;justify-content:center;padding:16px;';
  ov.innerHTML = '<div style="background:var(--bg-card,#1a2235);color:var(--text-main,#fff);border-radius:16px;padding:22px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.5);box-sizing:border-box;">' +
    '<div style="font-size:1.1rem;font-weight:800;color:#fbbf24;margin-bottom:10px;">' + title + '</div>' +
    '<div style="font-size:0.9rem;line-height:1.6;">' + steps + '</div>' +
    '<button class="btn btn-primary" style="margin-top:16px;width:100%;" onclick="var o=document.getElementById(\'sp-install-overlay\');if(o)o.remove();">Entendi</button>' +
    '</div>';
  ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
};

// HTML de um botão de instalar (vazio se já instalado). opts.style / opts.label.
// opts.iosOnly: só renderiza no iPhone/iPad (onde o "Entrar" NÃO consegue instalar
// — Apple. No Android/desktop o próprio "Entrar" instala via _enterApp).
window._installButtonHtml = function (opts) {
  opts = opts || {};
  // App nativo (Capacitor) já é "instalado" — nada de CTA "Instalar app".
  if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) return '';
  if (window._isInstalledAsPWA && window._isInstalledAsPWA()) return '';
  if (opts.iosOnly) {
    var _ua = navigator.userAgent || '';
    var _isIOS = /iPhone|iPad|iPod/.test(_ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!_isIOS) return '';
  }
  var style = opts.style || '';
  var cls = opts.cls || '';
  var label = opts.label || '📲 Instalar na tela inicial';
  return '<button type="button" data-install-app-btn class="' + cls + '" onclick="window._promptAppInstall()" style="' + style + '">' + label + '</button>';
};

// v2.3.99: "Entrar" que JÁ INSTALA antes de logar quando há prompt nativo
// (Android Chrome/Edge, desktop) — "instala e já entra". No iOS Safari (sem prompt
// nativo) só abre o login; o botão separado de instalar continua na tela.
window._enterApp = async function () {
  try {
    if (window._deferredInstallPrompt && !(window._isInstalledAsPWA && window._isInstalledAsPWA())) {
      window._deferredInstallPrompt.prompt();
      try { await window._deferredInstallPrompt.userChoice; } catch (e) {}
      if (window._markInstallBannerInstalled) window._markInstallBannerInstalled();
      window._deferredInstallPrompt = null;
    }
  } catch (e) {}
  // Entra (login)
  if (typeof window.openModal === 'function') window.openModal('modal-login');
  else if (typeof window.handleGoogleLogin === 'function') window.handleGoogleLogin();
};

window._showAndroidInstallBanner = function() {
  try {
    if (!window._deferredInstallPrompt) return;
    if (!window._shouldShowInstallBanner({ minSessions: 3, maxDismissals: 3, cooldownDays: 30 })) return;
    if (document.getElementById('scoreplace-android-install-banner')) return; // já visível
    var banner = document.createElement('div');
    banner.id = 'scoreplace-android-install-banner';
    banner.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:10050;background:linear-gradient(135deg,#1e293b,#0f172a);border:1px solid rgba(251,191,36,0.35);border-radius:14px;padding:12px 14px;color:#fff;box-shadow:0 10px 30px rgba(0,0,0,0.5);font-size:0.82rem;';
    banner.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;">' +
        '<div style="flex-shrink:0;font-size:1.5rem;line-height:1;">📲</div>' +
        '<div style="flex:1;min-width:0;line-height:1.35;">' +
          '<div style="font-weight:700;color:#fbbf24;margin-bottom:2px;">Adicionar à tela de início?</div>' +
          '<div style="color:var(--text-main, #cbd5e1);font-size:0.76rem;">Abre em tela cheia, sem barra de endereço. Recebe notificações e funciona offline.</div>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0;">' +
          '<button id="scoreplace-android-install-yes" style="padding:7px 14px;border-radius:8px;font-size:0.78rem;font-weight:700;cursor:pointer;background:#fbbf24;color:#0f172a;border:none;white-space:nowrap;">📲 Instalar</button>' +
          '<button id="scoreplace-android-install-no" style="padding:5px 8px;border-radius:6px;font-size:0.7rem;font-weight:500;cursor:pointer;background:transparent;color:var(--text-muted,#94a3b8);border:none;white-space:nowrap;">Agora não</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(banner);
    document.getElementById('scoreplace-android-install-yes').addEventListener('click', async function() {
      try {
        if (!window._deferredInstallPrompt) { banner.remove(); return; }
        window._deferredInstallPrompt.prompt();
        var choice = await window._deferredInstallPrompt.userChoice;
        if (choice && choice.outcome === 'accepted') {
          window._markInstallBannerInstalled();
        } else {
          window._markInstallBannerDismissed();
        }
        window._deferredInstallPrompt = null;
      } catch (e) {}
      banner.remove();
    });
    document.getElementById('scoreplace-android-install-no').addEventListener('click', function() {
      window._markInstallBannerDismissed();
      banner.remove();
    });
  } catch (e) {}
};

(function iosInstallHints() {
  try {
    var ua = navigator.userAgent || '';
    var isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    if (!isIOS) return;
    // Já instalado como PWA? Não mostra nada.
    if (window._isInstalledAsPWA && window._isInstalledAsPWA()) return;
    // v1.3.34-beta: gating por engagement — só mostra após 3+ sessões e
    // respeita dismissal de 30 dias. Para o banner de Safari (não-Safari
    // continua mostrando sempre — é avisar que precisa trocar de browser
    // pra instalar; user-bloqueante diferente).
    var isNonSafariIOS = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
    var safariCanGate = !isNonSafariIOS;
    if (safariCanGate && window._shouldShowInstallBanner && !window._shouldShowInstallBanner({ minSessions: 3, maxDismissals: 3, cooldownDays: 30 })) return;

    var mkBanner = function(opts) {
      var key = opts.key;
      // v1.3.34-beta: legacy localStorage flag fica como override (já dismissed
      // pré-v1.3.34 nunca mais mostra). Pra novos dismisses usamos
      // _markInstallBannerDismissed que zera após 30d.
      if (opts.legacy && localStorage.getItem(key) === '1') return;
      var banner = document.createElement('div');
      banner.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:10050;background:linear-gradient(135deg,#1e293b,#0f172a);border:1px solid rgba(251,191,36,0.35);border-radius:14px;padding:12px 14px;color:#fff;box-shadow:0 10px 30px rgba(0,0,0,0.5);font-size:0.82rem;';
      banner.innerHTML =
        '<div style="display:flex;align-items:flex-start;gap:10px;">' +
          '<div style="flex-shrink:0;font-size:1.2rem;line-height:1;margin-top:2px;">' + opts.icon + '</div>' +
          '<div style="flex:1;min-width:0;line-height:1.4;">' +
            '<div style="font-weight:700;color:#fbbf24;margin-bottom:2px;">' + opts.title + '</div>' +
            '<div style="color:var(--text-main);font-size:0.76rem;">' + opts.body + '</div>' +
          '</div>' +
          '<button data-dismiss-key="' + key + '" style="flex-shrink:0;background:transparent;border:none;color:var(--text-muted);font-size:1.1rem;cursor:pointer;padding:4px 8px;line-height:1;">✕</button>' +
        '</div>';
      var add = function() {
        document.body.appendChild(banner);
        banner.querySelector('button[data-dismiss-key]').addEventListener('click', function() {
          try { localStorage.setItem(key, '1'); } catch (e) {}
          if (!opts.legacy && window._markInstallBannerDismissed) window._markInstallBannerDismissed();
          banner.remove();
        });
      };
      if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
    };

    if (isNonSafariIOS) {
      // Browser não-Safari no iPhone — instalar PWA e shortcuts só funcionam
      // no Safari por limitação do iOS. Não tem gating — é blocker pra
      // o user instalar, vale informar logo.
      mkBanner({
        key: 'scoreplace_safari_hint_dismissed',
        legacy: true,
        icon: '🧭',
        title: 'Para melhor experiência, use Safari',
        body: 'No iPhone, instalar como app e atalhos de partida só funcionam pelo Safari. Copie o link e abra por lá.'
      });
    } else {
      // Safari iOS sem install — ensina o fluxo (não há API programática
      // de install no iOS; só via Share sheet).
      mkBanner({
        // key bumpada v2 para mostrar o tutorial melhorado mesmo para
        // usuários que tinham dispensado a versão anterior sem conseguir instalar.
        key: 'scoreplace_ios_install_dismissed_v2',
        icon: '📲',
        title: 'Instalar no iPhone',
        body:
          'Abra em tela cheia e ative os atalhos:<br>' +
          '<b>1.</b> Abrir o menu de <b>Compartilhar</b>:<br>' +
          '&nbsp;&nbsp;&nbsp;• Se o Safari mostra o ícone <span style="display:inline-block;border:1px solid currentColor;border-radius:4px;padding:0 4px;margin:0 2px;vertical-align:middle;font-size:0.72rem;">⬆</span> direto na barra de baixo, toque nele.<br>' +
          '&nbsp;&nbsp;&nbsp;• Em <b>iOS 17+</b> (tab bar compacto) o ícone fica escondido: toque nos <b>três pontinhos <span style="display:inline-block;border:1px solid currentColor;border-radius:4px;padding:0 4px;margin:0 2px;vertical-align:middle;font-size:0.72rem;">•••</span></b> no canto direito da barra → depois em <b>"Compartilhar"</b>. Alternativa: toque em <b>"Aa"</b> ao lado da URL → "Compartilhar".<br>' +
          '<b>2.</b> Na lista que abre, <b>role pra baixo</b> até <b>"Adicionar à Tela de Início"</b>. Se não achar, toque em <b>"Editar Ações"</b> no final da lista e ative a opção.<br>' +
          '<b>3.</b> Toque nela, depois em <b>Adicionar</b> no canto superior direito.<br><br>' +
          '<span style="color:var(--text-muted);">⚠️ Não funciona em <b>Navegação Privativa</b> — precisa ser aba normal. Requer iOS 13+.</span>'
      });
    }
  } catch (e) {}
})();

// Tema aplicado automaticamente via IIFE em store.js (initThemeSystem removido — função não existia)

// Load cached tournaments for instant first-paint (before Firebase auth resolves)
if (window.AppStore && window.AppStore._loadFromCache) {
  window.AppStore._loadFromCache();
}

// Inicia o Roteador SPA
// Firebase onAuthStateChanged will handle auto-login and real-time data from Firestore
initRouter();

window._log("scoreplace.app v" + (window.SCOREPLACE_VERSION || '?') + " Inicializado com Sucesso");

// === Offline/Online indicator ===
(function() {
  var banner = document.createElement('div');
  banner.id = 'offline-banner';
  banner.style.cssText = 'display:none;position:fixed;bottom:0;left:0;right:0;z-index:99999;padding:10px 16px;text-align:center;font-size:0.85rem;font-weight:600;transition:transform 0.3s ease;';
  banner.innerHTML = '<span id="offline-banner-text"></span>';
  document.body.appendChild(banner);

  function showBanner(text, bg, color, autoHide) {
    var b = document.getElementById('offline-banner');
    var t = document.getElementById('offline-banner-text');
    if (!b || !t) return;
    t.textContent = text;
    b.style.background = bg;
    b.style.color = color;
    b.style.display = 'block';
    b.style.transform = 'translateY(0)';
    if (autoHide) {
      setTimeout(function() {
        b.style.transform = 'translateY(100%)';
        setTimeout(function() { b.style.display = 'none'; }, 350);
      }, 3000);
    }
  }

  window.addEventListener('offline', function() {
    showBanner('Sem conexão — modo offline', 'rgba(239,68,68,0.95)', '#fff', false);
  });
  window.addEventListener('online', function() {
    showBanner('Conexão restaurada', 'rgba(16,185,129,0.95)', '#fff', true);
  });

  // Show immediately if already offline
  if (!navigator.onLine) {
    showBanner('Sem conexão — modo offline', 'rgba(239,68,68,0.95)', '#fff', false);
  }
})();

// === Liga auto-draw poller ===
// Ticks every minute. Only fires draws on the organizer's browser for Liga
// tournaments with drawManual=off and drawFirstDate set.
(function() {
  function tick() {
    if (typeof window._checkLigaAutoDraws !== 'function') return;
    try {
      var p = window._checkLigaAutoDraws();
      if (p && typeof p.catch === 'function') {
        p.catch(function(e) { window._warn('[auto-draw poller]', e); });
      }
    } catch (e) {
      window._warn('[auto-draw poller]', e);
    }
  }
  // Run shortly after load (once the store and user are ready)
  setTimeout(tick, 8000);
  // Re-run every 60 seconds
  setInterval(tick, 60000);
})();

// === Quick Search (Ctrl+K / Cmd+K) ===
(function() {
  // Create search overlay
  var overlay = document.createElement('div');
  overlay.id = 'quick-search-overlay';
  overlay.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);z-index:99998;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);';
  overlay.onclick = function(e) { if (e.target === overlay) window._closeQuickSearch(); };

  var modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;top:15%;left:50%;transform:translateX(-50%);width:90%;max-width:540px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:16px;box-shadow:0 25px 60px rgba(0,0,0,0.5);z-index:99999;overflow:hidden;';

  modal.innerHTML =
    '<div style="padding:16px 20px;border-bottom:1px solid var(--border-color);display:flex;align-items:center;gap:10px;">' +
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
    '<input type="text" id="quick-search-input" placeholder="Buscar torneios, jogadores..." style="flex:1;background:transparent;border:none;color:var(--text-bright);font-size:1.05rem;outline:none;" autocomplete="off">' +
    '<kbd style="font-size:0.65rem;color:var(--text-muted);background:rgba(255,255,255,0.06);padding:3px 8px;border-radius:4px;border:1px solid rgba(255,255,255,0.1);">ESC</kbd>' +
    '</div>' +
    '<div id="quick-search-results" style="max-height:360px;overflow-y:auto;padding:8px;"></div>';

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  window._openQuickSearch = function() {
    overlay.style.display = 'block';
    var input = document.getElementById('quick-search-input');
    if (input) { input.value = ''; input.focus(); }
    _showQuickSearchDefaults();
  };

  window._closeQuickSearch = function() {
    overlay.style.display = 'none';
  };

  function _showQuickSearchDefaults() {
    var resultsDiv = document.getElementById('quick-search-results');
    if (!resultsDiv) return;
    var html = '<div style="padding:8px 12px;font-size:0.7rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">Ações rápidas</div>';
    var actions = [
      { icon: '➕', label: 'Novo Torneio', action: "if(typeof openModal==='function')openModal('modal-quick-create');window._closeQuickSearch();" },
      { icon: '🏠', label: 'Dashboard', action: "window.location.hash='#dashboard';window._closeQuickSearch();" },
      { icon: '🔍', label: 'Explorar Comunidade', action: "window.location.hash='#explore';window._closeQuickSearch();" },
      { icon: '🔔', label: 'Notificações', action: "window.location.hash='#notifications';window._closeQuickSearch();" },
      { icon: '❓', label: 'Ajuda / Manual', action: "window.location.hash='#help';window._closeQuickSearch();" }
    ];
    actions.forEach(function(a) {
      html += '<div onclick="' + a.action + '" style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:10px;cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background=\'rgba(255,255,255,0.06)\'" onmouseout="this.style.background=\'transparent\'">' +
        '<span style="font-size:1.1rem;">' + a.icon + '</span>' +
        '<span style="font-size:0.9rem;color:var(--text-bright);">' + a.label + '</span>' +
        '</div>';
    });
    resultsDiv.innerHTML = html;
  }

  function _performQuickSearch(query) {
    var resultsDiv = document.getElementById('quick-search-results');
    if (!resultsDiv) return;
    if (!query || query.length < 2) { _showQuickSearchDefaults(); return; }

    var q = query.toLowerCase();
    var _sh = window._safeHtml || function(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');};
    var html = '';

    // Torneios: scoped (tournaments) UNIÃO discovery (publicDiscovery).
    // Antes só pesquisava o scoped list — missava qualquer torneio público
    // que o usuário ainda não tivesse entrado, deixando a busca rápida com
    // cobertura incompleta.
    var scoped = (window.AppStore && window.AppStore.tournaments) ? window.AppStore.tournaments : [];
    var discovery = (window.AppStore && Array.isArray(window.AppStore.publicDiscovery)) ? window.AppStore.publicDiscovery : [];
    var allTournaments = scoped.slice();
    var seenIds = {};
    scoped.forEach(function(t) { if (t && t.id) seenIds[String(t.id)] = true; });
    discovery.forEach(function(t) {
      if (t && t.id && !seenIds[String(t.id)]) { allTournaments.push(t); seenIds[String(t.id)] = true; }
    });

    var matchedTournaments = allTournaments.filter(function(t) {
      return (t.name && t.name.toLowerCase().indexOf(q) !== -1) ||
             (t.sport && t.sport.toLowerCase().indexOf(q) !== -1) ||
             (t.venueName && t.venueName.toLowerCase().indexOf(q) !== -1) ||
             (t.venue && t.venue.toLowerCase && t.venue.toLowerCase().indexOf(q) !== -1) ||
             (t.format && t.format.toLowerCase().indexOf(q) !== -1);
    }).slice(0, 6);

    if (matchedTournaments.length > 0) {
      html += '<div style="padding:8px 12px;font-size:0.7rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">Torneios</div>';
      matchedTournaments.forEach(function(t) {
        var status = t.status === 'finished' ? '🏆 Encerrado' : (t.status === 'active' ? '▶ Ativo' : '📋 Aberto');
        var _safeId = String(t.id || '').replace(/'/g, "\\'").replace(/\\/g, "\\\\");
        html += '<div onclick="window.location.hash=\'#tournaments/' + _safeId + '\';window._closeQuickSearch();" style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:10px;cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background=\'rgba(255,255,255,0.06)\'" onmouseout="this.style.background=\'transparent\'">' +
          '<span style="font-size:1.1rem;">🏅</span>' +
          '<div style="flex:1;overflow:hidden;">' +
          '<div style="font-size:0.88rem;font-weight:600;color:var(--text-bright);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + _sh(t.name) + '</div>' +
          '<div style="font-size:0.7rem;color:var(--text-muted);">' + _sh((window._formatLabel ? window._formatLabel(t) : t.format) || '') + ' — ' + _sh(t.sport || '') + '</div>' +
          '</div>' +
          '<span style="font-size:0.65rem;color:var(--text-muted);">' + status + '</span>' +
          '</div>';
      });
    }

    // Locais: busca no cache AppStore.tournaments pelos venues únicos dos
    // torneios (não temos cache global de venues client-side; fazer call
    // a VenueDB.listVenues debounced aqui custaria quota pra cada
    // keystroke). O cache atual já cobre os venues relevantes pro usuário
    // — dashboard/torneios recentes. Deep-link pra #venues/<placeId>.
    var venueMap = {};
    allTournaments.forEach(function(t) {
      if (!t || !t.venuePlaceId) return;
      var key = String(t.venuePlaceId);
      if (venueMap[key]) return;
      var vname = t.venue || t.venueName || '';
      var vaddr = t.venueAddress || '';
      if ((vname && vname.toLowerCase().indexOf(q) !== -1) ||
          (vaddr && vaddr.toLowerCase().indexOf(q) !== -1)) {
        venueMap[key] = { placeId: key, name: vname, address: vaddr };
      }
    });
    var venueMatches = Object.keys(venueMap).map(function(k) { return venueMap[k]; }).slice(0, 5);
    if (venueMatches.length > 0) {
      html += '<div style="padding:8px 12px;font-size:0.7rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;">Locais</div>';
      venueMatches.forEach(function(v) {
        var _safePid = String(v.placeId || '').replace(/'/g, "\\'").replace(/\\/g, "\\\\");
        html += '<div onclick="window.location.hash=\'#venues/' + _safePid + '\';window._closeQuickSearch();" style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:10px;cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background=\'rgba(255,255,255,0.06)\'" onmouseout="this.style.background=\'transparent\'">' +
          '<span style="font-size:1.1rem;">🏢</span>' +
          '<div style="flex:1;overflow:hidden;">' +
          '<div style="font-size:0.88rem;font-weight:600;color:var(--text-bright);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + _sh(v.name) + '</div>' +
          (v.address ? '<div style="font-size:0.7rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + _sh(v.address) + '</div>' : '') +
          '</div>' +
          '</div>';
      });
    }

    // Use allTournaments (scoped + discovery) pra busca de jogadores também,
    // assim nomes em torneios públicos aparecem mesmo sem o usuário ter entrado.
    var tournaments = allTournaments;

    // Search players across tournaments
    var playerSet = {};
    tournaments.forEach(function(t) {
      if (!t.participants) return;
      var arr = Array.isArray(t.participants) ? t.participants : Object.values(t.participants);
      arr.forEach(function(p) {
        var name = typeof p === 'string' ? p : (p.displayName || p.name || '');
        if (name && name.toLowerCase().indexOf(q) !== -1 && !name.includes('BYE')) {
          if (!playerSet[name]) playerSet[name] = [];
          playerSet[name].push(t.name);
        }
      });
    });

    var playerNames = Object.keys(playerSet).slice(0, 5);
    if (playerNames.length > 0) {
      html += '<div style="padding:8px 12px;font-size:0.7rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;">Jogadores</div>';
      playerNames.forEach(function(name) {
        var tourneys = playerSet[name].slice(0, 2).join(', ');
        html += '<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:10px;cursor:default;">' +
          '<span style="font-size:1.1rem;">👤</span>' +
          '<div style="flex:1;overflow:hidden;">' +
          '<div style="font-size:0.88rem;font-weight:600;color:var(--text-bright);">' + (window._safeHtml ? window._safeHtml(name) : name) + '</div>' +
          '<div style="font-size:0.7rem;color:var(--text-muted);">' + tourneys + '</div>' +
          '</div></div>';
      });
    }

    if (!html) {
      html = '<div style="padding:2rem;text-align:center;color:var(--text-muted);font-size:0.85rem;">Nenhum resultado para "' + (window._safeHtml ? window._safeHtml(query) : query) + '"</div>';
    }
    resultsDiv.innerHTML = html;
  }

  // Input handler with debounce
  var _searchTimeout = null;
  document.getElementById('quick-search-input').addEventListener('input', function() {
    var val = this.value.trim();
    clearTimeout(_searchTimeout);
    _searchTimeout = setTimeout(function() { _performQuickSearch(val); }, 150);
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', function(e) {
    // Ctrl+K or Cmd+K to open
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      if (overlay.style.display === 'none') window._openQuickSearch();
      else window._closeQuickSearch();
    }
    // ESC to close
    if (e.key === 'Escape' && overlay.style.display !== 'none') {
      window._closeQuickSearch();
    }
  });
})();

// === Global Keyboard Shortcuts ===
(function setupGlobalShortcuts() {
  document.addEventListener('keydown', function(e) {
    // Skip if typing in an input, textarea, select, or contentEditable
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
    // Skip if any modifier key is held (except for specific combos)
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // Skip if a modal is open
    if (document.getElementById('qr-modal-overlay') || document.getElementById('player-stats-overlay')) return;
    var quickSearchOverlay = document.getElementById('quick-search-overlay');
    if (quickSearchOverlay && quickSearchOverlay.style.display !== 'none') return;

    switch (e.key.toLowerCase()) {
      case 'd':
        e.preventDefault();
        window.location.hash = '#dashboard';
        break;
      case 'e':
        e.preventDefault();
        window.location.hash = '#tournaments';
        break;
      case 'n':
        e.preventDefault();
        if (typeof window.quickCreate === 'function') window.quickCreate();
        else window.location.hash = '#create';
        break;
      case '?':
        e.preventDefault();
        // v1.3.11-beta: ajuda agora é page-route — atalho '?' navega pra hash.
        window.location.hash = '#help';
        break;
      case '/':
        // Focus quick search
        e.preventDefault();
        if (typeof window._openQuickSearch === 'function') window._openQuickSearch();
        break;
    }
  });

  // Show keyboard shortcuts hint in help modal
  window._keyboardShortcutsHtml = '<div style="margin-top:1rem;padding:12px;background:rgba(255,255,255,0.05);border-radius:10px;">' +
    '<div style="font-weight:700;font-size:0.85rem;color:var(--text-bright);margin-bottom:8px;">⌨️ Atalhos de Teclado</div>' +
    '<div style="display:grid;grid-template-columns:60px 1fr;gap:4px 12px;font-size:0.78rem;">' +
    '<kbd style="background:rgba(255,255,255,0.1);padding:2px 6px;border-radius:4px;text-align:center;font-family:monospace;color:var(--text-bright);">Ctrl+K</kbd><span style="color:var(--text-muted);">Busca rápida</span>' +
    '<kbd style="background:rgba(255,255,255,0.1);padding:2px 6px;border-radius:4px;text-align:center;font-family:monospace;color:var(--text-bright);">/</kbd><span style="color:var(--text-muted);">Busca rápida</span>' +
    '<kbd style="background:rgba(255,255,255,0.1);padding:2px 6px;border-radius:4px;text-align:center;font-family:monospace;color:var(--text-bright);">D</kbd><span style="color:var(--text-muted);">Dashboard</span>' +
    '<kbd style="background:rgba(255,255,255,0.1);padding:2px 6px;border-radius:4px;text-align:center;font-family:monospace;color:var(--text-bright);">E</kbd><span style="color:var(--text-muted);">Explorar torneios</span>' +
    '<kbd style="background:rgba(255,255,255,0.1);padding:2px 6px;border-radius:4px;text-align:center;font-family:monospace;color:var(--text-bright);">N</kbd><span style="color:var(--text-muted);">Novo torneio</span>' +
    '<kbd style="background:rgba(255,255,255,0.1);padding:2px 6px;border-radius:4px;text-align:center;font-family:monospace;color:var(--text-bright);">?</kbd><span style="color:var(--text-muted);">Ajuda</span>' +
    '<kbd style="background:rgba(255,255,255,0.1);padding:2px 6px;border-radius:4px;text-align:center;font-family:monospace;color:var(--text-bright);">ESC</kbd><span style="color:var(--text-muted);">Fechar modal</span>' +
    '</div></div>';
})();

// === Accessibility Helpers ===
(function setupA11y() {
  // Focus trap for modals — keeps Tab focus within the modal
  window._trapFocus = function(modalEl) {
    if (!modalEl) return;
    var focusable = modalEl.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusable.length === 0) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    first.focus();
    modalEl._focusTrapHandler = function(e) {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    modalEl.addEventListener('keydown', modalEl._focusTrapHandler);
  };
  window._releaseFocusTrap = function(modalEl) {
    if (modalEl && modalEl._focusTrapHandler) {
      modalEl.removeEventListener('keydown', modalEl._focusTrapHandler);
      delete modalEl._focusTrapHandler;
    }
  };

  // Announce to screen readers via live region
  var liveRegion = document.createElement('div');
  liveRegion.setAttribute('role', 'status');
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.setAttribute('aria-atomic', 'true');
  liveRegion.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;';
  liveRegion.id = 'a11y-announcer';
  document.body.appendChild(liveRegion);

  window._announce = function(message) {
    var el = document.getElementById('a11y-announcer');
    if (el) { el.textContent = ''; setTimeout(function() { el.textContent = message; }, 50); }
  };

  // Enhance existing openModal/closeModal with ARIA + focus trap
  var _origOpenModal = window.openModal;
  if (typeof _origOpenModal === 'function') {
    window.openModal = function(id) {
      _origOpenModal(id);
      var modal = document.getElementById(id);
      if (modal) {
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        window._trapFocus(modal);
        window._announce('Modal aberto');
      }
    };
  }
  var _origCloseModal = window.closeModal;
  if (typeof _origCloseModal === 'function') {
    window.closeModal = function(id) {
      var modal = document.getElementById(id);
      if (modal) window._releaseFocusTrap(modal);
      _origCloseModal(id);
      window._announce('Modal fechado');
    };
  }

  // Add ARIA labels to notification toasts
  var _origNotif = window.showNotification;
  if (typeof _origNotif === 'function') {
    window.showNotification = function(title, msg, type) {
      _origNotif(title, msg, type);
      window._announce(title + ': ' + msg);
    };
  }
})();
