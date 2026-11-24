package app.scoreplace.wear;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageManager;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.text.SpannableString;
import android.text.style.ForegroundColorSpan;
import android.view.Gravity;
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
 * Contrato: docs/smartwatch-bridge.md.
 *
 * ⚠️ O RELÓGIO DEIXOU DE SER BURRO (Caminho B, ago/2026). Este cabeçalho dizia
 * "toque = intenção enviada via Data Layer; renderiza o estado que o celular
 * devolve" — era verdade até o incidente de 13/ago mostrar o limite: o motor
 * vivia no JS da WebView, que o sistema SUSPENDE com o celular bloqueado (o
 * estado normal do celular na beira da quadra), e os toques chegavam em rajada.
 * Agora há um motor NATIVO (ScoreEngine.java, paridade provada contra o motor
 * canônico por vetores) e a posse é decidida pelo WearMatchSession.
 *
 * O que NÃO mudou: o placar OFICIAL continua saindo do motor JS do celular, que
 * reproduz o diário de eventos daqui. Erro do motor nativo é cosmético e vira
 * teste vermelho, nunca dado errado. E sem os campos novos no snapshot (app do
 * celular antigo) nada disto arma — o caminho antigo segue intacto.
 */
public class MainActivity extends Activity implements MessageClient.OnMessageReceivedListener {

    private static final String PATH_STATE = "/scoreplace/state";
    private static final String PATH_INTENT = "/scoreplace/intent";
    /** Resumo do treino da partida → celular grava no Health Connect (ver WorkoutRecorder.kt). */
    private static final String PATH_WORKOUT = "/scoreplace/workout";

    // ── CAMINHO B ── posse + diario (docs/smartwatch-bridge.md). O relogio
    // deixou de depender do celular ACORDADO a cada toque: quando a partida
    // comeca com ele junto, um motor NATIVO conta aqui e o toque responde na
    // hora; o diario viaja pro celular quando da, e e' sempre o motor JS
    // canonico de la que grava placar oficial/Firestore. Sem os campos novos no
    // snapshot (app do celular antigo) nada disto arma — o caminho de intencao
    // unitaria segue intacto. Espelho de ios/.../WatchMatchSession.swift.
    private final WearMatchSession match = new WearMatchSession();
    /** Identidade no diario — a dedup do celular e' por `deviceId#n`. */
    private final String deviceId = "wear-" + UUID.randomUUID().toString().substring(0, 8);

    private final Handler ui = new Handler(Looper.getMainLooper());
    private int courtLeft = 1; // qual time está à esquerda (vem do estado)
    private View scorePage;

    private LinearLayout halfLeft, halfRight;
    private TextView btnUndo;
    private TextView pointLeft, pointRight, gamesLeft, gamesRight, gamesLabel;
    private TextView nameL1, nameL2, nameR1, nameR2;
    private View winnerOverlay, replayControls, reshuffleRow, tieOverlay;
    private TextView winnerLabel, winnerNames, winnerScoreL, winnerScoreR;
    private TextView setsLeft, setsRight;
    private TextView winnerSport;
    private TextView hrPill;      // ♥ BPM em cápsula no topo-centro (cor da faixa de queima)
    private int hrMax = 0;        // FCmáx vinda do celular (220 − idade do perfil); 0 = sem faixa
    private TextView btnReplayCancel, btnReplayConfirm, reshuffleLabel;
    private boolean rrSuggestNow = false;   // fim de jogo com sugestão de Rei/Rainha
    private TextView tieScoreL, tieScoreR, btnTieExtend, btnTieTiebreak;
    private Switch reshuffleSwitch, rrSwitch, mixedSwitch;
    private View mixedCol;
    private TextView rrIcon, mixedIcon;
    // Guarda contra reentrância: setChecked() dispara o listener, e sem isto o
    // relógio reenviaria a intenção que ACABOU de chegar do celular — laço.
    private boolean aplicandoDoCelular = false;
    private boolean replayDismissed = false; // Cancelar esconde o prompt

    // Iniciar (start)
    private View startOverlay;
    private View idleOverlay;
    private TextView btnStart;
    private TextView startSport;
    private LinearLayout startPlayers;
    // Seletor de sacador
    private LinearLayout serveList;
    private TextView btnServeConfirm;
    private TextView servePrompt, serveSport;
    private View serveOverlay;
    // Rei/Rainha (na tela de vencedor)
    private TextView rrSeriesLabel, btnRrNext, rrFinalTitle, winnerWaiting;
    private LinearLayout rrStandings;

