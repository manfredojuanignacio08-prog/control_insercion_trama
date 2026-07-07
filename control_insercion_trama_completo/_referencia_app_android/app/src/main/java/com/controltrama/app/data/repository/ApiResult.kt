package com.controltrama.app.data.repository

/**
 * Envoltorio simple para el resultado de cualquier llamada a la API.
 * Obliga a que quien lo use (los ViewModels) maneje explícitamente tanto
 * el caso de éxito como el de error, en vez de dejar pasar excepciones
 * sueltas hasta la pantalla.
 */
sealed class ApiResult<out T> {
    data class Success<T>(val data: T) : ApiResult<T>()
    data class Error(val message: String) : ApiResult<Nothing>()
}
