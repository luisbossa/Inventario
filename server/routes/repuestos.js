import { Router } from "express";
import * as servicio from "../services/repuestos.js";
import { accion } from "./acciones.js";
import { nombreRepuesto } from "../vistas.js";

const router = Router();

/** Datos de los diálogos de entrega / ingreso / alta. */
function datosDialogos(todos = servicio.listar()) {
  return {
    todos,
    sugerenciasRep: servicio.sugerencias(),
    siguienteCaso: servicio.siguienteCaso(),
  };
}

/** Artículos marcados en el formulario: name="articulo" (id) + cantidad_<id>. */
function itemsDelFormulario(body) {
  const ids = [].concat(body.articulo ?? []).map(Number).filter(Boolean);
  return [...new Set(ids)].map((id) => {
    const cantidad = Number(body[`cantidad_${id}`] ?? 1);
    return { repuestoId: id, cantidad: Number.isInteger(cantidad) && cantidad > 0 ? cantidad : 1 };
  });
}

// ---------- Inventario ----------

router.get("/", (req, res) => {
  const filtros = {
    q: String(req.query.q || ""),
    categoria: String(req.query.categoria || ""),
    estado: String(req.query.estado || ""),
  };
  const todos = servicio.listar();
  res.render("repuestos/index", {
    titulo: "Repuestos",
    subtitulo: "Periféricos, artículos varios y cables",
    seccion: "repuestos",
    busqueda: {
      accion: "/repuestos",
      valor: filtros.q,
      placeholder: "Buscar artículo",
      ocultos: { categoria: filtros.categoria, estado: filtros.estado },
    },
    filtros,
    repuestos: servicio.listar(filtros),
    resumen: servicio.resumen(),
    ...datosDialogos(todos),
  });
});

// ---------- Entregas a funcionarios ----------

router.get("/entregas", (req, res) => {
  const filtros = {
    q: String(req.query.q || ""),
    modalidad: String(req.query.modalidad || ""),
    desde: String(req.query.desde || ""),
    hasta: String(req.query.hasta || ""),
  };
  res.render("repuestos/entregas", {
    titulo: "Entregas a funcionarios",
    subtitulo: "Sustitución y préstamo de repuestos por caso",
    seccion: "rep-entregas",
    migas: [{ texto: "Repuestos", href: "/repuestos" }],
    busqueda: {
      accion: "/repuestos/entregas",
      valor: filtros.q,
      placeholder: "Buscar caso, funcionario o artículo",
      ocultos: { modalidad: filtros.modalidad, desde: filtros.desde, hasta: filtros.hasta },
    },
    filtros,
    entregas: servicio.listarEntregas(filtros),
    totales: servicio.totalesEntregados(),
    ...datosDialogos(),
  });
});

router.post(
  "/entregas",
  accion("/repuestos/entregas", (req) => {
    const entrega = servicio.registrarEntrega(req.body, itemsDelFormulario(req.body));
    const tipo = entrega.modalidad === "PRESTAMO" ? "Préstamo registrado" : "Entrega registrada";
    return `${tipo}: caso ${entrega.caso}, ${entrega.articulos} artículo(s) a ${entrega.funcionario}.`;
  }),
);

// ---------- Préstamos ----------

router.get("/prestamos", (req, res) => {
  const estado = req.query.estado === "devueltos" ? "devueltos" : "activos";
  res.render("repuestos/prestamos", {
    titulo: "Préstamos",
    subtitulo: "Repuestos prestados pendientes de devolución",
    seccion: "rep-prestamos",
    migas: [{ texto: "Repuestos", href: "/repuestos" }],
    estado,
    prestamos: servicio.listarPrestamos({ estado }),
    activos: servicio.listarPrestamos({ estado: "activos" }).length,
    ...datosDialogos(),
  });
});

router.post(
  "/prestamos/:id/devolver",
  accion("/repuestos/prestamos", (req) => {
    const salida = servicio.devolverPrestamo(req.params.id, req.body);
    return `Devolución registrada: ${salida.cantidad} × ${salida.nombre} de ${salida.funcionario}.`;
  }),
);

// ---------- Artículo ----------

router.post(
  "/",
  accion("/repuestos", (req) => {
    const creado = servicio.crear(req.body);
    return `Artículo "${nombreRepuesto(creado)}" registrado.`;
  }),
);

router.post(
  "/ingreso",
  accion("/repuestos", (req) => {
    const r = servicio.registrarIngreso(req.body.repuesto_id, req.body);
    return `Ingreso registrado: ${nombreRepuesto(r)}. Existencia actual: ${r.stock}.`;
  }),
);

router.get("/:id", (req, res) => {
  const repuesto = servicio.obtener(req.params.id);
  res.render("repuestos/detalle", {
    titulo: nombreRepuesto(repuesto),
    subtitulo: `${repuesto.categoria} · ${repuesto.condicion}`,
    seccion: "repuestos",
    migas: [{ texto: "Repuestos", href: "/repuestos" }],
    repuesto,
    movimientos: servicio.listarMovimientos({ repuesto_id: repuesto.id, limit: 500 }),
    ...datosDialogos(),
  });
});

router.post(
  "/:id",
  accion("/repuestos", (req) => {
    const editado = servicio.editar(req.params.id, req.body);
    return `Cambios guardados en "${nombreRepuesto(editado)}".`;
  }),
);

router.post(
  "/:id/ajuste",
  accion("/repuestos", (req) => {
    const r = servicio.registrarAjuste(req.params.id, req.body);
    return `Ajuste registrado: ${nombreRepuesto(r)}. Existencia actual: ${r.stock}.`;
  }),
);

router.post(
  "/:id/eliminar",
  accion("/repuestos", (req) => {
    const r = servicio.eliminar(req.params.id);
    return { ruta: "/repuestos", ok: `"${nombreRepuesto(r)}" dado de baja. Su historial se conserva.` };
  }),
);

export default router;
