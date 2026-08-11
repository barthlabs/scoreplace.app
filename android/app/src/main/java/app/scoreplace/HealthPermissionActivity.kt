package app.scoreplace

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.health.connect.client.PermissionController

/**
 * Tela invisível que pede ao Health Connect permissão para GRAVAR o treino
 * (sessão de exercício + batimentos). Abre o fluxo oficial, aplica o resultado
 * e se fecha — não tem UI própria.
 *
 * É preciso uma ComponentActivity dedicada porque o contrato do Health Connect
 * (`createRequestPermissionResultContract`) exige registro antes de RESUMED, e a
 * Activity do Capacitor já está em cena quando o pedido acontece.
 */
class HealthPermissionActivity : ComponentActivity() {

    private val launcher =
        registerForActivityResult(PermissionController.createRequestPermissionResultContract()) { granted ->
            // Concedeu → grava na hora o que estava na fila. Negou → segue enfileirado.
            if (granted.containsAll(WorkoutRecorder.permissions)) {
                WorkoutRecorder.flushPending(applicationContext)
            }
            finish()
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (!WorkoutRecorder.isAvailable(this)) { finish(); return }
        try {
            launcher.launch(WorkoutRecorder.permissions)
        } catch (t: Throwable) {
            finish()
        }
    }
}