    // Estado do seletor de sacador. pendingPick = escolha ainda não confirmada;
    // vazio → o Confirmar mantém quem o motor já assumiu (servePickCurrent).
    private String pendingPickName = null;
    private int pendingPickTeam = 0, pendingPickIdx = -1;
    private String servePickCurrent = "";
    // Tela INICIAR: o que precisa pra redesenhar a lista sem esperar snapshot novo,
    // e o slot que o "Iniciar" aplica quando ninguém tocou em nome nenhum.
    private JSONObject startTeams = null;
    private int startLeftTeam = 1, startRightTeam = 2;
    private String startServerName = "";
    private int startCurTeam = 0, startCurIdx = -1;
    private int lastServePhase = -99;   // detecta a virada 0→1 pra abrir o seletor
    private boolean lastPickOpen = false; // detecta o celular ABRINDO a escolha do sacador
    private org.json.JSONArray serveEligible = null;
    private boolean serveOpen = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        androidx.core.splashscreen.SplashScreen splash = androidx.core.splashscreen.SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        splash.setOnExitAnimationListener(provider -> {
            // The Wear launcher may scale its own icon during its entry animation.
            // Hand off with the app's 48dp mark at its intrinsic size on pure black.
            View surface = provider.getView();
            provider.getIconView().setVisibility(View.INVISIBLE);
            surface.setBackgroundColor(Color.BLACK);
            surface.setForeground(getDrawable(R.drawable.splash_icon));
            android.animation.ObjectAnimator exit = android.animation.ObjectAnimator.ofInt(
                    surface.getForeground(), "alpha", 255, 0);
            exit.setDuration(getResources().getInteger(android.R.integer.config_shortAnimTime));
            exit.addListener(new android.animation.AnimatorListenerAdapter() {
                @Override public void onAnimationEnd(android.animation.Animator animation) {
                    provider.remove();
                }
            });
            exit.start();
        });

        scorePage = findViewById(R.id.score_page);
        halfLeft = findViewById(R.id.half_left);
        halfRight = findViewById(R.id.half_right);
        btnUndo = findViewById(R.id.btn_undo);
        pointLeft = findViewById(R.id.point_left);
        pointRight = findViewById(R.id.point_right);
        gamesLeft = findViewById(R.id.games_left);
        gamesRight = findViewById(R.id.games_right);
        nameL1 = findViewById(R.id.name_l1); nameL2 = findViewById(R.id.name_l2);
        nameR1 = findViewById(R.id.name_r1); nameR2 = findViewById(R.id.name_r2);
        setsLeft = findViewById(R.id.sets_arc_left);
        setsRight = findViewById(R.id.sets_arc_right);
        hrPill = findViewById(R.id.hr_pill);
        winnerOverlay = findViewById(R.id.winner_overlay);
        winnerLabel = findViewById(R.id.winner_label);
        winnerNames = findViewById(R.id.winner_names);
        winnerScoreL = findViewById(R.id.winner_score_l);
        winnerScoreR = findViewById(R.id.winner_score_r);
        winnerSport = findViewById(R.id.winner_arc_sport);
        replayControls = findViewById(R.id.replay_controls);
        reshuffleRow = findViewById(R.id.reshuffle_row);
        reshuffleSwitch = findViewById(R.id.reshuffle_switch);
        reshuffleLabel = findViewById(R.id.reshuffle_label);
        rrSwitch = findViewById(R.id.rr_switch);
        rrIcon = findViewById(R.id.rr_icon);
        mixedSwitch = findViewById(R.id.mixed_switch);
        mixedIcon = findViewById(R.id.mixed_icon);
        mixedCol = findViewById(R.id.mixed_col);
        btnReplayCancel = findViewById(R.id.btn_replay_cancel);
        btnReplayConfirm = findViewById(R.id.btn_replay_confirm);
        tieOverlay = findViewById(R.id.tie_overlay);
        tieScoreL = findViewById(R.id.tie_score_l);
        tieScoreR = findViewById(R.id.tie_score_r);
        btnTieExtend = findViewById(R.id.btn_tie_extend);
        btnTieTiebreak = findViewById(R.id.btn_tie_tiebreak);
        gamesLabel = findViewById(R.id.games_label);
        startOverlay = findViewById(R.id.start_overlay);
        idleOverlay = findViewById(R.id.idle_overlay);
        startSport = findViewById(R.id.start_arc_sport);
        startPlayers = findViewById(R.id.start_players);
        btnStart = findViewById(R.id.btn_start);
        serveOverlay = findViewById(R.id.serve_overlay);
        serveList = findViewById(R.id.serve_list);
        servePrompt = findViewById(R.id.serve_arc_prompt);
        serveSport = findViewById(R.id.serve_arc_sport);
        btnServeConfirm = findViewById(R.id.btn_serve_confirm);
        rrSeriesLabel = findViewById(R.id.rr_series_label);
        btnRrNext = findViewById(R.id.btn_rr_next);
        rrFinalTitle = findViewById(R.id.rr_final_title);
        rrStandings = findViewById(R.id.rr_standings);
        winnerWaiting = findViewById(R.id.winner_waiting);

        // "Iniciar" = o CONFIRMAR da tela de montagem: APLICA o 1º sacador escolhido
        // e só então dispara a MESMA _casualStart() do celular. Antes, tocar num nome
        // mandava o setServer na hora — mas no lobby o placar ainda não existe, o
        // celular só guarda a escolha (_pendingServerPick) e o snapshot NÃO muda:
        // resultado, tocar num nome não acendia nada na tela. Agora o toque só
        // ACENDE (local) e o envio acontece aqui, na ordem certa.
        btnStart.setOnClickListener(v -> {
            int team = pendingPickTeam, idx = pendingPickIdx;
            if (pendingPickName == null) { team = startCurTeam; idx = startCurIdx; }
            if ((team == 1 || team == 2) && idx >= 0) sendSetServer(team, idx);
            pendingPickName = null;
            sendIntent("start", 0);
        });
        // Confirmar aplica a escolha (ou mantém a atual) e fecha.
        btnServeConfirm.setOnClickListener(v -> {
            int team = pendingPickTeam, idx = pendingPickIdx;
            if (pendingPickName == null) { int[] cur = resolveCurrentSlot(); team = cur[0]; idx = cur[1]; }
            if (team == 1 || team == 2) if (idx >= 0) sendSetServer(team, idx);
            serveOpen = false; pendingPickName = null;
            serveOverlay.setVisibility(View.GONE);
            scorePage.setVisibility(View.VISIBLE);
        });

