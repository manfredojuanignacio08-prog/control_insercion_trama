package com.controltrama.app.data.model

import com.google.gson.annotations.SerializedName

/**
 * Representa un telar tal como lo devuelve el backend
 * (GET /api/telares, GET /api/telares/:id).
 *
 * Los campos "extra" (patronActualNombre, filaActual, etc.) vienen del JOIN
 * que hace el backend contra patrones e historial_produccion — por eso son
 * nullable: si el telar está apagado y no tiene producción en curso,
 * el backend los devuelve como null.
 */
data class Telar(
    val id: Int,
    val codigo: String,
    val nombre: String?,

    // "apagado" | "tejiendo" | "pausado" | "error"
    val estado: String,

    @SerializedName("patron_actual_id")
    val patronActualId: Int?,

    @SerializedName("patron_actual_nombre")
    val patronActualNombre: String? = null,

    @SerializedName("historial_actual_id")
    val historialActualId: Int? = null,

    @SerializedName("fila_actual")
    val filaActual: Int? = null,

    @SerializedName("columna_actual")
    val columnaActual: Int? = null,

    @SerializedName("pasada_actual")
    val pasadaActual: Int? = null,

    @SerializedName("vueltas_completadas")
    val vueltasCompletadas: Int? = null,

    @SerializedName("pasadas_actuales")
    val pasadasActuales: Int? = null,

    @SerializedName("creado_at")
    val creadoAt: String? = null
)

/** Cuerpo para POST /api/telares */
data class CrearTelarRequest(
    val codigo: String,
    val nombre: String? = null
)

/** Cuerpo para POST /api/telares/:id/asignar-patron */
data class AsignarPatronRequest(
    @SerializedName("patron_id")
    val patronId: Int
)

/**
 * Cuerpo para POST /api/telares/:id/avanzar y /retroceder.
 * "pasos" es opcional: si no se manda, el backend asume 1.
 */
data class PasosRequest(
    val pasos: Int? = null
)

/** Cuerpo para POST /api/telares/:id/detener (ambos campos opcionales) */
data class DetenerTelarRequest(
    @SerializedName("pasadas_totales")
    val pasadasTotales: Int? = null,
    @SerializedName("alertas_disparadas")
    val alertasDisparadas: Int? = null
)
