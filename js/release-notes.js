// scoreplace.app — Release notes (lazy-loaded)
// Loaded on demand when the user opens "Notas de versões" in help modal.
//
// Convenção de versão (a partir de 30 Abr 2026): MAJOR.MINOR.PATCH-channel.
// Em beta, PATCH incrementa a cada release (1.0.3-beta → 1.0.4-beta).
// Histórico completo da fase alpha → beta exportado pra
// docs/scoreplace_relatorio_alpha_to_beta.docx (registro local do dono).

window._RELEASE_NOTES_HTML = (function () {
  var html =
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.3.45-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Folga em torneio de Pontos Avançados (PA) usa a média de PA.</b> Quando o torneio rankeia por Pontos Avançados, quem folga uma rodada agora recebe a <b>média dos PA</b> que fez nas rodadas jogadas — e o card de folga mostra esse valor em PA (antes mostrava a média dos pontos simples 3/1/0, ex.: "+3 pts").</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.3.44-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Dicas não atrapalham mais quem já sabe usar.</b> Qualquer scroll, clique ou digitação agora <b>suspende as dicas por 3 minutos</b> — e interrompe na hora a dica que estiver na tela. As dicas servem pra ajudar quem está aprendendo, não pra incomodar quem já domina o app.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.3.43-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Folga não aparece mais como "próximo jogo".</b> Em Ligas Rei/Rainha, quando você descansa uma rodada (folga), o card de "Meus Resultados" mostrava um jogo contra "Folga". Agora rodadas de folga são ignoradas nos próximos jogos da tela inicial.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.3.42-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Fim do "SEMIFINAL" na Liga.</b> Os cards de "Meus Resultados" na tela inicial mostravam fases de eliminatória (Final, Semifinal, Quartas) até em torneios de Liga e Rei/Rainha. Agora cada jogo mostra o rótulo certo — "Rodada N" ou o grupo do Rei/Rainha (ex.: "R1 Grupo F • Jogo 1") — e a cor da barra deixou de pintar Liga de ouro como se fosse uma final.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.3.41-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Dicas guiadas em mais telas.</b> As dicas no estilo spotlight agora cobrem também: os botões da tela inicial (Place, Pessoas, Ler QR, Convidar) e, dentro de cada uma, os controles principais — buscar pessoas/locais, filtros, mapa, marcar presença, convites de amizade, copiar/compartilhar o QR de convite. (Torneios ficam pra depois.)</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.3.40-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Perfil mais claro.</b> A 1ª dica do perfil agora mostra o botão Salvar (pra gravar o que você mudar). E o campo do nome virou <b>"Nome de Exibição (que os outros usuários verão)"</b>.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.3.39-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Dica do menu só na tela inicial.</b> A dica de abrir o menu (☰) e as dicas dos itens do menu agora só aparecem na Dashboard — nunca no perfil ou em outra página. Já dentro do perfil, o foco são as dicas de preencher o perfil.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.3.38-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Sair da conta agora é um botão separado.</b> O botão de perfil (avatar + nome) e o de sair ficaram separados na barra do topo — evita sair sem querer. A dica do perfil também passou a destacar só o perfil, sem englobar o "sair".</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.3.37-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Dicas encadeadas.</b> Quando você toca numa dica (no "Próximo" ou no próprio item destacado), a próxima dica aparece em 3 segundos — flui sem precisar esperar.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.3.36-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Dicas voltam pra quem precisa.</b> Se você fica 7+ dias sem abrir o app E ainda está começando (perfil incompleto, sem amigos ou sem torneios/partidas), as dicas reaparecem do zero pra te reorientar. Quem já domina o app (perfil completo + amigos + jogos) não é incomodado.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.3.35-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Dicas por conta + ordem do menu.</b> O progresso das dicas agora é por conta (uma conta nova recebe as dicas do zero, mesmo no mesmo aparelho). Com o menu aberto, as dicas seguem da direita pra esquerda: Perfil → Ajuda → Tema → Notificações → Início.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.3.34-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Ordem das dicas no 1º acesso.</b> Conta nova abre direto no perfil: lá as dicas dos campos (gênero, cidade, etc.) vêm primeiro; as dicas do menu/hamburger aparecem depois, na tela inicial.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.3.33-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>As dicas do menu esperam você.</b> O app não abre mais o menu sozinho: a dica mostra o ☰ e as dicas dos itens do menu só aparecem depois que VOCÊ abre o hamburger. Escurecimento em 70%.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.3.32-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Dica do menu sempre primeiro.</b> Enquanto você não aprende a abrir o menu (☰), essa dica aparece antes de qualquer outra — inclusive das dicas dentro do perfil.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.3.31-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Dica do Início mais clara.</b> A dica do Início agora avisa que você pode clicar ali a qualquer momento pra voltar à tela inicial.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.3.30-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Contador das dicas no canto superior esquerdo.</b> O contador de tempo das dicas passou pro canto superior esquerdo, sempre.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.3.29-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Dicas mais caprichadas.</b> No celular, a 1ª dica do menu agora ensina a abrir o próprio menu (aponta o ☰). A tela escurece um pouco mais, as dicas entram e saem com fade suave, e o contador subiu de 5s para 8s pra dar mais tempo de ler.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.3.28-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Percentual na barra do torneio.</b> A barra "Torneio completo" agora mostra o % de jogos concluídos, igual às barras das rodadas: "24/120 jogos (20%) · rodada 1 de 5".</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.3.27-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Dica seguida não volta.</b> Se você clica no que a dica aponta (ou preenche o campo), ela é dada como concluída e não reaparece.</li>' +
        '<li><b>Saudação mais pessoal.</b> Na hero box ("Bem-vindo, Nelson!") e no seu nome na barra do topo agora aparece só o primeiro nome — só você vê isso; em todo o resto do app o nome completo continua igual.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.3.26-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Dicas com tempo e contador.</b> A 1ª dica só aparece depois de 10s parado (não pisca mais ao carregar). Cada dica vem com um contador circular (5→1) no canto superior direito. Se você não tocar em "Próximo" durante esses 5s, a dica some — e volta após 15s de inatividade. Enquanto você está jogando/usando, nada interrompe.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.3.24-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Dicas no estilo spotlight.</b> As dicas agora escurecem a tela e destacam exatamente o que olhar, com um texto curtinho. Seguem a sua jornada: primeiro o menu (cada item), depois o perfil se estiver incompleto, e dentro do perfil vão te guiando pelos campos que faltam (gênero, nascimento, cidade, modalidades, locais) e pelas configurações (tamanho, presença, notificações, temas, idioma). Cada dica aparece uma vez — quando você completa o campo, ela some.</li>' +
        '<li><b>Locais de preferência antes de Presença no perfil.</b> Reorganizamos: primeiro você cadastra onde joga, depois configura a presença.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.3.22-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Long-press dos cabeçalhos mais confiável.</b> Segurar o toque num cabeçalho da classificação (no celular) pra ver a explicação da coluna agora tolera o micro-movimento do dedo, não é mais sequestrado pela seleção de texto do iOS e vibra ao abrir.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.3.21-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Classificação interativa.</b> Toque (ou clique) no número de <b>V</b> de um jogador pra ver os confrontos que ele venceu; em <b>D</b>, os que perdeu. <b>%G</b>, <b>Saldo</b> e <b>J</b> abrem a lista de confrontos; <b>PA</b> abre o detalhamento dos pontos.</li>' +
        '<li><b>Explicação das colunas.</b> Passe o mouse (desktop) ou segure o toque (celular) no cabeçalho de qualquer coluna — PA, %G, V, D, Saldo, J — pra ver o que ela significa.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.3.20-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Barra azul (tempo regulamentar) não corre na frente.</b> Mesmo que a rodada termine cedo, a barra azul só chega a 100% na hora estipulada pelo organizador (o próximo sorteio) — ela mede o prazo, não o quanto já jogou.</li>' +
        '<li><b>"Final da rodada" com data e hora.</b> Quando os jogos da rodada terminam, no lugar de "final estimado" aparece <b>"final da rodada"</b> com a data e a hora reais da conclusão.</li>' +
        '<li><b>Barra do torneio: "início" em vez de "1º ponto".</b> Rótulo mais limpo.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.3.19-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Rodadas concluídas mais enxutas (Rei/Rainha).</b> Quando a rodada termina, a <b>classificação geral</b> sobe pra cima dos jogos (não há mais tabelinha de classificação por grupo). Removemos o troféu "🏆 vencedor" embaixo de cada jogo — a tarja verde + o placar em destaque já dizem quem ganhou. Em grupo concluído, o botão "Editar" some e os cards ficam compactos.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.3.18-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Barra de progresso da Liga escopada na rodada.</b> Agora a barra rica mostra a RODADA atual: 🟢 verde = % da rodada concluída (muda de cor pelo ritmo); 🔵 azul = tempo regulamentar (do sorteio desta rodada até o próximo). "Início real" = 1º ponto da rodada; "Final estimado" vira "Final real" quando o último ponto é lançado. "Final programado" virou "Próximo sorteio". Mostra a data quando início e fim caem em dias diferentes.</li>' +
        '<li><b>Barra do torneio com horários.</b> A barra roxa "Torneio completo" agora mostra a data/hora do 1º ponto e o limite para o último ponto do último jogo.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.3.17-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Horários reais das partidas (infra).</b> Cada partida passa a registrar quando começou (1º ponto/abertura do placar ao vivo, ou o lançamento direto) e quando terminou, e a rodada registra sua conclusão. É a base para a próxima versão das barras de progresso da rodada (início real / final real). Sem efeito visível ainda — começa a valer da próxima rodada em diante.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.3.16-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Estimativa de rodadas agora é pela hora exata.</b> O badge "≈ N rodadas" na edição usava meia-noite do 1º sorteio + fim do dia, inflando a conta (dava 5 quando o correto era 4, porque o 5º sorteio cairia depois da hora de término). Agora bate com a barra do torneio.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.3.15-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Classificação reorganizada.</b> Nova ordem de colunas: <b>Pontuação · % G · V · D · Saldo · J</b>. A 1ª coluna é o 💯 PA (quando os Pontos Avançados estão ativos) ou os Pts simples (quando não). Adicionada a coluna <b>% G</b> (games vencidos ÷ total) — distingue um 6×0 de um 6×4, coisa que V/D não fazem.</li>' +
        '<li><b>±S/±G escondidos quando inúteis.</b> As colunas de saldo de Sets/Games só aparecem em torneios marcados por sets. Em Ligas de placar simples (onde sempre davam 0) elas somem — o "Saldo" já é o saldo de games.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.3.14-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Liga usa a barra de progresso rica na dashboard.</b> Antes a Liga mostrava só a barra simples; agora usa a barra rica (com a barra roxa do torneio inteiro), igual aos demais formatos.</li>' +
        '<li><b>Barra roxa do torneio voltou a aparecer.</b> Quando o fim do torneio vinha com hora (ex.: 2026-06-12T19:59), o cálculo das rodadas planejadas dava data inválida e a barra roxa sumia. Corrigido o parsing de datas.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.3.13-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(8 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Correção: config de Pontos Avançados não salvava em Liga Rei/Rainha.</b> O save excluía o formato Rei/Rainha e gravava advancedScoring como nulo — então quem ativava nesse formato perdia a configuração. Agora salva em todos os formatos.</li>' +
        '<li><b>Toggle mestre de placar ao vivo.</b> Desligar "Aplicar pontos de placar ao vivo" agora desabilita e desmarca automaticamente os dois eventos do Grupo B (killing point e ponto marcado).</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.3.12-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(8 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Folga (sit-out) recebe a média das rodadas jogadas, recalculada a cada rodada.</b> Quem folga não fica mais com 0: a compensação é a média de pontos das rodadas que o jogador realmente disputou, multiplicada pelas folgas — atualizada a cada nova rodada. Ex.: folga na 1ª, faz 100 na 2ª → 200; faz 50 na 3ª → 150 jogados + 75 (média) = 225. Vale para os Pontos Avançados e para os pontos simples; aparece no detalhamento como "🪑 Folga".</li>' +
        '<li><b>Toggle de placar ao vivo.</b> Na config dos Pontos Avançados, o organizador pode desligar a aplicação dos pontos que dependem de placar ao vivo (killing point, ponto marcado) — assim quem usa placar ao vivo não leva vantagem sobre quem prefere não usar.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.3.11-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(8 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Pontos Avançados valem como classificação da Liga.</b> Quando o "Sistema de Pontos Avançado" está ativo, a Liga passa a ser ranqueada por ELE (não mais pelos pontos simples 3/1/0). A pontuação de todos é recomputada de todas as partidas. Na tabela, a coluna 💯 PA vira a pontuação principal e os pontos simples ficam como informação.</li>' +
        '<li><b>Configurável pelo organizador.</b> Na tela de criar/editar a Liga, a seção "Sistema de Pontos Avançado" permite ligar/desligar e ajustar o valor de cada evento (participação, vitória, game ganho/perdido, ponto de tie-break, etc.).</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.3.10-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(8 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Barra de progresso unificada.</b> A barra simples antiga foi eliminada — agora a tela do chaveamento usa a mesma barra rica do detalhe (ritmo, horários e, em Liga, a barra roxa "Torneio completo" com X/120 jogos · rodada N de M).</li>' +
        '<li><b>Rodada extra prematura sai na hora.</b> Ao abrir o chaveamento, o organizador já dispara a auto-correção (não espera o ciclo de 60s): a rodada gerada antes do horário agendado é removida imediatamente.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.3.9-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(8 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Folga (sit-out) não tem mais "vencedor".</b> A partida de folga era criada com o jogador como vencedor, o que vazava como vitória/partida disputada em algumas estatísticas. Agora a folga não tem vencedor — o jogador recebe só os pontos de compensação na classificação, sem contar vitória nem jogo. Folgas já gravadas são corrigidas automaticamente.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.3.8-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(8 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>🏆 Barra de progresso do torneio completo (Liga).</b> Abaixo das barras de tempo agora há uma barra do torneio inteiro — ex.: "24/120 jogos · rodada 1 de 5" — calculada pelas rodadas planejadas (do 1º sorteio até o fim, pelo intervalo). O contador de cima passa a refletir a rodada atual, não a soma de todas.</li>' +
        '<li><b>Auto-correção de rodada gerada antes da hora.</b> Ligas que tinham a próxima rodada criada cedo (bug pré-v2.3.7) são corrigidas automaticamente: a rodada extra sem resultados é removida e volta a ser sorteada no horário agendado.</li>' +
        '<li><b>"Partidas disputadas" não conta mais folgas.</b> Em rodadas com jogador de folga (sit-out), o número de partidas disputadas estava 1 a mais (ex.: 25 em vez de 24). Corrigido.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.3.7-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(8 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Correção crítica: Liga não gera mais a próxima rodada antes da hora.</b> Numa Liga com sorteio agendado, lançar o último placar da rodada disparava a geração imediata da rodada seguinte — antes do horário marcado. Isso fazia aparecer "Rodada 2" cedo e inflava o contador de partidas (ex.: 24/48). Agora, ao encerrar a rodada, o sistema apenas atualiza a classificação e aguarda o sorteio agendado.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.3.6-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(8 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Correção: organizador não é mais inscrito sozinho no próprio torneio.</b> Quando o organizador abria o link do próprio torneio estando deslogado e depois entrava, ele era auto-inscrito como jogador sem ter se inscrito. Agora o criador/organizador nunca é auto-inscrito — se quiser jogar, usa o botão "Inscrever-se" normalmente.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.3.5-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(8 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Correção: cards de "Rodadas Anteriores" da Liga.</b> Em rodadas com duplas (Rei/Rainha), o placar "6 x 2" quebrava no meio e colava nos nomes dos adversários, ficando ilegível. Agora cada dupla aparece numa linha com seu placar à direita, igual aos cards do bracket.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.3.4-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(8 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Ordem padrão dos critérios de desempate ajustada.</b> Agora começa com Pontos Avançados, depois Confronto Direto, Saldo, Vitórias, Buchholz, Sonneborn, Antiguidade e Sorteio — com Juventude entre os não considerados (você ainda pode reordenar arrastando).</li>' +
        '<li><b>Layout dos botões unificado.</b> O ℹ️ de Buchholz e Sonneborn agora fica ao lado do nome (como no Pontos Avançados) e o ✕ vermelho fica sempre à direita, igual em todos os critérios.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.3.3-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(8 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>💯 Pontos Avançados em todos os formatos.</b> O sistema de pontuação por eventos (participação, vitória, games, etc.) deixou de ser exclusivo de Liga/Suíço — agora está disponível em eliminatórias, grupos, Rei/Rainha, Liga e Suíço.</li>' +
        '<li><b>Botão ℹ️ explicando o critério.</b> Cada detalhe do cálculo, os valores padrão, o exemplo numérico e o piso de segurança agora ficam num popup ao lado de "Pontos Avançados".</li>' +
        '<li><b>Novo ícone 💯.</b> O critério trocou o ⚡ pelo 💯 pra não confundir com o atalho de Partida Casual.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.3.2-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(8 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Ícones em todos os critérios de desempate.</b> Antes só Pontos Avançados, Antiguidade e Juventude tinham ícone. Agora todos têm: 🆚 Confronto Direto, ⚖️ Saldo de Pontos, 🏆 Número de Vitórias, 💪 Força dos Adversários, ⭐ Qualidade das Vitórias e 🎲 Sorteio.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.3.1-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(8 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>✨ Brilho nos botões Análise e Editar.</b> Os botões <b>📊 Análise</b> e <b>✏️ Editar</b> do organizador agora têm o mesmo brilho periódico dos botões especiais da tela inicial — destacando as ferramentas principais de quem organiza o torneio.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.3.0-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(8 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>🏆 Fase Final da Temporada (Liga).</b> Ao fim de uma temporada de Liga, o organizador pode disparar um mata-mata entre os melhores colocados para sagrar os <b>campeões da temporada</b> — a "confraternização + torneio extra". Botão <b>🏆 Fase Final</b> nas ferramentas do organizador de qualquer Liga.</li>' +
        '<li><b>Tudo configurável.</b> Você decide <b>quantos disputam</b> (top-N da classificação), os <b>confrontos</b> (por classificação com cabeças de chave, ou sorteio) e — em Ligas de duplas — como <b>formar as duplas</b> (1º+último para equilibrar, ou sequencial). Configuração <b>por categoria</b>. Campos opcionais de data/local da confraternização.</li>' +
        '<li><b>Lista de espera + W.O.</b> Quem fica logo abaixo do corte vira lista de espera; o organizador pode substituir um classificado ausente ou declarar W.O. a qualquer momento. A classificação da temporada é congelada ao gerar a fase final, e dá pra <b>refazer</b> até o primeiro placar.</li>' +
        '<li><i>Em breve nesta fase: Dupla Eliminatória, Grupos+Eliminatória, formação manual de duplas e rodada Rei/Rainha classificatória.</i></li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.2.47-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(8 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Novos critérios de desempate por idade.</b> <b>Antiguidade</b> (mais velho ganha) e <b>Juventude</b> (mais novo ganha) — escolher um manda o outro pros não considerados (são mutuamente exclusivos). Usam a data de nascimento do perfil; em duplas, a média das idades.</li>' +
        '<li><b>Critérios não considerados.</b> Cada critério ganhou um <b>✕ vermelho</b> que o move pra um box "Não Considerados" abaixo; de lá pode voltar arrastando ou pelo <b>↩ verde</b>. Assim o organizador monta exatamente a lista de desempate que quiser.</li>' +
        '<li><b>Editar torneio até o fim.</b> O botão <b>Editar</b> agora fica disponível pro organizador até o torneio ser encerrado (antes sumia após o sorteio) — útil pra ajustar datas, local e critérios de desempate com o torneio em andamento.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.2.46-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(8 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Modo misto: separar duplas formadas das sorteadas.</b> Quando o Modo de Inscrição aceita <b>Individual + Times Montados</b> ao mesmo tempo, aparece uma nova opção: <b>Separar por origem</b>. Ligada, gera chaveamentos separados — duplas montadas só enfrentam montadas e duplas sorteadas só enfrentam sorteadas (dois campeões). Desligada (padrão), todas se enfrentam livremente no mesmo chaveamento. Vale para eliminatórias e suíço.</li>' +
        '<li><b>"Inscrições Após o Início" mais claro.</b> A seção (antes "Inscrições Após Encerramento") agora deixa explícito que controla inscrições mesmo <b>depois do torneio começar</b> — fechadas de vez ou abertas para a lista de espera/novos confrontos.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.2.45-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(8 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Organizador não aparece mais como inscrito sem ter se inscrito.</b> Ao criar um torneio, o organizador às vezes era contado em "Participando" como se fosse jogador. Causa: a lista interna de membros (usada pelas permissões) inclui o criador, e isso estava sendo confundido com inscrição. Agora o organizador (ou co-organizador) só conta como participante se realmente clicou em <b>Inscrever-se</b>.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.2.44-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(8 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Brilho de atenção nos botões do organizador.</b> O <b>Editar</b> e o <b>Sortear</b> ganham um brilho pulsante quando já há inscritos confirmados suficientes pra montar pelo menos 1 jogo. O <b>Análise</b> brilha quando o torneio ainda não tem categorias definidas — um lembrete pra organizar os inscritos antes do sorteio.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.2.43-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(8 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>+ Participante e + Placeholders disponíveis enquanto a inscrição estiver aberta.</b> Os botões do organizador agora seguem o estado real da inscrição — ficam visíveis e funcionais mesmo depois do sorteio e do início do torneio, desde que as inscrições continuem abertas (Liga em temporada, inscrição tardia). Novos inscritos entram automaticamente na lista de espera quando o sorteio já saiu. Antes os botões sumiam assim que o sorteio era feito.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.2.41-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Revanche na partida casual espera o outro time.</b> Na tela de estatísticas ao fim da partida, clicar em <b>Iniciar</b> agora aguarda a confirmação do outro time antes de abrir o placar ao vivo — como no lobby. Antes começava com um único clique. (Partida solo continua iniciando direto.)</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.2.40-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Presença continua após o sorteio.</b> Quem foi marcado presente na chamada antes do sorteio agora permanece <b>presente</b> na lista de Inscritos depois do sorteio (até o torneio iniciar). Antes os marcadores de presença sumiam ao concluir o sorteio.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.2.39-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Sortear antes ou depois da chamada.</b> Em torneios cujas inscrições seguem abertas após o sorteio, clicar em Sortear agora pergunta: <i>sortear com todos</i> (antes da chamada) ou <i>só entre os presentes</i> — neste caso os ausentes vão para a lista de espera e entram depois.</li>' +
        '<li><b>Novo confronto só com presentes.</b> A regra que monta um jogo novo quando 4 acumulam na lista de espera agora junta apenas <b>4 presentes</b>. Ausentes na lista de espera não contam mais — antes entravam no jogo e na chave por engano.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.2.38-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Nomes corretos nas Últimas Partidas.</b> Os cards de últimas partidas mostravam nomes errados (ex.: "Rodrigo Barth / Rodrigo Barth", um jogador trocado por outro) quando as duplas eram sorteadas. Causa: o app assumia que o 1º jogador do time 1 era o criador da sala. Corrigido — cada jogador aparece com o nome real (os dados sempre estiveram corretos; era só a exibição).</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.2.37-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Fim da tela duplicada ao desligar o Rei/Rainha.</b> Ao desativar o toggle Rei/Rainha na tela de resultado final, a tela mostrava os controles repetidos (dois "Iniciar", dois conjuntos de toggles). Corrigido — o cabeçalho volta ao normal e os controles aparecem uma vez só.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.2.36-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Anti-trava em sala casual abandonada.</b> Se um crash deixou uma partida casual parada e você era jogado de volta nela sozinho ao abrir o app, agora — quando a sala está sem atividade há mais de 20 minutos — ela é encerrada automaticamente e você vai pro dashboard, em vez de ficar preso.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.2.35-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Resultado Final do Rei/Rainha ganhou cabeçalho e toggles.</b> A tela de resultado final da série Rei/Rainha agora mostra os botões do topo (⚙️ Ajustar, ↺ Resetar, ✕ Fechar) e os toggles da próxima partida (Sortear Duplas, Duplas Mistas, Rei/Rainha) — antes só tinha "Iniciar" e "Ver Resultado Final".</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.2.34-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Botões do cabeçalho voltam no Rei/Rainha.</b> Ao iniciar uma rodada do Rei/Rainha, os botões do topo (⚙️ Ajustar, ↺ Resetar, ✕ Fechar) sumiam. Corrigido — eles voltam a aparecer no placar ao vivo de cada rodada.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.2.33-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Rei/Rainha retroativo conta os jogos anteriores.</b> Se você jogou partidas com parceiros diferentes e depois ativou o Rei/Rainha, agora os jogos anteriores da sessão são considerados na série — o app monta a rodada que falta (com o parceiro que você ainda não jogou) em vez de recomeçar do zero. Antes só contava o jogo atual ("Jogo 2 de 3" e repetia parceiro), porque o histórico era perdido a cada partida.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.2.32-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Toggles da tela de estatísticas são lembrados.</b> Sortear Duplas, Duplas Mistas e Rei/Rainha agora voltam na próxima partida com a configuração que você deixou — antes voltavam sempre ligados. Corrige também o caso em que continuava sorteando dupla mista mesmo com o toggle desligado.</li>' +
        '<li><b>Encerrar exige a confirmação do outro.</b> Ao clicar em Fechar, quem clicou agora só vê "Aguardando confirmação" — o outro jogador precisa Confirmar ou Recusar. O atalho "Fechar agora" (que encerra sem esperar) só aparece após 12s sem resposta, pra sala sozinha/sem retorno.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.2.31-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Fim da tela preta ao iniciar a 3ª+ partida.</b> Quem dava o start na próxima partida às vezes ficava com a tela preta (a partir do 3º jogo seguido). Causa: o início reabria a sala de organização por baixo dos panos, e essa cadeia quebrava após alguns jogos. Agora o início cria a próxima partida direto e leva os dois jogadores pela mesma rota — simétrico e estável, sem reabrir a sala.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.2.30-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Iniciar leva os dois jogadores juntos pro placar.</b> Corrigido o bug em que, ao iniciar a próxima partida, um jogador ia pro placar e o outro ficava preso em "Aguardando". Agora quando o segundo confirma, ambos entram na nova partida. (Causa: quem aguardava continuava ouvindo a sala antiga e não era levado pra nova.)</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.2.29-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Botão "Iniciar" não trava mais.</b> Na tela de estatísticas, o botão passou a se chamar <b>Iniciar</b>. E corrigido o bug em que ele ficava "Aguardando" pra sempre quando havia 2 jogadores reais e 2 convidados: agora um time só de convidados não bloqueia o início — basta o OK de 1 jogador real de cada time que tenha jogadores reais.</li>' +
        '<li><b>Encerrar não deixa mais fantasma.</b> Ao encerrar a partida pela tela de estatísticas, o outro jogador agora sai junto (antes podia ficar preso na tela como "fantasma").</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.2.28-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Gênero do perfil é definitivo.</b> Em partida casual, ninguém pode mais re-marcar o gênero de quem já tem isso no perfil — o ícone fica só pra leitura. A marcação manual só aparece pra participantes digitados (sem conta) ou usuários reais que ainda não definiram o gênero.</li>' +
        '<li><b>Definir o próprio gênero alimenta o perfil.</b> Se você definir o seu gênero nessa tela (quando ainda não tinha), ele passa a valer no seu perfil global — e propaga pra todos automaticamente.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.2.27-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Gênero propaga entre todos da sala.</b> Em partida casual, o gênero de cada jogador com conta agora é compartilhado com todos na sala — quem cria a sala e quem entra veem os mesmos gêneros, de forma consistente. Cada jogador publica o próprio gênero (do perfil) e todos recebem, sem depender de carregar o perfil alheio. Isso faz o ícone de gênero e o toggle <b>Duplas Mistas</b> aparecerem corretamente em todos os dispositivos.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.2.26-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>"Jogar Novamente" com consenso (multiplayer).</b> Na tela de estatísticas, clicar em <b>Jogar</b> agora funciona como na sala de organização: quem clica fica em <b>"⏳ Aguardando os outros"</b> e os demais precisam confirmar (pelo menos 1 de cada time) antes da nova partida começar pra todos.</li>' +
        '<li><b>Jogar vs Encerrar — aviso ao adversário.</b> Se um jogador clica em <b>Jogar</b> e outro clica em <b>Encerrar</b>, quem queria jogar é avisado ("Fulano quer encerrar") e decide: <b>Confirmar</b> (encerra pra todos) ou <b>Recusar</b> (volta pras estatísticas).</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.2.25-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Configurações da próxima partida sincronizadas.</b> Na tela de estatísticas, quando um jogador mexe nos toggles <b>Sortear Duplas</b>, <b>Duplas Mistas</b> ou <b>Rei/Rainha</b>, a mudança agora aparece pra todos os jogadores da sala — todos ficam com a mesma configuração pra próxima partida.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.2.24-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Partida de duplas encerra de novo.</b> Em partida casual de <b>duplas</b>, marcar o ponto da vitória não fazia nada — o ponto não subia e o jogo nunca encerrava. Causa: um erro de programação na tela de estatísticas (referência a uma função que não existia naquele contexto) abortava a atualização da tela bem na hora do encerramento. Corrigido — marcar o último ponto encerra, mostra as estatísticas e as opções de jogar de novo / sortear duplas / mistas / Rei-Rainha.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.2.23-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Recusar encerramento volta todos ao placar.</b> Quando alguém pede pra encerrar e o outro <b>Recusa</b>, todos voltam ao placar ao vivo e ninguém sai — e quem tinha pedido pode pedir o encerramento de novo normalmente depois (antes ficava travado).</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.2.22-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Match point encerra a partida (multiplayer).</b> Em partida casual com mais de um jogador, marcar o ponto da vitória não fazia nada — a tela de estatísticas não aparecia. Causa: um dado de sincronização antigo, ainda em trânsito, revertia o encerramento. Corrigido: o encerramento fixa um marco de tempo e nenhum dado mais antigo reverte mais a partida. Agora marca o último ponto → encerra → mostra as estatísticas → opções de jogar de novo (mesmos times) ou re-sortear.</li>' +
        '<li><b>Encerramento consensual — "Confirmar" funciona.</b> Quando um jogador pede pra encerrar, basta <b>um</b> outro jogador confirmar pra encerrar pra todos (antes exigia que todos confirmassem, e jogadores que já tinham saído travavam pra sempre). Recusar volta todos ao placar. O botão "Fechar agora" continua disponível pra encerrar a sala imediatamente quando você está sozinho.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.2.21-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>"Fechar agora" dissolve a sala de verdade.</b> Quando você fica sozinho numa partida casual (os outros saíram mas os nomes continuam na sala), o botão "Fechar agora" agora <b>apaga a sala</b> em vez de só fechar a tela: o registro da partida é dissolvido, o ponteiro de "partida ativa" é limpo, e você vai direto pro dashboard. Não volta mais pra mesma sala fantasma toda vez que abre o app.</li>' +
        '<li><b>Tela de carregamento com a bola de tênis.</b> A tela de "carregando partida" voltou a mostrar a bolinha de tênis girando (identidade do app) no lugar da ampulheta.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.2.20-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Fim da sala fantasma — preso na mesma partida casual.</b> Quem encerrava o placar ao vivo pelo botão ✕ "Encerrar" (e pelo fechamento automático após aguardar a confirmação dos outros) ficava preso: toda vez que reabria o app era jogado de volta na mesma sala vazia, populada com nomes digitados e jogadores que já tinham saído. Causa: esse caminho de fechamento não limpava o ponteiro de "partida ativa" do perfil. Corrigido — ao encerrar por qualquer caminho, o ponteiro é limpo e o usuário não volta mais para a sala morta.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.2.15-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Fechar partida casual — consenso corrigido.</b> Dois bugs no botão "✕ Fechar" do placar ao vivo em sala compartilhada: (1) se o botão era clicado antes do primeiro snapshot do Firestore chegar, o consenso era ignorado e o organizador ia direto para a sala de organização enquanto o outro jogador era redirecionado ao dashboard; (2) convidados que entravam em partida já ativa voltavam para uma sala nova vazia em vez da sala original. Ambos corrigidos — o consenso agora funciona corretamente desde o primeiro instante e todos retornam à mesma sala.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.2.14-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Placar ao vivo — ajuste de tamanho proporcional.</b> Ao mover os sliders de "Placar" e "Botões" no painel Ajustar, o box inteiro (fundo branco + número; caixa do botão + símbolo) cresce e encolhe junto — não só o texto interno. O número ocupa o box com margem proporcional ao tamanho selecionado. O <code>border-radius</code> dos elementos também escala para manter a proporção visual.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.2.13-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Salas sem atividade dissolvidas automaticamente.</b> Uma sala de partida casual ativa sem pontos marcados por 2 horas é dissolvida automaticamente pelo servidor. A cada ponto marcado o timestamp de última atividade é atualizado no Firestore; uma Cloud Function rodando a cada 30 min verifica e apaga as salas expiradas, limpando também os ponteiros <em>activeCasualRoom</em> dos perfis dos jogadores.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,109,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.2.12-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Partidas Casuais — encerramento consensual.</b> Ao clicar em ✕ Fechar durante o placar ao vivo (com múltiplos jogadores), o jogo não encerra de imediato: quem clicou vê a tela "⏳ Aguardando confirmação" com botão Cancelar. Os demais jogadores veem "[Nome] quer encerrar" com os botões Recusar ou Confirmar. Todos confirmando → todos voltam para a mesma sala de partida casual que estavam. Cancelar/Recusar → volta ao placar ao vivo normalmente.</li>' +
        '<li><b>Lobby — sair da sala avisa os demais.</b> Clicar em Voltar na tela de organização da sala remove o jogador da sala e notifica os que ficaram. Se todos os jogadores com conta (uid) saírem, a sala é dissolvida automaticamente.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.2.11-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Placar ao vivo — layout portrait reformulado.</b> O placar ocupa toda a tela (altura e largura) sem scroll. Cinco linhas proporcionais fixas de cima a baixo: games + botão Desfazer → times (fotos/ícones e nomes) → placares grandes → botões ▲ subir ponto → botões ▼ baixar ponto. Tudo sempre visível ao mesmo tempo.</li>' +
        '<li><b>Painel Ajustar transparente.</b> O botão "Configurar" virou "Ajustar". O painel de ajustes usa glassmorphism (backdrop blur) para que o placar apareça atrás em tempo real enquanto o usuário move os sliders — feedback imediato do tamanho de cada elemento.</li>' +
        '<li><b>Novo controle de Placar.</b> Slider dedicado para o tamanho dos números grandes do placar (separado do controle de Games). Ordem dos sliders: Games · Nomes · Foto/ícone · Placar · Botões.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.2.10-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Partidas Casuais — início consensual.</b> O jogo só começa quando pelo menos 2 participantes clicam em "Iniciar". Quem clicou primeiro vê uma tag âmbar "⏳ Aguardando +1" no lugar do botão. Quando os times estão formados (modo duplas sem embaralhamento), é exigido pelo menos 1 jogador de cada equipe pronto. O polling detecta a condição e inicia automaticamente para todos.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.2.9-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Performance — cache de perfis no fix de nomes.</b> A função que corrige nomes de participantes desatualizados agora guarda os perfis já buscados em cache de sessão. Numa mesma sessão, UIDs que já foram consultados ao Firestore não geram novos reads — apenas UIDs novos (de torneios carregados depois) causam fetch. Reduz o pico de leituras Firestore detectado no Sentry (~86 reads por login) em sessões com múltiplos torneios.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.2.8-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Lista de Espera — toggle de presença desabilitado para jogadores ausentes.</b> Jogadores enviados à lista de espera por estarem ausentes agora aparecem com o toggle "Presente" desabilitado (opaco, sem clique). Para reativá-los, o organizador deve usar o botão "Reverter" — assim o toggle permanece no estado correto (desativado) até a reativação explícita. Corrige também o bug onde clicar no toggle de um jogador ausente da lista de espera afetava outros jogadores: a lógica de "Reverter" é individual por jogador.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.2.7-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Dashboard — torneios encerrados vão para seção separada em todos os filtros.</b> Nos filtros "Organizados" e "Participando", os torneios encerrados agora aparecem numa seção colapsável "Torneios Encerrados" no final da lista — igual ao que já acontecia no filtro "Todos". Antes ficavam misturados com os torneios ativos nesses dois filtros.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.2.6-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Sorteio exclui ausentes de verdade.</b> Jogadores marcados como W.O./ausente antes do sorteio agora são persistidos na lista de espera no Firestore <em>antes</em> do painel de sorteio abrir. A versão anterior removia-os apenas em memória, mas o listener <code>onSnapshot</code> podia repor os participantes originais (do servidor) antes do sorteio ser executado — fazendo os ausentes voltarem ao bracket. Com o save assíncrono aguardado antes de prosseguir, o Firestore e o AppStore ficam sincronizados e o bracket nunca mais inclui jogadores ausentes.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.2.3-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Partida Casual — ponto final do set registra corretamente.</b> Corrigido bug onde o último ponto do set em partidas casuais não era registrado quando o placar chegava a 5-5 (diálogo "Prorrogar ou Tiebreak"). O diálogo de desempate não exibia os botões de escolha, travando a partida. Causa: a verificação de permissão que restringe o diálogo a jogadores registrados também bloqueava o criador da partida casual cujo UID não era encontrado no mapa de jogadores. Agora partidas casuais sempre permitem ao criador resolver o diálogo de desempate.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.2.2-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Torneio — botão W.O. aparece para todos os participantes sem Presente.</b> O botão W.O. agora aparece para qualquer participante cujo toggle Presente não esteja ativado, independente de o jogo já ter sido decidido por W.O. anteriormente. Quem já está marcado como ausente vê "Reverter"; os demais sem Presente veem "W.O.".</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.2.1-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Partida Casual — 3 toggles na página de estatísticas.</b> Ao fim de uma partida casual de duplas, a página de estatísticas agora exibe os mesmos 3 toggles da tela de configuração: 🔀 Sortear Duplas, ⚤ Duplas Mistas (quando há 2H+2M) e 👑 Rei/Rainha. Assim é possível ativar ou ajustar o modo diretamente antes de iniciar o próximo jogo.</li>' +
        '<li><b>Partida Casual — Rei/Rainha retroativo.</b> O Rei/Rainha pode ser ativado a qualquer momento durante a série. Ativado no 2º jogo: o 1º jogo é reconhecido retroativamente como a 1ª rodada. Ativado no 3º jogo: os 2 anteriores são retroativamente incluídos. Jogos com o mesmo par de times repetido são descartados da contagem. Só são contados jogos com os 4 jogadores presentes e pairings distintos.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.2.0-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Torneio — W.O. não aparece mais no card de parceiro presente.</b> Na lista de inscritos com check-in, quando um jogo tinha W.O. (ex: Leila recebeu W.O. no Jogo 3), o card do parceiro presente (Flávia) aparecia com badge "W.O." e card vermelho — mesmo estando com Presente marcado. Também o card de jogadores apenas sem check-in (não W.O. explícito) ficava vermelho com badge W.O. e botão de W.O. adicional. Corrigido: badge W.O., card vermelho e risco no nome só aparecem quando aquele jogador específico foi marcado como W.O. individualmente.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.1.99-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Partida Casual — "Jogar com resortear": duplas mistas respeitadas.</b> Ao clicar em "Jogar com resortear" ao fim de uma partida de duplas mistas, os times ficavam com 2 homens no mesmo time. O sorteio lia os gêneros do banco de dados (carregados assincronamente) em vez de usar os gêneros já definidos na tela de configuração — que estavam corretos. Agora o sorteio usa a fonte certa e sempre garante 1 homem + 1 mulher por time.</li>' +
        '<li><b>Partida Casual — "Jogar com resortear": vai direto para o placar.</b> Ao clicar em "Jogar com resortear", o app voltava para a tela de configuração/lobby em vez de abrir o placar ao vivo imediatamente. Corrigido: o novo jogo inicia direto no placar para todos os participantes.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.1.98-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Botão "Entrar" sempre verde no login.</b> O botão ficava cinza quando os campos estavam vazios. Agora é sempre verde — fica com opacidade reduzida enquanto e-mail/senha não estão preenchidos corretamente, e fica cheio ao completar os campos.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.1.97-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Tela de retorno sem link de acesso por e-mail.</b> Ao fazer logoff e abrir o login novamente, o banner "Bem-vindo de volta" mostrava um botão "Enviar link de acesso" que não funcionava mais (o app não usa esse fluxo). Agora o banner mostra o botão correto para o método de login da conta: "Entrar com Google" para contas Google, "Entrar com e-mail e senha" para contas de senha, e "Entrar com telefone" para contas de telefone.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.1.96-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Botão Reverter disponível em todos os W.O.</b> Na lista de inscritos, alguns jogadores marcados com W.O. não tinham o botão Reverter — especificamente jogadores "órfãos" (que foram retirados de uma dupla após o W.O. do parceiro) cujo jogo original já havia sido decidido. Agora todos os W.O. exibem o botão Reverter, independente do status do jogo.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.1.95-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Botão de inscrição correto nos cards do dashboard.</b> Em torneios de duplas, o card na dashboard mostrava "Inscrever-se" mesmo com o usuário já inscrito (o detalhe do torneio mostrava "Desinscrever-se" corretamente). A lógica do card pulava participantes com barra ("/") no nome, que é o formato das duplas. Corrigido para usar a mesma função centralizada do detalhe do torneio.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.1.94-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Usuário deslogado nunca vê dados de torneio.</b> Antes, qualquer URL interna (torneio, chaveamento, participantes, etc.) era acessível sem login, o que causava confusão: usuário via dados desatualizados de uma sessão anterior e achava que ainda estava logado. Agora toda rota interna redireciona para a tela inicial quando não há sessão ativa — apenas Termos e Privacidade continuam públicas. Links de convite continuam funcionando: o destino é salvo e o usuário é levado ao torneio automaticamente após fazer login.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.1.93-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Partida Casual: sincronização de sala corrigida para "Jogar novamente".</b> Ao clicar em Jogar ao fim de uma partida, todos os participantes agora entram juntos na nova sessão — gêneros preservados, sala sincronizada. Antes, os convidados ficavam presos no lobby antigo e os gêneros se perdiam. Além disso, o botão "Fechar" do host agora fecha a tela para todos os participantes.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.1.92-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Fim das notificações duplicadas no celular.</b> Algumas notificações chegavam repetidas — até 4 iguais em seguida na tela bloqueada. Eram duas causas somadas: o serviço de envio de push estava rodando duplicado (em dois servidores ao mesmo tempo) e cada aviso ainda era exibido duas vezes pelo aparelho. Agora cada notificação chega uma única vez.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.1.91-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Tamanho da interface ajustável.</b> Novo controle no perfil (🔎 Tamanho da interface) que aumenta/diminui textos e botões em todo o app, do seu jeito — salvo no seu perfil e válido em todos os aparelhos. O padrão é a aparência de sempre.</li>' +
        '<li><b>Apresentação proporcional ao aparelho.</b> O app agora ajusta o tamanho base de forma sutil conforme o tamanho da tela (telas maiores ficam um pouco maiores, telas bem pequenas um pouco menores), pra melhor aproveitamento em cada dispositivo. O zoom do placar ao vivo e da chave continua separado, como antes.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.1.90-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Tema Claro mais confiável em qualquer aparelho.</b> A correção de contraste agora reconhece a cor tanto em hex quanto em rgb. Alguns textos coloridos definidos via código eram gravados pelo navegador como rgb e escapavam do ajuste — agora são escurecidos corretamente, deixando o tema Claro legível de forma consistente entre iPhone e Android.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.1.89-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>W.O. em duplas: parceiro vai para lista de espera.</b> Quando apenas um jogador de uma dupla é marcado ausente e não há substituto disponível, o <b>parceiro presente</b> agora vai automaticamente para a <b>lista de espera</b> — podendo ser emparelhado com outro jogador em jogo futuro. Antes o time inteiro era desclassificado mesmo com um dos dois presentes.</li>' +
        '<li><b>W.O. no lado certo em dados antigos.</b> Partidas salvas antes da v2.1.86 (com "W.O." no lado do vencedor) agora também exibem corretamente: "W.O." aparece no lado do <b>ausente/perdedor</b> e o vencedor aparece limpo — independente de como os dados foram gravados.</li>' +
        '<li><b>W.O. não propaga adversário "TBD" para rodadas seguintes.</b> Se o adversário de uma partida ainda não estava definido quando o W.O. foi marcado, o sistema agora <b>não aplica o W.O. automaticamente</b> (evita "TBD · por W.O." na chave). O jogador é marcado ausente e o W.O. pode ser aplicado pelo organizador quando o adversário for conhecido.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.1.88-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Placar ao vivo cabe na tela no Android.</b> Em alguns aparelhos Android o placar ficava com espaço vazio em cima e os botões/placar não cabiam embaixo (a tela era medida maior que a área visível). Agora a altura é travada na área realmente visível e o conteúdo rola quando não cabe — nada é cortado.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.1.87-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Chamada de presença antes do sorteio.</b> O botão <b>“Inscritos / Chamada”</b> agora fica disponível <b>antes</b> do sorteio. O organizador abre a lista, marca quem está <b>presente</b> e clica em <b>“Sortear entre os presentes”</b>. Quem não confirmou presença pode ser <b>enviado à lista de espera</b> ou <b>desclassificado</b> — e o sorteio é feito só com os presentes. Ideal pra fazer a chamada no dia do torneio e sortear na hora apenas com quem apareceu.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.1.86-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Correção do W.O.: quem leva W.O. é o perdedor.</b> O marcador “W.O.” agora aparece no lado do time <b>ausente</b> (que perde), e o adversário é corretamente o vencedor que avança. Antes o “W.O.” ficava no lado do vencedor, dando a impressão de que o time que levou o W.O. tinha vencido — e isso atrapalhava o andamento do torneio. Agora o torneio segue normalmente com os demais participantes.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.1.85-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Reverter W.O. em partidas de torneio.</b> Quando um jogador/dupla é declarado ausente e o adversário vence por W.O. (sem substituto na lista de espera), agora o organizador pode <b>desfazer o W.O.</b> direto na chave: aparece o botão “↩️ Reverter W.O.” no jogo. Ele reabre a partida (placar volta a 0×0), cancela o avanço do vencedor para a próxima fase e libera os jogadores que estavam marcados como ausentes. A vitória por W.O. passa a aparecer marcada com “· por W.O.” no card.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.1.84-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Legibilidade no tema Claro.</b> Vários botões e textos (como “Criar Conta” na tela de login) usavam cores claras pensadas pro tema escuro e ficavam difíceis ou impossíveis de ler no tema Claro. Agora essas cores são escurecidas automaticamente no tema Claro em todo o app, mantendo o tema escuro intacto.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.1.83-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Convite de torneio com nome, data, hora e local.</b> Ao compartilhar/convidar para um torneio, a mensagem agora mostra o nome do torneio, a data e o horário e o local — não só o link. Convite de partida casual continua deixando claro que é casual, e o convite genérico do app segue genérico.</li>' +
        '<li><b>Reset de senha mais resiliente.</b> Quando o gerador de link do Firebase tem um soluço transitório, o pedido de redefinição passa a ser enfileirado e reenviado sozinho em até 2 min — não fica mais sem chegar.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.1.81-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Templates guardam todas as categorias.</b> Salvar como template agora preserva — e ao aplicar restaura — gênero, habilidade, idade e as personalizadas. (Antes só a idade voltava ao carregar um template.)</li>' +
        '<li><b>Categorias personalizadas no torneio.</b> Além de gênero, habilidade e idade, o organizador agora cria categorias livres (ex.: Estreante, Profissional) num box com botão “Adicionar categoria”. Funcionam como a habilidade: cruzam com gênero (Fem/Masc/Misto) e geram sub-bracket próprio. Na inscrição a pessoa escolhe a categoria; o organizador pode reatribuir no gerenciador de categorias.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏷️ v2.1.79-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>Habilidade na Análise de Inscritos só mostra categoria que existe.</b> Inscritos antigos guardavam o nível em texto livre (“Intermediario”, “D/C”…) e o relatório exibia esses valores como se fossem categorias. Agora a habilidade do perfil é validada contra A/B/C/D/FUN — “D/C” vira D e C; texto sem correspondência (ex.: “Intermediario”) é ignorado e conta como habilidade faltando.</li>' +
        '<li><b>E-mail de confirmação de conta nunca mais se perde.</b> Quando o gerador de link do Firebase tem um soluço transitório (alguns segundos), o pedido passa a ser enfileirado e reenviado sozinho em até 2 min — sem deixar o cadastro preso sem e-mail.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🔑 v2.1.78-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<p><b>Reset de senha não cai mais no spam.</b><br><br>' +
      'O e-mail de "esqueci a senha" passou a ser enviado pelo <b>nosso servidor</b> (mesmo dos outros e-mails) em vez do remetente padrão do Firebase — que Hotmail/Outlook jogavam no spam/bloqueavam. Também funciona pra quem entrou pelo login antigo sem senha (define a senha pela primeira vez). A tela agora lembra de checar o spam.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🎯 v2.1.77-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<p><b>Raiz da sala-fantasma: corrigida na origem.</b><br><br>' +
      'Investigação concluída: abrir o setup da partida casual <b>setava o "retomar em outro dispositivo"</b> cedo demais — se você abrisse e abandonasse (fechar aba/reload/app cair), virava sala-fantasma que te puxava de volta. Agora esse marcador é gravado <b>só quando a partida inicia de verdade</b>. A sala ainda é criada pro QR/código funcionar; sem ninguém, ela se dissolve sozinha.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🛡️ v2.1.76-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<p><b>Sala casual fantasma: raiz resolvida.</b><br><br>' +
      'O app <b>só entra/puxa</b> pra uma partida casual se houver <b>pelo menos 1 pessoa de verdade no lobby</b> — sala vazia é encerrada na hora (limpa o ponteiro + vai pra dashboard). E a sala se <b>dissolve assim que o último jogador sai</b> (passa a contar o lobby real, não um índice que dessincronizava). Acaba o problema de cair numa partida casual vazia.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🧹 v2.1.75-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<p><b>Sala casual dissolvida não puxa mais ninguém.</b><br><br>' +
      'Quando uma partida casual é <b>dissolvida</b> (12h de inatividade) ou cancelada, o app deixava um <b>ponteiro pendurado</b> no perfil — e o usuário era jogado numa sala morta ao abrir. Agora: ao cair numa sala inexistente, o app <b>limpa o ponteiro</b> e vai pra <b>dashboard</b> (vale pra todos), e a limpeza automática zera os ponteiros pendurados na fonte.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🔗 v2.1.74-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<p><b>FIX: link de convite caía em partida casual.</b><br><br>' +
      'Quem tinha uma <b>partida casual pendente</b> e abria um <b>link de torneio</b> (ou outro deep link) era jogado na partida casual em vez de ir ao destino. Agora a partida casual só é retomada quando o app abre na <b>dashboard/raiz</b> — deep links de torneio, convite e local têm prioridade.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🐛 v2.1.73-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<p><b>FIX: inscrição por link de convite agora vincula a conta.</b><br><br>' +
      'Quem se inscrevia num torneio <b>clicando no link de convite</b> entrava <b>sem o uid</b> (só nome+email) — aparecia como "sem conta" mesmo estando logado. Corrigido: a inscrição via convite agora grava <b>uid + foto</b>, igual ao botão "Inscrever-se" normal.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🔗 v2.1.72-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<p><b>Participante adicionado por nome vincula à conta do amigo.</b><br><br>' +
      'Ao adicionar um participante digitando o nome, se ele bater <b>exatamente</b> com um <b>amigo seu</b>, a conta (uid) é <b>vinculada automaticamente</b> — antes ficava como "texto solto" e o app não o reconhecia. Nos locais, amigos sem uid também passam a ser <b>reconhecidos pelo nome</b> (aparecem nomeados em vez de cair no "+N"), e o <b>gráfico conta todos os inscritos do torneio</b>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🗓️ v2.1.71-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<p><b>Movimento da dashboard mostra torneios do dia.</b><br><br>' +
      'O bloco "Movimento nos seus locais" agora considera os <b>torneios de hoje</b> em que <b>você ou um amigo</b> está inscrito — o local aparece com o box do torneio e os inscritos (amigos nomeados, não-amigos no "+N"), mesmo sem presença registrada manualmente.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">📊 v2.1.70-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<p><b>Ficha do local com gráfico e amigos nomeados.</b><br><br>' +
      'O detalhe do local agora mostra o <b>gráfico hora-a-hora</b> e a seção de presenças futuras com os <b>nomes/fotos dos amigos</b> (e "+N" dos não-amigos), inclusive o <b>box do torneio</b> com os inscritos — o mesmo dos cards de locais preferidos.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏆 v2.1.69-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<p><b>Inscritos do torneio agrupados num box.</b><br><br>' +
      'Em "Próximas horas", quem vai <b>atender o torneio</b> agora aparece dentro de um <b>box com o nome do torneio</b> (amigos com nome/foto, não-amigos no "+N"). Presenças <b>avulsas</b> (quem planejou ir mas não está inscrito) ficam <b>fora do box</b>. Sem duplicar quem está inscrito.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">📊 v2.1.68-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<p><b>Locais: amigos com nome/foto + gráfico mostra o torneio.</b><br><br>' +
      'Na ocupação de torneio em "Próximas horas", os <b>amigos</b> aparecem com <b>nome e foto reais</b> (antes vinham como "Amigo" genérico); o <b>"+N"</b> são os <b>não-amigos</b> (sem revelar identidade). E o <b>gráfico hora-a-hora</b> voltou a aparecer mesmo quando a atividade é só um <b>torneio à noite</b> — a faixa de horas se estende pra incluí-lo e o torneio entra no gráfico (você + amigos).</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🗓️ v2.1.67-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<p><b>Plano de ida acompanha o torneio.</b><br><br>' +
      'O "Planejar ida" criado na inscrição agora é <b>cancelado</b> se você se <b>desinscrever</b>, e <b>atualizado</b> se o organizador mudar a <b>data, hora ou local</b> (cada participante sincroniza o próprio plano ao abrir o torneio).</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🗓️ v2.1.66-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<p><b>Inscrição já cria o "Planejar ida".</b><br><br>' +
      'Ao se inscrever num torneio que tem <b>data, hora e local</b>, o app cria automaticamente um <b>plano de presença</b> cobrindo a <b>duração estimada</b> do torneio — seus amigos já veem que você vai. (Liga/temporada contínua não cria.)</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">👥 v2.1.65-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<p><b>Aviso de times com contadores.</b><br><br>' +
      'O aviso de "falta montar os times" agora mostra <b>inscritos</b>, <b>equipes formadas</b> e <b>sem equipe</b>, e o texto foi corrigido: as inscrições são individuais e as duplas se formam <b>arrastando o card de um jogador sobre o de outro</b> (pelo organizador ou pelos participantes).</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">👥 v2.1.64-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<p><b>Sorteio sem times montados: aviso claro em vez de painel confuso.</b><br><br>' +
      'Num torneio no modo <b>"Times Montados"</b> em que ninguém formou time (só jogadores individuais), o sorteio não abre mais o painel de "potência de 2" com 0 times. Agora mostra um <b>aviso</b> explicando que os times precisam ser montados (por você ou pelos participantes) e, ao confirmar, leva direto pra <b>edição do Modo de Inscrição</b> com os boxes <b>brilhando</b>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">💾 v2.1.63-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<p><b>Ícones de template corrigidos.</b><br><br>' +
      'No criar/editar torneio, o <b>💾 disquete salva</b> o template e a <b>⭐ estrela acessa</b> os templates salvos — estavam invertidos.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🎾 v2.1.62-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<p><b>Quadras por modalidade (dinâmico) + acesso do local no torneio.</b><br><br>' +
      'Quadras são <b>por modalidade</b> — não existe total genérico. Ao escolher um local cadastrado, o app puxa o nº de quadras <b>da modalidade do torneio</b> (Beach Tennis no Paineiras = 9, Tênis = 14, Pickleball = 4…). E se você <b>trocar a modalidade</b>, o número <b>muda na hora</b>. Se o local não oferece a modalidade, avisa. A <b>política de acesso</b> do local também reflete no torneio (Paineiras = restrito: sócios + convidados).</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🗄️ v2.1.61-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<p><b>Total de quadras do local (courtCount) consistente.</b><br><br>' +
      'O campo resumido de total de quadras do local (<code>courtCount</code>) não estava sendo gravado quando você editava as quadras — ficava vazio, enquanto o detalhe (9 Beach Tennis, 14 Tênis…) vinha do <code>courts[]</code>. Agora o app mantém o <b>courtCount = soma de todas as quadras</b> a cada edição, e os locais já cadastrados foram corrigidos no banco (Paineiras = 29, etc.).</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🎾 v2.1.60-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<p><b>Nº de quadras puxa o valor certo da modalidade.</b><br><br>' +
      'O cadastro do local guarda as quadras <b>agrupadas por modalidade</b> (ex.: Clube Paineiras = 9 Beach Tennis, 14 Tênis, 4 Pickleball…). O app estava contando o nº de <b>grupos</b> (4) em vez do total da modalidade do torneio. Agora ele puxa o <b>count da modalidade selecionada</b> — torneio de Beach Tennis no Paineiras preenche <b>9 quadras</b>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🏟️ v2.1.59-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<p><b>Local preferido cadastrado puxa quadras e acesso de verdade.</b><br><br>' +
      'Ao escolher um <b>local preferido</b> que está cadastrado na plataforma (ex.: Clube Paineiras com 9 quadras e acesso restrito), o app agora <b>preenche automaticamente</b> o nº de quadras e a política de acesso — encontrando o cadastro por placeId <b>ou pelo nome</b>. E os preferidos antigos que estavam <b>sem placeId</b> são <b>corrigidos no banco</b> (recebem o identificador + endereço do cadastro, substituindo rótulos de coordenada).</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">📐 v2.1.58-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<p><b>Data e hora finalmente com a MESMA altura (fix iOS).</b><br><br>' +
      'No iPhone, o campo de <b>data</b> ficava mais alto que o de <b>hora</b> porque são controles nativos do iOS que ignoram a altura definida por CSS. A correção foi remover o estilo nativo (<code>appearance:none</code>), o que faz os campos obedecerem à altura — agora data e hora ficam <b>idênticas</b> e alinhadas em todo o app.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">📐 v2.1.57-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<p><b>Campos de data e hora padronizados no app inteiro.</b><br><br>' +
      'Todos os campos de <b>data e hora</b> agora têm a <b>mesma altura</b> (com margem elegante, sem a fonte colada nas bordas), em qualquer tela — inscrições, início, fim e agendamento de sorteios. Data e hora na mesma linha ficam <b>alinhadas</b>, e a previsão "≈ N rodadas" alinha com o campo "Repetir a cada".</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">❤️ v2.1.56-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<p><b>Favoritos logo abaixo do topo.</b><br><br>' +
      'Os torneios <b>favoritados</b> (coração acionado) agora aparecem numa faixa <b>logo abaixo</b> da de "Em andamento (esta semana)", no topo da dashboard. Os que já estão em andamento ficam só na faixa de em andamento (não duplicam).</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🧹 v2.1.55-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<p><b>Card sem barra de progresso duplicada.</b><br><br>' +
      'No card do torneio em andamento que mostra o <b>box de progresso completo</b>, a <b>barra simples</b> que aparecia mais embaixo foi removida — fica só a completa. (Torneios encerrados e Liga, que não usam o box completo, mantêm a barra simples.)</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🔝 v2.1.54-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<p><b>Topo da dashboard só com o que acontece esta semana.</b><br><br>' +
      'A faixa do topo agora mostra <b>só os em andamento desta semana</b> — que <b>começaram nos últimos 7 dias</b> ou <b>terminam nos próximos 7 dias</b> (inclui hoje). Os demais em andamento (ex.: rodando há semanas, sem término próximo) ficam numa seção <b>"Em andamento" no rodapé</b>, sem sumir.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🔝 v2.1.53-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<p><b>Faixa "Em andamento" no topo absoluto da dashboard.</b><br><br>' +
      'Qualquer torneio <b>em andamento</b> — seu OU público de descoberta — agora aparece numa <b>faixa única no topo</b> da dashboard, acima de tudo. Antes, os públicos em andamento ficavam numa seção separada lá embaixo e o ajuste de ordenação não os alcançava. Os cards saem das posições normais pra não duplicar.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🟢 v2.1.52-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<p><b>Dashboard: em andamento no topo + box de progresso completo no card.</b><br><br>' +
      'Os torneios <b>em andamento</b> (efetivamente iniciados) agora aparecem <b>acima</b> dos que ainda não começaram. E o card de cada torneio em andamento mostra o <b>box de progresso completo</b> — início real, decorrido, fim estimado, barras de ritmo e horários programados — o mesmo da tela de detalhes, atualizado ao vivo.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">📊 v2.1.51-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<p><b>Box de progresso reposicionado.</b><br><br>' +
      'O box <b>Progresso do Torneio</b> foi movido pra <b>logo acima</b> do status "Torneio em andamento", abaixo das Ferramentas do Organizador — fica mais perto das ações do dia a dia.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">📍 v2.1.50-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<p><b>Campos de data/hora alinhados + locais preferidos no Criar Torneio.</b><br><br>' +
      'Os campos de <b>data e hora</b> (inscrições, início e fim) agora têm a <b>mesma altura</b> de verdade no iPhone — o <code>date</code> não estica mais que o <code>time</code>. Os <b>locais preferidos</b> do seu perfil voltaram a aparecer como atalhos abaixo do campo de local (eram perdidos quando o perfil carregava depois da tela). E ao escolher um local <b>cadastrado na plataforma</b>, o nº de <b>quadras</b> e a <b>política de acesso</b> são puxados automaticamente (com busca extra por nome se a chave não bater).</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">📅 v2.1.49-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<p><b>Agendamento de sorteios da Liga mais legível.</b><br><br>' +
      'A seção <b>Agendamento de Sorteios</b> ganhou o rótulo <b>Primeiro Sorteio</b> e o campo de data ficou maior pra a data caber em <b>uma única linha</b>. Data e hora agora têm a <b>mesma altura</b>, e a previsão de rodadas usa a <b>mesma fonte</b> dos demais números.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.04);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">⏱️ v2.1.48-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<p><b>Progresso do torneio: cronômetro pára ao encerrar + layout maior.</b><br><br>' +
      'Ao encerrar o torneio o <b>cronômetro pára</b> (congela no horário do encerramento), mesmo sem todos os jogos realizados. O box de progresso ficou com <b>fontes maiores</b> e organizado: cada horário com a <b>data</b> e o <b>rótulo</b> embaixo (início real e fim estimado em 2 linhas; início e fim programados em 3 linhas com a data). No card da dashboard, o torneio encerrado mostra <b>quanto durou logo abaixo do nome</b> e vai para a seção <b>Encerrados</b> depois de 12h.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">⏱️ v2.1.47-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Junho, 2026)</span></div>' +
      '<p><b>Progresso do torneio com ritmo ao vivo.</b><br><br>' +
      'A barra de progresso agora mostra o <b>ritmo</b>: fica <b>verde</b> (dentro do previsto), <b>amarela</b> (quase/pouco atrasado) ou <b>vermelha</b> (atrasado). Colada embaixo, uma <b>barra azul</b> anda sozinha do início programado (0%) até o fim previsto (100%). Acima: o horário que o torneio <b>começou</b> (esquerda), o <b>fim estimado pelo ritmo real</b> (direita) e o <b>tempo decorrido</b> ao vivo no meio. Ao encerrar, o card na dashboard mostra <b>quanto o torneio durou</b>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🟢 v2.1.46-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(5 de Junho, 2026)</span></div>' +
      '<p><b>Análise: organizador atribui gênero e categoria.</b><br><br>' +
      'Na Análise de Inscritos, para quem está com perfil incompleto, o organizador agora pode escolher o <b>gênero</b> e a <b>categoria</b> e salvar — isso grava no <b>perfil do jogador</b> (que ele pode reajustar depois no próprio perfil). Resolve quem não tinha esses dados na hora de montar as categorias.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #818cf8;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.08);">' +
      '<div style="font-weight:800; color:#a5b4fc; font-size:1rem; margin-bottom:8px;">🛠️ v2.1.45-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(5 de Junho, 2026)</span></div>' +
      '<p><b>Ferramentas do organizador antes do sorteio.</b><br><br>' +
      '+ Participante, + Time e + Placeholders (que agora criam "Jogador 01, 02…") ficam disponíveis mesmo com as inscrições encerradas — e somem depois do sorteio, junto com Editar e Análise (que não fazem mais sentido com a chave já formada).</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🟢 v2.1.44-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(5 de Junho, 2026)</span></div>' +
      '<p><b>Criar torneio: local cadastrado preenche quadras e acesso.</b><br><br>' +
      'Ao escolher um local que já está cadastrado na plataforma (na busca ou nos preferidos), o app agora puxa o <b>número de quadras</b> e o <b>acesso</b> do cadastro. O campo de local mostra só o <b>nome</b> (sem o endereço) e não estoura mais a largura da tela. E os campos de <b>hora</b> ficaram com a mesma altura dos de <b>data</b>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #64748b;border-radius:12px;padding:14px 16px;background:rgba(100,116,139,0.08);">' +
      '<div style="font-weight:800; color:#cbd5e1; font-size:1rem; margin-bottom:8px;">🔧 v2.1.43-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(5 de Junho, 2026)</span></div>' +
      '<p><b>Monitor de pico de leituras (interno).</b><br><br>' +
      'Ajuste técnico: o app passou a medir picos de leitura no banco e reportar ao Sentry quando passam de um limite — pra acompanhar uso/custo. Sem efeito visível pro usuário.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #38bdf8;border-radius:12px;padding:14px 16px;background:rgba(56,189,248,0.08);">' +
      '<div style="font-weight:800; color:#7dd3fc; font-size:1rem; margin-bottom:8px;">🔵 v2.1.42-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(5 de Junho, 2026)</span></div>' +
      '<p><b>Pessoas: não perde o lugar ao reenviar convite.</b><br><br>' +
      'Na tela de Pessoas, ações de amizade (reenviar/aceitar/recusar/remover) re-renderizam a lista — agora a página volta pra onde você estava em vez de pular pro topo.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🟢 v2.1.41-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(5 de Junho, 2026)</span></div>' +
      '<p><b>Card de jogo sem placar repetido.</b><br><br>' +
      'Em alguns jogos (lançados pelo placar ao vivo) o placar aparecia duas vezes — ao lado dos jogadores e de novo embaixo do vencedor. Removemos a repetição: agora todos os cards mostram o placar só uma vez (ao lado dos jogadores) + o nome do vencedor. Tudo padronizado.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #818cf8;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.08);">' +
      '<div style="font-weight:800; color:#a5b4fc; font-size:1rem; margin-bottom:8px;">🧭 v2.1.40-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(5 de Junho, 2026)</span></div>' +
      '<p><b>Barra do "Voltar" alinhada de ponta a ponta.</b><br><br>' +
      'A barra do botão Voltar agora ocupa a largura toda (igual à barra de cima), em vez de ficar centralizada e mais estreita. Some o vão na esquerda por onde o conteúdo (ex.: chaveamento) vazava em telas largas.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🟢 v2.1.39-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(5 de Junho, 2026)</span></div>' +
      '<p><b>Placar ao vivo de torneio: salva sozinho + "Voltar".</b><br><br>' +
      'No placar ao vivo de torneio não há mais o botão "Confirmar Resultado" — assim que o último ponto é lançado, o resultado já vai pra chave automaticamente. Na tela de fim de jogo (com as estatísticas) aparece um botão <b>"← Voltar"</b> no topo, que leva direto pra esse jogo na chave (já com o resultado gravado).</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #818cf8;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.08);">' +
      '<div style="font-weight:800; color:#a5b4fc; font-size:1rem; margin-bottom:8px;">🎚️ v2.1.38-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(5 de Junho, 2026)</span></div>' +
      '<p><b>Volume nos botões em todo o app.</b><br><br>' +
      'O relevo almofadado 3D dos botões padrão agora vale também pros botões que ainda usavam estilo solto — diálogos de confirmar/cancelar (ex.: apagar torneio) e qualquer botão com cor sólida pela interface. Botões transparentes/fantasma e de ícone seguem lisos de propósito.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #818cf8;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.08);">' +
      '<div style="font-weight:800; color:#a5b4fc; font-size:1rem; margin-bottom:8px;">🎚️ v2.1.37-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(5 de Junho, 2026)</span></div>' +
      '<p><b>Botões do placar ao vivo com o mesmo "volume" do app.</b><br><br>' +
      'Os botões do placar ao vivo (somar/diminuir ponto, Configurar, Resetar e Fechar) agora têm o mesmo relevo almofadado 3D dos botões padrão do app — brilho no topo e sombra embaixo, com o efeito de afundar ao tocar.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fb923c;border-radius:12px;padding:14px 16px;background:rgba(249,115,22,0.08);">' +
      '<div style="font-weight:800; color:#fdba74; font-size:1rem; margin-bottom:8px;">🟠 v2.1.36-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(5 de Junho, 2026)</span></div>' +
      '<p><b>Tag "Repescagem" no time, não no jogo.</b><br><br>' +
      'A tag de repescagem agora aparece ao lado do <b>time que entrou por repescagem</b> (só na rodada em que ele entrou), em vez de marcar o jogo inteiro. Quem avançou por vitória <b>não</b> recebe a tag — mesmo que tenha passado por repescagem numa rodada anterior.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🟢 v2.1.35-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(5 de Junho, 2026)</span></div>' +
      '<p><b>Placar ao vivo usa a pontuação certa (games/sets).</b><br><br>' +
      'No placar ao vivo, se o torneio não tinha um sistema de pontuação configurado, ele agora usa o <b>padrão do esporte</b> — Beach Tennis, Tênis, Padel, Pickleball etc. passam a contar <b>games, sets e tiebreak</b> e mostram o placar de games, em vez de pontos soltos. Se o torneio tem regras próprias configuradas, elas são respeitadas.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #64748b;border-radius:12px;padding:14px 16px;background:rgba(100,116,139,0.08);">' +
      '<div style="font-weight:800; color:#cbd5e1; font-size:1rem; margin-bottom:8px;">🧪 v2.1.34-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(5 de Junho, 2026)</span></div>' +
      '<p><b>Placeholders não repetem mais o número.</b><br><br>' +
      'No botão de teste ➕ Placeholders, a numeração agora considera os nomes que já viraram duplas (ex. "Placeholder 19 / Placeholder 08") e os que estão nos jogos — numerando a partir do maior já usado. Antes, em levas diferentes, recriava nomes repetidos (Placeholder 19 duas vezes).</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #818cf8;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.08);">' +
      '<div style="font-weight:800; color:#a5b4fc; font-size:1rem; margin-bottom:8px;">⭐ v2.1.33-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(5 de Junho, 2026)</span></div>' +
      '<p><b>Datas em branco + template não duplica nome.</b><br><br>' +
      '(1) Ao criar um torneio novo (ou usar template), os campos de <b>data e horário ficam em branco</b> — nada é sugerido, evitando confusão. (2) Ao <b>Salvar Template</b> com um nome que já existe, o app pergunta se quer <b>substituir</b> o template existente; se cancelar, não grava duplicado.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #818cf8;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.08);">' +
      '<div style="font-weight:800; color:#a5b4fc; font-size:1rem; margin-bottom:8px;">⭐ v2.1.32-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(5 de Junho, 2026)</span></div>' +
      '<p><b>Template salva TUDO + local preferido com 1 clique.</b><br><br>' +
      '(1) O <b>Salvar Template</b> agora grava <b>todas</b> as configurações — inclusive inscrições abertas após o sorteio, novos confrontos, lançamento de resultado, W.O., categorias por idade, agendamento de Liga, tempos, local completo e logo. Antes deixava várias de fora. (2) Ao criar um torneio, se você tem <b>locais preferidos</b> no perfil, eles aparecem como atalhos abaixo do campo de local — um clique preenche tudo.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #38bdf8;border-radius:12px;padding:14px 16px;background:rgba(56,189,248,0.08);">' +
      '<div style="font-weight:800; color:#7dd3fc; font-size:1rem; margin-bottom:8px;">🔵 v2.1.31-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(5 de Junho, 2026)</span></div>' +
      '<p><b>Painel do "resto" anuncia o número certo.</b><br><br>' +
      'O painel de resolução já <b>agia</b> certo (mandando todos os que sobram pra lista de espera), mas <b>anunciava</b> o número errado (só o avulso). Agora mostra o total real: ex. 19 inscritos numa dupla → <b>8 times, 3 na espera</b> (antes dizia "1 resto"). Contagem consistente em todas as opções (Lista de Espera / Exclusão).</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🟢 v2.1.30-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(5 de Junho, 2026)</span></div>' +
      '<p><b>Correção de erro no login (iOS).</b><br><br>' +
      'Corrigido um erro silencioso no iPhone (Safari/Chrome) ao posicionar o cursor em campos de e-mail — afetava 8 pessoas no painel de redefinição de senha e na máscara de telefone. Sem impacto visível, mas limpava o log de erros.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #38bdf8;border-radius:12px;padding:14px 16px;background:rgba(56,189,248,0.08);">' +
      '<div style="font-weight:800; color:#7dd3fc; font-size:1rem; margin-bottom:8px;">🔵 v2.1.29-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(5 de Junho, 2026)</span></div>' +
      '<p><b>Lista de Espera sem BYE (de verdade) + nome de rodada correto.</b><br><br>' +
      '(1) Ao escolher <b>Lista de Espera</b>, toda a sobra que não fecha uma potência de 2 de duplas/times completos vai pra espera — <b>zero BYE</b>. Ex.: 19 avulsos numa dupla → 16 entram (8 duplas) e <b>3 vão pra espera</b> (antes ia só 1 e sobrava um BYE). (2) O nome da rodada agora respeita posição <b>e</b> contagem: Final (1 jogo), Semifinais (2, penúltima), Quartas (4, antepenúltima), Oitavas (8, 4ª de trás pra frente). Uma rodada antes das quartas com 4 jogos vira <b>"Rodada N"</b>, não "Quartas".</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #64748b;border-radius:12px;padding:14px 16px;background:rgba(100,116,139,0.08);">' +
      '<div style="font-weight:800; color:#cbd5e1; font-size:1rem; margin-bottom:8px;">🧪 v2.1.28-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(5 de Junho, 2026)</span></div>' +
      '<p><b>Botão "+ Placeholders" (organizador) pra testes.</b><br><br>' +
      'Nas ferramentas do organizador há um botão <b>➕ Placeholders</b> que pergunta quantos inscritos de teste incluir e cria na hora. Antes do sorteio eles entram nos <b>inscritos</b>; depois do sorteio entram na <b>lista de espera</b> (útil pra testar inscrição tardia). Só o organizador vê.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #38bdf8;border-radius:12px;padding:14px 16px;background:rgba(56,189,248,0.08);">' +
      '<div style="font-weight:800; color:#7dd3fc; font-size:1rem; margin-bottom:8px;">🔵 v2.1.27-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(5 de Junho, 2026)</span></div>' +
      '<p><b>Nome das rodadas por nº de jogos + Lista de Espera sem BYE.</b><br><br>' +
      '(1) A rodada agora se chama pelo <b>número de jogos</b>: 8 jogos = Oitavas, 4 = Quartas, 2 = Semifinais, 1 = Final — qualquer outro número vira "Rodada N" (antes uma rodada com 7 jogos aparecia errada como "Oitavas"). (2) Na resolução de potência de 2, a opção <b>Lista de Espera</b> nunca gera BYE: toda a sobra vai pra espera e a chave fica exata. O organizador escolhe <b>quem espera</b> — os <b>últimos a se inscrever</b> ou um <b>sorteio livre</b> entre todos os inscritos.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #a855f7;border-radius:12px;padding:14px 16px;background:rgba(168,85,247,0.08);">' +
      '<div style="font-weight:800; color:#c4b5fd; font-size:1rem; margin-bottom:8px;">⚡ v2.1.26-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(5 de Junho, 2026)</span></div>' +
      '<p><b>Tardios entram DENTRO da chave (integração real).</b><br><br>' +
      'Reescrevemos o fluxo de "fim de tarde": agora os jogos dos tardios entram na <b>própria chave</b> (não mais numa seção à parte). Quando 4 acumulam na espera, viram uma dupla cada e um novo jogo aparece na <b>rodada 1</b> (em roxo, com a mesma cara dos outros). A chave se <b>redesenha sozinha pra próxima potência de 2</b>: as rodadas se renomeiam (quartas vira 1ª rodada, semis viram quartas…), os vencedores (originais e tardios) vão avançando, e quando a rodada 1 termina os <b>melhores derrotados</b> (de todos os jogos) entram por <b>repescagem</b> pra fechar a potência de 2. Os tardios também aparecem na <b>lista de inscritos</b> pra marcar presença/W.O. como qualquer um.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fb923c;border-radius:12px;padding:14px 16px;background:rgba(249,115,22,0.08);">' +
      '<div style="font-weight:800; color:#fdba74; font-size:1rem; margin-bottom:8px;">🟠 v2.1.24-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(5 de Junho, 2026)</span></div>' +
      '<p><b>Jogos de repescagem com cor própria.</b><br><br>' +
      'Os jogos de repescagem (quando o número de inscritos não fecha a potência de 2 e os melhores derrotados disputam uma vaga) agora aparecem destacados em <b>laranja</b> com um selo "Repescagem" — fica fácil distinguir do chaveamento principal. Só mudança visual.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #a855f7;border-radius:12px;padding:14px 16px;background:rgba(168,85,247,0.08);">' +
      '<div style="font-weight:800; color:#c4b5fd; font-size:1rem; margin-bottom:8px;">⚡ v2.1.23-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(5 de Junho, 2026)</span></div>' +
      '<p><b>Jogos extras: vencedores contra vencedores (fase 2).</b><br><br>' +
      'Os jogos extras de tardios agora formam uma <b>mini-chave própria</b>: quando dois jogos do mesmo nível terminam, o app já cria o confronto seguinte entre os vencedores (1A∧1B → <b>2A</b>, e assim por diante). Quem chegou cedo não fica esperando — vai jogando assim que tem adversário. A seção mostra as colunas por nível (sorteio de duplas → vencedores). A entrada desses qualificados no chaveamento principal (com repescagem dos melhores derrotados pra recompor a potência de 2) é a próxima etapa.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #a855f7;border-radius:12px;padding:14px 16px;background:rgba(168,85,247,0.08);">' +
      '<div style="font-weight:800; color:#c4b5fd; font-size:1rem; margin-bottom:8px;">⚡ v2.1.22-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(5 de Junho, 2026)</span></div>' +
      '<p><b>Jogos extras pra quem chega depois (fase 1).</b><br><br>' +
      'Em torneios de eliminatória com inscrição aberta após o sorteio (toggle "novos confrontos"), quando <b>4 pessoas juntam na lista de espera</b>, o app sorteia 2 duplas e cria automaticamente um <b>jogo extra</b> — numerado <b>1A, 1B, 1C…</b> e destacado em roxo numa seção própria do chaveamento. As duplas já sorteadas antes são mantidas.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v2.1.21-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(4 de Junho, 2026)</span></div>' +
      '<p><b>Liga: prazo de inscrição não atrapalha mais + tag de rodadas.</b><br><br>' +
      '(1) Ao mudar um torneio pra <b>Liga</b> (inscrições sempre abertas), o app não exige mais que o prazo de inscrição seja antes do início — esse prazo não se aplica à Liga (e o valor residual é limpo). (2) No agendamento de sorteios, ao lado de "repetir a cada X dias", aparece uma tag com as <b>rodadas previstas</b> (≈ N), calculada do 1º sorteio até o fim do torneio no intervalo escolhido.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v2.1.20-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(4 de Junho, 2026)</span></div>' +
      '<p><b>Sorteio de duplas: gênero + modo equilibrado.</b><br><br>' +
      'Em torneios de duplas com homens e mulheres no mesmo sorteio (sem categoria masc/fem separada), ao clicar em <b>Sortear</b> aparece uma tela pra: (1) definir o <b>gênero de quem está sem</b> — que também é salvo no perfil; (2) escolher <b>Livre</b> (ao acaso) ou <b>⚖️ Equilibrado</b>, que <b>evita duplas 100% masculinas</b> distribuindo as mulheres (se faltarem, faz o melhor possível e avisa).</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v2.1.19-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(4 de Junho, 2026)</span></div>' +
      '<p><b>E-mails de notificação agrupados (menos mensagens).</b><br><br>' +
      'Pra evitar excesso de e-mails, as notificações agora <b>acumulam e saem juntas num e-mail só</b>, por janela de importância: <b>fundamental ~5 min · importante ~15 min · geral ~30 min</b>. Cada item no e-mail vem com a cor da importância (🔴/🟠/🟢). E-mails de <b>verificação de conta</b> continuam imediatos. Uma notificação mais urgente "puxa" as demais pendentes pro mesmo e-mail.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v2.1.18-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(4 de Junho, 2026)</span></div>' +
      '<p><b>Notificação de placar mais legível.</b><br><br>' +
      'O aviso de resultado pendente agora vem <b>quebrado em linhas</b>: "Fulano lançou:" / Time A · placar / vs / Time B · placar — em e-mail, WhatsApp e plataforma. Na plataforma, dois botões: <b>✅ Confirmar</b> (verde) e <b>✏️ Editar / Contestar</b> (âmbar), levando direto à chave pra responder. Esses avisos ficam como não-lidos até você responder.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v2.1.17-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(4 de Junho, 2026)</span></div>' +
      '<p><b>Notificações: cor por importância + não lidas em cima.</b><br><br>' +
      'As notificações agora têm <b>código de cor por importância</b>: 🔴 fundamental · 🟠 importante · 🟢 geral — na plataforma (borda + etiqueta) e no WhatsApp (emoji no início). E na tela de notificações as <b>não lidas ficam em cima, separadas das lidas</b>. (O acúmulo/digest de e-mail por janela de tempo vem numa próxima etapa.)</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v2.1.16-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(4 de Junho, 2026)</span></div>' +
      '<p><b>Pódio do torneio encerrado no topo, em formato de pódio.</b><br><br>' +
      'No card de um torneio encerrado, o <b>"🏆 Torneio Encerrado"</b> agora aparece <b>logo abaixo do nome</b>, com o <b>1º lugar em cima</b> (campeão, maior) e o <b>2º e 3º dividindo a linha de baixo</b> — como um pódio. Quando o torneio está encerrado, os botões <b>Convidar, Adicionar à agenda e Editar</b> deixam de aparecer (Compartilhar continua).</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v2.1.15-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(4 de Junho, 2026)</span></div>' +
      '<p><b>Notificações: WhatsApp volta a chegar + plataforma para de perder avisos.</b><br><br>' +
      '(1) <b>WhatsApp</b>: faltava a permissão na fila de envio, então nada era enfileirado desde maio — corrigido (mesmo modelo do e-mail). Quem escolheu receber por WhatsApp volta a receber. (2) <b>Na plataforma</b>: avisos diferentes do mesmo tipo/torneio no mesmo dia colapsavam num só (e os seguintes eram bloqueados) — agora cada aviso distinto é entregue. Tudo continua respeitando suas escolhas (nível: todas/importantes/fundamentais; canais: plataforma/e-mail/WhatsApp).</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v2.1.14-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(4 de Junho, 2026)</span></div>' +
      '<p><b>Filtros de modalidade/formato mais perto da lista.</b><br><br>' +
      'Na tela inicial, os filtros (Beach Tennis, Futevôlei, Eliminatórias, Rei/Rainha, etc.) foram movidos pra <b>logo acima do botão Cards/Lista</b> — coladinhos na lista de torneios que eles filtram, em vez de ficarem lá no topo.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v2.1.13-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(4 de Junho, 2026)</span></div>' +
      '<p><b>Ferramentas do Organizador subiram no card do torneio.</b><br><br>' +
      'No card de detalhes, a seção <b>"Ferramentas do Organizador"</b> (Ver Chaves, Editar, + Participante, Encerrar, etc.) agora aparece <b>acima</b> dos botões gerais (Regras, Inscritos, Imprimir, Exportar CSV, Modo TV), que passaram pro pé do card.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v2.1.12-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(4 de Junho, 2026)</span></div>' +
      '<p><b>Torneio encerrado fica visível por 24h antes de ir pra "Encerrados".</b><br><br>' +
      'Quando um torneio encerra, ele agora <b>continua na lista principal por 24h</b> — pra todo mundo ver o resultado/pódio fresquinho. Só depois disso ele vai pra seção colapsada <b>"Encerrados"</b>. Vale pra encerramento automático (final) e manual.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v2.1.11-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(4 de Junho, 2026)</span></div>' +
      '<p><b>Quadra por jogo: defina onde cada partida acontece.</b><br><br>' +
      'Quando um jogo fica <b>pronto para chamar</b> (todos presentes), o organizador agora vê um <b>seletor de quadra</b> com as quadras configuradas no torneio (campo "Quadras / nomes" na criação). Assim já dá pra dizer em qual quadra cada jogo vai. A quadra escolhida aparece marcada (📍) também pra quem está acompanhando.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v2.1.10-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(4 de Junho, 2026)</span></div>' +
      '<p><b>+ Participante: autocomplete de amigos + disponível enquanto inscrição aberta.</b><br><br>' +
      'O botão "+ Participante" do organizador agora <b>autocompleta dinâmico com seus amigos</b> (igual à Partida Casual) — é só começar a digitar (ou focar) que a lista aparece. E ele fica <b>disponível enquanto a inscrição não estiver encerrada</b> (antes sumia logo após o sorteio, mesmo com inscrição aberta por inscrição tardia); depois do sorteio, o novo participante entra na lista de espera.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v2.1.9-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(4 de Junho, 2026)</span></div>' +
      '<p><b>E-mail de confirmação no cadastro: fim das falhas silenciosas.</b><br><br>' +
      'Algumas pessoas que criavam conta por e-mail+senha <b>não recebiam o e-mail de confirmação</b>. Causa: um erro interno transitório do Firebase ao gerar o link fazia o e-mail nunca ser enviado, sem retry. Agora o envio tenta novamente (com espera crescente) tanto no servidor quanto no app, e qualquer falha residual fica registrada para monitoramento.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v2.1.8-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(4 de Junho, 2026)</span></div>' +
      '<p><b>Editar plano de ida agora grava.</b><br><br>' +
      'No Place, ao editar um "Planejar ida" já criado, as alterações <b>não eram salvas</b> — o sistema reaproveitava o plano antigo (mesmo local/horário sobreposto) sem gravar a edição. Agora a edição atualiza o plano direto. Reforço: o contexto de edição é isolado, então um plano novo nunca sobrescreve um plano antigo por engano.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v2.1.7-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(4 de Junho, 2026)</span></div>' +
      '<p><b>Leitor de QR mais geral + botão com destaque.</b><br><br>' +
      'O leitor de QR da tela inicial agora entra em <b>partida casual</b> OU em <b>torneio</b> conforme o destino do QR lido (também reconhece convite e outras telas do app). O botão ganhou <b>mais destaque</b>: virou um botão com volume (padrão novo), maior, posicionado entre os atalhos e as estatísticas.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v2.1.6-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(4 de Junho, 2026)</span></div>' +
      '<p><b>A final encerra o evento (eliminatórias).</b><br><br>' +
      'Ao lançar o resultado da <b>final</b>, o torneio agora declara campeão + vice, <b>encerra as inscrições</b> e marca o evento como <b>Encerrado</b> na hora — antes ele ficava travado esperando a disputa de 3º lugar, e com inscrição tardia ligada as inscrições continuavam abertas após a final. A disputa de 3º lugar pode ser lançada depois (preenche 3º/4º) sem reabrir o torneio. Reforço extra: torneio <b>Liga</b> encerrado também fecha a inscrição.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v2.1.5-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(4 de Junho, 2026)</span></div>' +
      '<p><b>Lista de espera agora persiste de verdade.</b><br><br>' +
      'Quem se inscrevia <b>depois do sorteio/início</b> via "você está na lista de espera", mas a inscrição <b>não era salva no servidor</b> — o organizador nunca via a pessoa em Inscritos e o card dela continuava "Inscrever-se". Causa: as regras do banco bloqueavam (silenciosamente) o novo inscrito de se escrever na lista de espera. Corrigido: (1) regra liberada para inscrição tardia; (2) se o salvamento falhar, agora você é avisado em vez de ver um sucesso falso; (3) o card da home reconhece quem está na lista de espera e mostra a tag <b>"⏳ Lista de espera"</b> + <b>"Sair da lista de espera"</b>; (4) o botão vermelho da lista de espera deixou de mostrar texto cru.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v2.1.4-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(4 de Junho, 2026)</span></div>' +
      '<p><b>Inscrições tardias: status correto também na home.</b><br><br>' +
      'Com "Fechadas" desligado, o torneio mostrava "Inscrições Encerradas" no card da home depois do sorteio (o detalhe já estava certo). Agora o card também mostra <b>"Inscrições Abertas"</b> — e continua aberto mesmo <b>depois de iniciar</b>, até o organizador clicar em Encerrar.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v2.1.3-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(4 de Junho, 2026)</span></div>' +
      '<p><b>Correções na lista de espera (inscrição tardia).</b><br><br>' +
      '(1) <b>Tela de Inscritos não fica mais preta</b> — havia um erro que travava a página de inscritos do torneio (afetava todo torneio sorteado-não-iniciado). (2) Quem entra na <b>lista de espera</b> agora vê corretamente a tag <b>"⏳ Lista de espera"</b> e o botão <b>"Sair da lista de espera"</b> — antes aparecia "Inscrever-se" como se não estivesse inscrito.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v2.1.2-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(4 de Junho, 2026)</span></div>' +
      '<p><b>Sortear com "Fechadas" desligado não pede mais para encerrar.</b><br><br>' +
      'Complemento da v2.1.0: quando "Fechadas" está desligado, clicar em <b>Sortear</b> não mostra mais o aviso "encerrar inscrições prematuramente". Em vez disso, confirma o sorteio deixando claro que as <b>inscrições continuam abertas</b> (novos vão para a lista de espera) — e você fecha quando quiser em "Encerrar Inscrições".</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v2.1.1-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(4 de Junho, 2026)</span></div>' +
      '<p><b>Fim do "Usuário" fantasma no Explorar.</b><br><br>' +
      'Aquele perfil "Usuário" sem nome que aparecia na lista de pessoas era um resto de conta excluída no banco — <b>removido na fonte</b>. Além disso, a lista de pessoas para convidar agora <b>não mostra</b> contas duplicadas (já mescladas) nem quem desativou "aceitar convites de amizade" no perfil.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v2.1.0-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(4 de Junho, 2026)</span></div>' +
      '<p><b>Inscrições tardias: sortear não fecha mais as inscrições.</b><br><br>' +
      'Quando a opção "Fechadas" (em <i>Inscrições após o encerramento</i>) está <b>desligada</b>, fazer o sorteio <b>não encerra mais as inscrições</b> — elas seguem abertas e novos inscritos vão para a lista de espera. Agora as inscrições só fecham quando o organizador clica em <b>Encerrar Inscrições</b> (que também passa a aparecer depois do sorteio nesse modo, podendo reabrir). Com "Fechadas" ligada, nada muda — o sorteio fecha as inscrições como antes.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v2.0.9-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(4 de Junho, 2026)</span></div>' +
      '<p><b>CTA da landing sempre com margem + botões de e-mail no mesmo estilo.</b><br><br>' +
      'Na tela inicial, o botão "ENTRAR no scoreplace.app" não cola mais nas laterais em telas estreitas — o texto reduz e quebra com elegância, sempre com folga. E os <b>botões dos e-mails</b> que o app envia (entrar, confirmar conta, etc.) agora têm o mesmo aspecto 3D dos botões do app.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v2.0.8-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(4 de Junho, 2026)</span></div>' +
      '<p><b>Fim da tela separada de chaveamento.</b><br><br>' +
      'A página separada de chaveamento foi removida. Agora <b>tudo acontece na página do torneio</b>, na própria seção de chaveamento: "Ir para Torneio" (em Meus Resultados) leva direto pra <b>aquele jogo</b> na chave, e qualquer link/atalho que antes abria a tela separada já cai na seção de chaveamento do torneio. Menos telas, sem perder o contexto.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v2.0.7-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(4 de Junho, 2026)</span></div>' +
      '<p><b>Botões com aspecto "almofadado" (mais volume de verdade).</b><br><br>' +
      'Trocamos o relevo: agora o volume vem do <b>brilho no topo</b> (afastado da borda) + uma <b>sombra degradê suave</b> descendo até a borda — dando aquele aspecto inflado/glossy de botão de jogo, em vez da sombra "em degrau". Os grandes ficam mais bombados; os pequenos, sutis.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v2.0.6-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(4 de Junho, 2026)</span></div>' +
      '<p><b>Brilho dos botões em onda (não mais todos juntos).</b><br><br>' +
      'O brilho que passa nos botões agora é <b>dessincronizado</b> — quando há vários numa tela, eles não piscam todos ao mesmo tempo. Na caixa de atalhos da home, os <b>5 botões</b> (Partida Casual, Novo Torneio, Place, e agora também <b>Pessoas</b> e <b>Convidar</b>) brilham em <b>sequência</b>, formando uma ondinha.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v2.0.5-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(4 de Junho, 2026)</span></div>' +
      '<p><b>Botões com mais volume.</b><br><br>' +
      'Aumentamos a <b>profundidade 3D</b> dos botões — mais altura e relevo, com o "afundar" ao tocar proporcional. Os botões grandes (Entrar, Inscrever-se) ganharam ainda mais volume; os pequenininhos seguem com um relevo sutil.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v2.0.4-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(4 de Junho, 2026)</span></div>' +
      '<p><b>Torneio encerra sozinho ao sagrar o campeão + duração registrada.</b><br><br>' +
      'Tinha um bug: torneios de <b>Eliminatórias Simples</b> ficavam "em andamento" mesmo depois de definir o campeão — o relógio não parava. Corrigido: ao decidir a final, o torneio passa automaticamente para <b>encerrado</b>, e a <b>duração</b> (do início até o campeão) fica registrada e aparece no quadro do campeão (⏱️). Torneios que já estavam travados foram destravados.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v2.0.3-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Junho, 2026)</span></div>' +
      '<p><b>Posição final em destaque.</b><br><br>' +
      'Em "Meus Resultados", a colocação final agora aparece <b>grande e em destaque</b> — só "<b>2º lugar 🥈</b>" (sem o "Você terminou em"), com a fonte bem maior.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v2.0.2-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Junho, 2026)</span></div>' +
      '<p><b>Mesclar participantes unificado — celular e durante a partida.</b><br><br>' +
      'A mesclagem (placeholder → pessoa real) agora funciona <b>no celular</b> (arrastar com toque), inclusive <b>durante o torneio já iniciado</b>, e sempre com a escolha de <b>🟡 Mesclar</b> ou <b>🔵 Formar equipe</b> + o <b>↩️ Desfazer</b> no card. Antes, no celular, o arrastar fazia a mescla direto, sem escolha nem desfazer.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v2.0.1-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Junho, 2026)</span></div>' +
      '<p><b>Botões com cara de 3D — volume, luz e o clique que "afunda".</b><br><br>' +
      'Todos os botões ganharam um leve <b>relevo 3D</b> (sombra de profundidade + luz no topo) e o efeito de <b>afundar ao tocar</b>, deixando tudo mais tátil. Nos botões de ação mais importantes (Entrar, Inscrever-se, etc.) passa também um <b>brilho a cada 3s</b>, chamando a atenção. Tudo em CSS puro, sem custo de performance, e respeitando quem usa "reduzir movimento".</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #6366f1;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.08);">' +
      '<div style="font-weight:800; color:#a5b4fc; font-size:1.05rem; margin-bottom:8px;">🎉 v2.0.0-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Junho, 2026)</span></div>' +
      '<p><b>Mesclar participantes (organizador) — placeholders viram pessoas reais.</b><br><br>' +
      'Pensado pra torneios informais de fim de tarde: o organizador adiciona alguns <b>placeholders</b> (ex.: "Vaga 1") junto dos inscritos e já faz o sorteio. Conforme a galera chega, é só <b>arrastar a pessoa sobre o placeholder</b> — ao soltar, aparecem dois botões: <b>🟡 Mesclar participante</b> (a pessoa assume a vaga e entra nos jogos do placeholder na chave) e <b>🔵 Formar equipe</b> (junta os dois numa dupla, como antes). A mesclagem pede confirmação e deixa um botão <b>↩️ Desfazer</b> no card. Funciona na tela de <b>Inscritos</b>.<br><br>' +
      '<span style="color:var(--text-muted); font-size:0.85rem;">Em breve: arrastar-pra-mesclar também durante a partida (com o torneio já iniciado).</span></p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v1.9.99-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Junho, 2026)</span></div>' +
      '<p><b>Posição final em destaque + classificação mais clara.</b><br><br>' +
      'Em "Meus Resultados", quando sua participação no torneio encerra, agora aparece <b>a posição em que você terminou</b> (ex.: "🥈 Você terminou em 2º lugar") logo acima da chave. E na <b>Classificação</b> do torneio, a posição numérica (1º, 2º, 3º, 4º…) fica sempre à esquerda do nome e a <b>medalha</b> (🥇🥈🥉) passou para a <b>direita</b> da equipe — antes a medalha ocupava o lugar do número e quebrava a leitura quando havia 4º, 5º, 6º…</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v1.9.98-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Junho, 2026)</span></div>' +
      '<p><b>Fim dos botões duplicados na página do torneio.</b><br><br>' +
      'A página do torneio tinha conjuntos de botões repetidos (um no topo e outro junto do chaveamento). Agora cada um aparece <b>uma vez só</b>: <b>participantes</b> veem <b>Ver Chaves, Inscritos e Regras</b>; <b>organizadores</b> continuam com todos os botões (Imprimir, CSV, Modo TV, Editar, Comunicar, etc.), sem repetição.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v1.9.97-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Junho, 2026)</span></div>' +
      '<p><b>"Ver Chaves" agora rola direto pro seu próximo jogo.</b><br><br>' +
      'Na página do torneio, o botão <b>Ver Chaves</b> não abre mais uma tela separada — ele rola até a chave (que já fica na própria página) <b>posicionada no próximo jogo</b>: se você é organizador, no próximo jogo a ser realizado; se é participante, no <b>seu</b> próximo jogo. Menos cliques, sem perder o contexto da página do torneio.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v1.9.96-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Junho, 2026)</span></div>' +
      '<p><b>Tudo liberado no beta + dicas pausadas.</b><br><br>' +
      'Durante o beta, <b>todos os recursos estão liberados gratuitamente para todo mundo</b> — sem limite de torneios, sem limite de participantes, logo personalizada, Modo TV sem marca. O botão "Pro" e a cobrança ficam pausados por enquanto (voltam mais pra frente). Também <b>desativamos as dicas/balões contextuais</b> temporariamente, que estavam mais atrapalhando do que ajudando. Ambos voltam no futuro.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v1.9.95-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Junho, 2026)</span></div>' +
      '<p><b>Card de placar pendente no celular: largura fixa + botões organizados.</b><br><br>' +
      'No fluxo de aprovação (ex.: revisar um placar contestado), o card da chave estava <b>esticando demais</b> no celular e cortando os botões. Agora ele mantém a largura e <b>quebra em linhas</b>: a tag PENDENTE e o "Aguardando aprovação" ficam empilhados no canto, e os botões ganham uma linha própria — sempre na ordem <b>Contestar (vermelho) à esquerda, Confirmar (verde) à direita</b>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v1.9.94-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Junho, 2026)</span></div>' +
      '<p><b>Fim do "pulo" de scroll ao abrir o app.</b><br><br>' +
      'Ao entrar, a dashboard atualizava algumas vezes em segundos (carregando torneios e o feed público) e cada atualização <b>jogava a tela de volta pro topo</b> — atrapalhando quem tentava rolar pra baixo. Agora essas atualizações <b>preservam a sua posição de rolagem</b>. Além disso, o pulo automático para um jogo aguardando aprovação só acontece na primeira abertura e <b>não te interrompe</b> se você já começou a rolar a tela.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v1.9.93-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Junho, 2026)</span></div>' +
      '<p><b>Placar pendente não cresce mais o card da chave.</b><br><br>' +
      'Quando um resultado é lançado e fica aguardando aprovação, o aviso "⏳ Aguardando aprovação" e os botões <b>Editar/Confirmar</b> voltaram para a <b>linha do cabeçalho</b> (do lado do "JOGO 1" e da tag PENDENTE) — antes apareciam dentro de um box âmbar novo que aumentava o tamanho do card. Agora o card pendente fica do mesmo tamanho do normal.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v1.9.92-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Junho, 2026)</span></div>' +
      '<p><b>Torneios públicos novos aparecem em tempo real (sem atualizar a página).</b><br><br>' +
      'Quando alguém cria, abre ou altera um torneio público, ele agora aparece para os outros usuários <b>na hora</b>, sem precisar atualizar. Antes o feed de descoberta só atualizava ao recarregar a página, então um torneio recém-criado parecia "invisível" para quem já estava com a dashboard aberta — na verdade sempre esteve lá, era só o feed que não se atualizava sozinho.<br><br>' +
      '<span style="color:var(--text-muted); font-size:0.85rem;">Por baixo: a descoberta passou a usar um índice leve em tempo real, mantido no servidor, que só dispara quando algo relevante muda — eficiente e barato (não reage a cada ponto de placar). O caminho antigo continua como rede de segurança.</span></p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v1.9.90-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Junho, 2026)</span></div>' +
      '<p><b>Fim do "Usuário" fantasma na lista de amigos.</b><br><br>' +
      'Um amigo aparecia como <b>"Usuário"</b> (sem nome) — era um resto de conta excluída cuja referência ficou na lista de amigos. Corrigido em 3 camadas: (1) o login por e-mail não cria mais perfil sem identidade; (2) ao excluir uma conta, o app remove o usuário das listas de amigos de todo mundo; (3) a lista de amigos ignora perfis-fantasma (sem nome/e-mail/telefone). O caso atual foi limpo no banco. Também blindamos um erro do Sentry em campos de e-mail.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v1.9.89-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Junho, 2026)</span></div>' +
      '<p><b>Aprovação de resultado: edição mais limpa + histórico na disputa.</b><br><br>' +
      'Ao clicar em <b>Editar</b> um placar pendente, o bloco "Aguardando aprovação" com Editar/Confirmar agora <b>some enquanto você edita</b> — ficam só Cancelar/Confirmar. Ao cancelar ou confirmar, o Editar volta (pra corrigir de novo). E na <b>disputa</b>, o organizador agora vê o histórico: <b>quem propôs qual placar</b> e <b>quem revisou pra qual placar</b>, antes de decidir o resultado definitivo.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v1.9.87-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Junho, 2026)</span></div>' +
      '<p><b>Place: agora dá pra EDITAR o plano de ida (não só cancelar).</b><br><br>' +
      'Enquanto você não chega ao local, é um <b>plano de ida</b> — e agora dá pra <b>✏️ Editar</b> (mudar horário/modalidade) <b>ou ❌ Cancelar</b>, mesmo depois de passada a hora marcada de chegada. O "Editar" abre o formulário já preenchido com os horários do plano; ao confirmar, substitui o plano antigo. (Ao chegar no local, vira presença, com saída automática se você sair do raio ou tocar em sair.)</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v1.9.86-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Junho, 2026)</span></div>' +
      '<p><b>Place: botão "Cancelar plano" aparece mesmo depois da hora marcada.</b><br><br>' +
      'Se você planejou ir a um local às 16h e o horário já passou (mas o plano ainda não terminou), o card mostrava "Planejar ida" em vez de "Cancelar plano" — não dava pra cancelar. Causa: o app só reconhecia o plano como ativo se a hora de início ainda estivesse no futuro. Corrigido: um plano é considerado ativo até a hora de <b>término</b>, então o botão <b>"❌ Cancelar plano"</b> aparece corretamente mesmo passada a hora de chegada.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #ef4444;border-radius:12px;padding:14px 16px;background:rgba(239,68,68,0.07);">' +
      '<div style="font-weight:800; color:#f87171; font-size:1rem; margin-bottom:8px;">🔴 v1.9.85-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Junho, 2026)</span></div>' +
      '<p><b>Correção de raiz: sorteio de duplas preserva a identidade dos jogadores.</b><br><br>' +
      'O sorteio que forma as duplas estava transformando os participantes em <b>texto puro</b> ("A / B"), <b>jogando fora os uid/e-mail</b> de cada um. Isso causava DOIS bugs: (1) o torneio sumia para os participantes depois do sorteio; (2) o placar lançado por um participante ia <b>direto para definitivo</b>, pulando o fluxo de aprovação de 4 fases (porque o app não conseguia identificar o time adversário). Agora cada dupla é guardada como um <b>objeto que mantém os uid/e-mail</b> dos dois jogadores — a membership e o fluxo de aprovação voltam a funcionar. Vale para Eliminatórias e Grupos.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #ef4444;border-radius:12px;padding:14px 16px;background:rgba(239,68,68,0.07);">' +
      '<div style="font-weight:800; color:#f87171; font-size:1rem; margin-bottom:8px;">🔴 v1.9.84-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Junho, 2026)</span></div>' +
      '<p><b>Correção: torneio sumia para os participantes depois do sorteio.</b><br><br>' +
      'Depois do sorteio, o torneio desaparecia da tela dos participantes (só o organizador via). <b>Causa:</b> a lista interna de membros por <code>uid</code> era recalculada do zero a cada save e, como o sorteio reorganiza os participantes em duplas/chave, o uid às vezes se perdia — aí o torneio saía do "feed" do participante. <b>Correção:</b> essa lista agora <b>nunca encolhe</b> (igual já era com os e-mails) — um participante, uma vez membro, não é mais removido por um save. Os torneios já afetados foram reparados no banco.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v1.9.83-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Junho, 2026)</span></div>' +
      '<p><b>E-mail de confirmação bonito (com botão) e do remetente certo.</b><br><br>' +
      'O e-mail de confirmação de conta não vem mais do remetente <code>noreply@…firebaseapp.com</code> (que caía no spam) e nem é só um link cru. Agora é enviado de <b>scoreplace.app@gmail.com</b>, com visual do app e um <b>botão verde grande "✅ Confirmar minha conta"</b>. Inclui também versão em texto e link de fallback. Bem mais difícil de cair no lixo eletrônico.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v1.9.82-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Junho, 2026)</span></div>' +
      '<p><b>Excluir conta agora libera o e-mail de verdade.</b><br><br>' +
      'Antes, ao excluir a conta, o login (Firebase Auth) às vezes não era apagado — então o e-mail ficava "já em uso" e você não conseguia recriar a conta. Agora, se o Firebase pedir confirmação recente, o app pede sua <b>senha</b> (ou re-login Google) e <b>apaga a conta de login de vez</b>, liberando o e-mail pra recriar. Se você cancelar a confirmação, avisamos que o e-mail pode continuar reservado.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v1.9.81-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Junho, 2026)</span></div>' +
      '<p><b>Torneio cancelado some da tela de todos na hora.</b><br><br>' +
      'Quando o organizador apaga um torneio, os participantes recebem a notificação <b>"🗑️ Torneio cancelado"</b> e o torneio <b>desaparece da tela deles imediatamente</b> — sem precisar dar refresh. Se algum participante estava <b>vendo a página do torneio</b> (chave, inscritos, regras) na hora em que foi apagado, ele é levado de volta ao início com o aviso "Esse torneio não está mais disponível".</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v1.9.80-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Junho, 2026)</span></div>' +
      '<p><b>+Participante: nome simples direto, sem perguntas.</b><br><br>' +
      'No "+ Participante" (e ao escolher parceiro de dupla), digitar um nome que não é usuário agora <b>adiciona direto como nome</b> — acabou a pergunta "Usar X como nome". O autocomplete sugere apenas seus <b>amigos</b> (com foto, vinculando a conta). Você <b>não pode mais incluir um usuário que não é seu amigo</b>: nomes de não-amigos entram só como texto, sem vínculo de conta. O botão Adicionar habilita assim que você digita.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v1.9.79-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Junho, 2026)</span></div>' +
      '<p><b>Torneios públicos em ordem de urgência pra todo mundo.</b><br><br>' +
      'O feed de torneios públicos agora é ordenado pelo <b>próximo evento</b> (encerramento das inscrições, início ou término) — os <b>mais urgentes primeiro</b>. Usuário novo, sem locais preferidos nem amigos, já vê os torneios públicos normalmente (e os privados pra que foi convidado). Enquanto o feed carrega, aparece "Procurando torneios…" em vez de "nenhum torneio". A cidade do perfil entra como leve desempate. <i>(Filtros "só amigos" e "só locais preferidos" virão em seguida.)</i></p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v1.9.78-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Junho, 2026)</span></div>' +
      '<p><b>Confirmação de e-mail obrigatória ao criar conta.</b><br><br>' +
      'Ao criar conta com e-mail, agora enviamos um <b>link de confirmação</b> pro seu e-mail. Aparece uma tela avisando pra você abrir o e-mail e clicar em <b>Confirmar minha conta</b>. Enquanto não confirmar, não dá pra usar o app (e o sistema não mescla nem sugere nada). Assim que confirmar e clicar em <b>"Já confirmei"</b>, você entra direto no <b>perfil</b> pra completar seus dados. Quem entra com <b>Google</b> já vem confirmado e não precisa disso.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v1.9.77-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Junho, 2026)</span></div>' +
      '<p><b>Fase 4 (placar contestado): caminho único e claro.</b><br><br>' +
      'Quando um resultado está <b>em disputa</b>, os jogadores agora não têm botão nenhum — só a tag <b>PENDENTE</b>. O organizador resolve por um painel único com 3 opções: <b>✅ Confirmar placar (X × Y)</b> (aceita o placar atual como definitivo), <b>✏️ Editar placar</b> (lança outro) e <b>🔄 Refazer (0×0)</b>. Antes apareciam botões conflitantes (Confirmar no corpo + Lançar definitivo no painel) e o jogo travava. Ao confirmar, a tag PENDENTE some, o resultado fica final (verde) e os envolvidos são notificados.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v1.9.76-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Junho, 2026)</span></div>' +
      '<p><b>Fase 4 do fluxo de resultado: organizador finaliza de verdade.</b><br><br>' +
      'Quando um placar lançado pelos jogadores é editado e contestado, o organizador resolve na Fase 4. <b>Bug corrigido:</b> ao lançar o placar definitivo, o editor inline sempre criava uma nova contra-proposta em vez de finalizar — o jogo ficava preso "pendente" sem nenhum botão. Agora, quando quem confirma é o <b>organizador/co-host/árbitro</b>, o resultado é aplicado direto como definitivo (e <b>0×0</b> = refazer a partida). Edições do organizador em qualquer fase também passam a valer na hora.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v1.9.75-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Junho, 2026)</span></div>' +
      '<p><b>Login mais esperto: sugere o Google quando faz sentido.</b><br><br>' +
      'Se você tentar entrar com e-mail e senha mas a conta foi criada com o <b>Google</b> (sem senha de e-mail), o app agora detecta isso e oferece o botão <b>"Entrar com Google"</b> — em vez de só dizer "senha errada". Vale também pra contas antigas que só tinham link mágico: nesses casos o app sugere criar uma senha pelo "Esqueci a Senha".</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v1.9.74-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Junho, 2026)</span></div>' +
      '<p><b>Criar conta: confirmação de senha + olhinho 👁️.</b><br><br>' +
      'No "Criar Conta" agora tem <b>Senha</b> e <b>Confirmar senha</b> (digita 2x) — se não baterem, avisa antes de criar. E todo campo de senha (login e cadastro) ganhou o <b>olhinho 👁️</b> à direita pra você mostrar/ocultar e conferir o que digitou.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v1.9.73-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Junho, 2026)</span></div>' +
      '<p><b>Login simplificado: e-mail e senha ou Google.</b><br><br>' +
      'O <b>link mágico</b> e o <b>SMS</b> saíram da tela de login — estavam só complicando. Agora é direto: <b>e-mail + senha</b> ou <b>entrar com Google</b>.<br><br>' +
      '<b>Criar Conta</b> e <b>Esqueci a Senha</b> viraram botões com destaque. Ao criar conta, o app pede o <b>nome de exibição</b> (não é pedido em logins seguintes). As dicas dos campos aparecem dentro deles e ao lado dos nomes.<br><br>' +
      '<b>Já tinha conta por link mágico?</b> Use "Esqueci a Senha" uma vez pra definir sua senha — depois é só e-mail + senha.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v1.9.72-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Junho, 2026)</span></div>' +
      '<p><b>Partida casual: "Jogar" vai direto pra próxima + fim da dupla duplicada.</b><br><br>' +
      '<b>Jogar Novamente (solo):</b> ao terminar uma partida casual solo e clicar em "Jogar", o app agora vai <b>direto para uma nova partida</b> ao vivo (sem passar pela tela de configuração). O resultado anterior é salvo no histórico e, se o toggle "Re-sortear" estiver ligado, as duplas são sorteadas de novo. Em partidas com vários jogadores registrados, a tela de setup continua aparecendo (pro host re-compartilhar a sala).<br><br>' +
      '<b>Bug da dupla duplicada:</b> em alguns sorteios a dupla aparecia como "Rodrigo Barth / Rodrigo Barth". Causa: um segundo slot do time era reconhecido como o próprio usuário. Agora só um jogador pode ser o usuário, e há uma checagem que impede dois nomes iguais no mesmo time.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v1.9.71-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Junho, 2026)</span></div>' +
      '<p><b>Placar ao vivo: fim do "pulo" a cada clique.</b><br><br>' +
      'As caixas de placar e os botões ▲▼ do lado direito davam um pulinho a cada ponto marcado. Causa: a equalização de altura dos nomes rodava depois do primeiro desenho, então o lado mais curto pintava curto e logo crescia. Agora a equalização é feita <b>antes</b> do desenho — os dois lados ficam alinhados e estáveis, sem pulo. O cadeado 🔒 do saque ganhou um respiro mínimo abaixo da bola.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v1.9.70-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(2 de Junho, 2026)</span></div>' +
      '<p><b>Placar ao vivo: cadeado do saque abaixo da bola.</b><br><br>' +
      'Quando a ordem dos 4 sacadores fica travada (a partir do 3º saque), o cadeado 🔒 que aparecia ao lado da bola do sacador agora fica <b>abaixo</b> dela — economiza largura para a foto/ícone e o nome dos jogadores.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v1.9.69-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(2 de Junho, 2026)</span></div>' +
      '<p><b>Placar ao vivo: botão Configurar no cabeçalho.</b><br><br>' +
      'O botão <b>↶ Desfazer</b> do cabeçalho (que era redundante — o undo real é a setinha ↺ ao lado do placar de games, que desfaz ponto a ponto) foi substituído pelo botão <b>⚙️ Configurar</b>. Agora o cabeçalho tem: Configurar · Resetar · Fechar.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v1.9.68-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(2 de Junho, 2026)</span></div>' +
      '<p><b>Placar ao vivo: ajustes de layout em quadra.</b><br><br>' +
      '<b>Botão Configurar visível:</b> a engrenagem discreta do cabeçalho virou um botão <b>⚙️ Configurar</b> (ícone + texto), posicionado logo abaixo do "AO VIVO", à esquerda do placar de games — fácil de achar em quadra.<br><br>' +
      '<b>Placares alinhados:</b> quando um lado tem nome que quebra em mais linhas (ex.: "Rodrigo Barth" vs "Adversário 1"), os dois blocos de nome agora têm a mesma altura — as caixas de placar e os botões ▲▼ ficam alinhados entre os dois times.<br><br>' +
      '<b>Toggle "Fixar lados" alinhado:</b> o interruptor agora fica na mesma linha do rótulo, com a descrição abaixo.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🟢 v1.9.67-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(2 de Junho, 2026)</span></div>' +
      '<p><b>Botão "Entrar" gigante na landing + modalidades afastadas.</b><br><br>' +
      'O botão verde de entrada da página inicial agora tem ~3x a altura, com o texto em duas linhas grandes (<b>ENTRAR</b> em cima, <b>scoreplace.app</b> embaixo do mesmo tamanho). As pílulas de modalidades (Beach Tennis, Pickleball, etc.) foram afastadas do botão e marcadas como não-clicáveis — uma usuária chegou a perguntar "clico em beach tennis?", confundindo-as com o próximo passo. Agora fica óbvio onde clicar para entrar.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #ef4444;border-radius:12px;padding:14px 16px;background:rgba(239,68,68,0.07);">' +
      '<div style="font-weight:800; color:#f87171; font-size:1rem; margin-bottom:8px;">🔔 v1.8.45-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(31 de Maio, 2026)</span></div>' +
      '<p><b>Correção definitiva de notificações duplicadas (2–3x).</b><br><br>' +
      '<b>Causa raiz:</b> três camadas defeituosas se somavam: (1) o guard de 30s em memória expirava e o mesmo evento re-notificava; (2) a flag <code>_finishNotified</code> existia só em memória — quando o snapshot do Firestore sobrescrevia o objeto, a flag sumia e o "torneio encerrado" era re-enviado; (3) <code>addNotification</code> usava <code>.add()</code> gerando novo doc a cada chamada, sem proteção no banco.<br><br>' +
      '<b>Três correções em camadas:</b><br>' +
      '(1) <b>ID determinístico no Firestore:</b> <code>addNotification</code> agora usa <code>.set()</code> com ID calculado de <code>type|tournamentId|matchId|dia|uid</code>. Chamadas duplicadas do mesmo evento no mesmo dia sobrescrevem o mesmo doc — zero duplicatas no banco.<br>' +
      '(2) <b>Dedup em memória estendido para 5 minutos</b> (era 30s) e a chave agora inclui <code>matchId</code> — evita falso-dedup entre partidas diferentes do mesmo torneio.<br>' +
      '(3) <b>Flags de "finish notified" persistidas no Firestore</b> como <code>finishNotifiedAt</code> (ISO string). Substitui <code>_finishNotified</code> e <code>_seasonFinishNotified</code> em memória — sobrevive a page reloads e snapshots.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.07);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">🎨 v1.8.44-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(31 de Maio, 2026)</span></div>' +
      '<p><b>Luminosidade corrigida + lápis no logo + tamanho 1/3 real.</b><br><br>' +
      '<b>Luminosidade:</b> corrigida para funcionar em Safari iOS — <code>ctx.filter</code> não é suportado em iOS < 15.4. Substituído por overlay branco (clarear) / preto (escurecer) com alpha proporcional ao slider. Funciona em todos os browsers.<br><br>' +
      '<b>Lápis ✏️:</b> ícone de lápis aparece no canto inferior direito do logo no detalhe do torneio (só para o organizador), indicando que é clicável para edição.<br><br>' +
      '<b>Tamanho 1/3:</b> removido o cap de 160px que limitava o logo em telas maiores. Agora usa <code>width:33%</code> sem teto, com <code>min-width:100px</code> como piso.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.07);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">🎨 v1.8.43-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(31 de Maio, 2026)</span></div>' +
      '<p><b>Editor de logo com luminosidade + logo clicável no detalhe do torneio.</b><br><br>' +
      '<b>Luminosidade:</b> o editor de crop/zoom ganhou um segundo slider (☀−/+☀) para ajustar a luminosidade de −75% a +75%, com label de valor ao vivo. Funciona para upload de logo do torneio e foto de perfil. A luminosidade é aplicada tanto no preview quanto na imagem final exportada.<br><br>' +
      '<b>Logo clicável:</b> o organizador pode clicar diretamente no logo do torneio na tela de detalhe para trocar a imagem. Abre o seletor de arquivo → editor de crop/zoom/luminosidade → salva no Firestore e re-renderiza.<br><br>' +
      '<b>Tamanho do logo:</b> corrigido com <code>min-width:90px</code> para garantir que o logo apareça no mínimo 90px mesmo em viewports muito estreitas.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #6366f1;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.07);">' +
      '<div style="font-weight:800; color:#a5b4fc; font-size:1rem; margin-bottom:8px;">📍 v1.8.42-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(31 de Maio, 2026)</span></div>' +
      '<p><b>GPS pedido apenas uma vez por sessão, nunca mais repetidamente.</b><br><br>' +
      'O dialog de localização aparecia toda vez que o usuário abria o #Place ou entrava no app. Agora funciona assim: <b>(1)</b> Se há coordenadas em cache (< 10 min), usa sem chamar GPS. <b>(2)</b> Se não há cache mas já pediu GPS nesta sessão (sessionStorage), não pede de novo. <b>(3)</b> Se é a primeira abertura da sessão, pede GPS normalmente — o SO cuida de lembrar a resposta para as próximas sessões (iOS PWA na tela inicial, Chrome Android). O auto check-in de presença usa o mesmo cache, então o GPS funciona automaticamente sem dialog quando o usuário já concedeu.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">👤 v1.8.40-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(31 de Maio, 2026)</span></div>' +
      '<p><b>Foto e nome completo propagam para todos os torneios ao salvar o perfil.</b><br><br>' +
      '<b>Foto:</b> ao salvar o perfil com nova foto, ela agora é propagada para o objeto participante (<code>p.photoURL</code>) em todos os torneios onde o usuário está inscrito — junto com o nome quando ele também muda, ou de forma independente quando só a foto muda. Isso garante que o avatar apareça atualizado no bracket, na lista de inscritos e nas estatísticas.<br><br>' +
      '<b>Nome completo:</b> removidos todos os truncamentos de nome (<code>.split(\' \')[0]</code>) nas partidas casuais — lobby de singles, lobby de duplas, cards de histórico e tela de comparação de stats. O nome agora é armazenado e exibido exatamente como está no perfil, sem cortar no primeiro espaço.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">📸 v1.8.39-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(31 de Maio, 2026)</span></div>' +
      '<p><b>Correção: foto de perfil não era gravada ao salvar.</b><br><br>' +
      'O upload de foto funcionava visualmente (pré-visualização no avatar), mas ao clicar em Salvar a imagem não era persistida no Firestore — o campo <code>_pendingPhotoUpload</code> era setado em memória mas nunca incluído no payload de save. Corrigido: agora <code>photoURL</code> é incluído no payload quando há foto pendente, salvo no Firestore e o flag limpo após sucesso. Ao reabrir o perfil, a foto carrega corretamente do banco.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f43f5e;border-radius:12px;padding:14px 16px;background:rgba(244,63,94,0.07);">' +
      '<div style="font-weight:800; color:#fb7185; font-size:1rem; margin-bottom:8px;">♥ v1.8.38-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(30 de Maio, 2026)</span></div>' +
      '<p><b>Favoritos agora usam coração ♥ em vez de estrela ⭐.</b><br><br>' +
      'O ícone de favoritar torneios trocou de estrela (★/☆) para coração (♥/♡) em todos os pontos do app: cards do dashboard, detalhe do torneio, modo lista compacto e filtro "Favoritos" no hero. Cor ativa agora é rosa-vermelho (#f43f5e) em vez de âmbar. A estrela ⭐ ficou exclusiva do ícone de organizador/co-host. Textos do manual e dicas contextuais atualizados.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #6366f1;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.07);">' +
      '<div style="font-weight:800; color:#a5b4fc; font-size:1rem; margin-bottom:8px;">🔧 v1.8.19-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(29 de Maio, 2026)</span></div>' +
      '<p><b>Reparo automático de participantes sem nome na base de dados.</b><br><br>' +
      'A nova função <code>_repairNullIdentityParticipants()</code> é chamada automaticamente ao carregar o app. Ela encontra participantes inscritos em torneios que têm uid mas nenhum identificador textual (displayName, name ou email = null — caso de auth por celular), busca o perfil em <code>users/{uid}</code> e atualiza com o <b>e-mail</b> (preferência) ou o <b>telefone formatado</b> (<code>+55 (DDD) XXXXX-XXXX</code>) como nome de apresentação. A correção é persistida no Firestore e refletida imediatamente em toda a interface — lista de inscritos, chaveamento, check-in, dashboard, explorar. Só salva torneios onde o usuário logado é organizador ou co-organizador (respeitando as permissões do Firestore).</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #6366f1;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.07);">' +
      '<div style="font-weight:800; color:#a5b4fc; font-size:1rem; margin-bottom:8px;">🐛 v1.8.18-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(29 de Maio, 2026)</span></div>' +
      '<p><b>Correções: Participante X no torneio + notificações duplas + máscara de celular no login.</b><br><br>' +
      '<b>Bug 1 — Participante N:</b> usuários autenticados apenas por celular (sem e-mail e sem displayName no Firebase) apareciam como "Participante 3", "Participante 8" etc. nos inscritos. Correção em 3 camadas: (1) <code>_pName()</code> agora inclui <code>p.phone</code> como fallback; (2) inscrição via <code>_doEnrollCurrentUser</code> persiste <code>phone</code> no objeto do participante; (3) dois render sites em <code>tournaments.js</code> que usavam fallback inline agora passam por <code>_pName()</code>.<br><br>' +
      '<b>Bug 2 — Notificações duplicadas:</b> organizador recebia 2–3 notificações por inscrição em vez de 1. Causa: (a) em <code>_notifyTournamentParticipants</code>, o dedup do organizador falhava quando ele estava inscrito como participante sem uid — condição <code>!orgUid &&</code> impedia checar <code>seenEmails</code> quando <code>creatorUid</code> existia; (b) race entre <code>_doEnrollCurrentUser</code> e <code>_tryAutoEnroll</code>. Correção: dedup agora verifica <code>seenEmails</code> independente de orgUid existir. Adicionado guard de dedup global em <code>_sendUserNotification</code> (30s por tipo+torneio+uid).<br><br>' +
      '<b>Login — máscara de celular:</b> ao digitar apenas números, o campo formata automaticamente como <code>(11) 91693-6454</code>. Detecção de celular agora dispara com DDD + 1 dígito (antes exigia 8). Título do bloco "Entrar com 1 clique" quebrado em 2 linhas. Se o usuário digitar @ em qualquer momento, reverte para modo e-mail.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #6366f1;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.07);">' +
      '<div style="font-weight:800; color:#a5b4fc; font-size:1rem; margin-bottom:8px;">🔐 v1.8.16-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(29 de Maio, 2026)</span></div>' +
      '<p><b>Tela de login redesenhada — blocos diferenciados + exclusão mútua + botões verdes.</b><br><br>' +
      '3 blocos visualmente distintos: <b>Entrar com 1 clique</b> (fundo cyan) · <b>E-mail e Senha</b> (fundo índigo) · <b>Google</b>. ' +
      'Ao digitar em um bloco, o outro fica desabilitado (opacity reduzida) e volta ao normal ao apagar. ' +
      'Botão <b>Enviar</b> fica verde quando o campo tem e-mail ou celular válido; botão <b>Entrar</b> fica verde quando e-mail + senha (≥6 chars) estão preenchidos. ' +
      'Label dinâmico: depois de digitar o e-mail, o campo de senha mostra o próprio e-mail como identificador — fica claro de qual conta é a senha. ' +
      'Divisores "ou" maiores e em negrito. Links "Criar conta" e "Esqueci a senha" com fonte maior.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #6366f1;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.07);">' +
      '<div style="font-weight:800; color:#a5b4fc; font-size:1rem; margin-bottom:8px;">🧹 v1.8.15-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(28 de Maio, 2026)</span></div>' +
      '<p><b>Remoção de 25 funções mortas em 11 arquivos.</b><br><br>' +
      'Segunda leva de cleanup de código morto: 25 funções <code>window._*</code> confirmadas sem nenhum caller foram removidas de <code>auth.js</code>, <code>bracket-ui.js</code>, <code>venues.js</code>, <code>presence.js</code>, <code>create-tournament.js</code>, <code>venue-owner.js</code>, <code>main.js</code>, <code>explore.js</code>, <code>trophies-view.js</code>, <code>arbitros.js</code> e <code>tournaments-draw-prep.js</code>. Inclui wrappers de compat legados, no-ops explícitos e funções de UI substituídas por implementações mais recentes. Zero impacto funcional.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #6366f1;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.07);">' +
      '<div style="font-weight:800; color:#a5b4fc; font-size:1rem; margin-bottom:8px;">📡 v1.8.14-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(28 de Maio, 2026)</span></div>' +
      '<p><b>Migração <code>console.log</code> → <code>window._log</code> em todo o projeto (433 ocorrências).</b><br><br>' +
      'Todos os <code>console.log</code>, <code>console.warn</code>, <code>console.error</code> e <code>console.debug</code> em 37 arquivos JS foram substituídos pelos wrappers canônicos <code>window._log</code> / <code>window._warn</code> / <code>window._error</code> / <code>window._debug</code> do <code>logger.js</code>. Em produção, <code>_log</code> e <code>_debug</code> são silenciados automaticamente; <code>_warn</code> e <code>_error</code> adicionam breadcrumb no Sentry. Nenhuma mudança de comportamento para o usuário.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #6366f1;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.07);">' +
      '<div style="font-weight:800; color:#a5b4fc; font-size:1rem; margin-bottom:8px;">🧹 v1.8.13-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(28 de Maio, 2026)</span></div>' +
      '<p><b>Remoção de aliases mortos em <code>store.js</code>.</b><br><br>' +
      'Três aliases sem callers removidos: <code>_adjustBackHeaderForHamburger</code>, <code>_syncBackHeaderSpacer</code> (ambos apontavam para <code>_reflowChrome</code>) e <code>_showSupportModal</code> (compat wrapper de <code>#support</code>). Zero impacto funcional.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #6366f1;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.07);">' +
      '<div style="font-weight:800; color:#a5b4fc; font-size:1rem; margin-bottom:8px;">🧹 v1.8.12-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(28 de Maio, 2026)</span></div>' +
      '<p><b>Remoção de código morto em <code>bracket-ui.js</code> (−336 linhas).</b><br><br>' +
      'Seis funções confirmadas sem nenhum caller foram removidas: <code>_substituteFromStandby</code> (substituída por <code>_autoSubstituteWO</code>), <code>_openSetScoring</code> (substituída por <code>_openLiveScoring</code>), <code>_rejectResult</code> (botão nunca foi renderizado em <code>bracket.js</code>), e três aliases mortos <code>_saveGroupResult</code>, <code>_liveScoreSave</code>, <code>_casualEvacuateToDashboard</code>. Nenhuma funcionalidade afetada.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #6366f1;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.07);">' +
      '<div style="font-weight:800; color:#a5b4fc; font-size:1rem; margin-bottom:8px;">🧪 v1.8.11-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(28 de Maio, 2026)</span></div>' +
      '<p><b>Testes automatizados expandidos.</b><br><br>' +
      'Adicionadas 6 novas suites de teste (≈48 casos) para os helpers canônicos introduzidos em v1.8.7–v1.8.10: <code>_pName</code>, <code>_formatHHMM</code>, <code>_formatDDMM</code>, <code>_formatYYYYMMDD</code>, <code>_firstToken</code> e <code>_avatarHtml</code>. Cobertura total do projeto sobe para 34 suites. Nenhuma mudança de comportamento.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #6366f1;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.07);">' +
      '<div style="font-weight:800; color:#a5b4fc; font-size:1rem; margin-bottom:8px;">🧹 v1.8.10-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(28 de Maio, 2026)</span></div>' +
      '<p><b>Refatoração: helpers <code>window._formatYYYYMMDD</code> e <code>window._firstToken</code>.</b><br><br>' +
      'Padrões inline de formatação de data ISO (<code>YYYY-MM-DD</code>) e extração do primeiro token de nome unificados em helpers globais. Substituições em <code>create-tournament.js</code>, <code>explore.js</code> e <code>trophies-view.js</code>. Nenhuma mudança visual.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #6366f1;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.07);">' +
      '<div style="font-weight:800; color:#a5b4fc; font-size:1rem; margin-bottom:8px;">🧹 v1.8.9-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(28 de Maio, 2026)</span></div>' +
      '<p><b>Refatoração: helper unificado <code>window._avatarHtml</code> para círculos de avatar.</b><br><br>' +
      'O padrão de gerar círculos <code>border-radius:50%</code> com foto e fallback de inicial estava duplicado em múltiplos lugares. Centralizado em <code>window._avatarHtml(pp, size)</code> em store.js. As funções privadas <code>_liveAvatarHtml</code> e <code>_avatarHtml</code> em <code>bracket-ui.js</code> e o avatar inline em <code>tournaments-analytics.js</code> agora delegam para o helper global. Nenhuma mudança visual.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #6366f1;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.07);">' +
      '<div style="font-weight:800; color:#a5b4fc; font-size:1rem; margin-bottom:8px;">🧹 v1.8.8-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(28 de Maio, 2026)</span></div>' +
      '<p><b>Refatoração: helper unificado para formatação de horas.</b><br><br>' +
      'O padrão <code>String(d.getHours()).padStart(2,\'0\') + \':\' + String(d.getMinutes()).padStart(2,\'0\')</code> existia repetido em 12 lugares em 4 arquivos diferentes. Centralizado em <code>window._formatHHMM(d)</code> (formato <b>HH:MM</b>) e <code>window._formatDDMM(d)</code> (formato <b>DD/MM HH:MM</b>) em store.js. Nenhuma mudança de comportamento.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #6366f1;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.07);">' +
      '<div style="font-weight:800; color:#a5b4fc; font-size:1rem; margin-bottom:8px;">🧹 v1.8.7-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(28 de Maio, 2026)</span></div>' +
      '<p><b>Refatoração: helper unificado para nome de participante.</b><br><br>' +
      'O padrão <code>typeof p === \'string\' ? p : (p.displayName || p.name || p.email || \'\')</code> existia repetido mais de 40 vezes em 11 arquivos diferentes. Centralizado em <code>window._pName(p, fallback)</code> em store.js. Nenhuma mudança de comportamento.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.07);">' +
      '<div style="font-weight:800; color:#f59e0b; font-size:1rem; margin-bottom:8px;">🧹 v1.8.6-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(28 de Maio, 2026)</span></div>' +
      '<p><b>Refatoração: código duplicado eliminado.</b><br><br>' +
      'A lógica de renderização dos cards de "Últimas Partidas" existia em dois lugares independentes do código (overlay de setup e tela de estatísticas pós-partida). Unificada em uma única função <code>_buildCasualMatchCardsHtml</code> — os dois pontos de exibição agora usam o mesmo código. Nenhuma mudança visual; apenas manutenção interna.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.07);">' +
      '<div style="font-weight:800; color:#f59e0b; font-size:1rem; margin-bottom:8px;">📊 v1.8.5-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(28 de Maio, 2026)</span></div>' +
      '<p><b>Últimas Partidas: histórico completo com data e horário.</b><br><br>' +
      '<b>Data e horário de término:</b> cada card de partida na seção "Últimas Partidas" exibe agora a data e o horário de conclusão no formato <b>28/05 14h58</b> — antes aparecia apenas a data sem hora.<br><br>' +
      '<b>Partidas que não apareciam:</b> corrigido bug em que partidas com resultado registrado não apareciam no histórico quando o status no banco não tinha sido atualizado corretamente (por exemplo, por falha de rede no momento do Iniciar). Agora qualquer partida com placar confirmado aparece nas Últimas Partidas. A ordenação também foi corrigida para usar o horário de término em vez do horário de criação.<br><br>' +
      '<b>Save robusto:</b> se o save inicial ("Iniciar") falhou por rede, o resultado é salvo diretamente com status concluído ao fim da partida, garantindo que nenhum jogo se perca do histórico.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.07);">' +
      '<div style="font-weight:800; color:#f59e0b; font-size:1rem; margin-bottom:8px;">🎨 v1.8.4-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(28 de Maio, 2026)</span></div>' +
      '<p><b>Cores de time corretas na tela de estatísticas.</b><br><br>' +
      'Na tela de resultado após partida ao vivo, time 1 agora aparece consistentemente em <b style="color:#3b82f6;">azul</b> e time 2 em <b style="color:#ef4444;">vermelho</b> — tanto nas seções de Vencedor e Perdedor quanto nas bordas dos chips de jogador e nos rótulos de cada seção. Antes, os chips do time perdedor sempre apareciam em cinza neutro independente de qual time venceu.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.07);">' +
      '<div style="font-weight:800; color:#f59e0b; font-size:1rem; margin-bottom:8px;">🏅 v1.8.3-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(28 de Maio, 2026)</span></div>' +
      '<p><b>Botão ✏️ Editar unificado para resultados pendentes.</b><br><br>' +
      '<b>Qualquer um que lança pode editar:</b> o botão ✏️ Editar substitui os antigos Contestar/Descartar/Cancelar. Quem pode lançar resultados (organizador, árbitro confirmado ou jogador — conforme a configuração do torneio) pode editar o placar pendente a qualquer momento.<br><br>' +
      '<b>Comportamento por papel:</b> organizador e árbitros confirmados têm autoridade — ao editar, o placar é confirmado diretamente sem precisar de aprovação do adversário (o overlay avisa "Você tem autoridade"). Jogadores (proponente ou time adversário) ao editar geram uma nova proposta que aguarda confirmação do outro lado.<br><br>' +
      '<b>Aprovação continua:</b> o time adversário ainda pode aprovar o placar com ✅ Aprovar (sem abrir o overlay), ou clicar ✏️ Editar para propor um placar diferente. No dashboard, seção "Meus Resultados" mostra os mesmos botões inline.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.07);">' +
      '<div style="font-weight:800; color:#f59e0b; font-size:1rem; margin-bottom:8px;">🏅 v1.8.2-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(28 de Maio, 2026)</span></div>' +
      '<p><b>Aprovação de resultados pelos jogadores — revisão completa.</b><br><br>' +
      '<b>Meus Resultados no dashboard:</b> nova seção logo abaixo do hero box com três grupos — partidas aguardando <em>sua</em> aprovação (com botões de ação inline), resultados que você propôs aguardando o adversário e partidas sem resultado que você pode lançar. Abaixo, os últimos resultados confirmados com vitória/derrota/empate. Tudo clicável para o bracket do torneio.<br><br>' +
      '<b>Correções técnicas:</b> organizadores sem e-mail cadastrado (conta via telefone) agora recebem notificações de aprovação corretamente via UID; notificações de aprovação e rejeição passaram para nível <b>Fundamental</b>; placar de games em resultados GSM é preservado corretamente ao aprovar.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.07);">' +
      '<div style="font-weight:800; color:#f59e0b; font-size:1rem; margin-bottom:8px;">🔔 v1.8.1-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(28 de Maio, 2026)</span></div>' +
      '<p><b>Notificações ricas e personalizadas.</b><br><br>' +
      '<b>Níveis corrigidos:</b> sorteio, nova rodada, atualização de torneio e lembrete de torneio passaram para o nível <b>Fundamental</b> — garantindo entrega mesmo para usuários com preferência "Somente Fundamentais".<br><br>' +
      '<b>E-mails completos (sem "clique para ver"):</b> todos os campos do payload da notificação chegam agora no template de e-mail. Resultado de partida, lista de jogos e demais dados ficam visíveis direto no e-mail, sem precisar abrir o app.<br><br>' +
      '<b>Chaveamento personalizado por participante:</b> ao sortear (qualquer formato — Eliminatórias, Liga, Suíço, Grupos, Rei/Rainha), cada participante recebe uma notificação individual destacando <em>seu</em> jogo específico. No e-mail aparece um bloco em destaque "Seu Jogo N: Nome Parceiro (você) vs Adversário" com nome real + "(você)" entre parênteses, mais a lista completa de todos os jogos da rodada. No WhatsApp: texto personalizado com o jogo do destinatário, local e data. Rodadas seguintes da Liga também são personalizadas da mesma forma.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.07);">' +
      '<div style="font-weight:800; color:#f59e0b; font-size:1rem; margin-bottom:8px;">✨ v1.8.0-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(28 de Maio, 2026)</span></div>' +
      '<p><b>Perfil reorganizado.</b><br><br>' +
      '<b>Celular logo após o e-mail:</b> o campo de celular foi movido para ser o primeiro campo editável do perfil, logo abaixo do e-mail, para que os dados de contato fiquem juntos em uma sequência natural.<br><br>' +
      '<b>Bloco de social e notificações após locais preferidos:</b> a seção "Comunicação e social" (aceitar convites de amizade, filtros de notificação e canais — plataforma, e-mail, WhatsApp) foi movida para após os locais preferidos, agrupando as configurações de privacidade e presença antes das preferências sociais.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.07);">' +
      '<div style="font-weight:800; color:#f59e0b; font-size:1rem; margin-bottom:8px;">🔗 v1.7.9-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(28 de Maio, 2026)</span></div>' +
      '<p><b>Login e perfil: consolidação de identidade e notificações automáticas.</b><br><br>' +
      '<b>Toggles de notificação ativados automaticamente:</b> ao criar conta por e-mail (magic link, Google ou e-mail+senha), o toggle de notificações por e-mail é ativado automaticamente. Ao criar conta por SMS, o toggle de notificações por WhatsApp é ativado. O mesmo acontece ao adicionar um contato que ainda não tinha sido cadastrado — adicionar celular ativa WhatsApp; adicionar e-mail ativa notificações por e-mail. Esses padrões só são definidos se o campo ainda não foi configurado pelo usuário.<br><br>' +
      '<b>Mesclagem automática de contas duplicadas:</b> quando um login via link mágico (e-mail ou SMS) detecta uma conta anterior com o mesmo contato, a mesclagem ocorre automaticamente após o login (sem precisar de confirmação, já que o próprio contato foi verificado). Login via Google também aciona mesclagem automática quando encontra conta anterior com o mesmo e-mail. Ao adicionar/alterar e-mail ou celular no perfil, o sistema detecta contas com o mesmo contato e oferece mesclagem via diálogo de confirmação.<br><br>' +
      '<b>Alterar e-mail ou celular pelo perfil:</b> contas com e-mail agora exibem botão "Alterar" ao lado do e-mail. Contas criadas apenas por celular (sem e-mail) mostram o campo de e-mail automaticamente para facilitar o cadastro. Ao salvar, o e-mail novo é persistido no Firestore e a busca de conta anterior é feita em background.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.07);">' +
      '<div style="font-weight:800; color:#f59e0b; font-size:1rem; margin-bottom:8px;">🔧 v1.7.8-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(26 de Maio, 2026)</span></div>' +
      '<p><b>1 correção na partida casual.</b><br><br>' +
      '<b>Times em "Últimas Partidas" agora exibidos corretamente:</b> ao finalizar uma partida de duplas, o documento Firestore era atualizado com <code>status</code>, <code>result</code> e <code>playerUids</code> — mas sem o campo <code>players</code> com os times finais. Como resultado, o campo <code>players</code> no banco podia ficar com a atribuição de equipes anterior (do setup, antes do sorteio de duplas), fazendo parceiros aparecerem como adversários nas seções "Últimas Partidas". Corrigido: ao encerrar a partida, o payload agora inclui o campo <code>players</code> com as atribuições de times corretas de <code>p1Players</code> e <code>p2Players</code>, garantindo que o histórico grave e exiba os times como realmente jogaram.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.07);">' +
      '<div style="font-weight:800; color:#f59e0b; font-size:1rem; margin-bottom:8px;">🔧 v1.7.7-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(26 de Maio, 2026)</span></div>' +
      '<p><b>3 correções na partida casual.</b><br><br>' +
      '<b>1. Seção "Últimas Partidas" voltou a aparecer nas estatísticas de fim de partida:</b> dois mecanismos garantem que a seção seja exibida: (a) fallback incondicional de 1500ms que dispara mesmo quando o write ao servidor falha ou demora; (b) o caminho de erro (.catch) também tenta mostrar a seção. Antes, a seção simplesmente não aparecia quando o write não confirmava a tempo.<br><br>' +
      '<b>2. Botão de partida passada não "quebrava o link" (saía do overlay):</b> partidas antigas sem <code>roomCode</code> geravam botões que navegavam para fora do overlay de estatísticas. Agora apenas partidas com <code>roomCode</code> válido são exibidas na seção.<br><br>' +
      '<b>3. Gênero dos jogadores não é mais perdido ao receber atualização da sala:</b> quando o Firestore enviava uma atualização de sala com <code>slotGenders</code> parcialmente preenchido (campo null para slots não alterados), o gênero local definido era sobrescrito por null, perdendo a informação. Agora apenas valores não-nulos do servidor sobrescrevem o estado local.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.07);">' +
      '<div style="font-weight:800; color:#f59e0b; font-size:1rem; margin-bottom:8px;">🔧 v1.7.6-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(26 de Maio, 2026)</span></div>' +
      '<p><b>2 correções na partida casual.</b><br><br>' +
      '<b>1. Ordem das Últimas Partidas corrigida (mais recente à esquerda):</b> o sort por data estava retornando NaN para <code>createdAt</code> armazenado como string ISO — a subtração de strings é NaN, tornando o sort instável e mostrando partidas na ordem errada. Corrigido: datas ISO são agora convertidas via <code>new Date(s).getTime()</code> antes da comparação, garantindo que a partida mais recente apareça sempre na esquerda, a segunda no centro e a terceira na direita.<br><br>' +
      '<b>2. Tela de estatísticas comparativas mostra as cores corretas de cada time:</b> antes, as duas barras de comparação apareciam em azul (usavam a cor de quem ganhou vs quem perdeu). Agora o Time 1 sempre aparece em <span style="color:#3b82f6;font-weight:700;">azul</span> (lado direito) e o Time 2 sempre aparece em <span style="color:#ef4444;font-weight:700;">vermelho</span> (lado esquerdo), independente do resultado. Um cabeçalho com os nomes dos times identifica cada lado.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.07);">' +
      '<div style="font-weight:800; color:#f59e0b; font-size:1rem; margin-bottom:8px;">🔧 v1.7.5-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(26 de Maio, 2026)</span></div>' +
      '<p><b>2 melhorias na partida casual.</b><br><br>' +
      '<b>1. Últimas partidas na tela de estatísticas agora mostra a partida que acabou de terminar:</b> antes, a seção "Últimas Partidas" era populada com um timeout fixo de 400ms que podia disparar antes da escrita no servidor ser confirmada — a partida recém jogada não aparecia. Agora a seção só é preenchida depois que o Firestore confirma o write.<br><br>' +
      '<b>2. Toggle "Dupla Mista" se desativa automaticamente ao formar time não-misto:</b> ao arrastar dois jogadores do mesmo gênero para o mesmo time (ex: dois masculinos), o toggle de Dupla Mista agora se desativa sozinho. Antes era necessário desativá-lo manualmente.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.07);">' +
      '<div style="font-weight:800; color:#f59e0b; font-size:1rem; margin-bottom:8px;">🔧 v1.7.4-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(26 de Maio, 2026)</span></div>' +
      '<p><b>2 melhorias na partida casual.</b><br><br>' +
      '<b>1. Fix crítico: primeira partida sumia ao jogar 2+ partidas consecutivas (Desparear):</b> ao finalizar uma partida e clicar em "Desparear" para remontar os times e jogar novamente, o polling de sincronização da sala (<code>_setupRefreshInterval</code>) continuava rodando depois que um novo código de sala era gerado. No próximo ciclo, o polling usava o novo código — e como o novo documento Firestore ainda não tinha sido criado, encontrava <code>null</code> e entrava na branch de "doc deletado externamente", fechando o overlay e destruindo a sessão. A primeira partida sumia do histórico como resultado. Corrigido: o intervalo de polling agora é parado <b>antes</b> de trocar o código de sala.<br><br>' +
      '<b>2. Últimas partidas na tela de estatísticas:</b> após o fim de uma partida (placar ao vivo), a tela de estatísticas agora exibe a seção "Últimas Partidas" do usuário para aquela modalidade — mesmo layout de 3 colunas (mais recente à esquerda) já existente na tela de setup. Funciona tanto em partidas casuais quanto em torneios.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.07);">' +
      '<div style="font-weight:800; color:#f59e0b; font-size:1rem; margin-bottom:8px;">🔧 v1.7.3-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(26 de Maio, 2026)</span></div>' +
      '<p><b>2 correções na partida casual.</b><br><br>' +
      '<b>1. Histórico de partidas não aparecia / ficava travado em datas antigas:</b> ao concluir uma partida e clicar em "Jogar Novamente" ou "Desparear", o sistema reutilizava o mesmo documento Firestore sobrescrevendo o resultado e a data da partida anterior. As partidas do dia ficavam ocultas porque o histórico sempre mostrava as datas originais (dia 10, 15 etc). Corrigido: cada nova partida após "Jogar Novamente"/"Desparear" cria um documento novo no Firestore com a data atual, preservando o histórico completo.<br><br>' +
      '<b>2. Gênero de jogador voltava como "?" após Desparear/Jogar Novamente:</b> ao voltar ao setup após uma partida, o polling de sincronização da sala interpretava a ausência de <code>participants</code> no Firestore como "todos saíram" — zerando os gêneros de todos os slots e causando re-render com "?". Corrigido: o sync de participants agora só é ativado quando há ao menos 1 entrada real no campo (partidas com convite QR).</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.07);">' +
      '<div style="font-weight:800; color:#f59e0b; font-size:1rem; margin-bottom:8px;">🔧 v1.7.2-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(25 de Maio, 2026)</span></div>' +
      '<p><b>Fix crítico: tela de configuração da partida casual não carregava.</b><br><br>' +
      'Ao clicar em "Partida Casual", a tela de configuração ficava em branco (sem conteúdo). Causa: a função <code>_genderIconHtml</code> estava declarada dentro de um bloco <code>if (isDoubles)</code> — no V8/Chrome, declarações de função dentro de blocos têm escopo de bloco, então em modo singles (não-duplas) a função era <code>undefined</code> e causava um TypeError que interrompia toda a renderização. Corrigido movendo a declaração para fora do bloco.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.07);">' +
      '<div style="font-weight:800; color:#f59e0b; font-size:1rem; margin-bottom:8px;">🔧 v1.7.1-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(25 de Maio, 2026)</span></div>' +
      '<p><b>2 correções na partida casual.</b><br><br>' +
      '<b>1. Pontuação 15-30-40 não era respeitada no placar ao vivo:</b> ao escolher "Tênis" (15-30-40, AD, tie-break) na configuração de partida casual, o placar mostrava 0/1/2/3 em vez de 0/15/30/40. A causa era que prefs salvas em versões anteriores podiam estar sem o campo <code>type</code> — e sem ele, o sistema de sets/games era completamente ignorado, mostrando apenas contagem inteira. Corrigido: agora as prefs salvas são sempre mescladas com os padrões da modalidade, garantindo que <code>type:"sets"</code> e <code>countingType</code> corretos estejam presentes mesmo em prefs legadas.<br><br>' +
      '<b>2. Cancelar partida casual não voltava ao menu de configuração:</b> ao cancelar uma partida casual em andamento, o organizador era jogado para o dashboard em vez de voltar ao menu de configuração da partida casual. Corrigido: ao cancelar, o organizador volta à tela de setup da partida casual para poder iniciar uma nova partida imediatamente. (Guests continuam indo ao dashboard, já que não têm setup próprio.)</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.07);">' +
      '<div style="font-weight:800; color:#f59e0b; font-size:1rem; margin-bottom:8px;">✨ v1.7.0-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(24 de Maio, 2026)</span></div>' +
      '<p><b>Tutoriais em vídeo na landing page + versão sempre atualizada.</b><br><br>' +
      'A landing page ganhou uma seção "Veja em ação" com 6 tutoriais rápidos em YouTube Shorts demonstrando as funcionalidades principais. Os vídeos carregam com lazy-load (thumbnail estática até clicar em reproduzir). ' +
      'A versão exibida na landing agora é sempre atualizada automaticamente a cada deploy.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.07);">' +
      '<div style="font-weight:800; color:#f59e0b; font-size:1rem; margin-bottom:8px;">🔧 v1.6.106-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(23 de Maio, 2026)</span></div>' +
      '<p><b>Fix: "reCAPTCHA já foi renderizado" no iPhone (Sentry WEB-10).</b><br><br>' +
      'No iOS, eventos de toque podiam disparar dois cliques em sequência no botão de login por telefone, causando duas chamadas simultâneas ao reCAPTCHA e o erro "reCAPTCHA has already been rendered in this element". Corrigido com um guard de in-flight que ignora o segundo disparo enquanto o primeiro ainda está processando.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.07);">' +
      '<div style="font-weight:800; color:#f59e0b; font-size:1rem; margin-bottom:8px;">🔧 v1.6.105-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(20 de Maio, 2026)</span></div>' +
      '<p><b>3 correções em partidas casuais.</b><br><br>' +
      '<b>1. QR Code no Chrome iOS:</b> o leitor de QR da dashboard usava câmera streaming (getUserMedia) que o Chrome iOS (CriOS) não suporta — funcionava no Safari mas falhava silenciosamente no Chrome. Agora detecta <code>CriOS</code> automaticamente e usa o scanner via input de arquivo, que funciona em qualquer browser iOS.<br><br>' +
      '<b>2. Histórico "Últimas Partidas" no Rei/Rainha:</b> cada rodada do Rei/Rainha agora é salva como um documento independente no Firestore, então as 3 rodadas aparecem individualmente no histórico. Antes, as 3 rodadas compartilhavam 1 único documento e só a última rodada aparecia. O filtro por modalidade que escondia partidas também foi removido — o histórico mostra as 3 últimas independentemente da modalidade selecionada no setup.<br><br>' +
      '<b>3. Bloqueio de tela no iPhone (NoSleep):</b> o vídeo NoSleep que impedia qualquer bloqueio de tela (inclusive o botão lateral) agora é usado apenas como fallback quando a Wake Lock API não está disponível. Em iOS Safari 16.4+, a Wake Lock API nativa é suficiente e permite que o usuário bloqueie a tela manualmente quando quiser.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.07);">' +
      '<div style="font-weight:800; color:#f59e0b; font-size:1rem; margin-bottom:8px;">🔧 v1.6.103-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(20 de Maio, 2026)</span></div>' +
      '<p><b>Fix: crash no iOS Safari em partidas casuais com sugestão de vínculo (Sentry WEB-1A e WEB-1B).</b><br><br>' +
      'A função <code>_hydrateCasualLinkSuggestions</code> referenciava <code>_slotLinkedUid</code> de um escopo de closure errado — a variável estava declarada em <code>_openCasualMatch</code> mas sendo acessada dentro de <code>_openLiveScoring</code>, que é uma função separada. No iOS Safari, a Promise rejeitada se propagava como <code>onunhandledrejection</code> sempre que o slot de sugestões estava visível. Corrigido declarando <code>_slotLinkedUid</code> dentro do escopo correto do <code>_openLiveScoring</code> e passando o valor via opts ao iniciar a partida.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.07);">' +
      '<div style="font-weight:800; color:#f59e0b; font-size:1rem; margin-bottom:8px;">👑 v1.6.102-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(19 de Maio, 2026)</span></div>' +
      '<p><b>Modo Rei/Rainha na Partida Casual.</b><br><br>' +
      'Toggle "Rei/Rainha" na tela de setup da partida casual (duplas). Quando ativado, a sessão roda 3 jogos com duplas rotativas entre os 4 jogadores:<br>' +
      '• Jogo 1: (P1+P2) vs (P3+P4)<br>• Jogo 2: (P1+P3) vs (P2+P4)<br>• Jogo 3: (P1+P4) vs (P2+P3)<br><br>' +
      'Ao fim de cada jogo aparece o botão "⚡ Jogo N de 3 →"; após o 3º jogo, botão "👑 Ver Resultado Final" mostra o placar individual com classificação: ' +
      '👑 Rei/Rainha (3 vitórias), 🥈 Vice (2), 🏅 Peão (1), 🫠 Plebeu (0).</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.07);">' +
      '<div style="font-weight:800; color:#f59e0b; font-size:1rem; margin-bottom:8px;">🔧 v1.6.100-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(18 de Maio, 2026)</span></div>' +
      '<p><b>Fix: crash ao abrir gerenciador de categorias em torneios sem categorias configuradas (Sentry WEB-19).</b><br><br>' +
      'Em torneios onde <code>combinedCategories</code> não estava definido, o gerenciador de categorias lançava um erro "allCats.slice is not a function" e travava sem abrir. Adicionado guard defensivo: se <code>_getTournamentCategories</code> retornar undefined, o array é tratado como vazio e o fluxo continua normalmente.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.07);">' +
      '<div style="font-weight:800; color:#f59e0b; font-size:1rem; margin-bottom:8px;">🎨 v1.6.99-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(18 de Maio, 2026)</span></div>' +
      '<p><b>Ajuste de contraste nos temas: sem preto ou branco puros.</b><br><br>' +
      'Temas escuros (Noturno, Oceano) agora usam fontes próximas ao branco sem ser branco puro, e fundo off-black em vez de #000000. Temas claros (Claro, Pôr do Sol) usam fontes próximas ao preto sem ser preto absoluto. O balão de dicas do tema Pôr do Sol foi corrigido — era escuro sobre fundo claro, agora é claro (cream) com texto escuro, consistente com o tema quente.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.07);">' +
      '<div style="font-weight:800; color:#f59e0b; font-size:1rem; margin-bottom:8px;">✨ v1.6.98-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(18 de Maio, 2026)</span></div>' +
      '<p><b>Inscrição bloqueada por gênero e faixa etária.</b><br><br>' +
      'Se o torneio tiver apenas categorias femininas, somente participantes com gênero feminino no perfil podem se inscrever. O mesmo vale para masculino. Torneios com categorias de idade (ex: 50+) exigem que a data de nascimento esteja cadastrada e que o participante atinja a faixa mínima. Em todos os casos, a inscrição é bloqueada antes de qualquer outra verificação e uma mensagem clara indica o motivo — com link implícito para completar o perfil.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.07);">' +
      '<div style="font-weight:800; color:#f59e0b; font-size:1rem; margin-bottom:8px;">🔧 v1.6.97-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(17 de Maio, 2026)</span></div>' +
      '<p><b>Fix: arrastar jogador para categoria não pula mais o scroll para o topo.</b><br><br>' +
      'O scroll da página é preservado ao soltar um card de jogador em uma categoria — funciona no desktop (drag &amp; drop HTML5) e no mobile (touch). Bônus: drag por toque agora também funciona no gerenciador inline de categorias.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.07);">' +
      '<div style="font-weight:800; color:#f59e0b; font-size:1rem; margin-bottom:8px;">🔧 v1.6.96-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(17 de Maio, 2026)</span></div>' +
      '<p><b>Fix: "Fem C" vira "Fem" (e "Masc D" vira "Masc") quando é a única categoria do gênero.</b><br><br>' +
      'Sufixos de habilidade (C, D...) só fazem sentido quando existem múltiplas categorias por gênero. Ao excluir categorias e sobrar apenas uma por gênero, o nome é simplificado automaticamente — na lista de categorias e nos cards dos jogadores.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.07);">' +
      '<div style="font-weight:800; color:#f59e0b; font-size:1rem; margin-bottom:8px;">🔧 v1.6.95-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(17 de Maio, 2026)</span></div>' +
      '<p><b>Fix: badges de categoria dos jogadores atualizam automaticamente ao unificar categorias.</b><br><br>' +
      'Ao excluir categorias e deixar apenas "Fem" e "Masc", os participantes com "Fem C" ou "Masc D" têm suas categorias atualizadas para a categoria remanescente do mesmo gênero.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.07);">' +
      '<div style="font-weight:800; color:#f59e0b; font-size:1rem; margin-bottom:8px;">🔧 v1.6.94-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(17 de Maio, 2026)</span></div>' +
      '<p><b>Fix: scroll não pula mais para o topo ao excluir categoria vazia.</b><br><br>' +
      'Ao clicar no × de uma categoria vazia no gerenciador inline, a posição de scroll da página é preservada — o usuário continua exatamente onde estava, sem ser jogado para o topo.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.07);">' +
      '<div style="font-weight:800; color:#f59e0b; font-size:1rem; margin-bottom:8px;">🔧 v1.6.93-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(17 de Maio, 2026)</span></div>' +
      '<p><b>Excluir categoria reconcilia skillCategories e genderCategories no Firestore.</b><br><br>' +
      'Ao clicar no × de uma categoria vazia, o sistema agora recalcula quais habilidades e gêneros ainda são utilizados nas categorias restantes e remove os que ficaram sem uso. Se sobrarem apenas "Fem" e "Masc" (sem sufixo de habilidade), as habilidades são automaticamente limpas — refletindo corretamente no formulário de edição/criação.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.07);">' +
      '<div style="font-weight:800; color:#f59e0b; font-size:1rem; margin-bottom:8px;">🔧 v1.6.92-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(17 de Maio, 2026)</span></div>' +
      '<p><b>Fix: badges "Fem C" / "Masc D" sumiam dos cards de inscritos quando não fazem parte das categorias do torneio.</b><br><br>' +
      'Badges de categoria nos cards de inscritos agora são filtrados contra <code>combinedCategories</code> do torneio — participantes com categorias obsoletas (ex: "Fem C" quando torneio só tem "Fem" e "Masc") mostram apenas as categorias válidas ou exibem "(sem cat.)" quando nenhuma é válida.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.07);">' +
      '<div style="font-weight:800; color:#f59e0b; font-size:1rem; margin-bottom:8px;">✨ v1.6.91-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(17 de Maio, 2026)</span></div>' +
      '<p><b>Categorias integradas na seção "Inscritos Confirmados" — botão separado removido.</b><br><br>' +
      '(1) <b>Categorias inline:</b> o gerenciador de categorias agora aparece diretamente abaixo dos inscritos na página do torneio, sem precisar de um botão separado.<br><br>' +
      '(2) <b>Filtro de categorias por regras do torneio:</b> participantes com categorias inválidas (ex: "Masc B" quando o torneio só tem "Masc" e "Fem") aparecem automaticamente na zona vermelha "sem categoria".<br><br>' +
      '(3) <b>Fix de escopo:</b> correção de bug onde a variável de categorias não estava acessível fora da função de renderização de cards, impedindo o painel inline de ser exibido.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.07);">' +
      '<div style="font-weight:800; color:#f59e0b; font-size:1rem; margin-bottom:8px;">✨ v1.6.90-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(17 de Maio, 2026)</span></div>' +
      '<p><b>Gerenciador de Categorias redesenhado: participantes dentro dos cards, drag-and-drop entre categorias, X para excluir vazia.</b><br><br>' +
      '(1) <b>Participantes visíveis dentro dos cards:</b> cada categoria agora exibe os participantes como chips diretamente no card, sem precisar clicar para abrir um modal separado.<br><br>' +
      '(2) <b>Drag-and-drop entre categorias:</b> arraste um chip de participante de uma categoria para outra para movê-lo. Também é possível arrastar de dentro de uma categoria para a área vermelha "sem categoria" para removê-lo da categoria.<br><br>' +
      '(3) <b>X para excluir categoria vazia:</b> categorias sem participantes inscritos exibem um botão × no canto para excluí-las do torneio.<br><br>' +
      '(4) <b>Fix: participante voltava para a categoria após remoção manual:</b> quando o organizador removia um participante de uma categoria, o auto-assign recolocava o participante lá logo em seguida (bounce-back). Corrigido: remoção manual marca o participante como <code>categorySource: "organizador"</code>, que o auto-assign respeita.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.07);">' +
      '<div style="font-weight:800; color:#f59e0b; font-size:1rem; margin-bottom:8px;">🔧 v1.6.88-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(17 de Maio, 2026)</span></div>' +
      '<p><b>Fix: auto-atribuição de categorias — gênero ausente e skillBySport desatualizado.</b><br><br>' +
      'Dois bugs adicionais corrigidos no auto-assign:<br><br>' +
      '(1) <b>Gênero ausente não disparava enriquecimento:</b> participantes com <code>skillBySport</code> preenchido mas sem <code>gender</code> no objeto de inscrição passavam direto pelo <code>_needsEnrichment</code> sem buscar o perfil no Firestore — o gênero nunca era obtido, deixando 2 categorias elegíveis (Masc B + Fem B) e nenhuma atribuição. Agora <code>_needsEnrichment</code> também detecta <code>gender</code> ausente em torneios com categorias de gênero.<br><br>' +
      '(2) <b>skillBySport desatualizado não era sobrescrito:</b> quando o objeto de inscrição tinha <code>{"Beach Tennis": null}</code> (sport selecionado, nível não escolhido), o enriquecimento pulava a sobrescrita porque o objeto existia. Agora só preserva se houver valores significativos (não-nulos) — dados desatualizados são substituídos pelo perfil atual do Firestore.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.07);">' +
      '<div style="font-weight:800; color:#f59e0b; font-size:1rem; margin-bottom:8px;">🔧 v1.6.87-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(17 de Maio, 2026)</span></div>' +
      '<p><b>Fix: auto-atribuição de categorias agora funciona de verdade.</b><br><br>' +
      'Dois bugs corrigidos na lógica de auto-assign:<br><br>' +
      '(1) <b>Race condition com onSnapshot:</b> a versão async enriquecia os objetos de participante em memória via Firestore, mas ao final re-buscava o torneio no AppStore — se o listener do Firestore tinha disparado durante os awaits, o torneio era substituído pelo objeto original, perdendo todo o enriquecimento. Agora o torneio enriquecido é passado diretamente para o sync assign.<br><br>' +
      '(2) <b>skillBySport com valor null:</b> participantes com o esporte selecionado no perfil mas sem nível de habilidade escolhido tinham <code>skillBySport: {"Beach Tennis": null}</code> — objeto truthy que fazia o enriquecimento ser pulado, mas sem dado útil para o filtro de skill. Agora <code>_needsEnrichment</code> verifica se há valores não-nulos antes de pular o enriquecimento.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.07);">' +
      '<div style="font-weight:800; color:#f59e0b; font-size:1rem; margin-bottom:8px;">🎯 v1.6.85-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(17 de Maio, 2026)</span></div>' +
      '<p><b>Auto-atribuição de categorias por habilidade e idade.</b><br><br>' +
      'Quando o organizador configura categorias de habilidade (A, B, C…) ou de idade (40+, 50+…) no torneio, os participantes que têm esses dados no perfil são alocados automaticamente — sem ficarem como "sem cat.".<br><br>' +
      'A lógica aplica os três filtros em cascata: (1) gênero, (2) faixa etária por <code>birthDate</code>, (3) nível de habilidade por <code>skillBySport</code> ou nível padrão. Se restar só uma categoria elegível após os filtros, o participante é alocado automaticamente com <code>categorySource: \'perfil\'</code>.<br><br>' +
      'Participantes inscritos antes dessa versão (que não têm <code>birthDate</code>/<code>skillBySport</code> no objeto de inscrição) são enriquecidos em background via Firestore — os perfis são buscados por <code>uid</code> e o auto-assign roda de novo com os dados carregados.<br><br>' +
      'Novas inscrições já armazenam <code>birthDate</code>, <code>skillBySport</code> e <code>defaultCategory</code> no objeto do participante no momento da inscrição.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.07);">' +
      '<div style="font-weight:800; color:#f59e0b; font-size:1rem; margin-bottom:8px;">🏷️ v1.6.84-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(17 de Maio, 2026)</span></div>' +
      '<p><b>Categoria por habilidade nos cards de participantes.</b><br><br>' +
      'Os cards de participantes nos torneios exibem agora o nível de habilidade (A, B, C, D, FUN…) quando o torneio tem categorias de habilidade configuradas.<br><br>' +
      '<b>Para o organizador:</b> o nível aparece como um dropdown roxo diretamente no card — basta selecionar e a alteração é salva e aplicada imediatamente, sem precisar abrir o Gerenciador de Categorias.<br><br>' +
      '<b>Para os demais participantes:</b> o nível é exibido como badge roxo estático.<br><br>' +
      'Funciona em ambos os modos de exibição: grade de cards (pré-sorteio) e lista de check-in (durante o torneio). O gênero prefixado na categoria (ex: "Masc A") é preservado — ao trocar o nível de A para B, a categoria vira "Masc B" automaticamente.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.07);">' +
      '<div style="font-weight:800; color:#f59e0b; font-size:1rem; margin-bottom:8px;">🔒 v1.6.82-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(16 de Maio, 2026)</span></div>' +
      '<p><b>Nomes de exibição únicos.</b><br><br>' +
      'Agora não é possível salvar um nome de exibição já cadastrado por outro usuário na plataforma. Ao tentar salvar um nome em uso:<br><br>' +
      '<b>Candidato a mesclagem</b> — se o perfil em conflito compartilha o mesmo telefone ou e-mail, o fluxo de mesclagem de contas é acionado automaticamente.<br><br>' +
      '<b>Nome em uso por conta diferente</b> — alerta <em>"Este nome de exibição já está em uso na plataforma. Escolha outro."</em> e o save é bloqueado.<br><br>' +
      'A verificação usa o campo <code>displayName_lower</code> já indexado no Firestore, então é eficiente e case-insensitive. Nomes que não mudam ignoram a checagem.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #6366f1;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.07);">' +
      '<div style="font-weight:800; color:#818cf8; font-size:1rem; margin-bottom:8px;">📖 v1.6.81-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(16 de Maio, 2026)</span></div>' +
      '<p><b>Manual completo: gênero por slot, autocomplete de amigos, árbitro e Jogar Novamente para todos.</b><br><br>' +
      'Quatro funcionalidades que já existiam no app mas não estavam documentadas no manual de ajuda:<br><br>' +
      '<b>⚥ Gênero por slot + Duplas Mistas:</b> cada card de jogador exibe ♂/♀/⚥/? clicável; quando há 2M+2F o toggle "Duplas Mistas" aparece automaticamente e força 1M+1F por dupla no sorteio. Ícones sincronizados via Firestore para todos da sala.<br><br>' +
      '<b>🔗 Autocomplete de amigos nos slots:</b> ao digitar o nome de um jogador, dropdown mostra amigos do scoreplace; selecionar preenche avatar e gênero do perfil, vincula o uid e propaga para todos os dispositivos em tempo real.<br><br>' +
      '<b>Jogar Novamente leva todos:</b> ao clicar "Jogar Novamente", TODOS os jogadores conectados são redirecionados de volta ao lobby com os mesmos slots — não é preciso compartilhar o código novamente.<br><br>' +
      '<b>🧑‍⚖️ Toggle Arbitrar no perfil:</b> ao lado do nível de cada modalidade; quando ativo, você aparece na lista de árbitros disponíveis para organizadores de torneios daquela modalidade.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(52,211,153,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🔧 v1.6.58–v1.6.63-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(15 de Maio, 2026)</span></div>' +
      '<p><b>Estabilidade da segunda partida — 6 correções em sequência.</b><br><br>' +
      'Após adicionar autocomplete de amigos e gênero por slot, a série de partidas seguida (sem fechar o app) apresentou regressões que foram corrigidas versão a versão:<br><br>' +
      '<b>v1.6.58 — Autocomplete propaga avatar e gênero corretamente:</b> ao selecionar amigo via autocomplete, avatar e gênero do perfil passaram a aparecer em todos os clientes da sala (não só no dispositivo que fez a seleção).<br><br>' +
      '<b>v1.6.59 — "Voltar ao setup" reutiliza a mesma sala:</b> clicar "Jogar Novamente" ou voltar ao setup após encerrar a partida passava a reutilizar o mesmo room code em vez de gerar um novo — todos os participantes são redirecionados automaticamente.<br><br>' +
      '<b>v1.6.60 — Gêneros e duplas mistas propagam após voltar ao setup:</b> ao voltar ao setup via "Jogar Novamente", os gêneros dos slots e o toggle de duplas mistas passaram a sincronizar corretamente para todos os clientes.<br><br>' +
      '<b>v1.6.61 — Gênero não regride quando não-iniciador grava null:</b> participantes não-criadores que ainda não tinham o campo <code>slotGenders</code> local escreviam <code>null</code> no Firestore ao fazer polling, sobrescrevendo os gêneros definidos. Corrigido: só o criador persiste o estado de gêneros.<br><br>' +
      '<b>v1.6.62 — "Desparear" não pula para stats da partida anterior:</b> ao clicar 🔗 para desfazer as duplas e abrir uma nova partida, o resultado antigo não era mais exibido no lugar da tela de setup.<br><br>' +
      '<b>v1.6.63 — Segunda partida estável + QR funciona na primeira leitura:</b> consolidação final — partidas sequenciais sem reiniciar o app funcionam sem regressões; o scanner QR voltou a decodificar na primeira tentativa após o fix de reinicialização da câmera.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(52,211,153,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">✨ v1.6.30–v1.6.50-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(15 de Maio, 2026)</span></div>' +
      '<p><b>Gênero por slot, Jogar Novamente para todos e modo Técnico — 21 versões de desenvolvimento.</b><br><br>' +
      '<b>v1.6.30 — Clipboard + filtro Sentry:</b> fix de clipboard sem catch no Safari; erros de permissão-negada deixaram de ser enviados ao Sentry (eram falso-positivos esperados).<br><br>' +
      '<b>v1.6.31–v1.6.39 — Gênero por slot (feature completa):</b> ícone ♂/♀/⚥/? em cada card de jogador; propagação via Firestore (<code>slotGenders</code>) para todos os clientes; picker clicável para convidados e usuários sem gênero no perfil; "?" com animação pulse para indicar que é clicável (v1.6.27); toggle "Duplas Mistas" automático com 2M+2F; edição de gênero disponível também no modo singles (v1.6.38); fix de toque no mobile que não abria o picker (v1.6.39).<br><br>' +
      '<b>v1.6.37 e v1.6.41 — Jogar Novamente para todos:</b> v1.6.37 fez o placar ao vivo propagar para todos ao iniciar "Jogar Novamente"; v1.6.41 completou o fluxo levando TODOS os jogadores conectados de volta ao lobby com os mesmos slots — sem precisar compartilhar o código novamente.<br><br>' +
      '<b>v1.6.40 — Loop de animação nas stats:</b> corrigido loop infinito de animação na tela de resultado que travava o app após a primeira partida.<br><br>' +
      '<b>v1.6.42–v1.6.50 — Modo Técnico (coach) — desenvolvimento completo:</b> v1.6.42 introduziu o toggle 🎽 Técnico que impede o usuário de ocupar slot e remove seus resultados do histórico pessoal; versões seguintes adicionaram handles ⠿ em todos os slots para arrastar jogadores (v1.6.44/47), edição de nomes e gêneros em todos os slots (v1.6.45/46), correção do avatar do técnico que aparecia nos cards de jogador (v1.6.49), e fix de polling que continuava rodando com o room code antigo após reabrir via 🔗 (v1.6.50).</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #6366f1;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.07);">' +
      '<div style="font-weight:800; color:#818cf8; font-size:1rem; margin-bottom:8px;">📖 v1.6.80-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(16 de Maio, 2026)</span></div>' +
      '<p><b>Manual: modo Técnico documentado na seção Partida Casual.</b><br><br>' +
      'O toggle "🎽 Técnico" já existia no app mas não estava coberto no manual. Agora a seção Partida Casual explica o que muda ao ativar: slots começam em branco (sem preencher seu nome automaticamente), handles ⠿ para arrastar jogadores aparecem em todos os cards, e o resultado não é salvo no histórico pessoal do técnico. Inclui exemplos de quando usar: professor, pai acompanhando, organizador gerenciando várias partidas.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #6366f1;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.07);">' +
      '<div style="font-weight:800; color:#818cf8; font-size:1rem; margin-bottom:8px;">📖 v1.6.79-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(16 de Maio, 2026)</span></div>' +
      '<p><b>Manual atualizado com todas as novidades recentes.</b><br><br>' +
      'O manual de ajuda (ícone ?) foi revisado para cobrir as mudanças das últimas versões:<br><br>' +
      '<b>Liga — modo "Todos contra todos":</b> a seção Formatos agora descreve o novo modo de calendário pré-gerado, anti-repetição e configuração de turnos.<br><br>' +
      '<b>Ferramentas do organizador:</b> o botão "Apagar Torneio" (exclusivo do criador, com confirmação dupla) estava ausente na lista — adicionado.<br><br>' +
      '<b>Perfil — mesclagem automática:</b> a entrada Telefone agora explica que salvar celular ou e-mail dispara verificação automática de contas duplicadas.<br><br>' +
      '<b>Explorar — perfil rico:</b> a seção Pessoas agora menciona que tocar em qualquer card de usuário abre o perfil completo com H2H, parcerias e torneios em comum.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #6366f1;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.07);">' +
      '<div style="font-weight:800; color:#818cf8; font-size:1rem; margin-bottom:8px;">🔧 v1.6.78-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(16 de Maio, 2026)</span></div>' +
      '<p><b>Mesclagem automática de contas duplicadas por telefone e por e-mail.</b><br><br>' +
      'O sistema agora detecta e resolve automaticamente contas duplicadas em dois momentos:<br><br>' +
      '<b>Ao salvar o perfil:</b> sempre que o número de celular ou o e-mail é adicionado ou alterado, o servidor verifica se já existe outro usuário com o mesmo valor. Se encontrar, a conta menos completa é mesclada imediatamente na mais completa — sem intervenção manual.<br><br>' +
      '<b>Varredura diária (04:45 BRT):</b> uma rotina automática percorre toda a base de usuários buscando duplicatas por telefone e por e-mail, resolvendo qualquer caso que tenha escapado do trigger.<br><br>' +
      '<b>Critério de mesclagem:</b> a conta "vencedora" é a com perfil mais completo (nome real &gt; número de telefone, e-mail cadastrado, cidade, aniversário, gênero). Em empate, a conta mais nova é preservada. Toda a história de torneios, partidas casuais e ranking é transferida automaticamente.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #6366f1;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.07);">' +
      '<div style="font-weight:800; color:#818cf8; font-size:1rem; margin-bottom:8px;">✨ v1.6.74-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(16 de Maio, 2026)</span></div>' +
      '<p><b>Melhorias no sorteio da Liga: fairness de folgas, anti-repetição de adversários e modo "Todos contra todos".</b><br><br>' +
      '<b>Fix de folga (sit-out):</b> jogadores com menos folgas acumuladas agora são escolhidos primeiro para descansar — o comportamento anterior era invertido, fazendo o mesmo jogador descansar várias vezes seguidas.<br><br>' +
      '<b>Anti-repetição de adversários:</b> ao formar grupos de 4 no sorteio, o algoritmo testa 200 embaralhamentos aleatórios e escolhe o que minimiza repetições de confrontos já realizados. Pares que nunca se enfrentaram têm prioridade. O histórico de adversários fica salvo no torneio e evolui rodada a rodada.<br><br>' +
      '<b>Novo modo "🔄 Todos contra todos":</b> disponível ao criar/editar uma Liga. O organizador configura o número de turnos desejados; o app pré-gera um calendário completo onde, ao fim de cada turno, todos os jogadores da categoria terão se enfrentado pelo menos uma vez. O sorteio consome uma entrada do calendário a cada rodada gerada — sem surpresas.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #6366f1;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.07);">' +
      '<div style="font-weight:800; color:#818cf8; font-size:1rem; margin-bottom:8px;">🔧 v1.6.73-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(16 de Maio, 2026)</span></div>' +
      '<p><b>Fix definitivo: inscrição em torneio com categorias voltou a funcionar.</b><br><br>' +
      'Identificado conflito de nome de função: <code>create-tournament.js</code> definia <code>window._getTournamentCategories</code> sobrescrevendo a função canônica de <code>tournaments-categories.js</code>. ' +
      'A versão do create-tournament lê elementos do DOM do formulário de criação (que não existem durante a inscrição), retornava um objeto em vez de array, e causava erro silencioso (<code>.slice is not a function</code>) dentro de <code>_resolveEnrollmentCategory</code>. ' +
      'Corrigido: a função interna do create-tournament foi renomeada para <code>_getCreateFormCategoryData</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #6366f1;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.07);">' +
      '<div style="font-weight:800; color:#818cf8; font-size:1rem; margin-bottom:8px;">✨ v1.6.72-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(16 de Maio, 2026)</span></div>' +
      '<p><b>Mesclagem automática de conta celular com conta de e-mail.</b><br><br>' +
      'Quando você salva seu número de celular no perfil, o app verifica automaticamente se existe uma conta anterior criada via SMS com o mesmo número. ' +
      'Se encontrar, exibe um diálogo perguntando se deseja mesclar as duas contas — ao confirmar, todas as inscrições em torneios e o histórico de partidas casuais da conta antiga são transferidos para a conta atual. ' +
      'A conta antiga é desativada e não aparece mais nos resultados. ' +
      'Útil quando o login por SMS falhou (ex: reCAPTCHA) e a pessoa criou uma nova conta por e-mail/senha.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #6366f1;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.07);">' +
      '<div style="font-weight:800; color:#818cf8; font-size:1rem; margin-bottom:8px;">🔧 v1.6.71-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(16 de Maio, 2026)</span></div>' +
      '<p><b>Fix regressão: inscrição voltou a funcionar em torneios sem categorias combinadas.</b><br><br>' +
      'A v1.6.70 introduziu uma regressão onde <code>_getTournamentCategories</code> retornava array vazio quando <code>combinedCategories</code> estava presente mas vazio (<code>[]</code>), ' +
      'impedindo a inscrição de qualquer pessoa — incluindo o organizador. ' +
      'Corrigido: o fallback para <code>genderCategories</code>/<code>skillCategories</code> agora é ativado também quando <code>combinedCategories</code> existe mas está vazio.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #6366f1;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.07);">' +
      '<div style="font-weight:800; color:#818cf8; font-size:1rem; margin-bottom:8px;">✨ v1.6.70-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(16 de Maio, 2026)</span></div>' +
      '<p><b>Inscrição em categoria automática por habilidade e faixa etária.</b><br><br>' +
      'Ao se inscrever num torneio com categorias, o app agora usa os dados do perfil para determinar a categoria corretamente sem pedir confirmação:<br><br>' +
      '• <b>Gênero</b> — filtra para as categorias compatíveis (Fem, Masc, Misto).<br>' +
      '• <b>Faixa etária</b> — usa a data de nascimento do perfil para encontrar o bucket correto (40+, 50+, 60+, 70+). O bucket é exclusivo: 52 anos → 50+, não 40+ e 50+.<br>' +
      '• <b>Habilidade</b> — usa o nível da modalidade do torneio (<code>skillBySport</code>) ou o nível geral do perfil para filtrar por letra de categoria (A, B, C, D, FUN).<br><br>' +
      'Se após os três filtros restar apenas uma categoria, a inscrição ocorre diretamente. Se ainda houver ambiguidade (ex: perfil sem habilidade preenchida), o seletor é exibido apenas com as opções elegíveis. ' +
      'Também corrigido: categorias não apareciam quando o torneio tinha <code>genderCategories</code> preenchido mas <code>combinedCategories</code> ausente — agora o app recomputa automaticamente.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #6366f1;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.07);">' +
      '<div style="font-weight:800; color:#818cf8; font-size:1rem; margin-bottom:8px;">🔧 v1.6.69-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(16 de Maio, 2026)</span></div>' +
      '<p><b>Fix definitivo: regra Firestore aceita organizerEmail como admin quando adminEmails está vazio.</b><br><br>' +
      'A correção anterior (v1.6.68) tentava restaurar <code>adminEmails</code> em background antes de permitir o "Reabrir" — ' +
      'mas havia uma janela de corrida: o usuário clicava "Reabrir" antes dos 2s da recovery, e o save falhava da mesma forma. ' +
      'Fix definitivo: a função <code>isTournamentAdmin</code> nas regras do Firestore agora inclui um caminho de fallback — ' +
      'quando <code>adminEmails</code> está vazio ou ausente (bug v1.6.66), o <code>organizerEmail</code> declarado no documento ' +
      'serve como prova de identidade do organizador, permitindo qualquer escrita administrativa. ' +
      'A recovery em background continua rodando para repopular <code>adminEmails</code> e restaurar o caminho normal nas próximas sessões.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #6366f1;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.07);">' +
      '<div style="font-weight:800; color:#818cf8; font-size:1rem; margin-bottom:8px;">🔧 v1.6.68-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(16 de Maio, 2026)</span></div>' +
      '<p><b>Recuperação automática de torneios afetados pelo bug v1.6.66.</b><br><br>' +
      'Ao abrir o app, uma rotina silenciosa verifica todos os torneios do organizador logado onde <code>adminEmails</code> foi apagado pelo bug. ' +
      'Para cada torneio afetado, recomputa os campos <code>adminEmails</code> e <code>memberEmails</code> a partir dos dados existentes ' +
      '(creatorEmail, organizerEmail, co-hosts, participantes) e grava de volta no Firestore — sem nenhuma ação do usuário. ' +
      'A regra Firestore foi estendida com um caminho de recovery que permite exatamente essa operação quando <code>adminEmails</code> está vazio ' +
      'e o solicitante é o <code>organizerEmail</code> declarado no torneio.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #6366f1;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.07);">' +
      '<div style="font-weight:800; color:#818cf8; font-size:1rem; margin-bottom:8px;">🗓️ v1.6.67-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(16 de Maio, 2026)</span></div>' +
      '<p><b>Fix crítico: "Reabrir Inscrições" voltava em loop e gravação falhava silenciosamente.</b><br><br>' +
      'Ao expirar o prazo de inscrição, o código anterior chamava <code>saveTournament({ id, status })</code> com objeto parcial — ' +
      'isso fazia <code>_computeMemberEmails([]) = []</code> e apagava os campos <code>memberEmails</code> e <code>adminEmails</code> no Firestore. ' +
      'Sem esses campos, as regras de segurança do Firestore bloqueavam qualquer escrita posterior do organizador, ' +
      'gerando o toast "salvo localmente" e impedindo o "Reabrir Inscrições" de persistir. ' +
      'Fix: o intervalo agora localiza o objeto completo do torneio no AppStore, atualiza <code>status</code> em memória e salva o documento completo — ' +
      'preservando todos os campos de segurança. Fallback cirúrgico via <code>.update({ status })</code> quando o torneio não está em cache local.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #6366f1;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.07);">' +
      '<div style="font-weight:800; color:#818cf8; font-size:1rem; margin-bottom:8px;">🗓️ v1.6.66-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(16 de Maio, 2026)</span></div>' +
      '<p><b>Prazo de inscrições expira automaticamente no card da dashboard — sem precisar recarregar a página.</b><br><br>' +
      'Quando o prazo de inscrição de um torneio se encerra por decurso de tempo, o badge "Inscrições Abertas" no card da dashboard muda automaticamente para "Inscrições Encerradas" e o botão de inscrição some — em tempo real, sem refresh. ' +
      'Implementado via varredura no intervalo de 1s já existente para contadores: o badge carrega <code>data-regdeadline-ts</code> com o timestamp do prazo; quando o clock ultrapassa esse valor, o DOM é atualizado inline e o status "closed" é persistido no Firestore.<br><br>' +
      'Além disso, ao clicar em "Reabrir Inscrições", o prazo de inscrição anterior é apagado automaticamente — abrindo a possibilidade de definir um novo prazo ao editar o torneio.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #6366f1;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.07);">' +
      '<div style="font-weight:800; color:#818cf8; font-size:1rem; margin-bottom:8px;">📊 v1.6.65-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(16 de Maio, 2026)</span></div>' +
      '<p><b>Últimas partidas no setup casual aparecem corretamente após jogar.</b><br><br>' +
      'Dois bugs impediam que partidas recentes aparecessem na seção "📊 Últimas Partidas": ' +
      '(1) Race condition — ao terminar uma partida e voltar para o setup, a seção recarregava 300ms depois mas a gravação no Firestore ainda não tinha completado; ' +
      'a query rodava antes do status da partida ser "finished". Agora o recarregamento é acionado só após a gravação confirmar no servidor. ' +
      '(2) Limite baixo — a query buscava apenas 30 docs sem ordenação, e o Firestore retorna docs em ordem crescente de ID (≈ mais antigos primeiro); ' +
      'partidas recentes ficavam fora do slice. Limite aumentado para 200.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #6366f1;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.07);">' +
      '<div style="font-weight:800; color:#818cf8; font-size:1rem; margin-bottom:8px;">🤝 v1.6.64-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(16 de Maio, 2026)</span></div>' +
      '<p><b>Autocomplete em partida casual não mostra mais "Sugerir vínculo" nas estatísticas finais.</b><br><br>' +
      'Ao autocompletar o nome de um amigo no setup da partida, o vínculo já fica registrado e a notificação é disparada automaticamente ao fim da partida. ' +
      'A seção "Vincular jogadores" nas estatísticas finais não exibia mais o botão "🤝 Sugerir vínculo" para slots já autocompletados — era redundante. ' +
      'Agora esses slots são ignorados: se você usou autocomplete, o vínculo já foi feito.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #6366f1;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.07);">' +
      '<div style="font-weight:800; color:#818cf8; font-size:1rem; margin-bottom:8px;">👤 v1.6.57-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(15 de Maio, 2026)</span></div>' +
      '<p><b>Avatar e foto do amigo aparecem ao autocompletar no modo Técnico.</b><br><br>' +
      'Ao digitar o nome de um amigo no slot e selecionar via autocomplete, o avatar/foto e o gênero passavam a aparecer corretamente apenas fora do modo Técnico. ' +
      'No modo Técnico, o card sempre mostrava o ícone de arraste (⠿) em vez do avatar — porque a flag <code>_isLinkedCard</code> excluía o modo Técnico. ' +
      'Fix: <code>_isLinkedCard</code> não depende mais de <code>!_coachMode</code>; slots com amigo vinculado mostram avatar com ✕ em qualquer modo; ' +
      'apenas slots <i>sem</i> vínculo exibem o ⠿ de arraste no modo Técnico.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(52,211,153,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">👤 v1.6.56-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(15 de Maio, 2026)</span></div>' +
      '<p><b>Avatar de amigo carrega mesmo quando não estava em cache local.</b><br><br>' +
      'Ao sincronizar o <code>slotLinkedUid</code> de outro dispositivo, se o perfil do amigo ainda não estava no cache local (<code>_friendProfilesCache</code>), ' +
      'ele era buscado do Firestore mas a tela só re-renderizava <i>antes</i> do fetch completar — exibindo apenas o nome sem avatar/foto. ' +
      'Fix: <code>_renderSetup()</code> agora é chamado dentro do <code>.then()</code>, após o perfil chegar, garantindo que avatar e nome aparecem juntos em todos os clientes.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(52,211,153,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🔗 v1.6.55-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(15 de Maio, 2026)</span></div>' +
      '<p><b>Vínculo de amigo via autocomplete propagado para todos os participantes da sala.</b><br><br>' +
      'Quando o criador (ou técnico) seleciona um amigo via autocomplete, o avatar, foto e nome do perfil agora aparecem no slot de <b>todos os dispositivos</b> conectados à sala — ' +
      'não só no dispositivo que fez a seleção. O campo <code>slotLinkedUid</code> passou a ser persistido no Firestore e sincronizado pelo polling a cada 3 s. ' +
      'Participantes que entram depois do vínculo já formado vêem o estado correto desde o primeiro render. ' +
      'Perfis de amigos ainda não no cache local são carregados automaticamente ao sincronizar.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(52,211,153,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">⚥ v1.6.54-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(15 de Maio, 2026)</span></div>' +
      '<p><b>Autocomplete de amigos preenche o gênero automaticamente.</b><br><br>' +
      'Ao selecionar um amigo via autocomplete num slot da partida casual, o ícone de gênero do slot é preenchido automaticamente com o gênero do perfil do amigo. ' +
      'Isso garante que o toggle de duplas mistas apareça corretamente quando há 2 homens e 2 mulheres, sem precisar setar o gênero manualmente para cada slot vinculado.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(52,211,153,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">👤 v1.6.53-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(15 de Maio, 2026)</span></div>' +
      '<p><b>Fix: nome do usuário Google visível para outros usuários imediatamente após o primeiro login.</b><br><br>' +
      'Novos usuários que fizeram login pelo Google apareciam para outros com o <b>e-mail no lugar do nome</b> (ex: "fernando@gmail.com" em vez de "Fernando Cerri"). ' +
      'O nome só era corrigido se o próprio usuário abrisse o perfil e salvasse sem alterar nada.<br><br>' +
      'Causa: os handlers de login Google (popup e redirect) persistiam apenas <code>{ authProvider: "google.com" }</code> no Firestore — sem <code>displayName</code> nem <code>photoURL</code>. ' +
      'Outros usuários buscam o nome via Firestore, não via Firebase Auth, então viam o campo vazio e caíam no fallback de e-mail.<br><br>' +
      'Fix em três camadas: (1) handler do popup Google agora persiste <code>displayName</code> e <code>photoURL</code> junto com <code>authProvider</code>; ' +
      '(2) handler do redirect faz o mesmo; (3) safety net em <code>simulateLoginSuccess</code> — se o perfil Firestore ainda não tem <code>displayName</code> mas o auth do Google tem, ' +
      'persiste imediatamente. Novo usuário agora aparece com o nome correto para todos desde o primeiro login.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(52,211,153,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🔗 v1.6.52-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(15 de Maio, 2026)</span></div>' +
      '<p><b>Visual e integridade de dados no vínculo de amigos na partida casual.</b><br><br>' +
      'Quando um amigo é selecionado via autocomplete num slot editável, o slot agora exibe o <b>avatar/foto e nome completo do perfil</b> — ' +
      'igual ao tratamento visual de um participante registrado no lobby. O ícone ✕ sobreposto ao avatar permite desvincular com um toque.<br><br>' +
      'A notificação de confirmação (<code>casual_link_request</code>) é disparada <b>automaticamente</b> após a partida encerrar para todos os slots com vínculo de autocomplete — ' +
      'não requer ação manual do criador. Se o amigo <b>rejeitar</b>, o uid é removido do documento da partida e o registro do <code>matchHistory</code> desse usuário é apagado do banco de dados. ' +
      'Se <b>aceitar</b>, os registros ficam intactos.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(52,211,153,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🔗 v1.6.51-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(15 de Maio, 2026)</span></div>' +
      '<p><b>Autocomplete de amigos nos slots da partida casual.</b><br><br>' +
      'Ao digitar o nome de um jogador num slot editável (modo técnico ou slot de convidado), ' +
      'um dropdown de sugestões aparece com amigos do scoreplace cujo nome bate com o que foi digitado. ' +
      'Clicar preenche o nome e vincula o uid do amigo ao slot — assim as stats pós-partida são atribuídas ao perfil correto.<br><br>' +
      'O vínculo fica visível como badge "🔗 nome vinculado" abaixo do card, com botão ✕ para desvincular. ' +
      'A confirmação de vínculo acontece <b>pós-partida</b> via notificação existente (<code>casual_link_request</code>) — ' +
      'o amigo aceita ou recusa no app, e-mail ou WhatsApp, sem interromper a partida.<br><br>' +
      'Fix (v1.6.50): nomes dos slots resetavam para "Jogador X" após clicar 🔗 para desfazer duplas. ' +
      'O intervalo de polling Firestore continuava rodando com o room code antigo após o reset da sessão. ' +
      'Corrigido parando o intervalo dentro de <code>_casualReopenSetup</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(52,211,153,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">📸 v1.6.29-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(15 de Maio, 2026)</span></div>' +
      '<p><b>Trofeu "Com Rosto" usa Google People API — fonte autoritativa.</b><br><br>' +
      'A v1.6.28 rejeitava TODA URL <code>googleusercontent.com</code> (default ou foto real) e só aceitava upload via app. Trade-off: usuário com foto Google real perdia o troféu até fazer upload.<br><br>' +
      '<b>Agora:</b> no login Google, capturamos o <code>accessToken</code> e chamamos <code>https://people.googleapis.com/v1/people/me?personFields=photos</code>. ' +
      'A People API retorna o campo <code>default</code> na foto: <code>true</code> significa "monograma gerado automaticamente, user nunca cadastrou foto"; <code>false</code> significa "foto real cadastrada no Google".<br><br>' +
      'Resposta autoritativa do próprio Google — substitui todas as heurísticas frágeis das versões anteriores (URL patterns v1.6.13, pixel sampling v1.6.24).<br><br>' +
      'Flag <code>hasGooglePhotoReal</code> salvo no profile. Check do trofeu aceita:<br>' +
      '• URL <code>firebasestorage.googleapis.com</code> (upload via app), OU<br>' +
      '• URL <code>googleusercontent.com</code> com <code>hasGooglePhotoReal === true</code><br><br>' +
      'Falha graceful: se People API der erro de rede/CORS, fallback fica sem flag e a check só aceita upload via app (comportamento v1.6.28).<br><br>' +
      '<b>Para usuários afetados:</b> basta fazer login Google na nova versão. People API roda 1 vez, flag fica salva. <code>revocable:true</code> garante revogação automática pra quem está com flag ausente ou false.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(52,211,153,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🛠️ v1.6.28-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(15 de Maio, 2026)</span></div>' +
      '<p><b>2 bugs corrigidos.</b><br><br>' +
      '<b>(1) Identidade dos slots embaralhada quando alguém sai.</b> Reportado com screenshot: Nelson (criador) saiu da sala, mas no celular do Rodrigo o slot 0 ficou com nome "Nelson Barth" + foto do Rodrigo, e o slot 1 ficou com "Rodrigo" sem foto. Causa: polling atualizava <code>_lobbyParticipants</code> e limpava só inputs 1b/2a/2b (não o 1a). Slot 0 mantinha o input value antigo ("Nelson Barth") enquanto o avatar lia do <code>_lobbyParticipants[0]</code> que agora era Rodrigo. Fix: quando count decrescer (alguém sai), agora faz <code>_renderSetup()</code> completo — todos os slots reconstruídos do zero usando <code>_lobbyParticipants</code> atualizado.<br><br>' +
      '<b>(2) Trofeu "Com Rosto" definitivo — exige upload via app.</b> Reportado: continua aparecendo pra quem só logou Google sem foto real. Após 5 versões tentando heurística (patterns de URL v1.6.13, diagnóstico v1.6.16, pixel sampling assíncrono v1.6.24), abordagem foi <b>simplificada drasticamente</b>: ' +
      '<b>só conta foto que foi feita upload via app</b> (URL contém <code>firebasestorage.googleapis.com</code>). Qualquer URL <code>googleusercontent.com</code> (avatar default OU foto real do Google) agora é REJEITADA. Trade-off: usuário com foto Google real que NUNCA fez upload via app perde o troféu até fazer. Aceitável porque o trofeu chama "Com Rosto" — upload é evidência mais forte. Quem ganhou indevidamente perde no próximo login via flag <code>revocable: true</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(52,211,153,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">❓ v1.6.27-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(15 de Maio, 2026)</span></div>' +
      '<p><b>Ícone "?" de gênero indefinido agora chamativo.</b> Reportado pelo dono: <i>"quando o perfil não traz o gênero do jogador, isso deve ser selecionável (indicado pelos participantes)"</i>. ' +
      'A funcionalidade já existia (qualquer participante podia clicar no ícone "?" pra definir gênero do slot, inclusive pra logado sem campo gender no perfil), mas o "?" estava cinza discreto e usuários não percebiam que era clicável.<br><br>' +
      '<b>UX mais óbvia:</b> agora o "?" tem fundo + borda âmbar + animação pulse + label "Toque pra definir o gênero". Para slots com gênero JÁ definido (♂♀⚥), label mudou pra "[Gênero] — toque pra mudar" deixando claro que sempre pode ser ajustado.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(52,211,153,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">⚥ v1.6.26-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(15 de Maio, 2026)</span></div>' +
      '<p><b>Gênero do jogador por slot + toggle "Duplas mistas" automático.</b><br><br>' +
      '<b>(1) "Sexo" → "Gênero"</b> no perfil dos usuários. Apenas mudança de label, valores internos (<code>masculino</code>/<code>feminino</code>/<code>outro</code>) preservados.<br><br>' +
      '<b>(2) Ícone de gênero no card de cada jogador</b> da partida casual: ♂ azul / ♀ rosa / ⚥ roxo / ? cinza (não definido). Vem do perfil quando o jogador é logado e tem o campo preenchido. Para guests OU logados sem gênero no perfil, é clicável — abre picker com 4 opções (Masculino / Feminino / Outro / Não definir). Sobrescrita por partida é local ao jogo, não altera o perfil.<br><br>' +
      '<b>(3) Toggle "Duplas mistas"</b> aparece automaticamente logo abaixo de "Sortear Duplas" QUANDO houver 2M+2F entre os 4 slots (logados + guests com gênero definido). Antes só contava logados com gênero no perfil — agora qualquer combinação que totalize 2+2 ativa o toggle, e ao iniciar a partida o sorteio força 1M+1F por dupla.<br><br>' +
      'Gêneros por slot sincronizados via Firestore (<code>slotGenders</code>) → todos os clientes da sala veem a mesma configuração em até 3s (polling do setup).</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(52,211,153,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🔁 v1.6.25-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(15 de Maio, 2026)</span></div>' +
      '<p><b>2 bugs de sincronização da sala única.</b><br><br>' +
      '<b>(1) Drag-drop de duplas não propagava entre clientes.</b> Quando A formava times via drag-drop, gravava <code>players[].team</code> no Firestore corretamente — mas o polling de B SÓ sincronizava nomes (inputs), nunca aplicava o <code>.team</code> no <code>_teamAssignments</code> local. Resultado: time formado por A não aparecia visualmente pra B. Agora o polling deriva <code>_teamAssignments</code> de <code>fresh.players[].team</code> quando <code>teamsFormed=true</code>, faz re-render. Espelho do break (clicar 🔗 pra desfazer) também propaga.<br><br>' +
      '<b>(2) Rodrigo deixou a partida mas continuou aparecendo no slot.</b> <code>leaveCasualMatch</code> apagava só <code>uid/displayName/photoURL</code> do player, MAS mantinha <code>name</code>. Outros clientes faziam polling, viam o name persistido e mantinham "Rodrigo" no input do slot. Agora o slot fica TOTALMENTE livre (preserva só o índice <code>slot</code>) — outros clientes veem o slot vazio imediatamente.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(52,211,153,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🎨 v1.6.24-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(15 de Maio, 2026)</span></div>' +
      '<p><b>Conquista "Com Rosto" — detecção de monograma via pixel sampling.</b> Reportado que usuários com avatar de iniciais (login Google sem foto real) continuam ganhando o troféu mesmo após v1.6.13 (7 patterns) e v1.6.16 (diagnóstico).<br><br>' +
      'A check síncrona depende de patterns conhecidos (<code>/a-/</code>, <code>default-user</code>, etc.) que Google pode mudar a qualquer momento. <b>Segunda camada de defesa</b> adicionada: verificação <b>assíncrona via pixel sampling</b>:<br><br>' +
      '1. No bootstrap, se user tem o troféu, carrega a foto via <code>&lt;img crossOrigin="anonymous"&gt;</code> em canvas 64×64.<br>' +
      '2. Sample de ~256 pixels com quantização agressiva (buckets de 16 RGB).<br>' +
      '3. Conta cores únicas. Monograma típico: <b>3-8 cores</b> (fundo sólido + texto + anti-alias). Foto real: <b>50+ cores</b>.<br>' +
      '4. Se < 12 cores únicas → <b>revoga o troféu automaticamente</b>.<br><br>' +
      'Funciona pra QUALQUER monograma (Google, Apple, qualquer provedor) — não depende de pattern conhecido. CORS: se canvas ficar tainted, retorna inconclusivo (false negative seguro, deixa a sync check decidir).<br><br>' +
      'Diagnóstico exposto em <code>window._lastMonogramCheck</code> (photoURL, uniqueColors count, status, revoked).</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(52,211,153,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🎥 v1.6.23-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(15 de Maio, 2026)</span></div>' +
      '<p><b>Câmera do scanner libera definitivamente após entrar na sala (iOS PWA).</b> Screenshot do dono mostrou que após o scanner ler o QR e entrar na partida, o badge "gravando" continuou no Dynamic Island do iPhone. v1.6.21 não foi suficiente em iOS PWA standalone.<br><br>' +
      '<b>3 defesas adicionais:</b><br>' +
      '<b>(a) Registry global de streams</b> — todos os MediaStreams criados pelo scanner ficam em <code>window._scanStreamRegistry</code>. Cleanup itera o registry inteiro parando tracks de qualquer stream órfão de aberturas anteriores. <code>_scanStream</code> só apontava ao último.<br>' +
      '<b>(b) <code>srcObject = new MediaStream()</code> vazia em vez de <code>null</code></b> — bug iOS PWA standalone conhecido: <code>srcObject = null</code> não libera o stream em alguns builds; MediaStream vazia força o browser a desconectar.<br>' +
      '<b>(c) Delay de 150ms antes de remover DOM</b> — dá tempo do iOS processar a liberação dos recursos antes do video element ser destruído pelo <code>o.remove()</code>. Sem isto, o badge persistia mesmo após <code>track.stop()</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(52,211,153,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">👥 v1.6.22-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(15 de Maio, 2026)</span></div>' +
      '<p><b>Partida casual sem mais nomes duplicados nos times.</b> Reportado: partida gravou "Nelson nos 2 times" em vez de "Rodrigo e Cica × Nelson e Kelly".<br><br>' +
      '<b>Causa-raiz:</b> <code>_buildPlayers</code> lia os <i>inputs do DOM</i> como source of truth pra todos os 4 slots. Esses inputs podiam ser corrompidos por: (a) sync polling escrevendo nomes errados; (b) touch focus em iOS causando race; (c) DOM duplicado em re-render parcial; (d) o usuário tocando acidentalmente um input que já tinha um logado.<br><br>' +
      '<b>Fix:</b> <code>_buildPlayers</code> reescrito. Pra cada slot, <i>se</i> <code>_lobbyParticipants[idx]</code> tem <code>uid + displayName</code>, o nome vem DALI (source of truth). Inputs editáveis só pra slots de guest (sem logado). Não há mais possibilidade de DOM corrompido sobrescrever a identidade de um logado.<br><br>' +
      'Diagnóstico exposto em <code>window._lastBuildPlayers</code> com snapshot completo (currentUser, lobbyParticipants, DOM input values, output). Próxima vez que algo se comportar inesperado é só rodar no DevTools e me mandar.<br><br>' +
      'Validado via Preview MCP simulando 4 logados (Rodrigo+Cica+Nelson+Kelly): saída correta — slot 0 Rodrigo, slot 1 Cica (T1), slot 2 Nelson, slot 3 Kelly (T2). Cada um com seu uid próprio, sem duplicação.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(52,211,153,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🛑 v1.6.21-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(14 de Maio, 2026)</span></div>' +
      '<p><b>Câmera do scanner QR libera corretamente no iOS.</b> Reportado: indicador "câmera em uso" no topo do iOS continuava aparecendo mesmo depois de entrar na sala. ' +
      'Causa: no iOS Safari, só chamar <code>track.stop()</code> NÃO basta — o elemento <code>&lt;video&gt;</code> ainda mantém referência ao MediaStream via <code>srcObject</code>, e o iOS mantém o badge da câmera enquanto essa referência existir.<br><br>' +
      '<b>Cleanup robusto agora faz na ordem certa:</b> (1) <code>video.pause()</code> — para exibição; (2) para tracks de QUALQUER stream attached (defesa contra streams órfãos); (3) <code>video.srcObject = null</code> — solta a referência; (4) <code>video.removeAttribute(\'src\')</code> + <code>video.load()</code> — força o browser a liberar recursos de mídia.<br><br>' +
      '<b>Defense in depth:</b> listeners <code>pagehide</code> e <code>hashchange</code> também disparam cleanup, caso o user navegue por outro caminho que não o X ou a detecção de QR (raro mas possível com browser back/forward).</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(52,211,153,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">📸 v1.6.20-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(14 de Maio, 2026)</span></div>' +
      '<p><b>Scanner QR robustecido — 5 bugs prováveis fixados.</b> Reportado: scanner não estava lendo QR. Auditoria identificou 5 causas potenciais e todas foram corrigidas no mesmo deploy:<br><br>' +
      '<b>(1) <code>video.play()</code> agora é explícito</b> — autoplay nem sempre dispara em iOS Safari PWA standalone, apesar dos atributos <code>autoplay/playsinline/muted</code>. Adicionado <code>play()</code> explícito após <code>srcObject</code>.<br>' +
      '<b>(2) Resolução de câmera elevada</b> — antes era default (frequentemente 640×480, baixa demais pra jsQR decodificar QRs pequenos). Agora pede <code>1280×720</code> ideal, com fallback <code>OverconstrainedError</code> pra câmeras mais limitadas.<br>' +
      '<b>(3) jsQR pré-carregado em paralelo</b> — antes carregava DEPOIS de pedir câmera, criando race onde user apontava QR mas decoder ainda não existia. Agora carrega ANTES da câmera abrir.<br>' +
      '<b>(4) Mensagens de erro específicas</b> — antes erro de permissão era só <code>console.warn</code>. Agora cada tipo (<code>NotAllowedError</code>, <code>NotFoundError</code>, <code>NotReadableError</code>) tem mensagem clara na tela com instrução de como resolver.<br>' +
      '<b>(5) <code>inversionAttempts: \'attemptBoth\'</code></b> — antes só tentava QRs não-invertidos. Agora tenta os dois (regular + invertido), cobre QRs com fundos escuros.<br><br>' +
      '<b>Loop de detecção também mais rápido</b>: 200ms (5fps) vs 300ms antes. <b>Diagnóstico exposto</b> em <code>window._scanDebug</code> com: frames processados, video dimensions, erros, status do decoder, última detecção. Permite debug remoto via DevTools quando user reportar.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(52,211,153,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🎯 v1.6.19-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(14 de Maio, 2026)</span></div>' +
      '<p><b>Scanner QR com leitura em tempo real estilo iOS.</b> Reversão da v1.6.18 (que abria câmera sem detecção). PWA web não consegue invocar o "Scanner de Código" nativo do iOS (não há URL scheme público), mas dá pra reproduzir a UX usando <code>getUserMedia</code> + decodificação contínua via <code>BarcodeDetector</code> nativo (Chrome Android — super rápido) ou <code>jsQR</code> (Safari iOS — fallback).<br><br>' +
      'UI redesenhada estilo iOS: câmera ocupando a tela inteira, mira centralizada com 4 cantos brancos animados, texto sutil "Aponte para o QR code" no topo, X pra fechar no canto superior direito, botão discreto "⌨️ Digitar código" no rodapé pra entrada manual. Sem mais overlay competindo com o feed.<br><br>' +
      'Detecção em tempo real (300ms loop): câmera abre, usuário aponta pro QR, sistema detecta automaticamente e navega pra <code>#casual/&lt;roomCode&gt;</code> sem precisar tirar foto.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(52,211,153,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">📸 v1.6.18-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(14 de Maio, 2026)</span></div>' +
      '<p><b>Scanner QR agora abre câmera nativa do celular.</b> Antes: overlay customizado com câmera embarcada via <code>getUserMedia</code> + jsQR rodando em loop — interface diferente do que os usuários conhecem, e em alguns dispositivos a permissão de câmera era negada silenciosamente.<br><br>' +
      'Agora: o botão dispara <code>&lt;input type="file" accept="image/*" capture="environment"&gt;</code> — abre o <b>app de câmera nativo</b> do celular (UI 100% do SO, sem overlay customizado). Usuário tira foto do QR code, retorna pro app, jsQR decodifica e navega pra <code>#casual/&lt;roomCode&gt;</code>.<br><br>' +
      '<b>Limitação técnica honesta:</b> PWA web não consegue abrir o "Scanner de Código" nativo do iOS (não existe URL scheme público). Esse fluxo "tirar foto + decodificar" é o mais nativo possível — sem mais overlay simulado. Fallback elegante: se a foto não tiver QR detectável, abre dialog pra digitar o código manualmente.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(52,211,153,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🎯 v1.6.17-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(14 de Maio, 2026)</span></div>' +
      '<p><b>Botão "Escanear QR" redesenhado no estilo iOS.</b> Pedido do dono. Antes: botão ciano grande com texto "📷 Entrar via QR" (54px de altura, mesma proeminência de Pessoas/Convidar). Agora: ícone circular pequeno e discreto (44×44px), transparente com borda sutil, SVG com 4 vértices angulares (cantos L) e um QR code estilizado de 4 quadrinhos no centro — exatamente como o ícone de scanner do iOS. Não compete visualmente com os botões primários da row.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(52,211,153,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">📐 v1.6.16-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(14 de Maio, 2026)</span></div>' +
      '<p><b>(1) Fontes proporcionais em Android — fim das fontes infladas no live scoring.</b> Reportado: no Android da amiga as fontes do placar ao vivo ficaram bem maiores do que no iOS, sem caber na tela. ' +
      'Causa: Android Chrome respeita o setting de Acessibilidade "Tamanho de fonte" do sistema e multiplica os <code>rem</code>/<code>em</code> do CSS — quando o usuário tem font scaling acima de 100% no Android, todas as fontes inflam, quebrando layouts calibrados com <code>clamp()</code>. iOS Safari ignora esse setting por default. ' +
      '<b>Fix:</b> regra <code>text-size-adjust: 100%</code> (com prefixos <code>-webkit-</code> e <code>-moz-</code>) adicionada ao <code>body</code> — trava font scaling em 100% no Android Chrome também, restaurando consistência cross-device. UI permanece responsiva via <code>clamp(min, vw, max)</code> que já existia.<br><br>' +
      '<b>(2) Diagnóstico do troféu "Com Rosto".</b> Nelson reporta que continua ganhando o troféu mesmo sem foto real, a cada login/atualização. Patterns rejeitados na v1.6.13-beta não pegaram o caso dele. Sem URL real, é impossível adicionar pattern certo. ' +
      'Agora ao conceder o troféu <code>perfil_foto</code>, o doc Firestore recebe <code>_debugInfo</code> com a URL completa avaliada (Firebase Auth + AppStore), <code>displayName</code>, <code>email</code> e <code>providerId</code>. Inspecionável via Firebase Console em <code>users/{uid}/trophies/perfil_foto</code> sem precisar de DevTools no celular do user. Console também loga <code>[trophy perfil_foto AWARDED]</code> com a URL. Próximo report do Nelson permite identificar exatamente qual pattern adicionar.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(52,211,153,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">📷 v1.6.15-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(14 de Maio, 2026)</span></div>' +
      '<p><b>Botão "Entrar via QR" na dashboard.</b> Acesso direto ao leitor de QR code (com fallback pra digitar código manualmente) na home — logo abaixo da row "Partida Casual / Novo Torneio / Place", à esquerda de "Pessoas". ' +
      'Usa a câmera do dispositivo (BarcodeDetector nativo em Chrome Android, jsQR carregado via CDN em outros browsers) pra escanear QR code de partida casual e entrar direto na sala via <code>#casual/&lt;roomCode&gt;</code>. ' +
      'Cor ciano pra diferenciar dos demais (índigo do Pessoas, roxo do Convidar).</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(52,211,153,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🏁 v1.6.14-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(14 de Maio, 2026)</span></div>' +
      '<p><b>Stats no fim da partida casual + persistência em "últimas partidas" — fix duplo.</b> Reportado: tela do Nelson travou sem stats no final, apareceu só pro Rodrigo. Nenhum dos dois viu a partida em "últimas partidas".<br><br>' +
      '<b>Bug A (Nelson sem stats):</b> o autosave em <code>_saveResult</code> gravava apenas <code>status:\'finished\'</code> + <code>result</code> + <code>playerUids</code> no Firestore, MAS não gravava o <code>liveState</code>. O <code>liveState</code> ficava pra próxima sincronização debounced (<code>_syncLiveState</code>, 300ms). Race: o cliente B (Nelson) recebia <code>status:\'finished\'</code> via <code>onSnapshot</code> antes do <code>liveState</code> atualizado chegar, então <code>_applyRemoteState</code> aplicava um estado antigo (sem <code>isFinished=true</code> nem <code>winner</code>) e a tela travava sem stats. ' +
      '<b>Fix:</b> autosave agora serializa <code>liveState</code> e grava JUNTO com <code>status:\'finished\'</code> num único <code>update()</code>. Cancela qualquer <code>_syncTimer</code> pendente pra evitar last-write-wins favorecer estado obsoleto.<br><br>' +
      '<b>Bug B (partida não aparece em "últimas partidas"):</b> ao clicar Voltar depois da partida ter terminado, o <code>_closeLiveScoring</code> do guest (Nelson) disparava <code>leaveCasualMatch</code> — que <b>remove o uid dele de <code>playerUids</code> e <code>participants</code> no doc Firestore</b>. Como a query <code>where(\'playerUids\', \'array-contains\', uid)</code> filtra essas listas, a partida finalizada SUMIA do histórico do guest. ' +
      '<b>Fix:</b> <code>leaveCasualMatch</code> agora só dispara quando match NÃO terminou. Partida finalizada preserva todos os jogadores em <code>playerUids</code> — histórico funciona pra todos.<br><br>' +
      'Diagnóstico exposto: <code>window._lastCasualSaveResult</code> revela docId, playerUids, winner, hasLiveState e timestamp do último save. Útil pra debug via DevTools quando algo se comportar inesperado.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(52,211,153,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">📸 v1.6.13-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(14 de Maio, 2026)</span></div>' +
      '<p><b>Conquista "Com Rosto" — detecção agressiva de avatares default do Google.</b> Reportado: usuários sem foto real continuam ganhando o troféu mesmo após v1.6.10-beta. ' +
      'Causa: Google retorna URL <code>googleusercontent.com</code> mesmo pra contas sem foto cadastrada (tipicamente um monograma com inicial colorida sobre fundo sólido), e a checagem anterior só rejeitava quando <code>firebase.auth().currentUser.photoURL</code> estava explicitamente null — o que raramente acontece.<br><br>' +
      'Patterns de default agora rejeitados: <code>/a-/</code> (variante com hífen, padrão Google 2024+), <code>default-user</code>, <code>default-avatar</code>, <code>no_picture</code>, <code>no_photo</code>, e o placeholder antigo <code>/AAAAAAAAAAI/AAAAAAAAAAA/</code>. Também: rejeita <code>ui-avatars.com</code> além do <code>dicebear.com</code> que já era rejeitado.<br><br>' +
      'Adicionado diagnóstico: <code>window._lastPhotoCheckURL</code> e <code>window._lastPhotoCheckFbHas</code> expõem a URL avaliada e se o Firebase Auth confirmou foto — útil pra inspeção via DevTools quando o troféu se comportar inesperado.<br><br>' +
      '<b>Como funciona o revoke:</b> a flag <code>revocable: true</code> faz com que cada login revalide o check. Se a condição falha agora, o troféu é deletado do Firestore + cache local — perde-se automaticamente sem ação manual.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(52,211,153,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🔄 v1.6.12-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(14 de Maio, 2026)</span></div>' +
      '<p><b>Sincronização de nomes entre clientes na sala única.</b> Fix follow-up da v1.6.11-beta — após o refactor de sala única, dois clientes na mesma partida casual ainda não viam os nomes que o outro digitava. ' +
      'Quando A digitava "Maria" no slot 2, o <code>_syncCasualSetupDebounced</code> persistia no Firestore após 500ms, mas o polling de 3s do cliente B só checava <code>participants.length</code> (entrada/saída de logados) — ignorava mudanças em <code>players[]</code> (nomes digitados). ' +
      'Agora o polling sincroniza o array <code>fresh.players</code> nos inputs do DOM com 3 guards: (1) skip slots ocupados por participantes logados (input é readonly, vem de displayName), (2) skip input atualmente focado pelo usuário local (não sobrescreve enquanto está digitando — last-write-wins via debounce 500ms), (3) skip nomes default ("Jogador 1-4", "Parceiro", "Adversário"). ' +
      'Convergência típica: até 3s entre digitação no cliente A e visualização no cliente B.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(52,211,153,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">⚡ v1.6.11-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(14 de Maio, 2026)</span></div>' +
      '<p><b>Correções críticas em Partida Casual</b> — 5 regressões reportadas em uso real foram diagnosticadas e corrigidas no mesmo deploy. <b>Auditoria consolidada</b>, sem hotfix em cima de hotfix.<br><br>' +
      '<b>(1) Sala única — sem host/guest:</b> agora todos os logados que entram numa partida casual veem a <i>mesma</i> tela editável (nomes, drag-and-drop de duplas, scoring, botão Iniciar). Antes, só o criador via a tela de setup completa — quem entrava via QR/link caía em lobby readonly "Aguardando organizador". Pedido literal do dono: <i>"existe apenas a sala de um jogador e quando o outro entra passa a estar na mesma sala. não há host ou guest. todos tem que ter os mesmos poderes na partida casual."</i> Slot 0 agora é sempre o primeiro participante (criador) — antes era hardcoded no current user, gerando inconsistência entre clientes.<br><br>' +
      '<b>(2) Jogadores 3 e 4 nomeados pelo criador agora aparecem pros outros:</b> antes, quando alguém digitava "Maria" / "João" como convidados (slots sem login), os outros participantes não viam — ficavam eternamente em "aguardando 2 jogadores". Agora os guests nomeados aparecem na lista do lobby com badge "(convidado)" e o contador "N de M jogadores" reflete a realidade.<br><br>' +
      '<b>(3) Partida concluída agora persiste automaticamente:</b> root cause encontrado — quando a partida acabava (último ponto detectado), a tela de stats aparecia mas o save no Firestore só disparava se o usuário clicasse manualmente "Fechar" / "Recomeçar" / "Desparear". Quem fechasse o app na tela de stats deixava o doc eternamente com <code>status:\'active\'</code> e a partida sumia de "Últimas partidas". Agora o save dispara <b>no instante exato</b> em que <code>state.isFinished = true</code> — antes do render das stats. Belt-and-suspenders adicional em <code>visibilitychange</code> e <code>pagehide</code> garante persistência mesmo se a rede falhar no momento.<br><br>' +
      '<b>(4) Vínculo de conta com amigo agora tem botões:</b> notificação <code>casual_link_request</code> (ex: "Maria, você jogou esta partida?") agora renderiza os botões "✅ Sim, era eu" / "❌ Não". Antes, o destinatário recebia a notificação informativa mas sem ação possível. Causa: whitelist rígido em <code>_sendUserNotification</code> que descartava silenciosamente campos custom (<code>casualMatchDocId</code>, <code>casualRoomCode</code>, <code>casualSlotIndex</code>, <code>casualGuestName</code>). Mesmo whitelist também quebrava o botão "⚡ Entrar na partida" em convites — corrigido na mesma mudança.<br><br>' +
      '<b>(5) Detecção de Iniciar pelos outros clientes:</b> quando qualquer participante clica "Iniciar" no setup, todos os demais (que estão na mesma sala) detectam via polling de 3s e transitam pra tela de placar ao vivo automaticamente. Antes só o criador podia iniciar.<br><br>' +
      '<b>"Voltar" no setup agora respeita o modelo de sala única:</b> se sou o único na sala, deleta o doc (cancel). Se há outros, só libera minha vaga (leave) — a sala continua viva pros demais. Antes, qualquer "Voltar" cancelava pra todos.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(52,211,153,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🔧 v1.6.10-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(14 de Maio, 2026)</span></div>' +
      '<p><b>3 correções de comportamento.</b><br>' +
      '• <b>Logoff vai para a landing:</b> ao sair da conta, o app sempre navega para a tela inicial (landing), independente da página em que o usuário estava.<br>' +
      '• <b>Versão da landing atualizada:</b> a landing page agora exibe corretamente a versão atual (<b>v1.6.10-beta</b>) em vez de uma versão antiga.<br>' +
      '• <b>Conquista "Com Rosto" corrigida:</b> usuários que logaram com Google mas só têm avatar de iniciais (sem foto real na conta Google) não ganham mais — e quem ganhou incorretamente perde — o troféu "Com Rosto".<br>' +
      'A conquista agora usa o Firebase Auth como fonte de verdade para o photoURL (evita valor stale do Firestore) e é marcada como revogável: se a condição não é mais atendida, o troféu é removido automaticamente no próximo login.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(52,211,153,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">👤 v1.6.9-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(14 de Maio, 2026)</span></div>' +
      '<p><b>Perfil completo agora exige todos os 9 campos essenciais.</b><br>' +
      '• <b>Antes:</b> 4 campos (sexo, nascimento, cidade/local, modalidade).<br>' +
      '• <b>Agora:</b> nome real, foto de verdade (não ícone de iniciais), sexo, data de nascimento, cidade, modalidade preferida, nível de habilidade, telefone e pelo menos 1 local favorito.<br>' +
      '• O banner "Complete seu perfil" na dashboard mostra exatamente quais dos 8 campos (além do nome) ainda faltam.<br>' +
      '• A conquista <b>"Identidade Completa"</b> e seus critérios foram atualizados da mesma forma.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(52,211,153,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">📸 v1.6.8-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(14 de Maio, 2026)</span></div>' +
      '<p><b>Conquista "Com Rosto" exige foto real.</b><br>' +
      '• O ícone de iniciais (avatar gerado automaticamente) não confere mais o troféu/conquista "Com Rosto".<br>' +
      '• Apenas foto vinda do login Google/Apple ou futuramente de upload direto qualifica.<br>' +
      '• Critério consistente com o resto do app (mesmo filtro já usado para exibição de avatar).</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(52,211,153,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🧑‍⚖️ v1.6.7-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(14 de Maio, 2026)</span></div>' +
      '<p><b>Organizador agora aparece na lista de árbitros disponíveis.</b><br>' +
      '• Removido o filtro que excluía o organizador da lista "Disponíveis" na página de árbitros.<br>' +
      '• Para si mesmo, o botão é "✓ Arbitrarei" (verde-água) que auto-confirma diretamente — sem fluxo de convite.<br>' +
      '• Para outros árbitros, o botão continua "+ Convidar" (índigo) com fluxo normal.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(52,211,153,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🧑‍⚖️ v1.6.6-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(14 de Maio, 2026)</span></div>' +
      '<p><b>Toggle de árbitro no perfil mais explícito.</b><br>' +
      '• O botão 🧑‍⚖️ foi substituído por um toggle switch visual com o label <b>"Arbitrar"</b> ao lado de cada modalidade.<br>' +
      '• Quando ativo: label em verde-água + trilho colorido + bolinha deslocada para a direita.<br>' +
      '• Quando inativo: label em cinza + trilho escuro + bolinha à esquerda.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(52,211,153,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🔙 v1.6.5-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(14 de Maio, 2026)</span></div>' +
      '<p><b>Editar torneio agora volta ao card do torneio após salvar ou descartar.</b><br>' +
      '• Salvar edição: exibe toast "Torneio atualizado!" e navega direto para o card do torneio editado.<br>' +
      '• Descartar edição: exibe toast "Alterações descartadas" e também volta ao card do torneio.<br>' +
      '• Criar novo torneio (sem alteração): continua navegando para o dashboard após descartar.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(52,211,153,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">⚖️ v1.6.4-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(14 de Maio, 2026)</span></div>' +
      '<p><b>Revisão jurídica completa — Política de Privacidade (9 seções) e Termos de Uso (9 seções).</b><br>' +
      '<b>Política de Privacidade — adicionados:</b><br>' +
      '• Seção 1: diagnóstico técnico via Sentry e dados de uso via Google Analytics 4 como dados coletados;<br>' +
      '• Seção 2: GA4 e Sentry listados como sub-processadores;<br>' +
      '• Seção 6 (nova): Cookies e armazenamento local — localStorage sem cookies de rastreamento;<br>' +
      '• Seção 7 (nova): Alterações desta Política — sem aviso prévio em beta, com aviso após versão estável;<br>' +
      '• DPO renumerado para seção 8; Contato para seção 9.<br>' +
      '<b>Termos de Uso — adicionados:</b><br>' +
      '• Intro: Terra Barth Serviços Administrativos Ltda identificada como operadora;<br>' +
      '• Seção 1: vedação explícita para menores de 12 anos (LGPD art. 14);<br>' +
      '• Seção 5: força maior adicionada à limitação de responsabilidade;<br>' +
      '• Seção 6 (nova): Propriedade Intelectual — marca e código pertencem à Terra Barth;<br>' +
      '• Seção 7 (nova): Alterações nestes Termos — sem aviso prévio em beta;<br>' +
      '• Seção 8 (nova): Foro e Lei Aplicável — Comarca de São Paulo/SP, lei brasileira;<br>' +
      '• Contato renumerado para seção 9.<br>' +
      'Banner beta restaurado: mudanças e dados podem ocorrer sem aviso durante fase beta.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(52,211,153,0.07);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">⚖️ v1.6.3-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(14 de Maio, 2026)</span></div>' +
      '<p><b>Revisão jurídica — Política de Privacidade e Termos de Uso.</b><br>' +
      '• <b>Controladora identificada</b>: Terra Barth Serviços Administrativos Ltda, CNPJ 51.590.996/0001-73, passou a figurar como controladora dos dados pessoais em todos os documentos legais.<br>' +
      '• <b>WhatsApp adicionado</b>: canal WhatsApp incluído na lista de notificações (seção 2b da Política de Privacidade).<br>' +
      '• <b>Base legal explícita</b>: cada finalidade de uso de dados agora declara consentimento (LGPD, art. 7, I) como base legal.<br>' +
      '• <b>Encarregado DPO</b>: nova seção 6 nomeia a Terra Barth como Encarregada de Proteção de Dados.<br>' +
      '• <b>Transferência internacional</b>: seção 5 agora informa explicitamente que Firebase (Google LLC) e Stripe, Inc. operam fora do Brasil, com consentimento do usuário (LGPD, art. 33).<br>' +
      '• <b>Banner beta atualizado</b>: texto revisado para refletir fase beta (dados são reais, mudanças comunicadas previamente).<br>' +
      '• Última atualização dos documentos: 14 de Maio de 2026.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.07);">' +
      '<div style="font-weight:800; color:#f59e0b; font-size:1rem; margin-bottom:8px;">🔧 v1.6.2-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(14 de Maio, 2026)</span></div>' +
      '<p><b>Correções de bugs Sentry.</b><br>' +
      '• <b>Visualização compacta de torneios (iOS)</b>: variável <code>hasDraw</code> calculada por item — corrigia <em>ReferenceError: Can\'t find variable hasDraw</em> no Safari iOS ao usar o modo lista compacto do dashboard (12 ocorrências, Sentry #SCOREPLACE-WEB-11).<br>' +
      '• <b>Boot no iOS Safari</b>: <code>setupLoginModal</code> e <code>setupProfileModal</code> agora tentam novamente após 1 s antes de registrar aviso no Sentry — iOS Safari ocasionalmente entrega scripts com atraso sob pressão de memória (Sentry #SCOREPLACE-WEB-Z e #SCOREPLACE-WEB-Y).<br>' +
      '• <b>Editar torneio (mobile)</b>: <code>openEditTournamentModal</code> reinicia o modal defensivamente se o elemento <code>#create-modal-title</code> não existir no DOM — evitava crash silencioso ao clicar em Editar quando o script de criação não havia terminado de inicializar (Sentry #SCOREPLACE-WEB-12).<br>' +
      'Alterações em <code>dashboard.js</code>, <code>main.js</code>, <code>create-tournament.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #2dd4bf;border-radius:12px;padding:14px 16px;background:rgba(20,184,166,0.07);">' +
      '<div style="font-weight:800; color:#2dd4bf; font-size:1rem; margin-bottom:8px;">🧑‍⚖️ v1.6.1-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(14 de Maio, 2026)</span></div>' +
      '<p><b>Árbitros nos torneios.</b><br>' +
      '• Perfil: toggle 🧑‍⚖️ ao lado da habilidade de cada modalidade. Quando ativo, você aparece como árbitro disponível para torneios daquela modalidade próximos à sua localização preferida.<br>' +
      '• Ferramentas do organizador: novo botão <b>🧑‍⚖️ Árbitros</b> — aparece somente em torneios com opção de lançamento por árbitro ativada no formulário de criação.<br>' +
      '• Página <code>#arbitros/&lt;tId&gt;</code> com 3 seções coloridas: <span style="color:#2dd4bf;">✅ Confirmados</span> (teal), <span style="color:#fbbf24;">⏳ Convidados</span> (amber) e <span style="color:#a5b4fc;">🔍 Disponíveis</span> (indigo) — filtra por modalidade do torneio e proximidade de local.<br>' +
      '• Árbitros disponíveis: usuários com toggle de árbitro ativo na modalidade do torneio, filtrados por ≤ 100 km dos seus locais preferidos em relação ao local do torneio.<br>' +
      '• Novo campo <code>refereeSports[]</code> no perfil para query Firestore eficiente.<br>' +
      'Alterações em <code>auth.js</code>, <code>tournaments.js</code>, <code>router.js</code>. Novo arquivo: <code>arbitros.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #a78bfa;border-radius:12px;padding:14px 16px;background:rgba(167,139,250,0.08);">' +
      '<div style="font-weight:800; color:#a78bfa; font-size:1rem; margin-bottom:8px;">🏆 v1.6.0-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(14 de Maio, 2026)</span></div>' +
      '<p><b>Popup de conquista para todos os tiers de troféu.</b><br>' +
      '• Todos os troféus e conquistas agora mostram o popup animado ao serem desbloqueados — bronze 🥉, prata 🥈, ouro 🥇 e platina ✨ recebem a mesma celebração visual.<br>' +
      '• Antes: bronze e prata exibiam apenas toast discreto. Agora o overlay rico aparece para qualquer conquista em tempo real.<br>' +
      '• Bootstrap silencioso mantido: troféus retroativos ao login não disparam popup — apenas um toast resumido ao final.<br>' +
      '• Estilos de glow bronze (cobre) e prata adicionados ao overlay.<br>' +
      'Alterações em <code>trophies.js</code>, <code>trophies.css</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #a78bfa;border-radius:12px;padding:14px 16px;background:rgba(167,139,250,0.08);">' +
      '<div style="font-weight:800; color:#a78bfa; font-size:1rem; margin-bottom:8px;">🏆 v1.5.9-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(14 de Maio, 2026)</span></div>' +
      '<p><b>Check diário automático de troféus + comparação de troféus com amigos.</b><br>' +
      '• Troféus agora são concedidos automaticamente todo dia às 02:00 BRT sem precisar abrir o app — o servidor verifica as conquistas e envia push notification (FCM) para quem desbloqueou algo novo.<br>' +
      '• Novo troféu <b>social_10_amigos</b>: ganho ao ter 10 amigos no app.<br>' +
      '• Troféus de categoria completa (cat_perfil, cat_casual, cat_torneio, cat_presença, cat_social, cat_especial) agora são verificados automaticamente também.<br>' +
      '• Campo <b>_trophyIds</b> gravado no doc do usuário a cada backfill — permite leitura eficiente para comparações entre amigos.<br>' +
      '• Nova seção <b>"Comparar com Amigos"</b> na página de Troféus: mostra lado a lado os troféus que só você tem, que ambos têm em comum, e que só o amigo tem — como um radar de missões a cumprir.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f87171;border-radius:12px;padding:14px 16px;background:rgba(248,113,113,0.08);">' +
      '<div style="font-weight:800; color:#f87171; font-size:1rem; margin-bottom:8px;">🛡️ v1.5.2-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(13 de Maio, 2026)</span></div>' +
      '<p><b>Antifraude nas conquistas + botão Conquistas no dashboard.</b><br>' +
      '• Sistema antifraude em 3 camadas (client, engine, backfill): partida casual precisa ter 2 UIDs distintos e não-bot, duração mínima de 3 min, e no máximo 5 partidas por dia contam para as conquistas.<br>' +
      '• Torneios só contam para troféus se tiverem ≥ 4 participantes e status "finished".<br>' +
      '• Engine agora consulta tanto <code>hostUid</code> quanto <code>guestUid</code> com dedup por docId — partidas onde o usuário foi convidado também eram ignoradas antes.<br>' +
      '• Cloud Function <code>backfillAllUserTrophies</code> atualizada com as mesmas regras antifraude.<br>' +
      '• Dashboard: botão "🏆 Conquistas" reposicionado acima de "📊 Estatísticas" no cabeçalho do hero; removido da Row 2.<br>' +
      'Alterações em <code>trophy-catalog.js</code>, <code>trophies.js</code>, <code>dashboard.js</code>, <code>functions/index.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f87171;border-radius:12px;padding:14px 16px;background:rgba(248,113,113,0.08);">' +
      '<div style="font-weight:800; color:#f87171; font-size:1rem; margin-bottom:8px;">⚙️ v1.5.1-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(13 de Maio, 2026)</span></div>' +
      '<p><b>Backfill retroativo de troféus.</b><br>' +
      '• Cloud Function <code>backfillAllUserTrophies</code>: varre todos os usuários cadastrados e concede troféus e milestones baseados no histórico real (partidas casuais, torneios, presenças, perfil) sem precisar que cada usuário faça login.<br>' +
      '• Painel de administração visível só para o owner no dashboard — botão "🏆 Backfill Troféus" dispara o cálculo retroativo com status em tempo real.<br>' +
      '• Belt+suspenders: <code>_trophyCheckPersistentSession()</code> chamado após carregamento do perfil em sessões persistentes.<br>' +
      'Alterações em <code>functions/index.js</code>, <code>dashboard.js</code>, <code>store.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #a78bfa;border-radius:12px;padding:14px 16px;background:rgba(167,139,250,0.08);">' +
      '<div style="font-weight:800; color:#a78bfa; font-size:1rem; margin-bottom:8px;">🏆 v1.5.0-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(13 de Maio, 2026)</span></div>' +
      '<p><b>Sistema de Troféus e Conquistas.</b><br>' +
      '• Nova página <code>#trofeus</code> com troféus no estilo PS/Xbox/Steam: ganhos, bloqueados, barra de XP, ranking de amigos e milestones.<br>' +
      '• ~40 troféus fixos em 6 categorias (perfil, partidas casuais, torneios, presença, social, especiais) + raridade dinâmica calculada sobre % da base que já ganhou cada troféu.<br>' +
      '• 9 linhas de milestone com progressão aritmética (incremento constante): partidas casuais, vitórias casuais, inscrições, vitórias em torneios, torneios criados, vitórias em matches, check-ins, venues únicos e amigos.<br>' +
      '• Sistema de XP: bronze=10, prata=25, ouro=60, platina=150. Nível = XP÷100+1. Rank: Bronze→Prata→Ouro→Platina→Diamante.<br>' +
      '• Overlay rico animado para conquistas ouro/platina; toast discreto para bronze/prata.<br>' +
      '• Ranking de amigos por 3 métricas (partidas/check-ins/torneios).<br>' +
      '• Engine não-bloqueante: todos os checks via <code>setTimeout(0)</code> para nunca atrasar o UX principal.<br>' +
      '• Hooks inseridos em 8 pontos: login, perfil salvo, inscrição em torneio, torneio criado, torneio encerrado, resultado de match, amigo adicionado, check-in e plano de presença.<br>' +
      'Novos arquivos: <code>trophy-catalog.js</code>, <code>trophies.js</code>, <code>trophies-view.js</code>, <code>trophies.css</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.4.23-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(13 de Maio, 2026)</span></div>' +
      '<p><b>Fix: crash no fim de partida casual no iOS (race condition winTeam).</b><br>' +
      '• Causa raiz: <code>state.isFinished</code> era <code>true</code> mas <code>state.winner</code> ainda estava <code>undefined</code> — race condition no iOS Safari entre o tick de render e a escrita do vencedor. O bloco de renderização do resultado entrava sem <code>winTeam</code> válido, gerando <code>undefined is not an object (evaluating \'winT.holdServed\')</code>.<br>' +
      '• Fix: guard <code>if (state.isFinished && state.winner)</code> — quando <code>winner</code> não está setado ainda, o bloco de resultado é pulado e a tela continua em modo "em andamento" até o estado estabilizar.<br>' +
      'Alteração em <code>bracket-ui.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.4.22-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(12 de Maio, 2026)</span></div>' +
      '<p><b>Fix: ícones de gênero desalinhados nos botões de categoria.</b><br>' +
      '• Causa raiz: <code>_applyGenderCatUI()</code> usa <code>btn.style.cssText = onStyle/offStyle</code> para aplicar o estilo ativo/inativo — isso sobrescreve <em>todo</em> o inline style do botão, apagando o <code>display:inline-flex;align-items:center;gap</code> adicionado no HTML.<br>' +
      '• Fix: <code>display:inline-flex;align-items:center;gap:5px;</code> adicionado ao início de <code>onStyle</code> e <code>offStyle</code> em <code>_applyGenderCatUI</code>. Agora toda atualização de estado (toggle, load, reset) preserva o alinhamento flex e o espaço entre ícone e texto "Misto".<br>' +
      'Alteração em <code>create-tournament.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.4.20-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(12 de Maio, 2026)</span></div>' +
      '<p><b>Fix: botão "Salvar" não fazia nada ao ser clicado em #novo-torneio.</b><br>' +
      '• Causa raiz: <code>_renderCreateTournamentHeader()</code> usa <code>host.innerHTML = …</code> para criar o botão. Toda chamada a <code>innerHTML</code> destrói o elemento anterior e cria um novo — o listener registrado na inicialização ficava no elemento antigo (destruído). O novo botão nascia sem listener e sem <code>onclick</code>.<br>' +
      '• Fix: handler de salvar exposto como <code>window._saveTournamentClickHandler</code>. <code>_renderCreateTournamentHeader()</code> agora re-anexa via <code>addEventListener</code> toda vez que recria o botão via innerHTML.<br>' +
      'Alteração em <code>create-tournament.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.4.19-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(12 de Maio, 2026)</span></div>' +
      '<p><b>Fix: "Detalhes Avançados" voltava para a dashboard após navegar #novo-torneio várias vezes.</b><br>' +
      '• Causa raiz: o handler do botão chamava <code>_updateCategoryPreview()</code> e <code>_onFormatoChange()</code> antes de <code>_navigateToCreateTournament()</code>. Na 2ª visita em diante, o formulário já tinha sido destruído por <code>viewContainer.innerHTML = \'\'</code> na saída de #novo-torneio. Ambas as funções tentavam <code>document.getElementById(…).value</code> em elementos null → TypeError → handler abortava antes de navegar.<br>' +
      '• Fix duplo (belt+suspenders): (1) <code>_updateCategoryPreview</code> e <code>_onFormatoChange</code> ganharam null-guards no acesso aos elementos; (2) o call site em <code>main.js</code> também verifica se o formulário está no DOM antes de chamar cada função.<br>' +
      'Alterações em <code>create-tournament.js</code> e <code>main.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.4.18-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(12 de Maio, 2026)</span></div>' +
      '<p><b>Botão "Salvar" nunca mais cortado no cabeçalho de criar/editar torneio.</b><br>' +
      '• Causa raiz encontrada via Chrome MCP: <code>responsive.css</code> tem a regra <code>.view-container .btn-primary { width: 100% }</code> em <code>@media (max-width:767px)</code>. Isso forçava o botão "Salvar" (classe <code>btn-primary</code>) a 195px — largura total do container de ações — estourando a linha.<br>' +
      '• Fix: <code>create-tournament-header-style</code> agora inclui <code>#create-tournament-header-host .btn-primary, .btn-secondary { width: auto !important }</code>, que anula a regra de full-width especificamente no contexto do cabeçalho.<br>' +
      '• O bloco de injeção de estilo agora remove e recria a tag a cada navegação para #novo-torneio, evitando que uma versão cacheada do CSS fique presa no DOM.<br>' +
      'Alteração em <code>create-tournament.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.4.17-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(12 de Maio, 2026)</span></div>' +
      '<p><b>Dois bugs corrigidos em #novo-torneio:</b><br>' +
      '• <b>Abria e fechava no primeiro clique:</b> o handler do botão "Detalhes Avançados" usava <code>_t()</code> sem defini-la localmente — o ReferenceError abortava a execução antes de chamar <code>_navigateToCreateTournament()</code>. Adicionado <code>var _t = window._t || …</code> no início do handler.<br>' +
      '• <b>Botões cortados em mobile:</b> o cabeçalho era construído na inicialização num browser desktop, então <code>window.innerWidth ≤ 600</code> retornava false e o ajuste mobile nunca era aplicado. Substituído por CSS <code>@media (max-width:600px)</code> — funciona independente de quando/onde o header é renderizado.<br>' +
      'Alterações em <code>main.js</code> e <code>create-tournament.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.4.16-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(12 de Maio, 2026)</span></div>' +
      '<p><b>Cabeçalho de criar/editar torneio: Salvar agora nunca é cortado em nenhum celular.</b><br>' +
      '• Em telas estreitas (≤600px) o botão "← Voltar" mostra apenas a seta, escondendo o texto — libera ~65px garantidos.<br>' +
      '• 💾 e ⭐ continuam icon-only em mobile; "Descartar" e "Salvar" sempre com texto completo, sem ícone-prefixo.<br>' +
      '• Todos os 4 botões de ação + seta Voltar na mesma linha em qualquer telefone.<br>' +
      'Alterações em <code>store.js</code> (wrapper <code>.back-btn-label</code>) e <code>create-tournament.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.4.15-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(12 de Maio, 2026)</span></div>' +
      '<p><b>Cabeçalho de criar/editar torneio: todos os botões em uma linha, Salvar nunca cortado.</b><br>' +
      '• 💾 e ⭐ ficam icon-only em mobile (detectado no momento do render via <code>window.innerWidth</code>).<br>' +
      '• "Descartar" e "Salvar" mostram só o texto, sem ícone-prefixo, ocupando apenas o espaço necessário.<br>' +
      '• Padding do cabeçalho aplicado via <code>style.setProperty(…, \'important\')</code> — garante override independente de especificidade CSS.<br>' +
      'Alteração em <code>create-tournament.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.4.13-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(12 de Maio, 2026)</span></div>' +
      '<p><b>Fix definitivo: criar torneio não fecha mais ao primeiro clique.</b><br>' +
      '• A v1.4.11 bloqueava o soft-refresh (Firestore → re-render) mas o <em>primeiro</em> snapshot do Firestore — que chega 0,5–2s após o login — chamava <code>initRouter()</code> diretamente, fora do caminho protegido.<br>' +
      '• Agora o primeiro snapshot também ignora o re-render quando o usuário já está em <code>#novo-torneio</code>.<br>' +
      '• Os dados dos torneios são carregados normalmente em memória; só o re-render desnecessário da tela é suprimido.<br>' +
      'Alteração em <code>store.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.4.12-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(12 de Maio, 2026)</span></div>' +
      '<p><b>Botões Descartar e Salvar sempre com texto no cabeçalho de criar torneio.</b><br>' +
      '• Os botões ✕ Descartar e ✓ Salvar agora mostram sempre o texto, independente do tamanho da tela.<br>' +
      '• Apenas 💾 Carregar e ⭐ Salvar Template ficam como ícone em telas ≤ 600px.<br>' +
      '• Padding lateral do cabeçalho reduzido em mobile para que os 4 botões caibam sem corte.<br>' +
      'Alteração em <code>create-tournament.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.4.11-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(12 de Maio, 2026)</span></div>' +
      '<p><b>Fix: criar/editar torneio não fecha mais sozinho ao abrir.</b><br>' +
      '• A tela <code>#novo-torneio</code> fechava imediatamente após abrir ou ficava piscando, especialmente no primeiro clique.<br>' +
      '• Causa: o listener do Firestore disparava um "soft refresh" que limpava o DOM da tela antes dela carregar por completo.<br>' +
      '• Corrigido bloqueando o soft refresh enquanto o usuário está em <code>#novo-torneio</code> — a tela só sai quando o usuário navega intencionalmente via Voltar ou Salvar.<br>' +
      'Alteração em <code>store.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.4.10-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(12 de Maio, 2026)</span></div>' +
      '<p><b>Cabeçalho de criar/editar torneio cabe em qualquer mobile.</b><br>' +
      '• Em telas ≤ 600px, todos os 4 botões do cabeçalho ficam só com ícone: 💾 · ⭐ · ✕ · ✓ — textos "Carregar", "Salvar Template", "Descartar" e "Salvar" somem para liberar espaço.<br>' +
      '• Correção anterior (v1.4.9) já ocultava os dois primeiros; esta versão completa com Descartar e Salvar.<br>' +
      'Alteração em <code>create-tournament.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.4.9-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(12 de Maio, 2026)</span></div>' +
      '<p><b>Botões do cabeçalho de criar/editar torneio mostram só ícone em telas estreitas.</b><br>' +
      '• Em mobile, os botões "Carregar" e "Salvar Template" exibem apenas o ícone (💾 ⭐), liberando espaço para "Descartar" e "Salvar" aparecerem completos sem corte.<br>' +
      'Correção em <code>create-tournament.js</code>: seletor CSS estava preso ao wrapper do modal antigo e não aplicava na page-route <code>#novo-torneio</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.4.8-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(12 de Maio, 2026)</span></div>' +
      '<p><b>Aviso prominente quando o nome no perfil é um número de telefone.</b><br>' +
      '• Usuários cujo nome de exibição é um número de telefone (ex: <code>+5511999998888</code>) passam a ver um aviso em destaque vermelho no dashboard pedindo para cadastrar um nome real.<br>' +
      '• O aviso mostra exatamente como o número aparece para outros jogadores nos torneios e rankings.<br>' +
      '• Não pode ser dispensado — persiste até o usuário salvar um nome amigável no perfil.<br>' +
      'Alteração em <code>dashboard.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.4.7-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(12 de Maio, 2026)</span></div>' +
      '<p><b>Telefones normalizados para formato E.164 (+5511...) em todo o sistema.</b><br>' +
      '• Todos os telefones do banco foram migrados para o formato <code>+55XXXXXXXXXXX</code>, eliminando a inconsistência entre perfis com e sem DDI.<br>' +
      '• Conta duplicada detectada (mesmo celular, entradas distintas via SMS e Google) foi mesclada automaticamente — mantido o perfil com mais dados.<br>' +
      '• Novos helpers <code>_normalizePhoneE164</code> e <code>_phoneLocalDigits</code> garantem que todo telefone gravado ou exibido daqui em diante siga o mesmo formato.<br>' +
      '• Login via SMS, edição de perfil e exibição de telefones em cards e fichas atualizados para usar o novo padrão.<br>' +
      'Alterações em <code>store.js</code> e <code>auth.js</code>; migração de dados via REST API.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.4.6-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(12 de Maio, 2026)</span></div>' +
      '<p><b>Nomes genéricos substituídos por e-mail ou telefone nos cards e fichas de perfil.</b><br>' +
      '• Usuários que entraram via link mágico ou SMS e cujo nome era genérico ("usuário", "user", etc.) passam a aparecer com seu e-mail ou número de celular em todos os cards, fichas de perfil e estatísticas.<br>' +
      '• Ao fazer login via magic link ou SMS, o e-mail/telefone agora é salvo como nome de exibição inicial no Firestore até o usuário preencher o perfil manualmente.<br>' +
      '• Cards e fichas do Explorar usam o novo helper <code>_friendlyDisplayName()</code> — e-mail e telefone não são mais particionados em pedaços (ex: "rodrigo@gmail.com" aparece completo, não "rodrigo" / "com").<br>' +
      'Alterações em <code>store.js</code>, <code>auth.js</code> e <code>explore.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.4.5-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(12 de Maio, 2026)</span></div>' +
      '<p><b>Análise de inscritos — habilidade e faixa etária separados por gênero.</b><br>' +
      '• Seções "Por Habilidade" e "Por Idade" do relatório de inscrição agora mostram cada categoria desdobrada por gênero (♀ Fem, ♂ Masc, ⚥ Misto) em linhas independentes.<br>' +
      '• Facilita decidir formatos misto com cortes por habilidade ou idade sem misturar os sexos na leitura.<br>' +
      'Alteração em <code>tournaments-enrollment-report.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.4.4-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(12 de Maio, 2026)</span></div>' +
      '<p><b>Perfil de amigo — botão Voltar no topo + tipo de partida no badge.</b><br>' +
      '• Botão "← Voltar" aparece agora no topo da ficha do perfil, antes do nome/avatar, no padrão consistente do app.<br>' +
      '• Badge das seções Confrontos e Parcerias mostra 🏆 N (torneios) · ⚡ N (casuais) em vez de "N partidas" genérico.<br>' +
      'Alteração em <code>explore.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.4.3-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(12 de Maio, 2026)</span></div>' +
      '<p><b>Perfil de amigo — polimento das stats.</b><br>' +
      '• Botão ✕ removido do card (o Voltar no topo já fecha).<br>' +
      '• Amigo à esquerda (vermelho) · Você à direita (verde) — convenção V/D padrão do app.<br>' +
      '• Nomes aparecem apenas na primeira barra de Confrontos, sem repetir em Pontos/Games/Sets.<br>' +
      '• Box "Partidas Casuais" removido (a info já consta no badge da seção).<br>' +
      '• Contador de partidas no badge com fonte maior e mais visível.<br>' +
      'Alteração em <code>explore.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.4.2-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(12 de Maio, 2026)</span></div>' +
      '<p><b>Perfil de amigo — estatísticas com visual consistente (Confrontos e Parcerias).</b><br>' +
      '• Confrontos e Parcerias usam agora o mesmo padrão visual das outras estatísticas do app: seções com borda colorida, barras divergentes do centro, percentual em destaque com absoluto entre parênteses.<br>' +
      '• Animação de barras e contadores ativada por scroll (mesmo sistema de <code>data-stat-bar</code> / <code>data-stat-count</code> usado no placar casual e nas stats do dashboard).<br>' +
      '• Casuais e torneios em comum exibidos como caixas de stat em grid, não como texto corrido.<br>' +
      'Alteração em <code>explore.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.4.1-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(12 de Maio, 2026)</span></div>' +
      '<p><b>Perfil de amigo — barras de comparação com percentuais e orientação correta de parcerias.</b><br>' +
      '• Todos os valores nas barras de comparação agora exibem <b>XX% (N)</b>: percentual em destaque (grande/bold) e número absoluto menor entre parênteses.<br>' +
      '• 🤝 Parcerias: Derrotas à esquerda (vermelho) · Vitórias à direita (verde) — orientação corrigida e coerente com a lógica V/D.<br>' +
      '• Label da barra de parcerias: "Derrotas · Vitórias como dupla" deixa explícita a direção de leitura.<br>' +
      'Alteração em <code>explore.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.4.0-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(12 de Maio, 2026)</span></div>' +
      '<p><b>Perfil de amigo — alinhamentos visuais corrigidos.</b><br>' +
      '• Nome alinhado ao topo do avatar (não mais centralizado verticalmente).<br>' +
      '• Ícone de gênero (♀️ / ♂️) alinhado verticalmente com o texto na mesma linha.<br>' +
      '• Ícone de cada modalidade verticalmente centralizado em relação ao nome da modalidade.<br>' +
      '• Ícone 🗓️ em "Membro desde" alinhado com o texto.<br>' +
      'Alteração em <code>explore.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.99-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(12 de Maio, 2026)</span></div>' +
      '<p><b>Perfil de amigo — layout horizontal + ícones por modalidade.</b><br>' +
      '• Foto/avatar agora ao lado esquerdo do nome, aproveitando melhor o espaço — sem desperdício de área centralizada.<br>' +
      '• Linha 2: gênero · cidade · aniversário em sequência horizontal abaixo do nome.<br>' +
      '• "Membro desde..." em linha separada, menor e discreto.<br>' +
      '• Cada modalidade exibe o ícone específico do app antes do nome (🟠 Beach Tennis, 🟡 Pickleball, 🏓 Tênis de Mesa, 🎾 Tênis, etc.) em vez de um único 🎾 para todas.<br>' +
      'Alteração em <code>explore.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.98-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(12 de Maio, 2026)</span></div>' +
      '<p><b>Nível de habilidade geral removido — skill agora é exclusivamente por modalidade.</b><br>' +
      '• O campo "Nível X" (nível geral de habilidade) foi removido de todas as telas: perfil de amigo, perfil próprio e salvamento no banco de dados.<br>' +
      '• Habilidade agora vive somente em <b>Habilidade por modalidade</b> (ex: Beach Tennis FUN, Tênis B) — configurável no próprio perfil.<br>' +
      '• Usuários com nível geral gravado anteriormente continuam sendo migrados automaticamente: na primeira edição do perfil o nível antigo é aplicado como padrão para cada modalidade preferida cadastrada.<br>' +
      '• Novos saves não escrevem mais o campo <code>defaultCategory</code> no Firestore.<br>' +
      'Alterações em <code>explore.js</code>, <code>auth.js</code> e <code>store.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.97-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(12 de Maio, 2026)</span></div>' +
      '<p><b>Perfil de amigo — comparação estatística com barras visuais (igual ao fim de partida casual).</b><br>' +
      '• ⚔️ Confrontos diretos agora apresentados com barras duplas lado a lado: Vitórias, Pontos, Games e Sets — você em azul (esquerda), amigo em âmbar (direita), proporcional ao total.<br>' +
      '• 🤝 Parcerias com barra Vitórias × Derrotas em verde vs vermelho.<br>' +
      '• Mesmo layout visual da tela de estatísticas exibida ao final de cada partida casual.<br>' +
      'Alteração em <code>js/views/explore.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.96-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(12 de Maio, 2026)</span></div>' +
      '<p><b>Perfil de amigo — estatísticas carregadas do histórico real (torneios + partidas casuais).</b><br>' +
      '• As estatísticas agora lêem o histórico de partidas gravado no Firestore (<code>matchHistory</code> subcoleção) em vez do cache em memória — cobrem todos os torneios em que os dois participaram, independente de quem organizou, mais todas as partidas casuais finalizadas.<br>' +
      '• O sheet abre imediatamente e o histórico carrega em paralelo (indicador "⏳ Carregando histórico..." enquanto busca).<br>' +
      '• Seção mostra: ⚔️ Confrontos diretos com placar (V × D), 🤝 Parcerias com vitórias/derrotas, ⚡ Partidas casuais juntos, 🏆 Torneios em comum com nomes.<br>' +
      '• Quando não há histórico compartilhado: "Ainda não jogaram partidas juntos".<br>' +
      'Alteração em <code>js/views/explore.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.95-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(12 de Maio, 2026)</span></div>' +
      '<p><b>Perfil de amigo — aniversário sem ano + estatísticas de confrontos e parcerias.</b><br>' +
      '• Idade removida de todos os perfis. Exibe apenas aniversário no formato dd/mm (ex: 🎂 12/05) — sem revelar o ano.<br>' +
      '• Seção "Estatísticas entre vocês" exclusiva para amigos: mostra confrontos diretos com placar de vitórias (ex: ⚔️ 2 × 1), parcerias com vitórias/derrotas (ex: 🤝 4V · 1D) e torneios em comum com nomes destacados.<br>' +
      '• Cálculo feito sobre todos os torneios carregados no app — inclui todos os formatos (eliminatórias, Liga, Suíço, Grupos, Rei/Rainha, duplas).<br>' +
      'Alteração em <code>js/views/explore.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.94-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(12 de Maio, 2026)</span></div>' +
      '<p><b>Perfil de amigo no Explorar — layout rico com todas as informações disponíveis.</b><br>' +
      '• Antes o sheet mostrava só foto, nome e botão "Desfazer amizade" quando cidade/esportes estavam vazios.<br>' +
      '• Agora exibe: cidade + estado, gênero, idade (calculada de birthDate), nível padrão (defaultCategory), "Membro desde Mês/Ano" e pills de modalidade com nível por esporte.<br>' +
      '• Torneios em comum mostram contagem + nomes (até 3) em destaque âmbar.<br>' +
      '• Quando o perfil está realmente vazio: mensagem discreta "Perfil ainda não preenchido".<br>' +
      'Alteração em <code>js/views/explore.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.93-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(12 de Maio, 2026)</span></div>' +
      '<p><b>Convites enviados — data do envio no painel de detalhe.</b><br>' +
      '• Ao clicar num card de convite pendente, o painel agora mostra "📅 Enviado em DD/MM/AAAA" dentro da pílula amarela de status.<br>' +
      '• A data é gravada automaticamente no perfil do usuário (campo <code>friendRequestsSentAt</code>) sempre que um convite é enviado ou reenviado. Convites enviados antes desta versão exibem só "Convite enviado — aguardando resposta" sem data (campo ausente).<br>' +
      'Alteração em <code>js/views/explore.js</code> e <code>js/firebase-db.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.92-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(12 de Maio, 2026)</span></div>' +
      '<p><b>Explorar Comunidade — clique no card abre perfil em bottom sheet.</b><br>' +
      '• Todos os cards de pessoas na tela Explorar são agora clicáveis.<br>' +
      '• <b>Amigos:</b> abre perfil completo com avatar, nome, cidade, modalidades com nível de habilidade por esporte (<code>skillBySport</code>), quantidade de torneios em comum e botão para desfazer amizade.<br>' +
      '• <b>Convites enviados pendentes:</b> abre painel de detalhe com perfil do convidado + pílula "Convite enviado — aguardando resposta" + botões Reenviar convite e Cancelar convite.<br>' +
      '• <b>Outros usuários:</b> abre perfil completo (igual amigos) com botão Convidar para amizade.<br>' +
      '• Bottom sheet desliza de baixo para cima com animação suave; fechar tocando no fundo ou no ✕.<br>' +
      'Alteração em <code>js/views/explore.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.91-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(11 de Maio, 2026)</span></div>' +
      '<p><b>Partida casual — nomes preservados ao desparear e reparear jogadores.</b><br>' +
      '• Bug corrigido: ao simular uma partida casual, clicar no elo das correntes para desparear e tentar arrastar um jogador para novo parceiro, os nomes digitados (jogador 2, 3, 4) sumiam e voltavam a "Jogador 2/3/4".<br>' +
      '• Causa: ao iniciar a partida, o overlay de setup era removido do DOM sem salvar os nomes. Quando o usuário voltava à tela de organização, <code>_renderSetup()</code> não encontrava os nomes nem no DOM nem no cache <code>_savedPlayerNames</code>.<br>' +
      '• Fix: os nomes são salvos em <code>_savedPlayerNames</code> imediatamente antes de remover o overlay, usando o array <code>players</code> que já foi construído por <code>_buildPlayers()</code>.<br>' +
      'Alteração em <code>js/views/bracket-ui.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.90-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(11 de Maio, 2026)</span></div>' +
      '<p><b>Liga — grupo no WhatsApp criado automaticamente a cada sorteio.</b><br>' +
      '• Sempre que uma rodada da Liga é sorteada (sorteio manual, sorteio automático agendado ou 1ª rodada via "Sortear"), o app cria automaticamente um grupo no WhatsApp para cada partida da rodada.<br>' +
      '• O grupo inclui os dois jogadores (ou duplas) sorteados para jogar juntos nessa rodada.<br>' +
      '• Uma mensagem é enviada ao grupo informando: nome do torneio, número da rodada, partida, prazo para lançar o resultado e a data/hora do próximo sorteio agendado.<br>' +
      '• Requisito: os jogadores precisam ter o número de WhatsApp cadastrado no perfil. Partidas sem pelo menos 2 números cadastrados são silenciosamente ignoradas.<br>' +
      '• Nova Cloud Function <code>notifyLeagueRoundWhatsApp</code> + hooks em <code>bracket-logic.js</code> e <code>tournaments-draw.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.89-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(11 de Maio, 2026)</span></div>' +
      '<p><b>WhatsApp magic link — dispara em paralelo com o SMS (independente de rate-limit).</b><br>' +
      '• Antes, o link do WhatsApp era enviado dentro do <code>.then()</code> do <code>signInWithPhoneNumber</code>. Se o SMS falhava por "muitas tentativas" (rate-limit do Firebase), o <code>.then()</code> nunca disparava e o WhatsApp também não era enviado.<br>' +
      '• Agora o WhatsApp dispara imediatamente após o reCAPTCHA validar, em paralelo com o SMS — antes de saber se o SMS vai ter sucesso ou não. Se o SMS falhar mas o WA funcionar, a mensagem de erro muda para "Muitas tentativas de SMS. Mas o link de acesso já foi enviado pelo WhatsApp — clique nele para entrar."<br>' +
      'Alteração em <code>js/views/auth.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.88-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(11 de Maio, 2026)</span></div>' +
      '<p><b>WhatsApp magic link — fix login no Chrome + "Abrir no Safari" no iPhone.</b><br>' +
      '• <b>Bug corrigido:</b> ao clicar no link do WhatsApp, a tela ficava presa em "Validando seu link de acesso seguro" para sempre. Causa: <code>showStatus()</code> substitui todo o <code>document.body.innerHTML</code>, apagando o <code>#view-container</code>. Após o <code>signInWithCustomToken</code> ter sucesso, o router tentava renderizar o dashboard num container que não existia mais. Fix: em vez de <code>history.replaceState</code>, agora faz <code>window.location.replace(\'/#dashboard\')</code> — reload completo com auth já persistido no IndexedDB. A tela mostra "✅ Você entrou! Carregando o app..." antes do reload.<br>' +
      '• <b>iOS + Chrome/não-Safari:</b> detectamos quando o link abriu num browser que não é Safari no iPhone. Mostramos uma tela "Abrir no Safari" com botão que usa o scheme <code>x-safari-https://</code> (abre diretamente no Safari). Se o usuário preferir continuar no Chrome, um link "Continuar no Chrome mesmo assim" dispara o login normalmente.<br>' +
      'Alteração em <code>js/views/auth.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.87-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(11 de Maio, 2026)</span></div>' +
      '<p><b>WhatsApp magic link — funciona para novos usuários também.</b><br>' +
      '• Antes, a Cloud Function retornava <code>user-not-found</code> e desistia se o número não tivesse conta no Firebase Auth ainda — o link só chegava pra quem já tinha feito login por SMS antes.<br>' +
      '• Agora, se não existe conta: cria automaticamente o Firebase Auth user com o número de telefone, gera o custom token e envia o WhatsApp. Quem clica entra direto, independente de ser o primeiro acesso.<br>' +
      '• Seguro: o reCAPTCHA do Firebase já validou o número antes da função ser chamada; o link vai pro WhatsApp do dono do número.<br>' +
      'Alteração em <code>functions/index.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.86-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(11 de Maio, 2026)</span></div>' +
      '<p><b>WhatsApp magic link — fix real: fetch() direto em vez de httpsCallable.</b><br>' +
      '• A causa do WhatsApp nunca enviar foi identificada: <code>firebase.functions().httpsCallable()</code> internamente tenta inicializar o Firebase Messaging (que busca <code>/firebase-messaging-sw.js</code> no mobile) — como esse arquivo não existe, a inicialização falha antes do HTTP request sair, e a promise é rejeitada com erro de Messaging.<br>' +
      '• Fix: substituído por <code>fetch()</code> direto ao endpoint da Cloud Function. Sem dependência do SDK, sem service worker. O teste via curl já confirmava que o endpoint responde corretamente sem token de auth.<br>' +
      '• O status WhatsApp continua visível no painel de código SMS (✅ em caso de sucesso, ℹ️ em caso de erro, silencioso para primeiro login).<br>' +
      'Alteração em <code>js/views/auth.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.85-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(11 de Maio, 2026)</span></div>' +
      '<p><b>WhatsApp magic link — status visível no UI (sem DevTools).</b><br>' +
      '• Ao enviar SMS, o painel de código agora mostra diretamente o status do link WhatsApp: <em>"⏳ Verificando WhatsApp..."</em> enquanto a Cloud Function responde, depois <em>"✅ Link enviado pelo WhatsApp também."</em> em caso de sucesso — ou o motivo do erro se algo falhar.<br>' +
      '• Primeiro login por telefone (<code>user-not-found</code>) continua silencioso — o SMS é o caminho correto nesses casos.<br>' +
      '• Isso elimina a necessidade de DevTools para diagnosticar por que o WhatsApp não estava chegando.<br>' +
      'Alteração em <code>js/views/auth.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.84-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(11 de Maio, 2026)</span></div>' +
      '<p><b>WhatsApp magic link — diagnóstico + fix de silêncio excessivo.</b><br>' +
      '• A v1.3.83 envolvia toda a chamada da Cloud Function em <code>try/catch</code> completamente silencioso — qualquer erro (de JS, de rede, de CORS) era descartado sem deixar rastro.<br>' +
      '• Agora o caminho de diagnóstico usa <code>console.log</code> visível: <em>"[WA magic link] tentando enviar para ..."</em> no console do browser confirma se o código foi executado.<br>' +
      '• Resultado da chamada também é logado (<em>"resultado: ..."</em> para sucesso ou <em>"falhou: ..."</em> para erros) — isso permite confirmar se o problema é no frontend ou no servidor.<br>' +
      'Alteração em <code>js/views/auth.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.83-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(11 de Maio, 2026)</span></div>' +
      '<p><b>Login por celular — link mágico no WhatsApp além do SMS.</b><br>' +
      '• Ao digitar o celular no login e clicar Enviar, além do SMS com o código de 6 dígitos o app agora tenta enviar um <b>link direto pelo WhatsApp</b>. Quem tiver o número cadastrado no WhatsApp recebe uma mensagem com um link de um clique — sem precisar digitar nenhum código.<br>' +
      '• O link WhatsApp expira em 1 hora e só funciona para números que já têm conta no scoreplace.app (primeiro acesso ainda usa o SMS normalmente).<br>' +
      '• Se o WhatsApp não estiver disponível ou o número não for reconhecido, o SMS funciona normalmente — os dois caminhos são independentes.<br>' +
      '• O painel de verificação agora mostra o aviso: <em>"Digite o código de 6 dígitos recebido por SMS — ou clique no link que chegou no WhatsApp para entrar direto."</em><br>' +
      'Alterações em <code>functions/index.js</code> (nova Cloud Function <code>sendWhatsAppMagicLink</code>) e <code>js/views/auth.js</code> (handler <code>?wt=TOKEN</code> + call no login por celular).</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.82-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(11 de Maio, 2026)</span></div>' +
      '<p><b>Link mágico — e-mail com melhor deliverability + botão Reenviar funcional.</b><br>' +
      '• O e-mail do link de acesso era HTML puro — filtros de spam penalizam isso. Agora inclui versão <code>text/plain</code> alternativa, que melhora o score de spam e garante que qualquer cliente de e-mail exiba algo legível.<br>' +
      '• Assunto alterado de <code>"🎾 Entrar no scoreplace.app"</code> para <code>"scoreplace.app — seu link de acesso"</code> — o padrão anterior combinava emoji + verbo "Entrar" + link único, padrão clássico de phishing que filtros de Gmail identificam e jogam no spam.<br>' +
      '• Botão <b>Reenviar</b> no painel "Link enviado!" agora chama de verdade a Cloud Function e envia um novo e-mail. Antes fazia <code>window.location.reload()</code> — recarregava a página sem reenviar nada.<br>' +
      'Alterações em <code>functions/index.js</code> (Cloud Function) e <code>js/views/auth.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.81-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(11 de Maio, 2026)</span></div>' +
      '<p><b>Hamburger — menu não fecha mais sozinho no primeiro clique.</b><br>' +
      '• Regressão da v1.3.80: ao clicar no hamburger para abrir o menu, ele abria e fechava automaticamente. Era necessário clicar uma segunda vez para mantê-lo aberto.<br>' +
      '• <b>Causa</b>: a v1.3.80 adicionou uma chamada a <code>initRouter()</code> em <code>_commitSignOut</code> para corrigir o spinner infinito de sessões expiradas. Essa chamada acontecia ~2,5 s após o carregamento, disparava <code>handleRoute()</code> que chamava <code>_closeHamburger()</code> — fechando o menu se o usuário o tivesse aberto nessa janela.<br>' +
      '• <b>Fix</b>: o <code>initRouter()</code> foi removido de <code>_commitSignOut</code>. O caso de cache stale agora é resolvido diretamente dentro do <code>router.js</code>: quando <code>_authStateResolved=true</code> e o cache ainda existe (contradição = sessão expirada), o router limpa o cache inline e renderiza a landing — sem precisar de chamada externa ao <code>initRouter()</code>.<br>' +
      'Alterações em <code>js/views/auth.js</code> e <code>js/router.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.80-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(11 de Maio, 2026)</span></div>' +
      '<p><b>Landing page — botão "Entrar" funcionando para sessões expiradas.</b><br>' +
      '• Usuários com sessão anterior expirada ficavam presos em um spinner infinito ao abrir o app, e o botão da landing page nunca aparecia.<br>' +
      '• <b>Causa</b>: o <code>authCache</code> stale no localStorage fazia o router exibir spinner na inicialização. Quando o Firebase confirmava null (2,5 s depois), a função <code>_commitSignOut</code> removia o cache mas retornava sem chamar <code>initRouter()</code> — ninguém mais renderizava a landing.<br>' +
      '• <b>Fix</b>: <code>_commitSignOut</code> agora chama <code>initRouter()</code> após limpar o cache stale, permitindo ao router renderizar a landing com o botão funcional. Guard do v0.17.92 mantido: sem chamar initRouter quando o modal de login já está aberto.<br>' +
      'Alteração em <code>js/views/auth.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.79-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(11 de Maio, 2026)</span></div>' +
      '<p><b>Sentry — ruído de permission-denied eliminado da dashboard.</b><br>' +
      '• A query de contagem de usuários registrados (pill "Usuários" na dashboard) era disparada mesmo para visitantes anônimos e bots, gerando erros <code>permission-denied</code> no Sentry.<br>' +
      '• Agora a query só é executada quando o usuário está autenticado (<code>_myUid</code> presente). Bots e visitantes sem login não acionam o Firestore.<br>' +
      '• Erros <code>permission-denied</code> nos fallbacks da query também são silenciados — eram ruído esperado de sessões não autenticadas, não bugs reais.<br>' +
      'Alteração em <code>js/views/dashboard.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.78-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(11 de Maio, 2026)</span></div>' +
      '<p><b>Login por SMS — nome de exibição usa o telefone quando não há nome cadastrado.</b><br>' +
      '• Ao entrar via SMS sem ter completado o perfil, o topbar e a saudação mostravam "usuário" em vez de qualquer identificação.<br>' +
      '• Agora a cadeia de fallback do nome de exibição é: nome do perfil → email → <b>telefone formatado</b> → "usuário". O número é exibido no formato local, ex: <code>(11) 99972-3777</code> quando o perfil já carregou; o número bruto como fallback na inicialização rápida.<br>' +
      'Alteração em <code>js/views/auth.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.77-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(11 de Maio, 2026)</span></div>' +
      '<p><b>Login por SMS — telefone salvo corretamente no perfil.</b><br>' +
      '• Ao entrar com celular, o campo Telefone do perfil mostrava o DDI no lugar do DDD (ex: "(55) 11997-2377" em vez de "(11) 99972-3777").<br>' +
      '• <b>Causa</b>: o Firebase retorna o número em formato E.164 (<code>+5511997237733</code>) que era salvo diretamente no perfil. O formatador brasileiro interpretava os dois primeiros dígitos <code>55</code> como DDD em vez do DDI.<br>' +
      '• <b>Fix</b>: antes de gravar no Firestore, o DDI é stripado do número — fica só a parte local (<code>11997237733</code>), consistente com o que o usuário digita manualmente. O DDI já fica separado no campo <code>phoneCountry</code>. A busca de cross-referência agora pesquisa ambos os formatos (antigo E.164 e novo local) para compatibilidade retroativa.<br>' +
      'Alteração em <code>js/views/auth.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.76-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(11 de Maio, 2026)</span></div>' +
      '<p><b>Login por SMS — reCAPTCHA invisível corrigido no iOS Safari.</b><br>' +
      '• <b>Causa raiz</b>: o container <code>recaptcha-container</code> ficava dentro do modal de login (<code>.modal</code> com <code>overflow:hidden</code>), clippando o iframe do reCAPTCHA no iOS Safari e causando falha silenciosa sem código de erro.<br>' +
      '• <b>Fix 1 — container no body</b>: nova função <code>_ensureRecaptchaInBody()</code> move o container para <code>document.body</code> antes de qualquer operação de reCAPTCHA — fora de qualquer overlay com <code>overflow:hidden</code>. Posicionado em <code>position:fixed; bottom:0; right:0</code> (fora da tela mas no layout, não <code>display:none</code>).<br>' +
      '• <b>Fix 2 — render() explícito</b>: <code>verifier.render()</code> é chamado antes de <code>signInWithPhoneNumber()</code>. No iOS Safari, o render tardio (dentro do Firebase SDK) falha porque o iOS exige que a interação com o reCAPTCHA seja iniciada dentro da janela de gesto do usuário. O <code>render()</code> antecipado ancora o widget no contexto do clique.<br>' +
      'Alteração em <code>js/views/auth.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.75-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(11 de Maio, 2026)</span></div>' +
      '<p><b>Login SMS — diagnóstico real no erro "código: unknown".</b><br>' +
      '• Quando o Firebase Phone Auth falha sem retornar um código padrão (<code>auth/xxx</code>) — como ocorre em falhas de reCAPTCHA no iOS Safari — a mensagem de erro real do Firebase agora aparece no toast, facilitando o diagnóstico.<br>' +
      '• <code>auth/internal-error</code> adicionado ao handler de reCAPTCHA (mesmo tratamento de <code>auth/captcha-check-failed</code>).<br>' +
      '• O Sentry agora recebe <code>error.message</code> além de <code>error.code</code> para esses eventos.<br>' +
      'Alteração em <code>js/views/auth.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.74-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(11 de Maio, 2026)</span></div>' +
      '<p><b>Partida Casual — dois bugs corrigidos.</b><br>' +
      '• <b>Nomes resetavam ao voltar da configuração:</b> ao clicar em ⚙️ e retornar à tela de organização, os nomes digitados nos campos Jogador 2/3/4 voltavam para os genéricos. Os valores são agora salvos em snapshot (<code>_savedPlayerNames</code>) imediatamente antes da tela de configuração substituir o DOM, e restaurados ao re-renderizar o setup — tanto no modo duplas quanto no modo singles.<br>' +
      '• <b>Padrão duplas incorreto por esporte:</b> apenas Tênis e Tênis de Mesa devem iniciar em singles (duplas desativada). Todas as demais modalidades (incluindo Pickleball, Beach Tennis, Padel, Badminton, Squash, Tênis de Mesa e os esportes de praia) agora têm <code>defaultDoubles: true</code>.<br>' +
      'Alteração em <code>js/views/bracket-ui.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.73-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(10 de Maio, 2026)</span></div>' +
      '<p><b>Banner de vinculação de partida casual na dashboard.</b><br>' +
      '• Quando o organizador de uma partida casual sugere que um nome genérico é você (ex: "Kelly" → Kelly Barth), agora aparece um <b>banner âmbar em destaque diretamente na dashboard</b> com os botões ✅ Sim, era eu / ❌ Não, era outra pessoa — não mais apenas no ícone 🔔 de notificações que muitos usuários não abrem.<br>' +
      '• O banner desaparece imediatamente após a resposta e continua mostrando enquanto houver solicitações pendentes.<br>' +
      '• Os botões reutilizam o mesmo handler <code>_confirmCasualLinkRequest</code> da tela de notificações (única fonte de verdade).<br>' +
      'Alteração em <code>js/views/dashboard.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.72-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(10 de Maio, 2026)</span></div>' +
      '<p><b>Correções de estabilidade — 3 erros do Sentry resolvidos.</b><br>' +
      '• <b>Crash nas estatísticas de partida</b> (<code>winT.holdServed</code>): <code>winT</code>/<code>losT</code> agora default para <code>{}</code> quando <code>state.winner</code> é indefinido — todas as propriedades têm guards <code>&gt; 0</code> e produzem 0 em vez de crash.<br>' +
      '• <b>Sentry noise: <code>loadMyActive</code> permission-denied</b>: erros <code>permission-denied</code> do Firestore (sessão expirada ou bot não autenticado) não são mais enviados ao Sentry — caminho esperado e inofensivo.<br>' +
      '• <b>Compartilhar torneio — <code>NotAllowedError</code> unhandled</b>: o fallback de clipboard dentro do <code>navigator.share().catch()</code> agora tem seu próprio <code>.catch()</code> com fallback <code>execCommand</code> — sem rejeições sem tratamento.<br>' +
      'Alterações em <code>js/views/bracket-ui.js</code>, <code>js/presence-db.js</code>, <code>js/views/tournaments-sharing.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.71-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Maio, 2026)</span></div>' +
      '<p><b>Placar ao vivo portrait — números de Games e de Set ainda maiores.</b><br>' +
      '• <b>Games:</b> <code>clamp(2.6rem,8vw,4rem)</code> → <code>clamp(4rem,14vw,7rem)</code> — quase o dobro.<br>' +
      '• <b>Placar do Set (placas brancas):</b> <code>clamp(5.5rem,24vw,12rem)</code> → <code>clamp(7rem,30vw,15rem)</code> — números maiores e mais fáceis de ler de longe.<br>' +
      '• Dash separador e padding interno do box de Games também ajustados proporcionalmente.<br>' +
      'Alteração em <code>js/views/bracket-ui.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.70-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Maio, 2026)</span></div>' +
      '<p><b>Placar ao vivo portrait — números de Games maiores + espaço melhor aproveitado.</b><br>' +
      '• Os números do placar de Games cresceram de <code>clamp(1.6rem,5vw,2.5rem)</code> para <code>clamp(2.6rem,8vw,4rem)</code> — ficam bem maiores e visíveis de longe.<br>' +
      '• O espaço que sobrava abaixo dos botões ▼ foi eliminado: um espaçador <code>flex:1</code> foi inserido entre o box de Games e as colunas de placar, empurrando as colunas (nomes + placas + botões) para o fundo da tela enquanto o box de Games usa o espaço liberado no topo.<br>' +
      '• O "Games" label também foi levemente aumentado (<code>0.55rem → 0.7rem</code>) e o padding interno do box ficou mais generoso.<br>' +
      'Alteração em <code>js/views/bracket-ui.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.69-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Maio, 2026)</span></div>' +
      '<p><b>Partida Casual duplas — 🔗 na tela de estatísticas retorna ao setup com os mesmos jogadores despareados.</b><br>' +
      '• Clicar no 🔗 fecha a tela de estatísticas e abre a tela de organização da partida com os <b>mesmos 4 jogadores já no lobby, sem duplas definidas</b> — prontos para reparear por arrastar ou sortear.<br>' +
      '• <b>Sem dialog de confirmação</b> — a partida já foi encerrada e salva, não há nada a confirmar.<br>' +
      '• Funciona tanto para partida recém-encerrada quanto para histórico (abrindo partida passada via "Últimas Partidas"): usa <code>_casualPlayers</code> (lista de jogadores da partida) como fonte de verdade para repopular o lobby, evitando usar o estado antigo do setup.<br>' +
      'Alteração em <code>js/views/bracket-ui.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.68-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Maio, 2026)</span></div>' +
      '<p><b>Placar ao vivo — ícone SVG circular para o botão Desfazer + placar de Games centralizado.</b><br>' +
      '• O botão ↶ foi substituído pelo ícone circular branco (seta circular no estilo replay/undo).<br>' +
      '• O box de Games fica perfeitamente centralizado na tela — o ícone aparece à direita dele, fora do box, usando um espaçador simétrico invisível à esquerda para garantir o alinhamento central.<br>' +
      '• Layout: <code>[ flex:1 spacer ] [ games box ] [ flex:1 com botão-ícone ]</code> — funciona tanto em portrait quanto em landscape.<br>' +
      'Alteração em <code>js/views/bracket-ui.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.67-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Maio, 2026)</span></div>' +
      '<p><b>Placar ao vivo — botão ↶ movido para fora do box de Games.</b><br>' +
      '• O botão ↶ (desfazer último ponto) agora aparece <b>ao lado</b> do box de Games — em linha com ele, fora do box — tanto em portrait quanto em landscape. Antes estava dentro do box, abaixo do placar.<br>' +
      '• Layout: <code>display:flex; align-items:center; gap:8px</code> envolve o games-box + o botão ↶ juntos.<br>' +
      'Alteração em <code>js/views/bracket-ui.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.66-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Maio, 2026)</span></div>' +
      '<p><b>Placar ao vivo — botão ↶ Desfazer + destaque laranja no 40-40.</b><br>' +
      '• <b>↶ Desfazer:</b> botão aparece dentro do box de Games (ao lado do placar de games), em portrait e landscape. Cada toque desfaz o último ponto registrado — funciona inclusive após fechar um game (o undo restaura o estado exato antes do ponto que fechou o game).<br>' +
      '• <b>Killing point (40-40):</b> quando o placar chega em 40 igual (deuce), os dois painéis de ponto mudam o fundo para laranja <code>#f97316</code> e o número "40" fica branco — destaque visual para indicar que o próximo ponto é decisivo.<br>' +
      '• A detecção de deuce usa <code>currentGameP1 >= 3 &amp;&amp; currentGameP2 >= 3 &amp;&amp; iguais</code> — não dispara em vantagem (AD) nem em tie-break.<br>' +
      'Alteração em <code>js/views/bracket-ui.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.65-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Maio, 2026)</span></div>' +
      '<p><b>Partida Casual dupla — 🔗 entre os parceiros dentro de cada seção.</b><br>' +
      '• <b>Sem seção extra:</b> o elo 🔗 aparece diretamente entre os dois chips de jogadores nas seções "Vencedor" e "Perdedor" — exatamente onde os nomes dos parceiros já estavam. Sem repetição de nomes, sem seção separada.<br>' +
      '• <b>Tocar no 🔗</b> abre o fluxo de desparear (<code>_liveScoreUnpair</code>) — volta à tela de formação para reparear ou sortear.<br>' +
      'Alteração em <code>js/views/bracket-ui.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.63-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Maio, 2026)</span></div>' +
      '<p><b>Partida Casual — histórico e estatísticas ignoram partidas abandonadas.</b><br>' +
      '• <b>"Últimas Partidas":</b> só aparecem partidas com vencedor definido (time 1 ou time 2). Partidas encerradas sem vencedor (force-finish com placar empatado ou sem conclusão real) são excluídas dos cards.<br>' +
      '• <b>Estatísticas:</b> registros sem vencedor definitivo (<code>winnerTeam === 0</code>) não são contabilizados em vitórias, derrotas, sets, games, pontos, saque, recepção, etc. Não são persistidos em Firestore nem no cache local.<br>' +
      '• Alteração em três pontos: <code>_casualLoadLastMatches</code> (filtro no histórico), <code>_buildAndPersistMatchRecord</code> (não persiste), <code>_aggregate</code> (não conta).<br>' +
      'Arquivos alterados: <code>js/views/bracket-ui.js</code>, <code>js/views/tournaments-analytics.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.62-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Maio, 2026)</span></div>' +
      '<p><b>Partida Casual — histórico abre estatísticas (não novo jogo) + botão Desparear visual consistente.</b><br>' +
      '• <b>Regressão corrigida — histórico:</b> clicar em um card das "Últimas Partidas" agora abre as estatísticas da partida encerrada, idêntico ao que aparece quando a partida termina em tempo real. Antes, o clique abria um novo jogo diretamente com os mesmos jogadores.<br>' +
      '• <b>Solução técnica:</b> matches carregados por <code>_casualLoadLastMatches</code> são armazenados em <code>window._casualPastMatchesCache</code>; <code>_casualOpenPastMatch</code> usa esse cache e chama <code>_openLiveScoring</code> com <code>opts.initialLiveState</code> — o estado do jogo encerrado é aplicado sincronicamente antes do primeiro render, sem flash de tela em branco.<br>' +
      '• <b>Regressão corrigida — botão Desparear:</b> a tela de estatísticas de partida dupla não exibe mais o botão texto âmbar "↔ Desparear". O elo 🔗 com borda pontilhada (introduzido na v1.3.60-beta) já cumpre essa função no lugar correto e com o estilo visual consistente com a tela de configuração.<br>' +
      'Alteração em <code>js/views/bracket-ui.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.61-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Maio, 2026)</span></div>' +
      '<p><b>Partida Casual — nomes no histórico sempre visíveis.</b><br>' +
      '• <b>Regressão corrigida:</b> a v1.3.59 suprimia nomes genéricos ("Jogador 2", "Jogador 3", etc.) nos cards do histórico, exibindo "—" no lugar. O comportamento correto é mostrar todos os nomes salvos na partida, mesmo os genéricos.<br>' +
      '• Removida a lógica de supressão de <code>_pname</code>: qualquer nome salvo no doc da partida é exibido normalmente.<br>' +
      'Alteração em <code>js/views/bracket-ui.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.60-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Maio, 2026)</span></div>' +
      '<p><b>Partida Casual — 🔗 consistente nas duas telas de formação e resultado.</b><br>' +
      '• <b>Botão 🔗 como pill dashed-border:</b> a tela de resultado agora exibe o ícone de desparear com o mesmo estilo da tela de configuração — pill independente com borda pontilhada, fundo transparente e hover vermelho — em vez de integrado dentro do chip do jogador.<br>' +
      '• <b>Posição:</b> centralizado entre a seção "Vencedor" e a seção "Perdedor", espelhando o posicionamento do botão entre os dois times na tela de configuração.<br>' +
      '• <b>Chips de jogador mais limpos:</b> o chip volta a ser apenas toque-para-estatísticas (avatar + nome + ícone 📊), sem o 🔗 acoplado dentro.<br>' +
      '• <b>Header "Últimas Partidas":</b> label agora é fixo independente da quantidade de partidas carregadas (era dinâmico "Últimas N partida(s)" — bug de regressão).<br>' +
      'Alteração em <code>js/views/bracket-ui.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.59-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Maio, 2026)</span></div>' +
      '<p><b>Partida Casual — histórico não exibe mais nomes genéricos de slot vazio.</b><br>' +
      '• Slots não preenchidos por jogadores reais ("Parceiro", "Adversário 1/2", "Jogador N") eram salvos com esses nomes genéricos no Firestore e apareciam no histórico de partidas.<br>' +
      '• Fix: <code>_pname</code> retorna <code>null</code> quando o slot não tem uid E o nome é um dos nomes-padrão. <code>_teamBlock</code> filtra os nulls e exibe "—" quando nenhum nome real resta no time.<br>' +
      '• Resultado: partidas solo mostram só o nome real do criador (ex: "Rodrigo") sem os placeholders.<br>' +
      'Alteração em <code>js/views/bracket-ui.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.58-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Maio, 2026)</span></div>' +
      '<p><b>Partida Casual — atualização automática devolve o criador à tela de configuração.</b><br>' +
      '• <b>Problema corrigido:</b> quando o SW detectava uma nova versão e recarregava a página enquanto o criador estava na tela de configuração da partida, ele era redirecionado para o lobby de espera (tela de convidados) — onde não podia fazer nada além de fechar e começar uma nova partida.<br>' +
      '• <b>Fix:</b> <code>_renderCasualJoin</code> agora detecta que o usuário é o criador quando <code>status=\'waiting\'</code>. Nesse caso chama <code>_openCasualMatch(restoreOpts)</code> em vez de renderizar o lobby — reutilizando o <code>roomCode</code> e <code>docId</code> já existentes no Firestore, sem criar documento duplicado.<br>' +
      '• Esporte, modo duplas e lista de participantes que já estavam na partida são restaurados automaticamente.<br>' +
      'Alteração em <code>js/views/bracket-ui.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.57-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Maio, 2026)</span></div>' +
      '<p><b>Partida Casual — ícone 🔗 por jogador na tela de resultado.</b><br>' +
      '• Cada chip de jogador na tela de resultado (vencedor e perdedor) agora tem um botão 🔗 à direita do nome.<br>' +
      '• Toque/clique no 🔗 chama o mesmo fluxo de "Desparear" — salva o resultado e volta para a tela de formação de times para reparear livremente.<br>' +
      '• Toque no avatar/nome continua abrindo as estatísticas detalhadas do jogador.<br>' +
      'Alteração em <code>js/views/bracket-ui.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.56-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Maio, 2026)</span></div>' +
      '<p><b>Partida Casual — histórico não some mais ao clicar "Jogar" nas stats de partida passada.</b><br>' +
      '• <b>Bug raiz:</b> ao abrir uma partida do histórico (viewOnly), o overlay ficava com <code>_casualDocId</code> apontando para o doc já finalizado. Ao clicar "🔄 Jogar" e sair sem pontuar, <code>_closeLiveScoring</code> chamava <code>cancelCasualMatch(_casualDocId)</code> — deletando o doc original do histórico.<br>' +
      '• <b>Fix:</b> novo flag <code>_viewOnly</code> capturado na closure. Quando "Jogar" é clicado a partir de viewOnly, <code>_casualDocId</code> e <code>_casualRoomCode</code> são zerados e o listener Firestore do doc antigo é desconectado <em>antes</em> do reset de estado — o novo jogo não tem vínculo com o doc original, que fica intocado.<br>' +
      'Alteração em <code>js/views/bracket-ui.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.55-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(9 de Maio, 2026)</span></div>' +
      '<p><b>Partida Casual — últimas partidas: header à esquerda, nomes empilhados, filtro por modalidade.</b><br>' +
      '• <b>Header alinhado à esquerda:</b> "Últimas N partida(s)" deixou de ser centralizado.<br>' +
      '• <b>Nomes empilhados por time:</b> cada jogador aparece em sua própria linha dentro do bloco do time, em vez de separados por "/". Parceiro do time 1 fica abaixo do jogador 1; idem para o time 2.<br>' +
      '• <b>Filtro por modalidade:</b> apenas as últimas 3 partidas da modalidade atualmente selecionada na tela de configuração (⚙️) aparecem — outras modalidades são ignoradas. Carrega 15 partidas do servidor e filtra localmente.<br>' +
      'Alteração em <code>js/views/bracket-ui.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.54-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(8 de Maio, 2026)</span></div>' +
      '<p><b>Partida Casual — últimas partidas: grid 3 colunas, nomes reais, sem badge de vencedor.</b><br>' +
      '• <b>Grid fixo 3 colunas:</b> <code>grid-template-columns:repeat(3,1fr)</code> — cards sempre em 1/3 da largura, independente de quantos existem.<br>' +
      '• <b>Nomes reais (multicamada):</b> (1) uid match → usa <code>cu.displayName</code> fresco; (2) match criado pelo usuário (campo <code>createdBy</code>) → fallback pra <code>cu.displayName</code> mesmo em docs antigos sem uid salvo; (3) <code>p.displayName</code> → nome salvo; (4) <code>p.name</code> como último recurso.<br>' +
      '• <b>displayName salvo na criação:</b> partidas novas salvam <code>displayName</code> no objeto player — garante resolução correta em futuras sessões.<br>' +
      '• <b>Sem badge de vencedor:</b> linha de troféu/vencedor removida; resultado visível pelas cores das linhas (verde = vencedor).<br>' +
      'Alteração em <code>js/views/bracket-ui.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.45-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(8 de Maio, 2026)</span></div>' +
      '<p><b>Partida Casual — arrastar para formar times agora funciona sempre.</b><br>' +
      '• <b>Bug corrigido:</b> o drag-and-drop nos cards de jogadores só era ativado quando o toggle "Sortear" estava desligado. Como o toggle começa ligado por padrão, os event listeners nunca eram registrados — os cards tinham <code>cursor:grab</code> mas não reagiam ao arraste.<br>' +
      '• <b>Fix:</b> <code>_setupDragDrop()</code> agora é chamado sempre que a tela de duplas é renderizada, independente do estado do toggle. Arrastar dois jogadores juntos forma o time e automaticamente desliga o Sortear (comportamento já existente em <code>_formTeam</code>).</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.44-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(8 de Maio, 2026)</span></div>' +
      '<p><b>Partida Casual — botão Voltar do criador encerra a partida para todos.</b> Três correções no fluxo de encerramento do lobby pelo organizador:<br>' +
      '• <b>Voltar agora fecha e cancela:</b> o botão Voltar do criador foi migrado de inline JS para callback registrado, eliminando falha silenciosa em iOS Safari onde o handler não disparava.<br>' +
      '• <b>Encerramento propagado aos convidados:</b> ao clicar Voltar o documento Firestore é deletado; o polling dos convidados (<code>_startLobbyRefresh</code>) detecta o doc ausente em até 3 s e os evacuaciona automaticamente para o dashboard com toast "Partida cancelada".<br>' +
      '• <b>Fallback de corrida (race):</b> se o Voltar for clicado antes de <code>_sessionDocId</code> ser preenchido (save em flight), o lookup por <code>roomCode</code> garante que o documento é encontrado e deletado assim mesmo.<br>' +
      '• <b>Cancelamento externo:</b> se outro dispositivo cancelar a partida, o polling do criador também detecta e o expulsa ao dashboard.<br>' +
      '• <b>Feedback visual:</b> toast "Partida encerrada" + navegação de volta ao dashboard após o fechamento.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">⚡ v1.3.43-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(8 de Maio, 2026)</span></div>' +
      '<p><b>Partida Casual — drag-and-drop corrigido em duplas.</b> Dois bugs no lobby de duplas foram corrigidos:<br>' +
      '• <b>Nome com URL da foto:</b> o nome de um jogador cadastrado podia aparecer corrompido (URL da foto do Google inserida no meio do nome) durante re-renders do lobby. Agora o nome sempre vem da fonte canônica (dados do perfil), nunca do DOM.<br>' +
      '• <b>Arrastar ativava edição de nome:</b> ao arrastar um card no mobile, o toque inicial focava o campo de nome do jogador, abrindo o teclado. Jogadores cadastrados (com login) não podem ter o nome editado — seus campos agora são <code>readonly</code> + <code>pointer-events:none</code>. Além disso, o evento <code>touchstart</code> passou a usar <code>{passive:false}</code> + <code>preventDefault()</code> para impedir o foco do browser antes do gesto de drag começar.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #4ade80;border-radius:12px;padding:14px 16px;background:rgba(74,222,128,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">📖 v1.3.42-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(8 de Maio, 2026)</span></div>' +
      '<p><b>Manual e dicas contextuais revisados linha a linha.</b> Auditoria completa do manual de ajuda e do sistema de dicas para garantir precisão com o app atual:<br>' +
      '• <b>Explorar → 👥 Pessoas:</b> todas as referências à antiga aba "Explorar" (removida do menu em v0.17.44) atualizadas — agora aparece como botão "👥 Pessoas" na segunda linha da dashboard. Seção do manual renomeada e reescrita para descrever cards horizontais, grid 2–4 colunas e todos os tipos de listas (amigos, conhecidos, outros usuários).<br>' +
      '• <b>Barra de ações da dashboard:</b> descrição atualizada para refletir as duas linhas de botões atuais (⚡ Casual · 🏆 Novo Torneio · 📍 Place | 👥 Pessoas · Convidar · Pro · Apoie).<br>' +
      '• <b>Esportes preferidos — descrição completa:</b> reescrita para cobrir TODOS os efeitos downstream: filtra feed de torneios, filtra locais no 📍 Place, pré-seleciona modalidades no check-in, e desbloqueia o <b>nível por esporte (skillBySport)</b> — você pode ser A em Beach Tennis e C em Tênis ao mesmo tempo.<br>' +
      '• <b>Data de nascimento:</b> corrigida de "exibida na aba Explorar" (incorreto desde v1.3.18) para "usada para categorias por faixa etária (40+/50+/60+/70+)".<br>' +
      '• <b>Avatar:</b> atualizado de "avatares pré-definidos" (removidos em v1.0.23) para "iniciais do nome em círculo índigo".<br>' +
      '• <b>Atalho E:</b> label mudou de "Explorar torneios" para "Ir para Pessoas".<br>' +
      '• <b>Dica explore-nav:</b> seletor corrigido de <code>a[href="#explore"]</code> (não existe mais no DOM) para <code>#btn-people</code> com texto atualizado.<br>' +
      '• <b>Dica profile-sports:</b> texto expandido para explicar filtros, check-in pré-selecionado e skillBySport.<br>' +
      'Alteração em <code>js/main.js</code>, <code>js/hints.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #25d366;border-radius:12px;padding:14px 16px;background:rgba(37,211,102,0.10);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">💬 v1.3.41-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(8 de Maio, 2026)</span></div>' +
      '<p><b>WhatsApp ON por padrão quando há celular cadastrado.</b> O toggle "💬 WhatsApp" em Canais de notificação agora inicia ligado automaticamente se o usuário já tem telefone preenchido no perfil (e nunca escolheu OFF explicitamente). Ao cadastrar um número novo no campo Celular, o toggle ativa sozinho ao digitar ≥8 dígitos — sem precisar ir manualmente até Canais de notificação. Quem quer receber: basta ter o celular cadastrado. Quem não quer: desativa o toggle manualmente e a escolha é respeitada. Alteração em <code>js/views/auth.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #25d366;border-radius:12px;padding:14px 16px;background:rgba(37,211,102,0.10);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">💬 v1.3.40-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(8 de Maio, 2026)</span></div>' +
      '<p><b>Notificações via WhatsApp ativas.</b> Integração end-to-end com WhatsApp Business via Evolution API self-hosted no Railway. O fluxo completo: eventos do app (inscrições, sorteios, resultados) enfileiram mensagens em <code>whatsapp_queue</code> no Firestore → Cloud Function <code>processWhatsAppQueue</code> processa automaticamente e entrega via Evolution API → mensagem chega no WhatsApp do usuário. Para receber: ative "💬 WhatsApp" no perfil (Canais de notificação) e certifique-se de ter o telefone preenchido. Toggle OFF por padrão — opt-in explícito. Alteração em <code>js/views/auth.js</code> (toggle no perfil), <code>js/i18n-pt.js</code>, <code>js/i18n-en.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #22d3ee;border-radius:12px;padding:14px 16px;background:rgba(34,211,238,0.10);">' +
      '<div style="font-weight:800; color:#67e8f9; font-size:1rem; margin-bottom:8px;">🛡️ v1.3.39-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Maio, 2026)</span></div>' +
      '<p><b>Fix definitivo de re-login: proteção em 3 camadas contra qualquer cenário de perda de sessão.</b> Após v1.3.38-beta remover a deleção do IndexedDB do Firebase, identificamos 3 vulnerabilidades residuais que podiam ainda forçar re-login: (1) <code>scoreplace_authCache</code> ainda estava na lista de cleanup — se o iOS zerasse o localStorage (fazendo o cleanup rodar de novo), o authCache era apagado, e o router renderizava a landing imediatamente antes do Firebase rehydratar do IndexedDB. Removido da lista de limpeza permanentemente. (2) O router renderizava a landing assim que <code>!loggedIn && !hasCache</code> sem aguardar o Firebase responder — iOS pode ter limpado o localStorage mas o Firebase ainda tem sessão no IndexedDB e responde em ~300ms. Corrigido: se Firebase ainda não respondeu (<code>window._authStateResolved === false</code>), router exibe spinner e aguarda até 3 s pelo <code>onAuthStateChanged</code>. (3) Para usuários novos (<em>nunca logaram antes</em>), o mecanismo de <code>_commitSignOut</code> tem um guard que impede chamar <code>initRouter()</code> quando não havia sessão prévia — o router ficava preso no spinner para sempre. Corrigido: novo timer de 300ms em <code>auth.js</code> que, quando Firebase confirma null, chama <code>initRouter()</code> diretamente — permitindo ao router comutar para a landing page. Todos os timers são cancelados quando Firebase resolve com usuário, evitando chamadas duplas. Resultado: usuário logado nunca mais vê a landing; usuário novo ainda vê a landing depois de ~300ms; iOS com localStorage limpo aguarda o Firebase antes de decidir o que mostrar. Alteração em <code>js/store.js</code>, <code>js/router.js</code>, <code>js/views/auth.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #22d3ee;border-radius:12px;padding:14px 16px;background:rgba(34,211,238,0.10);">' +
      '<div style="font-weight:800; color:#67e8f9; font-size:1rem; margin-bottom:8px;">🔑 v1.3.38-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Maio, 2026)</span></div>' +
      '<p><b>Fix crítico: usuário não precisava mais fazer login toda vez que abria o app.</b> Bug reportado: novos usuários (e usuários existentes após iOS limpar storage) eram sempre pedidos para logar novamente ao abrir o app, mesmo já tendo feito login antes. Causa-raiz: o bloco de "cleanup beta" em <code>store.js</code> — que rodava uma vez na transição alpha→beta para limpar caches antigos — deletava o IndexedDB do Firebase Auth (<code>firebaseLocalStorageDb</code> e similares) onde o Firebase guarda a sessão do usuário. Em iOS Safari + ITP e iOS PWA, o <code>localStorage</code> (onde fica a flag <code>scoreplace_beta_cleanup_v1</code> que marcava o cleanup como "já feito") é zerado periodicamente pelo SO (política de 7 dias sem interação, pressão de memória). Quando o localStorage era limpo, o cleanup rodava de novo na próxima visita — e agora deletava a sessão Firebase de um usuário que ESTAVA LOGADO, forçando re-login em loop. O fix remove a deleção do IndexedDB do Firebase Auth do bloco de cleanup. A deleção era necessária apenas na transição alpha→beta (2026-04-29) para que usuários passassem pelo re-login único; oito dias depois, todos os usuários existentes já passaram por esse re-login. Novos usuários não têm sessão alpha para limpar. Sem a deleção, mesmo que o cleanup rode novamente por perda do flag, o <code>onAuthStateChanged</code> ainda restaura a sessão do Firebase via IndexedDB — sem precisar de re-login. Alteração em <code>js/store.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #22d3ee;border-radius:12px;padding:14px 16px;background:rgba(34,211,238,0.10);">' +
      '<div style="font-weight:800; color:#67e8f9; font-size:1rem; margin-bottom:8px;">🛡️ v1.3.37-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(7 de Maio, 2026)</span></div>' +
      '<p><b>Fix crítico: partida casual não cai mais durante o jogo.</b> Regressão introduzida em v1.3.30 onde o dono caía da partida, o convidado ficava preso sem conseguir sair, e a tela apagava/travava o celular. Causa-raiz: <code>_softRefreshView</code> (disparado a cada ponto marcado via Firestore snapshot) não incluía <code>live-scoring-overlay</code> nem <code>casual-match-overlay</code> no check de "modal aberto" — por isso chamava <code>initRouter()</code> → <code>_dismissAllOverlays()</code> → sweep genérico removia os overlays de partida casual por serem <code>position:fixed; z-index > 101; &gt;50% viewport</code>. Resultado: ao marcar qualquer ponto, o overlay desaparecia, o dono via a tela de join do convidado, o convidado ficava num loop de re-render. <b>Fix em 2 camadas:</b> (1) <code>_softRefreshView</code> agora inclui <code>live-scoring-overlay</code> e <code>casual-match-overlay</code> no check de openModal — quando qualquer um está aberto, o refresh é adiado 500ms (mesmo comportamento dos outros modais críticos); (2) <code>_dismissAllOverlays</code> ganha <code>live-scoring-overlay</code> e <code>casual-match-overlay</code> no <code>ALWAYS_KEEP</code> permanente — esses overlays têm ciclo de vida próprio (<code>_exitLiveScoring</code>, botão Sair da partida) e nunca devem ser varridos pelo sweep genérico. Alteração em <code>js/store.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #22d3ee;border-radius:12px;padding:14px 16px;background:rgba(34,211,238,0.10);">' +
      '<div style="font-weight:800; color:#67e8f9; font-size:1rem; margin-bottom:8px;">🔍 v1.3.36-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Maio, 2026)</span></div>' +
      '<p><b>Auditoria pós-deploys recentes — fix silent fail das "Últimas 3 partidas".</b> Inbox Sentry esvaziada (3 issues: 2 já fixadas em v1.3.28 → resolved; 1 quirk do Google Maps SDK "Could not load onion" → ignored, padrão adicionado ao monitor). <b>Bug silencioso encontrado e fixado:</b> a v1.3.32 introduziu <code>loadRecentCasualMatchesForUser</code> com 2 composite queries em Firestore (<code>where(createdBy==).where(status==)</code> e <code>where(playerUids array-contains).where(status==)</code>) — mas <b>os indexes correspondentes não foram criados em <code>firestore.indexes.json</code></b>. Firestore exige composite index pra qualquer query com 2+ <code>where</code> em campos diferentes — sem o index, a query lança <code>failed-precondition</code> mas o catch swallowed retornava <code>[]</code> silenciosamente. Resultado: a seção "📊 Últimas 3 partidas" no setup da partida casual <b>nunca apareceu</b> em produção desde v1.3.32 (sempre mostrava vazio). <b>Fixes:</b> 2 indexes adicionados ao <code>firestore.indexes.json</code> + deployados via <code>firebase deploy --only firestore:indexes</code> (esse passo precisava ser feito manualmente — feito agora) + tratamento de erro em <code>loadRecentCasualMatchesForUser</code> agora detecta <code>failed-precondition</code> e dispara <code>_captureMessage</code> pro Sentry com tag clara "Missing Firestore index", evitando próximas regressões silenciosas. Lição aprendida: TODA nova query com 2+ where em campos diferentes precisa de entry em <code>firestore.indexes.json</code> + deploy. Memória <code>feedback_firestore_composite_query_pattern.md</code> já tinha alertado sobre isso e passei batido. Alteração em <code>firestore.indexes.json</code> + <code>js/firebase-db.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #22d3ee;border-radius:12px;padding:14px 16px;background:rgba(34,211,238,0.10);">' +
      '<div style="font-weight:800; color:#67e8f9; font-size:1rem; margin-bottom:8px;">🚦 v1.3.35-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Maio, 2026)</span></div>' +
      '<p><b>"Em Andamento" só após Iniciar Torneio — antes era "Inscrições Encerradas".</b> Bug reportado: torneio com inscrições encerradas + sorteio realizado mas botão "Iniciar Torneio" ainda não clicado aparecia como "Em Andamento" no card da dashboard E no card de detalhe. Correto: deve ser "Inscrições Encerradas" até o organizador clicar em Iniciar Torneio (que seta <code>t.tournamentStarted = Date.now()</code> e <code>t.status = \'in_progress\'</code>) — só aí o tempo do torneio começa a contar. <b>Causa-raiz:</b> 4 lugares decidiam o status badge baseando-se em <code>sorteioRealizado</code> (sorteio existe) em vez de <code>tournamentStarted</code> (botão clicado). <b>Fixes:</b> (1) <code>js/views/tournaments.js</code> linha 572 — card de detalhe do torneio; (2) <code>js/views/dashboard.js</code> linha 351 — card view do dashboard; (3) <code>js/views/dashboard.js</code> linha 1432 — compact list view do dashboard, que ainda por cima conflava <code>finished</code> com <code>closed</code> (também corrigido); (4) <code>_classifyDiscoveryTournament</code> em dashboard — feed de descoberta de torneios públicos. Liga ganha tratamento especial: como não tem botão "Iniciar Torneio" (rodadas começam direto pós-sorteio), Liga + sorteio realizado continua classificada como <code>inProgress</code>. Estados validados via 6 cenários no preview: open, closed-sem-draw, closed+draw NOT started, started, started com legacy status, finished — todos retornam o label correto. Alteração em <code>js/views/tournaments.js</code> + <code>js/views/dashboard.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #22d3ee;border-radius:12px;padding:14px 16px;background:rgba(34,211,238,0.10);">' +
      '<div style="font-weight:800; color:#67e8f9; font-size:1rem; margin-bottom:8px;">📲 v1.3.34-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Maio, 2026)</span></div>' +
      '<p><b>Sugestão "Adicionar à tela de início" inteligente — Android nativo + iOS Safari + gating por engagement.</b> Pedido do dono: programa sugere instalar igual quando pede permissão de notificações; respeita "agora não" sem incomodar de novo (ou só pergunta de novo após várias visitas). <b>Fix em 3 camadas:</b> (1) <b>Detecção de instalação:</b> novo helper <code>window._isInstalledAsPWA()</code> verifica <code>display-mode: standalone</code> + <code>navigator.standalone</code> + <code>display-mode: minimal-ui</code>. App já instalado nunca recebe banner. (2) <b>Banner Android nativo:</b> captura <code>beforeinstallprompt</code> (Chrome/Edge/Samsung Internet) e suprime o mini-info bar automático do browser pra controlar quando mostrar. Banner próprio com botão "📲 Instalar" dispara o native install prompt do browser. Click em "Agora não" registra dismiss. Auto-some quando user instala (evento <code>appinstalled</code>). (3) <b>Gating por engagement:</b> novo helper <code>window._shouldShowInstallBanner({minSessions, maxDismissals, cooldownDays})</code>. Banner só aparece quando: (a) NÃO instalado E (b) usuário tem <b>3+ sessões</b> (cada sessão = visita com cooldown de 30min entre carrega­mentos — F5 não conta) E (c) última rejeição foi <b>há mais de 30 dias</b> E (d) não rejeitou <b>3+ vezes no total</b> (após o 3º "agora não", desiste). iOS Safari banner também migrou pra esse gating; iOS não-Safari (Chrome/Firefox) continua mostrando sempre porque é blocker — user precisa trocar de browser pra conseguir instalar. <b>Smoke test 7 cenários:</b> sessões 1-2 não mostra (insuficientes); sessão 3 mostra; pós-dismiss não mostra (cooldown); 31d após dismiss volta a mostrar; após 3 dismisses para. localStorage keys: <code>scoreplace_install_sessions</code>, <code>scoreplace_last_session_ts</code>, <code>scoreplace_install_dismissed_count</code>, <code>scoreplace_install_dismissed_at</code>, <code>scoreplace_install_completed</code>. Alteração em <code>js/main.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #22d3ee;border-radius:12px;padding:14px 16px;background:rgba(34,211,238,0.10);">' +
      '<div style="font-weight:800; color:#67e8f9; font-size:1rem; margin-bottom:8px;">🤝 v1.3.33-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Maio, 2026)</span></div>' +
      '<p><b>Vincular guest da partida casual a amigo via confirmação por notificação.</b> Pedido do dono: numa partida casual, quando você digita o nome de outro jogador (não logado), se o nome bater com algum amigo seu na plataforma, sugerir vincular. E mais — só após esse amigo CONFIRMAR via notificação que era ele/ela na partida, os dados contam nas estatísticas dele. <b>Fluxo end-to-end:</b> (1) na tela de stats da partida casual finalizada (live overlay OU revisão via "Últimas 3 partidas" / <code>#casual/{roomCode}</code>), seção "🤝 Vincular jogadores" lista cards "Esse Andre = André de tal?" com botão "Sugerir vínculo". (2) Click envia notificação <code>casual_link_request</code> pro amigo + adiciona entry em <code>match.pendingLinkRequests[]</code> pra evitar duplicatas + UI mostra "⏳ Aguardando" no card. (3) Amigo recebe na inbox: "Rodrigo diz que você jogou uma partida casual de Beach Tennis (6-4 7-6). Confirma?" com 2 botões: "✅ Sim, era eu" e "❌ Não, era outra pessoa". (4) Sim → atualiza <code>match.players[slot].uid</code> + adiciona em <code>playerUids</code>/<code>participants</code> + envia notif <code>casual_link_accepted</code> de volta + agora a partida conta nas estatísticas do amigo (filtro de <code>loadRecentCasualMatchesForUser</code> via <code>playerUids array-contains</code> já cobre). Não → envia <code>casual_link_rejected</code>, sem alteração no match. <b>Heurística de match de nome</b> em camadas: full name exato (case+acento insensitive) → first name exato → substring (≥3 chars). Up to 3 candidatos por slot. Filtra friends já logados em outros slots pra não sugerir os mesmos. <b>Cache:</b> novo <code>window._friendProfilesCache</code> (uid → {displayName, photoURL}) hidratado lazy via <code>_loadFriendProfilesCached()</code> — fetches paralelos só pra perfis ainda não cacheados. <b>Helpers globais:</b> <code>_normalizeName(s)</code>, <code>_suggestFriendsForGuestName(name, excludeUids)</code>, <code>_hydrateCasualLinkSuggestions()</code>, <code>_suggestCasualLink(slotIdx, friendUid)</code>, <code>_confirmCasualLinkRequest(notif, accept)</code>. Catálogo de notif estendido com 3 tipos: <code>casual_link_request</code> 🤝, <code>casual_link_accepted</code> ✅, <code>casual_link_rejected</code> ❌. Alteração em <code>js/views/bracket-ui.js</code>, <code>js/views/notifications-view.js</code>, <code>js/notification-catalog.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #22d3ee;border-radius:12px;padding:14px 16px;background:rgba(34,211,238,0.10);">' +
      '<div style="font-weight:800; color:#67e8f9; font-size:1rem; margin-bottom:8px;">📊 v1.3.32-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Maio, 2026)</span></div>' +
      '<p><b>Aquecimento agora vira tempo médio (em vez de excluir) + "Últimas 3 partidas" no setup da partida casual.</b> 2 pedidos do dono. <b>(1) Warmup → tempo médio:</b> antes, quando o helper detectava que o 1º intervalo era aquecimento (> 2× mediana dos demais), ele EXCLUÍA o 1º ponto inteiro do cálculo de avg/max. Agora SUBSTITUI pelo valor mediano dos demais — 1º ponto continua contado normalmente, só com duração "típica" da partida em vez da inflada pelo aquecimento. O hint na tela mudou de "não contado" pra "1º ponto contado com tempo médio". Mediana é robusta a outliers, então avgMs e maxMs não mudam significativamente — mas o pointCount fica correto. <b>(2) "Últimas 3 partidas" no setup casual:</b> nova seção logo abaixo do código de sala mostrando até 3 botões com as últimas partidas casuais finalizadas em que o usuário participou (criada por ele OU como guest via <code>playerUids array-contains</code>). Cada botão mostra ícone do esporte, data (DD/MM) e placar resumido (ex.: "6-4 7-6"). Click → navega pra <code>#casual/{roomCode}</code> que dispara <code>_renderCasualJoin</code>; como o match está finished e tem <code>liveState</code>, abre o overlay de live scoring em modo viewOnly (v1.3.30-beta) com a tela de stats completa — mesma comparativeSection (% saque, recepção, breaks, killer points, maior sequência, sets, games, pontos, momentum chart) que aparece ao final de qualquer partida. Sem histórico = seção fica oculta (zero ruído). Novo método <code>FirestoreDB.loadRecentCasualMatchesForUser(uid, limit)</code> faz 2 queries (createdBy + playerUids array-contains, ambas com status==finished), dedup por docId, sort client-side por createdAt desc, retorna top N. Alteração em <code>js/views/bracket-ui.js</code> + <code>js/firebase-db.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #22d3ee;border-radius:12px;padding:14px 16px;background:rgba(34,211,238,0.10);">' +
      '<div style="font-weight:800; color:#67e8f9; font-size:1rem; margin-bottom:8px;">🏃 v1.3.31-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(6 de Maio, 2026)</span></div>' +
      '<p><b>Estatísticas de tempo no placar ao vivo: aquecimento inicial não distorce mais "Tempo/pt" e "Mais longo".</b> Pedido do dono: se o primeiro intervalo (matchStart → 1º ponto) for muito mais longo que a média dos demais, é provavelmente tempo de aquecimento e não deve contar como ponto. <b>Heurística:</b> se o 1º intervalo for <i>maior que 2× a mediana dos demais</i> (após filtro de outliers curtos < 2s), é tratado como aquecimento e excluído de <code>avgMs</code> (Tempo/pt) e <code>maxMs</code> (Mais longo). <b>Tempo total do jogo</b> (Duração) NÃO é afetado — usa <code>matchEndTime - matchStartTime</code> direto, então o aquecimento continua contando lá. <b>Edge cases protegidos:</b> precisa de 3+ intervalos no total (com 2+ no "rest" após filtro de curtos) pra disparar a heurística — torneio com só 2 pontos não cai em falso positivo. Quando o aquecimento É detectado, hint discreto aparece embaixo do bloco "⏱ Tempo": "🏃 Aquecimento de Xs não contado em Tempo/pt e Mais longo". Helper canônico <code>window._computeMatchTimeStats(intervals)</code> compartilhado entre o render do live overlay (que usuário vê na tela) e o snapshot persistido em Firestore (alimenta o modal "Estatísticas Detalhadas" do hero box) — mesma matemática nos dois lugares. Validado via 6 unit tests em preview cobrindo: warmup óbvio, sem warmup, warmup 1.5× (não dispara), warmup 2.1× (dispara), só 2 intervalos (proteção), tap-correção curto (filtro de curtos preservado). Alteração em <code>js/views/bracket-ui.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #22d3ee;border-radius:12px;padding:14px 16px;background:rgba(34,211,238,0.10);">' +
      '<div style="font-weight:800; color:#67e8f9; font-size:1rem; margin-bottom:8px;">📊 v1.3.30-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(5 de Maio, 2026)</span></div>' +
      '<p><b>Estatísticas detalhadas no fim de partida casual — todos os participantes veem.</b> Bug reportado: amigo participante de partida casual não viu estatísticas ao final do jogo. Causa: quando o host marcava o jogo como <code>finished</code>, o snapshot listener REDIRECIONAVA os guests pra <code>_renderCasualJoin</code> (uma "result screen" simples com placar + vencedor) — mas SEM as estatísticas comparativas detalhadas (% saque, % recepção, breaks, killer points, maior sequência, maior vantagem, sets, games etc) que o overlay de live scoring renderiza automaticamente quando <code>state.isFinished=true</code>. <b>Fix:</b> snapshot listener agora aplica o <code>liveState</code> final (com <code>isFinished=true</code>) DIRETO no overlay de live scoring e re-renderiza, levando à tela de stats. Usuário fecha manualmente quando quiser. Notificação leve "🏆 Partida encerrada — Confira as estatísticas abaixo" sinaliza pro guest que jogo acabou. <b>Bonus:</b> <code>_renderCasualJoin</code> (rota <code>#casual/{roomCode}</code>) também atualizado — quando alguém revisita a sala via deep-link após o fim, agora abre o overlay com stats em vez do result screen reduzido. Fallback pra result screen simples preservado caso <code>liveState</code> não esteja persistido (edge case de cancel-after-finish). Alteração em <code>js/views/bracket-ui.js</code> (snapshot handler + <code>_renderCasualJoin</code> finished branch).</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #22d3ee;border-radius:12px;padding:14px 16px;background:rgba(34,211,238,0.10);">' +
      '<div style="font-weight:800; color:#67e8f9; font-size:1rem; margin-bottom:8px;">🛡️ v1.3.29-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(5 de Maio, 2026)</span></div>' +
      '<p><b>Hotfix bundle: perfil scrolla, Save destacado, Wake Lock no iPhone, drag não atrapalha mais o placar.</b> 4 bugs reportados pelo dono. <b>(1) Perfil não scrolava + Save visualmente errado:</b> <code>window.renderProfilePage</code> e <code>_closeProfilePage</code> estavam definidas DENTRO de <code>simulateLoginSuccess</code> em <code>auth.js</code> — só existiam após login bem-sucedido. Usuário com auth cache que landed em <code>#profile</code> via deep-link caía em "função undefined" e router não renderizava. Movidas pra escopo top-level (definição duplicada idempotente preservada dentro de <code>simulateLoginSuccess</code> pra compat). Save button reescrito com background sólido verde (<code>#10b981</code>) + border-radius 10px + padding 8×16 + font-weight 700 + ícone 💾 + box-shadow âmbar — antes era btn-primary apagado em alguns temas. Adicionado <code>padding-bottom: max(40px, env(safe-area-inset-bottom))</code> em <code>#view-container > .modal</code> pro último botão não ficar atrás da safe-area do iPhone. <code>-webkit-overflow-scrolling: touch</code> em html/body pra momentum scroll suave no iOS. <b>(2) Wake Lock no iPhone do adversário não bloqueia mais a tela:</b> camada 2 NoSleep-style adicionada — <code>&lt;video muted playsinline loop&gt;</code> com data URI MP4 de 1 frame (~1KB), que mantém iOS WebKit considerando "tela em uso" mesmo sem suporte ao Wake Lock API. Camada 1 (Wake Lock nativa) e camada 3 (re-request no <code>visibilitychange</code>) preservadas. Ambas rodam em paralelo — qualquer uma evita o bloqueio. <b>(3) Drag-to-swap-sides não atrapalha mais a marcação de pontos:</b> handlers <code>dragstart</code>/<code>touchstart</code> em <code>.court-side</code> agora bailam se o evento veio de BUTTON, INPUT, SELECT, TEXTAREA, A ou elemento com <code>data-no-swap-drag</code>. Tap em botão de placar ainda registra ponto; arrastar área neutra ainda troca lados — preserva ambas funcionalidades sem conflito. <b>(4) Cache-busters bumpados em peso novamente</b> em todos os arquivos críticos (main, store, ui, dashboard, auth, router, create-tournament, venues, tournaments, bracket, bracket-ui, components.css) pra forçar fresh fetch + alinhar SW cache. Alteração em <code>js/views/auth.js</code>, <code>js/views/bracket-ui.js</code>, <code>css/components.css</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #22d3ee;border-radius:12px;padding:14px 16px;background:rgba(34,211,238,0.10);">' +
      '<div style="font-weight:800; color:#67e8f9; font-size:1rem; margin-bottom:8px;">🚨 v1.3.28-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(5 de Maio, 2026)</span></div>' +
      '<p><b>Hotfix: defensive guards contra erros em cascata + scroll do menu hamburger.</b> 2 erros novos no Sentry hoje (release 1.3.27-beta) afetando user real em Safari Mac: <code>setupCreateTournamentModal undefined</code> em <code>main.js:1609</code> + <code>window._toggleHamburger is not a function</code> no <code>onclick</code> da topbar. Causa-raiz: quando algum script <code>defer</code> não termina de parsear (race com SW cache invalidation OU file ainda em flight), <code>main.js</code> rodava chamadas top-level <code>setupCreateTournamentModal()</code> sem typeof check — qualquer falha aí ABORTAVA o resto do <code>main.js</code>, deixando <code>openModal</code>/<code>_toggleHamburger</code>/etc. sem definir → landing CTA, hamburger menu, login não funcionavam silenciosamente. <b>Fixes:</b> (1) <code>setupUI()</code>, <code>setupCreateTournamentModal()</code>, <code>setupLoginModal()</code>, <code>setupProfileModal()</code> em main.js agora envoltos em <code>typeof === \'function\'</code> + <code>try/catch</code>; quando falha, log em <code>console.warn</code> + <code>_captureMessage</code> pro Sentry, mas o boot continua; (2) onclick do hamburger button em <code>index.html</code> linha 133 ganhou guard <code>typeof window._toggleHamburger === \'function\'</code> (já existia em outros lugares, esse passou despercebido); (3) <b>cache-busters bumpados em peso</b> em todos os arquivos críticos (main.js, store.js, ui.js, dashboard.js, auth.js, router.js, create-tournament.js, venues.js, tournaments.js, bracket.js, etc.) pra forçar fetch novo + alinhamento com o SW cache fresh. <b>Bonus — menu hamburger scrola:</b> dropdown ganhou <code>max-height: calc(100vh - 60px)</code> + <code>overflow-y: auto</code> + <code>-webkit-overflow-scrolling: touch</code>. Em mobile com muitos itens (Início, Explorar, Notif, Convidar, Pro, Apoie, Avatar, Logout, Tema, Idioma…), os últimos sumiam abaixo da tela. Bug reportado: "menu não scrola". <b>Próximas releases:</b> profile page-route scroll, Wake Lock NoSleep video fallback pra iOS Safari, desativar drag-to-swap-sides nos botões de placar do live scoring, tela de stats no fim de partida casual.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #22d3ee;border-radius:12px;padding:14px 16px;background:rgba(34,211,238,0.10);">' +
      '<div style="font-weight:800; color:#67e8f9; font-size:1rem; margin-bottom:8px;">🖨️ v1.3.27-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(5 de Maio, 2026)</span></div>' +
      '<p><b>Imprimir + Exportar CSV reescritos: documento útil em qualquer fase do torneio.</b> Bug reportado: botão Imprimir não fazia nada (chamava <code>window.print()</code> no DOM atual — em pre-iniciar a tela só tem o botão "Iniciar Torneio", então saía página em branco) e CSV vinha truncado (só matches, sem lista de inscritos). <b>Fix:</b> novo <code>window._printTournament(tId)</code> abre nova janela com HTML auto-contido em A4 retrato — header (nome, esporte, formato, datas, local, organizador), lista de Inscritos completa (#, nome, categoria, e-mail), Partidas agrupadas por rodada/fase com placares, e Classificação por categoria pra Liga/Suíço. Funciona em qualquer fase: pré-sorteio mostra só inscritos; pós-sorteio mostra inscritos + partidas; com resultado mostra tudo. Disparo via <code>window.print()</code> automático após onload (Safari/Chrome). <code>window._exportTournamentCSV</code> reestruturado em 4 blocos: <code>=== TORNEIO ===</code> (dados gerais), <code>=== INSCRITOS ===</code> (todos os participantes com categoria/gênero/habilidade/email — antes não tinha NENHUMA info de inscritos!), <code>=== PARTIDAS ===</code> e <code>=== CLASSIFICAÇÃO ===</code> (quando aplicável). Dois helpers internos compartilhados (<code>_resolveCompetitorRows</code>, <code>_resolveMatchRows</code>, <code>_resolveStandingsRows</code>) garantem que Print e CSV puxam dos mesmos extractors — qualquer melhoria em um beneficia o outro. Compat: <code>_printBracket()</code> antigo agora resolve o tournament ID via hash e delega pro novo <code>_printTournament</code>. <code>onclick</code> handlers em <code>tournaments.js</code> e <code>bracket.js</code> migrados pra <code>_printTournament(t.id)</code> direto. Validado E2E no preview com torneio mock (3 inscritos, 2 partidas, placar parcial). Alteração em <code>js/views/tournaments-sharing.js</code>, <code>js/views/tournaments.js</code>, <code>js/views/bracket.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #22d3ee;border-radius:12px;padding:14px 16px;background:rgba(34,211,238,0.10);">' +
      '<div style="font-weight:800; color:#67e8f9; font-size:1rem; margin-bottom:8px;">🎾 v1.3.26-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(5 de Maio, 2026)</span></div>' +
      '<p><b>Loaders padronizados (🎾 girando) + #place renderiza preferidos antes do Google.</b> Dois pedidos do dono. <b>(1) Padronização do loader:</b> novo helper canônico <code>window._renderBallLoader(label, opts)</code> em <code>store.js</code> que produz HTML+CSS de "🎾 Carregando…" com animação spin (rotate 360° em 1.2s) + pulse (drop-shadow âmbar pulsando) — mesma identidade visual do boot loader (<code>index.html</code>). Aplicado em: boot loader (CSS atualizado de bounce pra spin via mesma keyframe <code>scoreplace-ball-spin</code>), router cache loader (auth resolvendo), <code>tournaments-enrollment-report</code> loading, e a tela "Buscando locais próximos…" do <code>#place</code>. Variant inline <code>_renderBallLoaderInline</code> pra slots pequenos dentro de cards. <b>(2) Place sem bloquear no Google:</b> <code>refresh()</code> em <code>venues.js</code> agora pinta a tela em duas fases. Fase 1 (rápida — ~300ms): <code>VenueDB.listVenues</code> + preferred-by-placeId em paralelo → <code>state.loading=false</code> → <code>renderResults()</code>. Usuário vê "⭐ Locais preferidos" + "🏢 Outros locais no scoreplace" imediatamente. Fase 2 (background — 1-2s): "📍 Sugestões do Google" começa com mini-loader inline ("🎾 Buscando sugestões do Google…") e injeta os 16 resultados conforme a Places API responde. Auto-focus de presença ativa (<code>PresenceDB.loadMyActive</code>) e centralização do mapa também saíram do critical path — não bloqueiam mais o paint inicial. <b>Resultado:</b> preferidos aparecem ~3-5x mais rápido em conexões móveis. Google demora o mesmo, mas usuário enxerga seus locais favoritos sem espera. Alteração em <code>js/store.js</code>, <code>js/router.js</code>, <code>js/views/venues.js</code>, <code>js/views/tournaments-enrollment-report.js</code>, <code>index.html</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #22d3ee;border-radius:12px;padding:14px 16px;background:rgba(34,211,238,0.10);">' +
      '<div style="font-weight:800; color:#67e8f9; font-size:1rem; margin-bottom:8px;">🌎 v1.3.25-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(5 de Maio, 2026)</span></div>' +
      '<p><b>Explorar: cidade só aparece quando diferente da do usuário (case + acento + trim insensitive).</b> Bug reportado: cards de "Sao Paulo" / "Sao paulo" (sem acento) apareciam pra usuário de "São Paulo" (com acento) porque a comparação anterior usava só <code>toLowerCase()</code> — <code>"são paulo"</code> ≠ <code>"sao paulo"</code> mesmo sendo a mesma cidade. Novo helper <code>_normalizeCity</code> faz NFD + strip combining marks (`̀-ͯ`) + trim + lowercase, então <code>"São Paulo"</code> = <code>"Sao Paulo"</code> = <code>"SÃO PAULO  "</code> = <code>"sao paulo"</code>. Aplicado em <b>2 lugares</b>: <code>_friendCompactCardHtml</code> (cards de Meus Amigos — onde o bug foi reportado) e <code>_userCardHtml</code> (cards das seções Outros Usuários, Conhecidos, Convites Pendentes — paralelo onde a comparação não existia: sempre empurrava cidade no infoChips). Validado via node REPL: 4 variações da mesma cidade normalizam pra string única. Alteração em <code>js/views/explore.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #22d3ee;border-radius:12px;padding:14px 16px;background:rgba(34,211,238,0.10);">' +
      '<div style="font-weight:800; color:#67e8f9; font-size:1rem; margin-bottom:8px;">🔗 v1.3.24-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(4 de Maio, 2026)</span></div>' +
      '<p><b>Inscrição: nunca mais perde uid + Análise resgata inscritos órfãos via email/nome.</b> Bug reportado pelo dono: torneio com 6 de 8 inscritos aparecendo como "sem perfil vinculado" mesmo todos tendo conta scoreplace ativa. Causa-raiz em <code>tournaments-enrollment.js</code>: 4 call sites construíam <code>participantObj</code> com <code>uid: user.uid || \'\'</code> — quando <code>user.uid</code> era falsy por race de login (sessão recém-restaurada, currentUser populado parcialmente, etc.), gravava string vazia que parecia "sem uid" no relatório de Análise. Inscrição "fantasma" — existe no Firestore mas não consegue ser categorizada porque nunca vincula com perfil real. <b>Fix em duas camadas: (1) cura no read-time</b> — <code>_fetchProfiles</code> em <code>tournaments-enrollment-report.js</code> agora roda 3 camadas: direct uid fetch (caminho normal), email lookup (<code>users where email == X</code> quando participantObj tem email mas não uid), displayName lookup (último recurso, só vincula se houver exatamente 1 match no banco). Inscritos resgatados ganham badge ⚙ "resgatado via email lookup" / "resgatado via displayName lookup" no diagnóstico cru. <b>(2) prevenção no source</b> — todos os call sites de enrollment (<code>enrollCurrentUser</code>, <code>submitTeamEnroll</code>) agora têm guard hard que aborta com toast "Sessão sem identificador — faça logout e entre novamente" + Sentry capture quando <code>!user.uid</code>. <code>uid: user.uid || \'\'</code> trocado por <code>uid: user.uid</code> nos 4 lugares — sem string vazia silenciosamente mascarando o problema. Mensagem do Análise pra inscritos com uid não vinculado também mais clara: "a inscrição existe mas não conseguimos amarrar a um perfil scoreplace nem por email nem por nome — possíveis causas: (1) bug de enrollment que perdeu o uid; (2) participante adicionado manualmente sem login". Alteração em <code>js/views/tournaments-enrollment.js</code> + <code>js/views/tournaments-enrollment-report.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #22d3ee;border-radius:12px;padding:14px 16px;background:rgba(34,211,238,0.10);">' +
      '<div style="font-weight:800; color:#67e8f9; font-size:1rem; margin-bottom:8px;">🧹 v1.3.23-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(4 de Maio, 2026)</span></div>' +
      '<p><b>Sentry: registro reduzido pra códigos esperados de auth + inbox limpa.</b> Catch do <code>handleEmailRegister</code> em <code>auth.js</code> não chama mais <code>_captureException</code> pra códigos de erro que são comportamento esperado de UX (<code>auth/email-already-in-use</code>, <code>auth/invalid-email</code>, <code>auth/weak-password</code>). O usuário continua vendo a notificação amigável (i18n já existia), mas o evento não vira issue no Sentry — eram falsos positivos que poluíam o digest diário das 9h. Bugs reais (<code>network-request-failed</code> recorrente, <code>operation-not-allowed</code>, códigos desconhecidos) continuam reportados. Em paralelo, lado-de-leitura do Sentry foi totalmente diagnosticado: já existia automação completa em <code>~/bin/scoreplace-sentry-check.*</code> com cron diário 9h, token em <code>~/.scoreplace_sentry_token</code>, log em <code>~/Library/Logs/scoreplace-sentry.log</code> e CLI <code>scoreplace-sentry-investigate</code> pra deep-dive. Memória do agente atualizada em <code>memory/project_sentry_read_access.md</code> com paths e workflow corretos pra próximas sessões nunca mais esquecerem. Inbox foi de 7 issues unresolved → 0 (auto-ignored 6 por NOISE_PATTERNS + 1 transient de rede manual). Patterns adicionados: <code>auth/email-already-in-use</code>, <code>auth/wrong-password</code>, <code>auth/invalid-credential</code>, <code>auth/user-not-found</code>, IndexedDB transients (3 variantes Safari/Firestore), reCAPTCHA re-render race, Firestore offline document fetch, "Could not reach Cloud Firestore backend".</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #22d3ee;border-radius:12px;padding:14px 16px;background:rgba(34,211,238,0.10);">' +
      '<div style="font-weight:800; color:#67e8f9; font-size:1rem; margin-bottom:8px;">🕰️ v1.3.22-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(4 de Maio, 2026)</span></div>' +
      '<p><b>Análise de Inscritos: diagnóstico cru agora distingue alpha-leftover de novato beta + Sentry CLI prep.</b> No bloco "🔧 Diagnóstico" do relatório, cada inscrito com perfil carregado ganha uma linha extra mostrando <code>profile.meta: createdAt | acceptedTerms | acceptedTermsAt</code>. Quando o perfil tem <code>createdAt</code> anterior a 2026-04-29 (cutoff alpha→beta) OU <code>acceptedTerms !== true</code>, aparece a flag em âmbar 🕰️ <i>provável alpha-leftover</i>. Útil pra investigar o caso reportado: torneio com 6 de 8 inscritos com perfis incompletos pode ter origem em users alpha que foram preservados no reset de 2026-04-29 (per CLAUDE.md, só <code>tournaments/venues/presences/casualMatches/mail</code> foram apagados — <code>users</code> ficou) mas nunca atualizaram o perfil pra os campos beta-required (gender, birthDate, skillBySport). Distinguir alpha-leftover de novato beta com perfil incompleto orienta a próxima ação: alpha-leftover provavelmente está abandonado e cabe nudge ou prune; novato beta cabe pedir pra completar o perfil. Em paralelo, <b>infraestrutura de leitura do Sentry preparada</b> — <code>sentry-cli</code> instalado via brew, memória registrada em <code>memory/project_sentry_read_access.md</code>. Ainda falta o auth token pra o assistente conseguir consultar erros remotamente; passos pra o dono ativar estão na memória. Alteração em <code>js/views/tournaments-enrollment-report.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #22d3ee;border-radius:12px;padding:14px 16px;background:rgba(34,211,238,0.10);">' +
      '<div style="font-weight:800; color:#67e8f9; font-size:1rem; margin-bottom:8px;">📊 v1.3.21-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(4 de Maio, 2026)</span></div>' +
      '<p><b>Análise de Inscritos: relatório de perfis incompletos agora reporta TODOS os campos faltantes (gênero + data de nascimento + habilidade), não só os que o organizador configurou.</b> Bug reportado: torneio com 6 inscritos sem gênero, sem data de nascimento e sem habilidade mostrava "falta: gênero" para todos eles — birthDate e skill nunca apareciam na lista. Causa-raiz em <code>tournaments-enrollment-report.js</code>: o cálculo de <code>missing[]</code> gateava a verificação de birthDate em <code>t.ageCategories.length &gt; 0</code> e a de skill em <code>t.skillCategories.length &gt; 0</code>. Quando o org não tinha configurado categorias de idade/habilidade explicitamente (caso comum — categorias são derivadas automaticamente dos perfis), nada era reportado mesmo que os perfis estivessem incompletos. Fix: removida a gating — sempre flaga campo de perfil vazio, porque o relatório é "perfis incompletos" relativo ao perfil em si, não relativo à config atual do torneio. <b>Mensagem clarificada para inscritos sem perfil vinculado:</b> a label antiga "sem perfil scoreplace" sugeria que a pessoa não tem conta no app — confuso quando o organizador sabe que ela tem perfil. Causa real: ela foi adicionada manualmente (pelo botão "+Participante" do organizador) sem vincular a uma conta scoreplace, então o app não tem como buscar gênero/idade/habilidade automaticamente. Nova label: "adicionado manualmente — sem perfil vinculado". E como tudo é desconhecido nesse caso, agora não enumera "gênero, data nasc., habilidade" um por um (era ruidoso) — só mostra a mensagem única. <b>Help text reescrito em duas seções:</b> uma para inscritos com perfil mas dados faltando (peça que completem em /#dashboard → 👤 perfil), outra para os manuais (atribua manualmente em "🏷️ Categorias" ou peça que se inscrevam pelo link de convite). <b>Diagnóstico cru enriquecido:</b> agora mostra também o nome, email e flag <code>selfEnrolled</code> do participantObj — assim o org distingue "manual sem email" (a maioria dos casos) de "auto-enroll que perdeu o uid" (raro, indicaria bug). Alteração em <code>js/views/tournaments-enrollment-report.js</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #22d3ee;border-radius:12px;padding:14px 16px;background:rgba(34,211,238,0.10);">' +
      '<div style="font-weight:800; color:#67e8f9; font-size:1rem; margin-bottom:8px;">👤 v1.3.20-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(4 de Maio, 2026)</span></div>' +
      '<p><b>Cards de pessoas: nome em 2 linhas, amber nos convites, 1 card por linha nas seções com botões.</b> Primeiro e último nome aparecem em linhas separadas (ex: "Rodrigo" na 1ª linha, "Barth" na 2ª). Cards de convites enviados e recebidos usam borda e fundo amber (como está nos amigos que é verde). Apenas "Meus Amigos" mantém o grid 2/3/4 colunas — as demais seções (Convites Pendentes, Outros Usuários, Conhecidos) voltaram a ser coluna única, pra os botões Aceitar/Rejeitar/Convidar não ficarem espremidos.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #22d3ee;border-radius:12px;padding:14px 16px;background:rgba(34,211,238,0.10);">' +
      '<div style="font-weight:800; color:#67e8f9; font-size:1rem; margin-bottom:8px;">🔲 v1.3.19-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(4 de Maio, 2026)</span></div>' +
      '<p><b>Cards de pessoas em grid 2/3/4 colunas + nomes curtos.</b> Todas as seções de pessoas no Explorar (Meus Amigos, Convites Pendentes, Outros Usuários, Conhecidos) agora usam grid responsivo: 2 colunas em mobile (~390px), 3 em tablet (~500px), 4 em telas largas (~650px+). Nomes são truncados no primeiro token (antes de espaço, ponto, @, _ ou -) para caber bem nas colunas.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #22d3ee;border-radius:12px;padding:14px 16px;background:rgba(34,211,238,0.10);">' +
      '<div style="font-weight:800; color:#67e8f9; font-size:1rem; margin-bottom:8px;">🙈 v1.3.18-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(4 de Maio, 2026)</span></div>' +
      '<p><b>Idade removida dos cards de pessoas no Explorar.</b> Cards de "Outros Usuários" e "Convites Pendentes" nunca mais mostram a idade. O subtítulo agora exibe apenas cidade (quando diferente do usuário) e modalidades preferidas.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #22d3ee;border-radius:12px;padding:14px 16px;background:rgba(34,211,238,0.10);">' +
      '<div style="font-weight:800; color:#67e8f9; font-size:1rem; margin-bottom:8px;">👤 v1.3.17-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(4 de Maio, 2026)</span></div>' +
      '<p><b>Cards de pessoas no Explorar ficaram compactos e horizontais.</b> Cards de "Meus Amigos" e "Outros Usuários" eram verticais (avatar em cima, nome embaixo) — mesmos em grid de múltiplas colunas ficavam altos demais e exigiam muito scroll.</p>' +
      '<p>Novo padrão: horizontal como o card do organizador de torneio — avatar 34px à esquerda, nome bold (0.82rem) + subtítulo (cidade/esporte, 0.68rem) à direita, ✕ ou botão "Convidar" fixado no canto direito. Lista em coluna única (sem grid), gap 6px. Mais informação visível com menos scroll.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #22d3ee;border-radius:12px;padding:14px 16px;background:rgba(34,211,238,0.10);">' +
      '<div style="font-weight:800; color:#67e8f9; font-size:1rem; margin-bottom:8px;">📐 v1.3.16-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(4 de Maio, 2026)</span></div>' +
      '<p><b>Cadastrar Local: campos nunca mais saem da tela no iPhone.</b> User reportou que os inputs do formulário de cadastro de venue (<code>#my-venues</code>) extrapolavam a borda da tela em mobile — campos de contato (2 colunas) e select de acesso ficavam cortados ou exigiam scroll horizontal.</p>' +
      '<p>Causa raiz: grid de 2 colunas (<code>1fr 1fr</code>) sem <code>min-width:0</code> nos filhos — items de grid não podem encolher abaixo do tamanho intrínseco do <code>&lt;input&gt;</code>; além disso, alguns inputs não tinham <code>box-sizing:border-box</code>, então padding e borda somavam à largura de 100%.</p>' +
      '<p>Fix: bloco <code>&lt;style&gt;</code> scoped injetado junto com o formulário, aplicando <code>box-sizing:border-box</code> + <code>min-width:0</code> + <code>max-width:100%</code> em todo input/select/textarea dentro do wrapper <code>#venue-owner-form-wrap</code>. Regra gravada: <i>campos de formulário nunca podem ultrapassar a largura da tela</i>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #22d3ee;border-radius:12px;padding:14px 16px;background:rgba(34,211,238,0.10);">' +
      '<div style="font-weight:800; color:#67e8f9; font-size:1rem; margin-bottom:8px;">🎾 v1.3.15-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(4 de Maio, 2026)</span></div>' +
      '<p><b>Live scoring: ghost do drag da bola não vaza mais o markup.</b> User reportou via screenshot do iPhone que ao arrastar a bola no Beach Tennis aparecia em tela o texto literal <code>&lt;span style="filter:hue-rotate(-50deg)..."&gt;</code> atrás do cursor de drag.</p>' +
      '<p>Causa: o ghost element criado em <code>touchmove</code> usava <code>textContent = _sportBall</code>, mas pra Beach Tennis o <code>_sportBall</code> é HTML (tennis ball verde com filtro CSS pra virar laranja, definido em <code>window._BEACH_TENNIS_ICON</code>) — <code>textContent</code> rendia o markup como texto literal. Outras modalidades (🎾 puro do Tênis, 🏓, 🥒, etc.) não eram afetadas porque são emoji puro sem markup.</p>' +
      '<p>Fix: trocado <code>textContent</code> → <code>innerHTML</code> em <code>bracket-ui.js:5590</code>. Ghost agora renderiza só 🎾 com o filtro <code>hue-rotate(-50deg)</code> aplicado (bola laranja Beach Tennis), sem vazar tags como texto.</p>' +
      '<p><b>Regra cristalizada:</b> ao construir ghost element pra drag-and-drop, sempre usar <code>innerHTML</code> quando o conteúdo pode ser HTML (não só emoji). <code>textContent</code> é seguro só pra strings plain.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">🎾 v1.3.14-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Maio, 2026)</span></div>' +
      '<p><b>Live scoring: drag da bola não rouba mais o swap de quadra.</b> User: <i>"podemos arrastar a bolinha para mudar o sacador... podemos arrastar os lados da quadra... Por vezes quando tentei mudar a bolinha de lugar mudou o lado da quadra. Isso precisa funcionar melhor. se o usuário clicar na bolinha (ou perto dela), arrasta a bolinha e não o lado da quadra. para mudar o lado da quadra precisa clicar fora do card com a bolinha."</i></p>' +
      '<p>Bug raiz: o <code>touchstart</code> no span da bola não chamava <code>stopPropagation</code>, então o handler do <code>.court-side</code> (parent) também ativava — ambos sistemas competiam pelo touch. Resultado: usuário tentava arrastar a bola e às vezes o lado da quadra trocava de lugar.</p>' +
      '<p>Três fixes:</p>' +
      '<ul style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li><b>Zona de drag estendida do span do ícone pro card inteiro do jogador-sacador</b>. Marcado com <code>data-serve-ball-card</code>. Tocou em qualquer lugar do card → arrasta bola.</li>' +
        '<li><b><code>stopPropagation</code> em todos os eventos de touch da bola</b> (touchstart/touchmove/touchend). Court-side nunca mais recebe esses eventos quando o usuário começou na bola.</li>' +
        '<li><b>Threshold de 8px de movimento separa tap de drag</b>. Tap puro (sem mover) ainda dispara o click original (editar nome do jogador). Movimento ≥ 8px ativa drag de bola, cancela edição. <code>preventDefault</code> só é chamado quando virou drag de fato — preserva a UX de tap.</li>' +
      '</ul>' +
      '<p>Para arrastar o lado da quadra: tocar em qualquer lugar EXCETO no card do sacador (vazio entre cards, card do parceiro sem bola, ou área do placar). Comportamento exatamente como o user descreveu.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.10);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🏆 v1.3.13-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Maio, 2026)</span></div>' +
      '<p><b>Criar/Editar Torneio convertido pra page-route <code>#novo-torneio</code> (auditoria parte 3).</b></p>' +
      '<p>Formulão grande, scrollável, com muitos campos — caso clássico de "deveria ser rota". Antes era modal-overlay com max-width 800px (card flutuante).</p>' +
      '<ul style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li><code>window._navigateToCreateTournament()</code> nova função — navega pra <code>#novo-torneio</code></li>' +
        '<li><code>window.renderCreateTournamentPage(container)</code> renderer canônico que move o <code>.modal</code> pro view-container preservando todos os listeners e valores pré-populados</li>' +
        '<li><code>window.setupCreateTournamentModal</code> exposto globalmente pra rebuild idempotente quando o user navega pra fora e volta</li>' +
        '<li><code>_discardCreateTournament()</code> agora detecta rota — navega pro <code>#dashboard</code> em vez de só fechar modal</li>' +
        '<li>Pre-population dos campos (form.reset, sport selection, venue prefill, template apply) continua acontecendo nos call-sites ANTES da navegação. <code>renderCreateTournamentPage</code> move o <code>.modal</code> com valores intactos pro view-container</li>' +
        '<li>Post-init (GSM presets, Places autocomplete, venue map) roda dentro do renderer com <code>setTimeout(50)</code> garantindo DOM visível</li>' +
        '<li>Header padronizado já existia via <code>_renderCreateTournamentHeader</code> (Voltar + Carregar Template + Salvar Template + Descartar + Salvar) — preservado</li>' +
        '<li>3 callers atualizados: btn-quick-advanced, _qcApplyTemplate, openEditModal</li>' +
        '<li>Hint context <code>create-tournament</code> adicionado</li>' +
      '</ul>' +
      '<p>Topbar visível, hamburger funciona, URL bookmarkable. Última na auditoria: <code>casual-match-overlay</code> (com cuidado por causa do live state — placar, timer).</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.10);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🏷️ v1.3.12-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Maio, 2026)</span></div>' +
      '<p><b>Category Manager convertido pra page-route <code>#categorias/&lt;tId&gt;</code> (auditoria parte 2).</b></p>' +
      '<p>Conteúdo rico (cards, drag/drop, mesclagem) onde o organizador passa tempo gerenciando — ficou claro que devia ser rota com URL própria. Antes era full-screen modal-overlay com z-index 10001 cobrindo tudo.</p>' +
      '<ul style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li><code>_openCategoryManager(tId)</code> virou wrapper que faz <code>window.location.hash = "#categorias/" + tId</code> — todos os call-sites antigos preservados</li>' +
        '<li><code>window.renderCategoryManagerPage(container, tId)</code> renderer canônico chamado pelo router</li>' +
        '<li>Header padronizado via <code>_renderBackHeader</code> (Voltar → <code>#tournaments/&lt;id&gt;</code>, título "🏷️ Categorias")</li>' +
        '<li>Conteúdo direto no view-container (max-width 760px, padding 1rem) — sem card flutuante centralizado</li>' +
        '<li>Detail view (clique num cat card) continua como modal-overlay — é transiente, perfeito caso de uso pra overlay</li>' +
        '<li>Drag/drop preserva todos os IDs internos (<code>cat-manager-modal</code>, <code>cat-mgr-cards</code>) — reuso completo da lógica existente</li>' +
        '<li>Hint context <code>category-manager</code> adicionado</li>' +
      '</ul>' +
      '<p>Topbar visível, hamburger funciona, URL bookmarkable. Próxima na auditoria: <code>modal-create-tournament</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.10);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">📚 v1.3.11-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Maio, 2026)</span></div>' +
      '<p><b>Manual de Ajuda agora é page-route <code>#help</code> (auditoria parte 1).</b></p>' +
      '<p>Aplicação direta da regra centralizada: conteúdo rico, scrollável, bookmarkável → vira rota. Antes era <code>modal-help</code> (modal-overlay full-screen). Agora <code>#help</code> com topbar visível, hamburger funcional, URL compartilhável.</p>' +
      '<ul style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li><b><code>setupHelpModal</code> convertido de IIFE pra função regular</b> — permite rebuild quando o user navega pra fora de #help (router clear destrói o .modal) e volta. Auto-chamado uma vez no final do arquivo, preserva o build inicial</li>' +
        '<li><b><code>renderHelpPage(container)</code></b> nova função que move o <code>.modal</code> pro view-container preservando todos os listeners (sections collapsible, lazy-load das notas, search filter)</li>' +
        '<li><b>Router</b>: <code>case "help":</code> chama <code>renderHelpPage(viewContainer)</code></li>' +
        '<li><b>Callsites atualizados</b>: botão "?" no topbar, atalho de teclado <kbd>?</kbd>, busca rápida (Ctrl+K) — todos navegam pra <code>#help</code></li>' +
        '<li><b>Hint do help</b> atualizado pra apontar pro novo seletor</li>' +
        '<li><b>Contexto de hint</b> "help" adicionado pra distinguir da página default</li>' +
      '</ul>' +
      '<p>Próximas tarefas da auditoria: <code>category-manager-overlay</code>, <code>casual-match-overlay</code> (borderline) — provavelmente também viram rota. <code>modal-quick-create</code>, <code>modal-login</code>, <code>modal-delete-account</code> ficam como overlay (transactional/auth/destrutivo).</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">💡 v1.3.10-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Maio, 2026)</span></div>' +
      '<p><b>Dicas (hints) contextualmente corretas — nunca mais hints de páginas invisíveis.</b> User: <i>"as dicas continuam estranhas... a pagina de detalhes do torneio não está na tela (deve estar atras da pagina de analise). Não faz sentido mostrar dicas tão fora de contexto. corrija isso no programa todo. isso nunca pode acontecer. as dicas devem ser muito contextualizadas (devem aparecer apenas na pagina que está visivel e na parte da pagina que esta visivel)."</i></p>' +
      '<p>Dois fixes em <code>js/hints.js</code>:</p>' +
      '<ul style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li><b>Contextos de página faltando</b>: <code>_getCurrentContext()</code> agora reconhece as page-routes novas — <code>#profile</code>, <code>#analise/&lt;tId&gt;</code>, <code>#support</code>, <code>#privacy</code>, <code>#terms</code>, <code>#invite</code>. Antes essas rotas caíam no default <code>"dashboard"</code>, fazendo hints de dashboard aparecerem em telas onde nada do dashboard estava visível.</li>' +
        '<li><b>Check de occlusão via elementFromPoint</b>: além de checar display:none / visibility:hidden / viewport bounds / ancestrais escondidos, agora <code>_isElementVisible</code> verifica se o elemento está realmente NO TOPO em pelo menos 1 dos 5 pontos testados (centro + 4 quadrantes recuados). Se outro elemento (modal, overlay, página) estiver cobrindo, o hint é descartado. Antes elementos tecnicamente no DOM mas visualmente escondidos atrás de outra view passavam pelo check e disparavam hints incorretos.</li>' +
      '</ul>' +
      '<p>Resultado: estando na página de Análise (ou qualquer outra), os hints só apontam pra elementos que VOCÊ ESTÁ VENDO de fato — não mais pra coisas atrás de modais ou páginas anteriores.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.10);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🛣️ v1.3.9-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Maio, 2026)</span></div>' +
      '<p><b>Análise de Inscritos convertida pra page-route (#analise/&lt;tId&gt;).</b> User: <i>"o menu na analise não esta aparecendo corretamente quando clicamos no hamburber. aplique o cabecalho canonico aqui"</i></p>' +
      '<p>Aplicado o mesmo padrão centralizado da v1.3.5 (perfil): a Análise sai do <code>position:fixed; inset:0</code> overlay e vira uma <b>rota real</b> com <code>renderEnrollmentReportPage(container, tId)</code>.</p>' +
      '<ul style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li><b>Topbar permanece visível</b> (logo + nav + hamburger) — antes o overlay cobria tudo com z-index 10020 e quebrava o dropdown do hamburger</li>' +
        '<li><b>Back-header padronizado</b> via <code>_renderBackHeader</code> — Voltar (esq, navega pra <code>#tournaments/&lt;id&gt;</code>), título "📊 Análise de Inscritos" (centro). Hamburger usa o do topbar (não-overlay context)</li>' +
        '<li><b>Router</b> ganhou <code>case "analise":</code> que chama <code>renderEnrollmentReportPage(viewContainer, cleanParam)</code> com o tId do segundo segmento da hash</li>' +
        '<li><b>Compat</b>: <code>_openEnrollmentReport(tId)</code> agora é wrapper que faz <code>window.location.hash = "#analise/" + tId</code> — todos os botões "📊 Análise" continuam funcionando sem mudança</li>' +
        '<li><b>Guard</b>: a rota só renderiza pra organizador do torneio. Não-organizador é redirecionado pro <code>#tournaments/&lt;id&gt;</code></li>' +
        '<li><b>CSS limpo</b>: removidas as regras especiais pra <code>#enrollment-report-modal</code> em components.css (back-header static, hamburger forçado, etc.) — não são mais necessárias</li>' +
        '<li><b>Cleanup automático</b>: removidos hashchange listener e openModal hook que existiam pra limpar o overlay-fantasma — agora o router cuida do view-container nativamente</li>' +
      '</ul>' +
      '<p>Lição aplicada da memória: padrão centralizado (page-route + <code>_renderBackHeader</code>) sempre, nunca recriar via CSS hacks em modal-overlay.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #ef4444;border-radius:12px;padding:14px 16px;background:rgba(239,68,68,0.10);">' +
      '<div style="font-weight:800; color:#f87171; font-size:1rem; margin-bottom:8px;">🐛 v1.3.8-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Maio, 2026)</span></div>' +
      '<p><b>Bugs críticos do report Análise de Inscritos.</b> User: <i>"nada funciona aqui. cabeçalho quebrado, informações totalmente erradas (veja que perfil está completo, mas na idade dá 40+ e 50+ - o 40+ não pode disputar com o 50+ - vc não entendeu a logica da faixa de idade.) Na categoria D diz ter 0 inscritos, mas tem 1..."</i></p>' +
      '<p>Três bugs corrigidos:</p>' +
      '<ul style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li><b>Gênero "Sem gênero" mesmo com perfil completo</b>: o perfil salva <code>gender</code> como <i>"masculino"</i>/<i>"feminino"</i>/<i>"outro"</i> (strings completas em PT do <code>&lt;select&gt;</code>), mas o <code>_genderLabel</code> do report só conhecia as chaves curtas <i>"masc"</i>/<i>"fem"</i> usadas em <code>t.genderCategories</code>. Resultado: lookup falhava, gênero virava null, inscrito caía em "Sem gênero". Map agora aceita ambos formatos.</li>' +
        '<li><b>Faixas de idade são MUTUAMENTE EXCLUSIVAS, não cumulativas</b>: 52 anos com <code>[40+, 50+, 60+, 70+]</code> agora retorna SÓ <code>50+</code> — antes retornava <code>[40+, 50+]</code> (dupla contagem em todas as faixas qualificáveis). Algoritmo: ordena thresholds descendente, retorna o primeiro que cabe. Lógica correta de torneios: 40+ = jogadores 40-49 anos, 50+ = jogadores 50-59 anos, etc.</li>' +
        '<li><b>"D 0 inscritos" / "50+ 0 inscritos" mesmo tendo 1 inscrito qualificado</b>: <code>_decomposeCat(\'D\', t)</code> retornava <code>{skill:null}</code> quando <code>t.skillCategories</code> estava vazio (modo derivado, torneio sem cat configurada). Sem skill identificado, count caía em zero. Adicionado fallback pra defaults <code>[\'A\',\'B\',\'C\',\'D\',\'FUN\']</code> e <code>[\'40+\',\'50+\',\'60+\',\'70+\']</code> quando torneio não tem config própria.</li>' +
      '</ul>' +
      '<p>Resultado esperado pra inscrito Masc/D/52a: Visão Geral mostra <i>Masc 1, D 1, 50+ 1</i> (sem 40+); Distribuição mostra <i>Masc D 1</i> e <i>Masc 50+ 1</i> com formato sugerido + tempo.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #6366f1;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.10);">' +
      '<div style="font-weight:800; color:#a5b4fc; font-size:1rem; margin-bottom:8px;">📐 v1.3.7-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Maio, 2026)</span></div>' +
      '<p><b>Modalidades do perfil consistentes com o resto do app + layout compacto da habilidade por modalidade.</b> User: <i>"percebo que as modalidades aqui não estão consistentes com o resto do programa. na criação/edição do torneio temos outras modalidades que aqui não aparecem. essa forma ficou bonito para registrar as habilidades por modalidade, mas está gastando muito espaço."</i></p>' +
      '<ul style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li><b>Lista de modalidades alinhada</b>: 5 → 7 — adicionados <b>Vôlei de Praia</b> e <b>Futevôlei</b> (já existiam em <code>venues.js SPORTS</code> e <code>_sportScoringDefaults</code> desde v0.15.102, mas faltavam no perfil)</li>' +
        '<li><b>Layout compacto da habilidade por modalidade</b>: cards âmbar empilhados foram substituídos por linhas minimalistas de uma só altura. Cada modalidade ativa fica numa única linha: <code>Beach Tennis · [A][B][C][D][FUN]</code> — nome em texto leve âmbar (font 0.74rem), pills minúsculas indigo (font 0.7rem, padding 3x8). Gasto vertical reduzido em ~70%</li>' +
        '<li>Sem fundos, sem bordas, sem padding extra — só o essencial</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #6366f1;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.10);">' +
      '<div style="font-weight:800; color:#a5b4fc; font-size:1rem; margin-bottom:8px;">🎯 v1.3.6-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Maio, 2026)</span></div>' +
      '<p><b>Categoria de habilidade individual por modalidade.</b> User: <i>"vamos individualizar a categoria por modalidade. uma pessoa pode ser C em tenis e D em beach Tennis por exemplo. Assim, quando o usuário selecionar uma modalidade deve abrir o campo da habilidade naquela modalidade para ser preenchido."</i></p>' +
      '<p>Schema novo: <code>profile.skillBySport = { "Beach Tennis": "D", "Pickleball": "C", "Tênis": "B" }</code>. User pode declarar nível diferente em cada modalidade — antes era um único <code>defaultCategory</code> global aplicado pra tudo.</p>' +
      '<p>UI nova:</p>' +
      '<ul style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li>Campo "Categoria" standalone removido — passou pra dentro da seção Modalidades</li>' +
        '<li>Quando uma modalidade é selecionada, abre embaixo um mini-picker de habilidade (A/B/C/D/FUN) específico daquela modalidade</li>' +
        '<li>Cada modalidade ativa vira um cardzinho âmbar: <code>Beach Tennis: [A] [B] [C] [<b>D</b>] [FUN]</code></li>' +
        '<li>Pill de skill ativa fica indigo (mesmo estilo das pills de habilidade do criar torneio)</li>' +
        '<li>Clicar no skill ativo desmarca (volta pra "selecione")</li>' +
      '</ul>' +
      '<p>Backward-compat: perfis antigos com <code>defaultCategory: "D"</code> e modalidades preferidas têm o "D" auto-aplicado a cada modalidade na primeira abertura. Save continua escrevendo <code>defaultCategory</code> (= primeira skill) pra readers legacy não quebrarem.</p>' +
      '<p>Análise de Inscritos atualizada: o report agora prioriza <code>profile.skillBySport[t.sport]</code> (habilidade naquela modalidade do torneio) ao invés do <code>defaultCategory</code> global. Bloco diagnóstico mostra o map por inscrito.</p>' +
      '<p>i18n snapshot/restore preserva também o map de skillBySport ao trocar idioma com perfil aberto.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.10);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🛣️ v1.3.5-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Maio, 2026)</span></div>' +
      '<p><b>Perfil agora é uma rota (<code>#profile</code>), não modal-overlay.</b> User: <i>"a administração disso está centralizada no app justamente para vc não ficar tentando copiar o que já está feito e aprovado. encontre isso e aplique o que já está feito, centralizado e aprovado sem tentar recriar o que descrevi."</i></p>' +
      '<p>Substituí toda a estrutura de "modal-overlay" do perfil pelo padrão centralizado de <i>page route</i> — mesmo de <code>#support</code>, <code>#privacy</code>, <code>#terms</code>, <code>#invite</code>:</p>' +
      '<ul style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li><b>Topbar permanece visível</b> (logo + app name + nav) com hamburger funcional empurrando o conteúdo scrollável quando aberto</li>' +
        '<li><b>Back-header padronizado</b> via <code>_renderBackHeader</code> com Voltar (esquerda, hash → #dashboard), título "Meu Perfil" (centro), botão Salvar (direita)</li>' +
        '<li><b><code>renderProfilePage(container)</code></b> nova função em auth.js: garante setupProfileModal foi chamado, MOVE o <code>.modal</code> pro view-container preservando todos os listeners, e adiciona o back-header padronizado em cima</li>' +
        '<li><b>Router</b>: novo <code>case "profile":</code> chama <code>renderProfilePage(viewContainer)</code></li>' +
        '<li><b>Compat</b>: <code>_openMyProfileModal()</code> e <code>_showProfileModal()</code> agora são wrappers que fazem <code>window.location.hash = "#profile"</code> — todos os call-sites antigos continuam funcionando sem mudança</li>' +
        '<li><b>Helper centralizado</b> <code>_closeProfilePage()</code> trata tanto a rota nova (navega pro #dashboard) quanto o modal-overlay legacy (remove .active)</li>' +
        '<li><b>i18n</b>: re-render do perfil ao trocar idioma agora detecta tanto <code>.active</code> quanto <code>hash === "#profile"</code>, preservando snapshot de edições não-salvas como antes</li>' +
        '<li><b>CSS</b>: removidas as gambiarras das v1.3.3/v1.3.4 (top:60px, max-width forçado, etc.). Agora <code>#view-container > .modal</code> renderiza como página normal (sem card flutuante)</li>' +
      '</ul>' +
      '<p>Lição importante pro futuro (anotada em memória): quando há padrão centralizado já aprovado (<i>page routes via _renderBackHeader</i>), não criar caminho paralelo via CSS hacks em modal-overlay — usar o que está pronto.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #818cf8;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.10);">' +
      '<div style="font-weight:800; color:#a5b4fc; font-size:1rem; margin-bottom:8px;">🖥️ v1.3.4-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Maio, 2026)</span></div>' +
      '<p><b>Modal de Perfil agora ocupa tela inteira (full viewport).</b> User: <i>"o perfil parece estar abrindo numa subtela e não na tela toda com a largura total do navegador. arrume isso. nenhuma tela deveria abrir dessa forma."</i></p>' +
      '<p>Antes o modal tinha <code>max-width: 520px</code> + <code>max-height: 90vh</code> e era um card flutuante centralizado com cantos arredondados — combinado com o back-header padronizado da v1.3.3, dava uma sensação de "subtela dentro da tela". CSS atualizado pra que <code>#modal-profile</code> ocupe full viewport igual a <code>#venues-detail-overlay</code> e <code>#enrollment-report-modal</code>: sem padding na overlay, sem max-width/max-height, sem rounded corners, sem border. Conteúdo do body ainda é centralizado em <code>max-width: 760px</code> pra leitura confortável em telas grandes, mas o chrome (overlay + back-header) ocupa a largura total.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #818cf8;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.10);">' +
      '<div style="font-weight:800; color:#a5b4fc; font-size:1rem; margin-bottom:8px;">🔧 v1.3.3-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Maio, 2026)</span></div>' +
      '<p><b>Cabeçalho do Modal de Perfil padronizado + cleanup do overlay de Análise.</b> User: <i>"o cabecalho no perfil está quebrado. cade logo, hamburger etc"</i></p>' +
      '<p>Dois fixes:</p>' +
      '<ul style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li><b>Modal de Perfil agora usa <code>_renderBackHeader</code></b>: padrão consistente com o resto do app — <i>Voltar</i> à esquerda (fecha o modal), título "Meu Perfil" centralizado, botão <i>Salvar</i> à direita, e hamburger acessível. Antes era um header custom com title + Cancelar + Salvar (sem hamburger). Memória do user: "all pages/modals/overlays: back button left + title center + hamburger right".</li>' +
        '<li><b>Overlay de Análise de Inscritos com cleanup robusto</b>: agora fecha automaticamente em <code>hashchange</code> (URL muda → overlay some) e quando qualquer outro modal abre via <code>openModal()</code> (perfil, login, criar torneio…). Antes podia ficar fantasma cobrindo a tela com z-index 10020. CSS atualizado pra que back-header dentro do overlay flua estaticamente (não <code>position:fixed</code>) e mostre o hamburger — comportamento igual aos outros overlays (#venues-detail-overlay, #qr-modal-overlay, etc.).</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #818cf8;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.10);">' +
      '<div style="font-weight:800; color:#a5b4fc; font-size:1rem; margin-bottom:8px;">🔧 v1.3.2-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Maio, 2026)</span></div>' +
      '<p><b>Análise de Inscritos: pills baseadas no perfil + categorias derivadas + bloco diagnóstico.</b> User: <i>"temos 1 inscrito com perfil completo, mas não parece estar funcionando. deveria ter masc 1, habilidade D 1, Masc 50+ 1 - que são os dados do perfil inscrito."</i></p>' +
      '<p>Três fixes:</p>' +
      '<ul style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li><b>Skill do perfil agora vale</b>: o report lê <code>profile.defaultCategory</code> (campo "Categoria padrão" no perfil, ex.: A, B, C, D, FUN) como skill efetivo do inscrito quando o organizador não atribuiu manualmente via 🏷️ Categorias. Antes só contava se tinha atribuição manual; agora o perfil basta. Atribuição manual continua tendo prioridade.</li>' +
        '<li><b>Pills da Visão Geral sempre mostram dados do perfil</b>: as pills "Por gênero", "Por habilidade" e "Por idade" agora aparecem com base no que está nos perfis dos inscritos, não só nas categorias configuradas pelo torneio. Ordem de skill prioriza <code>t.skillCategories</code>; ordem de idade é numérica (40+ → 50+ → 60+ → 70+).</li>' +
        '<li><b>Categorias derivadas quando não há config</b>: se o organizador não configurou categorias por gênero/habilidade/idade, o report agora deriva automaticamente das informações dos perfis (ex.: 1 inscrito Masc/D/50+ vira "Masc D" e "Masc 50+" no painel de distribuição). Banner discreto avisa "(sugeridas pelos perfis)" pra deixar claro que foi derivado, com hint de configurar manualmente em ✏️ Editar.</li>' +
      '</ul>' +
      '<p><b>Bloco diagnóstico</b> colapsável adicionado no rodapé do modal: mostra <code>t.genderCategories</code>, <code>t.skillCategories</code>, <code>t.ageCategories</code> brutos + por inscrito o uid, snapshot do <code>participantObj</code>, dados do profile fetched, e os campos resolvidos. Útil pra identificar caminho-perdido ("profile não carregado", "profile.gender vazio", etc.) sem precisar abrir DevTools.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #818cf8;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.10);">' +
      '<div style="font-weight:800; color:#a5b4fc; font-size:1rem; margin-bottom:8px;">🔄 v1.3.1-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Maio, 2026)</span></div>' +
      '<p><b>Análise de Inscritos: botão sempre visível pro organizador + report reflete atualizações de perfil.</b> User: <i>"Essa função de relatório de inscritos deve estar entre os botoes ferramentas do organizador no card de detalhe do torneio. O relatório deve ser atualizado conforme os perfis são atualizados e não apenas quando a pessoa se inscreve."</i></p>' +
      '<p>Dois fixes:</p>' +
      '<ul style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li><b>Botão sempre visível</b>: condição <code>_hasParticipants</code> removida. Mesmo com 0 inscritos, organizador pode abrir o modal pra conferir como as categorias configuradas vão se distribuir. Empty state inline: "Sem inscritos ainda. As estatísticas vão aparecer assim que alguém se inscrever ou for adicionado."</li>' +
        '<li><b>Profile fresh, não snapshot</b>: o report agora prefere <code>profile.gender</code>, <code>profile.displayName</code> e <code>profile.email</code> (vindos de <code>users/{uid}</code> a cada abertura do modal) ao invés do snapshot do <code>participantObj</code> capturado no momento da inscrição. Quando user atualiza gênero ou nome no perfil, próxima abertura do report já reflete. <code>birthDate</code> sempre foi fresh (vive só no profile, não é capturado no enrollment).</li>' +
      '</ul>' +
      '<p>Categorias atribuídas pelo organizador (via 🏷️ Categorias) continuam vindo do <code>participantObj.categories[]</code> — são organizer-controlled, não dependem do perfil do user.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #818cf8;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.10);">' +
      '<div style="font-weight:800; color:#a5b4fc; font-size:1rem; margin-bottom:8px;">📊 v1.3.0-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Maio, 2026)</span></div>' +
      '<p><b>Análise de Inscritos: relatório pro organizador entender como os inscritos se distribuem nas categorias e qual formato faz mais sentido por categoria.</b></p>' +
      '<p>Pedido literal do user: <i>"Esse relatorio deve mostrar ao organizador quem são os inscritos separados por genero, habilidade e faixa de idade e qual seria a forma de torneio para cada modalidade com tempo previsto para a realização do torneio. Esse relatório deve ainda indicar aqueles que por falta na informação do perfil não podem ser encaixados nessa ou naquela categoria."</i></p>' +
      '<p>Botão <b>📊 Análise</b> aparece nas Ferramentas do Organizador quando há ≥1 inscrito. Modal cobre 3 seções:</p>' +
      '<ul style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li><b>Visão Geral</b>: total de inscritos, breakdown por gênero / habilidade / idade — pills com cor por dimensão.</li>' +
        '<li><b>Distribuição por Categoria</b>: cada combinação configurada (Fem A, Masc B, Fem 40+, etc.) listada com contagem real, formato sugerido e tempo estimado de duração. Sugestões: 2 inscritos → "Final única (BO3)"; 3-4 → "Liga round-robin"; 5-7 → "Eliminatórias com BYEs ou Liga curta"; 8 → "Eliminatórias Simples"; 9-15 → "Elim com BYEs ou Grupos+Elim"; 16+ → "Elim Simples ou Grupos+Elim". Tempo usa <code>gameDuration</code> e <code>courtCount</code> do torneio (defaults 30min/quadra única).</li>' +
        '<li><b>Perfis Incompletos</b>: lista quem ficou de fora de alguma categoria — falta gênero, falta data de nascimento (não tem como saber faixa etária), falta categoria de habilidade atribuída pelo organizador, ou inscrito que entrou via convite manual sem conta scoreplace.</li>' +
      '</ul>' +
      '<p>Implementação: <code>js/views/tournaments-enrollment-report.js</code> (~440 linhas). Lê <code>participantObj.gender</code> direto + faz N=#inscritos leituras paralelas em <code>users/{uid}</code> pra trazer <code>birthDate</code> (idade computada client-side com lógica mês/dia). Custo bounded — só dispara ao abrir modal manualmente.</p>' +
      '<p><b>Próximas fases:</b> auto-assign por idade quando o perfil tem birthDate (hoje só roda pro gênero); UI de inscrição multi-categoria pro participante escolher se entra na de habilidade, na de idade, ou em ambas.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #a855f7;border-radius:12px;padding:14px 16px;background:rgba(168,85,247,0.10);">' +
      '<div style="font-weight:800; color:#d8b4fe; font-size:1rem; margin-bottom:8px;">↕️ v1.2.4-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Maio, 2026)</span></div>' +
      '<p><b>Bloco "Categorias do Torneio" subiu — agora vem logo depois de Tipo de Jogo e antes de Modo de Inscrição.</b> User: <i>"agora parece que faz mais sentido colocar todo o bloco de categorias logo depois do tipo de jogo e antes do modo de inscrição."</i></p>' +
      '<p>Faz sentido funcional: o tipo de jogo (Simples/Duplas) afeta a multiplicação das categorias (ex.: <code>Fem A Simples</code> vs <code>Fem A Duplas</code>), então definir as duas dimensões antes de configurar a inscrição mantém o fluxo lógico — o organizador vê todas as categorias geradas no preview antes de decidir como os participantes vão se inscrever.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #a855f7;border-radius:12px;padding:14px 16px;background:rgba(168,85,247,0.10);">' +
      '<div style="font-weight:800; color:#d8b4fe; font-size:1rem; margin-bottom:8px;">📋 v1.2.3-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Maio, 2026)</span></div>' +
      '<p><b>Preview de categorias agrupado por gênero, com Misto sempre colapsado.</b> User: <i>"Quero apenas Misto como categoria nesse box. Nesse mesmo box podemos colocar os generos divididos em linhas (ficaria Fem A, Fem B, Fem C, Fem 40+, Fem 50+ na linha de baixo Masc A..."</i></p>' +
      '<p>Box de "Categorias do Torneio" reorganizado: uma linha por gênero, ordem fixa Fem → Masc → Misto. Skill+age da mesma família ficam juntos na mesma linha (skill em roxo, age em âmbar pra distinção visual). Antes os pills viravam um wrap horizontal sem agrupamento — difícil de ler.</p>' +
      '<p>Bug colateral: pills âmbar de idade não passavam pelo <code>_displayCategoryName</code>, então mostravam <i>Misto Obrig. 40+</i> ao invés de <i>Misto 40+</i>. Agora todas as pills (skill e age) passam pelo helper que colapsa Misto Aleat./Obrig. → Misto. A distinção Aleat./Obrig. continua existindo na config interna do torneio (formação dos times), só não polui a UI.</p>' +
      '<p>Removido também o "(opcional, paralelo à habilidade)" do label de Categorias por Idade — toda a seção é opcional, ficou redundante.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #6366f1;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.10);">' +
      '<div style="font-weight:800; color:#a5b4fc; font-size:1rem; margin-bottom:8px;">🧹 v1.2.2-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Maio, 2026)</span></div>' +
      '<p><b>Categorias finalizadas: A/B/C/D/FUN, Misto auto-excludente, sem campo de texto livre.</b> User: <i>"Troque open por FUN (categoria iniciante). O Misto, como por habilidade (qualquer deles, pode ser apenas Misto - São auto excludentes entre si). Vamos usar os toggles visuais para genero, habibildade e idade."</i></p>' +
      '<ul style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li><b>Open → FUN</b> — pill de iniciante. A é o nível mais alto, FUN o de entrada.</li>' +
        '<li><b>Misto Aleatório ⊕ Misto Obrigatório</b> são mutuamente exclusivos — clicar num desliga o outro automaticamente. Faz sentido: torneio só pode usar uma estratégia de formação de times mistos por vez.</li>' +
        '<li><b>Removido o "+ outras categorias custom"</b> — não há dados legados a preservar (beta phase confirmada pelo dono: <i>"não existem torneios verdadeiros no sistema ainda. não existem outras categorias além das que estamos trabalhando agora"</i>). Schema enxuto: pills são única fonte de verdade.</li>' +
      '</ul>' +
      '<p>Resultado: 3 dimensões com toggle visual consistente — gênero (roxo, multi mas Mistos excludem-se), habilidade (indigo, multi), idade (âmbar, multi). Sem campos de texto. Tudo é click.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #6366f1;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.10);">' +
      '<div style="font-weight:800; color:#a5b4fc; font-size:1rem; margin-bottom:8px;">🎯 v1.2.1-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Maio, 2026)</span></div>' +
      '<p><b>Categorias por habilidade viram toggles A/B/C/D/Open — campo de texto livre vira fallback colapsável.</b> User: <i>"a funcionalidade está legal aqui, mas acho que vai ficar melhor se usarmos toggles inclusive para as categorias de habilidade."</i></p>' +
      '<p>Pills indigo distintas das pills roxas de gênero e amber de idade. Multi-select clássico (igual gênero+idade). Mesmo padrão visual e técnico — fechando consistência da seção Categorias.</p>' +
      '<p>Backward-compat alpha-safe: torneios já criados com categorias customizadas (ex.: <code>1ª, 2ª, PRO</code>) continuam funcionando — valores que não casam com pills carregam dentro de um <code>&lt;details&gt;</code> "+ outras categorias custom" que se expande automaticamente. Organizador pode misturar pills + custom (toggle A + B + custom "PRO" → resultado <code>A, B, PRO</code>).</p>' +
      '<p>Fix bonus: reset de form (form.reset() no fluxo de "Detalhes Avançados" e templates) agora também limpa o estado visual das pills de categoria — gênero/idade/habilidade. Antes <code>data-active</code> dos botões persistia entre aberturas do modal mesmo com hidden field zerado, dando impressão de "categorias selecionadas que não estavam".</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">🎂 v1.2.0-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Maio, 2026)</span></div>' +
      '<p><b>Categorias por idade chegam em paralelo às categorias por habilidade — Fase 1 (schema + UI).</b> User: <i>"além das que já estão previstas, precisamos da possibilidade da categoria por idade em paralelo a categoria por habilidade. as categorias por idade geralmente são 40+, 50+, 60+ e 70+. O organizador pode ativar esse modo de categorias por idade no torneio e caso também haja a categoria por habilidade, os participantes podem se inscrever numa, noutra ou mesmo nas duas. assim como a categoria por habilidade, a categoria por idade também é separada por gênero."</i></p>' +
      '<p>Pills 40+, 50+, 60+, 70+ no formulário de Criar Torneio (cor âmbar, distintas das pills roxas de gênero+habilidade). Múltipla seleção. <b>Em paralelo à habilidade — não cruza:</b> idade × gênero × gameType, mas nunca skill × age. Modelo: jogador escolhe se inscrever na categoria por habilidade, na categoria por idade, ou em <b>ambas</b> simultaneamente. Sub-bracket separado por faixa etária × gênero (pessoa de 65 anos joga 60+ e 50+ se quiser).</p>' +
      '<p>Preview ao vivo mostra duas seções de pills:</p>' +
      '<ul style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li><span style="padding:2px 8px;background:rgba(168,85,247,0.15);border:1px solid rgba(168,85,247,0.25);border-radius:4px;color:#d8b4fe;font-weight:600;">Fem A · Masc B · Misto Aleat. Duplas</span> (roxo) — gênero × habilidade × tipo de jogo</li>' +
        '<li><span style="padding:2px 8px;background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.30);border-radius:4px;color:#fbbf24;font-weight:600;">Fem 40+ · Masc 50+ · Masc 60+ Duplas</span> (âmbar) — gênero × idade × tipo de jogo</li>' +
      '</ul>' +
      '<p>Schema novo: <code>t.ageCategories[]</code> persistido no Firestore. Salva, carrega na edição, fica preservado no clone do torneio. <b>Fase 2 (em desenvolvimento):</b> relatório "Análise de Inscritos" pro organizador — quantas pessoas em cada gênero × habilidade × idade, formato sugerido por categoria com tempo estimado de duração, e quem está com perfil incompleto pra justificar onde encaixar. <b>Fase 3:</b> auto-assign por idade (se perfil tem <code>birthDate</code>) e UI de inscrição multi-categoria.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">📝 v1.1.11-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Maio, 2026)</span></div>' +
      '<p><b>Nome do venue agora em linha separada — header com Voltar/Editar/Reivindicar limpo, nome com largura cheia.</b> User: <i>"aqui o nome do lugar poderia estar na linha de baixo (do voltar, editar e reinvindicar) assim esses botoes ficam mais claros e com uma linha inteira para o nome do lugar fica legal."</i></p>' +
      '<p>Antes:</p>' +
      '<pre style="font-size:0.78rem;background:rgba(0,0,0,0.3);padding:8px;border-radius:6px;">← Voltar | 🏢 Clube Pa... | ✏️ Editar | 🏢 Reivindicar</pre>' +
      '<p>Agora:</p>' +
      '<pre style="font-size:0.78rem;background:rgba(0,0,0,0.3);padding:8px;border-radius:6px;">← Voltar |              | ✏️ Editar | 🏢 Reivindicar\n🏢 Clube Paineiras do Morumby\n📍 Av. Independência, 950</pre>' +
      '<p>Linha do nome usa largura cheia (<code>word-break:break-word</code>) — nomes longos quebram em vez de truncar. Endereço aparece logo abaixo. Reverti também o <code>display:none</code> dos labels dos botões em mobile (v1.1.9) — agora cabem porque o nome não compete mais por espaço.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">⊕ v1.1.10-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Maio, 2026)</span></div>' +
      '<p><b>Botão "+ Cadastrar" vira círculo "+" só em mobile.</b> User: <i>"no celular por conta do tamanho da tela o botao cadastrar poderia ser apenas um circulo com + dentro na cor e estilo que está (só sem a palavra cadastrar dentro do botao)."</i></p>' +
      '<p>Mesma cor/borda da v1.1.8 (índigo translúcido pill). Só muda o formato em ≤767px:</p>' +
      '<ul style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li>Texto " Cadastrar" envolto em <code>&lt;span class="gv-register-label"&gt;</code> → <code>display:none</code> em mobile</li>' +
        '<li>Botão recebe classe <code>.gv-register-btn</code> → 26×26px círculo (border-radius 50% + flex center)</li>' +
        '<li>Desktop: continua "+ Cadastrar" normal</li>' +
      '</ul>' +
      '<p>Libera espaço pro nome do local não truncar mais nos cards de Sugestões do Google.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">✏️ v1.1.9-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Maio, 2026)</span></div>' +
      '<p><b>Editar do venue agora abre o form COMPLETO + header mobile ficou compacto.</b> User: <i>"aqui ao clicar num local preferido/cadastrado nem dá pra ler o nome do local. o botão editar deveria abrir uma tela igual a de cadastrar local (onde possa cadastrar esportes, quadras, horários)."</i></p>' +
      '<p><b>Fix #1 — Editar abre form completo:</b></p>' +
      '<ul style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li>Antes: clicava Editar → abria form INLINE limitado (só nome/endereço/horário/descrição) via <code>_venuesToggleEdit</code></li>' +
        '<li>Agora: navega pra <code>#my-venues</code> e abre o MESMO form completo do Cadastrar (esportes, quadras, horários 7×24, contatos, fotos, etc.) via <code>_venueOwnerEditExisting</code></li>' +
        '<li><code>opts.skipPublicGuard:true</code> bypassa o guard de venues públicos — Editar é correção comunitária, não reivindicação</li>' +
      '</ul>' +
      '<p><b>Fix #2 — Header mobile:</b> em ≤767px, labels textuais "Editar"/"Reivindicar" ficam escondidas via classe <code>.venue-detail-btn-label</code> + <code>display:none</code>. Só ✏️ e 🏢 ficam visíveis. Libera espaço pro nome do local não truncar mais.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">📱 v1.1.8-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Maio, 2026)</span></div>' +
      '<p><b>Botão "+ Cadastrar" agora compacto em mobile.</b> User: <i>"no celular esse cadastrar ficou péssimo. ficou enorme e só se ve ele (nem dá pra saber qual o lugar)."</i></p>' +
      '<p>Bug: <code>responsive.css</code> linha 159-162 força <code>width:100%</code> em <code>.view-container .btn-primary</code> em mobile (≤767px). O botão da v1.1.6-beta usava <code>class="btn btn-sm btn-primary"</code> e foi pego pela regra → ocupava todo o card → empurrava nome do local pra fora.</p>' +
      '<p>Fix: trocou pelas classes por estilo inline pill — fundo índigo translúcido, borda sutil, padding compacto. Visualmente coerente com o badge "Google" ao lado, mas com cor de ação. Não dispara a regra responsiva.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">🕐 v1.1.7-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Maio, 2026)</span></div>' +
      '<p><b>Legenda do grid de Horário de Funcionamento agora explica a alternância.</b> User: <i>"e se errarmos e indicarmos aberto num horário que está fechado? o ideal seria tirar o dedo e clicar novamente alternaria entre aberto e fechado, ou tem forma melhor de fazer isso?"</i></p>' +
      '<p>O comportamento já era exatamente esse — <code>paintTo = current === 1 ? 0 : 1</code> em <code>_setupHoursGridListeners</code>: cada toque alterna a cor da célula inicial e o drag pinta tudo com essa cor. Mas a legenda só dizia "arraste o dedo pra pintar várias células", sem explicar o toggle.</p>' +
      '<p>Nova legenda em 3 linhas:</p>' +
      '<ul style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li>🟢 aberto · 🟥 fechado</li>' +
        '<li><b>Toque</b> alterna a cor · <b>Arraste</b> pinta várias com a mesma cor</li>' +
        '<li>Errou? Toque de novo na célula errada — alterna pro lado certo</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">📍 v1.1.6-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Maio, 2026)</span></div>' +
      '<p><b>Botão "+ Cadastrar" inline em cada card de Sugestões do Google.</b> User: <i>"onde está o botão para cadastrar locais? seria legal e intuitivo que ele ficasse na direita de cada local (ao lado da palavra google)."</i></p>' +
      '<p>Antes: cada card era um <code>&lt;a href=maps...&gt;</code> wrapper, sem botão de cadastro. Pra registrar um local visto na lista, organizador tinha que abrir <code>#my-venues</code> e re-buscar.</p>' +
      '<p><b>Agora:</b> card vira <code>&lt;div&gt;</code> com áreas clicáveis distintas:</p>' +
      '<ul style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li>Corpo do card → abre Google Maps em nova aba (preserva comportamento)</li>' +
        '<li><b>+ Cadastrar</b> (gradient azul) → stash os dados em <code>sessionStorage</code> e navega pra <code>#my-venues</code> com formulário pré-preenchido (mesmo padrão do botão na seleção de busca)</li>' +
        '<li>Badge "Google" só visual</li>' +
      '</ul>' +
      '<p>Reusa fluxo existente: <code>renderMyVenues</code> em <code>venue-owner.js</code> faz pickup automático do <code>scoreplace_pending_venue_registration</code> e abre <code>_renderForm</code> com placeId/name/address/lat/lon já preenchidos.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">🤖 v1.1.5-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Maio, 2026)</span></div>' +
      '<p><b>Fix reCAPTCHA reuso em SMS login após logoff.</b> Sentry SCOREPLACE-WEB-D: <code>Error: reCAPTCHA has already been rendered in this element</code> quando user fazia logoff e tentava login SMS de novo. Causa: <code>window._phoneRecaptchaVerifier</code> persistia entre sessões; reuso disparava render() interno do Firebase no elemento que já tinha conteúdo do render anterior.</p>' +
      '<p>Fix: SEMPRE reset+recreate o verifier antes de cada tentativa (em vez de checar truthy e reusar). <code>_resetPhoneRecaptcha()</code> limpa o container HTML + nullifica a referência. Custo: 1 instância nova de RecaptchaVerifier por SMS request — desprezível.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">🧹 v1.1.4-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Maio, 2026)</span></div>' +
      '<p><b>Removidos botões "🤖 Add Bot" e "🗑️ Apagar Torneio" da toolbar do organizador.</b> User: <i>"adicionar bots nunca é uma opção (alias podemos retirar isso novamente do programa e também o apagar torneio)."</i></p>' +
      '<p>Foram trazidos de volta na v1.0.59-beta especificamente pra ajudar nos testes da matriz de resolução. Testes terminados → removidos novamente. Painel de resolução pra times incompletos NÃO oferece "Adicionar Bots" como opção (só Reabrir, Lista de Espera, Excluir).</p>' +
      '<p><b>Apagar Torneio</b>: ainda existe via Firebase console pelo dono do torneio se necessário, mas saiu da UI cotidiana — diminui chance de delete acidental + reduz ruído visual nos cards.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">↩️ v1.1.3-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Maio, 2026)</span></div>' +
      '<p><b>Revert da validação anti-placeholder da v1.1.2.</b> User: <i>"as pessoas já tem dificuldade de entrar no programa (por incompetencia delas muitas vezes) e vc vai implementar uma trava? melhor deixar entrar e depois editamos o nome do usuário."</i></p>' +
      '<p>Trade-off correto: friction no onboarding > qualidade do nome cadastrado. Organizadores corrigem manualmente nomes ruins via UI quando precisar.</p>' +
      '<p>Removido em 2 lugares: <code>handleEmailRegister</code> (volta a aceitar qualquer nome não-vazio) e <code>saveUserProfile</code> (volta a aceitar qualquer string ou vazio com fallback).</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">🛡️ v1.1.2-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Maio, 2026 — REVERTIDO em v1.1.3)</span></div>' +
      '<p><b>Validação no register/profile bloqueia nomes placeholder ("usuário", "teste", etc.).</b> User reportou via Sentry: pessoa cadastrada com nome "usuário" — provavelmente confundiu o campo "Nome" com "tipo de usuário" ou simplesmente preencheu com a label.</p>' +
      '<p>Investigação no código: nenhum caminho persistia "Usuário" automaticamente (todas as 6 referências ao termo eram fallbacks de display, nunca de save). Conclusão: a pessoa digitou. Fix preventivo via validação client-side.</p>' +
      '<p><b>Lista de placeholders bloqueados</b> (case-insensitive, exact match):</p>' +
      '<ul style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li><code>usuário</code>, <code>usuario</code>, <code>user</code></li>' +
        '<li><code>name</code>, <code>nome</code></li>' +
        '<li><code>teste</code>, <code>test</code>, <code>admin</code></li>' +
        '<li><code>anonimo</code>, <code>anônimo</code></li>' +
        '<li><code>sem nome</code>, <code>no name</code>, <code>unknown</code>, <code>desconhecido</code></li>' +
      '</ul>' +
      '<p>Aplicado em 2 lugares: <code>handleEmailRegister</code> (signup com email/senha) e <code>saveUserProfile</code> (edição de perfil). Toast: <i>"Por favor, digite seu nome real (não use \'X\' como nome)"</i> + foco automático no campo pra correção.</p>' +
      '<p><b>Observabilidade Sentry:</b> resolvido issue <code>SCOREPLACE-WEB-K</code> (SyntaxError no botão Avançar pra Eliminação que estava em v1.0.96 — corrigido em v1.0.97). Issues Firebase auth/invalid-credential são benignas (senha errada, já tratadas com toast ao usuário).</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">⏱️ v1.1.1-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Maio, 2026)</span></div>' +
      '<p><b>Painel de Configuração de Grupos: estimativa dinâmica de partidas + duração por opção.</b> User: <i>"seria muito interessante diz quantas partidas e previsão de duração total do torneio de forma dinamica a cada vez que uma opção é selecionada."</i></p>' +
      '<p>Cada card de configuração agora mostra rodapé com:</p>' +
      '<ul style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li><b>⚔️ N partidas</b>: round-robin de cada grupo + bracket de classificados (+1 disputa de 3º lugar quando ≥4)</li>' +
        '<li><b>⏱️ ~Xh / ~Xmin</b>: duração estimada considerando <code>gameDuration</code>, <code>callTime</code>, <code>warmupTime</code>, <code>courtCount</code> e intervalos</li>' +
      '</ul>' +
      '<p>Cálculo:</p>' +
      '<ul style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li><b>Group rounds</b> = groupSize - 1 (round-robin completo)</li>' +
        '<li><b>Group matches per round</b> = somado entre grupos (todos jogam em paralelo nas quadras)</li>' +
        '<li><b>Elim rounds</b> = log2(totalAdvance)</li>' +
        '<li><b>Slot</b> = gameDuration + callTime + warmupTime + 5min intervalo</li>' +
        '<li><b>Per round</b> = ceil(matches / courts) × slotMin</li>' +
        '<li><b>+15min</b> intervalo entre fase de grupos e elim</li>' +
      '</ul>' +
      '<p>Atualiza dinamicamente quando user troca o número de classificados (1/2/3/4) — <code>renderPanel</code> recalcula tudo a cada call de <code>_groupsRerenderPanel</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">🏅 v1.1.0-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Maio, 2026)</span></div>' +
      '<p><b>MINOR bump.</b> Classificação final em Grupos+Eliminatórias inclui TODOS os participantes (classificados + não-classificados de grupos), <b>respeitando os critérios de desempate configurados pelo organizador</b>.</p>' +
      '<p>User: <i>"a classificação não inclui os que participaram da primeira fase do torneio... aqui ficam os critérios de desempate e podem ser ordenados de forma diferente pelo organizador."</i></p>' +
      '<p><b>Antes:</b> <code>_updateProgressiveClassification</code> só processava <code>t.matches</code> (elim phase). Times que jogaram só fase de grupos e não classificaram pra elim sumiam da classificação. Mesmo bug que tinha pra Suíço (v1.0.89) e Dupla Elim (v1.0.90).</p>' +
      '<p><b>Fix em <code>bracket-logic.js</code>:</b> no fim de <code>_updateProgressiveClassification</code>, scaneia <code>t.groups</code>:</p>' +
      '<ul style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li>Pra cada grupo, computa standings COMPLETAS (points/wins/saldo + sets/games/tiebreaks GSM + Buchholz + Sonneborn-Berger)</li>' +
        '<li>Skip top N (classificados pra elim — já têm posição)</li>' +
        '<li>Junta todos os não-classificados num pool cross-group</li>' +
        '<li>Aplica <code>t.tiebreakers</code> (configurados pelo user) na mesma ordem de prioridade: <code>confronto_direto → saldo_pontos → vitorias → buchholz → sonneborn_berger → sorteio</code> (ou ordem custom)</li>' +
        '<li>Atribui posições ao FIM (maxPos+1, +2, ...)</li>' +
      '</ul>' +
      '<p><b>Default fallback:</b> se <code>t.tiebreakers</code> vazio, usa default alinhado com UI:</p>' +
      '<ul style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li>Numérico: confronto direto, saldo, vitórias, Buchholz, Sonneborn, sorteio</li>' +
        '<li>GSM (sets): + saldo_sets, saldo_games, sets_vencidos, games_vencidos, tiebreaks_vencidos</li>' +
        '<li>Pontos avançados: vai pro topo se <code>t.advancedScoring.enabled</code></li>' +
      '</ul>' +
      '<p><b>Cross-group h2h:</b> mapa de confronto direto construído com matches de TODOS os grupos (não só dentro do mesmo grupo) — relevante quando dois jogadores de grupos diferentes empatam em pontos no pool de não-classificados (raro em round-robin puro, mas importante em formatos híbridos).</p>' +
      '<p><b>Exemplo 20 times, 4 grupos × 5, top 2 = 8 elim:</b> posições 1-8 vêm da elim, 9-20 vêm dos 12 não-classificados ordenados pelos tiebreakers escolhidos pelo organizador.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">🐛 v1.0.97-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Maio, 2026)</span></div>' +
      '<p><b>Botão "Avançar para Fase Eliminatória" não fazia nada — typo no onclick.</b> User: <i>"o botao avancar para fase eliminatoria nao faz nada"</i>.</p>' +
      '<p>Em <code>bracket.js</code> linha 1721, faltava o <code>)</code> fechando a chamada da função:</p>' +
      '<pre style="font-size:0.78rem;background:rgba(0,0,0,0.3);padding:8px;border-radius:6px;">// Antes\nonclick="window._advanceToElimination(\'${id}\'">\n//                                              ^^^ falta )\n\n// Depois\nonclick="window._advanceToElimination(\'${id}\')">\n//                                              ^^^^</pre>' +
      '<p>Com JS inválido no onclick, browser silenciosamente ignorava o clique — botão visualmente clicável mas inerte. Fix: adicionado o <code>)</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">🎲 v1.0.96-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(3 de Maio, 2026)</span></div>' +
      '<p><b>Sortear após cancelar painel de Grupos: agora reabre o painel em vez de sortear silenciosamente com defaults.</b> User: <i>"quando coloquei para sortear depois de ter cancelado ele sorteou direto sem me perguntar novamente a formação dos grupos."</i></p>' +
      '<p><b>Causa-raiz em <code>tournaments.js</code> linha 792:</b> botão Sortear tem 2 variantes (renderizadas por status):</p>' +
      '<ul style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li><code>sortearAberto</code> (status=open): chama <code>_handleSortearClick</code> → confirma fechar inscrições → roteia via <code>showUnifiedResolutionPanel</code> ✓</li>' +
        '<li><code>sortearBtn</code> (status=closed): chamava <code>generateDrawFunction</code> DIRETO ❌</li>' +
      '</ul>' +
      '<p><b>Por que quebrava:</b> quando user clica Sortear pela 1ª vez (status=open), confirma fechar inscrições → status persistido como \'closed\' → painel de grupos abre. User cancela. <code>_cancelGroupsConfig</code> não restaura status. Próximo render → status=closed → <code>sortearBtn</code> renderizado → clica → <code>generateDrawFunction</code> usa <code>t.gruposCount || 4</code> e <code>t.gruposClassified || 2</code> como defaults silenciosos.</p>' +
      '<p><b>Fix:</b> <code>sortearBtn</code> (status=closed) agora chama <code>_handleSortearClick(tId, false)</code> em vez de <code>generateDrawFunction</code>. <code>isAberto=false</code> pula o dialog (não precisa fechar — já tá fechado) e vai direto pra <code>_startDraw</code> → <code>showUnifiedResolutionPanel</code> → roteia pro painel correto (P2 / grupos / final review). Pra Single Elim sem issues, painel cai pro draw automaticamente. Pra Grupos sem config, painel de grupos abre.</p>' +
      '<p>Liga manual draw mantido com <code>generateDrawFunction</code> direto (Liga não tem painel P2/grupos).</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">🚨 v1.0.95-beta HOTFIX <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(2 de Maio, 2026)</span></div>' +
      '<p><b>HOTFIX: render loop infinito travava o app — UI não respondia, impossível apagar torneio.</b> User: <i>"fica recarregando de forma que é impossivel apagar esse torneio que insiste em dizer que existe mais um jogo pronto para chamar"</i>.</p>' +
      '<p><b>Causa:</b> v1.0.93 chamava <code>syncImmediate</code> dentro do <code>renderDoubleElimBracket</code>. Loop:</p>' +
      '<pre style="font-size:0.78rem;background:rgba(0,0,0,0.3);padding:8px;border-radius:6px;">render → delete t.thirdPlaceMatch + syncImmediate\n→ Firestore write → onSnapshot fires\n→ store.tournaments REPLACED com novo t (talvez ainda com thirdPlaceMatch antigo do server)\n→ _softRefreshView triggered → re-render\n→ if (t.thirdPlaceMatch) → loop</pre>' +
      '<p><b>Fix:</b> removido <code>syncImmediate</code> do render. Apenas cleanup local com flag <code>_cleanupApplied</code> (rodando 1x por sessão). Próxima ação legítima do user (lançar placar, editar) dispara sync que persiste o estado limpo. Se torneio velho ainda mostra "1 jogo pronto pra chamar" mas não tem o 15º match (fantasma): pelo menos agora o app responde, user pode apagar e recriar.</p>' +
      '<p><b>Removido também:</b> auto-finalize no render. _maybeFinishElimination só roda em _advanceWinner (placar lançado) — sem auto-finalize forçado.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">📐 v1.0.94-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(2 de Maio, 2026)</span></div>' +
      '<p><b>Classificação DE no topo do bracket — consistente com Eliminatórias Simples.</b> User: <i>"coloque a classificação na mesma posição das eliminatórias simples (no topo do chaveamento se não me engano) para ficar consistente."</i></p>' +
      '<p>Em Single Elim a classificação fica no <b>topo</b> (após banner do campeão). Em DE estava no fim — inconsistente. Movido pra mesma posição: bloco <code>&lt;details&gt;</code> aparece no topo do bracket DE, antes do Chaveamento Superior.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">🧹 v1.0.93-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(2 de Maio, 2026)</span></div>' +
      '<p><b>Cleanup automático de torneios DE velhos no render — não precisa apagar e recriar.</b> User: <i>"tenho que apagar e recriar o torneio? nao aparece o 15o jogo"</i>.</p>' +
      '<p>v1.0.92 fixou o bug do thirdPlaceMatch fantasma em DE, mas o cleanup só rodava em <code>_advanceWinner</code> (quando placar é lançado). Se a GF já estava preenchida ANTES da v1.0.92 deployar, nenhuma mutação subsequente disparava o cleanup — torneio ficava preso em "15 partidas" eternamente.</p>' +
      '<p><b>Fix em <code>renderDoubleElimBracket</code>:</b> no topo do render, força <code>delete t.thirdPlaceMatch</code> + <code>syncImmediate</code>. Também chama <code>_maybeFinishElimination</code> no render — se GF já tem winner, marca tournament como finished na hora.</p>' +
      '<p>Auto-cura: ao recarregar a página do torneio bagunçado, ele se conserta sozinho — total volta pra 14, status vira "finished", classificação progressiva aparece.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">🏁 v1.0.92-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(2 de Maio, 2026)</span></div>' +
      '<p><b>Dupla Eliminatória: termina, conta certo, mostra classificação progressiva.</b> User: <i>"de novo diz que são 15 partidas mas só renderiza 14 delas. tudo preenchido e não termina"</i> + <i>"no caso de dupla eliminatória não há classificação personalizada... quero que haja a classificação personalizada... e que isso se revele conforme não tenha mais como alterar a posição do time."</i></p>' +
      '<p><b>3 bugs corrigidos:</b></p>' +
      '<ol style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li><b><code>_maybeGenerate3rdPlace</code> criava t.thirdPlaceMatch fantasma pra DE.</b> DE não tem 3º lugar dedicado (3º vem do Lower Final loser). Esse match TBD inflava total reportado pra 15 e travava <code>_maybeFinishElimination</code> em <code>if (t.thirdPlaceMatch && !t.thirdPlaceMatch.winner) return</code> — torneio nunca finalizava. Fix: early-return em DE + cleanup de thirdPlaceMatch fantasma de torneios velhos.</li>' +
        '<li><b><code>_maybeFinishElimination</code> bypassa check de thirdPlaceMatch em DE</b> (defesa pra torneios velhos que ainda tem o thirdPlaceMatch fantasma).</li>' +
        '<li><b><code>renderDoubleElimBracket</code> não chamava <code>_updateProgressiveClassification</code> nem renderizava a tabela.</b> Fix: agora chama no topo e renderiza <code>&lt;details&gt;</code> com posições no fim do bracket — abre por default.</li>' +
      '</ol>' +
      '<p><b>Classificação progressiva em DE:</b> conforme rounds do Lower bracket completam, posições viram definitivas e aparecem:</p>' +
      '<ul style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li>LR1 completa → 7º-8º (perdedores não podem mais subir)</li>' +
        '<li>LR2 → 5º-6º</li>' +
        '<li>LR3 → 4º</li>' +
        '<li>LR4 (Lower Final) → 3º</li>' +
        '<li>GF → 1º-2º</li>' +
      '</ul>' +
      '<p>Para 16 times: LR1→13-16, LR2→9-12, LR3→7-8, LR4→5-6, LR5→4, LR6→3.</p>' +
      '<p><b>IMPORTANTE:</b> torneios criados antes da v1.0.91 estão estruturalmente quebrados (sem Lower Final). Pra validar, criar torneio NOVO. Torneios criados com v1.0.91+ funcionam corretamente.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">🐛 v1.0.91-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(2 de Maio, 2026)</span></div>' +
      '<p><b>BUG estrutural na Dupla Eliminatória — Lower Final não era gerada.</b> User: <i>"deveria haver uma lower final? acho que é isso e essa não aparece no chaveamento."</i></p>' +
      '<p><b>Causa-raiz em <code>tournaments-draw.js</code>:</b> loop de geração do lower bracket usava <code>for (let ur = 1; ur < totalUpperRounds; ur++)</code> com <code>&lt;</code>. Para 8 times DE (totalUpperRounds=3), só rodava ur=1 e ur=2 — o merge round que pega o UR final loser e joga contra o LR winner (= a Lower Final) NUNCA era criado.</p>' +
      '<p><b>Sintoma:</b></p>' +
      '<ul style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li>UR final loser ficava órfão (não ia pra lugar nenhum)</li>' +
        '<li>LR3 winner ia DIRETO pra Grande Final, sem enfrentar UR final loser</li>' +
        '<li>Total de matches errado: 13 em vez de 14 pra 8 times</li>' +
        '<li>Estrutura fundamentalmente errada — DE não funcionava como Double Elimination de verdade</li>' +
      '</ul>' +
      '<p><b>Fix:</b> trocar <code>&lt;</code> por <code>&lt;=</code>. Agora ur vai de 1 até totalUpperRounds inclusivo. No último iteração, cria o merge round que é a Lower Final (LR4 pra 8 times, LR6 pra 16 times, etc.). actualMergeCount=1 pra esse último round → não gera battle round depois (correto: LR final é o último).</p>' +
      '<p><b>Counts corretos pós-fix:</b></p>' +
      '<ul style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li>4 times DE: 3 UR + 2 LR + 1 GF = 6 matches</li>' +
        '<li>8 times DE: 7 UR + 6 LR + 1 GF = 14 matches</li>' +
        '<li>16 times DE: 15 UR + 14 LR + 1 GF = 30 matches</li>' +
        '<li>32 times DE: 31 UR + 30 LR + 1 GF = 62 matches</li>' +
      '</ul>' +
      '<p><b>Bonus fix em <code>tournaments-utils.js</code>:</b> <code>_getTournamentProgress</code> adicionava placeholder de 3º lugar pra TODOS formatos elim com 2+ rounds. DE não tem match de 3º lugar (3º vem do Lower Final loser) — placeholder excluído pra DE. Antes inflava o total reportado.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">🥈 v1.0.90-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(2 de Maio, 2026)</span></div>' +
      '<p><b>Classificação dedicada para Dupla Eliminatória (Lower bracket + GF aware).</b> User: <i>"preenchido até a grande final ainda diz que falta um jogo. não está informando a classificação personalizada. na verdade não dá classificação alguma."</i></p>' +
      '<p><b>Causa-raiz:</b> <code>_updateProgressiveClassification</code> foi escrita pra Single Elim. Filtrava <code>m.bracket !== \'lower\' && m.bracket !== \'grand\'</code> — ignorava 100% do Lower bracket. Tratava upper-final winner como 1º (errado: em DE ele vai pra GF, pode ser 2º). Resultado: classificação vazia ou incorreta para qualquer DE.</p>' +
      '<p><b>Fix em <code>bracket-logic.js</code>:</b> nova função <code>_updateDuplaElimClassification(t)</code> dedicada. Roteador detecta <code>fmt === \'Dupla Eliminatória\'</code> e delega.</p>' +
      '<p><b>Lógica DE:</b></p>' +
      '<ul style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li><b>1º</b> = GF winner, <b>2º</b> = GF loser</li>' +
        '<li><b>3º</b> = Lower Final loser, <b>4º</b> = Lower R(final-1) loser, ...</li>' +
        '<li>Posições atribuídas processando lower rounds em ordem DESCENDENTE (final = melhor pos)</li>' +
        '<li>Bloco de posições por round = total de matches do round (8 times: LR1→7-8, LR2→5-6, LR3→4, LR4→3)</li>' +
        '<li>Suporta estado parcial — só atribui posição quando match tem winner. nextPos avança pelo total do round (não só won) pra preservar slots</li>' +
        '<li>Empate por margem de placar dentro do bloco (closer = melhor)</li>' +
        '<li>Suíço-cut times anexados ao fim (consistente com v1.0.89 pra Single Elim)</li>' +
      '</ul>' +
      '<p><b>Validação para 8 times DE:</b> 14 matches total (UR 4+2+1, LR 2+2+1+1, GF 1). Quando GF pendente (13/14), positions 3-8 já visíveis. Fechado o GF, positions 1-2 entram.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">🏅 v1.0.89-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(2 de Maio, 2026)</span></div>' +
      '<p><b>Classificação final inclui times cortados na fase Suíça.</b> User: <i>"os 4 times que cairam antes das eliminatórias (nas rodadas suiças) deveriam aparecer ocupando 20o ao 17o lugar"</i>.</p>' +
      '<p>Antes <code>_updateProgressiveClassification</code> só populava <code>t.classification</code> a partir das partidas eliminatórias. Times que jogaram só Suíço e foram cortados sumiam da classificação final.</p>' +
      '<p><b>Fix em <code>bracket-logic.js</code>:</b> ao final de <code>_updateProgressiveClassification</code>, se houver <code>t.swissEliminated</code> + <code>t.swissStandings</code> (preenchidos pela transição Swiss→elim), anexa eles à classificação na ordem do swissStandings — melhor cortado pega <code>maxPos+1</code> (17º), pior cortado pega <code>maxPos+N</code> (20º).</p>' +
      '<p>Nota: aplicado só pra <i>Suíço</i> porque cortados realmente jogaram (têm rank por Buchholz/SB). Pra Reabrir/Play-in/Enquete/Lista de Espera, o cut é arbitrário (alfabético/sorte/voto) — atribuir posição numérica não faria sentido. Usuário pode ver Lista de Espera separadamente nesses casos.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">👁️ v1.0.88-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(2 de Maio, 2026)</span></div>' +
      '<p><b>Botão W.O. omitido quando Presença confirmada.</b> User: <i>"na lista de inscritos, da mesma forma que o botão de presença do jogador é omitido quando damos WO para um participante, vamos omitir o botao de WO quando a presença for confirmada"</i>.</p>' +
      '<p>Simétrico ao comportamento da v1.0.80 (toggle Presença escondido pra W.O.\'d players). Lógica em <code>participants.js</code>: <code>_showWoBtn = isOrg && (isAbsent || !mc)</code>. Quando <code>isAbsent=true</code> mantém "Reverter" visível (única forma de desfazer W.O.). Quando <code>mc=true</code> (Presente) e não-absent, esconde W.O. Pra acessar W.O. de novo, usuário toggla Presença off → botão reaparece.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">🛡️ v1.0.87-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(2 de Maio, 2026)</span></div>' +
      '<p><b>Substituição W.O. unificada — função idempotente <code>_processWoSubstitutions</code>.</b> User: <i>"continua falhando em algum ponto. tem gente presente na lista de espera, mas ao colocar o WO a pessoa não é substituida no jogo (fica vermelha no jogo). arrume isso nem que seja colocando um loading até que o banco de dados esteja seguro de funcionar como se deve... tem 3 presentes na lista de espera mas o sistema age como se nao houvesse ninguem"</i>.</p>' +
      '<p>Após v1.0.85 (fix _declareAbsent) e v1.0.86 (fix _autoSubstituteWO), o bug persistiu. Sintoma: 3 Presentes na lista, sistema age como 0. Indica que o filtro de Presentes está retornando empty mesmo com checkedIn populado — race condition mais profundo OU corrupção de state. Em vez de mais 1 patch surgical, refator agressivo:</p>' +
      '<ul style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li><b>Nova função <code>window._processWoSubstitutions(tId)</code></b> — idempotente, sem closure capture, sem dialog. Lê state FRESH de AppStore.tournaments a cada chamada. Itera <code>t.absent</code>, pra cada absent sem replacedBy ainda, acha o match (varrendo p1/p2 atual), pega primeiro Presente standby (FIFO), substitui (atualiza match + partsArr + waitlists + checkedIn + woHistory), syncImmediate. Pode rodar 1x ou 100x — efeito é o mesmo.</li>' +
        '<li><b>Wire em <code>_declareAbsent</code> confirm callback:</b> em vez de 3 branches duplicando lógica, só MARCA absent + sync + chama <code>_processWoSubstitutions</code>. Caminho legado mantido como fallback (executa só se função unificada falhar). Toast claro pelo outcome: "✅ Sub feita", "⚠️ Aguardando substituto", "🏆 Oponente vence (lista vazia)", ou "⚠️ Falha — debug window._lastProcessSubs".</li>' +
        '<li><b>Wire em <code>_toggleCheckIn</code>:</b> ao marcar Presente, chama <code>_processWoSubstitutions</code> diretamente em vez do antigo <code>_autoSubstituteWO</code> (que tinha dialog + race). Sub é instantânea, sem dialog.</li>' +
        '<li><b>Diagnóstico observável:</b> <code>window._lastProcessSubs</code> expõe outcome (sub-done / no-presente-in-standby / no-sub-needed), subDetails, standbyPoolCount, presentCount, absentNames, checkedInKeys.</li>' +
      '</ul>' +
      '<p><b>Trade-off aceito:</b> sub não tem mais dialog de confirmação ("Bot 03 substituirá Bot 31?"). Justificativa: usuário já clicou W.O. = confirmação. FIFO é determinístico. Se sub errada, botão Reverter desfaz. UX simplificada vence diálogo redundante que era fonte do bug.</p>' +
      '<p><b>Regra cristalizada:</b> quando bug persiste após múltiplos patches surgical em paths separados que duplicam lógica, refator pra função UNIFICADA + IDEMPOTENTE chamada como rede de segurança em todos os pontos. Closure captures + race conditions desaparecem porque cada chamada lê estado fresh.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">🔁 v1.0.86-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(2 de Maio, 2026)</span></div>' +
      '<p><b>2ª substituição W.O. via auto-trigger — fix do mesmo race em <code>_autoSubstituteWO</code>.</b> User: <i>"continua errado. bot 01 tomou o lugar do bot15, mas seu parceiro era bot10 e tambem dei WO. bot05 deveria ter tomado lugar do bot, mas não aconteceu"</i>.</p>' +
      '<p>v1.0.85 fixou <code>_declareAbsent</code> mas o segundo path crítico — <code>_autoSubstituteWO</code> em bracket-ui.js — tinha o MESMO bug. Esse path é o caminho B: usuário declara W.O. primeiro (sub vai pra "aguarda"), depois marca o substituto Presente → <code>_toggleCheckIn</code> dispara <code>_autoSubstituteWO</code> com setTimeout 120ms → dialog abre → onSnapshot do toggle write substitui store.tournaments → closure t fica detached → mutations no confirm callback são perdidas.</p>' +
      '<p><b>Fix em <code>bracket-ui.js _autoSubstituteWO</code>:</b> dentro de AMBOS os branches do confirm callback (team individual e solo individual), re-fetch <code>t</code> de <code>AppStore.tournaments</code>, re-find <code>woMatch</code> via <code>_collectAllMatches(t)</code> com fallback (1) por team string oldEntry exato, (2) por absentMemberName em p1/p2. Re-derive <code>ab</code>/<code>ci</code>/<code>standby</code>/<code>_wl</code>/<code>allMatches</code> a partir do t fresh. <code>oldEntry</code> recomputado se woMatch mudou.</p>' +
      '<p><b>Diagnóstico:</b> <code>window._lastAutoSubstitute</code> expõe outcome (<code>team_individual_sub_done</code> ou <code>individual_solo_sub_done</code>), absentMemberName, replacementName, oldEntry, newTeamName, woSlot, matchAfter_p1/p2.</p>' +
      '<p><b>Regra cristalizada (consolidada com v1.0.85):</b> <i>todo</i> callback async (<code>showConfirmDialog</code>, <code>setTimeout</code>, <code>await</code>) que opera sobre AppStore.tournaments e tem dialog/timeout entre captura e execução PRECISA re-fetch <code>t</code> via <code>find()</code> no início — closures capturam refs que ficam detached quando store é re-replaced por listeners do Firestore. Aplicado em <code>_declareAbsent</code> (v1.0.85) e <code>_autoSubstituteWO</code> (v1.0.86). Auditar outros callbacks que mutate t numa próxima leva.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">🔁 v1.0.85-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(2 de Maio, 2026)</span></div>' +
      '<p><b>2ª substituição W.O. funciona — fix de race condition entre dialog e onSnapshot.</b> User: <i>"parece que o primeiro que sai da lista de espera é processado de forma diferente dos demais. o primeiro processa corretamente e os demais não... bot03 estava presente antes do wo do bot31"</i>.</p>' +
      '<p><b>Causa-raiz:</b> em <code>_declareAbsent</code>, o objeto <code>t</code> era capturado por closure do <code>showConfirmDialog</code> no início da função. Entre o <i>open</i> do dialog e o <i>confirm</i> do usuário, o <code>onSnapshot</code> do Firestore (re-disparado pelo write da toggle Presente do substituto, ~200ms) substituía <code>store.tournaments</code> com novo array. <code>t</code> ficava DETACHED — mutações dentro do confirm callback não propagavam pra <code>store.tournaments[i]</code>, e o <code>sync()</code> persistia o objeto NOVO (sem as mutações).</p>' +
      '<p><b>Por que a 1ª funcionava:</b> presença do substituto setada bem antes do clique no W.O., snapshot já tinha pousado, store.tournaments estável durante o dialog. Pra 2ª: presença setada logo antes (Bot 03 → Bot 31 W.O.), snapshot fired no meio.</p>' +
      '<p><b>Fix em <code>participants.js</code>:</b> dentro do confirm callback, re-fetch <code>t</code> fresh de <code>AppStore.tournaments</code> e re-derivar <code>partsArr</code>, <code>standby</code>, <code>matchEntry</code>, <code>matchSide</code>, <code>friendlyNum</code>, <code>opponent</code>, <code>hasStandby</code> a partir desse <code>t</code> mais recente. Variáveis externas viraram <code>let</code> pra suportar reassignment. <code>teamName</code> e <code>_teamNameNorm</code> são strings — capturadas por valor, ainda válidas.</p>' +
      '<p><b>Diagnóstico observável:</b> <code>window._lastDeclareAbsent</code> agora expõe snapshot completo do estado (callOrder, standbyDetail, presentSortedNames com ts e ciRaw, outcome, partsArrAfter*, etc). Toast da branch "aguarda" virou específico: <i>"Lista tem N pessoa(s), 0 Presente — aguardando"</i>. Se o problema persistir, console + toast revelam exatamente onde quebra.</p>' +
      '<p><b>Regra cristalizada:</b> dentro de qualquer callback async (dialog, setTimeout, await) que opera sobre AppStore.tournaments, sempre re-fetch <code>t</code> via <code>AppStore.tournaments.find(...)</code> no início — closures capturam refs que podem ficar detached quando store é re-replaced por listeners do Firestore.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">🔁 v1.0.84-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(2 de Maio, 2026)</span></div>' +
      '<p><b>Cards de inscritos: ordem dos times padronizada (p1 sempre em cima, p2 sempre embaixo).</b> User com screenshot: <i>"no card do bot02 consta bot02/bot31 vs bot27/bot04; mas no card do bot04 consta bot27/bot04 vs bot02/bot31 (invertido). Vamos escolher uma forma de mostrar e mostrar sempre na mesma ordem em todos os cards dos participantes"</i>.</p>' +
      '<p>Antes, cada card do mesmo Jogo N mostrava o time DO JOGADOR em cima e o oponente embaixo — Bot 02 via "Bot 02/Bot 31 vs Bot 27/Bot 04" e Bot 04 via "Bot 27/Bot 04 vs Bot 02/Bot 31". Mesmo dado, ordenação invertida — confunde leitura cruzada do mesmo jogo entre cards.</p>' +
      '<p><b>Fix em <code>participants.js</code>:</b> renderização agora resolve o match via <code>_allForCheckin[matchNum-1]</code> e usa <code>match.p1</code> como linha 1 (top) e <code>match.p2</code> como linha 2 (bottom) — ordem fixa, igual em todos os cards do mesmo jogo. Cores das bolinhas continuam refletindo presença individual, então o jogador identifica seu time pelos nomes/dots sem precisar do "meu time vem primeiro".</p>' +
      '<p>Fallback pra <code>ind.teamName</code>/<code>ind.opponent</code> mantido caso o match não resolva (edge case com matchNum null) — não regride display de cards sem match associado.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">🛡️ v1.0.83-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(2 de Maio, 2026)</span></div>' +
      '<p><b>Substituto preserva posição alfabética na lista geral — safety net + diagnóstico.</b> User: <i>"o bot05 estava em sua posicao entre o 04 e 06 (em lista de espera) e sumiu quando decretei WO do bot06... na lista geral dos inscritos ele deve se manter em sua posição sempre"</i>.</p>' +
      '<p>v1.0.78 + v1.0.81 garantiram que o substituto seja adicionado a <code>t.participants</code> nos 2 caminhos conhecidos (ind W.O. e team scope), mas o card continuou sumindo no teste do user. Como análise teórica dizia que o card DEVERIA aparecer, virei a estratégia: <b>safety net empírica</b> em <code>renderParticipants</code>.</p>' +
      '<p><b>Implementação em <code>participants.js</code>:</b></p>' +
      '<ul style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li>Após dedup, antes do sort alfabético, escaneia <code>t.woHistory</code>: pra cada <code>{woName: {replacedBy}}</code>, verifica se <code>replacedBy</code> tem card em <code>_dedupedIndividuals</code>. Se NÃO tem, cria card com <code>name</code>, <code>teamName</code>, <code>matchNum</code>/<code>opponent</code> e flag <code>_safetyAdded</code>.</li>' +
        '<li>Cobre 4 cenários onde substituto poderia sumir: race no push v1.0.78/81, dedup com bug não previsto, save/load Firestore resetando t.participants, novo caminho de substituição esquecendo do push.</li>' +
        '<li><b>Diagnóstico observável</b> via <code>window._debugLastParticipantsRender</code>: snapshot completo (parts, standby, woHistory, deduped names com flags <code>[safety]</code>/<code>[orphan]</code>/<code>[standby]</code>, currentFilter). Se Bot 05 ainda sumir, inspecionar console pra ver exatamente onde quebrou.</li>' +
      '</ul>' +
      '<p><b>Regra cristalizada:</b> quando análise teórica diz "X deveria aparecer" mas empiricamente não aparece, parar de iterar no upstream e adicionar safety net no downstream. Diagnóstico observável transforma silent failure em loud failure auditável.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">🏷️ v1.0.67-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(2 de Maio, 2026)</span></div>' +
      '<p><b>Tag "BYE" no card de partida em todo torneio com BYE.</b> User: <i>"sempre que um time passar de bye para a rodada seguinte deve ter uma tag BYE indicando isso. (apenas na rodada que passou de bye, nas seguintes quando passar por vitória não precisa mais sinalizar)"</i> + <i>"isso deve se aplicar a todo e qualquer bye em qualquer torneio"</i>.</p>' +
      '<p><b>Implementação:</b> flags <code>p1FromBye</code> / <code>p2FromBye</code> setadas em duas camadas:</p>' +
      '<ul style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li><code>tournaments-draw.js</code> Play-in: marca slot R2 quando <code>type === \'bye\'</code> (BYE forçado por ímpar).</li>' +
        '<li><code>bracket-logic.js _advanceWinner</code>: quando <code>completedMatch.isBye</code> (BYE auto-resolvido em qualquer rodada de qualquer formato), marca o slot da próxima partida.</li>' +
      '</ul>' +
      '<p>Tag âmbar <code>BYE</code> renderizada inline ao lado do nome no <code>renderMatchCard</code>. Some na rodada seguinte porque a partida não tem <code>p1FromBye</code> setado quando o avanço é por vitória normal.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">🔁 v1.0.66-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(2 de Maio, 2026)</span></div>' +
      '<p><b>Play-in: chaveamento real agora bate com a simulação.</b> Removida a geração de jogos de repescagem. Os melhores derrotados vão direto pro bracket por seleção (menor margem). Ajustes:</p>' +
      '<ul style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li><code>tournaments-draw.js</code>: <code>repMatchCount=0</code>, todos os spots viram <code>bestloser</code> awaiting direct fill.</li>' +
        '<li><code>bracket-logic.js _assignRepechageLosers</code>: novo branch quando <code>repMatchIds=[]</code> — atribui top N losers direto pros slots <code>awaitsBestLoser</code> da R2.</li>' +
        '<li>Backward-compat: torneios antigos com <code>repMatchIds</code> populadas seguem com lógica antiga.</li>' +
        '<li>Label corrigido: "13 PASSAM (+BYE)" → "13 AVANÇAM (12V + 1B)" pra clareza.</li>' +
        '<li>Notice corrigido: "auto-avança pra fase final" → "auto-avança pra próxima rodada".</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">🔁 v1.0.65-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(2 de Maio, 2026)</span></div>' +
      '<p><b>Play-in reescrito conforme spec do user.</b> Algoritmo:</p>' +
      '<ol style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li>Se # times é ímpar → 1 BYE forçado (auto-win, conta como winner)</li>' +
        '<li>R1: <code>(times - byes) / 2</code> jogos</li>' +
        '<li><code>winners_total = R1 winners + BYE auto</code></li>' +
        '<li><code>bracket = próxima P2 ≥ winners_total</code></li>' +
        '<li><code>excess = bracket - winners_total</code></li>' +
        '<li>Os <code>excess</code> melhores derrotados completam o bracket — <b>SEM jogos extras</b>, seleção direta por menor margem de derrota.</li>' +
      '</ol>' +
      '<p><b>Validação:</b> N=14 (7 times): 1 BYE + 6 jogam (3 jogos) → 4 winners → bracket=4, excess=0. N=20 (10 times): 10 jogam (5 jogos) → 5 winners → bracket=8, 3 best losers. N=50 (25 times): 1 BYE + 24 jogam (12 jogos) → 13 winners → bracket=16, 3 best losers.</p>' +
      '<p><b>Esta release atualiza só a SIMULAÇÃO.</b> Draw real (tournaments-draw.js + bracket-logic.js) será atualizado na próxima — a UI da simulação reflete corretamente o algoritmo agora.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">🔢 v1.0.64-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(2 de Maio, 2026)</span></div>' +
      '<p><b>Regressão corrigida: "Jogo N" duplicado em Rei/Rainha.</b> User: <i>"lembra que cada jogo em cada torneio não pode ter numero de jogo repetido? regredimos? quero que o jogo 1 seja sempre o jogo 1"</i>.</p>' +
      '<p><b>Causa-raiz:</b> em <code>bracket.js</code> linha 2206, o renderer dos grupos Rei/Rainha (Liga + monarch round) usava <code>renderMatchCard(m, ..., mi + 1)</code> onde <code>mi</code> era o índice do match DENTRO do grupo. Resultado: Grupo A tinha "Jogo 1, 2, 3", Grupo B também "Jogo 1, 2, 3", Grupo C idem — duplicatas em cada grupo.</p>' +
      '<p><b>Fix:</b> contador global <code>_monarchGlobalMatchNum</code> que persiste entre chamadas de <code>_renderGroup</code> (myGroups + otherGroups) e começa offsetado pelo total de matches das rodadas anteriores. Agora "Jogo 1" é sempre "Jogo 1" no torneio inteiro — independente de qual grupo, qual fase. Outras estruturas (Eliminatórias, Suíço, Liga não-monarch, Grupos+Elim) já tinham contadores globais corretos — só esse caminho específico estava quebrado.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">⏱️ v1.0.63-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(2 de Maio, 2026)</span></div>' +
      '<p><b>Painel de decisão Suíço agora mostra tempo estimado dinâmico.</b> Pedido do user: <i>"seria bom na tela de decisão do suiço, termos o tempo estimado para o torneio todo mostrado dinamicamente conforme clica em cada opção para o suiço"</i>.</p>' +
      '<p>Banner ⏱️ logo abaixo da grid de stats mostra <b>Tempo total</b>, dividido em <b>Suíço: Xh + Eliminatória: Yh</b>. Clica numa opção diferente de # de rodadas → atualiza em tempo real.</p>' +
      '<p><b>Cálculo:</b> fase Suíço = <code>rounds × ceil(matchesPerRound / courts) × timePerSlot</code>; fase Elim = <code>log2(targetTeams)</code> rodadas com decay de partidas; +15min de intervalo entre fases. Usa <code>t.gameDuration</code> (default 30min), <code>t.callTime</code>, <code>t.warmupTime</code>, <code>t.courtCount</code> (default 1) — se nenhum estiver setado, banner mostra hint pra editar o torneio.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">🏅 v1.0.62-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(2 de Maio, 2026)</span></div>' +
      '<p><b>Painel de configuração Suíço (simulation-panel) sobrevive a re-render.</b> Bug reportado: <i>"num torneio eliminatório com 40 inscritos cliquei no formato suiço e até apareceu o plano para escolher como seria o suiço, mas logo sumiu e voltou para o card de detalhe do torneio"</i>.</p>' +
      '<p><b>Causa-raiz:</b> mesma classe de bug fixada na v0.15.89 — <code>_softRefreshView</code> em store.js tinha safe-list com 4 panels (<code>unified-resolution-panel</code>, <code>groups-config-panel</code>, <code>remainder-resolution-panel</code>, <code>removal-subchoice-panel</code>) MAS faltava <code>simulation-panel</code> (sub-panel de config Suíço/BYE/Play-in) e <code>incomplete-teams-panel</code>. Quando user clica Suíço no painel unificado, <code>showResolutionSimulationPanel</code> abre o simulation-panel — mas o save de <code>t.status</code> no painel pai (ou qualquer onSnapshot do Firestore) dispara soft refresh → não detecta o novo painel como overlay protegido → chama <code>initRouter</code> → <code>_dismissAllOverlays</code> → painel removido em &lt;120ms.</p>' +
      '<p><b>Fix:</b> adicionado <code>simulation-panel</code> e <code>incomplete-teams-panel</code> ao safe-list do soft refresh. Agora qualquer overlay aberto pausa re-renders automáticos enquanto user está escolhendo opções.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">⏳ v1.0.61-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(2 de Maio, 2026)</span></div>' +
      '<p><b>Race do "perfil não carregou": gate de termos + nudge "Complete seu perfil" ficavam disparando pra returning users.</b> Pedido do user: <i>"voltou a pedir os termos de uso e apresentar o complete seu perfil para um usuário que já estava cadastrado e tinha perfil completo não carregado ainda"</i>.</p>' +
      '<p><b>Causa-raiz:</b> primeira chamada de <code>loadUserProfile</code> no <code>simulateLoginSuccess</code> retornava null pra returning users porque Firestore SDK ainda tava inicializando IndexedDB cache local. Default <code>get()</code> tenta cache primeiro — se vazio, retorna <code>doc.exists=false</code> antes do servidor responder. Com profile=null, gate caía em <code>currentUser</code> (só uid/email/displayName/photoURL) e disparava modal + nudge.</p>' +
      '<p><b>Fix em 2 camadas:</b></p>' +
      '<ol style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li><b>Retry detector via Firebase Auth metadata.</b> Se <code>lastSignInTime &gt; creationTime + 60s</code>, user é returning — tenta loadUserProfile até 4 vezes com delays crescentes (0, 500, 1000, 1500ms = max 3s). Users genuinamente novos (signup recente) só tentam 1x — sem delay extra. Durante retries intermediários, reseta <code>cu._profileLoaded=false</code> pra suprimir nudge prematuro.</li>' +
        '<li><b>Grandfather usa metadata como evidência.</b> Mesmo se retries esgotaram (network down), Firebase Auth metadata é PROVA de uso passado — independe do Firestore. Backfill <code>acceptedTerms=true</code> automaticamente, modal não dispara.</li>' +
      '</ol>' +
      '<p><b>Diagnóstico:</b> <code>[scoreplace-auth v1.0.61] profile load — isReturning=X, maxAttempts=Y</code> + <code>[scoreplace-auth] profile loaded on retry attempt #N</code> mostram exatamente quantas tentativas foram necessárias.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">🤖 v1.0.60-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(2 de Maio, 2026)</span></div>' +
      '<p><b>Botões "Add Bot" e "Apagar Torneio" de volta nas Ferramentas do Organizador.</b> User: <i>"vamos devolver os botoes add bot e apagar torneio para eu testar mais o app"</i>. Funções (<code>addBotsFunction</code>, <code>deleteTournamentFunction</code>) sempre existiram — só não tinham botão na UI desde algum cleanup passado.</p>' +
      '<p><b>Add Bot 🤖</b> — visível pra organizador antes do sorteio (depois do sorteio adicionar bot quebra a chave). Prompt pergunta quantos bots, popula com nomes "Bot 01", "Bot 02"… <code>btn-danger-ghost</code> pra sinalizar que é dev tool.</p>' +
      '<p><b>Apagar Torneio 🗑️</b> — visível só pro <i>creator</i> do torneio (não basta ser organizer). Confirmação obrigatória antes de deletar.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">📊 v1.0.59-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(2 de Maio, 2026)</span></div>' +
      '<p><b>Analytics (GA4) plugado pra entender uso real do app.</b> Pedido do user: <i>"seria legal monitorarmos o que as pessoas fazem no app, horários de maior uso etc, para podermos pensar depois em quais usos cobraremos e o que deixaremos de graça"</i>. Firebase Analytics inicializado (measurementId já existia no firebaseConfig). Sem PII nos eventos — apenas uid pseudonimizado + metadados de comportamento.</p>' +
      '<p><b>Eventos canônicos:</b> <code>signup</code>/<code>login</code> (param: method=google/sms/email_link), <code>tournament_created</code> (format/sport/drawMode), <code>casual_match_started</code>/<code>casual_match_finished</code> (sport, durationMin), <code>presence_checkin</code>/<code>presence_planned</code> (source=manual|auto_gps, sports_count), <code>venue_searched</code> (query_len, results_count), <code>friend_added</code>, <code>pro_upgrade_clicked</code> (source: tournaments/participants/logo/tv), <code>pix_support_clicked</code>, <code>free_tier_limit_hit</code> (limit_type).</p>' +
      '<p><b>User properties:</b> <code>plan</code> (free/pro) e <code>login_method</code> — permite filtrar relatórios por cohort (ex: "free users que tentaram criar 4º torneio" → bom alvo pra paywall).</p>' +
      '<p><b>Wrapper failsafe</b> em <code>js/analytics.js</code>: try/catch em toda chamada — se SDK não inicializar (ad-blocker, network), eventos viram no-op silencioso. App nunca quebra por causa de analytics.</p>' +
      '<p><b>Dashboard:</b> Firebase Console → Analytics. Real-time + funnels nativos. Em ~24h os primeiros relatórios começam a popular peak hours, retention e funis (signup → 1º torneio → 1ª partida).</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">↩️ v1.0.58-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(2 de Maio, 2026)</span></div>' +
      '<p><b>Correção do v1.0.57: só labels com 2+ palavras quebram linha.</b> User: <i>"apenas o inscrições abertas, partida casual e novo torneio tem 2 palavras e devem quebrar a linha. os demais não"</i>. Agora detecta espaço no label — se tem espaço (ex: "Inscrições Abertas"), aplica <code>white-space:normal</code>; senão (ex: "Organizados", "Participando", "Favoritos", "Todos"), mantém <code>nowrap</code>. Single-word labels nunca quebram.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">↩️ v1.0.57-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(2 de Maio, 2026)</span></div>' +
      '<p><b>Tentativa #1 de wrap nos pills.</b> Aplicou white-space:normal genérico — corrigido na v1.0.58.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">⚔️ v1.0.56-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(1 de Maio, 2026)</span></div>' +
      '<p><b>Pill Partidas — ordem final.</b> User: <i>"numero total depois do icone e partidas em seguida e depois v/d/%"</i>. Ordem: ⚔️ → <b>3</b> (big) → "Partidas" → "2V · 1D · 67%". Tamanhos preservados, só reordem.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">⚔️ v1.0.55-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(1 de Maio, 2026)</span></div>' +
      '<p><b>Pill Partidas — tentativa #2 de reordenar.</b> Restaurados tamanhos originais que a v1.0.54 tinha quebrado. Ordem definitiva foi pra v1.0.56.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">⚔️ v1.0.54-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(1 de Maio, 2026)</span></div>' +
      '<p><b>Pill "Partidas" reorganizado: label em cima, V/D/% embaixo.</b> Pedido do user: <i>"coloque partidas na linha de cima e as outras infos abaixo (acho que ficará mais bonito)"</i>. Tentativa #1 — corrigida na v1.0.55 (overshooted no tamanho).</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">👴 v1.0.53-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(1 de Maio, 2026)</span></div>' +
      '<p><b>Modal de Termos: grandfather de usuários existentes.</b> User reportou pela 3ª vez: <i>"continua caindo nos termos"</i> — mesmo com o stack de 4 fixes da v1.0.49 + v1.0.52 (lenient version, round-trip verification, defensive re-fetch, 4 sinais aceitos). O bug persistiu porque o problema era na <b>história</b> do user, não no código atual: antes da v1.0.52 o save da terms-acceptance.js podia ser silenciosamente pulado quando Firestore SDK não tava pronto. User clicava Confirmar, modal fechava, mas Firestore nunca recebia. Repetiu N vezes. Doc no banco nunca teve <code>acceptedTerms</code>.</p>' +
      '<p><b>Solução pragmática:</b> se o doc tem evidência de uso passado da app (createdAt, updatedAt, friends, preferredSports, preferredLocations, gender, birthDate, city, phone, theme custom, notifyLevel, plan), o user OBVIAMENTE já passou pelo modal em alguma sessão antiga (impossível ter usado o app sem isso) — apenas o save não persistiu o boolean. Auto-backfill de <code>acceptedTerms: true</code> + marker <code>acceptedTermsGrandfathered: true</code> pra analytics distinguir.</p>' +
      '<p><b>Compliance OK:</b> o user JÁ aceitou os termos em sessão passada (a UX exigia isso pra usar o app); estamos só gravando o registro que devia ter sido gravado. Truly new users (doc inexistente OU doc só com {uid, email, displayName} sem nenhum sinal de uso) ainda passam pelo modal normalmente.</p>' +
      '<p><b>Diagnóstico:</b> <code>[terms-gate v1.0.53] grandfather check — hasUsageEvidence: true|false, fields present: ...</code> no console mostra exatamente quais fields o doc tem e se o grandfather rolou.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">🛡️ v1.0.52-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(1 de Maio, 2026)</span></div>' +
      '<p><b>Modal de Termos não pede mais re-aceite pra usuários cadastrados (fix definitivo).</b> Bug reportado: <i>"continua caindo nos termos quando relogamos usuários cadastrados (via google)"</i> — mesmo após o fix lenient da v1.0.49. Auditei o flow completo e achei <b>3 causas independentes</b> que podiam disparar o modal indevidamente:</p>' +
      '<ol style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li><b>Save silenciosamente pulado:</b> <code>terms-acceptance.js</code> tinha <code>if (FirestoreDB && db) { await save() }</code> SEM else. Quando o SDK do Firestore não estava pronto (race raro de init), o save era pulado mas o modal fechava com <code>resolve(true)</code>. Próximo login, doc no Firestore não tinha <code>acceptedTerms</code> → gate disparava de novo. <b>Fix:</b> exige Firestore disponível, erro explícito com toast se não estiver. Modal fica aberto pra retry em vez de fingir sucesso.</li>' +
        '<li><b>Sem round-trip verification:</b> save aparentemente OK (sem throw) mas Firestore podia ter rejeitado silenciosamente em rules ou perdido pra timeout. <b>Fix:</b> após o <code>set()</code>, lê o doc de volta e valida que <code>acceptedTerms === true</code> realmente persistiu. Se não, throw → toast com mensagem real do Firestore.</li>' +
        '<li><b>Race do <code>loadUserProfile</code>:</b> quando <code>existingProfile</code> volta null (network blip, cache stale), o gate cai pra <code>currentUser</code> que tem só os 4 campos do Firebase Auth (uid/email/displayName/photoURL) — sem <code>acceptedTerms</code>. <b>Fix:</b> defensive re-fetch direto do Firestore ANTES de mostrar modal. Lê o doc uma última vez; se aparecer qualquer sinal de aceitação, atualiza <code>currentUser</code> e pula modal.</li>' +
      '</ol>' +
      '<p><b>Função <code>_needsTermsAcceptance</code> mais leniente:</b> aceita 4 sinais de aceitação prévia em vez de só <code>acceptedTerms === true</code>:</p>' +
      '<ul style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li><code>acceptedTerms === true</code> (canônico)</li>' +
        '<li><code>acceptedTerms</code> truthy (string \'true\', boolean coerced)</li>' +
        '<li><code>acceptedTermsAt</code> presente (timestamp do aceite — evidência forte)</li>' +
        '<li><code>acceptedTermsVersion</code> presente (versão aceita — evidência também)</li>' +
      '</ul>' +
      '<p>Basta 1 dos 4 pra considerar aceito. Se versão salva é explicitamente diferente da atual, ainda re-pede (compliance). Bug do botão Cancelar do modal antigo: erro de save fazia <code>resolve(false)</code> → logout → user perdia estado e tinha que relogar pra ver modal de novo. Agora erro mantém modal aberto pra retry inline. Diagnóstico completo no console: <code>[terms-gate v1.0.52]</code> + <code>[TermsAccept v1.0.52]</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">↩️ v1.0.51-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(1 de Maio, 2026)</span></div>' +
      '<p><b>Revertido o "n-1" da v1.0.50.</b> Pill <code>👥 Usuários</code> volta a mostrar o total absoluto de docs em <code>users</code> (inclui você). A discrepância com a página <i>Pessoas</i> (#explore) é esperada e está explicada — Pessoas filtra o próprio usuário porque você não pode mandar friend request pra si mesmo. Tooltip volta pra "Total de usuários cadastrados no scoreplace".</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">📊 v1.0.44-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(1 de Maio, 2026)</span></div>' +
      '<p><b>Hero box do dashboard ganhou 3 stat pills sociais.</b> Pedido do user: "aqui tudo se refere a torneio. vamos reduzir o tamanho disso para colocar outros boxes aqui com Usuários, Amigos, Partidas V/D/%". Antes: 4-6 pills clicáveis de filtro de torneio (Todos, Organizados, Participando, Inscrições Abertas, ⭐ Favoritos, 🏆 Encerrados). Agora: 2 linhas — primeira com os filtros de torneio (mais compactos), segunda com 3 pills sociais.</p>' +
      '<p><b>Pills compactados</b>: flex base 130→92px, padding 0.9rem→0.55rem, count 1.7rem→1.3rem, label 0.78rem→0.66rem. Cabe 3-4 por linha em mobile e 6-7 em desktop.</p>' +
      '<p><b>3 pills novos:</b></p>' +
      '<ul style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li><b>👥 Usuários</b>: contagem única de participantes (excl. self) nos torneios visíveis. Proxy de "rede no scoreplace" sem precisar query Firestore aggregate. Click → #explore</li>' +
        '<li><b>🤝 Amigos</b>: <code>cu.friends.length</code>. Click → #explore</li>' +
        '<li><b>⚔️ Partidas</b>: total de partidas casuais com vencedor definido (do localStorage <code>scoreplace_casual_history_v2</code>). Tooltip mostra <i>"5V · 3D · 62% aproveitamento"</i>. Click → modal "Estatísticas Detalhadas"</li>' +
      '</ul>' +
      '<p>Ambos os grupos compartilham o mesmo visual base (<code>_fStyle</code> pra filtros, <code>_statPill</code> pra stats sociais — mesma altura/largura/styling, só onclick diferente).</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">📞 v1.0.43-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(1 de Maio, 2026)</span></div>' +
      '<p><b>SMS login: cross-reference por telefone + persiste phone/phoneCountry no perfil + filtro defensivo na saudação.</b> Bug reportado: usuário entrou via SMS e viu saudação "Bem-vindo, +5511997237733!" — o sistema setava <code>displayName</code> = phoneNumber porque Firebase Auth não preenche displayName pra phone users por default. Pior: pedia aceite de termos de novo mesmo o human já tendo aceitado em outra conta (Google).</p>' +
      '<p><b>Fix em 3 camadas:</b></p>' +
      '<ol style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li><b>Cross-reference por phone</b> em <code>handlePhoneVerifyCode</code>: após confirmação do SMS, query <code>users</code> where <code>phone == user.phoneNumber</code> com limit 5. Se achar match com uid diferente (= conta Google/email do mesmo human que já tinha cadastrado o telefone no perfil), herda <code>displayName</code>, <code>photoURL</code> e <code>acceptedTerms</code> pra nova conta SMS. Não funde os Firebase Auth uids (limitação SDK), mas a UX inicial fica coerente.</li>' +
        '<li><b>Persiste phone + phoneCountry no perfil</b> automaticamente. Pedido do user: "quando a pessoa entra com o telefone, já registra o telefone dela no perfil (assim se trocar o nome depois o telefone já fica no perfil)". <code>phone</code> grava o E.164 completo (<code>+5511...</code>); <code>phoneCountry</code> grava o DDI ("55") lido do <code>localStorage.scoreplace_loginPhoneCountry</code> que <code>handlePhoneLogin</code> salva no momento de enviar o SMS.</li>' +
        '<li><b>Filtro defensivo na saudação do dashboard</b>: detecta se <code>displayName</code> parece telefone (regex <code>^\\+?\\d[\\d\\s().-]{5,}$</code>) e cai no fallback <code>guest</code>. Cobre users legados que já tinham phoneNumber salvo como displayName antes desse fix — sem precisar migração de dados.</li>' +
      '</ol>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">🛡️ v1.0.42-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(1 de Maio, 2026)</span></div>' +
      '<p><b>Fix Sentry: defensive null-check pro viewContainer no router.</b> "TypeError: null is not an object (evaluating viewContainer.innerHTML = \'\')" em iOS Chrome Mobile 147 (1 user, 2 ocorrências). Race rara onde #view-container não existia no momento do initRouter. Mudou const → var + re-fetch defensivo no início do handleRoute. Bail silencioso se ainda null.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">🔇 v1.0.40-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(1 de Maio, 2026)</span></div>' +
      '<p>v1.0.40 entry — ver acima.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">⏳ v1.0.41-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(1 de Maio, 2026)</span></div>' +
      '<p><b>Nudge "Complete seu perfil" agora aguarda o profile carregar de verdade antes de aparecer.</b> Bug reportado: ao logar via magic link, dashboard renderiza antes do <code>loadUserProfile</code> async terminar — <code>currentUser</code> tem só os campos do Google login (uid, email, displayName, photoURL), e os campos extras (gender, birthDate, city, preferredSports) chegam depois. Resultado: nudge "Complete seu perfil" aparecia mesmo pra usuários com perfil 100% completo. Pior: clicar Completar → abria o modal com campos vazios → usuário podia preencher e SOBRESCREVER os dados reais ao salvar.</p>' +
      '<p>Fix: <code>_buildProfileNudgeHtml</code> agora suprime o nudge enquanto <code>cu._profileLoaded !== true</code> (flag setada em store.js após <code>loadUserProfile</code> resolver/falhar). O nudge é envolvido num slot <code>#dash-profile-nudge-slot</code> que é re-injetado pelo event listener <code>scoreplace:profile-loaded</code> assim que os dados chegam — então usuários COM campos faltando ainda veem o nudge, só que com 1-2s de delay. Usuários completos não veem nada.</p>' +
      '<p>Modal de perfil em si (acessado pelo avatar do topbar) já fazia <code>await loadUserProfile</code> antes de permitir edição, com banner "Carregando seu perfil…" — então a entrada via nudge era o único path com esse race.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">🔇 v1.0.40-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(1 de Maio, 2026)</span></div>' +
      '<p><b>Fix: erro confuso "Messaging: We are unable to register the default service worker" não aparece mais durante login com magic link.</b> Bug reportado via screenshot: usuário clicou Enviar e viu toast vermelho com erro do Firebase Cloud Messaging — irrelevante pro fluxo de login mas estava sendo surfaced no catch do <code>handleEmailLinkLogin</code>.</p>' +
      '<p>Causa: o Firebase Cloud Messaging tenta registrar <code>/firebase-messaging-sw.js</code> (path default) quando deveria estar usando nosso <code>/sw.js</code>. Provavelmente race condition entre <code>navigator.serviceWorker.ready</code> e a chamada <code>messaging.getToken()</code>. O erro vazava pra cadeia de promises do magic link e era exibido como erro de login.</p>' +
      '<p>Fix: filtrar erros com <code>error.code === \'messaging/...\'</code> ou <code>error.message</code> começando com "Messaging:" no catch do magic link. Quando detectado, mostra um painel otimista "📬 Confira seu e-mail" (porque o magic link provavelmente FOI enviado, só o FCM falhou paralelamente) com botão "Tentar novamente" se não chegar. Erros reais de auth (<code>auth/invalid-email</code>, etc) continuam sendo mostrados normalmente.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">📐 v1.0.39-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(1 de Maio, 2026)</span></div>' +
      '<p><b>Barras de stats percentuais (Aproveitamento, % Saque, etc) agora refletem o valor proporcional 0-100, não max-relative.</b> Bug reportado via screenshot: "essas barras azuis percentuais estão enchendo visualmente a 100%. seria legal que tivessem o tamanho proporcional ao percentual efetivo".</p>' +
      '<p>Causa: <code>_dualBarRow</code> aplicava max-relative scaling pra TODOS os stats (casual / max(casual, torneios)). Pros stats que JÁ são percentuais (0-100), isso fazia 67% pintar a barra inteira de casuais (porque torneios=0 → max=67 → 67/67=100%). Visualmente induzia leitura "domínio total".</p>' +
      '<p>Fix: detecção automática de stat percentual via display string terminando em "%" (Aproveitamento "67%", % Saque "60%", % Recepção "56%", Games Mantidos "67%"). Pra esses, barra usa o próprio valor clamped 0-100 — 67% pinta 67%. Pra stats absolutos sem scale natural (Quebras, Maior Sequência, Tempo Total) mantém max-relative — não há referência 0-100 pra eles.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">🌊 v1.0.38-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(1 de Maio, 2026)</span></div>' +
      '<p><b>Animação das stats: números agora animam de verdade + cascata row-by-row.</b> Dois ajustes acumulados:</p>' +
      '<p><b>1) Safety net pra contadores que ficavam zerados</b> mesmo após v1.0.37 (alguns elementos não disparavam o IntersectionObserver por edge cases de timing/scroll containment do modal). Adicionado <code>setTimeout(triggerAll, 1500)</code> que força animação em qualquer elemento ainda não disparado, idempotente via flag <code>_statAnimated</code>. Threshold do observer também relaxado pra <code>0</code> + rootMargin <code>-5%</code> em vez de <code>-8%</code>.</p>' +
      '<p><b>2) Cascata row-by-row</b> — feedback do user: <i>"delay entre cada linha de estatistica para que não carreguem ao mesmo tempo. conforme está chegando ao final da primeira linha começa a carregar a segunda linha"</i>. Agora cada linha começa <b>180ms</b> depois da anterior. Com a animação durando 800ms, dá overlap perceptível tipo onda visual descendo. Detecção de linhas via <code>getBoundingClientRect</code> Y-position grouping (tolerância 25px) — funciona pra qualquer layout sem precisar marcar HTML.</p>' +
      '<p>Stagger só vale nos primeiros 1.5s — depois disso, qualquer elemento que entre em view via scroll do user anima imediatamente (sem cascata fora de contexto).</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">📊 v1.0.37-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(1 de Maio, 2026)</span></div>' +
      '<p><b>Fix: animação das estatísticas finalmente roda no modal "Estatísticas Detalhadas".</b> Bug reportado: "a animação das estatisticas não funcionou. ficou tudo zerado". Screenshot mostrava 67% Aproveitamento (texto correto) mas Derrotas/Vitórias/Sets/Games/Pontos = 0/0 (zerados).</p>' +
      '<p>Causa: o modal renderiza em DUAS fases — (1) inicial sync com cache local <code>scoreplace_casual_history_v2</code> (geralmente vazio em outros browsers); (2) async <code>loadUserMatchHistory</code> do Firestore substitui <code>slot.innerHTML</code> com os stats reais. Meu <code>_initStatsAnimation(modal)</code> da v1.0.33 rodava SÓ na fase 1 — o IntersectionObserver agarrava elementos zerados e os marcava como "já animados" (unobserve). Depois quando o innerHTML era substituído, os novos elementos com data-stat-bar="33" e data-stat-count="2" ficavam órfãos sem observer attachado, presos no estado inicial "0%" / "0".</p>' +
      '<p>Fix: chamar <code>window._initStatsAnimation(slot)</code> APÓS cada substituição de <code>slot.innerHTML</code> no callback do <code>loadUserMatchHistory.then</code>. Cobre o caminho de sucesso E o catch (fallback pra cache local quando Firestore falha).</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">↶ v1.0.36-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(1 de Maio, 2026)</span></div>' +
      '<p><b>Botão "↶ Desfazer" no header do placar ao vivo — undo global ponto-a-ponto.</b> Cenário reportado: "num jogo 40-40 o ponto vitorioso ser marcado por acidente para o lado errado e atualmente não temos como corrigir". O botão ▼ existente só decrementa o game corrente, não atravessa transições (game/set/match end). O novo undo global resolve isso.</p>' +
      '<p>Implementação via <b>snapshot de estado</b>: cada chamada a <code>_addPoint</code> empilha um snapshot completo (state + matchStartTime + matchEndTime) ANTES de qualquer mutação. Botão "↶ Desfazer" no header pop\'a o último snapshot e restaura tudo — incluindo:</p>' +
      '<ul style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li>Ponto restaurado no game corrente</li>' +
        '<li>Game restaurado se o ponto fechou um game (ex: 40-40 → game point errado)</li>' +
        '<li>Set restaurado se o ponto fechou um set</li>' +
        '<li>Match restaurado se o ponto fechou a partida (volta da finish screen pra UI live)</li>' +
        '<li>pointLog, gameLog, totalGamesPlayed, serveOrder, tiebreak, tieRule — tudo</li>' +
      '</ul>' +
      '<p>Limit: 30 snapshots em memória (~150KB), rolling window. Limpa em reset/restart pra não permitir voltar pra antes do recomeço. Botão visível em todos os contextos (live + finish screen). Sincroniza via Firestore pra casuais multiplayer (device A desfaz → device B vê o estado correto).</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">⏱ v1.0.35-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(1 de Maio, 2026)</span></div>' +
      '<p><b>Timing de pontos no placar ao vivo agora resiste a correções (undo + redo) + filtro de outliers nas stats finais.</b> Cenário reportado: usuário marca 2 pontos pro time errado (15+30), descobre, desfaz os 2, marca 2 pra time certo (15+30). Score corrige perfeitamente, MAS o tempo registrado pra os pontos corretos era o do clique de correção (rápidos consecutivos) → estatística "ponto mais rápido = 0 segundos" no fim. Absurdo.</p>' +
      '<p><b>Fix em 2 camadas:</b></p>' +
      '<p><b>1) Undo agora empilha timestamps (LIFO stack) em vez de single-shot.</b> Antes, só o ÚLTIMO undo guardava o timestamp pro próximo add reaproveitar. Com 2 undos consecutivos, o primeiro era perdido. Agora <code>state._recentUndoStack</code> empilha cada undo com seu timestamp original; cada novo <code>_addPoint</code> pop\'a o mais recente. Funciona pra N undos consecutivos. Janela: stack inteiro descarta se >15s sem novo undo, item individual descarta se >30s desde o ponto original. Cobre o uso típico (correção em ~5-10s) sem contaminar pontos não-relacionados.</p>' +
      '<p><b>2) Filtro de outliers nas estatísticas de tempo.</b> Mesmo que a recuperação de timestamp do undo falhe (correção lenta >15s ou edge case raro), as stats finais não devem mostrar "0 segundos" como ponto mais rápido. Implementado em DUAS calculações de timeStats (inline pós-partida + persistido em Firestore/localStorage):</p>' +
      '<ul style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li><code>avgMs</code> agora usa <b>mediana</b> em vez de média — 1 outlier não puxa a estatística inteira</li>' +
        '<li><code>minMs</code> filtra intervalos absurdamente curtos. Threshold dinâmico: <code>max(2000ms, 30% da mediana)</code>. Pontos legítimos curtos (ace direto = ~3s) passam; cliques de correção (<2s) saem</li>' +
        '<li>Fallback se TODOS os intervalos são suspeitos: cai pro min puro pra não mostrar null. Campo <code>outlierFilteredCount</code> indica quantos foram filtrados (pra debug)</li>' +
      '</ul>' +
      '<p>Resultado: cenário de "ponto mais rápido = 0s" eliminado. Mediana sobrevive a outliers melhor que média. Modal "Estatísticas Detalhadas" do hero box e box de tempo pós-partida ambos protegidos.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">🧹 v1.0.34-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(1 de Maio, 2026)</span></div>' +
      '<p><b>Housekeeping:</b> scheduled function <code>cleanupOldMagicLinks</code> rodando 04:30 BRT — deleta docs em <code>magicLinks/{token}</code> com <code>expiresAt &lt; now</code>. Sem isso a coleção crescia 1 doc por magic link request. CLAUDE.md atualizado com 13 entries do changelog v1.0.20→v1.0.33-beta. Sentry check pós-deploys: 3 issues novas em 24h, todas low-impact (1 user/issue), nenhuma regressão crítica das releases anteriores.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">📊 v1.0.33-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(1 de Maio, 2026)</span></div>' +
      '<p><b>Estatísticas de partida casual + modal de stats reformuladas</b> — 3 bugs/feedbacks endereçados juntos:</p>' +
      '<p><b>1) Bug "soma não dava 100%"</b>: percentuais complementares (ex: derrotas vs vitórias do mesmo total) podiam somar 101% por causa de <code>Math.round</code> independente em cada lado. Quando ambos eram N.5, ambos arredondavam pra cima. Fix: calcula um lado com <code>Math.round</code> e o outro como <code>(100 - lado1)</code>. Garante <b>sempre sum=100</b>, em <code>_diffBarRow</code> (modal) e <code>_compareBar</code> (final de partida).</p>' +
      '<p><b>2) Barras agora são proporcionais (share-of-total) em vez de max-relative</b>: feedback do user — <i>"as barras coloridas de todas as estatisticas percentuais tivessem o tamanho relativo (barra cheia em 100% e vazia em 0% e do tamanho proporcional em qualquer valor entre cheia e vazia)"</i>. Antes: o lado maior sempre enchia a barra inteira (max-relative), dando impressão de domínio total quando era ratio normal. Agora: cada lado mostra sua fração do total. 5 vs 3 → barras de 62,5% e 37,5% (somam 100), em vez de 100% e 60%. Para stats que JÁ são percentuais independentes (ex: "% Pontos no Saque" do time A vs time B), barra reflete o valor direto (80% do A + 70% do B = 150% somados, semanticamente correto porque são taxas separadas, não fatias do mesmo bolo).</p>' +
      '<p><b>3) Animação on-scroll</b>: barras crescem de 0% até o valor final + contadores numéricos sobem de 0 até o número final, conforme cada elemento entra na viewport durante o scroll. <b>Performance: zero impacto perceptível</b> — usa <code>IntersectionObserver</code> nativo (browser-otimizado, async), animação de barra via CSS <code>transition</code> (GPU-accelerated, 0.8s cubic-bezier 0.2,0.8,0.2,1), e contagem via <code>requestAnimationFrame</code> com easing cubic-out. Cada elemento anima UMA VEZ (unobserve após disparar) — sem re-trigger ao scroll de volta. Helper canônico <code>window._initStatsAnimation(rootEl)</code> em store.js.</p>' +
      '<p style="font-size:0.78rem;color:var(--text-muted);">Fallback gracioso pra browsers sem IntersectionObserver: seta valores finais imediatamente sem animação. Atributos: <code>data-stat-bar="N"</code> nas barras, <code>data-stat-count="N" data-stat-count-suffix="%"</code> nos contadores.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">🎾 v1.0.32-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(30 de Abril, 2026)</span></div>' +
      '<p><b>Boot loader com 🎾 quicando — splash screen branded enquanto Firebase + auth resolvem.</b> Item velho da minha TODO interna que ainda não tinha materializado. Especialmente útil pra usuário logado: a landing prerender aparece um instante antes do router redirecionar pra dashboard, gerando flash visual ("piscou landing antes do meu app"). Loader cobre essa transição com identidade visual (pódio âmbar do scoreplace).</p>' +
      '<p>Implementação: HTML+CSS+JS inline em <code>&lt;body&gt;</code> antes de qualquer outro elemento — renderiza IMEDIATAMENTE no parse, sem esperar nenhum asset externo. Tennis ball quica via <code>@keyframes scoreplace-bounce</code> (translateY -14px, scale 1.06, alternate). Brand "scoreplace.app" em âmbar abaixo. Auto-hide com 3 mecanismos:</p>' +
      '<ul style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li><b>Polling rápido</b> (80ms): detecta quando <code>window.AppStore</code> existe E view-container tem conteúdo → fade out</li>' +
        '<li><b>Router signal</b>: <code>initRouter()</code> chama <code>window._hideBootLoader()</code> 150ms após primeiro <code>handleRoute()</code></li>' +
        '<li><b>Hard timeout 3s</b>: garantia que loader nunca trava o app mesmo se algo der errado</li>' +
      '</ul>' +
      '<p>Respeita <code>prefers-reduced-motion</code> — usuários com motion sensitivity veem 🎾 estático sem animação.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">🎯 v1.0.31-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(30 de Abril, 2026)</span></div>' +
      '<p><b>Volta o comportamento da v1.0.27: DDI 🇧🇷 +55 só aparece quando o usuário começa a digitar telefone.</b> User clarificou: "ja aparecer direto a bandeira e o +55 induz o usuário a achar que apenas um telefone pode ser colocado ali no campo (quando um email tambem é permitido)". Razão totalmente válida — sinalização visual de bandeira/DDI sugere "telefone-only", quando na real o campo é dual (email OU telefone).</p>' +
      '<p>Estado inicial agora é neutro: input + botão Enviar (2 colunas grid). Helper text default: <i>"Aceita e-mail (recebe link mágico) ou celular com DDD (recebe SMS com código). Pra celular, o seletor de país aparece automaticamente — padrão 🇧🇷 +55"</i>. Quando usuário começa a digitar dígitos (≥8), <code>_detectLoginInputMode</code> dispara: DDI aparece à esquerda, grid vira <code>auto 1fr auto</code>, e helper text atualiza pra mostrar o número que vai ser enviado.</p>' +
      '<p>Combinação dos dois feedbacks resolvida: (a) <b>"telefone sem ddi?"</b> da v1.0.28 — DDI aparece assim que phone é detectado, e helper text neutro inicial menciona explicitamente que +55 é o padrão; (b) <b>"induz a achar que é só pra telefone"</b> da v1.0.31 — campo neutro inicial deixa claro que email é igualmente válido.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #ef4444;border-radius:12px;padding:14px 16px;background:rgba(239,68,68,0.10);">' +
      '<div style="font-weight:800; color:#f87171; font-size:1rem; margin-bottom:8px;">🛡️ v1.0.30-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(30 de Abril, 2026)</span></div>' +
      '<p><b>Magic link "expirado" antes do clique foi resolvido — wrapper URL impede prefetch consumir oobCode.</b> Bug crítico reportado por múltiplos beta testers: "entrou mas deu link expirado pelo magic link". Causa: email scanners anti-phishing (Gmail/Outlook/corporate security) prefetcham TODOS os links de email pra checar conteúdo. O Firebase oobCode é <b>one-time-use</b> — quem chega antes consome, e o humano vê "expirado".</p>' +
      '<p><b>Solução em 3 camadas:</b></p>' +
      '<ol style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li>Cloud Function <code>sendMagicLink</code> agora gera token random de 24 chars (base64url) e salva o firebaseLink real em <code>magicLinks/{token}</code> no Firestore. Email aponta pra <code>https://scoreplace.app/?ml=TOKEN</code> em vez do firebaseLink direto.</li>' +
        '<li>Quando usuário clica no email, abre nossa wrapper URL — JS detecta <code>?ml=TOKEN</code>, busca o doc no Firestore, redireciona browser pro firebaseLink real. Loading screen "🎾 Entrando no scoreplace.app..." enquanto resolve.</li>' +
        '<li>Scanners fazem GET/HEAD na wrapper URL — não executam JS, então NUNCA alcançam o oobCode. Só o browser real do humano dispara o redirect e consome o oobCode na hora certa.</li>' +
      '</ol>' +
      '<p>Estados de erro tratados: token não existe (clique muito antigo), firebaseLink corrompido, sem conexão. Cada um mostra mensagem clara + botão "Voltar e pedir novo link". Email armazenado no localStorage automaticamente pra <code>signInWithEmailLink</code> não pedir confirmação.</p>' +
      '<p style="font-size:0.78rem;color:var(--text-muted);"><b>Firestore rules</b>: nova regra <code>match /magicLinks/{token}</code> permite leitura pública (token de 24 chars já é o segredo) e bloqueia escrita (só Admin SDK escreve via Cloud Function).</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">📨 v1.0.29-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(30 de Abril, 2026)</span></div>' +
      '<p><b>Email do magic link reorganizado: CTA acima de tudo.</b> Pedido do user: "no email do magic link coloque o botao de entrar acima de tudo só com a frase clico no botao para entrar acima dele". Antes o botão tava embaixo de uma chamada e um parágrafo explicativo — usuário tinha que ler antes de clicar. Agora estrutura nova:</p>' +
      '<ol style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li>Header compacto (🎾 + scoreplace.app)</li>' +
        '<li><b>"Clique no botão para entrar:"</b> (frase única, centrada)</li>' +
        '<li><b>BOTÃO GRANDE âmbar</b> — primeira coisa visível depois do header</li>' +
        '<li>Detalhes secundários (expira em 1h, link de fallback, "não foi você?") — embaixo, em cinza claro</li>' +
        '<li>Footer minimal</li>' +
      '</ol>' +
      '<p>Quem só quer entrar não precisa ler nada — vê o botão e clica. Quem tem dúvida ou problema técnico encontra a explicação abaixo.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">🇧🇷 v1.0.28-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(30 de Abril, 2026)</span></div>' +
      '<p><b>DDI 🇧🇷 +55 sempre visível no login — fim da ambiguidade "telefone sem DDI?".</b> User perguntou olhando o input vazio: "é isso mesmo? telefone sem ddi?". Pergunta legítima — mesmo o sistema aplicando +55 default por trás, sem feedback visual o usuário não sabe se precisa digitar +55 manualmente. Antes da v1.0.28, o seletor de DDI só aparecia depois que o usuário começava a digitar dígitos.</p>' +
      '<p>Agora: layout sempre 3 colunas (DDI compacto + input + botão Enviar). Pra digitar email, o DDI fica lá quietinho mas presente — não atrapalha. Pra digitar telefone, fica óbvio que +55 é o padrão e dá pra trocar pra outro país no seletor. Helper text também atualizado: "Celular: SMS com código — só DDD + número (o +DDI vem do seletor à esquerda)". Placeholder do input mudou de <code>(11) 99999-8888</code> pra <code>11 99999-8888</code> — sem parênteses (mais limpo, e DDD 11 já é hint suficiente).</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">🔲 v1.0.27-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(30 de Abril, 2026)</span></div>' +
      '<p><b>Botão "Enviar" do login finalmente compacto — fix v1.0.26-beta não tinha funcionado.</b> User mandou screenshot novo: "sério?". Botão ainda ocupando ~85% da linha. Causa-raiz que escapou na v1.0.26: a class <code>.form-control</code> no input força <code>width: 100%</code>, e em flex container isso colide com <code>flex:1 1 0</code> de uma forma que browsers (especialmente Safari mobile) calculam diferente do esperado.</p>' +
      '<p>Fix definitivo: <b>migrei o layout de flex pra CSS Grid</b> com <code>grid-template-columns: 1fr auto</code>. Grid é determinístico — input pega TODO o espaço da coluna 1fr, botão fica do tamanho do conteúdo (auto) na coluna 2. Quando DDI fica visível (modo phone), JS troca pra <code>auto 1fr auto</code> (3 colunas). Mesma correção aplicada ao step de SMS code (input do código + botão Verificar).</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">⚖️ v1.0.26-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(30 de Abril, 2026)</span></div>' +
      '<p><b>Botão "Enviar" do login não rouba mais espaço do input + dicas demoram mais pra aparecer.</b> Dois feedbacks consolidados:</p>' +
      '<p><b>1) Login modal — flex layout corrigido</b>: screenshot do user mostrava botão "Enviar" ocupando ~70% da largura, deixando o input com espaço miserável pro placeholder de 35 chars (<code>seu@email.com  ou  (11) 99999-8888</code>). Causa: input tinha <code>flex:1</code> mas botão sem flex explícito caía em <code>flex:0 1 auto</code> + texto curto resultando em distribuição esquisita. Fix: <code>input flex:1 1 0</code> (domina), <code>button flex:0 0 auto</code> (mínimo necessário). Padding e font-size do botão também reduzidos pra ele ficar discreto. Mesma correção aplicada ao botão "Verificar" do step de SMS code.</p>' +
      '<p><b>2) Hints (dicas contextuais) com timing dobrado</b>: feedback do user — "estão aborrecendo as pessoas aparecendo muito cedo". Dobrei: <code>IDLE_TIMEOUT</code> 6s→12s (inatividade antes da dica aparecer), <code>HINT_COOLDOWN</code> 5s→10s (gap entre dicas), e o setTimeout do init 2s→4s (sistema só ativa 4s depois da página carregar). <code>HINT_DISPLAY_TIME</code> mantido em 10s — o que incomodava era a aparição precoce, não a duração visível.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">📲 v1.0.25-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(30 de Abril, 2026)</span></div>' +
      '<p><b>2 ajustes pedidos pelo user em sequência:</b></p>' +
      '<p><b>1) Seção "Instalar o app na tela inicial" agora é a primeira do manual</b> e abre expandida por default. Pedido: "coloque isso bem no começo do manual". Beta testers reclamavam "cadê o ícone? qual o nome do app?" então a primeira coisa que aparece quando alguém abre o Help (?) tem que ser o passo-a-passo de fixar o app. Ordem nova: <b>Instalar (auto-aberta)</b> → Sobre → Primeiros Passos → Dashboard → ...</p>' +
      '<p><b>2) Botão "Entrar no scoreplace.app" da landing page com 95% de largura centralizado + altura/fonte fluidas via <code>clamp()</code></b>. Pedido em duas etapas: primeiro "faça com que ele tenha a largura total e altura compativel de acordo com a tela", depois "95% da largura centralizado é melhor" (sim — 100% encostava nas bordas no desktop, 95% com <code>margin:auto</code> dá respiro). <code>font-size: clamp(1.05rem, 1.4vw + 0.85rem, 1.55rem)</code> escala 1.05rem em mobile pequeno até 1.55rem em desktop largo; <code>padding</code> também escala (14px→26px vertical, 16px→48px horizontal). <code>max-width: 760px</code> previne que vire faixa em monitor ultrawide. Box-shadow esmeralda adicionado pra reforçar destaque.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">📲 v1.0.24-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(30 de Abril, 2026)</span></div>' +
      '<p><b>Manual ganhou seção dedicada "Instalar o app na tela inicial".</b> Feedback: beta testers reclamaram "cadê o ícone? qual o nome do app?" — o scoreplace.app é PWA mas sem caminho explicado, ninguém sabe instalar. Agora o manual tem passo-a-passo pra 3 cenários distintos:</p>' +
      '<ul style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li><b>iPhone/iPad — Safari</b>: Compartilhar → Adicionar à Tela de Início, com nota explícita "iOS 17+ tem barra compacta, ícone está nos •••". Aviso forte: <b>Chrome no iPhone não consegue instalar PWA</b> (limitação Apple) — usuário precisa usar Safari.</li>' +
        '<li><b>Android — Chrome</b>: banner automático ou ⋮ → "Instalar app".</li>' +
        '<li><b>Computador — Chrome/Edge/Brave</b>: ícone ➕ na barra de URL ou ⋮ → "Instalar scoreplace.app". Bonus: Safari Mac (Sonoma+) via Arquivo → "Adicionar ao Dock".</li>' +
      '</ul>' +
      '<p>Também explica os 5 benefícios concretos (ícone, tela cheia, push notif mais confiável no iOS, offline, abre rápido) — vence a friction da pergunta "por que vale a pena instalar".</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">🅰️ v1.0.23-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(30 de Abril, 2026)</span></div>' +
      '<p><b>Avatares cartoon foram pra rua — agora são iniciais do nome.</b> Feedback direto do user: "esses ícones são ridículos. vamos usar as iniciais dos nomes invés dessa porcaria". O picker de 10 cartoons (notionists do dicebear) sumiu. O avatar do perfil agora é gerado automaticamente das iniciais do <code>displayName</code> via dicebear /initials, num círculo índigo limpo. Foto real do Google/Apple é preservada quando existe (login social).</p>' +
      '<p>Dois bonus: (1) avatar atualiza em tempo real enquanto o usuário digita o nome no input — feedback visual imediato; (2) o pencil/edit overlay também sumiu (não há nada pra editar). Helper canônico <code>window._profileAvatarUrl(name, photoURL, size)</code> centraliza a lógica em store.js: foto real wins, fallback gera iniciais. URLs antigas de cartoons que possam estar gravadas em Firestore são detectadas e re-derivadas pra iniciais.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">🔀 v1.0.22-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(30 de Abril, 2026)</span></div>' +
      '<p><b>Login com 1 clique unificado: 1 campo, 1 botão pra email-mágico OU SMS.</b> Bug reportado: beta testers confundiam os 2 campos separados (email + SMS), cada um com seu "Enviar". Pior: botão verde do SMS ficava mais destacado que o transparente do magic link, induzindo a escolha errada. Agora um único input com detecção automática:</p>' +
      '<ul style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li>Tem <code>@</code> → enviamos <b>link mágico por email</b></li>' +
        '<li>8-15 dígitos → enviamos <b>código por SMS</b> (DDI dropdown 🇧🇷+55 aparece automaticamente; pra outro país escolha no select)</li>' +
        '<li>Helper text dinâmico explica formato esperado: <code>+DDI DDD número</code> (ex: <code>+55 11 99999-8888</code>)</li>' +
      '</ul>' +
      '<p>Implementação delega pros handlers existentes (<code>handleEmailLinkLogin</code>, <code>handlePhoneLogin</code>) via hidden inputs — zero refator de lógica de auth, só refator de UX.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">✉️ v1.0.21-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(30 de Abril, 2026)</span></div>' +
      '<p><b>Email do magic link mais limpo + painel "verifique seu email" com sender correto.</b> Feedback do user: o header do email da v1.0.20-beta com gradient âmbar (pódio + scoreplace.app + tagline) parecia outro botão competindo com o CTA real. Agora só o botão tem destaque colorido — header passa a ser sutil (texto âmbar pequeno em fundo escuro, sem gradient), branding inalterado mas visualmente subordinado.</p>' +
      '<p>Bonus fix: o painel "📬 Link enviado!" do modal de login dizia que o sender era <code>noreply@scoreplace-app.firebaseapp.com</code> (correto pra v1.0.14-beta antes do switch pra Cloud Function). Como v1.0.20-beta passou a enviar via <code>firestore-send-email</code> extension com SMTP do Gmail, o sender real é <code>scoreplace.app@gmail.com</code> — corrigido pro user fazer whitelist no endereço certo.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">📨 v1.0.20-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(30 de Abril, 2026)</span></div>' +
      '<p><b>Magic link agora segue o padrão dos emails de notificação</b> — sender scoreplace.app + botão grande âmbar estilizado + branding completo. Bug reportado: "magic link continua indo pra spam e sem destaque num botão de link". Insight do user: emails de notificação do app já são bem estilizados, magic link era o único usando sender feio do Firebase default.</p>' +
      '<p>Implementação em 3 partes: (1) Cloud Function <code>sendMagicLink</code> que gera o link assinado via Admin SDK <code>generateSignInWithEmailLink()</code>; (2) HTML rico enfileirado em <code>mail/</code> collection — extension <code>firestore-send-email</code> envia via SMTP custom; (3) frontend troca <code>firebase.auth().sendSignInLinkToEmail()</code> por <code>httpsCallable(\'sendMagicLink\')()</code>. Email final: header com pódio âmbar + título "Entrar com 1 clique" + botão grande "🎾 Entrar no scoreplace.app" com gradient âmbar e drop shadow + fallback link em texto pra clientes que não renderizam botão.</p>' +
      '<p><b>Deploy adicional necessário:</b> <code>firebase deploy --only functions:sendMagicLink</code> (a função vive em <code>functions/index.js</code>; sem deploy ela ainda não responde, e o frontend cai no erro). Frontend pode ser deployado normalmente via git push, mas o magic link só funciona depois do deploy da função.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #ef4444;border-radius:12px;padding:14px 16px;background:rgba(239,68,68,0.10);">' +
      '<div style="font-weight:800; color:#f87171; font-size:1rem; margin-bottom:8px;">🔌 v1.0.19-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(30 de Abril, 2026)</span></div>' +
      '<p><b>Erro de criar conta / login email-senha agora explica o que tentar.</b> Bug reportado: beta tester travada com <code>auth/network-request-failed</code> ao criar conta — mensagem genérica do Firebase sem indicação de fallback. Mesma falta de UX do Google login (v1.0.13) e SMS (v1.0.17), agora cobre email-senha:</p>' +
      '<ul style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li><code>auth/network-request-failed</code> → "Trocar Wi-Fi ↔ 4G/5G, desabilitar VPN/ad-blocker, ou usar Link Mágico (não precisa senha)"</li>' +
        '<li>outros códigos → mensagem específica + sugestão Link Mágico no rodapé</li>' +
      '</ul>' +
      '<p>Sentry continua capturando via <code>_captureException(area=\'emailLogin\'/\'emailRegister\', code)</code> pra investigação retroativa.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">📊 v1.0.18-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(30 de Abril, 2026)</span></div>' +
      '<p><b>Gráfico "Movimento" agora segue o dia do plano focado.</b> Bug reportado: ao planejar ida pra amanhã, o gráfico de barras por hora não aparecia. Causa: <code>_hydrateAllPreferredMovement</code> usava sempre <code>dayKey(today)</code>, então plano-de-amanhã não tinha presenças hoje → <code>hasActivity=false</code> → bail silencioso. Agora o card focado (<code>state.focusedPreferred</code>) usa o <code>dayKey</code> da data de <code>startsAt</code> do plano. Cards não-focados continuam usando today (mais relevante pra browse). Header passa a "Movimento amanhã" / "Movimento em N dias" baseado em dia do plano vs hoje.</p>' +
      '<p><b>Sugestões do Google de volta em #place</b>. Bug reportado: quando havia PLANO ATIVO, seção "Sugestões do Google" sumia (até em São Paulo onde tem dezenas de venues). Causa-raiz: v1.0.15-beta trocou <code>locationBias</code> por <code>locationRestriction</code> achando que ambos aceitavam Circle. Mas no JS SDK do <code>Place.searchByText</code> (Places API New), <code>locationRestriction</code> SÓ aceita Bounds (rectangle); Circle silenciosamente quebra a query → 0 results. Voltei pra <code>locationBias</code> (que aceita Circle). A defesa contra "leaks geográficos" (ex: Brasil aparecendo pra Paris) agora vem do <b>filtro haversine client-side</b> que já estava em vigor desde v1.0.15 — Paris continua só vendo Paris.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.10);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🔑 v1.0.17-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(30 de Abril, 2026)</span></div>' +
      '<p><b>Magic link não pede digitar email novamente.</b> Bug reportado: usuária clicava no link recebido no celular mas o app pedia confirmar email — fricção desnecessária. Causa: <code>localStorage.scoreplace_emailForSignIn</code> só persiste no MESMO browser que pediu o link; cross-device (pediu desktop, abriu no celular) cai no <code>window.prompt()</code>. Fix: <code>actionCodeSettings.url</code> agora inclui <code>?eml=&lt;email&gt;</code> codificado. Em <code>_completeEmailLinkSignIn</code>, fallback chain: localStorage → URL param → prompt. Funciona cross-device sem fricção.</p>' +
      '<p><b>Landing CTA: texto trocado.</b> Era "Crie seu torneio grátis" — gerava dúvida sobre o que o botão fazia (cadastro? login? criar?). Agora "Entrar no scoreplace.app" — claro e direto. Em inglês: "Sign in to scoreplace.app".</p>' +
      '<p><b>SMS login: mensagens de erro específicas com código.</b> Bug reportado: "SMS não mandou pra ninguém". Sem error.code visível, impossível diagnosticar. Agora cada caso tem mensagem específica: <code>operation-not-allowed</code> (provider não habilitado no Firebase), <code>too-many-requests</code> (cota), <code>quota-exceeded</code> (free tier), <code>captcha-check-failed</code>, <code>invalid-phone-number</code>, etc. Todas sugerem fallback "Use Link Mágico por E-mail". Sentry continua capturando pra investigação retroativa.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #8b5cf6;border-radius:12px;padding:14px 16px;background:rgba(139,92,246,0.10);">' +
      '<div style="font-weight:800; color:#a78bfa; font-size:1rem; margin-bottom:8px;">🪪 v1.0.16-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(30 de Abril, 2026)</span></div>' +
      '<p><b>Mudança de nome no perfil propaga imediatamente em toda a UI</b>. Bug reportado: usuário mudou de "topi3838" pra "Toninho" no perfil, welcome card mostrava "Bem-vindo, Toninho!" mas o topbar (canto superior direito) continuava com "topi3838". Causa-raiz: o nome no topbar vinha de <code>firebase.auth().currentUser.displayName</code> (Firebase Auth, sincronizado com Google OAuth no primeiro login) enquanto o welcome card vinha de <code>AppStore.currentUser.displayName</code> (merged do Firestore). Quando <code>simulateLoginSuccess</code> re-rodava (token refresh, onAuthStateChanged), passava o user do Firebase Auth com nome STALE, revertendo o topbar.</p>' +
      '<p>Fix em 2 camadas: (1) <code>saveUserProfile</code> agora chama <code>firebase.auth().currentUser.updateProfile({displayName, photoURL})</code> após salvar no Firestore — sincroniza Firebase Auth com Firestore como single source of truth. (2) <code>_updateTopbarForUser</code> defensivo: se uid bate, prefere <code>AppStore.currentUser.displayName</code> sobre o user passado como parâmetro. Belt-and-suspenders pra caso (1) falhe.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #06b6d4;border-radius:12px;padding:14px 16px;background:rgba(6,182,212,0.10);">' +
      '<div style="font-weight:800; color:#22d3ee; font-size:1rem; margin-bottom:8px;">🌍 v1.0.15-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(30 de Abril, 2026)</span></div>' +
      '<p><b>Sugestões do Google estritamente dentro do raio.</b> Bug reportado: usuária em Paris recebia quadras a 7000km+ no Brasil. Causa-raiz tripla na chamada <code>Place.searchByText</code>: (1) <code>region: "br"</code> hardcoded biaseava ALL searches pra Brasil; (2) <code>locationBias</code> é SOFT — Google retorna venues fora se forem populares globalmente; (3) <code>language: "pt-BR"</code> favorecia results em português. Fix: trocado pra <code>locationRestriction</code> (Circle, HARD), removidos hardcoded region/language. Defesa-em-camada client-side: <code>haversineKm</code> filtra qualquer leak >raioKm.</p>' +
      '<p><b>Convite de amizade não aparece mais duplicado em "Convites Pendentes".</b> Bug reportado: convidei amigo, aparece 2 cards iguais. Causa: destinatário tinha 2 user docs no Firestore (legacy email-keyed pré-migração + atual uid-keyed). Ambos os ids ficavam em <code>friendRequestsSent</code>, cada um carregava profile separado. Fix em <code>_renderSentRequests</code>: agrupa profiles por email, escolhe o doc cujo id NÃO parece email (uid real). Botão ✕ chama novo <code>_cancelFriendRequestMulti</code> que cancela todos os uids do grupo de uma vez. Bonus: dedup defensivo em <code>_sendFriendRequest</code> pra prevenir push duplicado em double-tap rápido.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.10);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">📬 v1.0.14-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(30 de Abril, 2026)</span></div>' +
      '<p><b>Magic link: painel persistente "verifique seu spam".</b> Bug reportado: usuário recebeu o link mas foi pra spam, e a toast efêmera com "(e spam)" sumiu rápido demais. Agora, após enviar o link, o modal-login é substituído por um painel persistente com ícone 📬, mensagem "Link enviado!", o e-mail do destinatário em destaque, um aviso âmbar grande "<b>⚠️ Não chegou? Cheque o spam</b>" + indicação do remetente <code>noreply@scoreplace-app.firebaseapp.com</code> pra adicionar aos contatos. Painel fica até o usuário fechar manualmente. Botões: Fechar / Reenviar.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f97316;border-radius:12px;padding:14px 16px;background:rgba(249,115,22,0.10);">' +
      '<div style="font-weight:800; color:#fb923c; font-size:1rem; margin-bottom:8px;">🌍 v1.0.13-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(30 de Abril, 2026)</span></div>' +
      '<p><b>Erro do login Google agora mostra código + sugestão específica de workaround.</b> Antes era sempre "Não foi possível realizar o login com Google" sem indicar o problema. Bug reportado: usuária em Paris recebeu erro genérico, sem direção do que tentar. Mensagens novas:</p>' +
      '<ul style="margin:0 0 0 1.2rem; padding:0; font-size:0.82rem;">' +
        '<li><code>auth/network-request-failed</code> → "Sem conexão estável com Google. Tente Wi-Fi ou outra rede."</li>' +
        '<li><code>auth/too-many-requests</code> → "Muitas tentativas. Aguarde alguns minutos."</li>' +
        '<li><code>auth/internal-error</code> → "Erro interno do Firebase. Tente novamente em instantes."</li>' +
        '<li><code>auth/unauthorized-domain</code> → "Reporte: scoreplace.app@gmail.com"</li>' +
        '<li><code>auth/user-disabled</code> → "Conta desativada. Contate suporte."</li>' +
        '<li><code>auth/operation-not-allowed</code> → "Login Google indisponível no momento."</li>' +
        '<li>outro → mensagem genérica + código pra debug</li>' +
      '</ul>' +
      '<p>Todas as mensagens incluem fallback "Use SMS ou Link Mágico abaixo" — usuário com Google bloqueado não fica sem caminho. Sentry continua capturando o erro com contexto pra investigação retroativa.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #ef4444;border-radius:12px;padding:14px 16px;background:rgba(239,68,68,0.10);">' +
      '<div style="font-weight:800; color:#ef4444; font-size:1rem; margin-bottom:8px;">🔐 v1.0.12-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(30 de Abril, 2026)</span></div>' +
      '<p><b>3 bugs de login conectados, 1 fix consolidado</b>:</p>' +
      '<p>(1) <b>Termos pedidos a cada novo login mesmo de usuário cadastrado</b>: terms-gate em simulateLoginSuccess agora usa <code>existingProfile</code> (retorno raw do <code>firebase-db.loadUserProfile</code>) PRIMEIRO em vez de <code>currentUser</code>. Causa-raiz: race entre o merge em <code>store.js.loadUserProfile</code> e a checagem — se o merge não tinha completado, <code>currentUser.acceptedTerms</code> ficava undefined apesar do Firestore ter <code>true</code>. Fallback pra currentUser caso existingProfile seja null. Diagnóstico completo via <code>console.log</code> com versão pra cada checagem (<code>existingProfile_*</code>, <code>currentUser_*</code>, <code>needsAcceptance</code>).</p>' +
      '<p>(2) <b>Modal de login não some após Google login (Safari)</b>: simulateLoginSuccess agora usa <code>_forceCloseLoginModal()</code> (mais agressivo: classList.remove + style.display=none por 50ms + revert) em vez de só <code>classList.remove(\'active\')</code> no fim do flow.</p>' +
      '<p>(3) <b>Tela de login volta toda vez que salva o perfil</b>: provável consequência do (2) — modal-login fica com <code>.active</code> escondido atrás do modal-profile, fica visível quando profile fecha. Adicionada chamada defensiva <code>_forceCloseLoginModal()</code> em <code>saveUserProfile</code> logo depois do close do profile, pra garantir que mesmo se (2) regredir, (3) não recorre.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #6366f1;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.12);">' +
      '<div style="font-weight:800; color:#a5b4fc; font-size:1rem; margin-bottom:8px;">📡 v1.0.11-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(30 de Abril, 2026)</span></div>' +
      '<p><b>Raio de busca em #place agora default 25km</b> (era 10km) — cobre cidades metropolitanas brasileiras tipicas. Bug reportado: usuário cadastrou venue novo, voltou pro #place, não viu o card aparecer. Causa: filtro de distância 10km excluía o venue (provavelmente noutra parte da cidade). Ajuste manual do raio é preservado em <code>localStorage.scoreplace_venues_filters</code>.</p>' +
      '<p><b>Empty state da seção "Outros locais" com diagnóstico inteligente</b>. Quando a seção fica vazia, agora diferencia 2 casos: (a) <i>tem N venues cadastrados fora do raio atual</i> → mostra contador + botão "📡 Expandir pra 50km" que dobra o raio e re-filtra (sem reload); (b) <i>nenhum venue na região</i> → mantém CTA "+ Cadastrar local". Resolve a confusão "cadastrei mas não aparece".</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #a5b4fc;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.10);">' +
      '<div style="font-weight:800; color:#a5b4fc; font-size:1rem; margin-bottom:8px;">🏢 v1.0.10-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(30 de Abril, 2026)</span></div>' +
      '<p><b>Seção "🏢 Outros locais no scoreplace" sempre visível em #place.</b> Antes a seção tinha early-exit quando <code>spResults.length === 0</code> — usuário com PLANO ATIVO ativo via gap direto pra "📍 Sugestões do Google", sem entender se o app tinha banco próprio de venues. Agora o header sempre aparece. Quando vazio, mostra empty state explicando + CTA "+ Cadastrar local" linkando direto pra <code>#my-venues</code>. Resolve a fricção reportada: "deveria aparecer os locais cadastrados entre o plano ativo e os locais do google".</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.12);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">🎾 v1.0.9-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(30 de Abril, 2026)</span></div>' +
      '<p><b>CTA "Cadastrar quadras" inline no gráfico de movimento.</b> Quando o gráfico está em escala estimada (local sem <code>courts[]</code> cadastrados), agora aparece um aviso âmbar abaixo das barras: <i>"⚠️ Escala estimada — local sem quadras cadastradas. [🎾 Cadastrar quadras →]"</i>. Clique direciona pra <code>#my-venues</code> com nome/lat/lon do venue pré-stashed via <code>sessionStorage</code> (mesmo padrão do <code>_venuesRegisterPlace</code>). Resolve a fricção reportada: usuário via dado errado mas não tinha caminho visível pra cadastrar — só via "+ Cadastrar local" lá embaixo de #place ou hash direto. Pra preferreds com synthetic pid (<code>pref_lat_lng</code>), extrai lat/lon do próprio pid pra pré-popular.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.08);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">v1.0.8-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(30 de Abril, 2026)</span></div>' +
      '<p><b>Gráfico de movimento "Movimento hoje" não enche barra inteira com 1 pessoa.</b> Bug reportado: 1 pessoa em local sem quadras cadastradas (ou com placeId synthetic não-Google) renderizava barra de 100% — visualmente "lotado" quando deveria parecer "vazio". A v0.16.49 introduziu escala absoluta por capacidade do venue (<code>sum(courts.count) × 4</code>) mas o fallback (quando capacity=0) era max-bucket-relative — 1 pessoa = max = 100%. Agora fallback usa <b>baseline mínimo de 16</b> (4 quadras × 4 jogadores, venue pequeno típico): 1 pessoa ≈ 6% bar. Quando há pico maior que o baseline, expande pra acomodar — pico fica em 100%, demais escalonam proporcional. Tooltip da barra mostra "(escala estimada — local sem quadras cadastradas)" pra ser transparente sobre o estimativa.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.08);">' +
      '<div style="font-weight:800; color:#f59e0b; font-size:1rem; margin-bottom:8px;">🎯 v1.0.7-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(30 de Abril, 2026)</span></div>' +
      '<p><b>Profile completion nudge mais convidativo na dashboard.</b> Antes só aparecia pra quem já tinha torneios e checava 2 campos (cidade, modalidades). Agora aparece pra todos os logged-in users e cobre os <b>4 campos críticos</b>: <i>sexo, data de nascimento, cidade, modalidades</i>. Sexo e nascimento permitem auto-categorização ao se inscrever em torneios (ex: torneios femininos ou por faixa etária). Banner ganhou: ícone 🎯, mensagem com tempo estimado ("em ~30s"), <b>contador de progresso</b> ("3 de 4 campos") e <b>barra visual</b> com gradient âmbar mostrando quanto falta. Botão CTA mais firme ("Completar →"). Continua dismissível por sessão; reaparece se ainda há campos faltando no próximo login. Sobre soak automático do Google: deferido pra v2 — exige Verificação formal Google (4-6 semanas) pros scopes restritos <code>user.gender.read</code>, <code>user.birthday.read</code>, <code>user.addresses.read</code>.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #06b6d4;border-radius:12px;padding:14px 16px;background:rgba(6,182,212,0.08);">' +
      '<div style="font-weight:800; color:#06b6d4; font-size:1rem; margin-bottom:8px;">v1.0.6-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(30 de Abril, 2026)</span></div>' +
      '<p><b>Excluir conta volta pra landing page.</b> Antes ficava preso no loader 🎾 "Carregando..." indefinidamente — o router via <code>currentUser=null</code> mas <code>localStorage.scoreplace_authCache</code> continuava presente, caindo no branch que espera auth resolver (que nunca vai resolver, porque a conta foi excluída). Fix: limpar cache de auth + IndexedDB do Firebase logo depois do delete success, antes do <code>initRouter()</code>. Router agora vê <code>loggedIn=false + hasCache=false</code> → renderiza a landing.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #ef4444;border-radius:12px;padding:14px 16px;background:rgba(239,68,68,0.08);">' +
      '<div style="font-weight:800; color:#ef4444; font-size:1rem; margin-bottom:8px;">🔒 v1.0.5-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(30 de Abril, 2026)</span></div>' +
      '<p><b>Correção de privacidade — telefone, data de nascimento, sexo e endereço dos usuários não vazam mais por busca de amigos.</b> A função <code>searchUsers</code> em #explore retornava o documento inteiro do perfil de cada usuário (incluindo phone, birthDate, gender, preferredCeps, preferredLocations) — qualquer um podia abrir DevTools e dumpar dados pessoais via console. Agora a busca retorna só campos públicos: nome, e-mail, foto, modalidades, timestamps. Fix client-side imediato; fix definitivo nas Firestore Security Rules vai num round dedicado com testes.</p>' +
      '<p><b>"Esportes Preferidos" agora se chama "Modalidades"</b> no perfil. Mais curto e alinhado com a nomenclatura usada no resto do app.</p>' +
      '<p><b>Pills de Modalidades, Presença e Aparência (temas) parecem corretamente desativadas por padrão.</b> Antes nasciam com o estilo default do <code>.btn</code> (texto branco, sem bg explícito) que parecia "todos selecionados" até o JS rodar e sobrescrever. Agora cada pill já nasce com inline style "desativado" (transparente, texto muted, borda discreta) — o JS só ativa o que foi escolhido.</p>' +
      '<p><b>Toggles de notificação iniciam com os 3 ativos.</b> Antes "todas" começava ON e "importantes/fundamentais" OFF, criando um flash visual antes da cascata corrigir pra "tudo ativo". Agora os 3 já nascem ON, alinhados com o default canônico (<code>todas</code> = receber tudo).</p>' +
      '<p><b>Sobre puxar Sexo/Nascimento/Cidade do Google:</b> tecnicamente possível mas exige scopes restritos (<code>user.gender.read</code>, <code>user.birthday.read</code>, <code>user.phonenumbers.read</code>) que precisam de Google App Verification (4-6 semanas, exige privacy policy revisada e demo video). Fica deferido — campos seguem manuais.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(52,211,153,0.08);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">v1.0.4-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(30 de Abril, 2026)</span></div>' +
      '<p><b>Sentry observability — round 1 de cleanup.</b> Auditoria das 7 issues unresolved abriu 6 fixes consolidados num commit: (1) skip de init em ambiente não-produção (mata 13 events do Karma E2E poluindo Sentry); (2) <code>release</code> lazy via <code>beforeSend</code> (corrige <code>scoreplace@unknown</code> em eventos disparados antes do <code>store.js</code> defer carregar); (3) <code>.catch()</code> em <code>reg.update()</code> do Service Worker (mata <code>TypeError: Script sw.js load failed</code> em iOS Safari com rede móvel ruim); (4) probe <code>_captureMessage(\'login modal force-closed\')</code> removido (era diagnóstico da v0.17.83-91, cumpriu papel, agora só polui — 36 events em 2d sem sinal); (5) <code>ignoreErrors</code> ganha 4 patterns: <code>Script .* load failed</code>, <code>popup has been closed</code>, <code>popup_closed_by_user</code>, <code>Test event from beta-readiness</code>.</p>' +
      '<p><b>Hamburger não pisca mais na 1ª vez.</b> Bug reproduzido via Chrome MCP: usuário abria menu logo após page load, Firestore listener disparava <code>onSnapshot</code> nos primeiros 0.5-2s, <code>_softRefreshView()</code> chamava <code>initRouter()</code>, e <code>router.js:84</code> fechava o menu unconditionally em todo handleRoute. Stack trace pegou em flagrante. Fix: <code>_closeHamburger</code> só dispara em navegação real (<code>!window._isSoftRefresh</code>); soft refresh re-renderiza a mesma view e não justifica fechar menu aberto.</p>' +
      '<p><b>Botões "🤖 Add Bot" e "🗑️ Apagar" removidos do detalhe do torneio.</b> Eram úteis em alpha pra testar fluxos de chaveamento e descartar dados de teste. Em beta, bots inflavam dados reais sem motivo e delete destrutivo num clique era arriscado demais. Funções <code>addBotsFunction</code> e <code>deleteTournamentFunction</code> permanecem definidas (zero impacto no usuário) — só perderam o ponto de entrada na UI.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.08);">' +
      '<div style="font-weight:800; color:#10b981; font-size:1rem; margin-bottom:8px;">v1.0.3-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(30 de Abril, 2026)</span></div>' +
      '<p><b>Convenção de versão padronizada</b> — antes era <code>1.0.0-beta-N</code>, agora <code>1.0.N-beta</code> (semver clássico). PATCH incrementa a cada deploy. Trocas internas; nada visual ou funcional muda pro usuário.</p>' +
      '<p><b>Auditoria completa de hints + manual</b>: ~120 hints validados contra o app atual. Removidos refs obsoletos (Suíço como formato principal, "4 pilares" → "5 pilares" + Stats, Place unificado). Adicionados hints novos (página #invite, página #support, modal de aceite de Termos). Nova seção <b>"💚 Apoio e Suporte"</b> no manual com PIX, Plano Pro, reportar bugs, convidar amigos, Privacy+Termos.</p>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.08);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1.1rem; margin-bottom:8px;">🚀 v1.0.0-beta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(29 de Abril, 2026)</span></div>' +
      '<p><b>BETA LANÇADO!</b> O scoreplace.app oficialmente saiu da fase de desenvolvimento exploratório e entrou em <b>beta soft</b>. <b>O que muda:</b> dados são reais, persistem, e qualquer mudança destrutiva exige comunicação prévia. <b>Reset de transição:</b> banco zerado pra começar limpo. <b>Critérios de saída atingidos:</b> Performance Lighthouse 64, Acessibilidade 96, 34 testes E2E, Sentry ativo, Backup Firestore diário, Quotas+alertas, Privacy+Termos publicados, 0 erros JS no smoke. Reportar bugs: scoreplace.app@gmail.com com screenshot. Bora jogar! 🎾🏆</p>' +
    '</div>';
  return html;
})();
