# TurnoExtra — Cambios al documento de diseño del MVP: de «hotel» a «negocio»

Fecha: 16 de nov de 2026 · Para: @lucas · Se aplica sobre «TurnoExtra — Documento de diseño del MVP» (14 de nov de 2026).

**Decisión.** TurnoExtra deja de definirse como software para hoteles. Es software para cualquier negocio con picos de demanda y turnos que cubrir: HORECA primero (hoteles, restaurantes, bares, catering, eventos) y otros sectores después (por ejemplo retail o logística). El modelo A no cambia: TurnoExtra no recluta, no paga, no cobra por turno y no es empleador; **el negocio** contrata y paga.

El piloto sigue siendo un hotel de demostración. Eso es un dato del piloto, no del producto.

## 1. Qué se cambia y qué no

| Tema | Antes | Ahora |
|---|---|---|
| Cliente | Hotel | Negocio (HORECA y otros sectores con picos de demanda) |
| Entidad principal | `hotels` | `businesses` (negocio), con columna `sector` |
| Clave de aislamiento | `hotel_id` en cada tabla y consulta | `business_id` en cada tabla y consulta (mismo principio 1) |
| Rol del trabajador | Solo «mesero» | Catálogo de roles por negocio; el piloto arranca con «mesero» |
| Carnet de manipulación | Obligatorio para todos | Documento requerido **por rol**, no global |
| Textos de WhatsApp | `{hotel}` | `{negocio}` |
| Piloto y demo | 1 hotel de demostración | Sin cambio |

No cambia: modelo A, asignación atómica, oleadas, lista de espera, ALTA/BAJA con consentimiento, auditoría de solo inserción, UTC en base de datos, pago bruto sin dinero en el sistema.

## 2. Sección 1 · Contexto

Reemplazar el primer párrafo por:

> **Qué se construye.** Un software con el que un negocio cubre turnos extra con su propia banca de personal por WhatsApp: el encargado publica un turno en un panel web, la oferta llega a quienes el negocio ya conoce y autorizaron, el primero en aceptar ocupa el cupo y el panel se actualiza en vivo. Sirve a sectores con picos de demanda, empezando por HORECA. TurnoExtra no recluta, no paga, no cobra por turno y no es empleador (modelo A del informe).

En «Para qué sirve esta versión»: «con un hotel de demostración» pasa a «con un negocio de demostración (un hotel)».

**Fuera del alcance** (agregar una fila): *Funciones específicas por sector (plantillas de roles, reglas propias de cada industria) más allá del catálogo de roles y los documentos por rol.*

## 3. Sección 2 · Actores

| Antes | Ahora |
|---|---|
| Gerente del hotel | **Encargado del negocio** (gerente, jefe de turno o administrador) |
| Trabajador: «Mesero de la banca» | Trabajador: persona de la banca del negocio; solo usa WhatsApp |

Las historias HU-01 a HU-26 se mantienen. Donde dice «gerente» léase «encargado» y donde dice «hotel», «negocio». El código puede conservar `rol = 'gerente'` en `users` por ahora; es un cambio de etiqueta, no de comportamiento.

## 4. Sección 7 · Modelo de datos

Cambios mínimos sobre el DDL de la primera migración:

```sql
-- hotels  ->  businesses
CREATE TABLE businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  sector text NOT NULL DEFAULT 'horeca',      -- horeca, eventos, retail, logistica, otro
  ciudad text NOT NULL DEFAULT 'Barranquilla',
  plan text NOT NULL DEFAULT 'piloto',
  invite_code text NOT NULL UNIQUE,
  descanso_min_h int NOT NULL DEFAULT 8,
  tope_semanal_h int NOT NULL DEFAULT 42,
  wave_minutes int NOT NULL DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- hotel_id -> business_id en: users, hotel_workers (-> business_workers), shifts,
-- consents, hotel_terms (-> business_terms), audit_log.

-- Roles por negocio: reemplaza el rol fijo 'mesero'.
CREATE TABLE business_roles (
  business_id uuid NOT NULL REFERENCES businesses(id),
  rol text NOT NULL,                          -- 'mesero', 'cocina', 'barra', 'bodega'...
  doc_requerido text,                         -- NULL = no exige documento; 'carnet_manipulacion', etc.
  PRIMARY KEY (business_id, rol)
);
```

