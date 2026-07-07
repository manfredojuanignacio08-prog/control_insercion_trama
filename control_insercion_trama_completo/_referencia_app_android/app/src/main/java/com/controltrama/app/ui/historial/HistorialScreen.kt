package com.controltrama.app.ui.historial

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.controltrama.app.data.model.HistorialProduccion

/** Historial de producciones de un telar, del más reciente al más viejo. */
@Composable
fun HistorialScreen(telarId: Int) {
    val viewModel: HistorialViewModel =
        viewModel(factory = HistorialViewModelFactory(telarId))
    val uiState by viewModel.uiState.collectAsState()

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text(
            text = "Historial de producción",
            style = MaterialTheme.typography.headlineSmall
        )
        Spacer(modifier = Modifier.height(12.dp))

        when {
            uiState.cargando -> CircularProgressIndicator(
                modifier = Modifier.align(Alignment.CenterHorizontally)
            )
            uiState.error != null -> Text(
                text = "Error: ${uiState.error}",
                color = MaterialTheme.colorScheme.error
            )
            uiState.registros.isEmpty() -> Text("Este telar todavía no tiene producciones registradas.")
            else -> LazyColumn {
                items(uiState.registros) { registro ->
                    RegistroCard(registro)
                }
            }
        }
    }
}

@Composable
private fun RegistroCard(registro: HistorialProduccion) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp)
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(
                text = registro.patronNombre ?: "Patrón #${registro.patronId}",
                style = MaterialTheme.typography.titleMedium
            )
            FilaDato("Estado", registro.estado)
            FilaDato("Inicio", registro.fechaInicio)
            FilaDato("Fin", registro.fechaFin ?: "en curso")
            FilaDato("Pasadas totales", "${registro.pasadasTotales}")
            FilaDato("Vueltas completadas", "${registro.vueltasCompletadas}")
            FilaDato("Alertas", "${registro.alertasDisparadas}")
        }
    }
}

@Composable
private fun FilaDato(etiqueta: String, valor: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(text = etiqueta, style = MaterialTheme.typography.bodySmall)
        Text(text = valor, style = MaterialTheme.typography.bodySmall)
    }
}
