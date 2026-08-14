import app.scoreplace.wear.ScoreEngine;
import app.scoreplace.wear.WearMatchSession;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Teste da POSSE + DIÁRIO do Wear (WearMatchSession) — Caminho B, fiação.
 * Roda o tipo REAL do app do relógio contra snapshots montados à mão, com a
 * MESMA bateria de casos do runner Swift (tests/watch-engine/swift-session):
 * duas implementações da mesma decisão divergem na primeira mudança, e é essa
 * divergência que os dois runners existem pra pegar.
 *
 * Rodar: tests/watch-engine/run-java-session.sh
 * ⚠️ Fora do npm test (exige JDK + org.json) — mesmo regime dos outros runners.
 */
public final class SessionMain {
    static int pass = 0, fail = 0;
    static void ok(boolean c, String m) {
        if (c) pass++; else { fail++; System.out.println("  ✗ " + m); }
    }

    static JSONObject snap(String epoch, int seq, int[] games, int[] sets, String[] points,
                           boolean active, boolean finished, boolean withScoring,
                           boolean doubles, boolean servePickOpen, JSONObject server) throws Exception {
        JSONObject d = new JSONObject();
        d.put("v", 1); d.put("type", "state"); d.put("seq", seq); d.put("epoch", "carga-1");
        d.put("active", active); d.put("setLabel", "Set 1");
        d.put("points", new JSONArray(new String[]{points[0], points[1]}));
        d.put("games", new JSONArray(new int[]{games[0], games[1]}));
        d.put("sets", new JSONArray(new int[]{sets[0], sets[1]}));
        d.put("setsToWin", 1); d.put("isTiebreak", false); d.put("courtLeft", 1);
        JSONObject teams = new JSONObject();
        teams.put("1", new JSONObject().put("players",
                doubles ? new JSONArray(new String[]{"Ana", "Bruno"}) : new JSONArray(new String[]{"Ana"})));
        teams.put("2", new JSONObject().put("players",
                doubles ? new JSONArray(new String[]{"Caio", "Duda"}) : new JSONArray(new String[]{"Caio"})));
        d.put("teams", teams);
        d.put("isCasual", true); d.put("isDoubles", doubles); d.put("isFinished", finished);
        d.put("sportName", "Beach Tennis");
        d.put("servePickOpen", servePickOpen);
        d.put("servePickPhase", servePickOpen ? 0 : -1);
        d.put("canSetServer", doubles);
        d.put("matchEpoch", epoch);
        if (server != null) d.put("server", server);
        if (withScoring) {
            JSONObject sc = new JSONObject();
            sc.put("type", "sets"); sc.put("setsToWin", 1); sc.put("gamesPerSet", 6);
            sc.put("tiebreakEnabled", true); sc.put("tiebreakPoints", 7); sc.put("tiebreakMargin", 2);
            sc.put("superTiebreak", false); sc.put("superTiebreakPoints", 10);
            sc.put("countingType", "tennis"); sc.put("deuceRule", false);
            sc.put("twoPointAdvantage", true); sc.put("tieRule", "ask");
            sc.put("fixedSet", false); sc.put("fixedSetGames", 0);
            d.put("scoring", sc);
        }
        return d;
    }
    static JSONObject start(String epoch, int seq) throws Exception {
        return snap(epoch, seq, new int[]{0, 0}, new int[]{0, 0}, new String[]{"0", "0"},
                true, false, true, true, true, null);
    }
    static WearMatchSession newSession() {
        WearMatchSession s = new WearMatchSession();
        s.nowMs = 1_723_600_000_000L;   // relógio fixo → diário determinístico
        return s;
    }
    static String pts(JSONObject s) { return String.valueOf(s.optJSONArray("points")); }

