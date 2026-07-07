package com.controltrama.app.ui.patrones

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.controltrama.app.data.model.Patron

/**
 * Pantalla "Biblioteca" — lista y busca patrones. Es el equivalente móvil
 * de la biblioteca de patrones del frontend web (misma API, misma lógica).
 */
@Composable
fun PatronesListScreen(
    viewModel: PatronesViewModel = viewModel(),
    onPatronClick: (Patron) -> Unit = {}
) {
    val uiState by viewModel.uiState.collectAsState()

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text(text = "Biblioteca de patrones", style = MaterialTheme.typography.headlineSmall)

        Spacer(modifier = Modifier.height(12.dp))

        OutlinedTextField(
            value = uiState.busqueda,
            onValueChange = viewModel::onBusquedaCambiada,
            label = { Text("Buscar patrón") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(modifier = Modifier.height(12.dp))

        Box(modifier = Modifier.fillMaxSize()) {
            when {
                uiState.cargando -> CircularProgressIndicator(
                    modifier = Modifier.align(Alignment.Center)
                )
                uiState.error != null -> Text(
                    text = "Error: ${uiState.error}",
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.align(Alignment.Center)
                )
                uiState.patrones.isEmpty() -> Text(
                    text = "No hay patrones guardados todavía.",
                    modifier = Modifier.align(Alignment.Center)
                )
                else -> LazyColumn {
                    items(uiState.patrones) { patron ->
                        PatronCard(patron = patron, onClick = { onPatronClick(patron) })
                    }
                }
            }
        }
    }
}

@Composable
private fun PatronCard(patron: Patron, onClick: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp)
            .clickable(onClick = onClick)
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(text = patron.nombre, style = MaterialTheme.typography.titleMedium)
            Text(text = "${patron.filas} filas × ${patron.columnas} columnas")
        }
    }
}
