# Auditoría Lighthouse/Web Vitals — 2026-07-13

## Método y limitaciones

Se revisaron los manifests y configuración. No existe Lighthouse, Playwright ni script de medición en el proyecto, por lo que no se inventan valores de LCP, CLS o TBT. La tabla siguiente es una auditoría estática accionable, separada de las métricas que requieren navegador.

## Tabla por ruta

| Ruta | Problema | Métrica afectada | Causa probable | Archivo relacionado | Solución recomendada | Prioridad |
|---|---|---|---|---|---|---|
| `/` home | Aplicación cliente monolítica | LCP/TBT, no medidos | `App.tsx` contiene todas las vistas | `frontend/src/App.tsx:1-4485` | Dividir por dominio y cargar zonas pesadas bajo demanda | Alta |
| `/` home | Imágenes sin pipeline Next | LCP, no medido | `images.unoptimized=true` | `frontend/next.config.mjs` | Optimizar dimensiones/formato y lazy loading de imágenes no críticas | Media |
| `/login` | No hay ruta login visible en App Router | Accesibilidad/SEO, no medido | Auth backend existe, UI no está trazada | `backend/src/services/auth.js`, `frontend/src/app` | Definir y probar flujo login antes de crear métrica | Alta |
| `/dashboard` vista interna | Carga y consultas propias más carga global inicial | TBT/LCP, no medidos | Dashboard consulta datos en su propio efecto; antes también lo hacía el loader global | `frontend/src/App.tsx:2721-2810` | Mantener la eliminación de llamada duplicada y limitar consultas por rango | Media |
| `/reservas` vista interna | No hay ruta URL separada | LCP/SEO, no medido | Reservas viven dentro de un componente cliente | `frontend/src/App.tsx` | Medir navegación interna con una herramienta real; evaluar code splitting | Media |
| `/calendario` vista interna | Grid y filtros densos | TBT/CLS, no medidos | Render de filas, barras y sincronización de scroll | `frontend/src/App.tsx:541-1027`, `frontend/src/styles/app.css` | Medir con dataset representativo; considerar virtualización solo con regresión | Alta |
| `/habitaciones` vista interna | Tablas/cards grandes | TBT, no medido | Vista incluida en el bundle raíz | `frontend/src/App.tsx:3406-3726` | Carga por dominio/paginación si el volumen lo exige | Media |
| `/formularios` vista interna | Formularios largos y botones sin `type` homogéneo | Accesibilidad/TBT, no medidos | Módulo monolítico y controles densos | `frontend/src/App.tsx:1267-1586` | Labels/foco y `type=button`; medir interacción móvil | Media |
| `/importar-csv` vista interna | Preview de hasta 150 filas y procesamiento de archivos | TBT, no medido | Parseo en backend y tablas grandes en cliente | `frontend/src/App.tsx:4116-4485`, `backend/src/server.js:607-654` | Probar fixture grande, paginar preview y mantener límites de archivo | Media |
| `/configuración` | No se encontró ruta separada | Accesibilidad/SEO, no medido | Configuración no está expuesta como página App Router | `frontend/src/app` | Confirmar alcance antes de medir | Baja |

## Resultados técnicos disponibles

- `pnpm typecheck`: PASS.
- `pnpm build`: PASS; `/` 143 kB First Load JS, `/sistema-ui` 126 kB.
- `pnpm dev:frontend` existe; no se ejecutó un Lighthouse real por ausencia de herramienta.

## Siguiente medición

Instalar/configurar una herramienta en un entorno aislado, medir desktop y móvil sobre build reproducible y registrar URL, viewport, fecha, LCP, CLS, TBT, accesibilidad, buenas prácticas y SEO por ruta.
