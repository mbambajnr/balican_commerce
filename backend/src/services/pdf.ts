import PDFDocument from "pdfkit";
import { config } from "../config";

const FONT_SIZE_BODY = 9;
const FONT_SIZE_SMALL = 7;
const FONT_SIZE_LARGE = 14;
const FONT_SIZE_TITLE = 20;

function addHeader(doc: PDFKit.PDFDocument, title: string, number: string, date: string) {
  doc.fontSize(FONT_SIZE_TITLE).font("Helvetica-Bold").text("Bali-Can Limited", { align: "left" });
  doc.fontSize(FONT_SIZE_LARGE).font("Helvetica-Bold").fillColor("#1848CC").text(title, { align: "right" });
  doc.fontSize(FONT_SIZE_BODY).font("Helvetica").fillColor("#111827");
  doc.text(`#${number}`, { align: "right" });
  doc.text(`Date: ${date}`, { align: "right" });
  doc.moveDown(0.5);

  doc.fontSize(FONT_SIZE_SMALL).fillColor("#64748B").text("Industrial Supply & Services", { align: "left" });
  doc.text("Accra, Ghana", { align: "left" });
  doc.moveDown(1);

  doc.strokeColor("#1848CC").lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(1);
}

function addClientDetails(doc: PDFKit.PDFDocument, label: string, name: string, email: string, phone: string, address: string) {
  doc.fontSize(FONT_SIZE_BODY).font("Helvetica-Bold").fillColor("#111827").text(label);
  doc.font("Helvetica").fillColor("#111827");
  doc.text(name || "—");
  doc.text(email || "");
  doc.text(phone || "");
  doc.text(address || "");
  doc.moveDown(1);
}

function addTableHeaders(doc: PDFKit.PDFDocument, headers: string[], widths: number[], startY: number): number {
  let x = 50;
  const rowHeight = 18;

  doc.rect(50, startY, 495, rowHeight).fill("#1848CC");
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(FONT_SIZE_SMALL);

  for (let i = 0; i < headers.length; i++) {
    doc.text(headers[i], x + 4, startY + 5, { width: widths[i] - 8, align: i === 0 ? "left" : "right" });
    x += widths[i];
  }

  return startY + rowHeight;
}

function addTableRow(
  doc: PDFKit.PDFDocument,
  cells: string[],
  widths: number[],
  startY: number,
  isEven: boolean,
  linkUrl?: string
): number {
  let x = 50;
  const rowHeight = 22;

  if (isEven) {
    doc.rect(50, startY, 495, rowHeight).fill("#F8FAFC");
  }

  doc.fillColor("#111827").font("Helvetica").fontSize(FONT_SIZE_SMALL);

  for (let i = 0; i < cells.length; i++) {
    const textX = x + 4;
    const textWidth = widths[i] - 8;

    if (i === cells.length - 1 && linkUrl) {
      doc.fillColor("#1848CC");
      doc.text(cells[i], textX, startY + 6, { width: textWidth, align: "right", link: linkUrl, underline: true });
      doc.fillColor("#111827");
    } else {
      doc.text(cells[i], textX, startY + 6, { width: textWidth, align: i === 0 ? "left" : "right" });
    }

    x += widths[i];
  }

  // Bottom border
  doc.strokeColor("#E2E8F0").lineWidth(0.5).moveTo(50, startY + rowHeight).lineTo(545, startY + rowHeight).stroke();

  return startY + rowHeight;
}

function addSummaryRow(doc: PDFKit.PDFDocument, label: string, value: string, y: number, bold: boolean = false) {
  doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(FONT_SIZE_BODY);
  doc.fillColor("#111827").text(label, 350, y, { width: 90, align: "right" });
  doc.text(value, 450, y, { width: 95, align: "right" });
}

/* ── Quotation PDF ── */

export interface QuotationPdfData {
  quotationNumber: string;
  createdAt: string;
  rfqReference: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  clientAddress: string;
  items: QuotationPdfItem[];
  discountAmount: number;
  taxAmount: number;
  serviceFee: number;
  deliveryFee: number;
  subtotal: number;
  totalAmount: number;
  validUntil: string;
  terms: string;
  notesToCustomer: string;
  currency: string;
}

