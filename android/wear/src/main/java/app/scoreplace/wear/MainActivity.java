package app.scoreplace.wear;

import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.util.TypedValue;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.Switch;
import android.widget.TextView;

import com.google.android.gms.wearable.MessageClient;
import com.google.android.gms.wearable.MessageEvent;
import com.google.android.gms.wearable.Node;
import com.google.android.gms.wearable.Wearable;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

/**
 * scoreplace Wear OS — controle de placar ao vivo (fase 4).
 * Contrato: docs/smartwatch-bridge.md. Relógio burro: toque = intenção
 * (+1 / desfazer) enviada via Wear Data Layer; renderiza o estado que o
 * celular devolve (motor GSM = fonte única no JS do app).
 */
public class MainActivity extends Activity implements MessageClient.OnMessageReceivedListener {

    private static final String PATH_STATE = "/scoreplace/state";
    private static final String PATH_INTENT = "/scoreplace/intent";

    private final Handler ui = new Handler(Looper.getMainLooper());
    private int courtLeft = 1; // qual time está à esquerda (vem do estado)
    private float mScale = 1f;  // fator do cânone de escala por área (ver applyScale)

    private LinearLayout halfLeft, halfRight, btnUndo;
    private TextView pointLeft, pointRight, gamesLeft, gamesRight, setLabel, gamesLabel;
    private TextView nameL1, nameL2, nameR1, nameR2, ballL1, ballL2, ballR1, ballR2;
    private View winnerOverlay, replayControls, reshuffleRow, tieOverlay;
    private TextView winnerLabel, winnerNames, winnerScoreL, winnerScoreR;
    private androidx.wear.widget.CurvedTextView setsArcL, setsArcR, setsWordArc, winnerArcSport;
    private TextView btnReplayCancel, btnReplayConfirm, reshuffleLabel;
    private boolean rrSuggestNow = false;   // fim de jogo com sugestão de Rei/Rainha
    private TextView tieScoreL, tieScoreR, btnTieExtend, btnTieTiebreak;
    private Switch reshuffleSwitch;
    private boolean replayDismissed = false; // Cancelar esconde o prompt

    // Iniciar (start)
    private View startOverlay;
    private TextView btnStart;
    private androidx.wear.widget.CurvedTextView startArcSport, startArcPrompt;
    private LinearLayout startPlayers;
    // Seletor de sacador
    private LinearLayout serveBar, serveList;
    private TextView serveBarName, btnServeConfirm;
    private androidx.wear.widget.CurvedTextView serveArcPrompt, serveArcSport;
    private View serveOverlay;
    // Rei/Rainha (na tela de vencedor)
    private TextView rrSeriesLabel, btnRrNext, rrFinalTitle, winnerWaiting;
    private LinearLayout rrStandings;

