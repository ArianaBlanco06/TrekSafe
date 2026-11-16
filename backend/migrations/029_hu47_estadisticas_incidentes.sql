-- 029 · HU-47. John confirmó que la numeración está libre para esta historia.
-- HU-47: agregado de incidentes, sin datos personales ni médicos.
-- Requiere esquema inicial, 017 (incidentes) y 025 (informes de cierre), con sus
-- dependencias; aplicar 021 antes de 025 si se instala HU-40. Solo una vez por entorno.
-- No aplicar en DEV sin coordinación. No crea ni modifica incidentes ni informes.
BEGIN;

DO $$
BEGIN
    IF to_regclass('public.incidentes') IS NULL
       OR to_regclass('public.informes_cierre_incidente') IS NULL THEN
        RAISE EXCEPTION '029 requiere las migraciones 017 y 025';
    END IF;
    IF to_regclass('public.treksafe_migraciones') IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.treksafe_migraciones WHERE version = '029') THEN
            RAISE EXCEPTION '029 ya está registrada: no volver a aplicar';
        END IF;
    END IF;
END
$$;

CREATE INDEX idx_incidentes_reporte_apertura ON public.incidentes (abierto_en);
CREATE INDEX idx_incidentes_reporte_cierre ON public.incidentes (cerrado_en)
    WHERE cerrado_en IS NOT NULL;

CREATE FUNCTION public.treksafe_consultar_estadisticas_incidentes(
    p_rescatista_id UUID,
    p_desde TIMESTAMPTZ,
    p_hasta_exclusivo TIMESTAMPTZ,
    p_criterio_fecha TEXT,
    p_zona TEXT DEFAULT NULL,
    p_resultado TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_resumen JSONB;
BEGIN
    -- El backend pasa el actor del JWT propio de TrekSafe. El acceso RPC queda
    -- revocado a clientes; no se usa auth.uid() con este sistema de autenticación.
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
           ('localizado_sin_asistencia', 'asistido_en_terreno', 'evacuado', 'falsa_alarma')) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'FILTROS_REPORTE_INVALIDOS';
    END IF;

    -- Una fila por incidente. EXISTS aprovecha el informe único sin unir notas,
    -- relevos ni responsables. Sin filtro se conservan cierres antiguos sin informe.
    -- STABLE conserva el snapshot del statement para autorización y tres conteos.
    SELECT jsonb_build_object(
        'atendidos', count(*),
        'abiertos', count(*) FILTER (WHERE i.estado IN ('abierto', 'localizado')),
        'cerrados', count(*) FILTER (WHERE i.estado = 'cerrado')
    ) INTO v_resumen
    FROM public.incidentes i
    JOIN public.expediciones e ON e.id = i.expedicion_id
    WHERE (
        (p_criterio_fecha = 'apertura' AND i.abierto_en >= p_desde AND i.abierto_en < p_hasta_exclusivo)
        OR
        (p_criterio_fecha = 'cierre' AND i.cerrado_en >= p_desde AND i.cerrado_en < p_hasta_exclusivo)
    )
    AND (p_zona IS NULL OR btrim(p_zona) = '' OR strpos(lower(e.lugar_fin), lower(btrim(p_zona))) > 0)
    AND (p_resultado IS NULL OR (i.estado = 'cerrado' AND EXISTS (
        SELECT 1 FROM public.informes_cierre_incidente c
        WHERE c.incidente_id = i.id AND c.resultado = p_resultado
    )));

    RETURN v_resumen;
END;
$$;

REVOKE ALL ON FUNCTION public.treksafe_consultar_estadisticas_incidentes(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.treksafe_consultar_estadisticas_incidentes(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT)
    TO service_role;
COMMENT ON FUNCTION public.treksafe_consultar_estadisticas_incidentes(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT) IS
    'HU-47: conteos globales por incidente para rescatistas validados; intervalo [desde, hasta), destino literal y resultado. Solo lectura.';

DO $$
BEGIN
    IF to_regclass('public.treksafe_migraciones') IS NOT NULL THEN
        EXECUTE $sql$
            INSERT INTO public.treksafe_migraciones (version, nombre, hu)
            VALUES ('029', 'hu47_estadisticas_incidentes', 'HU-47')
            ON CONFLICT (version) DO NOTHING
        $sql$;
    END IF;
END
$$;

COMMIT;
