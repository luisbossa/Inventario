import { HttpError } from "./db.js";

export const TIPOS_INSUMO = [
  "Tóner",
  "Tinta",
  "Cartucho",
  "Unidad de imagen",
  "Cinta",
  "Otro",
];

export function tipoInsumo(valor) {
  const limpio = texto(valor) ?? "Tóner";
  if (!TIPOS_INSUMO.includes(limpio)) {
    throw new HttpError(400, `Tipo de insumo inválido: ${limpio}.`);
  }
  return limpio;
}

/** Texto recortado; null si viene vacío. */
export function texto(valor) {
  if (valor === undefined || valor === null) return null;
  const limpio = String(valor).trim();
  return limpio === "" ? null : limpio;
}

export function textoRequerido(valor, campo) {
  const limpio = texto(valor);
  if (!limpio) throw new HttpError(400, `El campo "${campo}" es obligatorio.`);
  return limpio;
}

export function entero(valor, campo, { min = 0, porDefecto } = {}) {
  if ((valor === undefined || valor === null || valor === "") && porDefecto !== undefined) {
    return porDefecto;
  }
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < min) {
    throw new HttpError(400, `"${campo}" debe ser un número entero mayor o igual a ${min}.`);
  }
  return numero;
}

export function rendimiento(valor) {
  const limpio = texto(valor)?.toUpperCase() ?? null;
  if (limpio !== null && limpio !== "BR" && limpio !== "AR") {
    throw new HttpError(400, 'El rendimiento debe ser "BR", "AR" o vacío.');
  }
  return limpio;
}

export function color(valor) {
  return (texto(valor) ?? "NEGRO").toUpperCase();
}

/** Datos editables de un consumible (sin stock). */
export function datosConsumible(body) {
  return {
    tipo: tipoInsumo(body.tipo),
    marca: textoRequerido(body.marca, "marca"),
    codigo: textoRequerido(body.codigo, "codigo").toUpperCase(),
    impresora: texto(body.impresora),
    color: color(body.color),
    rendimiento: rendimiento(body.rendimiento),
    stock_minimo: entero(body.stock_minimo, "stock_minimo", { porDefecto: 2 }),
  };
}
