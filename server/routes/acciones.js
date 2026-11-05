/** Helpers para formularios POST que vuelven a la página con un mensaje. */

/** Solo rutas internas, para no redirigir a otro sitio. */
export function rutaSegura(ruta, porDefecto) {
  return typeof ruta === "string" && /^\/(?!\/)/.test(ruta) ? ruta : porDefecto;
}

export function redirigir(res, ruta, mensaje) {
  const [base, query = ""] = ruta.split("?");
  const params = new URLSearchParams(query);
  params.delete("ok");
  params.delete("error");
  for (const [clave, valor] of Object.entries(mensaje)) params.set(clave, valor);
  res.redirect(`${base}?${params}`);
}

/**
 * Ejecuta la acción y vuelve a la página de origen (campo `volver`).
 * La acción devuelve el mensaje, o { ruta, ok } para ir a otra página.
 * Errores de validación (4xx) vuelven como ?error=.
 */
export function accion(porDefecto, fn) {
  return (req, res) => {
    const volver = rutaSegura(req.body.volver, porDefecto);
    try {
      const mensaje = fn(req);
      redirigir(res, typeof mensaje === "object" ? mensaje.ruta : volver, {
        ok: typeof mensaje === "object" ? mensaje.ok : mensaje,
      });
    } catch (err) {
      if (!err.status || err.status >= 500) throw err;
      redirigir(res, volver, { error: err.message });
    }
  };
}
