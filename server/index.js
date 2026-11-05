import express from "express";
import expressLayouts from "express-ejs-layouts";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import apiRouter from "./routes/api.js";
import webRouter from "./routes/web.js";
import repuestosRouter from "./routes/repuestos.js";
import * as vistas from "./vistas.js";

// Obtenemos la carpeta actual (server) y la raíz real del proyecto (un nivel arriba)
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..");

const PORT = process.env.PORT || 3000;

const app = express();

app.set("trust proxy", true);

// Configuración de motor de vistas EJS (Ahora apunta a la raíz/views)
app.set("view engine", "ejs");
app.set("views", join(ROOT_DIR, "views"));
app.set("layout", "layouts/main");
app.set("layout extractStyles", true);
app.set("layout extractScripts", true);
app.use(expressLayouts);

// Archivos estáticos (Ahora apuntan a la raíz/public e images)
app.use(express.static(join(ROOT_DIR, "public")));
app.use("/images", express.static(join(ROOT_DIR, "images")));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Variables disponibles en todas las vistas
app.use((req, res, next) => {
  Object.assign(res.locals, vistas, {
    rutaActual: req.originalUrl,
    mensaje: { ok: req.query.ok, error: req.query.error },
    subtitulo: null,
    migas: [],
    busqueda: null,
    todos: [],
  });
  next();
});

// Rutas
app.use("/api", apiRouter);
app.use("/repuestos", repuestosRouter);
app.use("/", webRouter);

// Manejador de 404
app.use((req, res) => {
  res.status(404).render("error", {
    titulo: "No encontrado",
    seccion: null,
    status: 404,
    detalle: "La página que buscás no existe.",
  });
});

// Manejador de errores
app.use((err, req, res, next) => {
  const status = err.status || (err.type === "entity.parse.failed" ? 400 : 500);
  if (status >= 500) console.error(err);
  const detalle = status >= 500 ? "Error interno del servidor." : err.message;

  if (req.originalUrl.startsWith("/api")) {
    return res.status(status).json({ error: detalle });
  }
  res.status(status).render("error", {
    titulo: "Error",
    seccion: null,
    status,
    detalle,
  });
});

// Servidor
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    if (isNaN(PORT)) {
      console.log(`Inventario CGI iniciado correctamente bajo IISNode.`);
    } else {
      console.log(`Inventario CGI corriendo en http://localhost:${PORT}`);
    }
  });
}

export default app;