export interface QuotationPdfItem {
  description: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  productUrl?: string;
}

export function generateQuotationPdf(data: QuotationPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const cur = data.currency || "GH₵";
    const dateStr = data.createdAt ? new Date(data.createdAt).toLocaleDateString("en-GH") : new Date().toLocaleDateString("en-GH");
    const validStr = data.validUntil ? new Date(data.validUntil).toLocaleDateString("en-GH") : "—";

    addHeader(doc, "QUOTATION", data.quotationNumber, dateStr);

    addClientDetails(doc, "Client", data.clientName, data.clientEmail, data.clientPhone, data.clientAddress);

    doc.fontSize(FONT_SIZE_BODY).font("Helvetica").fillColor("#64748B").text(`RFQ Reference: ${data.rfqReference}`);
    doc.moveDown(1);

    // Table headers
    const colWidths = [200, 70, 55, 75, 95];
    const headers = ["Description / Product", "SKU", "Qty", `Unit Price (${cur})`, `Total (${cur})`];
    let y = addTableHeaders(doc, headers, colWidths, doc.y);

    // Table rows
    data.items.forEach((item, i) => {
      const cells = [
        item.description,
        item.sku || "—",
        String(item.quantity),
        Number(item.unitPrice).toLocaleString(),
        Number(item.lineTotal).toLocaleString(),
      ];
      y = addTableRow(doc, cells, colWidths, y, i % 2 === 0, item.productUrl);

      if (item.productUrl) {
        doc.fontSize(FONT_SIZE_SMALL).fillColor("#1848CC");
        doc.text("View Product →", 54, y - 16, { width: 190, link: item.productUrl, underline: true });
        doc.fillColor("#111827");
      }
    });

    y += 10;

    const showDiscount = parseFloat(String(data.discountAmount)) > 0;
    const showTax = parseFloat(String(data.taxAmount)) > 0;
    const showService = parseFloat(String(data.serviceFee)) > 0;
    const showDelivery = parseFloat(String(data.deliveryFee)) > 0;

    addSummaryRow(doc, "Subtotal", `${cur} ${Number(data.subtotal).toLocaleString()}`, y); y += 16;
    if (showDiscount) { addSummaryRow(doc, "Discount", `-${cur} ${Number(data.discountAmount).toLocaleString()}`, y); y += 16; }
    if (showTax) { addSummaryRow(doc, "Tax", `${cur} ${Number(data.taxAmount).toLocaleString()}`, y); y += 16; }
    if (showService) { addSummaryRow(doc, "Service Fee", `${cur} ${Number(data.serviceFee).toLocaleString()}`, y); y += 16; }
    if (showDelivery) { addSummaryRow(doc, "Delivery Fee", `${cur} ${Number(data.deliveryFee).toLocaleString()}`, y); y += 16; }

    doc.strokeColor("#1848CC").lineWidth(1).moveTo(350, y).lineTo(545, y).stroke(); y += 8;
    addSummaryRow(doc, "TOTAL", `${cur} ${Number(data.totalAmount).toLocaleString()}`, y, true); y += 24;

    if (data.terms) {
      doc.fontSize(FONT_SIZE_BODY).font("Helvetica-Bold").fillColor("#111827").text("Terms & Conditions", 50, y); y += 14;
      doc.font("Helvetica").fontSize(FONT_SIZE_SMALL).fillColor("#64748B").text(data.terms, 50, y, { width: 495 });
      y += data.terms.length > 200 ? 40 : 20;
    }

    doc.fontSize(FONT_SIZE_BODY).font("Helvetica-Bold").fillColor("#111827").text("Valid Until:", 50, y);
    doc.font("Helvetica").fontSize(FONT_SIZE_BODY).fillColor("#64748B").text(validStr, 120, y);
    y += 18;

    if (data.notesToCustomer) {
      doc.fontSize(FONT_SIZE_BODY).font("Helvetica-Bold").fillColor("#111827").text("Notes:", 50, y); y += 14;
      doc.font("Helvetica").fontSize(FONT_SIZE_SMALL).fillColor("#64748B").text(data.notesToCustomer, 50, y, { width: 495 });
    }

    doc.end();
  });
}

