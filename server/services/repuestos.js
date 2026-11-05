import { db, HttpError, transaccion, calcularEstado } from "../db.js";
import { entero, texto, textoRequerido } from "../validar.js";

export const CATEGORIAS = ["Periférico", "Varios", "Cable"];
export const CONDICIONES = ["Nuevo", "Usado"];
const ESTADOS = ["ok", "bajo", "agotado"];

const conEstado = (r) =>
  r && { ...r, estado: calcularEstado(r.stock, r.stock_minimo) };

function datosRepuesto(body) {
  const categoria = texto(body.categoria) ?? "Varios";
  if (!CATEGORIAS.includes(categoria)) {
    throw new HttpError(400, `Categoría inválida: ${categoria}.`);
  }
  const condicion = texto(body.condicion) ?? "Nuevo";
  if (!CONDICIONES.includes(condicion)) {
    throw new HttpError(400, `Condición inválida: ${condicion}.`);
  }
  return {
    categoria,
    condicion,
    nombre: textoRequerido(body.nombre, "nombre"),
    detalle: texto(body.detalle),
    stock_minimo: entero(body.stock_minimo, "stock_minimo", { porDefecto: 0 }),
  };
}

/** "2026-10-15" del formulario → "2026-10-15 14:32:10" (hora actual). */
function fechaMovimiento(valor) {
  const ahora = new Date();
  const hora = ahora.toTimeString().slice(0, 8);
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor || "")) return `${valor} ${hora}`;
  const hoy = new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
  return `${hoy} ${hora}`;
}

// ---------- Catálogo ----------

export function listar({ q = "", categoria = "", estado = "" } = {}) {
  const termino = q.trim().toLowerCase();
  const prestados = prestadosPorRepuesto();
  return db
    .prepare(
      `SELECT * FROM repuestos WHERE activo = 1
        ORDER BY CASE categoria WHEN 'Periférico' THEN 1 WHEN 'Varios' THEN 2 ELSE 3 END,
                 nombre, condicion`,
    )
    .all()
    .map((r) => ({ ...conEstado(r), prestados: prestados.get(r.id) || 0 }))
    .filter((r) => !categoria || r.categoria === categoria)
    .filter((r) => !ESTADOS.includes(estado) || r.estado === estado)
    .filter(
      (r) =>
        !termino ||
        [r.nombre, r.categoria, r.condicion, r.detalle]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(termino),
    );
}

function prestadosPorRepuesto() {
  const filas = db
    .prepare(
      `SELECT repuesto_id, SUM(cantidad) AS total FROM repuesto_movimientos
        WHERE tipo = 'SALIDA' AND modalidad = 'PRESTAMO' AND devuelto_en IS NULL
        GROUP BY repuesto_id`,
    )
    .all();
  return new Map(filas.map((f) => [f.repuesto_id, f.total]));
}

export function obtener(id) {
  const r = db
    .prepare("SELECT * FROM repuestos WHERE id = ? AND activo = 1")
    .get(id);
  if (!r) throw new HttpError(404, "Repuesto no encontrado.");
  return { ...conEstado(r), prestados: prestadosPorRepuesto().get(r.id) || 0 };
}

function buscarPorNombre(nombre, condicion) {
  return db
    .prepare(
      "SELECT * FROM repuestos WHERE nombre = ? COLLATE NOCASE AND condicion = ?",
    )
    .get(nombre, condicion);
}

