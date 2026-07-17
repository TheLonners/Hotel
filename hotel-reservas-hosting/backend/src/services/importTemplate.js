const XLSX = require("xlsx");

const excelHeaders = [
  "#",
  "NOMBRE",
  "email",
  "Teléfono",
  "CC",
  "Direccion",
  "Huéspedes",
  "Habitación",
  "FECHA INGRESO",
  "Fecha Salida",
  "VALOR",
  "TOTAL",
  "ABONO",
  "SALDO",
  "FECHA ABONO",
  "BANCO",
  "Noches",
  "N° REMISION",
  "AIRBNB",
  "WHAT",
  "SIIGO",
  "QUEO",
  "OBSERVACIONES"
];

function buildImportTemplateWorkbook() {
  const workbook = XLSX.utils.book_new();

  const exampleRow = [
    "1",
    "Juan Perez",
    "juan@example.com",
    "3001234567",
    "123456789",
    "Calle 10 # 20-30",
    2,
    "101 Y 102",
    new Date(Date.UTC(2026, 6, 15)),
    new Date(Date.UTC(2026, 6, 17)),
    230000,
    460000,
    230000,
    230000,
    new Date(Date.UTC(2026, 6, 10)),
    "Bancolombia",
    2,
    "REM-001",
    "",
    "SI",
    "",
    "",
    "Ejemplo: reserva con dos habitaciones. Puedes borrar esta fila."
  ];

  const reservationsSheet = XLSX.utils.aoa_to_sheet([excelHeaders, exampleRow]);
  reservationsSheet["!cols"] = [
    { wch: 8 },
    { wch: 28 },
    { wch: 26 },
    { wch: 18 },
    { wch: 18 },
    { wch: 28 },
    { wch: 12 },
    { wch: 20 },
    { wch: 16 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
    { wch: 18 },
    { wch: 10 },
    { wch: 18 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 42 }
  ];

  ["I2", "J2", "O2"].forEach((cell) => {
    if (reservationsSheet[cell]) reservationsSheet[cell].z = "yyyy-mm-dd";
  });
  ["K2", "L2", "M2", "N2"].forEach((cell) => {
    if (reservationsSheet[cell]) reservationsSheet[cell].z = "#,##0";
  });

  const guideRows = [
    ["Campo", "Obligatorio", "Ejemplo", "Notas"],
    ["#", "No", "1", "Numero interno opcional. Si lo dejas vacio, el sistema asigna id interno."],
    ["NOMBRE", "Si", "Juan Perez", "Debe contener el nombre completo. Luego puedes separar nombre/apellido dentro de la app."],
    ["email", "No", "juan@example.com", "Debe tener formato de correo si lo usas."],
    ["Teléfono", "No", "3001234567", "Escribe como texto para conservar espacios, signos o ceros."],
    ["CC", "No", "123456789", "Escribe como texto. Evita formulas."],
    ["Direccion", "No", "Calle 10 # 20-30", "Tambien se acepta Dirección con tilde."],
    ["Huéspedes", "No", "2", "Numero de personas. Si esta vacio se usa 1."],
    ["Habitación", "Si", "101 Y 102", "Para varias habitaciones usa Y, coma o punto y coma. Ejemplos: 101 Y 102, D4,F3, Penthouse."],
    ["FECHA INGRESO", "Si", "2026-07-15", "Usa fecha real de Excel o formato yyyy-mm-dd."],
    ["Fecha Salida", "Si", "2026-07-17", "Debe ser igual o posterior al ingreso. Si es igual, se importa como day use."],
    ["VALOR", "No", "230000", "Valor base por noche. Solo numeros, sin simbolo de moneda."],
    ["TOTAL", "No", "460000", "Total cobrado. Puede ser diferente al calculo automatico."],
    ["ABONO", "No", "230000", "Se crea como pago inicial historico."],
    ["SALDO", "No", "230000", "Si no coincide con TOTAL menos ABONO, se crea alerta de revision."],
    ["FECHA ABONO", "No", "2026-07-10", "Fecha del abono inicial si existe."],
    ["BANCO", "No", "Bancolombia", "Banco o medio de pago: efectivo, Nequi, Davivienda, Bold, tarjeta, etc."],
    ["Noches", "No", "2", "Si esta vacio, el sistema lo calcula con las fechas."],
    ["N° REMISION", "No", "REM-001", "Se conserva. Si esta duplicado se genera alerta."],
    ["AIRBNB", "No", "SI", "Usa SI, OK, X, 1 o TRUE para marcarlo."],
    ["WHAT", "No", "SI", "Control de WhatsApp."],
    ["SIIGO", "No", "SI", "Control SIIGO."],
    ["QUEO", "No", "SI", "Control QUEO."],
    ["OBSERVACIONES", "No", "Pago pendiente", "Notas libres de la reserva."]
  ];

  const guideSheet = XLSX.utils.aoa_to_sheet(guideRows);
  guideSheet["!cols"] = [{ wch: 18 }, { wch: 14 }, { wch: 22 }, { wch: 78 }];

  XLSX.utils.book_append_sheet(workbook, reservationsSheet, "Reservas");
  XLSX.utils.book_append_sheet(workbook, guideSheet, "Guia");

  return XLSX.write(workbook, {
    bookType: "xlsx",
    type: "buffer",
    cellDates: true
  });
}

module.exports = {
  buildImportTemplateWorkbook
};