        // Toque por POSIÇÃO → intenção pra o TIME que está naquele lado.
        halfLeft.setOnClickListener(v -> sendPoint(courtLeft));
        halfRight.setOnClickListener(v -> sendPoint(courtLeft == 1 ? 2 : 1));
        btnUndo.setOnClickListener(v -> sendUndo());
        // "Jogar novamente?" — Cancelar dispensa o prompt; Confirmar manda a
        // intenção pro celular recomeçar (com/sem re-sortear as duplas).
        // v1.7.67: ENCERRAR manda a ordem pro celular em vez de só esconder o painel
        // aqui. Antes isto era estado LOCAL — o celular seguia com o placar aberto e
        // este app ficava preso na tela de resultado da última partida (mesmo defeito
        // do watchOS; os dois só mexiam em `replayDismissed`). Esconder na hora
        // continua, senão o painel piscaria de volta enquanto a resposta não chega;
        // quem tira daqui de vez é o estado INATIVO que o celular devolve.
        btnReplayCancel.setOnClickListener(v -> {
            replayDismissed = true;
            replayControls.setVisibility(View.GONE);
            sendIntent("close", 0);
        });
        btnReplayConfirm.setOnClickListener(v -> {
            // Com a sugestão na tela, a COROA é o gesto de aceitar a série;
            // fora dela ela é só o interruptor e o Iniciar faz replay normal.
            if (rrSuggestNow && rrSwitch.isChecked()) sendRrActivate();
            else sendReplay(reshuffleSwitch.isChecked());
        });
        // 👑 — com a sugestão na tela é a escolha do que o Iniciar vai fazer
        // (estado LOCAL, igual ao 🎲); fora dela é CONFIGURAÇÃO da sessão e
        // quem manda é o celular, então só mandamos a intenção.
        rrSwitch.setOnCheckedChangeListener((b, checked) -> {
            if (aplicandoDoCelular) return;
            if (!rrSuggestNow) sendToggle("setRR", checked);
            pintarIniciar();
        });
        // ⚥ duplas mistas — sempre configuração da sessão.
        mixedSwitch.setOnCheckedChangeListener((b, checked) -> {
            if (aplicandoDoCelular) return;
            sendToggle("setMixed", checked);
        });
        // 🎲 re-sortear: estado LOCAL (decide o que ESTE Iniciar faz), não vai
        // pro celular — some quando a tela fecha.
        reshuffleSwitch.setOnCheckedChangeListener((b, checked) -> pintarIniciar());
        // Empate → prorrogar (mantém 'ask' no motor → recorre) ou tie-break.
        btnTieExtend.setOnClickListener(v -> sendResolveTie("extend"));
        btnTieTiebreak.setOnClickListener(v -> sendResolveTie("tiebreak"));

