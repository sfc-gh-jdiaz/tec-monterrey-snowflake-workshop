> **Solo demo del instructor (acto 3).** Internal Marketplace requiere una organización con varias cuentas y no se puede hacer en un trial. Alternativa en el lab: compartir una vista segura con GRANT SELECT a otro rol.

# Paso 7 · Internal Marketplace: el dato como producto
Objetivo: Finanzas publica "Ventas mensuales gobernadas" y Comercial lo descubre y consume **sin copiar datos**.

1. Snowsight → **Data Products → Provider Studio → + Create listing → Internal Marketplace**.
2. Título: *Ventas mensuales gobernadas*. Objeto: `TEC_DEMO.ANALITICA.VENTAS_MENSUALES` y `SV_COMERCIAL`.
3. Descripción, dueño de datos, preguntas de ejemplo y diccionario (copia los COMMENT de la Semantic View).
4. Audiencia: rol `DIRECTOR_COMERCIAL` (o toda la organización).
5. Publica. Cambia de rol → **Data Products → Internal Marketplace** → busca y abre el producto.
6. Nota: las políticas de fila y enmascaramiento viajan con el dato.

> Internal Marketplace requiere una cuenta dentro de una organización; si tu trial no lo permite, sigue el paso en modo demostración.
