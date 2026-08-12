package com.controltrama.app.ui.telar

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.controltrama.app.data.model.HistorialProduccion
import com.controltrama.app.data.model.Telar
import com.controltrama.app.data.repository.ApiResult
import com.controltrama.app.data.repository.TramaRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class TelarUiState(
    val cargando: Boolean = false,
    val telar: Telar? = null,
    val error: String? = null,
    val enviandoComando: Boolean = false
)

/**
 * Controla y monitorea UN telar puntual (mismo enfoque que usa hoy el
 * frontend web: como por ahora hay un solo telar físico, no hace falta
 * selector — se opera directo sobre su id).
 */
class TelarViewModel(
    private val telarId: Int,
    private val repository: TramaRepository = TramaRepository()
) : ViewModel() {

    private val _uiState = MutableStateFlow(TelarUiState())
    val uiState: StateFlow<TelarUiState> = _uiState.asStateFlow()

    init {
        cargarTelar()
    }

    fun cargarTelar() {
        viewModelScope.launch {
            _uiState.update { it.copy(cargando = true, error = null) }
            when (val resultado = repository.obtenerTelar(telarId)) {
                is ApiResult.Success -> _uiState.update { it.copy(cargando = false, telar = resultado.data) }
                is ApiResult.Error -> _uiState.update { it.copy(cargando = false, error = resultado.message) }
            }
        }
    }

    fun avanzar() = enviarComando { repository.avanzar(telarId) }
    fun retroceder() = enviarComando { repository.retroceder(telarId) }
    fun detener() = enviarComando { repository.detener(telarId) }

    /**
     * Todas las acciones hacen lo mismo después de llamar a la API:
     * refrescan el telar para traer la posición real que quedó guardada en
     * la base — la misma idea que usa el frontend web (usa la posición que
     * devuelve el backend, nunca la calcula sola en el cliente), para que
     * la app y la base nunca queden desincronizadas.
     *
     * NOTA PARA LA INTEGRACIÓN CON EL ESP32: cuando el microcontrolador esté
     * conectado, va a ser ÉL quien llame a avanzar() automáticamente cada
     * vez que el sensor óptico detecte una pasada — en ese momento, esta
     * pantalla pasa de ser un control manual a ser un MONITOR en tiempo
     * real. Alcanza con refrescar cargarTelar() con un timer o con
     * WebSocket en vez de hacerlo solo después de un botón.
     */
    private fun enviarComando(accion: suspend () -> ApiResult<HistorialProduccion>) {
        viewModelScope.launch {
            _uiState.update { it.copy(enviandoComando = true, error = null) }
            when (val resultado = accion()) {
                is ApiResult.Success -> cargarTelar()
                is ApiResult.Error -> _uiState.update { it.copy(error = resultado.message) }
            }
            _uiState.update { it.copy(enviandoComando = false) }
        }
    }
}

/**
 * Los ViewModel de Compose se crean sin argumentos por defecto; como este
 * necesita saber CUÁL telar controlar, hace falta esta fábrica simple.
 */
class TelarViewModelFactory(private val telarId: Int) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        @Suppress("UNCHECKED_CAST")
        return TelarViewModel(telarId) as T
    }
}
