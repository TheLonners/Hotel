const XLSX = require("xlsx");
const { addDays, diffNights, parseDateValue, toISODate } = require("./dates");
const { getReservations } = require("./reservations");

function monthRange(date = toISODate(new Date())) {
  const base = parseDateValue(date) || toISODate(new Date());
  const [year, month] = base.split("-").map(Number);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const end = toISODate(new Date(Date.UTC(year, month, 0)));
  return { start, end };
}

function roomCodes(reservation) {
  return reservation.rooms.map((room) => room.codigo_habitacion).join(" Y ");
}

function normalizeRate(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0.05;
  return numeric > 1 ? numeric / 100 : numeric;
}

function reservationItems(start, end) {
  const safeStart = parseDateValue(start) || monthRange().start;
  const safeEnd = parseDateValue(end) || monthRange(safeStart).end;
  const reservations = getReservations({ start: safeStart, end: addDays(safeEnd, 1) })
    .filter((reservation) =>
      reservation.estado_reserva !== "cancelada" &&
      reservation.numero_remision &&
      reservation.fecha_ingreso >= safeStart &&
      reservation.fecha_ingreso <= safeEnd
    );
  return reservations.map((reservation, index) => ({
    id: reservation.id,
    included: true,
    index: index + 1,
    remision: reservation.numero_remision,
    huesped: reservation.nombre_completo_huesped,
    cedula: reservation.cedula || "",
    habitacion: roomCodes(reservation),
    ingreso: reservation.fecha_ingreso,
    salida: reservation.fecha_salida,
    banco: reservation.banco_o_medio_pago || reservation.payments[0]?.banco_o_medio || "",
    total: Number(reservation.total_pago || 0),
    porcentaje: 0.05,
    comision: Number(reservation.total_pago || 0) * 0.05
  }));
}

function computeBilling(input = {}) {
  const range = monthRange();
  const start = parseDateValue(input.start) || range.start;
  const end = parseDateValue(input.end) || monthRange(start).end;
  const rate = normalizeRate(input.porcentaje ?? input.rate ?? 0.05);
  const sourceItems = input.items?.length ? input.items : reservationItems(start, end);
  const items = sourceItems.map((item, index) => {
    const included = item.included !== false && item.incluida !== false;
    const total = Number(item.total || item.total_pago || 0);
    return {
      id: item.id,
      included,
      index: index + 1,
      remision: String(item.remision || item.numero_remision || ""),
      huesped: String(item.huesped || item.nombre_completo_huesped || ""),
      cedula: String(item.cedula || ""),
      habitacion: String(item.habitacion || item.habitaciones || ""),
      ingreso: parseDateValue(item.ingreso || item.fecha_ingreso) || "",
      salida: parseDateValue(item.salida || item.fecha_salida) || "",
      banco: String(item.banco || item.banco_o_medio_pago || ""),
      total,
      porcentaje: normalizeRate(item.porcentaje ?? rate),
      comision: included ? total * normalizeRate(item.porcentaje ?? rate) : 0
    };
  });
  const includedItems = items.filter((item) => item.included);
  const totalRemisiones = includedItems.reduce((sum, item) => sum + item.total, 0);
  const valorComision = includedItems.reduce((sum, item) => sum + item.comision, 0);
  const conectividad = Number(input.conectividad || 0);
  const otros = Number(input.otros || 0);
  const emisor = {
    nombre: input.emisor_nombre || "Tania Gysell Lopez",
    documento: input.emisor_documento || "",
    telefono: input.emisor_telefono || "",
    correo: input.emisor_correo || ""
  };
  return {
    start,
    end,
    period_label: `${start} a ${end}`,
    porcentaje: rate,
    conectividad,
    otros,
    emisor,
    concepto: input.concepto || "Comision por remisiones cobradas",
    items,
    summary: {
      remisiones_incluidas: includedItems.length,
      total_remisiones: totalRemisiones,
      porcentaje: rate,
      valor_comision: valorComision,
      conectividad,
      otros,
      total_cuenta: valorComision + conectividad + otros,
      dias_periodo: Math.max(1, diffNights(start, addDays(end, 1)))
    }
  };
}

