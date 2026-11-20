-- 01_datos.sql · generado desde notebooks/01_datos.ipynb con sql/.generar.py (misma lógica, idempotente; no editar a mano)

-- ======================================================================
-- 01 · Datos: ingesta desde CSV
-- ======================================================================

-- [ctx_base_esquema]
-- Contexto de ejecución (primera celda, requerido en runtimes < 2.4)
USE ROLE TEC_ADMIN;
USE WAREHOUSE TEC_WH;
USE DATABASE TEC_DEMO;
USE SCHEMA TEC_DEMO.RAW;

-- [antes]
SELECT COUNT(*) tablas_existentes FROM TEC_DEMO.INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='RAW';

-- [formato_stage]
-- Formato de los CSV y stage donde viven los archivos del kit.
-- CREATE OR REPLACE en el formato (nada depende de él): así una corrida anterior con otra configuración no se queda.
-- EMPTY_FIELD_AS_NULL = TRUE: un campo vacío en el CSV llega como NULL (no como ''), así COUNT, AVG y los filtros IS NULL son correctos.
CREATE OR REPLACE FILE FORMAT TEC_DEMO.RAW.CSV_GZ
  TYPE = CSV COMPRESSION = AUTO FIELD_DELIMITER = ',' SKIP_HEADER = 1
  FIELD_OPTIONALLY_ENCLOSED_BY = '"' NULL_IF = ('\\N') EMPTY_FIELD_AS_NULL = TRUE ENCODING = 'UTF8';

CREATE STAGE IF NOT EXISTS TEC_DEMO.RAW.DATOS_CSV
  DIRECTORY = (ENABLE = TRUE) ENCRYPTION = (TYPE = 'SNOWFLAKE_SSE')
  COMMENT = 'Datos congelados del workshop Abarrotera del Centro (CSV gzip)';

-- [copiar_archivos]
/* Opción A (recomendada): la carpeta del kit está en tu workspace "My Workspace".
   ✏️ Si la importaste con otro nombre, cámbialo aquí; si no, se prueban los nombres de las versiones del kit.
   Opción B: Snowsight → Data → Add data → Load files into a stage → TEC_DEMO.RAW.DATOS_CSV,
             respetando las carpetas raw/, referencia/ y control/. Si usas la opción B, esta celda solo confirma los archivos. */
SET carpeta_kit = 'TEC Monterrey Final 2';

EXECUTE IMMEDIATE $$
DECLARE
  presentes INT;
  faltantes STRING;
  carpetas ARRAY;
  usada STRING DEFAULT NULL;
