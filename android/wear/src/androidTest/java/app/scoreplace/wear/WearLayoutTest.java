package app.scoreplace.wear;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.graphics.Rect;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import android.text.Layout;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

/** On-device regression for the round screen and system font size cited by Play. */
@RunWith(AndroidJUnit4.class)
public class WearLayoutTest {
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private int textCount;
    private int touchCount;
    private Throwable measurementError;
    private Activity activity;

    @Test public void allScreensRespectSystemFontAndRoundFace() throws Throwable {
        checkPage(new JSONObject(), R.id.idle_overlay, "Sem partida");
        JSONObject state = new JSONObject();
        state.put("sportName", "Tênis de Mesa");
        state.put("teams", new JSONObject("{'1':{'players':['Alexandriamarques','José Luís']},'2':{'players':['Tester','Bárbara da Silva']}}"));
        state.put("server", new JSONObject("{'team':1,'name':'Alexandriamarques'}"));
        state.put("points", new JSONArray("['AD','40']"));
        state.put("games", new JSONArray("[20,21]"));
        state.put("canStart", true);
        checkPage(state, R.id.start_overlay, "Iniciar", "José Luís");
        state.put("active", true);
        checkPage(state, R.id.score_page, "AD", "40", "↺ Desfazer");
        state.put("canSetServer", true).put("servePickOpen", true).put("servePickPhase", 1);
        state.put("serveEligible", new JSONArray("[{'name':'Alexandriamarques','team':1,'playerIdx':0},{'name':'Bárbara da Silva','team':2,'playerIdx':1}]"));
        checkPage(state, R.id.serve_overlay, "2º sacador", "Confirmar", "Bárbara da Silva");
        state.put("servePickOpen", false).put("servePickPhase", -1).put("tieRulePending", true);
        checkPage(state, R.id.tie_overlay, "Prorrogar", "Tie-break");
        state.put("tieRulePending", false).put("isFinished", true).put("active", false);
        state.put("canReplay", true).put("winner", 2);
        state.getJSONObject("teams").getJSONObject("2").put("players", new JSONArray("['Tester']"));
        checkPage(state, R.id.winner_overlay, "Vencedor · Tester", "20", "21", "Fechar", "Iniciar");
        state.put("isDoubles", true).put("canMix", true).put("rrSuggest", true).put("winner", 1);
        checkPage(state, R.id.winner_overlay, "Vencedor · Alexandriamarques\nJosé Luís", "🎲", "👑", "⚥");
        state.put("reiRainha", true).put("rrRound", 2);
        checkPage(state, R.id.winner_overlay, "👑 Resultado Final");
        state.put("rrRound", 3).put("rrStandings", new JSONArray("[{'name':'Alexandriamarques','wins':3}]"));
        checkPage(state, R.id.winner_overlay, "🥇 Alexandriamarques · 3V");
        android.util.Log.i("WearLayoutTest", "PASS 9 screens, " + textCount + " text layouts and "
                + touchCount + " touch targets; " + instrumentation.getTargetContext().getResources().getConfiguration());
        instrumentation.runOnMainSync(() -> activity.finish());
    }

