import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH =
  process.env.DB_PATH || join(__dirname, "..", "data", "inventario.db");

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS consumibles (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    marca          TEXT    NOT NULL,
    codigo         TEXT    NOT NULL,
    impresora      TEXT,
    color          TEXT    NOT NULL DEFAULT 'NEGRO',
    rendimiento    TEXT    CHECK (rendimiento IN ('BR', 'AR')),
    stock          INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    stock_minimo   INTEGER NOT NULL DEFAULT 2 CHECK (stock_minimo >= 0),
    activo         INTEGER NOT NULL DEFAULT 1,
    creado_en      TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
    actualizado_en TEXT,
    UNIQUE (codigo, color)
  );

  CREATE TABLE IF NOT EXISTS movimientos (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    consumible_id    INTEGER NOT NULL REFERENCES consumibles(id),
    tipo             TEXT    NOT NULL CHECK (tipo IN ('ENTRADA', 'SALIDA', 'AJUSTE')),
    cantidad         INTEGER NOT NULL,
    stock_resultante INTEGER,
    caso             TEXT,
    tecnico          TEXT,
    lugar            TEXT,
    nota             TEXT,
    fecha            TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE INDEX IF NOT EXISTS idx_movimientos_consumible ON movimientos(consumible_id);
  CREATE INDEX IF NOT EXISTS idx_movimientos_fecha ON movimientos(fecha);

  -- Repuestos: periféricos, artículos varios y cables
  CREATE TABLE IF NOT EXISTS repuestos (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    categoria      TEXT    NOT NULL CHECK (categoria IN ('Periférico', 'Varios', 'Cable')),
    nombre         TEXT    NOT NULL,
    condicion      TEXT    NOT NULL DEFAULT 'Nuevo' CHECK (condicion IN ('Nuevo', 'Usado')),
    detalle        TEXT,
    stock          INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    stock_minimo   INTEGER NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
    activo         INTEGER NOT NULL DEFAULT 1,
    creado_en      TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
    actualizado_en TEXT,
    UNIQUE (nombre, condicion)
  );

  -- Una entrega de varios artículos genera un movimiento por artículo con el mismo caso.
  -- Préstamo: SALIDA con modalidad PRESTAMO; al devolverse se marca devuelto_en
  -- y se registra una DEVOLUCION que apunta a la salida (devolucion_de).
  CREATE TABLE IF NOT EXISTS repuesto_movimientos (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    repuesto_id      INTEGER NOT NULL REFERENCES repuestos(id),
    tipo             TEXT    NOT NULL CHECK (tipo IN ('ENTRADA', 'SALIDA', 'AJUSTE', 'DEVOLUCION')),
    modalidad        TEXT    CHECK (modalidad IN ('DEFINITIVA', 'PRESTAMO')),
    cantidad         INTEGER NOT NULL,
    stock_resultante INTEGER,
    caso             TEXT,
    funcionario      TEXT,
    tecnico          TEXT,
    nota             TEXT,
    fecha            TEXT,
    devuelto_en      TEXT,
    devolucion_de    INTEGER REFERENCES repuesto_movimientos(id),
    creado_en        TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE INDEX IF NOT EXISTS idx_rep_mov_repuesto ON repuesto_movimientos(repuesto_id);
  CREATE INDEX IF NOT EXISTS idx_rep_mov_caso ON repuesto_movimientos(caso);
`);

// Migración: categoría del insumo (bases creadas antes de existir la columna).
const columnas = db.prepare("PRAGMA table_info(consumibles)").all();
if (!columnas.some((c) => c.name === "tipo")) {
  db.exec("ALTER TABLE consumibles ADD COLUMN tipo TEXT NOT NULL DEFAULT 'Tóner'");
}

/** Error con código HTTP para que el middleware lo devuelva tal cual. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Ejecuta fn dentro de una transacción (node:sqlite no trae helper propio). */
export function transaccion(fn) {
  db.exec("BEGIN");
  try {
    const resultado = fn();
    db.exec("COMMIT");
    return resultado;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function calcularEstado(stock, stockMinimo) {
  if (stock <= 0) return "agotado";
  if (stock <= stockMinimo) return "bajo";
  return "ok";
}

export function conEstado(fila) {
  return fila && { ...fila, estado: calcularEstado(fila.stock, fila.stock_minimo) };
}

export function obtenerConsumible(id) {
  return db
    .prepare("SELECT * FROM consumibles WHERE id = ? AND activo = 1")
    .get(id);
}

/**
 * Registra un movimiento y actualiza el stock del consumible.
 * Debe llamarse dentro de una transacción.
 *  - ENTRADA / SALIDA: cantidad > 0
 *  - AJUSTE: `stockNuevo` define el stock final; se guarda la diferencia.
 *  - historico = true: solo registra el movimiento sin tocar el stock.
 */
export function registrarMovimiento({
  consumibleId,
  tipo,
  cantidad,
  stockNuevo,
  caso = null,
  tecnico = null,
  lugar = null,
  nota = null,
  fecha = null,
  historico = false,
}) {
  const consumible = obtenerConsumible(consumibleId);
  if (!consumible) throw new HttpError(404, "Consumible no encontrado.");

  let stockResultante = consumible.stock;

  if (!historico) {
    if (tipo === "ENTRADA") stockResultante = consumible.stock + cantidad;
    else if (tipo === "SALIDA") stockResultante = consumible.stock - cantidad;
    else if (tipo === "AJUSTE") {
      stockResultante = stockNuevo;
      cantidad = stockNuevo - consumible.stock;
    }

    if (stockResultante < 0) {
      throw new HttpError(
        409,
        `Stock insuficiente: hay ${consumible.stock} unidad(es) de ${consumible.codigo}.`,
      );
    }

    db.prepare(
      `UPDATE consumibles
         SET stock = ?, actualizado_en = datetime('now', 'localtime')
       WHERE id = ?`,
    ).run(stockResultante, consumibleId);
  }

  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO movimientos
         (consumible_id, tipo, cantidad, stock_resultante, caso, tecnico, lugar, nota, fecha)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now', 'localtime')))`,
    )
    .run(
      consumibleId,
      tipo,
      cantidad,
      historico ? null : stockResultante,
      caso,
      tecnico,
      lugar,
      nota,
      fecha,
    );

  return Number(lastInsertRowid);
}
