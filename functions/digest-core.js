/* NÚCLEO DO E-MAIL DE NOVIDADES (digest) — puro, sem `firebase-functions`.
 *
 * ⛔ SAIU DO `index.js` porque ele NÃO é `require`-ável em teste: registra `onCall`/`onSchedule`
 * e lê secrets no import, então qualquer suíte que o exigisse derrubaria o processo — e a regra
 * de desenho do e-mail ficaria verde sem ser exercitada. Mesmo padrão de `enroll-core`,
 * `liga-availability-core` e companhia. Gate: `functions/test-digest-core.js`.
 */
'use strict';

function _digestEscape(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function _digestLevelMeta(level) {
  if (level === "fundamental") return { emoji: "🔴", color: "#ef4444", label: "Fundamental" };
  if (level === "important") return { emoji: "🟠", color: "#f59e0b", label: "Importante" };
  return { emoji: "🟢", color: "#10b981", label: "Geral" };
}
// v3.0.56: paleta do e-mail de digest segue o TEMA escolhido pelo destinatário
// (profile.theme: 'light'|'dark'). Default dark (tema padrão do app).
function _digestPalette(theme) {
  // ⛔ CONTRASTE É REGRA DOS DOIS TEMAS. O verde de vitória era `#16a34a` CRAVADO na função do
  // placar — sobre o card branco do tema claro dá ~3,4:1, abaixo do mínimo de texto, e o dono
  // leu na tela: _"o verde no tema claro é quase ilegível"_. Agora as duas cores moram na
  // paleta, com valor próprio em cada tema. ⚠️ Isso importa mesmo quando o tema está certo: o
  // cliente de e-mail pode ignorar o escuro e renderizar em fundo claro assim mesmo.
  if (theme === "light") {
    return { pageBg: "#eef2f7", cardBg: "#ffffff", text: "#0f172a", text2: "#1f2937", muted: "#64748b", footer: "#94a3b8", divider: "#e2e8f0", heading: "#0f172a", win: "#15803d", loss: "#b91c1c" };
  }
  return { pageBg: "#0f172a", cardBg: "#111827", text: "#f1f5f9", text2: "#e5e7eb", muted: "#94a3b8", footer: "#64748b", divider: "#1e293b", heading: "#ffffff", win: "#4ade80", loss: "#f87171" };
}
// Tabela básica (em vez de grid/flex) para os clientes de e-mail manterem os
// cabeçalhos e os números na mesma coluna em Gmail, Apple Mail e Outlook.
/* ⛔ O PLACAR NÃO SE REPETE NO MESMO CARD. Relato do dono (12/set/2026): o e-mail trazia o
 * placar em texto e, logo abaixo, a mesma coisa na tabela colorida — _"repetições inúteis…
 * pode dizer apenas quem lançou o placar e mostrar o placar colorido"_. A AUTORIA é a 1ª linha
 * ("Fulano lançou:" / "Fulano confirmou o resultado lançado por Beltrano:"); o resto é o placar.
 * Quando houver tabela, só a 1ª linha fica. */
function _semAsLinhasDePlacar(msg) {
  const linhas = String(msg || "").split("\n");
  return linhas.length ? linhas[0] : String(msg || "");
}

/* Reconstrói o placar quando o aviso chegou SEM `scoreboard` — foi o caso do aviso da Lucia
 * Cerri (medido: `scoreboard: null`), que vinha de um cliente que não anexa o placar estruturado.
 * ⛔ SÓ com forma inequívoca: duas linhas de time, com a MESMA quantidade de números e pelo menos
 * DOIS por lado (um número por lado é jogo sem sets — rotular aquilo de "Set 1" seria inventar
 * formato). Qualquer desvio devolve null, e o card fica como está hoje.
 * ⚠️ A mensagem não diz quais números são tie-break, então a tabela reconstruída não tem subponto. */
function _placarDaMensagem(msg) {
  const linhas = String(msg || "").split("\n").map((x) => x.trim()).filter(Boolean);
  const iVs = linhas.findIndex((l) => /^vs$/i.test(l));
  if (iVs <= 0 || iVs >= linhas.length - 1) return null;
  const nums = (l) => (String(l).match(/\d+/g) || []).map(Number);
  const a = nums(linhas[iVs - 1]), b = nums(linhas[iVs + 1]);
  if (a.length < 2 || a.length !== b.length) return null;
  const nome = (l) => String(l).replace(/\s*\d+(\s+\d+)*\s*$/, "").trim();
  return {
    p1: nome(linhas[iVs - 1]), p2: nome(linhas[iVs + 1]), winner: "",
    sets: a.map((x, i) => ({ label: "Set " + (i + 1), p1: x, p2: b[i], superTiebreak: false }))
  };
}

function _digestScoreboard(it, P) {
  let b = it && it.scoreboard;
  if (!b || !Array.isArray(b.sets) || !b.sets.length) b = _placarDaMensagem(it && it.message);
  if (!b || !Array.isArray(b.sets) || !b.sets.length) return "";
  const heads = b.sets.map((s, i) => {
    const label = s && s.label ? s.label : ((s && s.superTiebreak) ? "STB" : "Set " + (i + 1));
    return '<td align="center" style="min-width:38px;padding:0 4px 5px;font-size:0.68rem;font-weight:800;color:' + P.muted + ';text-transform:uppercase;">' + _digestEscape(label) + "</td>";
  }).join("");
  // ⛔ A COR É DO SET, NÃO DA LINHA. Relato do dono (11/set/2026): num melhor de 3 ele perdeu a
  // partida mas GANHOU o set 2 por 6-3 — e o 6 saía vermelho, porque a cor vinha do vencedor da
  // PARTIDA e pintava a linha inteira. O NOME do time continua seguindo o vencedor da partida
  // (é dele que a linha fala); cada célula de set segue quem ganhou AQUELE set. Set não empata,
  // mas se vier igual fica neutro em vez de inventar um vencedor.
  const corDaPartida = (won) => (won ? P.win : (b.winner ? P.loss : P.text));
  const corDoSet = (s, side) => {
    const a = Number(s && s.p1), c = Number(s && s.p2);
    if (!isFinite(a) || !isFinite(c) || a === c) return P.text;
    return (side === "p1" ? a > c : c > a) ? P.win : P.loss;
  };
  // ⛔ O SUBPONTO DO TIE-BREAK É OBJETO ({pointsP1, pointsP2}) — imprimir o objeto cru sairia
  // como "[object Object]" no corpo do e-mail. Cada lado mostra os PRÓPRIOS pontos, igual ao
  // card (`_formatSetForPlayer`), pra as duas telas dizerem a mesma coisa.
  const pontosTb = (s, side) => {
    const tb = s && s.tiebreak;
    if (!tb) return null;
    const v = side === "p1" ? (tb.pointsP1 != null ? tb.pointsP1 : tb.p1) : (tb.pointsP2 != null ? tb.pointsP2 : tb.p2);
    return (v == null || v === "") ? null : v;
  };
  const row = (name, side, won) => {
    return '<tr><td style="padding:7px 8px 7px 0;font-size:0.88rem;font-weight:700;color:' + corDaPartida(won) + ';">' + _digestEscape(name || "?") + "</td>" +
      b.sets.map((s) => {
        const val = _digestEscape(String(s && s[side] != null ? s[side] : "–"));
        const tbv = pontosTb(s, side);
        const sup = (tbv != null) ? '<sup style="font-size:0.62em;font-weight:700;">(' + _digestEscape(String(tbv)) + ')</sup>' : "";
        return '<td align="center" style="padding:7px 4px;font-size:1.05rem;font-weight:800;color:' + corDoSet(s, side) + ';">' + val + sup + "</td>";
      }).join("") + "</tr>";
  };
  return '<table cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top:12px;border-collapse:separate;border-spacing:0;background:rgba(148,163,184,0.08);border:1px solid ' + P.divider + ';border-radius:8px;"><tr><td></td>' + heads + "</tr>" + row(b.p1, "p1", b.winner && b.winner === b.p1) + row(b.p2, "p2", b.winner && b.winner === b.p2) + "</table>";
}
function _buildDigestHtml(items, theme) {
  const P = _digestPalette(theme);
  const rows = items.map((it) => {
    const meta = _digestLevelMeta(it.level);
    const scoreboardHtml = _digestScoreboard(it, P);
    // Com tabela, o texto fica só na autoria — senão o mesmo placar aparece duas vezes.
    const msgHtml = _digestEscape(scoreboardHtml ? _semAsLinhasDePlacar(it.message) : it.message).replace(/\n/g, "<br>");
    const tName = it.tournamentName ? ('<div style="font-size:0.72rem;font-weight:700;color:' + P.muted + ';text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px;">🏆 ' + _digestEscape(it.tournamentName) + "</div>") : "";
    const scoreboard = scoreboardHtml;
    // v2.8.51: CTA por tipo (botão âmbar). Usa ctaUrl/ctaLabel quando vierem; senão
    // cai no tournamentUrl genérico. Toda notificação ganha um botão de ação.
    const _ctaUrl = it.ctaUrl || it.tournamentUrl || "";
    const _ctaLabel = it.ctaLabel || "Ver no scoreplace.app";
    const link = _ctaUrl ? ('<div style="margin-top:10px;"><a href="' + _digestEscape(_ctaUrl) + '" style="display:inline-block;background:#fbbf24;color:#3a2300;font-size:0.82rem;text-decoration:none;font-weight:800;padding:9px 18px;border-radius:9px;">👉 ' + _digestEscape(_ctaLabel) + "</a></div>") : "";
    return (
      '<tr><td style="padding:0 0 14px;">' +
        '<table cellspacing="0" cellpadding="0" border="0" width="100%" style="background:' + P.cardBg + ";border-left:4px solid " + meta.color + ';border-radius:10px;' + (theme === "light" ? "border:1px solid #e2e8f0;border-left:4px solid " + meta.color + ";" : "") + '">' +
          '<tr><td style="padding:14px 16px;color:' + P.text2 + ';">' +
            '<div style="font-size:0.68rem;font-weight:800;color:' + meta.color + ';margin-bottom:6px;">' + meta.emoji + " " + meta.label + "</div>" +
            tName +
            '<div style="font-size:0.92rem;color:' + P.text + ';line-height:1.5;">' + msgHtml + "</div>" +
            scoreboard +
            link +
          "</td></tr>" +
        "</table>" +
      "</td></tr>"
    );
  }).join("");
  return (
    // ⛔ SEM ESTAS DUAS METAS O APPLE MAIL IGNORA O TEMA ESCURO e renderiza em fundo claro —
    // medido: os e-mails do dono SAÍRAM com a paleta escura e chegaram brancos na tela dele.
    '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">' +
    '<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"></head>' +
    '<body style="margin:0;padding:0;background:' + P.pageBg + ';font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">' +
      '<table cellspacing="0" cellpadding="0" border="0" width="100%" style="background:' + P.pageBg + ';padding:32px 16px;"><tr><td align="center">' +
        '<table cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:540px;">' +
          '<tr><td style="padding:0 4px 16px;text-align:center;">' +
            '<div style="font-size:1.3rem;">🔔</div>' +
            '<div style="font-size:1rem;font-weight:800;color:' + P.heading + ';margin-top:2px;">' + (items.length === 1 ? "Você tem 1 novidade" : ("Você tem " + items.length + " novidades")) + "</div>" +
            '<div style="font-size:0.8rem;color:' + P.muted + ';">scoreplace.app</div>' +
          "</td></tr>" +
          "<tr><td>" + '<table cellspacing="0" cellpadding="0" border="0" width="100%">' + rows + "</table>" + "</td></tr>" +
          '<tr><td style="padding:8px 4px 0;text-align:center;border-top:1px solid ' + P.divider + ';">' +
            '<p style="margin:14px 0 0;font-size:0.7rem;color:' + P.footer + ';">scoreplace.app · Jogue em outro nível</p>' +
            '<p style="margin:6px 0 0;font-size:0.68rem;color:' + P.footer + ';">Pra ajustar a frequência/canais, abra o app → seu perfil → Canais de notificação.</p>' +
          "</td></tr>" +
        "</table>" +
      "</td></tr></table>" +
    "</body></html>"
  );
}
function _buildDigestText(items) {
  return (
    "scoreplace.app — " + (items.length === 1 ? "1 novidade" : items.length + " novidades") + "\n\n" +
    items.map((it) => {
      const meta = _digestLevelMeta(it.level);
      return meta.emoji + " " + (it.tournamentName ? "[" + it.tournamentName + "] " : "") + "\n" + it.message + (it.tournamentUrl ? "\n" + it.tournamentUrl : "");
    }).join("\n\n") +
    "\n\nscoreplace.app · Jogue em outro nível"
  );
}

module.exports = {
  _digestEscape, _digestLevelMeta, _digestPalette, _digestScoreboard,
  _placarDaMensagem, _semAsLinhasDePlacar, _buildDigestHtml, _buildDigestText
};