/* ── Invoice PDF ── */

export interface InvoicePdfData {
  invoiceNumber: string;
  createdAt: string;
  orderNumber: string;
  quotationNumber: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  clientAddress: string;
  items: InvoicePdfItem[];
  subtotal: number;
  tax: number;
  total: number;
  amountPaid: number;
  outstandingAmount: number;
  dueDate: string;
  paymentTerms: string;
  notes: string;
  currency: string;
}

export interface InvoicePdfItem {
  description: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  productUrl?: string;
}

export function generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const cur = data.currency || "GH₵";
    const dateStr = data.createdAt ? new Date(data.createdAt).toLocaleDateString("en-GH") : new Date().toLocaleDateString("en-GH");
    const dueStr = data.dueDate ? new Date(data.dueDate).toLocaleDateString("en-GH") : "—";

    addHeader(doc, "INVOICE", data.invoiceNumber, dateStr);

    doc.fontSize(FONT_SIZE_SMALL).font("Helvetica").fillColor("#64748B");
    doc.text(`Order: ${data.orderNumber}`);
    doc.text(`Quotation: ${data.quotationNumber}`);
    doc.moveDown(1);

    addClientDetails(doc, "Bill To", data.clientName, data.clientEmail, data.clientPhone, data.clientAddress);

    const colWidths = [200, 70, 55, 75, 95];
    const headers = ["Description", "SKU", "Qty", `Unit Price (${cur})`, `Total (${cur})`];
    let y = addTableHeaders(doc, headers, colWidths, doc.y);

    data.items.forEach((item, i) => {
      const cells = [
        item.description,
        item.sku || "—",
        String(item.quantity),
        Number(item.unitPrice).toLocaleString(),
        Number(item.lineTotal).toLocaleString(),
      ];
      y = addTableRow(doc, cells, colWidths, y, i % 2 === 0, item.productUrl);
      if (item.productUrl) {
        doc.fontSize(FONT_SIZE_SMALL).fillColor("#1848CC");
        doc.text("View Product →", 54, y - 16, { width: 190, link: item.productUrl, underline: true });
        doc.fillColor("#111827");
      }
    });

    y += 10;

    addSummaryRow(doc, "Subtotal", `${cur} ${Number(data.subtotal).toLocaleString()}`, y); y += 16;
    addSummaryRow(doc, "Tax", `${cur} ${Number(data.tax).toLocaleString()}`, y); y += 16;

    doc.strokeColor("#1848CC").lineWidth(1).moveTo(350, y).lineTo(545, y).stroke(); y += 8;
    addSummaryRow(doc, "TOTAL", `${cur} ${Number(data.total).toLocaleString()}`, y, true); y += 24;

    doc.fontSize(FONT_SIZE_BODY).font("Helvetica-Bold").fillColor("#111827").text("Payment Information", 50, y); y += 14;
    doc.font("Helvetica").fontSize(FONT_SIZE_SMALL).fillColor("#64748B");
    doc.text(`Due Date: ${dueStr}`, 50, y); y += 12;
    doc.text(`Payment Terms: ${data.paymentTerms || "Upon receipt"}`, 50, y); y += 12;
    doc.text(`Bank: Zenith Bank Ghana`, 50, y); y += 12;
    doc.text(`Account Name: Bali-Can Limited`, 50, y); y += 12;
    doc.text(`Account Number: 6010001234`, 50, y); y += 12;
    y += 8;

    if (data.notes) {
      doc.fontSize(FONT_SIZE_BODY).font("Helvetica-Bold").fillColor("#111827").text("Notes:", 50, y); y += 14;
      doc.font("Helvetica").fontSize(FONT_SIZE_SMALL).fillColor("#64748B").text(data.notes, 50, y, { width: 495 });
    }

    doc.end();
  });
}