    private void checkPage(JSONObject state, int pageId, String... expected) throws Throwable {
        if (activity == null) {
            Intent intent = new Intent(instrumentation.getTargetContext(), MainActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
            intent.putExtra("sp_mock", state.toString());
            activity = instrumentation.startActivitySync(intent);
        } else {
            instrumentation.runOnMainSync(() -> {
                try {
                    java.lang.reflect.Method render = MainActivity.class.getDeclaredMethod("render", JSONObject.class);
                    render.setAccessible(true);
                    render.invoke(activity, state);
                } catch (Exception error) {
                    throw new RuntimeException(error);
                }
            });
        }
        // A troca do overlay pode concluir no frame seguinte ao retorno de render().
        // Aguarde a página real ficar visível antes de medir corte de texto.
        for (int attempt = 0; attempt < 30; attempt++) {
            instrumentation.waitForIdleSync();
            View target = activity.findViewById(pageId);
            ScrollView page = target instanceof ScrollView ? (ScrollView) target
                    : activity.findViewById(R.id.winner_scroll);
            if (page.isShown() && page.getHeight() > 0) break;
            Thread.sleep(50);
        }
        measurementError = null;
        instrumentation.runOnMainSync(() -> {
            try {
                View viewport = activity.findViewById(R.id.watch_viewport);
                View root = activity.findViewById(pageId);
                ScrollView page = root instanceof ScrollView ? (ScrollView) root : activity.findViewById(R.id.winner_scroll);
                require(page.isShown() && page.getHeight() > 0, "missing page " + pageId
                        + " pageShown=" + page.isShown() + " pageHeight=" + page.getHeight()
                        + " rootVisibility=" + root.getVisibility() + " rootHeight=" + root.getHeight()
                        + " windowVisibility=" + page.getWindowVisibility());
                require(activity.getResources().getConfiguration().isScreenRound(), "requires round AVD");
                Rect bounds = new Rect();
                require(root.getGlobalVisibleRect(bounds), "hidden scroll viewport");
                double cx = viewport.getWidth() / 2.0, cy = viewport.getHeight() / 2.0;
                double dx = Math.max(cx - bounds.left, bounds.right - cx);
                double dy = Math.max(cy - bounds.top, bounds.bottom - cy);
                require(Math.hypot(dx, dy) <= Math.min(cx, cy) + 1, "outside round face: " + bounds);
                if (pageId == R.id.winner_overlay) {
                    View footer = activity.findViewById(R.id.replay_controls);
                    require(footer.isShown() == (state.optBoolean("canReplay") && !state.optBoolean("reiRainha")),
                            "incorrect replay visibility");
                    if (footer.isShown()) {
                        if (footer.getParent() == root) inspect(null, footer);
                        for (int id : new int[] {R.id.btn_replay_cancel, R.id.btn_replay_confirm}) {
                            TextView button = activity.findViewById(id);
                            require(button.getLineCount() == 1, "split action label: " + button.getText());
                        }
                        if (!state.optBoolean("isDoubles") &&
                                activity.getResources().getConfiguration().fontScale <= 1.241f) {
                            for (int id : new int[] {R.id.winner_arc_sport, R.id.winner_names, R.id.winner_score_l,
                                    R.id.winner_score_r, R.id.btn_replay_cancel, R.id.btn_replay_confirm}) {
                                assertFullyVisible(activity.findViewById(id));
                            }
                        }
                    }
                }
                inspect(page, page);
                for (String label : expected) require(hasLabel(root, label), "missing label: " + label);
                if (pageId == R.id.serve_overlay) {
                    ViewGroup list = activity.findViewById(R.id.serve_list);
                    require(list.getChildAt(1).performClick() && list.getChildAt(1).isSelected(),
                            "cannot select second server");
                    require(activity.findViewById(R.id.btn_serve_confirm).performClick()
                            && activity.findViewById(R.id.score_page).isShown(), "cannot confirm server");
                }
            } catch (Throwable error) {
                measurementError = error;
            }
        });
        instrumentation.waitForIdleSync();
        if (measurementError != null) throw measurementError;
    }

    private void inspect(ScrollView page, View view) {
        if (view.getVisibility() != View.VISIBLE) return;
        if (view instanceof TextView) {
            TextView text = (TextView) view;
            Layout layout = text.getLayout();
            if (text.length() > 0) {
                String label = text.getText().toString();
                require(layout != null && layout.getLineCount() > 0, "unmeasured " + label);
                require(layout.getLineEnd(layout.getLineCount() - 1) == text.length(), "truncated " + label);
                require(layout.getHeight() <= text.getHeight() - text.getCompoundPaddingTop()
                        - text.getCompoundPaddingBottom() + 1, "clipped height: " + label);
                for (int line = 0; line < layout.getLineCount(); line++) {
                    require(layout.getEllipsisCount(line) == 0, "ellipsized " + label);
                    require(layout.getLineMax(line) <= layout.getWidth() + 1, "clipped width: " + label);
                    Rect area = new Rect();
                    layout.getLineBounds(line, area);
                    area.left = 0;
                    area.right = text.getWidth();
                    area.offset(0, text.getCompoundPaddingTop());
                    if (page == null) assertFullyVisible(text);
                    else bringIntoView(page, text, area, label);
                }
                textCount++;
            }
        }
        if (view.isClickable() && !(view instanceof ScrollView)) {
            int min = Math.round(48 * view.getResources().getDisplayMetrics().density);
            require(view.getWidth() >= min && view.getHeight() >= min,
                    "small target " + view.getId() + " " + view.getWidth() + "x" + view.getHeight());
            if (page == null) assertFullyVisible(view);
            else if (view.getHeight() <= page.getHeight()) {
                bringIntoView(page, view, new Rect(0, 0, view.getWidth(), view.getHeight()), "target " + view.getId());
            }
            touchCount++;
        }
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) inspect(page, group.getChildAt(i));
        }
    }

    private static void assertFullyVisible(View view) {
        Rect visible = new Rect();
        require(view.getLocalVisibleRect(visible) && visible.equals(new Rect(0, 0, view.getWidth(), view.getHeight())),
                "clipped in initial frame: " + view.getId() + " " + visible);
    }

    private static void bringIntoView(ScrollView page, View view, Rect local, String label) {
        Rect content = new Rect(local);
        page.offsetDescendantRectToMyCoords(view, content);
        page.scrollTo(0, content.centerY() - page.getHeight() / 2);
        Rect visible = new Rect();
        require(view.getLocalVisibleRect(visible) && visible.contains(local),
                "unreachable " + label + " " + local + " visible=" + visible);
    }

    private static boolean hasLabel(View view, String label) {
        if (view.getVisibility() != View.VISIBLE) return false;
        if (view instanceof TextView && label.contentEquals(((TextView) view).getText())) return true;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                if (hasLabel(group.getChildAt(i), label)) return true;
            }
        }
        return false;
    }

    private static void require(boolean value, String message) {
        if (!value) throw new AssertionError(message);
    }
}