- `workers.roles` sigue siendo `text[]`; deja de tener `DEFAULT '{mesero}'` global y se valida contra `business_roles` del negocio que lo registra.
- `worker_documents.tipo` ya es texto libre: solo cambia la regla de elegibilidad (sección 5).
- La unicidad del trabajador por celular y su relación con varios negocios no cambia: un trabajador puede estar en la banca de varios negocios de distintos sectores.

## 5. Sección 8.1 · Elegibilidad

Una sola condición cambia. En vez de exigir siempre `carnet_manipulacion`:

```sql
AND ( br.doc_requerido IS NULL
      OR EXISTS (SELECT 1 FROM worker_documents d
                  WHERE d.worker_id = w.id AND d.tipo = br.doc_requerido
                    AND d.vence_el > (:ends_at AT TIME ZONE 'America/Bogota')::date) )
```

donde `br` es la fila de `business_roles` del rol del turno. El mensaje de exclusión de la vista previa pasa de «carnet vencido» a «documento vencido». El resto de condiciones (descanso, doble turno, tope semanal, consentimiento, baja) se mantiene tal cual y se evalúa entre todos los negocios, sin revelar a uno el detalle del turno de otro.

## 6. Reglas legales (sección 8.2, `legal_params`)

El piso salarial, los recargos nocturno y dominical y el divisor de horas salen del Código Sustantivo del Trabajo y no dependen del sector. **No se agrega lógica por sector en el MVP.** Pendiente de validar con el abogado o el contador: si algún sector que se quiera atender (por ejemplo transporte o logística) tiene jornadas, recargos o descansos propios; de ser así se resuelve con filas de `legal_params` por sector en v1.1, no antes.

## 7. Sección 5 · Vistas del panel

| Vista | Cambio |
|---|---|
| Barra superior | «Nombre del hotel» pasa a «nombre del negocio» |
| `/turnos/nuevo` | El campo Rol lista los roles del negocio (`business_roles`); en el piloto solo «Mesero» |
| `/banca` | Carnet por vencer pasa a «documento por vencer»; la regla de 30 días se mantiene |
| Modal Invitar | Aviso fijo sin cambios: «Solo registra a personas que tú puedas contratar» |

Ruta de la API: `/hotel/*` pasa a `/business/*` (`/business/me`, `/business/invite`, `/business/terms/accept`, `/business/alerts`).

## 8. Sección 6 · Mensajes de WhatsApp

Reemplazar la variable `{hotel}` por `{negocio}` en W1 a W14. Ejemplo, W5:

> {negocio} te ofrece un turno de {rol}: {día} de {inicio} a {fin}, en {lugar}. Pago bruto: {pago} COP{incluye}. {negocio} es quien te contrata y te paga. ¿Te interesa?

**Ojo:** las plantillas W5, W6, W8, W9 y W11 deben enviarse a aprobación de Meta ya con `{negocio}`; cambiarlas después obliga a volver a aprobarlas.

## 9. Textos legales y portal

El portal público y el texto de autorización v1.0 mencionan «hotel». Hay que pasarlos a «negocio» y subir la versión del texto (`CONSENT_TEXT_VERSION` a 1.1) antes del piloto, para que la autorización guardada corresponda al texto que la persona vio. Revisar con el abogado la redacción antes de publicar.

## 10. Demo y guion

Sin cambios de fondo. El `demo seed` crea un negocio de demostración del sector `horeca` con 12 trabajadores ficticios. Se puede mencionar en el guion que el mismo flujo aplica a un restaurante o a un evento, sin mostrar otro sector en pantalla.

## 11. Supuestos nuevos y preguntas abiertas

Supuestos que tomé (cámbialos si no sirven):

- El piloto sigue en HORECA; los demás sectores se declaran como destino, no como funcionalidad probada.
- El sector es una etiqueta de la cuenta; no cambia reglas ni precios en el MVP.
- El carnet de manipulación de alimentos solo se exige a los roles que lo necesiten.

Preguntas abiertas:

- ¿Qué roles ofrece el catálogo inicial además de «mesero»? (cocina, barra, steward, ayudante de eventos…)
- ¿Qué documento exige cada rol? Hoy solo conocemos el carnet de manipulación.
- ¿Algún sector objetivo tiene reglas laborales distintas que el abogado deba revisar antes de abrir ese sector?
- ¿Se renombra ya la base de datos (`hotels` a `businesses`) o se aplica solo al código nuevo? Renombrar ahora es barato: aún no hay primera migración.
