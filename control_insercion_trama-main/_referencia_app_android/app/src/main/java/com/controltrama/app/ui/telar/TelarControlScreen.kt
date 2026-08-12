package com.controltrama.app.ui.telar

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel

/**
 * Pantalla de monitoreo y control de un telar: estado actual, patrón
 * asignado, posición de la producción en curso, y los mismos comandos que
 * hoy tiene el editor web (avanzar / retroceder / detener).
 */
@Composable
fun TelarControlScreen(telarId: Int) {
    val viewModel: TelarViewModel = viewModel(factory = TelarViewModelFactory(telarId))
    val uiState by viewModel.uiState.collectAsState()

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        when {
            uiState.cargando && uiState.telar == null -> CircularProgressIndicator()

            uiState.telar != null -> {
                val telar = uiState.telar!!

                Text(text = telar.codigo, style = MaterialTheme.typography.headlineMedium)
                telar.nombre?.let {
                    Text(text = it, style = MaterialTheme.typography.bodyMedium)
                }

                Spacer(modifier = Modifier.height(16.dp))

                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        FilaDato("Estado", telar.estado)
                        FilaDato("Patrón asignado", telar.patronActualNombre ?: "ninguno")
                        FilaDato(
                            "Posición",
                            "fila ${telar.filaActual ?: 0}, columna ${telar.columnaActual ?: 0}, " +
                                "pasada ${telar.pasadaActual ?: 0}"
                        )
                        FilaDato("Vueltas completadas", "${telar.vueltasCompletadas ?: 0}")
                    }
                }

                Spacer(modifier = Modifier.height(24.dp))

                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedButton(onClick = viewModel::retroceder, enabled = !uiState.enviandoComando) {
                        Text("↺ Retroceder")
                    }
                    Button(onClick = viewModel::avanzar, enabled = !uiState.enviandoComando) {
                        Text("▶ Avanzar")
                    }
                    OutlinedButton(onClick = viewModel::detener, enabled = !uiState.enviandoComando) {
                        Text("⏹ Detener")
                    }
                }

                // "Avanzar" acá es un botón manual, pensado para probar la
                // conexión sin hardware. Cuando el ESP32 esté conectado, va
                // a ser el microcontrolador el que llame a este mismo
                // endpoint automáticamente ante cada pasada real detectada
                // por el sensor óptico — no hace falta cambiar el backend
                // ni este modelo de datos para eso, solo quién lo llama.
            }
        }

        uiState.error?.let { mensaje ->
            Spacer(modifier = Modifier.height(16.dp))
            Text(text = mensaje, color = MaterialTheme.colorScheme.error)
        }
    }
}

@Composable
private fun FilaDato(etiqueta: String, valor: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(text = etiqueta, style = MaterialTheme.typography.bodyMedium)
        Text(text = valor, style = MaterialTheme.typography.bodyMedium)
    }
}