    public static void main(String[] args) throws Exception {
        System.out.println("──── wear-session (posse + diário) ────");

        // 1. app do celular ANTIGO → motor local desligado
        WearMatchSession a = newSession();
        a.ingest(snap("", 1, new int[]{0,0}, new int[]{0,0}, new String[]{"0","0"},
                true, false, false, true, true, null));
        ok(!a.hasEngine(), "🔒 sem matchEpoch/scoring o motor local NÃO arma (celular antigo → espelho, nunca pior)");
        ok(!a.localEvent("point", 1, -1, null), "toque sem motor devolve false — chamador cai no intent unitário");
        ok(a.pendingEvlog("w") == null, "sem diário não há evlog a mandar");

        // 2. partida do começo → arma; toque responde LOCAL e entra no diário
        WearMatchSession b = newSession();
        b.ingest(start("m1", 1));
        ok(b.hasEngine(), "🔒 snapshot no 0-0 com config ARMA o motor local");
        ok(b.owner() == WearMatchSession.OWNER_PHONE, "antes de tocar a posse é do celular");
        ok(b.localEvent("serveSelect", 1, 0, null), "escolha de sacador entra no motor local");
        ok(b.localEvent("serveConfirm", 0, -1, null), "confirmação idem");
        ok(b.localEvent("point", 1, -1, null), "ponto idem");
        ok(b.owner() == WearMatchSession.OWNER_WATCH, "🔒 tocou no relógio → a POSSE é do relógio");
        ok("[\"15\",\"0\"]".equals(pts(b.displayState())),
           "🔒 a tela mostra o placar do MOTOR LOCAL · achado: " + pts(b.displayState()));
        ok(b.journal().length() == 3
           && b.journal().getJSONObject(0).getInt("n") == 1
           && b.journal().getJSONObject(2).getInt("n") == 3,
           "diário acumulou os 3 eventos com `n` sequencial");
        JSONObject ev = b.pendingEvlog("wear-A");
        ok("evlog".equals(ev.optString("type")) && "m1".equals(ev.optString("matchEpoch"))
           && ev.optJSONArray("events").length() == 3,
           "🔒 o evlog sai carimbado com a época da partida e o dispositivo");

        // 3. o celular alcança → posse volta pra ele, motor segue armado, diário fica
        b.ingest(snap("m1", 9, new int[]{0,0}, new int[]{0,0}, new String[]{"15","0"},
                true, false, true, true, false, new JSONObject().put("team",1).put("name","Ana")));
        ok(b.owner() == WearMatchSession.OWNER_PHONE, "🔒 convergiu no mesmo placar → a posse volta pro celular");
        ok(b.hasEngine(), "…e o motor local segue ARMADO pro próximo toque");
        ok(b.journal().length() == 3, "🔒 o diário NÃO é limpo pela adoção (reenviar é de graça)");

        // 4. celular andou sozinho → desarma e espelha
        WearMatchSession c = newSession();
        c.ingest(start("m2", 1));
        c.localEvent("serveSelect", 1, 0, null);
        c.localEvent("serveConfirm", 0, -1, null);
        c.localEvent("point", 1, -1, null);
        c.ingest(snap("m2", 7, new int[]{0,0}, new int[]{0,0}, new String[]{"30","15"},
                true, false, true, true, false, new JSONObject().put("team",1).put("name","Ana")));
        ok(!c.hasEngine() && c.owner() == WearMatchSession.OWNER_PHONE,
           "🔒 placar do celular que NÃO bate (e ele já viu o diário) DESARMA o motor local");
        ok("[\"30\",\"15\"]".equals(pts(c.displayState())),
           "…e a tela passa a espelhar o celular · achado: " + pts(c.displayState()));

        // 5. divergência ANTES de o celular ver o diário NÃO desarma
        WearMatchSession d = newSession();
        d.ingest(start("m3", 5));
        d.localEvent("serveSelect", 1, 0, null);
        d.localEvent("serveConfirm", 0, -1, null);
        d.localEvent("point", 1, -1, null);
        d.ingest(start("m3", 5));   // snapshot ANTIGO: ele ainda não viu nada
        ok(d.hasEngine() && d.owner() == WearMatchSession.OWNER_WATCH,
           "🔒 enquanto o celular não teve chance de aplicar o diário, o motor local continua mandando");
        ok("[\"15\",\"0\"]".equals(pts(d.displayState())),
           "…e a tela segue no placar local · achado: " + pts(d.displayState()));

        // 6. partida NOVA → diário zerado e motor re-armado
        d.ingest(start("m4", 30));
        ok(d.journal().length() == 0, "🔒 época nova ZERA o diário (o `n` recomeça em 1)");
        ok(d.hasEngine() && d.owner() == WearMatchSession.OWNER_PHONE, "…e o motor re-arma pra partida nova");
        d.localEvent("point", 2, -1, null);
        ok(d.journal().getJSONObject(0).getInt("n") == 1, "a numeração recomeça em 1 na partida nova");

        // 7. relógio que chega no MEIO → espelha (sem semear motor)
        WearMatchSession e = newSession();
        e.ingest(snap("m5", 40, new int[]{3,2}, new int[]{0,0}, new String[]{"30","40"},
                true, false, true, true, false, null));
        ok(!e.hasEngine(), "🔒 chegando no meio da partida o motor local NÃO arma (semear = drift sem rede)");
        ok("[3,2]".equals(String.valueOf(e.displayState().optJSONArray("games"))),
           "…e a tela espelha o celular normalmente");

        // 8. o estado local chega completo à tela
        WearMatchSession f = newSession();
        f.ingest(start("m6", 3));
        f.localEvent("serveSelect", 2, 1, null);
        f.localEvent("serveConfirm", 0, -1, null);
        f.localEvent("point", 2, -1, null);
        JSONObject ds = f.displayState();
        JSONObject srv = ds.optJSONObject("server");
        ok(srv != null && "Duda".equals(srv.optString("name")) && srv.optInt("team") == 2,
           "🔒 o estado local chega à tela com TODOS os campos (sacador, times, faixa)");
        ok("m6".equals(ds.optString("matchEpoch")),
           "campos que o motor não conhece (época, ♥) vêm do espelho");
        ok("[\"Caio\",\"Duda\"]".equals(String.valueOf(
                ds.optJSONObject("teams").optJSONObject("2").optJSONArray("players"))),
           "os nomes seguem os do celular");

        // 9. conhecimento do CELULAR viaja pelo espelho (mesma bateria do Swift)
        WearMatchSession g = newSession();
        JSONObject sug = start("m9", 3);
        sug.put("rrSuggest", true); sug.put("reiRainha", false); sug.put("rrRound", 1);
        sug.put("canReplay", false);
        sug.put("rrStandings", new JSONArray()
            .put(new JSONObject().put("name", "Ana").put("wins", 1))
            .put(new JSONObject().put("name", "Caio").put("wins", 1)));
        g.ingest(sug);
        g.localEvent("serveSelect", 1, 0, null);
        g.localEvent("serveConfirm", 0, -1, null);
        g.localEvent("point", 1, -1, null);
        JSONObject d9 = g.displayState();
        ok(d9.optBoolean("rrSuggest"),
           "🔒 rrSuggest do CELULAR sobrevive com a posse no relógio (senão o toggle 👑 Rei/Rainha sumia no fim)");
        ok(d9.optInt("rrRound") == 1 && d9.optJSONArray("rrStandings").length() == 2,
           "…e a rodada/classificação da série também");
        ok(!d9.optBoolean("canReplay"), "canReplay vem do celular");
        ok("[\"15\",\"0\"]".equals(pts(d9)), "…sem perder o placar LOCAL · achado: " + pts(d9));

        System.out.println("wear-session: " + pass + " ok, " + fail + " falhas");
        if (fail > 0) System.exit(1);
    }
}
