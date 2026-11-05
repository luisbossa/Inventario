import { Router } from "express";
import * as servicio from "../services/consumibles.js";
import * as repuestos from "../services/repuestos.js";

const router = Router();

router.get("/consumibles", (req, res) => res.json(servicio.listar(req.query)));

router.get("/consumibles/:id", (req, res) =>
  res.json(servicio.obtener(req.params.id)),
);

router.post("/consumibles", (req, res) =>
  res.status(201).json(servicio.crear(req.body)),
);

router.put("/consumibles/:id", (req, res) =>
  res.json(servicio.editar(req.params.id, req.body)),
);

router.delete("/consumibles/:id", (req, res) => {
  servicio.eliminar(req.params.id);
  res.status(204).end();
});

router.post("/consumibles/:id/movimientos", (req, res) =>
  res.status(201).json(servicio.nuevoMovimiento(req.params.id, req.body)),
);

router.get("/movimientos", (req, res) =>
  res.json(servicio.listarMovimientos(req.query)),
);

router.get("/resumen", (req, res) => res.json(servicio.resumen()));

// Repuestos (solo lectura; las altas se hacen desde las páginas)
router.get("/repuestos", (req, res) => res.json(repuestos.listar(req.query)));
router.get("/repuestos/entregas", (req, res) => res.json(repuestos.listarEntregas(req.query)));
router.get("/repuestos/prestamos", (req, res) => res.json(repuestos.listarPrestamos(req.query)));
router.get("/repuestos/resumen", (req, res) => res.json(repuestos.resumen()));
router.get("/repuestos/:id", (req, res) => res.json(repuestos.obtener(req.params.id)));

router.use((req, res) => {
  res.status(404).json({ error: "Ruta no encontrada." });
});

export default router;