export function crear(body) {
  const datos = datosRepuesto(body);
  const stockInicial = entero(body.stock, "stock", { porDefecto: 0 });

  const id = transaccion(() => {
    const existente = buscarPorNombre(datos.nombre, datos.condicion);
    if (existente?.activo) {
      throw new HttpError(409, `Ya existe "${datos.nombre}" (${datos.condicion}).`);
    }

    let nuevoId;
    if (existente) {
      db.prepare(
        `UPDATE repuestos SET categoria = ?, detalle = ?, stock_minimo = ?, activo = 1,
                actualizado_en = datetime('now', 'localtime') WHERE id = ?`,
      ).run(datos.categoria, datos.detalle, datos.stock_minimo, existente.id);
      nuevoId = existente.id;
    } else {
      nuevoId = Number(
        db
          .prepare(
            `INSERT INTO repuestos (categoria, nombre, condicion, detalle, stock_minimo)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .run(datos.categoria, datos.nombre, datos.condicion, datos.detalle, datos.stock_minimo)
          .lastInsertRowid,
      );
    }

    if (stockInicial !== obtener(nuevoId).stock) {
      moverStock({ repuestoId: nuevoId, tipo: "AJUSTE", stockNuevo: stockInicial, nota: "Existencia inicial" });
    }
    return nuevoId;
  });
  return obtener(id);
}

export function editar(id, body) {
  const actual = obtener(id);
  const datos = datosRepuesto(body);
  const duplicado = buscarPorNombre(datos.nombre, datos.condicion);
  if (duplicado && duplicado.id !== actual.id) {
    throw new HttpError(409, `Ya existe otro "${datos.nombre}" (${datos.condicion}).`);
  }
  db.prepare(
    `UPDATE repuestos SET categoria = ?, nombre = ?, condicion = ?, detalle = ?, stock_minimo = ?,
            actualizado_en = datetime('now', 'localtime') WHERE id = ?`,
  ).run(datos.categoria, datos.nombre, datos.condicion, datos.detalle, datos.stock_minimo, actual.id);
  return obtener(actual.id);
}

export function eliminar(id) {
  const actual = obtener(id);
  if (actual.prestados > 0) {
    throw new HttpError(409, `"${actual.nombre}" tiene ${actual.prestados} unidad(es) prestada(s) sin devolver.`);
  }
  db.prepare(
    "UPDATE repuestos SET activo = 0, actualizado_en = datetime('now', 'localtime') WHERE id = ?",
  ).run(actual.id);
  return actual;
}

// ---------- Movimientos ----------

/**
 * Cambia la existencia y registra el movimiento. Llamar dentro de una transacción.
 * historico = true solo registra (la existencia ya lo refleja).
 */
function moverStock({
  repuestoId,
  tipo,
  cantidad,
  stockNuevo,
  modalidad = null,
  caso = null,
  funcionario = null,
  tecnico = null,
  nota = null,
  fecha = null,
  devolucionDe = null,
  historico = false,
}) {
  const r = db.prepare("SELECT * FROM repuestos WHERE id = ? AND activo = 1").get(repuestoId);
  if (!r) throw new HttpError(404, "Repuesto no encontrado.");

  let stockResultante = r.stock;
  if (!historico) {
    if (tipo === "ENTRADA" || tipo === "DEVOLUCION") stockResultante = r.stock + cantidad;
    else if (tipo === "SALIDA") stockResultante = r.stock - cantidad;
    else if (tipo === "AJUSTE") {
      stockResultante = stockNuevo;
      cantidad = stockNuevo - r.stock;
    }
    if (stockResultante < 0) {
      throw new HttpError(409, `Existencia insuficiente de "${r.nombre}": hay ${r.stock}.`);
    }
    db.prepare(
      "UPDATE repuestos SET stock = ?, actualizado_en = datetime('now', 'localtime') WHERE id = ?",
    ).run(stockResultante, r.id);
  }

  return Number(
    db
      .prepare(
        `INSERT INTO repuesto_movimientos
           (repuesto_id, tipo, modalidad, cantidad, stock_resultante, caso, funcionario,
            tecnico, nota, fecha, devolucion_de)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        r.id, tipo, modalidad, cantidad, historico ? null : stockResultante, caso,
        funcionario, tecnico, nota, historico ? fecha : fecha ?? fechaMovimiento(), devolucionDe,
      ).lastInsertRowid,
  );
}

/** Siguiente número de caso correlativo (los casos de repuestos son 1, 2, 3...). */
export function siguienteCaso() {
  const { maximo } = db
    .prepare(
      `SELECT MAX(CAST(caso AS INTEGER)) AS maximo FROM repuesto_movimientos
        WHERE caso GLOB '[0-9]*'`,
    )
    .get();
  return String((maximo || 0) + 1);
}

/**
 * Entrega de uno o varios artículos a un funcionario.
 * items: [{ repuestoId, cantidad }]
 */
export function registrarEntrega(body, items) {
  const modalidad = body.modalidad === "PRESTAMO" ? "PRESTAMO" : "DEFINITIVA";
  const datos = {
    caso: texto(body.caso) ?? siguienteCaso(),
    funcionario: textoRequerido(body.funcionario, "funcionario"),
    tecnico: textoRequerido(body.tecnico, "entregado por"),
    nota: texto(body.nota),
    fecha: fechaMovimiento(body.fecha),
  };
  if (items.length === 0) {
    throw new HttpError(400, "Seleccione al menos un artículo para entregar.");
  }

  transaccion(() => {
    for (const { repuestoId, cantidad } of items) {
      moverStock({ ...datos, repuestoId, tipo: "SALIDA", modalidad, cantidad });
    }
  });
  return { ...datos, modalidad, articulos: items.length };
}

export function registrarIngreso(id, body) {
  const cantidad = entero(body.cantidad, "cantidad", { min: 1 });
  transaccion(() =>
    moverStock({ repuestoId: Number(id), tipo: "ENTRADA", cantidad, nota: texto(body.nota) }),
  );
  return obtener(id);
}

export function registrarAjuste(id, body) {
  const stockNuevo = entero(body.stock, "existencia");
  const nota = textoRequerido(body.nota, "motivo");
  transaccion(() => moverStock({ repuestoId: Number(id), tipo: "AJUSTE", stockNuevo, nota }));
  return obtener(id);
}

/** Devuelve un préstamo completo: suma la existencia y cierra la salida. */
export function devolverPrestamo(movimientoId, body = {}) {
  const salida = db
    .prepare(
      `SELECT m.*, r.nombre FROM repuesto_movimientos m JOIN repuestos r ON r.id = m.repuesto_id
        WHERE m.id = ? AND m.tipo = 'SALIDA' AND m.modalidad = 'PRESTAMO'`,
    )
    .get(movimientoId);
  if (!salida) throw new HttpError(404, "Préstamo no encontrado.");
  if (salida.devuelto_en) throw new HttpError(409, "Ese préstamo ya fue devuelto.");

  const fecha = fechaMovimiento(body.fecha);
  transaccion(() => {
    moverStock({
      repuestoId: salida.repuesto_id,
      tipo: "DEVOLUCION",
      cantidad: salida.cantidad,
      caso: salida.caso,
      funcionario: salida.funcionario,
      tecnico: texto(body.tecnico),
      nota: texto(body.nota),
      fecha,
      devolucionDe: salida.id,
    });
    db.prepare("UPDATE repuesto_movimientos SET devuelto_en = ? WHERE id = ?").run(fecha, salida.id);
  });
  return salida;
}

// ---------- Consultas ----------

const SELECT_MOV = `
  SELECT m.*, r.nombre, r.categoria, r.condicion
    FROM repuesto_movimientos m
    JOIN repuestos r ON r.id = m.repuesto_id`;

const ORDEN_MOV = "ORDER BY COALESCE(m.fecha, m.creado_en) DESC, m.id DESC";

export function listarMovimientos({ repuesto_id, tipo, limit = 300 } = {}) {
  const condiciones = [];
  const params = [];
  if (repuesto_id) {
    condiciones.push("m.repuesto_id = ?");
    params.push(Number(repuesto_id));
  }
  if (["ENTRADA", "SALIDA", "AJUSTE", "DEVOLUCION"].includes(tipo)) {
    condiciones.push("m.tipo = ?");
    params.push(tipo);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";
  return db.prepare(`${SELECT_MOV} ${where} ${ORDEN_MOV} LIMIT ?`).all(...params, limit);
}

/**
 * Entregas agrupadas por caso (como la hoja "Sustitución de repuestos").
 * Cada caso trae sus artículos.
 */
export function listarEntregas({ q = "", modalidad = "", desde = "", hasta = "" } = {}) {
  const condiciones = ["m.tipo = 'SALIDA'"];
  const params = [];
  if (["DEFINITIVA", "PRESTAMO"].includes(modalidad)) {
    condiciones.push("m.modalidad = ?");
    params.push(modalidad);
  }
  const termino = texto(q);
  if (termino) {
    condiciones.push("(m.caso LIKE ? OR m.funcionario LIKE ? OR m.tecnico LIKE ? OR r.nombre LIKE ?)");
    params.push(...Array(4).fill(`%${termino}%`));
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(desde)) {
    condiciones.push("date(m.fecha) >= ?");
    params.push(desde);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
    condiciones.push("date(m.fecha) <= ?");
    params.push(hasta);
  }

  const filas = db
    .prepare(`${SELECT_MOV} WHERE ${condiciones.join(" AND ")} ${ORDEN_MOV}`)
    .all(...params);

  // Agrupa por caso + funcionario + fecha (un caso puede repetirse en datos viejos)
  const grupos = new Map();
  for (const m of filas) {
    const clave = `${m.caso}|${m.funcionario}|${m.fecha}|${m.modalidad}`;
    if (!grupos.has(clave)) {
      grupos.set(clave, {
        caso: m.caso,
        funcionario: m.funcionario,
        tecnico: m.tecnico,
        fecha: m.fecha,
        modalidad: m.modalidad,
        nota: m.nota,
        historico: m.stock_resultante === null,
        articulos: [],
      });
    }
    grupos.get(clave).articulos.push({
      id: m.id,
      repuesto_id: m.repuesto_id,
      nombre: m.nombre,
      condicion: m.condicion,
      cantidad: m.cantidad,
      devuelto_en: m.devuelto_en,
    });
  }
  return [...grupos.values()];
}

export function listarPrestamos({ estado = "activos" } = {}) {
  const condicion = estado === "devueltos" ? "m.devuelto_en IS NOT NULL" : "m.devuelto_en IS NULL";
  return db
    .prepare(
      `${SELECT_MOV} WHERE m.tipo = 'SALIDA' AND m.modalidad = 'PRESTAMO' AND ${condicion}
        ORDER BY ${estado === "devueltos" ? "m.devuelto_en DESC" : "m.fecha ASC"}, m.id`,
    )
    .all()
    .map((m) => ({
      ...m,
      dias: m.fecha
        ? Math.floor((Date.now() - new Date(m.fecha.replace(" ", "T")).getTime()) / 86400000)
        : null,
    }));
}

export function resumen() {
  const repuestos = listar();
  const { entregas_mes } = db
    .prepare(
      `SELECT COALESCE(SUM(cantidad), 0) AS entregas_mes FROM repuesto_movimientos
        WHERE tipo = 'SALIDA' AND stock_resultante IS NOT NULL
          AND strftime('%Y-%m', fecha) = strftime('%Y-%m', 'now', 'localtime')`,
    )
    .get();
  return {
    total_articulos: repuestos.length,
    total_unidades: repuestos.reduce((s, r) => s + r.stock, 0),
    sin_stock: repuestos.filter((r) => r.estado === "agotado").length,
    por_reponer: repuestos.filter((r) => r.estado !== "ok").length,
    prestamos_activos: repuestos.reduce((s, r) => s + r.prestados, 0),
    entregas_mes,
    por_categoria: Object.fromEntries(
      CATEGORIAS.map((c) => [c, repuestos.filter((r) => r.categoria === c).length]),
    ),
  };
}

/** Totales entregados por artículo (fila "TOTAL ENTREGADOS" del Excel). */
export function totalesEntregados() {
  return db
    .prepare(
      `SELECT r.nombre, r.condicion, SUM(m.cantidad) AS total
         FROM repuesto_movimientos m JOIN repuestos r ON r.id = m.repuesto_id
        WHERE m.tipo = 'SALIDA'
        GROUP BY r.id ORDER BY total DESC, r.nombre`,
    )
    .all();
}

export function sugerencias() {
  const distintos = (col) =>
    db
      .prepare(
        `SELECT DISTINCT ${col} AS v FROM repuesto_movimientos WHERE ${col} IS NOT NULL ORDER BY ${col}`,
      )
      .all()
      .map((f) => f.v);
  return { funcionarios: distintos("funcionario"), tecnicos: distintos("tecnico") };
}

/**
 * Entrega histórica (carga inicial): queda en el historial sin descontar
 * existencia, porque las cantidades disponibles del Excel ya la reflejan.
 */
export function registrarEntregaHistorica({ repuestoId, caso, funcionario, tecnico, fecha }) {
  return moverStock({
    repuestoId,
    tipo: "SALIDA",
    modalidad: "DEFINITIVA",
    cantidad: 1,
    caso,
    funcionario,
    tecnico,
    nota: "Histórico Excel",
    fecha: fecha ? `${fecha} 00:00:00` : null,
    historico: true,
  });
}
