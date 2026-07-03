package app.scoreplace.wear;

import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
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

    private LinearLayout halfLeft, halfRight, btnUndo;
    private TextView pointLeft, pointRight, gamesLeft, gamesRight, setLabel;
    private TextView nameL1, nameL2, nameR1, nameR2, ballL1, ballL2, ballR1, ballR2;
    private LinearLayout setsRow;
    private View winnerOverlay, replayControls, reshuffleRow;
    private TextView setsLeft, setsRight, winnerLabel, winnerNames, winnerScore;
    private TextView btnReplayCancel, btnReplayConfirm;
    private Switch reshuffleSwitch;
    private boolean replayDismissed = false; // Cancelar esconde o prompt

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
        setsRow = findViewById(R.id.sets_row);
        setsLeft = findViewById(R.id.sets_left); setsRight = findViewById(R.id.sets_right);
        winnerOverlay = findViewById(R.id.winner_overlay);
        winnerLabel = findViewById(R.id.winner_label);
        winnerNames = findViewById(R.id.winner_names);
        winnerScore = findViewById(R.id.winner_score);
        replayControls = findViewById(R.id.replay_controls);
        reshuffleRow = findViewById(R.id.reshuffle_row);
        reshuffleSwitch = findViewById(R.id.reshuffle_switch);
        btnReplayCancel = findViewById(R.id.btn_replay_cancel);
        btnReplayConfirm = findViewById(R.id.btn_replay_confirm);

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
        btnReplayConfirm.setOnClickListener(v -> sendReplay(reshuffleSwitch.isChecked()));
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

        // #1: SETS no lugar do rótulo do set — 0-0 no início, preenche conforme
        // os sets fecham. Ativo → mostra sets; inativo → "Aguardando…".
        if (active) {
            setLabel.setVisibility(View.GONE);
            setsRow.setVisibility(View.VISIBLE);
            setsLeft.setText(String.valueOf(sets != null ? sets.optInt(leftTeam - 1, 0) : 0));
            setsLeft.setTextColor(getColor(leftTeam == 1 ? R.color.team_blue : R.color.team_red));
            setsRight.setText(String.valueOf(sets != null ? sets.optInt(rightTeam - 1, 0) : 0));
            setsRight.setTextColor(getColor(rightTeam == 1 ? R.color.team_blue : R.color.team_red));
        } else {
            setsRow.setVisibility(View.GONE);
            setLabel.setVisibility(View.VISIBLE);
            setLabel.setText("Aguardando…");
        }

        // #2: Fim de jogo — cobre as metades e trava os toques +1.
        boolean finished = s.optBoolean("isFinished", false);
        if (finished) {
            int winner = s.isNull("winner") ? 0 : s.optInt("winner", 0);
            if (winner == 1 || winner == 2) {
                winnerLabel.setText("VENCEDOR");
                winnerNames.setText(teamNames(teams, winner));
                winnerNames.setTextColor(getColor(winner == 1 ? R.color.name_blue : R.color.name_red));
                winnerNames.setVisibility(View.VISIBLE);
            } else {
                winnerLabel.setText("EMPATE");
                winnerNames.setVisibility(View.GONE);
            }
            winnerScore.setText(scoreLine(setsToWin, sets, games, leftTeam, rightTeam));

            // "Jogar novamente?" — só casual; toggle "Re-sortear" só em duplas.
            boolean canReplay = s.optBoolean("canReplay", false);
            boolean isDoubles = s.optBoolean("isDoubles", false);
            if (canReplay && !replayDismissed) {
                replayControls.setVisibility(View.VISIBLE);
                reshuffleRow.setVisibility(isDoubles ? View.VISIBLE : View.GONE);
            } else {
                replayControls.setVisibility(View.GONE);
            }

            winnerOverlay.setVisibility(View.VISIBLE);
            halfLeft.setClickable(false);
            halfRight.setClickable(false);
        } else {
            winnerOverlay.setVisibility(View.GONE);
            replayDismissed = false;   // recomeçou → prompt volta a aparecer
            halfLeft.setClickable(true);
            halfRight.setClickable(true);
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
        n1.setText(p0); n1.setTextColor(cName);
        n2.setText(p1); n2.setTextColor(cNameDim);

        // Bola no jogador sacador (entre os 2 do time), se este time saca.
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
