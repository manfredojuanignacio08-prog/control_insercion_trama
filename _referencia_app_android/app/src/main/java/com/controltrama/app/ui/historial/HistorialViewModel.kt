package com.controltrama.app.ui.historial

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.controltrama.app.data.model.HistorialProduccion
import com.controltrama.app.data.repository.ApiResult
import com.controltrama.app.data.repository.TramaRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class HistorialUiState(
    val cargando: Boolean = false,
    val registros: List<HistorialProduccion> = emptyList(),
    val error: String? = null
)

/**
 * Historial de producciones de un telar (GET /api/telares/:id/historial).
 * Nótese que esta pantalla existe en la app ANTES que en la web — el
 * endpoint del backend ya estaba listo, solo faltaba una interfaz que lo
 * consuma.
 */
class HistorialViewModel(
    private val telarId: Int,
    private val repository: TramaRepository = TramaRepository()
) : ViewModel() {

    private val _uiState = MutableStateFlow(HistorialUiState())
    val uiState: StateFlow<HistorialUiState> = _uiState.asStateFlow()

    init {
        cargarHistorial()
    }

    fun cargarHistorial() {
        viewModelScope.launch {
            _uiState.update { it.copy(cargando = true, error = null) }
            when (val resultado = repository.historialPorTelar(telarId)) {
                is ApiResult.Success -> _uiState.update {
                    it.copy(cargando = false, registros = resultado.data)
                }
                is ApiResult.Error -> _uiState.update {
                    it.copy(cargando = false, error = resultado.message)
                }
            }
        }
    }
}

class HistorialViewModelFactory(private val telarId: Int) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        @Suppress("UNCHECKED_CAST")
        return HistorialViewModel(telarId) as T
    }
}
