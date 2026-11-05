import express from "express";
import expressLayouts from "express-ejs-layouts";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import apiRouter from "./routes/api.js";
import webRouter from "./routes/web.js";
import repuestosRouter from "./routes/repuestos.js";
import * as vistas from "./vistas.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// En IISNode, process.env.PORT es una Named Pipe (ej. \\.\pipe\...) y no un número.
const PORT = process.env.PORT || 3000;

const app = express();

// Indicar a Express que confíe en el reverse proxy (IIS)
app.set("trust proxy", true);

// Configuración de motor de vistas EJS
app.set("view engine", "ejs");
app.set("views", join(__dirname, "..", "views"));
app.set("layout", "layouts/main");
app.set("layout extractStyles", true);
app.set("layout extractScripts", true);
app.use(expressLayouts);

// Archivos estáticos
app.use(express.static(join(__dirname, "..", "public")));
// Si tienes imágenes en la carpeta raíz /images, puedes descomentar la siguiente línea:
// app.use("/images", express.static(join(__dirname, "..", "images")));

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

// Enrutadores
app.use("/api", apiRouter);
app.use("/repuestos", repuestosRouter);
app.use("/", webRouter);

// Manejador de 404 (No encontrado)
app.use((req, res) => {
  res.status(404).render("error", {
    titulo: "No encontrado",
    seccion: null,
    status: 404,
    detalle: "La página que buscás no existe.",
  });
});

// Manejador centralizado de errores
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

// Inicio del servidor
app.listen(PORT, () => {
  if (isNaN(PORT)) {
    // Si no es un número, significa que está corriendo bajo la Named Pipe de IISNode
    console.log(`Inventario CGI iniciado correctamente bajo IISNode.`);
  } else {
    // Modo local / desarrollo normal
    console.log(`Inventario CGI corriendo en http://localhost:${PORT}`);
  }
});
