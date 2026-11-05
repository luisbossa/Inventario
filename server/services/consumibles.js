import {
  db,
  HttpError,
  transaccion,
  conEstado,
  calcularEstado,
  obtenerConsumible,
  registrarMovimiento,
} from "../db.js";
import { datosConsumible, entero, texto } from "../validar.js";

const TIPOS = ["ENTRADA", "SALIDA", "AJUSTE"];
const ESTADOS = ["ok", "bajo", "agotado"];

function buscarPorCodigoColor(codigo, color) {
  return db
    .prepare("SELECT * FROM consumibles WHERE codigo = ? AND color = ?")
    .get(codigo, color);
}

/** Lista activos; filtra por texto libre (`q`) y por estado. */
export function listar({ q = "", estado = "", tipo = "" } = {}) {
  const termino = q.trim().toLowerCase();
  return db
    .prepare(
      "SELECT * FROM consumibles WHERE activo = 1 ORDER BY tipo, marca, codigo, color",
    )
    .all()
    .map(conEstado)
    .filter((c) => !ESTADOS.includes(estado) || c.estado === estado)
    .filter((c) => !tipo || c.tipo === tipo)
    .filter(
      (c) =>
        !termino ||
        [c.tipo, c.marca, c.codigo, c.impresora, c.color, c.rendimiento]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(termino),
    );
}

export function obtener(id) {
  const consumible = obtenerConsumible(id);
  if (!consumible) throw new HttpError(404, "Consumible no encontrado.");
  return conEstado(consumible);
}

export function crear(body) {
  const datos = datosConsumible(body);
  const stockInicial = entero(body.stock, "stock", { porDefecto: 0 });

  const id = transaccion(() => {
    const existente = buscarPorCodigoColor(datos.codigo, datos.color);
    if (existente?.activo) {
      throw new HttpError(
        409,
        `Ya existe el tóner ${datos.codigo} (${datos.color}).`,
      );
    }

    let nuevoId;
    if (existente) {
      // Estaba dado de baja: se reactiva conservando su historial.
      db.prepare(
        `UPDATE consumibles
           SET tipo = ?, marca = ?, impresora = ?, rendimiento = ?, stock_minimo = ?,
               activo = 1, actualizado_en = datetime('now', 'localtime')
         WHERE id = ?`,
      ).run(
        datos.tipo,
        datos.marca,
        datos.impresora,
        datos.rendimiento,
        datos.stock_minimo,
        existente.id,
      );
      nuevoId = existente.id;
    } else {
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO consumibles (tipo, marca, codigo, impresora, color, rendimiento, stock_minimo)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          datos.tipo,
          datos.marca,
          datos.codigo,
          datos.impresora,
          datos.color,
          datos.rendimiento,
          datos.stock_minimo,
        );
      nuevoId = Number(lastInsertRowid);
    }

    if (stockInicial !== obtenerConsumible(nuevoId).stock) {
      registrarMovimiento({
        consumibleId: nuevoId,
        tipo: "AJUSTE",
        stockNuevo: stockInicial,
        nota: "Stock inicial al registrar",
      });
    }
    return nuevoId;
  });

  return obtener(id);
}

export function editar(id, body) {
  const actual = obtener(id);
  const datos = datosConsumible(body);

  const duplicado = buscarPorCodigoColor(datos.codigo, datos.color);
  if (duplicado && duplicado.id !== actual.id) {
    throw new HttpError(
      409,
      `Ya existe otro tóner ${datos.codigo} (${datos.color}).`,
    );
  }

  db.prepare(
    `UPDATE consumibles
       SET tipo = ?, marca = ?, codigo = ?, impresora = ?, color = ?, rendimiento = ?,
           stock_minimo = ?, actualizado_en = datetime('now', 'localtime')
     WHERE id = ?`,
  ).run(
    datos.tipo,
    datos.marca,
    datos.codigo,
    datos.impresora,
    datos.color,
    datos.rendimiento,
    datos.stock_minimo,
    actual.id,
  );

  return obtener(actual.id);
}

/** Baja lógica: deja de listarse pero conserva su historial. */
export function eliminar(id) {
  const actual = obtener(id);
  db.prepare(
    `UPDATE consumibles
       SET activo = 0, actualizado_en = datetime('now', 'localtime')
     WHERE id = ?`,
  ).run(actual.id);
  return actual;
}

