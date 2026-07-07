package com.controltrama.app.data.model

import com.google.gson.annotations.SerializedName

/**
 * Una fila de historial_produccion, tal como la devuelve el backend en
 * /api/telares/:id/historial, /api/historial, y como respuesta de
 * asignar-patron / avanzar / retroceder / detener.
 */
data class HistorialProduccion(
    val id: Int,

    @SerializedName("telar_id")
    val telarId: Int,

    @SerializedName("patron_id")
    val patronId: Int,

    // Solo viene en las consultas de historial (join con patrones), no en
    // las respuestas de avanzar/retroceder/detener.
    @SerializedName("patron_nombre")
    val patronNombre: String? = null,

    // Solo viene en el historial GLOBAL (GET /api/historial), que hace join
    // también con la tabla de telares para saber de qué telar es cada fila.
    @SerializedName("telar_codigo")
    val telarCodigo: String? = null,

    @SerializedName("fecha_inicio")
    val fechaInicio: String,

    // null mientras la producción sigue en curso.
    @SerializedName("fecha_fin")
    val fechaFin: String? = null,

    @SerializedName("pasadas_totales")
    val pasadasTotales: Int,

    @SerializedName("alertas_disparadas")
    val alertasDisparadas: Int,

    @SerializedName("fila_actual")
    val filaActual: Int,

    @SerializedName("columna_actual")
    val columnaActual: Int,

    @SerializedName("pasada_actual")
    val pasadaActual: Int,

    @SerializedName("vueltas_completadas")
    val vueltasCompletadas: Int,

    // "en_curso" | "finalizado" | "detenido_manual"
    val estado: String,

    // Este campo SOLO viene en la respuesta de POST /retroceder — indica
    // que ya no se puede retroceder más (se llegó al inicio absoluto).
    @SerializedName("al_inicio")
    val alInicio: Boolean? = null
)
