// Carga inicial con los datos de las hojas de Excel del departamento.
// Uso: npm run seed   (cada sección solo carga si su tabla está vacía)
import { readFileSync } from "node:fs";
import { db, transaccion, registrarMovimiento } from "./db.js";
import { registrarEntregaHistorica } from "./services/repuestos.js";

// ---------- Insumos: hoja "Control de Tóner" ----------

const TONERS = [
  // marca, codigo, impresora, color, stock, rendimiento
  ["HP", "CF226XC", "M402DN", "NEGRO", 13],
  ["HP", "CF258XC", "M404DN", "NEGRO", 10],
  ["HP", "CF287JC", "M501dn", "NEGRO", 16],
  ["Kyocera", "TK3182", "P3155DN", "NEGRO", 3],
  ["Kyocera", "TK162", "TK162", "NEGRO", 0],
  ["Kyocera", "TK3112", "TK3112", "NEGRO", 0],
  ["Lexmark", "58D4H00", "MX722adhe", "NEGRO", 18, "BR"],
  ["Lexmark", "58D4X00", "MX722adhe", "NEGRO", 2, "AR"],
  ["Brother", "TN 635", "MFC-L8970CDW", "NEGRO", 2],
  ["Brother", "TN 637", "MFC-L8970CDW", "CYAN", 2],
  ["Brother", "TN 637", "MFC-L8970CDW", "MAGENTA", 2],
  ["Brother", "TN 637", "MFC-L8970CDW", "AMARILLO", 2],
  ["Ricoh", "MP601", "MP501", "NEGRO", 4],
  ["Ricoh", "SP 4500HA", "SP 4510DN", "NEGRO", 2],
  ["Brother", "TN920XXL", "HL-L6415DW", "NEGRO", 16],
  ["Kyocera", "KT-3432", "ECOSYS MA5500ifx", "NEGRO", 8],
];

// Tabla de casos del Excel (ya descontados del stock de arriba).
const ENTREGAS = [
  // caso, tecnico, lugar, codigo del tóner
  ["2705295", "Jafet", "San Jerónimo", "CF258XC"],
  ["2701257", "Carmelo", "Rosario", "CF258XC"],
  ["2707641", "Jafet", "San Jerónimo", "CF226XC"],
  [null, "Josué", "RRHH", "KT-3432"],
  ["2850738", "Javier", "Contraloría", "CF258XC"],
  ["2879589", "Javier", "Plataforma Abajo 1", "TN920XXL"],
  ["2935982", "Javier", "Plataforma Abajo 2", "TN920XXL"],
  [null, "Bossa", "Secretaria Enfermería", "KT-3432"],
  ["2940273", "Javier", "San Antonio - Dra", "CF226XC"],
  ["2947551", "Javier", "Laboratorio Ventanilla", "CF226XC"],
  ["2973482", "Javier", "Consultorio 3 Consulta Externa", "TN920XXL"],
  ["2973858", "Javier", "Plataforma Arriba", "TN920XXL"],
  ["3009430", "Javier", "Consultorio 4 Consulta Externa", "TN920XXL"],
  ["3009446", "Javier", "Ebais Cirrí - Dr", "CF258XC"],
  ["3019698", "Geiner", "CEYES", "TK3182"], // en el Excel figura como "KT-3182"
  ["3024100", "Javier", "Plataforma Abajo 1", "TN920XXL"],
  ["3045368", "Javier", "Vacunación Consulta Externa", "KT-3432"],
];

function seedInsumos() {
  const { total } = db.prepare("SELECT COUNT(*) AS total FROM consumibles").get();
  if (total > 0) {
    console.log(`Insumos: la base ya tiene ${total} registro(s); no se cargó nada.`);
    return;
  }

  transaccion(() => {
    const insertar = db.prepare(
      `INSERT INTO consumibles (marca, codigo, impresora, color, rendimiento)
       VALUES (?, ?, ?, ?, ?)`,
    );
    const ids = new Map();

    for (const [marca, codigo, impresora, color, stock, rendimiento = null] of TONERS) {
      const id = Number(insertar.run(marca, codigo, impresora, color, rendimiento).lastInsertRowid);
      if (color === "NEGRO") ids.set(codigo, id);
      if (stock > 0) {
        registrarMovimiento({
          consumibleId: id,
          tipo: "AJUSTE",
          stockNuevo: stock,
          nota: "Carga inicial (Excel)",
        });
      }
    }

    for (const [caso, tecnico, lugar, codigo] of ENTREGAS) {
      registrarMovimiento({
        consumibleId: ids.get(codigo),
        tipo: "SALIDA",
        cantidad: 1,
        caso,
        tecnico,
        lugar,
        nota: "Histórico Excel",
        historico: true,
      });
    }
  });

  console.log(`Insumos: cargados ${TONERS.length} tóners y ${ENTREGAS.length} entregas.`);
}

// ---------- Repuestos: fila DISPONIBLES de "Sustitución de repuestos" + "Repuestos varios" ----------