    // Estado do seletor de sacador. pendingPick = escolha ainda não confirmada;
    // vazio → o Confirmar mantém quem o motor já assumiu (servePickCurrent).
    private String pendingPickName = null;
    private int pendingPickTeam = 0, pendingPickIdx = -1;
    private String servePickCurrent = "";
    private int lastServePhase = -99;   // detecta a virada 0→1 pra abrir o seletor
    private org.json.JSONArray serveEligible = null;
    private boolean serveOpen = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        halfLeft = findViewById(R.id.half_left);
        halfRight = findViewById(R.id.half_right);
        btnUndo = findViewById(R.id.btn_undo);
        pointLeft = findViewById(R.id.point_left);
        pointRight = findViewById(R.id.point_right);
        gamesLeft = findViewById(R.id.games_left);
        gamesRight = findViewById(R.id.games_right);
        setLabel = findViewById(R.id.set_label);
        nameL1 = findViewById(R.id.name_l1); nameL2 = findViewById(R.id.name_l2);
        nameR1 = findViewById(R.id.name_r1); nameR2 = findViewById(R.id.name_r2);
        ballL1 = findViewById(R.id.ball_l1); ballL2 = findViewById(R.id.ball_l2);
        ballR1 = findViewById(R.id.ball_r1); ballR2 = findViewById(R.id.ball_r2);
        setsArcL = findViewById(R.id.sets_arc_left);
        setsArcR = findViewById(R.id.sets_arc_right);
        // SETS na borda curva: esquerdo às 11h (330°), direito à 1h (30°).
        setsArcL.setAnchorType(1); setsArcL.setAnchorAngleDegrees(330f); setsArcL.setClockwise(true);
        setsArcR.setAnchorType(1); setsArcR.setAnchorAngleDegrees(30f);  setsArcR.setClockwise(true);
        setsWordArc = findViewById(R.id.sets_word_arc);
        setsWordArc.setAnchorType(1); setsWordArc.setAnchorAngleDegrees(316f); setsWordArc.setClockwise(true); // perto do "1" (11h)
        winnerOverlay = findViewById(R.id.winner_overlay);
        winnerLabel = findViewById(R.id.winner_label);
        winnerNames = findViewById(R.id.winner_names);
        winnerScoreL = findViewById(R.id.winner_score_l);
        winnerScoreR = findViewById(R.id.winner_score_r);
        winnerArcSport = findViewById(R.id.winner_arc_sport);
        winnerArcSport.setAnchorType(2); winnerArcSport.setAnchorAngleDegrees(330f); winnerArcSport.setClockwise(true); // 11h
        replayControls = findViewById(R.id.replay_controls);
        reshuffleRow = findViewById(R.id.reshuffle_row);
        reshuffleSwitch = findViewById(R.id.reshuffle_switch);
        reshuffleLabel = findViewById(R.id.reshuffle_label);
        btnReplayCancel = findViewById(R.id.btn_replay_cancel);
        btnReplayConfirm = findViewById(R.id.btn_replay_confirm);
        tieOverlay = findViewById(R.id.tie_overlay);
        tieScoreL = findViewById(R.id.tie_score_l);
        tieScoreR = findViewById(R.id.tie_score_r);
        btnTieExtend = findViewById(R.id.btn_tie_extend);
        btnTieTiebreak = findViewById(R.id.btn_tie_tiebreak);
        gamesLabel = findViewById(R.id.games_label);
        startOverlay = findViewById(R.id.start_overlay);
        startArcSport = findViewById(R.id.start_arc_sport);
        startArcPrompt = findViewById(R.id.start_arc_prompt);
        startPlayers = findViewById(R.id.start_players);
        btnStart = findViewById(R.id.btn_start);
        // Cromo curvo no topo (0° = 12h, horário; 30°/hora → 11h = 330°, 1h = 30°).
        // ⚡+modalidade (fonte menor) TERMINA às 11h (topo-esquerda); "1º sacador"
        // COMEÇA à 1h (topo-direita) — simétrico, respiro no 12h, centro livre.
        // anchorType: 0=start, 1=center, 2=end (enum anchorPosition da lib).
        startArcSport.setAnchorType(2);              // END: modalidade termina no ângulo
        startArcSport.setAnchorAngleDegrees(330f);   // 11h (esquerda)
        startArcSport.setClockwise(true);
        startArcPrompt.setAnchorType(1);             // CENTER: centrado no ângulo
        startArcPrompt.setAnchorAngleDegrees(0f);    // 12h (topo, centrado)
        startArcPrompt.setClockwise(true);
        serveBar = findViewById(R.id.serve_bar);
        serveBarName = findViewById(R.id.serve_bar_name);
        serveOverlay = findViewById(R.id.serve_overlay);
        serveList = findViewById(R.id.serve_list);
        serveArcPrompt = findViewById(R.id.serve_arc_prompt);
        serveArcPrompt.setAnchorType(1); serveArcPrompt.setAnchorAngleDegrees(0f); serveArcPrompt.setClockwise(true); // 12h
        serveArcSport = findViewById(R.id.serve_arc_sport);
        serveArcSport.setAnchorType(2); serveArcSport.setAnchorAngleDegrees(330f); serveArcSport.setClockwise(true); // 11h (igual ao Iniciar)
        btnServeConfirm = findViewById(R.id.btn_serve_confirm);
        rrSeriesLabel = findViewById(R.id.rr_series_label);
        btnRrNext = findViewById(R.id.btn_rr_next);
        rrFinalTitle = findViewById(R.id.rr_final_title);
        rrStandings = findViewById(R.id.rr_standings);
        winnerWaiting = findViewById(R.id.winner_waiting);

        // Iniciar → dispara a MESMA _casualStart() do celular.
        btnStart.setOnClickListener(v -> sendIntent("start", 0));
        // Barra do sacador abre o seletor (fase 0, antes de qualquer jogo).
        serveBar.setOnClickListener(v -> { serveOpen = true; renderServeOverlay(); });
        // Confirmar aplica a escolha (ou mantém a atual) e fecha.
        btnServeConfirm.setOnClickListener(v -> {
            int team = pendingPickTeam, idx = pendingPickIdx;
            if (pendingPickName == null) { int[] cur = resolveCurrentSlot(); team = cur[0]; idx = cur[1]; }
            if (team == 1 || team == 2) if (idx >= 0) sendSetServer(team, idx);
            serveOpen = false; pendingPickName = null;
            serveOverlay.setVisibility(View.GONE);
        });

        // Toque por POSIÇÃO → intenção pra o TIME que está naquele lado.
        halfLeft.setOnClickListener(v -> sendPoint(courtLeft));
        halfRight.setOnClickListener(v -> sendPoint(courtLeft == 1 ? 2 : 1));
        btnUndo.setOnClickListener(v -> sendIntent("undo", 0));
        // "Jogar novamente?" — Cancelar dispensa o prompt; Confirmar manda a
        // intenção pro celular recomeçar (com/sem re-sortear as duplas).
        btnReplayCancel.setOnClickListener(v -> {
            replayDismissed = true;
            replayControls.setVisibility(View.GONE);
        });
        btnReplayConfirm.setOnClickListener(v -> {
            // RR ligado → aceita a sugestão de Rei/Rainha; senão, replay normal.
            if (rrSuggestNow && reshuffleSwitch.isChecked()) sendRrActivate();
            else sendReplay(reshuffleSwitch.isChecked());
        });
        // Rei/Rainha ligado → o Iniciar fica DOURADO (vai começar a série).
        reshuffleSwitch.setOnCheckedChangeListener((b, checked) -> {
            boolean gold = rrSuggestNow && checked;
            btnReplayConfirm.setBackgroundColor(getColor(gold ? R.color.rr_amber : R.color.start_green));
            btnReplayConfirm.setTextColor(getColor(gold ? R.color.rr_amber_text : R.color.start_green_text));
        });
        // Empate → prorrogar (mantém 'ask' no motor → recorre) ou tie-break.
        btnTieExtend.setOnClickListener(v -> sendResolveTie("extend"));
        btnTieTiebreak.setOnClickListener(v -> sendResolveTie("tiebreak"));

