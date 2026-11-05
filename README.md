# Dashboard Administrativo de Inventario - CGI Naranjo

Este proyecto consiste en el desarrollo de un **dashboard administrativo responsivo** diseñado específicamente para el **Centro de Gestión e Informática (CGI) de Naranjo Informática**. Su objetivo principal es centralizar y optimizar el control de stock, asignación y estado de los **insumos tecnológicos** (mouses, teclados, auriculares, cables, etc.) de la institución.

El sistema está construido aplicando **HTML5 semántico, CSS Grid, Flexbox y JavaScript Vanilla**, garantizando un diseño moderno, interactivo, accesible y adaptado a todo tipo de dispositivos.

---

## Características Principales

- **Layout Avanzado con CSS Grid:** Distribución estructural limpia que organiza las secciones principales del sistema: **Sidebar** (navegación por categorías), **Header** (búsqueda y perfil de usuario), **Área de Contenido** (métricas y tablas) y **Footer**.
- **Componentes Internos con Flexbox:** Alineación, espaciado y distribución perfecta en las tarjetas de indicadores clave (KPIs), formularios de registro, elementos del menú y filas de la tabla de stock.
- **Interactividad Dinámica (JavaScript):**
  - **Menú Lateral Colapsable:** Maximiza el espacio de trabajo en pantallas pequeñas mediante un botón de hamburguesa.
  - **Gestión de Stock:** Funcionalidad interactiva para registrar ingresos de nuevos periféricos, editar cantidades y filtrar insumos por categorías.
  - **Alertas Visuales:** Modales y notificaciones dinámicas cuando un insumo crítico (ej. mouses o teclados) baja del stock mínimo.
- **Responsividad Total:**
  Adaptación fluida a entornos de Escritorio, Tablet y Móvil mediante el uso estratégico de **Media Queries**.
- **Accesibilidad (A11y):**
  Uso estricto de HTML semántico, roles ARIA (`role="navigation"`, `role="main"`, `aria-expanded`), contrastes de color verificados según las pautas WCAG y soporte para navegación por teclado.
- **Buenas Prácticas de Desarrollo:**
  Uso de **Variables CSS** (Custom Properties) para la paleta de colores del CGI, código debidamente documentado con comentarios y arquitectura limpia de archivos.

---

## Vista Previa

El dashboard es completamente fluido y se adapta automáticamente a las necesidades del operario en bodega o administración:

- **Escritorio:** Panel completo con barra lateral expandida, visualización de métricas de insumos en tiempo real y tabla detallada de stock.
- **Tablet:** El menú lateral se contrae automáticamente mostrando solo iconos para priorizar los datos de la tabla.
- **Móvil:** Diseño en una sola columna con menú desplegable tipo _drawer_ optimizado para pantallas táctiles.

> _Las capturas de pantalla de la interfaz en sus diferentes estados se encuentran en la carpeta `/evidencias`._

---

## Tecnologías Usadas

- **HTML5:** Estructuración semántica y accesible del sitio (`<nav>`, `<main>`, `<aside>`, `<header>`, `<section>`).
- **CSS3 (Grid & Flexbox):** Control absoluto del maquetado estructural y los componentes internos.
- **JavaScript (Vanilla JS):** Lógica encargada de la manipulación del DOM, filtros de búsqueda, apertura de modales y colapso del menú lateral.
- **Variables CSS:** Centralización de la identidad visual del CGI (colores institucionales, estados de alerta para stock crítico, tipografías).

---

## Servidor (Node + Express + EJS + SQLite)

Las páginas se renderizan en el servidor con **EJS** y **express-ejs-layouts**; los datos de Consumibles salen de SQLite (`data/inventario.db`, se crea sola).

```bash
npm install
npm run seed     # carga los tóners y casos del Excel de control (solo si la base está vacía)
npm run dev      # http://localhost:3000  (reinicia al guardar cambios en server/)
npm start        # modo normal
```

Requiere Node 22.13 o superior (usa el módulo `node:sqlite` incluido en Node).

### Estructura

```
server/
  index.js                 Express + EJS + layouts
  db.js                    esquema SQLite y registro de movimientos
  services/consumibles.js  lógica de negocio (la usan las páginas y la API)
  routes/web.js            páginas y formularios
  routes/api.js            API JSON
  seed.js                  carga inicial
views/
  layouts/main.ejs         layout común (sidebar, header, footer)
  partials/                sidebar, header, mensajes, barras
  dashboard.ejs            Panel
  consumibles/             inventario, entregas, detalle y diálogos
  repuestos.ejs
public/                    CSS y JS del cliente
```

### Insumos de impresión

- **Insumos** (`/consumibles`): tóner, tintas, cartuchos, unidades de imagen, cintas u otros. Existencia respecto al mínimo (*Disponible*, *Reponer*, *Sin stock*), filtros por estado y tipo, y búsqueda.
- **Movimientos** (`/consumibles/movimientos`): el registro de casos (N.º caso, Técnico, Lugar), ingresos y ajustes, con filtros por tipo y fechas.
- **Detalle** (`/consumibles/:id`): ficha del insumo, historial, edición, corrección de existencia por conteo y baja.
- Cada cambio de stock queda en `movimientos` como **ENTRADA**, **SALIDA** o **AJUSTE**.
- **Exportar** descarga un CSV que abre directo en Excel.

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/consumibles?q=&estado=` | Lista con estado calculado |
| POST | `/api/consumibles` | Crear tóner |
| PUT | `/api/consumibles/:id` | Editar datos y stock mínimo |
| DELETE | `/api/consumibles/:id` | Dar de baja (conserva historial) |
| POST | `/api/consumibles/:id/movimientos` | Registrar ENTRADA / SALIDA / AJUSTE |
| GET | `/api/movimientos?tipo=&q=&desde=&hasta=` | Historial |
| GET | `/api/resumen` | Totales |

### Repuestos

- **Repuestos** (`/repuestos`): periféricos, artículos varios y cables, nuevos o usados, con existencia, unidades prestadas y estado.
- **Entregas a funcionarios** (`/repuestos/entregas`): equivale a la hoja "Sustitución de repuestos". Cada caso (número correlativo) puede incluir varios artículos y ser **definitivo** o **préstamo**.
- **Préstamos** (`/repuestos/prestamos`): préstamos pendientes con los días transcurridos; al registrar la devolución las unidades vuelven a la existencia.
- Cada cambio queda en `repuesto_movimientos` como **ENTRADA**, **SALIDA**, **AJUSTE** o **DEVOLUCION**.

#### Historial de la hoja de sustituciones

Los 47 casos de la hoja están transcritos en `server/datos/repuestos-historial.json`, pero **no se cargan** hasta revisarlos:

1. Corrija los artículos de cada caso (sobre todo los marcados con `"revisar": true`).
2. Cambie `"revisado"` a `true`.
3. Ejecute `npm run seed`. Muestra si los totales coinciden con la fila TOTAL ENTREGADOS de la hoja.

Las entregas históricas no descuentan existencia, porque la fila DISPONIBLES ya las refleja.
