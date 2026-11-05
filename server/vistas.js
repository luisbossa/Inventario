/** Helpers disponibles en todas las plantillas EJS. */

export { TIPOS_INSUMO } from "./validar.js";

export const ETIQUETA_ESTADO = {
  ok: "Disponible",
  bajo: "Reponer",
  agotado: "Sin stock",
};

export const ETIQUETA_TIPO = {
  SALIDA: "Entrega",
  ENTRADA: "Ingreso",
  AJUSTE: "Ajuste",
};

export const COLORES = ["NEGRO", "CYAN", "MAGENTA", "AMARILLO", "TRICOLOR"];

/** "2026-10-15 07:00:28" → "15/10/2026 07:00" */
export function fecha(valor, { hora = true } = {}) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(valor || "");
  if (!m) return valor || "—";
  const dia = `${m[3]}/${m[2]}/${m[1]}`;
  return hora && m[4] ? `${dia} ${m[4]}:${m[5]}` : dia;
}

/** "Negro", "Unidad de imagen"... */
export function capitalizar(valor) {
  const texto = String(valor || "").toLowerCase();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Código + rendimiento + color si no es negro: "TN 637 Cyan" */
export function nombreInsumo(c) {
  const rendimiento = c.rendimiento ? ` (${c.rendimiento})` : "";
  const color = c.color && c.color !== "NEGRO" ? ` ${capitalizar(c.color)}` : "";
  return `${c.codigo}${rendimiento}${color}`;
}

/** La barra se llena al 100% cuando el stock es 3 veces el mínimo. */
export function porcentajeNivel(c) {
  const referencia = Math.max(c.stock_minimo * 3, 1);
  return Math.min(100, Math.round((c.stock / referencia) * 100));
}

/** Arma una URL de filtros conservando los parámetros no vacíos. */
export function urlCon(base, params) {
  const limpios = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== "",
  );
  return limpios.length ? `${base}?${new URLSearchParams(limpios)}` : base;
}

export function cantidadConSigno(m) {
  if (m.tipo === "SALIDA") return `−${m.cantidad}`;
  return m.cantidad > 0 ? `+${m.cantidad}` : String(m.cantidad).replace("-", "−");
}

/** "Teclado" o "Teclado (usado)" */
export function nombreRepuesto(r) {
  return r.condicion === "Usado" ? `${r.nombre} (usado)` : r.nombre;
}

export const ETIQUETA_MODALIDAD = { DEFINITIVA: "Definitiva", PRESTAMO: "Préstamo" };

export const ETIQUETA_MOV_REPUESTO = {
  SALIDA: "Entrega",
  ENTRADA: "Ingreso",
  AJUSTE: "Ajuste",
  DEVOLUCION: "Devolución",
};
export { CATEGORIAS, CONDICIONES } from "./services/repuestos.js";
