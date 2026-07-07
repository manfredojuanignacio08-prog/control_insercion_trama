package com.controltrama.app.ui.patrones

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.controltrama.app.data.model.Patron
import com.controltrama.app.data.repository.ApiResult
import com.controltrama.app.data.repository.TramaRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Todo lo que la pantalla necesita para dibujarse, en un solo objeto. */
data class PatronesUiState(
    val cargando: Boolean = false,
    val patrones: List<Patron> = emptyList(),
    val error: String? = null,
    val busqueda: String = ""
)

class PatronesViewModel(
    private val repository: TramaRepository = TramaRepository()
) : ViewModel() {

    private val _uiState = MutableStateFlow(PatronesUiState())
    val uiState: StateFlow<PatronesUiState> = _uiState.asStateFlow()

    init {
        cargarPatrones()
    }

    fun cargarPatrones() {
        viewModelScope.launch {
            _uiState.update { it.copy(cargando = true, error = null) }
            // Espejo de GET /api/patrones?buscar= — mismo endpoint que ya
            // usa el buscador de la biblioteca en el frontend web.
            when (val resultado = repository.listarPatrones(_uiState.value.busqueda.ifBlank { null })) {
                is ApiResult.Success -> _uiState.update {
                    it.copy(cargando = false, patrones = resultado.data)
                }
                is ApiResult.Error -> _uiState.update {
                    it.copy(cargando = false, error = resultado.message)
                }
            }
        }
    }

    fun onBusquedaCambiada(texto: String) {
        _uiState.update { it.copy(busqueda = texto) }
        cargarPatrones()
    }
}