BEGIN
  -- Los 26 archivos esperados, por nombre (no basta contar: 26 archivos equivocados también son 26)
  CREATE OR REPLACE TEMPORARY TABLE TEC_DEMO.RAW.ARCHIVOS_ESPERADOS (ruta STRING) AS
  SELECT column1 FROM VALUES ('control/control.csv'),
    ('raw/cedis/cedis.csv.gz'), ('raw/ciudades/ciudades.csv.gz'), ('raw/clima/clima.csv.gz'),
    ('raw/feedback_clientes/feedback_clientes.csv.gz'), ('raw/inventario_diario/inventario_diario.csv.gz'),
    ('raw/ordenes_compra/ordenes_compra.csv.gz'), ('raw/precios_competencia/precios_competencia.csv.gz'),
    ('raw/productos/productos.csv.gz'), ('raw/promociones/promociones.csv.gz'), ('raw/proveedores/proveedores.csv.gz'),
    ('raw/regiones/regiones.csv.gz'), ('raw/tiendas/tiendas.csv.gz'),
    ('raw/ventas/ventas__0_0_0.csv.gz'), ('raw/ventas/ventas__0_1_0.csv.gz'), ('raw/ventas/ventas__0_2_0.csv.gz'),
    ('raw/ventas/ventas__0_3_0.csv.gz'), ('raw/ventas/ventas__0_4_0.csv.gz'), ('raw/ventas/ventas__0_5_0.csv.gz'),
    ('raw/ventas/ventas__0_6_0.csv.gz'), ('raw/ventas/ventas__0_7_0.csv.gz'),
    ('raw/llamadas/llamadas.csv.gz'), ('referencia/documentos/documentos.csv.gz'), ('referencia/llamadas_analizadas/llamadas_analizadas.csv.gz'), ('referencia/pronostico_diario/pronostico_diario.csv.gz'),
    ('referencia/temas_comentario/temas_comentario.csv.gz');
  ALTER STAGE TEC_DEMO.RAW.DATOS_CSV REFRESH;
  presentes := (SELECT COUNT(*) FROM TEC_DEMO.RAW.ARCHIVOS_ESPERADOS e JOIN DIRECTORY(@TEC_DEMO.RAW.DATOS_CSV) d ON d.relative_path = e.ruta);
  IF (presentes = 26) THEN
    RETURN 'El stage ya tiene los 26 archivos esperados: no se copia nada';
  END IF;
  -- Prueba la carpeta indicada y, si no trae los archivos, los nombres conocidos del kit: versiones anteriores y el
  -- repositorio de GitHub (clonado = 'tec-monterrey-datos-a-agentes'; ZIP descargado = '...-main').
  -- Ojo: COPY FILES desde una carpeta inexistente no falla (copia 0 archivos), por eso se cuenta después de cada intento.
  carpetas := ARRAY_DISTINCT(ARRAY_CONSTRUCT($carpeta_kit, 'TEC Monterrey Final 2', 'TEC Monterrey Final',
                                             'tec-monterrey-datos-a-agentes', 'tec-monterrey-datos-a-agentes-main'));
  FOR i IN 0 TO ARRAY_SIZE(carpetas) - 1 DO
    IF (presentes < 26) THEN
      BEGIN
        EXECUTE IMMEDIATE 'COPY FILES INTO @TEC_DEMO.RAW.DATOS_CSV/ FROM ''snow://workspace/USER$' || CURRENT_USER() ||
          '.PUBLIC."DEFAULT$"/versions/live/' || REPLACE(carpetas[i]::STRING, '''', '') || '/datos/'' PATTERN = ''.*[.]csv([.]gz)?''';
      EXCEPTION
        WHEN OTHER THEN NULL;  -- sin acceso a esa ruta: probamos la siguiente
      END;
      ALTER STAGE TEC_DEMO.RAW.DATOS_CSV REFRESH;
      presentes := (SELECT COUNT(*) FROM TEC_DEMO.RAW.ARCHIVOS_ESPERADOS e JOIN DIRECTORY(@TEC_DEMO.RAW.DATOS_CSV) d ON d.relative_path = e.ruta);
      IF (presentes = 26) THEN
        usada := carpetas[i]::STRING;
      END IF;
    END IF;
  END FOR;
  faltantes := (SELECT LISTAGG(e.ruta, ', ') FROM TEC_DEMO.RAW.ARCHIVOS_ESPERADOS e LEFT JOIN DIRECTORY(@TEC_DEMO.RAW.DATOS_CSV) d ON d.relative_path = e.ruta WHERE d.relative_path IS NULL);
  IF (presentes = 26) THEN
    RETURN 'Copiados desde la workspace (' || usada || '): 26 de 26 archivos esperados';
  END IF;
  RETURN 'REVISAR: ' || presentes || ' de 26 archivos. ' ||
         IFF(usada IS NULL, 'No se encontró la carpeta del kit en tu workspace (ajusta carpeta_kit o usa la opción B). ', '') ||
         'Faltan: ' || faltantes;
END;
$$;

-- [archivos_stage]
SELECT relative_path AS archivo, ROUND(size / 1024 / 1024, 1) AS mb
FROM DIRECTORY(@TEC_DEMO.RAW.DATOS_CSV) WHERE relative_path LIKE '%.csv%' ORDER BY 1;

-- [copiar_audios]
/* Audios del call center: 13 mp3 de datos/audios/ a un stage propio (cifrado SNOWFLAKE_SSE: AI_TRANSCRIBE
   solo lee stages con cifrado del lado del servidor). Misma lógica que la copia de los CSV: se omite si ya están
   los 13, y prueba los nombres conocidos de la carpeta del kit (usa el mismo $carpeta_kit de la celda anterior).
   Opción B: Snowsight → Data → Add data → Load files into a stage → TEC_DEMO.RAW.AUDIOS (los 13 mp3, sin carpetas). */
CREATE STAGE IF NOT EXISTS TEC_DEMO.RAW.AUDIOS
  DIRECTORY = (ENABLE = TRUE) ENCRYPTION = (TYPE = 'SNOWFLAKE_SSE')
  COMMENT = 'Llamadas del call center de Abarrotera del Centro (mp3, sintéticas)';

EXECUTE IMMEDIATE $$
DECLARE
  presentes INT;
  carpetas ARRAY;
  usada STRING DEFAULT NULL;
BEGIN
  CREATE OR REPLACE TEMPORARY TABLE TEC_DEMO.RAW.AUDIOS_ESPERADOS (archivo STRING) AS
  SELECT column1 FROM VALUES
    ('llamada_01_faltante_cedis.mp3'), ('llamada_02_terminal_bancaria.mp3'), ('llamada_03_cuarto_frio.mp3'),
    ('llamada_04_producto_caducado.mp3'), ('llamada_05_discrepancia_precios.mp3'), ('llamada_06_proveedor_directo_retraso.mp3'),
    ('llamada_07_insumos_empaque.mp3'), ('llamada_08_merma_transito.mp3'), ('llamada_09_sistema_caido_corte.mp3'),
    ('llamada_10_facturacion_mayoreo.mp3'), ('llamada_11_quiebre_bebidas_leon.mp3'),
    ('llamada_12_fin_promocion_queretaro.mp3'), ('llamada_13_competencia_aguascalientes.mp3');
  ALTER STAGE TEC_DEMO.RAW.AUDIOS REFRESH;
  presentes := (SELECT COUNT(*) FROM TEC_DEMO.RAW.AUDIOS_ESPERADOS e JOIN DIRECTORY(@TEC_DEMO.RAW.AUDIOS) d ON d.relative_path = e.archivo);
  IF (presentes = 13) THEN
    RETURN 'El stage AUDIOS ya tiene las 13 llamadas: no se copia nada';
  END IF;
  carpetas := ARRAY_DISTINCT(ARRAY_CONSTRUCT($carpeta_kit, 'TEC Monterrey Final 2', 'TEC Monterrey Final',
                                             'tec-monterrey-datos-a-agentes', 'tec-monterrey-datos-a-agentes-main'));
  FOR i IN 0 TO ARRAY_SIZE(carpetas) - 1 DO
    IF (presentes < 13) THEN
      BEGIN
        EXECUTE IMMEDIATE 'COPY FILES INTO @TEC_DEMO.RAW.AUDIOS/ FROM ''snow://workspace/USER$' || CURRENT_USER() ||
          '.PUBLIC."DEFAULT$"/versions/live/' || REPLACE(carpetas[i]::STRING, '''', '') || '/datos/audios/'' PATTERN = ''[^/]*[.]mp3''';
      EXCEPTION
        WHEN OTHER THEN NULL;
      END;
      ALTER STAGE TEC_DEMO.RAW.AUDIOS REFRESH;
      presentes := (SELECT COUNT(*) FROM TEC_DEMO.RAW.AUDIOS_ESPERADOS e JOIN DIRECTORY(@TEC_DEMO.RAW.AUDIOS) d ON d.relative_path = e.archivo);
      IF (presentes = 13) THEN
        usada := carpetas[i]::STRING;
      END IF;
    END IF;
  END FOR;
  IF (presentes = 13) THEN
    RETURN 'Copiados desde la workspace (' || usada || '): 13 de 13 audios';
  END IF;
  RETURN 'REVISAR: ' || presentes || ' de 13 audios en @TEC_DEMO.RAW.AUDIOS (ajusta carpeta_kit o usa la opción B)';
END;
$$;

-- [audios_stage]
SELECT relative_path AS archivo, ROUND(size / 1024 / 1024, 1) AS mb
FROM DIRECTORY(@TEC_DEMO.RAW.AUDIOS) ORDER BY 1;

-- [control_carga]
-- control.csv trae, por tabla, las filas esperadas y una suma de control: la "verdad" contra la que validamos.
CREATE OR REPLACE TABLE TEC_DEMO.RAW.CONTROL_CARGA (tabla STRING, filas NUMBER, suma_control FLOAT);
COPY INTO TEC_DEMO.RAW.CONTROL_CARGA FROM @TEC_DEMO.RAW.DATOS_CSV/control/control.csv
  FILE_FORMAT = (FORMAT_NAME = TEC_DEMO.RAW.CSV_GZ) FORCE = TRUE;

/* Cómo se carga cada tabla, en un solo lugar: esquema destino, carpeta del stage, columnas (NULL = todas, en orden)
   y la expresión de la suma de control (la misma que usa control.csv). La usan la carga y la validación.
   en_carga_raw = TRUE: la carga CARGAR_TODO aquí. Las de referencia (ANALITICA / AGENTES) las carga su notebook. */
CREATE OR REPLACE TABLE TEC_DEMO.RAW.HUELLA_CARGA (orden INT, esquema STRING, tabla STRING, carpeta STRING, columnas STRING, suma STRING, en_carga_raw BOOLEAN) AS
SELECT * FROM VALUES
  (1,  'RAW', 'REGIONES',            'raw/regiones',            '$1, PARSE_JSON($2), $3',   'ROUND(SUM(ARRAY_SIZE(estados)), 2)', TRUE),
  -- CEDIS: geo se calcula después de la carga (sin funciones geoespaciales dentro del COPY)
  (2,  'RAW', 'CEDIS',               'raw/cedis',               '$1, $2, $3, $4, $5, NULL', 'ROUND(SUM(latitud + longitud), 2)', TRUE),
  (3,  'RAW', 'CIUDADES',            'raw/ciudades',            NULL, 'ROUND(SUM(peso), 2)', TRUE),
  (4,  'RAW', 'TIENDAS',             'raw/tiendas',             NULL, 'ROUND(SUM(latitud), 2)', TRUE),
  (5,  'RAW', 'PRODUCTOS',           'raw/productos',           NULL, 'ROUND(SUM(precio_lista), 2)', TRUE),
  (6,  'RAW', 'PROVEEDORES',         'raw/proveedores',         NULL, 'ROUND(SUM(lead_time_dias), 2)', TRUE),
  (7,  'RAW', 'PROMOCIONES',         'raw/promociones',         NULL, 'ROUND(SUM(descuento), 2)', TRUE),
  (8,  'RAW', 'VENTAS',              'raw/ventas',              NULL, 'ROUND(SUM(cantidad * precio_unitario), 0)', TRUE),
  (9,  'RAW', 'INVENTARIO_DIARIO',   'raw/inventario_diario',   NULL, 'ROUND(SUM(unidades_disponibles), 0)', TRUE),
  (10, 'RAW', 'ORDENES_COMPRA',      'raw/ordenes_compra',      NULL, 'ROUND(SUM(unidades_recibidas), 0)', TRUE),
  (11, 'RAW', 'PRECIOS_COMPETENCIA', 'raw/precios_competencia', NULL, 'ROUND(SUM(brecha_vs_propio), 2)', TRUE),
  (12, 'RAW', 'CLIMA',               'raw/clima',               NULL, 'ROUND(SUM(temp_max_c), 1)', TRUE),
  (13, 'RAW', 'FEEDBACK_CLIENTES',   'raw/feedback_clientes',   NULL, 'ROUND(SUM(calificacion), 0)', TRUE),
  -- Catálogo de las 13 llamadas del call center (el audio vive en el stage TEC_DEMO.RAW.AUDIOS)
  (14, 'RAW', 'LLAMADAS',            'raw/llamadas',            NULL, 'ROUND(SUM(duracion_seg), 1)', TRUE),
  -- Referencia congelada (resultados oficiales de IA / ML y documentos del agente)
  -- comentario_id (4a columna) se calcula después de cargar: HASH() no se puede usar dentro de un COPY
  (15, 'ANALITICA', 'TEMAS_COMENTARIO',  'referencia/temas_comentario',  '$1, $2, $3, NULL', 'COUNT_IF(tema = ''Desabasto de producto'')', FALSE),
  (16, 'ANALITICA', 'PRONOSTICO_DIARIO', 'referencia/pronostico_diario', NULL, 'ROUND(SUM(venta_esperada), 0)', FALSE),
  (17, 'AGENTES',   'DOCUMENTOS',        'referencia/documentos',        NULL, 'SUM(LENGTH(contenido))', FALSE),
  -- segmentos y extraccion son JSON: se convierten con PARSE_JSON al cargar (lo carga 03c_call_center)
  (18, 'ANALITICA', 'LLAMADAS_ANALIZADAS', 'referencia/llamadas_analizadas',
       '$1, $2, PARSE_JSON($3), $4, $5, $6, $7, $8, $9, PARSE_JSON($10), $11, $12', 'SUM(LENGTH(transcripcion))', FALSE);

/* Carga idempotente de UNA tabla. Si ya tiene las filas Y la suma de control esperadas, no la toca.
   Si no (vacía, incompleta o con datos de otra generación), la vacía y la recarga desde el stage.
   Solo recibe el nombre: la carpeta, las columnas y la suma salen de HUELLA_CARGA (no acepta SQL como parámetro). */
CREATE OR REPLACE PROCEDURE TEC_DEMO.RAW.CARGAR_CSV(TABLA STRING)
RETURNS STRING
LANGUAGE SQL
AS
$$
DECLARE
  v_destino STRING;
  v_carpeta STRING;
  v_columnas STRING;
  v_suma STRING;
  esperadas INT;
  suma_esperada FLOAT;
  actuales INT;
  suma_actual FLOAT;
  origen STRING;
  res RESULTSET;
  tabla_no_registrada EXCEPTION (-20001, 'La tabla no está registrada en TEC_DEMO.RAW.HUELLA_CARGA');
BEGIN
  SELECT MAX('TEC_DEMO.' || esquema || '.' || tabla), MAX(carpeta), MAX(columnas), MAX(suma)
    INTO :v_destino, :v_carpeta, :v_columnas, :v_suma
    FROM TEC_DEMO.RAW.HUELLA_CARGA WHERE tabla = UPPER(:TABLA);
  IF (v_destino IS NULL) THEN
    RAISE tabla_no_registrada;
  END IF;
  SELECT MAX(filas), MAX(suma_control) INTO :esperadas, :suma_esperada FROM TEC_DEMO.RAW.CONTROL_CARGA WHERE tabla = UPPER(:TABLA);
  res := (EXECUTE IMMEDIATE 'SELECT COUNT(*), COALESCE(' || v_suma || ', 0) FROM ' || v_destino);
  LET c1 CURSOR FOR res;
  OPEN c1;
  FETCH c1 INTO actuales, suma_actual;
  CLOSE c1;
  IF (actuales = esperadas AND ABS(suma_actual - suma_esperada) <= 1) THEN
    RETURN UPPER(TABLA) || ': ' || actuales || ' filas, huella correcta, sin cambios';
  END IF;
  origen := '@TEC_DEMO.RAW.DATOS_CSV/' || v_carpeta || '/';
  IF (v_columnas IS NOT NULL) THEN
    origen := '(SELECT ' || v_columnas || ' FROM ' || origen || ')';
  END IF;
  TRUNCATE TABLE IDENTIFIER(:v_destino);
  EXECUTE IMMEDIATE 'COPY INTO ' || v_destino || ' FROM ' || origen ||
                    ' FILE_FORMAT = (FORMAT_NAME = TEC_DEMO.RAW.CSV_GZ) FORCE = TRUE ON_ERROR = ABORT_STATEMENT';
  res := (EXECUTE IMMEDIATE 'SELECT COUNT(*), COALESCE(' || v_suma || ', 0) FROM ' || v_destino);
  LET c2 CURSOR FOR res;
  OPEN c2;
  FETCH c2 INTO actuales, suma_actual;
  CLOSE c2;
  RETURN UPPER(TABLA) || ': ' || actuales || ' filas recargadas' ||
         IFF(actuales = esperadas AND ABS(suma_actual - suma_esperada) <= 1, ', huella correcta', ' · REVISAR, esperadas ' || esperadas);
END;
$$;

/* Carga TODAS las tablas en orden. Sube el warehouse a MEDIUM solo durante la carga y SIEMPRE lo regresa a XSMALL,
   también si algo falla (así no se queda prendido en un tamaño caro). */
CREATE OR REPLACE PROCEDURE TEC_DEMO.RAW.CARGAR_TODO()
RETURNS STRING
LANGUAGE SQL
AS
$$
DECLARE
  salida STRING DEFAULT '';
  r STRING;
  c CURSOR FOR SELECT tabla FROM TEC_DEMO.RAW.HUELLA_CARGA WHERE en_carga_raw ORDER BY orden;
BEGIN
  ALTER WAREHOUSE TEC_WH SET WAREHOUSE_SIZE = 'MEDIUM';
  FOR fila IN c DO
    LET t STRING := fila.tabla;
    CALL TEC_DEMO.RAW.CARGAR_CSV(:t) INTO :r;
    salida := salida || r || '\n';
  END FOR;
  UPDATE TEC_DEMO.RAW.CEDIS SET geo = ST_MAKEPOINT(longitud, latitud) WHERE geo IS NULL;
  ALTER WAREHOUSE TEC_WH SET WAREHOUSE_SIZE = 'XSMALL';
  RETURN salida;
EXCEPTION
  WHEN OTHER THEN
    ALTER WAREHOUSE TEC_WH SET WAREHOUSE_SIZE = 'XSMALL';
    RAISE;
END;
$$;

/* Compara cada tabla contra control.csv usando las mismas expresiones de HUELLA_CARGA.
   Solo revisa las que ya existen (las de referencia aparecen después de correr 03b y 05). */
CREATE OR REPLACE PROCEDURE TEC_DEMO.RAW.VERIFICAR_HUELLA()
RETURNS TABLE (estado STRING, tabla STRING, filas NUMBER, filas_esperadas NUMBER, suma_control FLOAT, suma_esperada FLOAT)
LANGUAGE SQL
AS
$$
DECLARE
  consulta STRING;
  res RESULTSET;
BEGIN
  consulta := (SELECT LISTAGG('SELECT ''' || h.tabla || ''' tabla, COUNT(*) filas, ' || h.suma || ' suma FROM TEC_DEMO.' || h.esquema || '.' || h.tabla, ' UNION ALL ')
                        WITHIN GROUP (ORDER BY h.orden)
               FROM TEC_DEMO.RAW.HUELLA_CARGA h
               JOIN TEC_DEMO.INFORMATION_SCHEMA.TABLES t ON t.table_schema = h.esquema AND t.table_name = h.tabla);
  res := (EXECUTE IMMEDIATE
    'WITH real AS (' || consulta || ')
     SELECT IFF(r.filas = c.filas AND ABS(r.suma - c.suma_control) <= 1, ''PASS'', ''FAIL''),
            r.tabla, r.filas, c.filas, r.suma, c.suma_control
     FROM real r LEFT JOIN TEC_DEMO.RAW.CONTROL_CARGA c ON c.tabla = r.tabla
     ORDER BY 1, 2');
  RETURN TABLE(res);
END;
$$;

-- [tablas_raw]
CREATE TABLE IF NOT EXISTS REGIONES (region STRING, estados ARRAY, cedis STRING);
CREATE TABLE IF NOT EXISTS CEDIS (cedis_id NUMBER(18,0), nombre STRING, region STRING, latitud NUMBER(6,4), longitud NUMBER(7,4), geo GEOGRAPHY);
CREATE TABLE IF NOT EXISTS CIUDADES (estado STRING, ciudad STRING, latitud FLOAT, longitud FLOAT, peso NUMBER(38,0), lada STRING);
CREATE TABLE IF NOT EXISTS TIENDAS (tienda_id NUMBER(18,0), region STRING, estado STRING, canal STRING, nombre STRING, contacto STRING,
  telefono STRING, email STRING, ciudad STRING, colonia STRING, direccion STRING, latitud FLOAT, longitud FLOAT);
CREATE TABLE IF NOT EXISTS PRODUCTOS (producto_id NUMBER(11,0), categoria STRING, sku STRING, marca STRING, precio_lista NUMBER(12,2), costo_pct FLOAT);
CREATE TABLE IF NOT EXISTS PROVEEDORES (proveedor_id NUMBER(11,0), nombre STRING, categoria STRING, lead_time_dias NUMBER(9,0));
CREATE TABLE IF NOT EXISTS PROMOCIONES (promo_id NUMBER(38,0), region STRING, categoria STRING, inicio DATE, fin DATE, descuento FLOAT, descripcion STRING);
-- Dinero en NUMBER(12,2): exacto al centavo (FLOAT acumula errores de redondeo al sumar millones de filas).
-- Llaves y conteos con margen (9 dígitos): un kit más grande no truena por precisión.
CREATE TABLE IF NOT EXISTS VENTAS (venta_id NUMBER(20,0), fecha DATE, tienda_id NUMBER(9,0), producto_id NUMBER(9,0), cantidad NUMBER(34,0),
  precio_unitario NUMBER(12,2), costo_unitario NUMBER(12,2), promo_id NUMBER(38,0), forma_pago STRING);
CREATE TABLE IF NOT EXISTS INVENTARIO_DIARIO (fecha DATE, cedis_id NUMBER(18,0), region STRING, producto_id NUMBER(11,0), categoria STRING,
  demanda_diaria NUMBER(9,0), unidades_disponibles NUMBER(9,0), en_quiebre BOOLEAN);
CREATE TABLE IF NOT EXISTS ORDENES_COMPRA (oc_id NUMBER(11,0), fecha_orden DATE, proveedor_id NUMBER(9,0), proveedor STRING, categoria STRING,
  cedis_id NUMBER(9,0), region STRING, unidades_pedidas NUMBER(9,0), fecha_prometida DATE, fecha_recepcion DATE, unidades_recibidas NUMBER(9,0));
CREATE TABLE IF NOT EXISTS PRECIOS_COMPETENCIA (semana DATE, region STRING, estado STRING, categoria STRING, competidor STRING,
  brecha_vs_propio FLOAT, actividad_observada STRING);
CREATE TABLE IF NOT EXISTS CLIMA (fecha DATE, region STRING, estado STRING, temp_max_c FLOAT, lluvia_mm FLOAT);
CREATE TABLE IF NOT EXISTS FEEDBACK_CLIENTES (feedback_id NUMBER(11,0), fecha DATE, region STRING, estado STRING, canal STRING,
  email_cliente STRING, comentario STRING, calificacion NUMBER(2,0));
-- Catálogo del call center: una fila por llamada; ARCHIVO es el nombre del mp3 en @TEC_DEMO.RAW.AUDIOS
CREATE TABLE IF NOT EXISTS LLAMADAS (llamada_id NUMBER(9,0), archivo STRING, fecha DATE, tienda_id NUMBER(9,0), region STRING,
  estado STRING, ciudad STRING, tienda STRING, agente STRING, duracion_seg NUMBER(8,1));

-- [carga]
-- Carga las 14 tablas. CARGAR_TODO sube TEC_WH a MEDIUM solo durante la carga (~1 min)
-- y lo regresa a XSMALL al terminar, incluso si algo falla.
CALL TEC_DEMO.RAW.CARGAR_TODO();

-- ======================================================================
-- Después: validación contra la huella
-- ======================================================================

-- [volumen]
-- Misma expresión de huella que usó la carga (tabla HUELLA_CARGA): todo debe salir PASS
CALL TEC_DEMO.RAW.VERIFICAR_HUELLA();

-- ======================================================================
-- Lectura: la caída que vamos a investigar
-- ======================================================================

-- [bebidas_bajio]
SELECT DATE_TRUNC('month', v.fecha) mes, SUM(v.cantidad*v.precio_unitario)/1e6 venta_mdp
FROM TEC_DEMO.RAW.VENTAS v JOIN TEC_DEMO.RAW.TIENDAS t USING (tienda_id) JOIN TEC_DEMO.RAW.PRODUCTOS p USING (producto_id)
WHERE t.region='Bajío' AND p.categoria='Bebidas' AND v.fecha >= '2026-01-01'
GROUP BY 1 ORDER BY 1;
