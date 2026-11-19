import { Router } from "express";
import * as servicio from "../services/consumibles.js";
import * as repuestos from "../services/repuestos.js";
import { nombreInsumo, nombreRepuesto, ETIQUETA_ESTADO } from "../vistas.js";
import { accion } from "./acciones.js";

const router = Router();

/** Datos que necesitan los diálogos de entrega / ingreso / alta. */
function datosDialogos(todos = servicio.listar()) {
  return { todos, sugerencias: servicio.sugerencias() };
}

// ---------- Panel ----------

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];

/** Entregas de insumos y repuestos de los últimos `n` meses (incluye el actual, con ceros). */
function entregasUltimosMeses(n) {
  const hoy = new Date();
  const meses = Array.from({ length: n }, (_, i) => {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - (n - 1 - i), 1);
    const clave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return { clave, etiqueta: MESES[d.getMonth()], anio: d.getFullYear() };
  });
  const desde = `${meses[0].clave}-01`;
  const aMapa = (filas) => Object.fromEntries(filas.map((f) => [f.mes, f.total]));
  const insumos = aMapa(servicio.entregasPorMes(desde));
  const reps = aMapa(repuestos.entregasPorMes(desde));
  return meses.map((m) => ({
    ...m,
    insumos: insumos[m.clave] || 0,
    repuestos: reps[m.clave] || 0,
  }));
}

router.get("/", (req, res) => {
  // Insumos y repuestos que necesitan reposición, en una sola lista
  const porReponer = [
    ...servicio
      .listar()
      .filter((c) => c.estado !== "ok")
      .map((c) => ({
        nombre: nombreInsumo(c),
        detalle: `${c.tipo} · ${c.marca}`,
        href: `/consumibles/${c.id}`,
        stock: c.stock,
        estado: c.estado,
      })),
    ...repuestos
      .listar()
      .filter((r) => r.estado !== "ok")
      .map((r) => ({
        nombre: nombreRepuesto(r),
        detalle: r.categoria,
        href: `/repuestos/${r.id}`,
        stock: r.stock,
        estado: r.estado,
      })),
  ].sort((a, b) => a.stock - b.stock || a.nombre.localeCompare(b.nombre));

  const resumen = servicio.resumen();
  const repResumen = repuestos.resumen();
  const listaRepuestos = repuestos.listar();
  const contar = (lista, estado) => lista.filter((r) => r.estado === estado).length;

  res.render("dashboard", {
    titulo: "Inicio",
    seccion: "panel",
    resumen,
    repResumen,
    porReponer,
    porLugar: servicio.entregasAgrupadas("lugar"),
    porTecnico: servicio.entregasAgrupadas("tecnico"),
    porMarca: servicio.existenciasPorMarca(),
    porMes: entregasUltimosMeses(6),
    estados: [
      { nombre: "Insumos", ...resumen.por_estado },
      {
        nombre: "Repuestos",
        ok: contar(listaRepuestos, "ok"),
        bajo: contar(listaRepuestos, "bajo"),
        agotado: contar(listaRepuestos, "agotado"),
      },
    ],
  });
});

// ---------- Insumos ----------

router.get("/consumibles", (req, res) => {
  const filtros = {
    q: String(req.query.q || ""),
    estado: String(req.query.estado || ""),
    tipo: String(req.query.tipo || ""),
  };
  const todos = servicio.listar();
  res.render("consumibles/index", {
    titulo: "Insumos",
    subtitulo: "Tóner, tintas y demás insumos de impresión",
    seccion: "insumos",
    busqueda: {
      accion: "/consumibles",
      valor: filtros.q,
      placeholder: "Buscar por código, marca o impresora",
      ocultos: { estado: filtros.estado, tipo: filtros.tipo },
    },
    filtros,
    consumibles: servicio.listar(filtros),
    tiposEnUso: [...new Set(todos.map((c) => c.tipo))],
    resumen: servicio.resumen(),
    ...datosDialogos(todos),
  });
});