export function nuevoMovimiento(id, body) {
  const tipo = String(body.tipo || "").toUpperCase();
  if (!TIPOS.includes(tipo)) {
    throw new HttpError(400, "El tipo debe ser ENTRADA, SALIDA o AJUSTE.");
  }

  const datos = {
    consumibleId: Number(id),
    tipo,
    caso: texto(body.caso)?.replace(/^caso\s*#?\s*/i, "") ?? null,
    tecnico: texto(body.tecnico),
    lugar: texto(body.lugar),
    nota: texto(body.nota),
  };

  if (tipo === "SALIDA" && (!datos.tecnico || !datos.lugar)) {
    throw new HttpError(400, "Para una entrega indicá el técnico y el lugar.");
  }

  if (tipo === "AJUSTE") {
    datos.stockNuevo = entero(body.stock, "stock");
  } else {
    datos.cantidad = entero(body.cantidad, "cantidad", { min: 1 });
  }

  const movimientoId = transaccion(() => registrarMovimiento(datos));
  return { movimiento_id: movimientoId, consumible: obtener(id) };
}

/** Historial con datos del insumo. Filtros: tipo, consumible_id, q, desde, hasta. */
export function listarMovimientos(filtros = {}) {
  const condiciones = [];
  const params = [];

  if (filtros.consumible_id) {
    condiciones.push("m.consumible_id = ?");
    params.push(entero(filtros.consumible_id, "consumible_id", { min: 1 }));
  }

  const tipo = String(filtros.tipo || "").toUpperCase();
  if (TIPOS.includes(tipo)) {
    condiciones.push("m.tipo = ?");
    params.push(tipo);
  }

  const q = texto(filtros.q);
  if (q) {
    condiciones.push(
      "(m.caso LIKE ? OR m.tecnico LIKE ? OR m.lugar LIKE ? OR c.codigo LIKE ? OR c.impresora LIKE ?)",
    );
    params.push(...Array(5).fill(`%${q}%`));
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(filtros.desde || "")) {
    condiciones.push("date(m.fecha) >= ?");
    params.push(filtros.desde);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(filtros.hasta || "")) {
    condiciones.push("date(m.fecha) <= ?");
    params.push(filtros.hasta);
  }

  const limite = Math.min(
    entero(filtros.limit, "limit", { min: 1, porDefecto: 200 }),
    2000,
  );
  const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";

  return db
    .prepare(
      `SELECT m.*, c.tipo AS tipo_insumo, c.marca, c.codigo, c.impresora, c.color, c.rendimiento
         FROM movimientos m
         JOIN consumibles c ON c.id = m.consumible_id
         ${where}
        ORDER BY m.fecha DESC, m.id DESC
        LIMIT ?`,
    )
    .all(...params, limite);
}

export function resumen() {
  const filas = db
    .prepare("SELECT stock, stock_minimo FROM consumibles WHERE activo = 1")
    .all();
  const estados = filas.map((f) => calcularEstado(f.stock, f.stock_minimo));

  const { entregas_mes } = db
    .prepare(
      `SELECT COALESCE(SUM(cantidad), 0) AS entregas_mes
         FROM movimientos
        WHERE tipo = 'SALIDA'
          AND stock_resultante IS NOT NULL -- sin el histórico importado
          AND strftime('%Y-%m', fecha) = strftime('%Y-%m', 'now', 'localtime')`,
    )
    .get();

  return {
    total_modelos: filas.length,
    total_unidades: filas.reduce((suma, f) => suma + f.stock, 0),
    total_alertas: estados.filter((e) => e !== "ok").length,
    por_estado: {
      ok: estados.filter((e) => e === "ok").length,
      bajo: estados.filter((e) => e === "bajo").length,
      agotado: estados.filter((e) => e === "agotado").length,
    },
    entregas_mes,
  };
}

/** Entregas agrupadas por lugar o técnico (para el panel). */
export function entregasAgrupadas(campo, limite = 6) {
  const columna = { lugar: "lugar", tecnico: "tecnico" }[campo];
  if (!columna) throw new Error(`Campo de agrupación inválido: ${campo}`);
  return db
    .prepare(
      `SELECT ${columna} AS nombre, SUM(cantidad) AS total
         FROM movimientos
        WHERE tipo = 'SALIDA' AND ${columna} IS NOT NULL
        GROUP BY ${columna}
        ORDER BY total DESC, nombre
        LIMIT ?`,
    )
    .all(limite);
}

/** Técnicos y lugares ya usados, para autocompletar en las entregas. */
export function sugerencias() {
  const distintos = (columna) =>
    db
      .prepare(
        `SELECT DISTINCT ${columna} AS valor FROM movimientos
          WHERE ${columna} IS NOT NULL ORDER BY ${columna}`,
      )
      .all()
      .map((f) => f.valor);
  return { tecnicos: distintos("tecnico"), lugares: distintos("lugar") };
}
