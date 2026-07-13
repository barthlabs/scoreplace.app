// scoreplace.app — Release notes (lazy-loaded)
// Loaded on demand when the user opens "Notas de versões" in help modal.
//
// Convenção de versão (a partir de 30 Abr 2026): MAJOR.MINOR.PATCH-channel.
// Em beta, PATCH incrementa a cada release (1.0.3-beta → 1.0.4-beta).
// Histórico completo da fase alpha → beta exportado pra
// docs/scoreplace_relatorio_alpha_to_beta.docx (registro local do dono).
// Histórico completo da fase beta → 1.0 (385 notas, 29 Abr → 13 Jul 2026)
// exportado pra docs/scoreplace_relatorio_beta_to_1.0.docx — a partir da v1.0
// o app mostra só as notas de 1.0 em diante.

window._RELEASE_NOTES_HTML = (function () {
  var html =
    '<div style="margin-bottom:1rem;border:2px solid #38bdf8;border-radius:12px;padding:14px 16px;background:rgba(56,189,248,0.08);">' +
      '<div style="font-weight:800; color:#7dd3fc; font-size:1rem; margin-bottom:8px;">🏷️ v1.0.4 — Importe seu histórico do letzplay + Estatísticas repaginadas + Análise de Inscritos anti-gato <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(13 de Julho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>🎾 Traga seu histórico do letzplay:</b> uma extensão do Chrome (desktop) importa seus jogos do letzplay pro scoreplace, na sua sessão logada — eles entram no seu <b>Histórico de jogos</b> unificado (letzplay + scoreplace), com os nomes reais de parceiros e adversários. O botão <b>"Importar do letzplay"</b> aparece no <b>Perfil</b> (abaixo da conta letzplay) e nas <b>Estatísticas</b>; no celular ele fica desabilitado com o aviso de que a importação é feita no computador.</li>' +
        '<li><b>📊 Estatísticas repaginadas:</b> novo <b>gráfico de Forma</b> (sobe e desce) com slider de janela temporal (tudo ↔ última semana), marcos de data e filtro Geral / Rankings / Torneios. As <b>barras</b> e os <b>Top parceiros/adversários</b> somam letzplay + scoreplace, lado a lado; o card <b>"Seu nível (geral)"</b> mistura as duas fontes.</li>' +
        '<li><b>🗂️ Análise de Inscritos repaginada — "Categorias · apuração pelo letzplay":</b> matriz <b>Gênero × Categoria</b> com os inscritos agrupados por habilidade, cada nome <b>pintado pela verificação</b> do letzplay (🟢 coerente · 🟡 pode subir · 🔴 deve subir · 🔵 rebaixar · ⚪ sem verificação). A busca do organizador puxa o <b>perfil inteiro</b> (rankings com a banda real + torneios + jogos), em modo <b>Essencial</b> ou <b>Completa</b>.</li>' +
        '<li><b>⚖️ Anti-gato pela regra da federação:</b> só quem <b>domina</b> (título ou topo da tabela) numa categoria igual/mais fácil é sinalizado pra subir. Estar ranqueado numa banda acima sem dominar é permitido — competir acima pode, abaixo não.</li>' +
        '<li><b>➕ Criar categorias direto da matriz:</b> botões formalizam categorias por <b>gênero</b> e por <b>habilidade</b>, com o box "Categorias no torneio" mostrando a contagem; arraste os inscritos entre categorias pra estudar a divisão.</li>' +
        '<li><b>🎚️ Rigor da inscrição:</b> ao criar/editar um torneio você define, no topo das Categorias, o quão exigente é a inscrição — de <b>Casual</b> (não liga pro histórico) a <b>Oficial</b> (exige perfil/histórico compatível).</li>' +
      '</ul>' +
    '</div>';
  return html;
})();
