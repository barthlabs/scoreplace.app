package app.scoreplace;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.google.android.gms.wearable.MessageClient;
import com.google.android.gms.wearable.MessageEvent;
import com.google.android.gms.wearable.Node;
import com.google.android.gms.wearable.Wearable;

import java.nio.charset.StandardCharsets;

/**
 * Plugin Capacitor da ponte pro smartwatch (fase 4, Android) — lado do celular.
 * Contrato: docs/smartwatch-bridge.md. Transporte = Wear Data Layer:
 *   - JS→relógio: MessageClient.sendMessage(node, "/scoreplace/state", json)
 *   - relógio→JS: OnMessageReceived("/scoreplace/intent") → evento watchIntent
 * O motor GSM (fonte única) roda no JS (WatchBridge → bracket-ui.js).
 */
@CapacitorPlugin(name = "ScoreplaceWatch")
public class ScoreplaceWatchPlugin extends Plugin implements MessageClient.OnMessageReceivedListener {

    private static final String PATH_STATE = "/scoreplace/state";
    private static final String PATH_INTENT = "/scoreplace/intent";
    /** Resumo do treino medido no relógio → gravado no Health Connect. */
    private static final String PATH_WORKOUT = "/scoreplace/workout";

    @Override
    public void load() {
        try {
            Wearable.getMessageClient(getContext()).addListener(this);
        } catch (Exception e) { /* sem Play Services / sem relógio: fica inerte */ }
        // Treino que ficou na fila (app fechado / sem permissão na hora) entra agora.
        try {
            WorkoutRecorder.flushPending(getContext());
        } catch (Throwable t) { /* sem Health Connect: inerte */ }
    }

    /** JS: o Health Connect está disponível neste aparelho? */
    @PluginMethod
    public void healthAvailable(PluginCall call) {
        JSObject r = new JSObject();
        boolean ok;
        try { ok = WorkoutRecorder.isAvailable(getContext()); } catch (Throwable t) { ok = false; }
        r.put("available", ok);
        call.resolve(r);
    }

    /** JS: abre o fluxo oficial do Health Connect pra permitir gravar o treino. */
    @PluginMethod
    public void requestHealthPermissions(PluginCall call) {
        try {
            android.content.Intent i = new android.content.Intent(getContext(), HealthPermissionActivity.class);
            i.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Throwable t) {
            call.reject("health-permission-unavailable");
        }
    }

    @Override
    protected void handleOnDestroy() {
        try {
            Wearable.getMessageClient(getContext()).removeListener(this);
        } catch (Exception e) { /* ignore */ }
        super.handleOnDestroy();
    }

    // JS → nativo: empurra o snapshot de estado pros relógios conectados.
    @PluginMethod
    public void sendState(PluginCall call) {
        JSObject snapshot = call.getObject("snapshot");
        final byte[] bytes = (snapshot != null ? snapshot.toString() : "{}")
            .getBytes(StandardCharsets.UTF_8);
        try {
            Wearable.getNodeClient(getContext()).getConnectedNodes()
                .addOnSuccessListener(nodes -> {
                    MessageClient mc = Wearable.getMessageClient(getContext());
                    for (Node node : nodes) {
                        mc.sendMessage(node.getId(), PATH_STATE, bytes);
                    }
                });
        } catch (Exception e) { /* sem nó conectado: no-op */ }
        call.resolve();
    }

    // nativo → JS: intenção do relógio (+1 / desfazer / hello) chega aqui e é
    // entregue ao WatchBridge, que dirige o motor GSM.
    @Override
    public void onMessageReceived(MessageEvent event) {
        // Fim de partida no relógio: grava o treino (exercício + BPM) no Health Connect.
        if (PATH_WORKOUT.equals(event.getPath())) {
            try {
                String json = new String(event.getData(), StandardCharsets.UTF_8);
                WorkoutRecorder.onWorkoutJson(getContext(), json);
            } catch (Throwable t) { /* nunca derruba o app por causa do treino */ }
            return;
        }
        if (!PATH_INTENT.equals(event.getPath())) return;
        try {
            String json = new String(event.getData(), StandardCharsets.UTF_8);
            JSObject ev = new JSObject();
            ev.put("intent", new JSObject(json));
            notifyListeners("watchIntent", ev);
        } catch (Exception e) { /* intenção malformada: ignora */ }
    }
}