router.get("/consumibles/movimientos", (req, res) => {
  const filtros = {
    q: String(req.query.q || ""),
    tipo: String(req.query.tipo ?? "SALIDA"),
    desde: String(req.query.desde || ""),
    hasta: String(req.query.hasta || ""),
  };
  res.render("consumibles/movimientos", {
    titulo: "Movimientos",
    subtitulo: "Entregas por caso, ingresos y ajustes de inventario",
    seccion: "movimientos",
    busqueda: {
      accion: "/consumibles/movimientos",
      valor: filtros.q,
      placeholder: "Buscar caso, técnico o lugar",
      ocultos: { tipo: filtros.tipo, desde: filtros.desde, hasta: filtros.hasta },
    },
    filtros,
    movimientos: servicio.listarMovimientos({ ...filtros, limit: 500 }),
    ...datosDialogos(),
  });
});

router.get("/consumibles/exportar.csv", (req, res) => {
  const celda = (valor) => `"${String(valor ?? "").replace(/"/g, '""')}"`;
  const fila = (valores) => valores.map(celda).join(";");

  const lineas = [
    fila(["TIPO", "MARCA", "CODIGO", "RENDIMIENTO", "IMPRESORA", "COLOR", "EXISTENCIA", "MINIMO", "ESTADO"]),
    ...servicio.listar().map((c) =>
      fila([c.tipo, c.marca, c.codigo, c.rendimiento, c.impresora, c.color, c.stock, c.stock_minimo, ETIQUETA_ESTADO[c.estado]]),
    ),
    "",
    fila(["FECHA", "CASO #", "TECNICO", "LUGAR", "INSUMO", "IMPRESORA", "CANTIDAD"]),
    ...servicio
      .listarMovimientos({ tipo: "SALIDA", limit: 2000 })
      .map((m) =>
        fila([m.fecha, m.caso, m.tecnico, m.lugar, nombreInsumo(m), m.impresora, m.cantidad]),
      ),
  ];

  const hoy = new Date().toISOString().slice(0, 10);
  res.attachment(`Inventario_Insumos_${hoy}.csv`);
  res.type("text/csv; charset=utf-8");
  // BOM + ";" para que Excel en español abra las columnas y tildes bien.
  res.send(String.fromCharCode(0xfeff) + lineas.join("\r\n"));
});

// Ruta anterior del historial
router.get("/consumibles/entregas", (req, res) =>
  res.redirect(301, req.originalUrl.replace("/entregas", "/movimientos")),
);

router.get("/consumibles/:id", (req, res) => {
  const consumible = servicio.obtener(req.params.id);
  res.render("consumibles/detalle", {
    titulo: nombreInsumo(consumible),
    subtitulo: `${consumible.tipo} · ${consumible.marca}`,
    seccion: "insumos",
    migas: [{ texto: "Insumos", href: "/consumibles" }],
    consumible,
    movimientos: servicio.listarMovimientos({
      consumible_id: consumible.id,
      limit: 500,
    }),
    ...datosDialogos([consumible]),
  });
});

router.post(
  "/consumibles",
  accion("/consumibles", (req) => {
    const creado = servicio.crear(req.body);
    return `Insumo ${nombreInsumo(creado)} registrado.`;
  }),
);

router.post(
  "/consumibles/movimientos",
  accion("/consumibles", (req) => {
    const { consumible } = servicio.nuevoMovimiento(
      req.body.consumible_id,
      req.body,
    );
    const verbo = {
      SALIDA: "Entrega registrada",
      ENTRADA: "Ingreso registrado",
      AJUSTE: "Ajuste registrado",
    }[String(req.body.tipo).toUpperCase()];
    return `${verbo}: ${nombreInsumo(consumible)}. Existencia actual: ${consumible.stock}.`;
  }),
);

router.post(
  "/consumibles/:id",
  accion("/consumibles", (req) => {
    const editado = servicio.editar(req.params.id, req.body);
    return `Cambios guardados en ${nombreInsumo(editado)}.`;
  }),
);

router.post(
  "/consumibles/:id/eliminar",
  accion("/consumibles", (req) => {
    const eliminado = servicio.eliminar(req.params.id);
    return {
      ruta: "/consumibles",
      ok: `${nombreInsumo(eliminado)} dado de baja. Su historial se conserva.`,
    };
  }),
);

// Enlaces de versiones anteriores
router.get("/index.html", (req, res) => res.redirect(301, "/"));
router.get("/pages/consumibles.html", (req, res) => res.redirect(301, "/consumibles"));
router.get("/pages/repuestos.html", (req, res) => res.redirect(301, "/repuestos"));

export default router;