        applyPreviewExtras();
    }

    /**
     * FERRAMENTA DE VERIFICAÇÃO — só em build DEBUGGABLE. Renderiza um snapshot
     * vindo por extra do Intent, pra conferir as telas no emulador sem precisar
     * parear um celular de verdade. É o equivalente Wear do SP_MOCK do preview
     * Apple (ios/WatchApp). Em RELEASE o extra é ignorado por completo — o relógio
     * só desenha o que o celular manda, e ninguém injeta placar de fora.
     *   adb shell am start -n app.scoreplace/app.scoreplace.wear.MainActivity \
     *     --es sp_mock '{"active":true,...}' --ei sp_bpm 152
     */
    private void applyPreviewExtras() {
        if ((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) == 0) return;
        android.content.Intent it = getIntent();
        if (it == null) return;
        String mock = it.getStringExtra("sp_mock");
        if (mock != null) {
            try { render(new JSONObject(mock)); } catch (Exception e) { /* json ruim: ignora */ }
        }
        int bpm = it.getIntExtra("sp_bpm", 0);
        if (bpm > 0) { lastBpm = bpm; renderHeartRate(); }
    }

    private int dp(float value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void sendResolveTie(String rule) {
        if (localFirst("resolveTie", 0, -1, rule)) return;
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

    // Rei/Rainha aceito → o Iniciar fica DOURADO (vai começar a série).
    private void pintarIniciar() {
        boolean gold = rrSuggestNow && rrSwitch.isChecked();
        btnReplayConfirm.setBackgroundTintList(getColorStateList(gold ? R.color.rr_amber : R.color.start_green));
        btnReplayConfirm.setTextColor(getColor(gold ? R.color.rr_amber_text : R.color.start_green_text));
    }

    // Interruptor de CONFIGURAÇÃO (👑 fora da sugestão, ⚥ mistas): o relógio só
    // manda a intenção; o estado volta no próximo snapshot. Guardar cópia local
    // faria celular e relógio divergirem na mesma sessão.
    private void sendToggle(String tipo, boolean on) {
        try {
            JSONObject o = new JSONObject();
            o.put("v", 1);
            o.put("type", tipo);
            o.put("on", on);
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
        // Caminho B: no motor o pick sao DOIS eventos — medido nos vetores;
        // ponto com o seletor ABERTO e' bloqueado, entao confirmar faz parte do
        // gesto, nao e' enfeite.
        if (match.localEvent("serveSelect", team, playerIdx, null)) {
            match.localEvent("serveConfirm", 0, -1, null);
            renderLocal();
            flushJournal();
            return;
        }
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

    // Chegou algum estado do celular nesta sessão de tela? Usado pra parar o retry do hello.
    private boolean gotStateSinceResume = false;

    // ── ♥ BATIMENTO CARDÍACO + TREINO ────────────────────────────────────────
    // SensorManager TYPE_HEART_RATE enquanto a tela está viva e há partida AO VIVO.
    // Degrada em silêncio: sem permissão, sem sensor ou sem leitura, o arco fica GONE.
    //
    // O ESFORÇO NÃO É DESCARTADO (paridade com o Apple, que grava HKWorkout): as
    // amostras de BPM viram um resumo de treino que é enviado ao CELULAR no fim da
    // partida, e lá é gravado no Health Connect (ExerciseSessionRecord +
    // HeartRateRecord) → conta nos exercícios e na atividade diária. O Health Connect
    // NÃO existe no relógio (é plataforma de celular), por isso a ponte.
    private static final int REQ_BODY_SENSORS = 4201;
    /** Treinos mais curtos que isso não valem registro (toque acidental no placar). */
    private static final long WORKOUT_MIN_MS = 60_000L;
    /** 1 amostra a cada 5s basta pro HeartRateRecord; evita mensagem gigante. */
    private static final long HR_SAMPLE_EVERY_MS = 5_000L;
    private SensorManager sensorMgr;
    private Sensor hrSensor;
    private Integer lastBpm = null;
    private boolean hrRegistered = false;

    // Acumuladores do treino em curso. Sobrevivem ao apagar da tela (a sessão só
    // encerra quando a partida deixa de estar AO VIVO ou o app sai de cena).
    private long wkStartMs = 0L, wkEndMs = 0L, wkLastSampleMs = 0L;
    private int wkCount = 0, wkSum = 0, wkMax = 0, wkMin = 0;
    private final JSONArray wkSamples = new JSONArray();

    private final SensorEventListener hrListener = new SensorEventListener() {
        @Override public void onSensorChanged(SensorEvent e) {
            if (e.values == null || e.values.length == 0) return;
            int v = Math.round(e.values[0]);
            if (v <= 0) return;                       // 0 = sensor sem contato com a pele
            lastBpm = v;
            accumulateWorkout(v);
            ui.post(() -> renderHeartRate());
        }
        @Override public void onAccuracyChanged(Sensor s, int a) { }
    };

    /** Soma a leitura no treino em curso (média/máx/mín + amostra a cada 5s). */
    private void accumulateWorkout(int bpm) {
        long now = System.currentTimeMillis();
        if (wkStartMs == 0L) wkStartMs = now;
        wkEndMs = now;
        wkCount++;
        wkSum += bpm;
        if (bpm > wkMax) wkMax = bpm;
        if (wkMin == 0 || bpm < wkMin) wkMin = bpm;
        if (now - wkLastSampleMs >= HR_SAMPLE_EVERY_MS) {
            wkLastSampleMs = now;
            try {
                JSONObject s = new JSONObject();
                s.put("t", now);
                s.put("bpm", bpm);
                wkSamples.put(s);
            } catch (Exception ignored) { }
        }
    }

    /**
     * Fecha o treino e manda o resumo pro celular gravar no Health Connect.
     * Idempotente: zera os acumuladores, então chamar duas vezes não duplica.
     * Espelha o `finishWorkout()` do HeartRate.swift no lado Apple.
     */
    private void finishWorkoutAndSend() {
        if (wkStartMs == 0L || wkCount == 0) { resetWorkout(); return; }
        long start = wkStartMs, end = Math.max(wkEndMs, wkStartMs);
        int count = wkCount, sum = wkSum, max = wkMax, min = wkMin;
        JSONArray samples = new JSONArray();
        for (int i = 0; i < wkSamples.length(); i++) samples.put(wkSamples.optJSONObject(i));
        resetWorkout();
        if (end - start < WORKOUT_MIN_MS) return;      // partida curta demais
        try {
            JSONObject o = new JSONObject();
            o.put("v", 1);
            o.put("id", UUID.randomUUID().toString());
            o.put("startMs", start);
            o.put("endMs", end);
            o.put("avgBpm", Math.round((float) sum / count));
            o.put("maxBpm", max);
            o.put("minBpm", min);
            o.put("samples", samples);
            final byte[] bytes = o.toString().getBytes(StandardCharsets.UTF_8);
            Wearable.getNodeClient(this).getConnectedNodes()
                .addOnSuccessListener(nodes -> {
                    MessageClient mc = Wearable.getMessageClient(this);
                    for (Node node : nodes) mc.sendMessage(node.getId(), PATH_WORKOUT, bytes);
                });
        } catch (Exception e) { /* sem nó / json: no-op */ }
    }

    private void resetWorkout() {
        wkStartMs = 0L; wkEndMs = 0L; wkLastSampleMs = 0L;
        wkCount = 0; wkSum = 0; wkMax = 0; wkMin = 0;
        while (wkSamples.length() > 0) wkSamples.remove(0);
    }

    private void startHeartRate() {
        if (hrRegistered) return;
        if (sensorMgr == null) sensorMgr = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
        if (sensorMgr == null) return;
        if (hrSensor == null) hrSensor = sensorMgr.getDefaultSensor(Sensor.TYPE_HEART_RATE);
        if (hrSensor == null) return;                 // relógio sem sensor de HR
        if (checkSelfPermission(Manifest.permission.BODY_SENSORS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{ Manifest.permission.BODY_SENSORS }, REQ_BODY_SENSORS);
            return;                                   // volta em onRequestPermissionsResult
        }
        hrRegistered = sensorMgr.registerListener(hrListener, hrSensor, SensorManager.SENSOR_DELAY_UI);
    }

    private void stopHeartRate() {
        if (sensorMgr != null && hrRegistered) sensorMgr.unregisterListener(hrListener);
        hrRegistered = false;
        lastBpm = null;
        ui.post(() -> renderHeartRate());
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] res) {
        super.onRequestPermissionsResult(req, perms, res);
        if (req == REQ_BODY_SENSORS && res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED) {
            startHeartRate();
        }
    }

    /**
     * Cor da FAIXA DE QUEIMA (5 zonas por % da FCmáx), do azul ao vermelho — mesma
     * régua e mesmas cores do Apple (ScoreState.hrZone + Color.spZone1..5).
     * Devolve 0 quando não dá pra saber (perfil sem data de nascimento): aí não se
     * pinta faixa nenhuma, porque zona chutada é pior que zona nenhuma.
     */
    private int hrZoneColor(int bpm) {
        if (hrMax <= 0 || bpm <= 0) return 0;
        float pct = (float) bpm / (float) hrMax;
        if (pct < 0.60f) return getColor(R.color.hr_zone1);
        if (pct < 0.70f) return getColor(R.color.hr_zone2);
        if (pct < 0.80f) return getColor(R.color.hr_zone3);
        if (pct < 0.90f) return getColor(R.color.hr_zone4);
        return getColor(R.color.hr_zone5);
    }

    private static int withAlpha(int color, int alpha) {
        return (alpha << 24) | (color & 0x00FFFFFF);
    }

    /** Desenha o ♥ na cápsula do topo-centro e o faz pulsar NO RITMO do batimento. */
    private void renderHeartRate() {
        if (hrPill == null) return;
        if (lastBpm == null) { hrPill.setVisibility(View.GONE); hrPill.clearAnimation(); return; }
        // ♥ 20% menor que o número (dono, 30/jul/2026: "coração ficou grande").
        // No Apple são dois Text com tamanhos próprios; aqui é UM TextView, então a
        // diferença vem de um span relativo só no glifo.
        android.text.SpannableString hrTxt = new android.text.SpannableString("♥ " + lastBpm);
        hrTxt.setSpan(new android.text.style.RelativeSizeSpan(0.8f), 0, 1,
                      android.text.Spannable.SPAN_EXCLUSIVE_EXCLUSIVE);
        hrPill.setText(hrTxt);
        // Cápsula pintada com a cor da faixa; sem FCmáx, cápsula neutra + rosa.
        int zc = hrZoneColor(lastBpm);
        float d = getResources().getDisplayMetrics().density;
        if (zc != 0) {
            android.graphics.drawable.GradientDrawable pill = new android.graphics.drawable.GradientDrawable();
            pill.setCornerRadius(999 * d);
            pill.setColor(withAlpha(zc, 46));                                  // ~18% de fill
            pill.setStroke(Math.max(1, (int) (1.2f * d)), withAlpha(zc, 217));
            hrPill.setBackground(pill);
            hrPill.setTextColor(zc);
        } else {
            hrPill.setBackground(null);
            hrPill.setTextColor(getColor(R.color.hr_pink));
        }
        hrPill.setVisibility(View.VISIBLE);
        long half = Math.max(280, Math.min(900, Math.round(30000.0 / Math.max(lastBpm, 40))));
        android.view.animation.ScaleAnimation pulse = new android.view.animation.ScaleAnimation(
            1f, 1.18f, 1f, 1.18f,
            android.view.animation.Animation.RELATIVE_TO_SELF, 0.5f,
            android.view.animation.Animation.RELATIVE_TO_SELF, 0.5f);
        pulse.setDuration(half);
        pulse.setRepeatMode(android.view.animation.Animation.REVERSE);
        pulse.setRepeatCount(android.view.animation.Animation.INFINITE);
        pulse.setInterpolator(new android.view.animation.AccelerateDecelerateInterpolator());
        hrPill.startAnimation(pulse);
    }

    @Override
    protected void onResume() {
        super.onResume();
        Wearable.getMessageClient(this).addListener(this);
        gotStateSinceResume = false;
        sendIntent("hello", 0); // pede o estado atual ao celular
        // O `hello` era UM tiro: se o app do celular estava fechado/suspenso, ninguém
        // respondia e o relógio ficava em "Aguardando…" pra sempre — a sensação de
        // "o relógio nunca conversou com o celular". Insiste com espera crescente até
        // chegar estado (ver retryHello). Espelha o WatchSession do lado Apple.
        retryHello(0);
    }

    /**
     * ⚠️ v1.8.84 — antes eram 3 tentativas a cada 2s e depois DESISTIA pra sempre.
     * Relato do dono (no relógio Apple, e o Wear tinha o MESMO defeito): "os nomes do
     * celular só vêm quando toca na tela". É isto: com o celular bloqueado — o estado
     * normal dele na beira da quadra — o app de lá não responde ao `hello`, os 6 segundos
     * passam, e o relógio fica calado. Aí qualquer toque manda uma intenção, ACORDA o app
     * do celular, e a resposta traz os nomes: parecia que só o toque buscava o estado,
     * quando era o toque acordando quem devia ter respondido.
     * Agora insiste ~2 min com espera CRESCENTE (2,3,4…15s) — pega o celular que acorda
     * tarde sem martelar o rádio a cada 2s. Para sozinho no 1º estado que chega
     * (`gotStateSinceResume`), e o `onResume` rearma a cada volta à tela.
     * Espelha o WatchSession.retryHelloUntilAnswered do lado Apple.
     */
    private void retryHello(int attempt) {
        if (attempt >= 20 || gotStateSinceResume) return;
        long espera = Math.min(2000L + attempt * 1000L, 15000L);
        ui.postDelayed(() -> {
            if (gotStateSinceResume) return;
            sendIntent("hello", 0);
            retryHello(attempt + 1);
        }, espera);
    }

    @Override
    protected void onPause() {
        super.onPause();
        Wearable.getMessageClient(this).removeListener(this);
        stopHeartRate();   // sensor desligado fora da tela = bateria
        // NÃO fecha o treino aqui: apagar a tela no meio do jogo não é fim de partida.
        // O fechamento é no onStop (app saiu de cena) ou quando o estado vira active=false.
    }

    @Override
    protected void onStop() {
        super.onStop();
        // App saiu de cena de vez: grava o que já foi medido em vez de jogar fora.
        finishWorkoutAndSend();
    }

    private void sendPoint(int team) {
        if (localFirst("point", team, -1, null)) return;   // Caminho B: conta AQUI
        sendIntent("point", team);
    }
    private void sendUndo() {
        if (localFirst("undo", 0, -1, null)) return;
        sendIntent("undo", 0);
    }

    /** Aplica no motor local, redesenha e manda o diario. false = sem motor. */
    private boolean localFirst(String kind, int team, int playerIdx, String rule) {
        if (!match.localEvent(kind, team, playerIdx, rule)) return false;
        renderLocal();
        flushJournal();
        return true;
    }
    /** A tela desenha o que a POSSE mandar (motor local x espelho do celular). */
    private void renderLocal() {
        final org.json.JSONObject st = match.displayState();
        ui.post(() -> { try { render(st); } catch (Exception e) { /* ignore */ } });
    }
    /** Empurra o diario pendente. Reenviar e' IDEMPOTENTE de proposito (dedup
     *  por `deviceId#n` no celular) — e' o que faz o lote sobreviver a celular
     *  suspenso, que foi a causa do incidente de 13/ago. */
    private void flushJournal() {
        org.json.JSONObject evlog = match.pendingEvlog(deviceId);
        if (evlog != null) sendIntentObject(evlog);
    }
    /** Envia uma intencao JA MONTADA (o evlog tem lista de eventos, entao nao
     *  cabe no sendIntent(type, team)). */
    private void sendIntentObject(org.json.JSONObject o) {
        try {
            final byte[] bytes = o.toString().getBytes(StandardCharsets.UTF_8);
            Wearable.getNodeClient(this).getConnectedNodes()
                .addOnSuccessListener(nodes -> {
                    MessageClient mc = Wearable.getMessageClient(this);
                    for (Node node : nodes) mc.sendMessage(node.getId(), PATH_INTENT, bytes);
                });
        } catch (Exception e) { /* sem no: no-op */ }
    }

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
        gotStateSinceResume = true; // chegou estado → para o retry do hello
        ui.post(() -> {
            try {
                // Caminho B: a SESSAO decide o que a tela ve (motor local x
                // espelho) e guarda este snapshot como espelho. Sem os campos
                // novos ela nunca arma o motor e devolve o proprio espelho —
                // exatamente o comportamento anterior.
                match.ingest(new JSONObject(json));
                render(match.displayState());
                flushJournal();   // voltou a falar? reenvia o diario pendente
            } catch (Exception e) { /* ignore */ }
        });
    }

    private void render(JSONObject s) {
        boolean active = s.optBoolean("active", false);
        // FCmáx vem PRONTA do celular (220 − idade do perfil) — o relógio não tem
        // acesso ao perfil e nunca deriva isso sozinho. 0 = sem faixa de queima.
        hrMax = s.optInt("hrMax", 0);
        // ♥ só enquanto há partida AO VIVO — sensor ligado com o placar parado é
        // bateria queimada à toa. Espelha o start/stop do lado Apple.
        // Partida deixou de estar AO VIVO = fim do treino: fecha e manda pro celular.
        if (active) {
            startHeartRate();
        } else {
            stopHeartRate();
            finishWorkoutAndSend();
        }
        courtLeft = s.optInt("courtLeft", 1);
        int leftTeam = courtLeft, rightTeam = leftTeam == 1 ? 2 : 1;
        JSONArray points = s.optJSONArray("points");
        JSONArray games = s.optJSONArray("games");
        JSONObject teams = s.optJSONObject("teams");
        JSONObject server = s.optJSONObject("server");
        applySide(true, leftTeam, points, games, teams, server);
        applySide(false, rightTeam, points, games, teams, server);

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

        setsLeft.setText(String.valueOf(sets != null ? sets.optInt(leftTeam - 1, 0) : 0));
        setsLeft.setTextColor(getColor(leftTeam == 1 ? R.color.team_blue : R.color.team_red));
        setsRight.setText(String.valueOf(sets != null ? sets.optInt(rightTeam - 1, 0) : 0));
        setsRight.setTextColor(getColor(rightTeam == 1 ? R.color.team_blue : R.color.team_red));

        // ── Iniciar: montagem aberta no celular e nada ao vivo ──
        boolean canStart = s.optBoolean("canStart", false);
        if (!active && !finished && canStart) {
            boolean isCasual = s.optBoolean("isCasual", false);
            String sport = s.optString("sportName", "Partida Casual");
            startSport.setText((isCasual ? "⚡ " : "🏆 ") + sport);
            buildStartPlayers(teams, leftTeam, rightTeam,
                              server != null ? server.optString("name", "") : "");
            startOverlay.setVisibility(View.VISIBLE);
        } else {
            startOverlay.setVisibility(View.GONE);
        }
        // ⚠️ Nada ativo E não dá pra iniciar daqui = o placar fechou no celular.
        // Sem esta tela o relógio ficava preso no placar morto (relato do dono).
        idleOverlay.setVisibility((!active && !finished && !canStart) ? View.VISIBLE : View.GONE);

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
        // v1.6.88: o celular manda. `servePickOpen` é o mesmo _needsServePick() que
        // desenha a Tela 1/2 lá — inclui a fase 0 (1º sacador), que a virada de fase
        // acima não cobria na SEGUNDA partida (ela já nasce ativa, então a tela
        // "Iniciar", que era quem perguntava, não aparece). Sem isto o 2º jogo
        // começava sem ninguém escolher o saque.
        // ⚠️ v1.8.84 — E FECHAR TAMBÉM (mesmo conserto do lado Apple). Relato do dono:
        // "confirma o sacador, inicia no celular, mas no relógio tem que confirmar de
        // novo, senão fica na tela de escolha de sacador". Este bloco só ABRIA:
        // `servePickOpen` é o celular dizendo "estou perguntando"; quando vira FALSE a
        // pergunta já foi respondida — do outro lado, mas foi. O relógio ficava com o
        // seletor por cima de uma partida já em andamento.
        // ⚠️ E o `pendingPickName = null` SAIU daqui: era a v1.7.9 do lado Apple, que o
        // Wear nunca recebeu. Quem escolhia o sacador na tela "Iniciar" via o seletor
        // reabrir COM A ESCOLHA APAGADA (o celular liga `servePickOpen` ao abrir o
        // placar) e o Confirmar nascia desabilitado — a pessoa já tinha respondido e
        // ficava presa. Quem zera é a virada de FASE, logo acima, que é onde a pergunta
        // de fato muda (1º → 2º sacador).
        boolean pickOpen = s.optBoolean("servePickOpen", false);
        if (pickOpen != lastPickOpen) {
            serveOpen = pickOpen;
            lastPickOpen = pickOpen;
        }
        // Overlay do seletor (aberto por toque ou pela virada de fase).
        boolean showServe = serveOpen && canSetServer && !finished;
        if (showServe) {
            servePrompt.setText(servePhase == 1 ? "2º sacador" : "1º sacador");
            boolean isCasualS = s.optBoolean("isCasual", false);
            String sportS = s.optString("sportName", "");
            serveSport.setText((isCasualS ? "⚡ " : "🏆 ") + (sportS.isEmpty() ? "Partida" : sportS));
            renderServeOverlay();
        }
        serveOverlay.setVisibility(showServe ? View.VISIBLE : View.GONE);
        scorePage.setVisibility(active && !finished && !tiePending && !showServe ? View.VISIBLE : View.GONE);

        // #2: Fim de jogo — cobre as metades e trava os toques +1.
        if (finished) {
            int winner = s.isNull("winner") ? 0 : s.optInt("winner", 0);
            // Modalidade da partida encerrada.
            boolean isCasualW = s.optBoolean("isCasual", false);
            String sportW = s.optString("sportName", "");
            winnerSport.setText((isCasualW ? "⚡ " : "🏆 ") + (sportW.isEmpty() ? "Partida" : sportW));
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
                    // As três chaves de símbolo. A COROA cresce e fica dourada
                    // quando há sugestão de fechar a série (2 pares distintos
                    // jogados, falta o 3º). Símbolo apagado = desligado: a cor
                    // sozinha não diz o estado no sol nem pra quem distingue
                    // tom com dificuldade.
                    rrSuggestNow = s.optBoolean("rrSuggest", false);
                    boolean mixOn = s.optBoolean("mixedOn", false);
                    boolean rrOn = s.optBoolean("reiRainha", false);
                    boolean podeMix = s.optBoolean("canMix", false);
                    aplicandoDoCelular = true;   // setChecked dispara listener
                    if (rrSuggestNow) {
                        rrIcon.setTextSize(22);
                        rrSwitch.setThumbTintList(getColorStateList(R.color.rr_amber));
                    } else {
                        rrIcon.setTextSize(18);
                        rrSwitch.setThumbTintList(null);
                        rrSwitch.setChecked(rrOn);   // fora da sugestão o estado é do celular
                    }
                    rrIcon.setAlpha(rrSwitch.isChecked() ? 1f : 0.38f);
                    reshuffleLabel.setAlpha(reshuffleSwitch.isChecked() ? 1f : 0.38f);
                    mixedCol.setVisibility(podeMix ? View.VISIBLE : View.GONE);
                    mixedSwitch.setChecked(mixOn);
                    mixedIcon.setAlpha(mixOn ? 1f : 0.38f);
                    aplicandoDoCelular = false;
                    pintarIniciar();
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
    // Apple). Tocar num nome só ACENDE (box na COR DO TIME + bolinha da MODALIDADE
    // à esquerda); quem APLICA é o botão "Iniciar". A escolha aceso = pendingPick
    // (local) ou, sem toque, o sacador que o celular já indica.
    private void buildStartPlayers(JSONObject teams, int leftTeam, int rightTeam, String serverName) {
        startPlayers.removeAllViews();
        // Guarda o contexto pra redesenhar no toque, sem depender de snapshot novo.
        startTeams = teams; startLeftTeam = leftTeam; startRightTeam = rightTeam;
        startServerName = serverName == null ? "" : serverName;
        startCurTeam = 0; startCurIdx = -1;
        String selName = pendingPickName != null ? pendingPickName : startServerName;
        int[] order = { leftTeam, rightTeam };
        for (int team : order) {
            if (teams == null) continue;
            JSONObject t = teams.optJSONObject(String.valueOf(team));
            if (t == null) continue;
            JSONArray pl = t.optJSONArray("players");
            if (pl == null) continue;
            for (int i = 0; i < pl.length(); i++) {
                final String n = pl.optString(i, "");
                if (n.isEmpty()) continue;
                final int fteam = team, fidx = i;
                boolean isSel = !selName.isEmpty() && n.equals(selName);
                if (!startServerName.isEmpty() && n.equals(startServerName)) {
                    startCurTeam = team; startCurIdx = i;   // slot que o Iniciar usa sem toque
                }

                TextView row = playerChoice(n, team, isSel);
                row.setOnClickListener(v -> {
                    pendingPickName = n; pendingPickTeam = fteam; pendingPickIdx = fidx;
                    buildStartPlayers(startTeams, startLeftTeam, startRightTeam, startServerName);
                });
                startPlayers.addView(row);
            }
        }
    }

    private void renderServeOverlay() {
        serveList.removeAllViews();
        if (serveEligible == null) return;
        String selected = pendingPickName != null ? pendingPickName : servePickCurrent;
        for (int i = 0; i < serveEligible.length(); i++) {
            JSONObject entry = serveEligible.optJSONObject(i);
            if (entry == null) continue;
            int team = entry.optInt("team", 0);
            int index = entry.optInt("playerIdx", -1);
            String name = entry.optString("name", "");
            if (name.isEmpty()) continue;
            TextView row = playerChoice(name, team, name.equals(selected));
            row.setOnClickListener(v -> {
                pendingPickName = name; pendingPickTeam = team; pendingPickIdx = index;
                renderServeOverlay();
            });
            serveList.addView(row);
        }
    }

    private CharSequence markedName(String name, boolean server) {
        if (!server) return name;
        SpannableString marked = new SpannableString("● " + name);
        marked.setSpan(new ForegroundColorSpan(getColor(R.color.serve_ball)), 0, 1,
                       android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        return marked;
    }

    private TextView playerChoice(String name, int team, boolean selected) {
        int color = getColor(team == 1 ? R.color.team_blue : R.color.team_red);
        TextView choice = new TextView(this);
        choice.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        choice.setGravity(Gravity.CENTER);
        choice.setText(markedName(name, selected));
        choice.setTextColor(color);
        choice.setTextSize(17);
        choice.setMinHeight(dp(48));
        choice.setPadding(dp(4), dp(3), dp(4), dp(3));
        choice.setFocusable(true);
        choice.setSelected(selected);
        if (selected) {
            GradientDrawable border = new GradientDrawable();
            border.setCornerRadius(dp(8));
            border.setColor(Color.TRANSPARENT);
            border.setStroke(dp(1.5f), color);
            choice.setBackground(border);
            choice.setTypeface(null, Typeface.BOLD);
        }
        return choice;
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

            TextView row = new TextView(this);
            row.setText((i < medals.length ? medals[i] : "•") + " " + name + " · " + wins + "V");
            row.setTextColor(getColor(king ? R.color.rr_amber_name : R.color.name_blue_dim));
            row.setTextSize(15);
            row.setGravity(Gravity.CENTER);
            row.setPadding(pad, pad, pad, pad);
            rrStandings.addView(row, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
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

    private void applySide(boolean left, int team, JSONArray points, JSONArray games,
                           JSONObject teams, JSONObject server) {
        TextView point = left ? pointLeft : pointRight;
        TextView gm = left ? gamesLeft : gamesRight;
        LinearLayout half = left ? halfLeft : halfRight;
        TextView n1 = left ? nameL1 : nameR1, n2 = left ? nameL2 : nameR2;

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
        String serverName = server != null && server.optInt("team", 0) == team
                ? server.optString("name", "") : "";
        n1.setText(markedName(p0, !p0.isEmpty() && p0.equals(serverName)));
        n2.setText(markedName(p1, !p1.isEmpty() && p1.equals(serverName)));
        n1.setTextColor(cName);
        n2.setTextColor(cNameDim);
        n1.setVisibility(p0.isEmpty() ? View.GONE : View.VISIBLE);
        n2.setVisibility(p1.isEmpty() ? View.GONE : View.VISIBLE);
    }
}