        applyScale();
    }

    // ── CÂNONE DE ESCALA POR ÁREA (equivalente Wear do GeometryReader do iOS —
    // ver project_web_area_scaling_canon / feedback_maximize_screen_area) ──
    // Lê a largura REAL em dp e escala TUDO (fonte + padding + margem + dimensões
    // fixas) de CADA view, recursivamente. O layout XML é desenhado na referência
    // (~195dp de largura); telas menores encolhem, maiores dão zoom. Via ÚNICA:
    // nada no XML reage à área sozinho (dp engana entre densidades), então o
    // cânone é a alavanca única. scale = clamp(widthDp/195, 0.60, 1.35).
    private void applyScale() {
        DisplayMetrics dm = getResources().getDisplayMetrics();
        float widthDp = dm.widthPixels / dm.density;
        mScale = Math.max(0.60f, Math.min(1.35f, widthDp / 195f));
        if (Math.abs(mScale - 1f) < 0.001f) return; // referência → no-op
        scaleTree(findViewById(android.R.id.content), mScale);
    }

    // Multiplica recursivamente fonte/padding/margem/dimensões fixas de v e filhos.
    private void scaleTree(View v, float s) {
        if (v == null) return;
        if (v instanceof androidx.wear.widget.CurvedTextView) {
            // CurvedTextView não é TextView; escala em px (ângulos são ⊥ ao tamanho).
            androidx.wear.widget.CurvedTextView cv = (androidx.wear.widget.CurvedTextView) v;
            cv.setTextSize(cv.getTextSize() * s);
        } else if (v instanceof TextView) {
            TextView tv = (TextView) v;
            if (tv.getAutoSizeTextType() == TextView.AUTO_SIZE_TEXT_TYPE_UNIFORM) {
                // Autosize: escala o min/max (setTextSize direto brigaria com ele).
                int mn = Math.max(1, Math.round(tv.getAutoSizeMinTextSize() * s));
                int mx = Math.max(mn + 1, Math.round(tv.getAutoSizeMaxTextSize() * s));
                int st = Math.max(1, Math.round(tv.getAutoSizeStepGranularity() * s));
                tv.setAutoSizeTextTypeUniformWithConfiguration(mn, mx, st, TypedValue.COMPLEX_UNIT_PX);
            } else {
                tv.setTextSize(TypedValue.COMPLEX_UNIT_PX, tv.getTextSize() * s);
            }
        }
        v.setPadding(Math.round(v.getPaddingLeft() * s), Math.round(v.getPaddingTop() * s),
                     Math.round(v.getPaddingRight() * s), Math.round(v.getPaddingBottom() * s));
        ViewGroup.LayoutParams lp = v.getLayoutParams();
        if (lp != null) {
            if (lp.width > 0) lp.width = Math.round(lp.width * s);   // >0 = dimensão fixa (não MATCH/WRAP)
            if (lp.height > 0) lp.height = Math.round(lp.height * s);
            if (lp instanceof ViewGroup.MarginLayoutParams) {
                ViewGroup.MarginLayoutParams m = (ViewGroup.MarginLayoutParams) lp;
                m.setMargins(Math.round(m.leftMargin * s), Math.round(m.topMargin * s),
                             Math.round(m.rightMargin * s), Math.round(m.bottomMargin * s));
            }
            v.setLayoutParams(lp);
        }
        if (v instanceof ViewGroup) {
            ViewGroup vg = (ViewGroup) v;
            for (int i = 0; i < vg.getChildCount(); i++) scaleTree(vg.getChildAt(i), s);
        }
    }

    // Intenção "resolveTie" — escolha do desempate no empate (5-5, 6-6…).
    private void sendResolveTie(String rule) {
        try {
            JSONObject o = new JSONObject();
            o.put("v", 1);
            o.put("type", "resolveTie");
            o.put("rule", rule);
            o.put("id", UUID.randomUUID().toString());
            final byte[] bytes = o.toString().getBytes(StandardCharsets.UTF_8);
            Wearable.getNodeClient(this).getConnectedNodes()
                .addOnSuccessListener(nodes -> {
                    MessageClient mc = Wearable.getMessageClient(this);
                    for (Node node : nodes) mc.sendMessage(node.getId(), PATH_INTENT, bytes);
                });
        } catch (Exception e) { /* no-op */ }
    }

    // Intenção "replay" com o flag de re-sortear duplas.
    private void sendReplay(boolean shuffle) {
        try {
            JSONObject o = new JSONObject();
            o.put("v", 1);
            o.put("type", "replay");
            o.put("shuffle", shuffle);
            o.put("id", UUID.randomUUID().toString());
            final byte[] bytes = o.toString().getBytes(StandardCharsets.UTF_8);
            Wearable.getNodeClient(this).getConnectedNodes()
                .addOnSuccessListener(nodes -> {
                    MessageClient mc = Wearable.getMessageClient(this);
                    for (Node node : nodes) mc.sendMessage(node.getId(), PATH_INTENT, bytes);
                });
        } catch (Exception e) { /* no-op */ }
    }

    // Intenção "rrActivate" — aceita a sugestão de Rei/Rainha no fim de jogo
    // (toggle "👑 Rei/Rainha" + Iniciar): o celular ativa a série retroativa e
    // começa o 3º jogo. Regra/contagem vivem lá, nunca aqui.
    private void sendRrActivate() {
        try {
            JSONObject o = new JSONObject();
            o.put("v", 1);
            o.put("type", "rrActivate");
            o.put("id", UUID.randomUUID().toString());
            final byte[] bytes = o.toString().getBytes(StandardCharsets.UTF_8);
            Wearable.getNodeClient(this).getConnectedNodes()
                .addOnSuccessListener(nodes -> {
                    MessageClient mc = Wearable.getMessageClient(this);
                    for (Node node : nodes) mc.sendMessage(node.getId(), PATH_INTENT, bytes);
                });
        } catch (Exception e) { /* no-op */ }
    }

    // Intenção "setServer" — escolha do sacador nos 2 primeiros jogos. O celular
    // decide se ainda vale; o hard lock vive no motor, nunca aqui.
    private void sendSetServer(int team, int playerIdx) {
        try {
            JSONObject o = new JSONObject();
            o.put("v", 1);
            o.put("type", "setServer");
            o.put("team", team);
            o.put("playerIdx", playerIdx);
            o.put("id", UUID.randomUUID().toString());
            final byte[] bytes = o.toString().getBytes(StandardCharsets.UTF_8);
            Wearable.getNodeClient(this).getConnectedNodes()
                .addOnSuccessListener(nodes -> {
                    MessageClient mc = Wearable.getMessageClient(this);
                    for (Node node : nodes) mc.sendMessage(node.getId(), PATH_INTENT, bytes);
                });
        } catch (Exception e) { /* no-op */ }
    }

    @Override
    protected void onResume() {
        super.onResume();
        Wearable.getMessageClient(this).addListener(this);
        sendIntent("hello", 0); // pede o estado atual ao celular
    }

    @Override
    protected void onPause() {
        super.onPause();
        Wearable.getMessageClient(this).removeListener(this);
    }

    private void sendPoint(int team) { sendIntent("point", team); }

    // Monta a intenção JSON e envia pro celular via Data Layer.
    private void sendIntent(String type, int team) {
        try {
            JSONObject o = new JSONObject();
            o.put("v", 1);
            o.put("type", type);
            if (team == 1 || team == 2) o.put("team", team);
            if (!"hello".equals(type)) o.put("id", UUID.randomUUID().toString());
            final byte[] bytes = o.toString().getBytes(StandardCharsets.UTF_8);
            Wearable.getNodeClient(this).getConnectedNodes()
                .addOnSuccessListener(nodes -> {
                    MessageClient mc = Wearable.getMessageClient(this);
                    for (Node node : nodes) mc.sendMessage(node.getId(), PATH_INTENT, bytes);
                });
        } catch (Exception e) { /* sem nó / json: no-op */ }
    }

    // Estado vindo do celular.
    @Override
    public void onMessageReceived(MessageEvent event) {
        if (!PATH_STATE.equals(event.getPath())) return;
        final String json = new String(event.getData(), StandardCharsets.UTF_8);
        ui.post(() -> {
            try { render(new JSONObject(json)); } catch (Exception e) { /* ignore */ }
        });
    }

    private void render(JSONObject s) {
        boolean active = s.optBoolean("active", false);
        courtLeft = s.optInt("courtLeft", 1);
        int leftTeam = courtLeft, rightTeam = leftTeam == 1 ? 2 : 1;
        JSONArray points = s.optJSONArray("points");
        JSONArray games = s.optJSONArray("games");
        JSONObject teams = s.optJSONObject("teams");
        JSONObject server = s.optJSONObject("server");
        applySide(true, leftTeam, points, games, teams, server);
        applySide(false, rightTeam, points, games, teams, server);

        int setsToWin = s.optInt("setsToWin", 1);
        JSONArray sets = s.optJSONArray("sets");
        boolean finished = s.optBoolean("isFinished", false);

        // ── Rei/Rainha ──
        boolean reiRainha = s.optBoolean("reiRainha", false);
        int rrRound = s.optInt("rrRound", 0);
        // Rótulo do topo: "JOGO N/3" (âmbar) durante a série; senão "GAMES".
        if (reiRainha && rrRound < 3) {
            gamesLabel.setText("JOGO " + (rrRound + 1) + "/3");
            gamesLabel.setTextColor(getColor(R.color.rr_amber));
        } else {
            gamesLabel.setText("GAMES");
            gamesLabel.setTextColor(getColor(R.color.meta_dim));
        }

        // #1: SETS no lugar do rótulo do set — 0-0 no início, preenche conforme
        // os sets fecham. Ativo → mostra sets; inativo → "Aguardando…".
        if (active) {
            setLabel.setVisibility(View.GONE);
            setsArcL.setVisibility(View.VISIBLE); setsArcR.setVisibility(View.VISIBLE);
            setsWordArc.setVisibility(View.VISIBLE);
            setsArcL.setText(String.valueOf(sets != null ? sets.optInt(leftTeam - 1, 0) : 0));
            setsArcL.setTextColor(getColor(leftTeam == 1 ? R.color.team_blue : R.color.team_red));
            setsArcR.setText(String.valueOf(sets != null ? sets.optInt(rightTeam - 1, 0) : 0));
            setsArcR.setTextColor(getColor(rightTeam == 1 ? R.color.team_blue : R.color.team_red));
        } else {
            setsArcL.setVisibility(View.GONE); setsArcR.setVisibility(View.GONE);
            setsWordArc.setVisibility(View.GONE);
            setLabel.setVisibility(View.VISIBLE);
            setLabel.setText("Aguardando…");
        }

        // ── Iniciar: montagem aberta no celular e nada ao vivo ──
        boolean canStart = s.optBoolean("canStart", false);
        if (!active && !finished && canStart) {
            boolean isCasual = s.optBoolean("isCasual", false);
            String sport = s.optString("sportName", "Partida Casual");
            startArcSport.setText((isCasual ? "⚡ " : "🏆 ") + sport);
            buildStartPlayers(teams, leftTeam, rightTeam,
                              server != null ? server.optString("name", "") : "");
            startOverlay.setVisibility(View.VISIBLE);
        } else {
            startOverlay.setVisibility(View.GONE);
        }

        // ── Seletor de sacador ──
        boolean tiePending = s.optBoolean("tieRulePending", false);
        boolean canSetServer = s.optBoolean("canSetServer", false);
        int servePhase = s.optInt("servePickPhase", -1);
        serveEligible = s.optJSONArray("serveEligible");
        servePickCurrent = s.optString("servePickCurrent", "");
        // Virada de fase → volta a acender quem ocupa o slot; 0→1 abre o seletor
        // sozinho (confirmação do 2º sacador entre o 1º e o 2º game); -1 fecha.
        if (servePhase != lastServePhase) {
            pendingPickName = null;
            if (servePhase == 1) serveOpen = true;
            if (servePhase == -1) serveOpen = false;
            lastServePhase = servePhase;
        }
        // Barra do sacador no rodapé: só durante os 2 primeiros jogos.
        serveBar.setVisibility(canSetServer && active && !finished && !tiePending ? View.VISIBLE : View.GONE);
        if (canSetServer && server != null) serveBarName.setText(server.optString("name", "Sacador"));
        // Overlay do seletor (aberto por toque ou pela virada de fase).
        boolean showServe = serveOpen && canSetServer && !finished;
        if (showServe) {
            serveArcPrompt.setText(servePhase == 1 ? "2º sacador" : "1º sacador");
            boolean isCasualS = s.optBoolean("isCasual", false);
            String sportS = s.optString("sportName", "");
            serveArcSport.setText((isCasualS ? "⚡ " : "🏆 ") + (sportS.isEmpty() ? "Partida" : sportS));
            renderServeOverlay();
        }
        serveOverlay.setVisibility(showServe ? View.VISIBLE : View.GONE);

        // #2: Fim de jogo — cobre as metades e trava os toques +1.
        if (finished) {
            int winner = s.isNull("winner") ? 0 : s.optInt("winner", 0);
            // Modalidade curva às 11h (igual às outras telas).
            boolean isCasualW = s.optBoolean("isCasual", false);
            String sportW = s.optString("sportName", "");
            winnerArcSport.setText((isCasualW ? "⚡ " : "🏆 ") + (sportW.isEmpty() ? "Partida" : sportW));
            if (winner == 1 || winner == 2) {
                winnerLabel.setText("Vencedor");
                winnerNames.setText(teamNames(teams, winner));
                winnerNames.setTextColor(getColor(winner == 1 ? R.color.team_blue : R.color.team_red));
                winnerNames.setVisibility(View.VISIBLE);
            } else {
                winnerLabel.setText("Empate");
                winnerNames.setVisibility(View.GONE);
            }
            // Placar em GAMES; número do vencedor VERDE, do perdedor VERMELHO.
            int gl = games != null ? games.optInt(leftTeam - 1, 0) : 0;
            int gr = games != null ? games.optInt(rightTeam - 1, 0) : 0;
            winnerScoreL.setText(String.valueOf(gl));
            winnerScoreR.setText(String.valueOf(gr));
            if (winner == 0) {
                winnerScoreL.setTextColor(getColor(R.color.meta_dim));
                winnerScoreR.setTextColor(getColor(R.color.meta_dim));
            } else {
                winnerScoreL.setTextColor(getColor(leftTeam == winner ? R.color.start_green : R.color.win_red));
                winnerScoreR.setTextColor(getColor(rightTeam == winner ? R.color.start_green : R.color.win_red));
            }

            boolean canReplay = s.optBoolean("canReplay", false);
            boolean isDoubles = s.optBoolean("isDoubles", false);

            // Rei/Rainha manda no fim de jogo: a série de 3 continua (duplas
            // rotacionam) ou, no 3º, encerra e mostra a classificação individual.
            if (reiRainha && rrRound < 3) {
                replayControls.setVisibility(View.GONE);
                winnerWaiting.setVisibility(View.GONE);
                rrFinalTitle.setVisibility(View.GONE);
                rrStandings.setVisibility(View.GONE);
                rrSeriesLabel.setVisibility(View.VISIBLE);
                rrSeriesLabel.setText("Jogo " + Math.min(rrRound + 1, 3) + " de 3 concluído");
                btnRrNext.setVisibility(View.VISIBLE);
                if (rrRound < 2) {
                    btnRrNext.setText("⚡ Jogo " + (rrRound + 2) + " de 3");
                    btnRrNext.setBackgroundTintList(getColorStateList(R.color.rr_amber));
                    btnRrNext.setOnClickListener(v -> sendIntent("rrNext", 0));
                } else {
                    btnRrNext.setText("👑 Resultado Final");
                    btnRrNext.setBackgroundTintList(getColorStateList(R.color.rr_amber_dark));
                    btnRrNext.setOnClickListener(v -> sendIntent("rrFinal", 0));
                }
            } else if (reiRainha) {
                // Série encerrada → classificação por PESSOA (invicto destacado).
                replayControls.setVisibility(View.GONE);
                winnerWaiting.setVisibility(View.GONE);
                rrSeriesLabel.setVisibility(View.GONE);
                btnRrNext.setVisibility(View.GONE);
                rrFinalTitle.setVisibility(View.VISIBLE);
                rrStandings.setVisibility(View.VISIBLE);
                buildRrStandings(s.optJSONArray("rrStandings"));
            } else {
                rrSeriesLabel.setVisibility(View.GONE);
                btnRrNext.setVisibility(View.GONE);
                rrFinalTitle.setVisibility(View.GONE);
                rrStandings.setVisibility(View.GONE);
                if (canReplay && !replayDismissed) {
                    replayControls.setVisibility(View.VISIBLE);
                    reshuffleRow.setVisibility(isDoubles ? View.VISIBLE : View.GONE);
                    winnerWaiting.setVisibility(View.GONE);
                    // VARIAÇÃO Rei/Rainha: 2 pares distintos jogados, falta o 3º →
                    // o toggle vira "👑 Rei/Rainha" DOURADO e um pouco maior.
                    rrSuggestNow = s.optBoolean("rrSuggest", false);
                    if (rrSuggestNow) {
                        reshuffleLabel.setText("👑 Rei/\nRainha");
                        reshuffleLabel.setTextColor(getColor(R.color.rr_amber));
                        reshuffleLabel.setTextSize(13);
                        reshuffleLabel.setTypeface(null, android.graphics.Typeface.BOLD);
                        reshuffleSwitch.setThumbTintList(getColorStateList(R.color.rr_amber));
                    } else {
                        reshuffleLabel.setText("Re-sortear\nduplas");
                        reshuffleLabel.setTextColor(getColor(R.color.meta));
                        reshuffleLabel.setTextSize(11);
                        reshuffleLabel.setTypeface(null, android.graphics.Typeface.NORMAL);
                        reshuffleSwitch.setThumbTintList(null);
                    }
                    // Reaplica a cor do Iniciar conforme o estado atual do switch.
                    boolean gold = rrSuggestNow && reshuffleSwitch.isChecked();
                    btnReplayConfirm.setBackgroundColor(getColor(gold ? R.color.rr_amber : R.color.start_green));
                    btnReplayConfirm.setTextColor(getColor(gold ? R.color.rr_amber_text : R.color.start_green_text));
                    if (mScale != 1f) scaleTree(reshuffleLabel, mScale);
                } else {
                    replayControls.setVisibility(View.GONE);
                    // Sem controles = à espera do celular (não é "travado").
                    winnerWaiting.setVisibility(View.VISIBLE);
                }
            }

            winnerOverlay.setVisibility(View.VISIBLE);
            tieOverlay.setVisibility(View.GONE);
            halfLeft.setClickable(false);
            halfRight.setClickable(false);
        } else {
            winnerOverlay.setVisibility(View.GONE);
            replayDismissed = false;   // recomeçou → prompt volta a aparecer

            // #3: Empate esperando decisão (5-5, 6-6, 7-7…) — cobre as metades e
            // trava os +1 até prorrogar ou ativar o tie-break.
            if (tiePending) {
                int tiedAt = s.isNull("tiedAt")
                    ? (games != null ? games.optInt(leftTeam - 1, 0) : 0)
                    : s.optInt("tiedAt", 0);
                // Placar do empate em games (cor dos times, esquerda/direita).
                tieScoreL.setText(String.valueOf(tiedAt));
                tieScoreL.setTextColor(getColor(leftTeam == 1 ? R.color.team_blue : R.color.team_red));
                tieScoreR.setText(String.valueOf(tiedAt));
                tieScoreR.setTextColor(getColor(rightTeam == 1 ? R.color.team_blue : R.color.team_red));
                tieOverlay.setVisibility(View.VISIBLE);
                halfLeft.setClickable(false);
                halfRight.setClickable(false);
            } else {
                tieOverlay.setVisibility(View.GONE);
                halfLeft.setClickable(true);
                halfRight.setClickable(true);
            }
        }
    }

    // Slot (time, índice) que o Confirmar aplica quando nada foi tocado: o que o
    // motor já ocupa (servePickCurrent). {0,-1} se não achar na lista elegível.
    private int[] resolveCurrentSlot() {
        if (serveEligible != null) {
            for (int i = 0; i < serveEligible.length(); i++) {
                JSONObject o = serveEligible.optJSONObject(i);
                if (o != null && servePickCurrent.equals(o.optString("name", ""))) {
                    return new int[]{ o.optInt("team", 0), o.optInt("playerIdx", -1) };
                }
            }
        }
        return new int[]{ 0, -1 };
    }

    // Nomes na tela Iniciar = ESCOLHA DO 1º SACADOR (espelha o startNameRow do
    // Apple). Cada nome é tappável → sendSetServer(team,idx); o aceso (== serverName
    // do snapshot) ganha box laranja + bola à esquerda, na cor FORTE do time (= nº
    // 30-40 do placar). O motor decide se a escolha vale; o relógio só dispara.
    private void buildStartPlayers(JSONObject teams, int leftTeam, int rightTeam, String serverName) {
        startPlayers.removeAllViews();
        float d = getResources().getDisplayMetrics().density;
        int[] order = { leftTeam, rightTeam };
        for (int team : order) {
            if (teams == null) continue;
            JSONObject t = teams.optJSONObject(String.valueOf(team));
            if (t == null) continue;
            JSONArray pl = t.optJSONArray("players");
            if (pl == null) continue;
            int cName = getColor(team == 1 ? R.color.team_blue : R.color.team_red);
            for (int i = 0; i < pl.length(); i++) {
                final String n = pl.optString(i, "");
                if (n.isEmpty()) continue;
                final int fteam = team, fidx = i;
                boolean isSel = !serverName.isEmpty() && n.equals(serverName);

                LinearLayout row = new LinearLayout(this);
                row.setOrientation(LinearLayout.HORIZONTAL);
                row.setGravity(android.view.Gravity.CENTER);
                row.setPadding((int)(6*d), (int)(3*d), (int)(6*d), (int)(3*d));
                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
                lp.topMargin = (int)(2*d);   // espaço menor entre nomes (ainda tappável)
                row.setLayoutParams(lp);
                // Box laranja só no aceso (fill transparente, borda laranja).
                if (isSel) {
                    android.graphics.drawable.GradientDrawable box = new android.graphics.drawable.GradientDrawable();
                    box.setCornerRadius(8*d);
                    box.setStroke(Math.max(1, (int)(1.5f*d)), getColor(R.color.serve_sel_stroke));
                    box.setColor(android.graphics.Color.TRANSPARENT);
                    row.setBackground(box);
                }

                TextView dot = new TextView(this);
                dot.setText("●");
                dot.setTextColor(getColor(R.color.serve_ball));
                dot.setTextSize(12);   // bola do saque maior
                dot.setVisibility(isSel ? View.VISIBLE : View.INVISIBLE);
                dot.setPadding(0, 0, (int)(5*d), 0);
                row.addView(dot);

                TextView tv = new TextView(this);
                tv.setText(n);
                tv.setTextColor(cName);
                tv.setTextSize(19);   // menor pra não estourar a borda com os 4 nomes
                tv.setMaxLines(1);
                tv.setTypeface(null, isSel ? android.graphics.Typeface.BOLD : android.graphics.Typeface.NORMAL);
                row.addView(tv);

                row.setClickable(true);
                row.setFocusable(true);
                row.setOnClickListener(v -> sendSetServer(fteam, fidx));
                startPlayers.addView(row);
                if (mScale != 1f) scaleTree(row, mScale); // views dinâmicas nascem após o applyScale do onCreate
            }
        }
    }

    // Linhas do seletor de sacador — MESMO visual dos nomes do Iniciar (nome grande
    // na cor FORTE do time, box + bola no aceso). Aceso = pendingPick ou, na
    // abertura, quem já ocupa o slot (servePickCurrent). Tocar SÓ acende; o
    // Confirmar é que aplica. Nomes DISTRIBUÍDOS por espaçadores de peso igual.
    private void renderServeOverlay() {
        serveList.removeAllViews();
        if (serveEligible == null) return;
        float d = getResources().getDisplayMetrics().density;
        String selected = pendingPickName != null ? pendingPickName : servePickCurrent;
        int n = serveEligible.length();
        for (int i = 0; i < n; i++) {
            JSONObject o = serveEligible.optJSONObject(i);
            if (o == null) continue;
            final int team = o.optInt("team", 0);
            final int idx = o.optInt("playerIdx", -1);
            final String name = o.optString("name", "");
            if (name.isEmpty()) continue;
            boolean isSel = name.equals(selected) && !name.isEmpty();

            // Espaçador de peso antes de cada nome → distribui pela altura.
            View sp = new View(this);
            sp.setLayoutParams(new LinearLayout.LayoutParams(1, 0, 1f));
            serveList.addView(sp);

            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setGravity(android.view.Gravity.CENTER);
            row.setPadding((int)(6*d), (int)(3*d), (int)(6*d), (int)(3*d));
            row.setLayoutParams(new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));
            if (isSel) {
                android.graphics.drawable.GradientDrawable box = new android.graphics.drawable.GradientDrawable();
                box.setCornerRadius(8*d);
                box.setStroke(Math.max(1, (int)(1.5f*d)), getColor(R.color.serve_sel_stroke));
                box.setColor(android.graphics.Color.TRANSPARENT);
                row.setBackground(box);
            }

            TextView dot = new TextView(this);
            dot.setText("●");
            dot.setTextColor(getColor(R.color.serve_ball));
            dot.setTextSize(12);
            dot.setVisibility(isSel ? View.VISIBLE : View.INVISIBLE);
            dot.setPadding(0, 0, (int)(5*d), 0);
            row.addView(dot);

            TextView tv = new TextView(this);
            tv.setText(name);
            tv.setTextColor(getColor(team == 1 ? R.color.team_blue : R.color.team_red));
            tv.setTextSize(20);
            tv.setMaxLines(1);
            tv.setTypeface(null, isSel ? android.graphics.Typeface.BOLD : android.graphics.Typeface.NORMAL);
            row.addView(tv);

            row.setClickable(true);
            row.setFocusable(true);
            row.setOnClickListener(v -> {
                pendingPickName = name; pendingPickTeam = team; pendingPickIdx = idx;
                renderServeOverlay(); // re-acende no novo nome
            });
            serveList.addView(row);
            if (mScale != 1f) scaleTree(row, mScale);
        }
        // Espaçador final → fecha a distribuição (nomes espalhados por igual).
        View spEnd = new View(this);
        spEnd.setLayoutParams(new LinearLayout.LayoutParams(1, 0, 1f));
        serveList.addView(spEnd);
    }

    // Classificação final do Rei/Rainha: vitórias por PESSOA, invicto (3V) coroado.
    // A ordem e a contagem vêm prontas do celular; o relógio só desenha.
    private void buildRrStandings(JSONArray standings) {
        rrStandings.removeAllViews();
        if (standings == null) return;
        String[] medals = { "🥇", "🥈", "🥉", "4️⃣" };
        int pad = (int) (5 * getResources().getDisplayMetrics().density);
        for (int i = 0; i < standings.length(); i++) {
            JSONObject p = standings.optJSONObject(i);
            if (p == null) continue;
            String name = p.optString("name", "");
            int wins = p.optInt("wins", 0);
            boolean king = wins == 3;

            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setGravity(android.view.Gravity.CENTER_VERTICAL);
            row.setBackgroundColor(getColor(king ? R.color.rr_row_bg : R.color.bg));
            row.setPadding(pad + pad, pad, pad + pad, pad);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            lp.topMargin = pad / 2;
            row.setLayoutParams(lp);

            TextView medal = new TextView(this);
            medal.setText(i < medals.length ? medals[i] : "•");
            medal.setTextSize(12);
            medal.setPadding(0, 0, pad, 0);
            row.addView(medal);

            TextView nm = new TextView(this);
            nm.setText(name);
            nm.setTextColor(getColor(king ? R.color.rr_amber_name : R.color.name_blue_dim));
            nm.setTextSize(13);
            nm.setTypeface(null, king ? android.graphics.Typeface.BOLD : android.graphics.Typeface.NORMAL);
            nm.setMaxLines(1);
            LinearLayout.LayoutParams nlp = new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
            nm.setLayoutParams(nlp);
            row.addView(nm);

            TextView w = new TextView(this);
            w.setText(wins + "V");
            w.setTextColor(getColor(king ? R.color.rr_amber : R.color.meta_dim));
            w.setTextSize(12);
            w.setTypeface(null, android.graphics.Typeface.BOLD);
            row.addView(w);

            rrStandings.addView(row);
            if (mScale != 1f) scaleTree(row, mScale);
        }
    }

    // Nomes do time (um por linha) para a tela de vencedor.
    private String teamNames(JSONObject teams, int team) {
        if (teams == null) return "";
        JSONObject t = teams.optJSONObject(String.valueOf(team));
        if (t == null) return "";
        JSONArray pl = t.optJSONArray("players");
        if (pl == null) return "";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < pl.length(); i++) {
            String n = pl.optString(i, "");
            if (n.isEmpty()) continue;
            if (sb.length() > 0) sb.append("\n");
            sb.append(n);
        }
        return sb.toString();
    }

    // Placar final por lado (esquerda–direita): sets em melhor-de-N, senão games.
    private String scoreLine(int setsToWin, JSONArray sets, JSONArray games, int leftTeam, int rightTeam) {
        if (setsToWin > 1 && sets != null) {
            return "Sets " + sets.optInt(leftTeam - 1, 0) + "–" + sets.optInt(rightTeam - 1, 0);
        }
        int gl = games != null ? games.optInt(leftTeam - 1, 0) : 0;
        int gr = games != null ? games.optInt(rightTeam - 1, 0) : 0;
        return "Games " + gl + "–" + gr;
    }

    private void applySide(boolean left, int team, JSONArray points, JSONArray games,
                           JSONObject teams, JSONObject server) {
        TextView point = left ? pointLeft : pointRight;
        TextView gm = left ? gamesLeft : gamesRight;
        LinearLayout half = left ? halfLeft : halfRight;
        TextView n1 = left ? nameL1 : nameR1, n2 = left ? nameL2 : nameR2;
        TextView b1 = left ? ballL1 : ballR1, b2 = left ? ballL2 : ballR2;

        int cPoint = getColor(team == 1 ? R.color.team_blue : R.color.team_red);
        int cHalf = getColor(team == 1 ? R.color.half_blue : R.color.half_red);
        int cName = getColor(team == 1 ? R.color.name_blue : R.color.name_red);
        int cNameDim = getColor(team == 1 ? R.color.name_blue_dim : R.color.name_red_dim);

        half.setBackgroundColor(cHalf);
        point.setTextColor(cPoint);
        gm.setTextColor(cPoint);

        String pt = points != null ? points.optString(team - 1, "–") : "–";
        point.setText(pt);
        gm.setText(games != null ? String.valueOf(games.optInt(team - 1, 0)) : "");

        String p0 = "", p1 = "";
        if (teams != null) {
            JSONObject t = teams.optJSONObject(String.valueOf(team));
            if (t != null) {
                JSONArray pl = t.optJSONArray("players");
                if (pl != null) { p0 = pl.optString(0, ""); p1 = pl.optString(1, ""); }
            }
        }
        // Nome já vem CURTO do celular (primeiro nome; _watchShortNames) → 1 linha.
        n1.setText(p0); n1.setTextColor(cName);
        n2.setText(p1); n2.setTextColor(cNameDim);

        // Bola GRANDE colada no nome do sacador (lado de fora). GONE quando não
        // saca → o nome fica colado no centro; o sacador ganha a bola do lado de
        // fora sem tirar o nome do lugar (gravity end/start ancora no centro).
        b1.setVisibility(View.GONE);
        b2.setVisibility(View.GONE);
        if (server != null && server.optInt("team", 0) == team) {
            String sn = server.optString("name", "");
            if (!sn.isEmpty()) {
                if (sn.equals(p0)) b1.setVisibility(View.VISIBLE);
                else if (sn.equals(p1)) b2.setVisibility(View.VISIBLE);
            }
        }
    }
}
