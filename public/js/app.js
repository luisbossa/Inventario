// Comportamiento mínimo del cliente. Los datos vienen renderizados desde el
// servidor (EJS + SQLite); aquí solo se abren diálogos y se mejoran formularios.

document.addEventListener("click", (e) => {
  // Abrir diálogo: <button data-abrir="dlg-id" data-consumible="7">
  const abrir = e.target.closest("[data-abrir]");
  if (abrir) {
    const dialogo = document.getElementById(abrir.dataset.abrir);
    if (!dialogo) return;

    const form = dialogo.querySelector("form");
    form?.reset();
    prepararFormulario(dialogo);

    // Preselección: data-consumible (insumos) o data-repuesto (repuestos)
    const id = abrir.dataset.consumible || abrir.dataset.repuesto;
    const seleccion = dialogo.querySelector("[data-seleccion]");
    if (seleccion && id) seleccion.value = id;
    if (id) marcarArticulo(dialogo, id);

    if (abrir.dataset.modalidad) {
      const radio = dialogo.querySelector(`input[name=modalidad][value=${abrir.dataset.modalidad}]`);
      if (radio) radio.checked = true;
    }

    dialogo.showModal();
    dialogo.querySelector("[data-articulo]:checked")?.closest(".articulo")?.scrollIntoView({ block: "nearest" });

    // Foco en el primer campo vacío que haya que completar
    const primerCampo = [...dialogo.querySelectorAll("input:not([type=hidden]), select")]
      .find((campo) => !campo.value);
    (primerCampo || dialogo.querySelector("input:not([type=hidden]), select"))?.focus();
    return;
  }

  // Cerrar diálogo: botones [data-cerrar] o clic en el fondo
  const cerrar = e.target.closest("[data-cerrar]");
  if (cerrar) {
    cerrar.closest("dialog")?.close();
    return;
  }
  if (e.target instanceof HTMLDialogElement) {
    e.target.close();
    return;
  }

  // Cerrar mensaje y limpiar ?ok= / ?error= de la URL
  const cerrarAviso = e.target.closest("[data-cerrar-aviso]");
  if (cerrarAviso) {
    cerrarAviso.closest(".aviso")?.remove();
    limpiarMensajeDeUrl();
  }
});

/** Deja el formulario listo tras reset(): fecha de hoy y artículos desmarcados. */
function prepararFormulario(dialogo) {
  const hoy = new Date();
  hoy.setMinutes(hoy.getMinutes() - hoy.getTimezoneOffset());
  dialogo.querySelectorAll("input[data-hoy]").forEach((campo) => {
    campo.value = hoy.toISOString().slice(0, 10);
  });

  dialogo.querySelectorAll("[data-articulo]").forEach(sincronizarCantidad);
  const filtro = dialogo.querySelector("[data-filtrar-articulos]");
  if (filtro) filtrarArticulos(filtro);
}

/** Marca un artículo en la lista de la entrega (si tiene existencia). */
function marcarArticulo(dialogo, id) {
  const casilla = dialogo.querySelector(`[data-articulo][value="${id}"]`);
  if (casilla && !casilla.disabled) {
    casilla.checked = true;
    sincronizarCantidad(casilla);
  }
}

/** La cantidad solo se envía si el artículo está marcado. */
function sincronizarCantidad(casilla) {
  const cantidad = casilla.closest(".articulo")?.querySelector(".articulo__cant");
  if (cantidad) cantidad.disabled = !casilla.checked;
}

function filtrarArticulos(input) {
  const termino = input.value.trim().toLowerCase();
  const lista = input.closest("form").querySelector("[data-articulos]");
  lista.querySelectorAll(".articulo").forEach((fila) => {
    fila.hidden = Boolean(termino) && !fila.dataset.nombre.includes(termino);
  });
  // Oculta los títulos de grupo que quedaron sin artículos visibles
  lista.querySelectorAll(".articulos__grupo").forEach((grupo) => {
    let siguiente = grupo.nextElementSibling;
    let visible = false;
    while (siguiente && !siguiente.classList.contains("articulos__grupo")) {
      if (!siguiente.hidden) visible = true;
      siguiente = siguiente.nextElementSibling;
    }
    grupo.hidden = !visible;
  });
}

document.addEventListener("input", (e) => {
  if (e.target.matches("[data-filtrar-articulos]")) filtrarArticulos(e.target);
});

// Evita que Enter en el filtro de artículos envíe la entrega
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.matches("[data-filtrar-articulos]")) e.preventDefault();
});

document.addEventListener("change", (e) => {
  // Selects que filtran apenas cambian
  if (e.target.matches("[data-auto-enviar]")) e.target.form?.requestSubmit();
  if (e.target.matches("[data-articulo]")) {
    sincronizarCantidad(e.target);
    e.target.closest("[data-articulos]")
      ?.querySelectorAll("[data-articulo]")
      .forEach((c) => c.setCustomValidity(""));
  }
});

// Una entrega debe llevar al menos un artículo
document.addEventListener(
  "submit",
  (e) => {
    const lista = e.target.querySelector("[data-articulos]");
    if (lista && !lista.querySelector("[data-articulo]:checked")) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const primera = lista.querySelector("[data-articulo]:not(:disabled)");
      primera?.setCustomValidity("Marque al menos un artículo.");
      primera?.reportValidity();
    }
  },
  true,
);

// Evita doble envío de formularios POST
document.addEventListener("submit", (e) => {
  const form = e.target;
  if (form.method !== "post") return;
  if (form.dataset.enviando) {
    e.preventDefault();
    return;
  }
  form.dataset.enviando = "1";
  form.querySelector("[type=submit]")?.setAttribute("disabled", "");
});

function limpiarMensajeDeUrl() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("ok") && !url.searchParams.has("error")) return;
  url.searchParams.delete("ok");
  url.searchParams.delete("error");
  window.history.replaceState(null, "", url);
}

// Los mensajes de éxito se van solos; los de error quedan hasta cerrarlos
document.addEventListener("DOMContentLoaded", () => {
  const ok = document.querySelector(".aviso--ok");
  if (ok) setTimeout(() => ok.remove(), 6000);
  limpiarMensajeDeUrl();
});
