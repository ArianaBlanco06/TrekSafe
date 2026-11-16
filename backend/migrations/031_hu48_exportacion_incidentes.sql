-- 031 · HU-48, numeración confirmada por John con el equipo.
-- 030 ya corresponde a HU-50 en develop. No modifica la 029 aplicada en DEV.
-- Requiere 029 (y por ella 017/025 con sus dependencias). Aplicar una sola vez.
BEGIN;

DO $$
BEGIN
    IF to_regprocedure('public.treksafe_consultar_estadisticas_incidentes(uuid,timestamptz,timestamptz,text,text,text)') IS NULL THEN
        RAISE EXCEPTION '031 requiere la migración 029';
    END IF;
    IF to_regclass('public.treksafe_migraciones') IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.treksafe_migraciones WHERE version = '031') THEN
            RAISE EXCEPTION '031 ya está registrada: no volver a aplicar';
        END IF;
    END IF;
END
$$;

CREATE FUNCTION public.treksafe_leer_pagina_incidentes_reporte(
    p_rescatista_id UUID,
    p_desde TIMESTAMPTZ,
    p_hasta_exclusivo TIMESTAMPTZ,
    p_criterio_fecha TEXT,
    p_zona TEXT DEFAULT NULL,
    p_resultado TEXT DEFAULT NULL,
    p_despues_de UUID DEFAULT NULL,
    p_limite INTEGER DEFAULT 200
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_pagina JSONB;
BEGIN
    -- Igual alcance que HU-47, comprobado en cada página con el snapshot del statement.
    IF p_rescatista_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.perfiles_rescatista r
        JOIN public.usuarios u ON u.id = r.usuario_id
        WHERE r.usuario_id = p_rescatista_id AND u.rol = 'rescatista'
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'RESCATISTA_NO_VALIDADO';
    END IF;
    IF p_desde IS NULL OR p_hasta_exclusivo IS NULL
       OR NOT isfinite(p_desde) OR NOT isfinite(p_hasta_exclusivo)
       OR p_desde >= p_hasta_exclusivo
       OR p_criterio_fecha IS NULL OR p_criterio_fecha NOT IN ('apertura', 'cierre')
       OR (p_zona IS NOT NULL AND char_length(btrim(p_zona)) > 120)
       OR (p_resultado IS NOT NULL AND p_resultado NOT IN
           ('localizado_sin_asistencia', 'asistido_en_terreno', 'evacuado', 'falsa_alarma'))
       OR p_limite IS NULL OR p_limite NOT BETWEEN 1 AND 500 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'FILTROS_REPORTE_INVALIDOS';
    END IF;

    -- Se usan exactamente los criterios de la 029. La relación con el informe
    -- es única; la ausencia de informe conserva los cierres históricos.
    -- No se leen notas, autores, contactos ni fichas médicas.
    WITH candidatos AS MATERIALIZED (
        SELECT i.id, e.lugar_fin AS zona, i.abierto_en, i.cerrado_en, i.estado, c.resultado
        FROM public.incidentes i
        JOIN public.expediciones e ON e.id = i.expedicion_id
        LEFT JOIN public.informes_cierre_incidente c ON c.incidente_id = i.id
        WHERE (p_despues_de IS NULL OR i.id > p_despues_de)
        AND (
            (p_criterio_fecha = 'apertura' AND i.abierto_en >= p_desde AND i.abierto_en < p_hasta_exclusivo)
            OR (p_criterio_fecha = 'cierre' AND i.cerrado_en >= p_desde AND i.cerrado_en < p_hasta_exclusivo)
        )
        AND (p_zona IS NULL OR btrim(p_zona) = '' OR strpos(lower(e.lugar_fin), lower(btrim(p_zona))) > 0)
        AND (p_resultado IS NULL OR (i.estado = 'cerrado' AND c.resultado = p_resultado))
        ORDER BY i.id
        LIMIT p_limite + 1
    ), filas AS (
        SELECT * FROM candidatos ORDER BY id LIMIT p_limite
    )
    SELECT jsonb_build_object(
        'incidentes', (SELECT coalesce(jsonb_agg(jsonb_build_object(
            'id', id, 'zona', zona, 'abiertoEn', abierto_en, 'cerradoEn', cerrado_en,
            'estado', estado, 'resultado', resultado
        ) ORDER BY id), '[]'::jsonb) FROM filas),
        'hayMas', (SELECT count(*) > p_limite FROM candidatos)
    ) INTO v_pagina;
    RETURN v_pagina;
END;
$$;

REVOKE ALL ON FUNCTION public.treksafe_leer_pagina_incidentes_reporte(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, UUID, INTEGER)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.treksafe_leer_pagina_incidentes_reporte(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, UUID, INTEGER)
    TO service_role;
COMMENT ON FUNCTION public.treksafe_leer_pagina_incidentes_reporte(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, UUID, INTEGER) IS
    'HU-48: página de campos mínimos por id estable, con los filtros y alcance autorizado de HU-47. Solo lectura.';

DO $$
BEGIN
    IF to_regclass('public.treksafe_migraciones') IS NOT NULL THEN
        EXECUTE $sql$
            INSERT INTO public.treksafe_migraciones (version, nombre, hu)
            VALUES ('031', 'hu48_exportacion_incidentes', 'HU-48')
            ON CONFLICT (version) DO NOTHING
        $sql$;
    END IF;
END
$$;

COMMIT;