const REPUESTOS = [
  // categoria, nombre, condicion, existencia, detalle
  ["Periférico", "Teclado", "Nuevo", 42],
  ["Periférico", "Mouse", "Nuevo", 26],
  ["Periférico", "Llave maya", "Nuevo", 0],
  ["Periférico", "Hub USB", "Nuevo", 30],
  ["Periférico", "Headset", "Nuevo", 3],
  ["Periférico", "Parlantes Poly", "Nuevo", 20],
  ["Periférico", "Web cam", "Nuevo", 18],
  ["Periférico", "Cooler pad", "Nuevo", 19],
  ["Periférico", "Docking station", "Nuevo", 20],
  ["Periférico", "Lector de firma", "Nuevo", 5],
  ["Periférico", "Lector de firma", "Usado", 5, "Lector de firma digital"],
  ["Periférico", "Web cam", "Usado", 1],
  ["Periférico", "Teclado", "Usado", 5],
  ["Periférico", "Teclado ergonómico", "Usado", 3],
  ["Periférico", "Parlantes Poly", "Usado", 1],
  ["Periférico", "Mouse", "Usado", 0],
  ["Varios", "Cinta rotuladora blanca", "Nuevo", 7, "Producto #131582"],
  // En la hoja aparece dos veces con 5 unidades; se carga una sola fila (verificar).
  ["Varios", "Cinta rotuladora amarilla", "Nuevo", 5, "Producto #143375"],
  ["Varios", "Switch Aruba 6300M", "Nuevo", 2],
  ["Varios", "SSD", "Usado", 37],
  ["Varios", "Adaptador tipo C", "Usado", 9],
  ["Cable", "HDMI a VGA", "Nuevo", 11],
  ["Cable", "USB-C a VGA", "Nuevo", 10],
  ["Cable", "USB a RJ45", "Nuevo", 8],
  ["Cable", "USB a USB-C", "Nuevo", 30],
  ["Cable", "Cable de red", "Nuevo", 270],
  ["Cable", "Cable de impresora", "Nuevo", 50],
];

function seedRepuestos() {
  const { total } = db.prepare("SELECT COUNT(*) AS total FROM repuestos").get();
  if (total > 0) {
    console.log(`Repuestos: la base ya tiene ${total} artículo(s); no se cargó el catálogo.`);
    return;
  }

  transaccion(() => {
    const insertar = db.prepare(
      "INSERT INTO repuestos (categoria, nombre, condicion, detalle, stock) VALUES (?, ?, ?, ?, ?)",
    );
    const ajuste = db.prepare(
      `INSERT INTO repuesto_movimientos (repuesto_id, tipo, cantidad, stock_resultante, nota, fecha)
       VALUES (?, 'AJUSTE', ?, ?, 'Carga inicial (Excel)', datetime('now', 'localtime'))`,
    );
    for (const [categoria, nombre, condicion, stock, detalle = null] of REPUESTOS) {
      const id = Number(insertar.run(categoria, nombre, condicion, detalle, stock).lastInsertRowid);
      if (stock > 0) ajuste.run(id, stock, stock);
    }
  });

  console.log(`Repuestos: cargados ${REPUESTOS.length} artículos.`);
}

function seedHistorialRepuestos() {
  const datos = JSON.parse(
    readFileSync(new URL("./datos/repuestos-historial.json", import.meta.url), "utf8"),
  );

  // Comparación con la fila TOTAL ENTREGADOS de la hoja
  const conteo = {};
  for (const c of datos.casos) {
    for (const articulo of c.articulos) conteo[articulo] = (conteo[articulo] || 0) + 1;
  }
  const diferencias = Object.entries(datos.totales_excel).filter(
    ([articulo, total]) => (conteo[articulo] || 0) !== total,
  );
  const porRevisar = datos.casos.filter((c) => c.revisar).map((c) => c.caso);

  if (!datos.revisado) {
    console.log(
      'Historial de repuestos: NO cargado ("revisado": false en server/datos/repuestos-historial.json).',
    );
    for (const [articulo, total] of diferencias) {
      console.log(`  · ${articulo}: transcrito ${conteo[articulo] || 0}, Excel ${total}`);
    }
    if (porRevisar.length) console.log(`  · Casos por revisar: ${porRevisar.join(", ")}`);
    return;
  }

  const { ya } = db
    .prepare("SELECT COUNT(*) AS ya FROM repuesto_movimientos WHERE nota = 'Histórico Excel'")
    .get();
  if (ya > 0) {
    console.log(`Historial de repuestos: ya hay ${ya} entrega(s) histórica(s); no se cargó de nuevo.`);
    return;
  }

  const buscar = db.prepare(
    "SELECT id FROM repuestos WHERE nombre = ? COLLATE NOCASE AND condicion = 'Nuevo' AND activo = 1",
  );
  let cargadas = 0;
  transaccion(() => {
    for (const c of datos.casos) {
      for (const nombre of c.articulos) {
        const repuesto = buscar.get(nombre);
        if (!repuesto) throw new Error(`Caso ${c.caso}: artículo desconocido "${nombre}".`);
        registrarEntregaHistorica({
          repuestoId: repuesto.id,
          caso: c.caso,
          funcionario: c.funcionario,
          tecnico: c.entrega,
          fecha: c.fecha,
        });
        cargadas++;
      }
    }
  });

  console.log(`Historial de repuestos: cargadas ${cargadas} entregas de ${datos.casos.length} casos.`);
  if (diferencias.length) {
    console.log(
      `  Aviso: los totales no coinciden con la hoja en: ${diferencias.map(([a]) => a).join(", ")}.`,
    );
  }
}

seedInsumos();
seedRepuestos();
seedHistorialRepuestos();