function buildBillingWorkbook(input = {}) {
  const account = computeBilling(input);
  const workbook = XLSX.utils.book_new();
  const rowCount = Math.max(account.items.length, 1);
  const detailEnd = rowCount + 1;
  const summaryRows = [
    ["Vista Montaña - Cuenta de cobro", "", "", "", "", "", "", ""],
    ["Formato editable para cierre de remisiones con comisión del 5%", "", "", "", "", "", "", ""],
    [],
    ["Hotel", "Vista Montaña", "", "Concepto", account.concepto, "", "", ""],
    ["Periodo", account.period_label, "", "Regla", "Solo remisiones incluidas en cuenta", "", "", ""],
    ["Emisor", account.emisor.nombre, "", "Porcentaje", account.porcentaje, "", "", ""],
    ["Documento emisor", account.emisor.documento, "", "Fecha emisión", toISODate(new Date()), "", "", ""],
    [],
    ["Resumen", "", "", "", "", "", "", ""],
    ["Remisiones incluidas", { f: `COUNTIF('Detalle remisiones'!K2:K${detailEnd},"SI")` }, "", "Total remisiones", { f: `SUMIF('Detalle remisiones'!K2:K${detailEnd},"SI",'Detalle remisiones'!I2:I${detailEnd})` }, "", "", ""],
    ["Comisión %", account.porcentaje, "", "Valor comisión", { f: `SUM('Detalle remisiones'!L2:L${detailEnd})` }, "", "", ""],
    ["Conectividad", account.conectividad, "", "Otros", account.otros, "", "", ""],
    ["", "", "", "Total cuenta de cobro", { f: "E11+B12+E12" }, "", "", ""],
    [],
    ["Nota", "Cambie SI/NO en Detalle remisiones para incluir o excluir remisiones.", "", "", "", "", "", ""]
  ];
  const summary = XLSX.utils.aoa_to_sheet(summaryRows);
  summary["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 7 } }
  ];
  summary["!cols"] = [{ wch: 22 }, { wch: 24 }, { wch: 4 }, { wch: 22 }, { wch: 28 }, { wch: 4 }, { wch: 12 }, { wch: 12 }];
  ["E6", "B11"].forEach((cell) => { if (summary[cell]) summary[cell].z = "0.00%"; });
  ["E10", "E11", "B12", "E12", "E13"].forEach((cell) => { if (summary[cell]) summary[cell].z = "$#,##0"; });
  XLSX.utils.book_append_sheet(workbook, summary, "Cuenta de cobro");

  const detailRows = [
    ["#", "Remision", "Huesped", "CC", "Habitacion", "Ingreso", "Salida", "Banco/medio", "Total remision", "Comision %", "Incluir", "Comision 5%"],
    ...account.items.map((item, index) => [
      index + 1,
      item.remision,
      item.huesped,
      item.cedula,
      item.habitacion,
      item.ingreso,
      item.salida,
      item.banco,
      item.total,
      item.porcentaje,
      item.included ? "SI" : "NO",
      { f: `IF(K${index + 2}="SI",I${index + 2}*J${index + 2},0)` }
    ])
  ];
  const detail = XLSX.utils.aoa_to_sheet(detailRows);
  detail["!cols"] = [
    { wch: 6 }, { wch: 16 }, { wch: 30 }, { wch: 16 }, { wch: 14 }, { wch: 12 },
    { wch: 12 }, { wch: 16 }, { wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 15 }
  ];
  for (let row = 2; row <= detailEnd; row += 1) {
    ["F", "G"].forEach((col) => { if (detail[`${col}${row}`]) detail[`${col}${row}`].z = "yyyy-mm-dd"; });
    ["I", "L"].forEach((col) => { if (detail[`${col}${row}`]) detail[`${col}${row}`].z = "$#,##0"; });
    if (detail[`J${row}`]) detail[`J${row}`].z = "0.00%";
  }
  XLSX.utils.book_append_sheet(workbook, detail, "Detalle remisiones");

  const params = XLSX.utils.aoa_to_sheet([
    ["Parametro", "Valor"],
    ["Emisor", account.emisor.nombre],
    ["Documento", account.emisor.documento],
    ["Telefono", account.emisor.telefono],
    ["Correo", account.emisor.correo],
    ["Porcentaje", account.porcentaje],
    ["Conectividad", account.conectividad],
    ["Otros", account.otros]
  ]);
  params["!cols"] = [{ wch: 18 }, { wch: 32 }];
  XLSX.utils.book_append_sheet(workbook, params, "Parametros");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function pdfEscape(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function money(value) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function buildSimplePdf(lines) {
  const pages = [];
  const pageHeight = 792;
  const pageWidth = 612;
  let current = [];
  let y = 740;
  lines.forEach((line) => {
    if (y < 60) {
      pages.push(current);
      current = [];
      y = 740;
    }
    current.push({ text: line.text, x: line.x || 42, y, size: line.size || 9, bold: Boolean(line.bold) });
    y -= line.gap || 16;
  });
  pages.push(current);

  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };
  const fontRegular = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const fontBold = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const pageIds = [];
  const contentIds = [];
  pages.forEach((page) => {
    const stream = page.map((line) =>
      `BT /${line.bold ? "F2" : "F1"} ${line.size} Tf ${line.x} ${line.y} Td (${pdfEscape(line.text)}) Tj ET`
    ).join("\n");
    const contentId = add(`<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`);
    const pageId = add(`<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${contentId} 0 R >>`);
    contentIds.push(contentId);
    pageIds.push(pageId);
  });
  const pagesId = add(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
  pageIds.forEach((id) => {
    objects[id - 1] = objects[id - 1].replace("/Parent 0 0 R", `/Parent ${pagesId} 0 R`);
  });
  const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

function buildBillingPdf(input = {}) {
  const account = computeBilling(input);
  const lines = [
    { text: "Vista Montana - Cuenta de cobro", size: 16, bold: true, gap: 22 },
    { text: `Periodo: ${account.period_label}`, bold: true },
    { text: `Emisor: ${account.emisor.nombre} ${account.emisor.documento ? `- ${account.emisor.documento}` : ""}` },
    { text: `Concepto: ${account.concepto}`, gap: 22 },
    { text: `Remisiones incluidas: ${account.summary.remisiones_incluidas}`, bold: true },
    { text: `Total remisiones: ${money(account.summary.total_remisiones)}` },
    { text: `Comision ${(account.porcentaje * 100).toFixed(2)}%: ${money(account.summary.valor_comision)}` },
    { text: `Conectividad: ${money(account.summary.conectividad)}    Otros: ${money(account.summary.otros)}` },
    { text: `Total cuenta de cobro: ${money(account.summary.total_cuenta)}`, size: 13, bold: true, gap: 24 },
    { text: "Detalle", bold: true }
  ];
  account.items.filter((item) => item.included).forEach((item, index) => {
    lines.push({
      text: `${index + 1}. ${item.remision} | ${item.huesped.slice(0, 28)} | Hab ${item.habitacion} | ${item.ingreso} a ${item.salida} | ${money(item.total)} | ${money(item.comision)}`
    });
  });
  return buildSimplePdf(lines);
}

module.exports = {
  buildBillingPdf,
  buildBillingWorkbook,
  computeBilling
};
