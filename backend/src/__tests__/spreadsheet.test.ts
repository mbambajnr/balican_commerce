import {
  parseSpreadsheet,
  SpreadsheetParseError,
  SPREADSHEET_MAX_FILE_SIZE,
  SPREADSHEET_MAX_ROWS,
} from "../services/spreadsheet";

function csvFile(contents: string, overrides: Partial<Express.Multer.File> = {}) {
  const buffer = Buffer.from(contents);
  return {
    buffer,
    originalname: "orders.csv",
    mimetype: "text/csv",
    size: buffer.length,
    ...overrides,
  } as Express.Multer.File;
}

describe("spreadsheet parsing", () => {
  test("parses CSV rows into normalized objects", async () => {
    await expect(parseSpreadsheet(csvFile("sku,quantity\nSKU-1,2\nSKU-2,3\n"))).resolves.toEqual([
      { sku: "SKU-1", quantity: "2" },
      { sku: "SKU-2", quantity: "3" },
    ]);
  });

  test("rejects legacy XLS files", async () => {
    await expect(parseSpreadsheet(csvFile("sku,quantity\nSKU-1,2", {
      originalname: "orders.xls",
      mimetype: "application/vnd.ms-excel",
    }))).rejects.toThrow("Only CSV and XLSX files are supported");
  });

  test("rejects spoofed XLSX files", async () => {
    await expect(parseSpreadsheet(csvFile("not a zip", {
      originalname: "orders.xlsx",
      mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }))).rejects.toThrow("valid ZIP signature");
  });

  test("rejects files over the compressed size limit", async () => {
    await expect(parseSpreadsheet(csvFile("sku,quantity", {
      size: SPREADSHEET_MAX_FILE_SIZE + 1,
    }))).rejects.toThrow("5 MB");
  });

  test("rejects more than the maximum data rows", async () => {
    const rows = Array.from({ length: SPREADSHEET_MAX_ROWS + 1 }, (_, index) => `SKU-${index},1`);
    await expect(parseSpreadsheet(csvFile(`sku,quantity\n${rows.join("\n")}`)))
      .rejects.toBeInstanceOf(SpreadsheetParseError);
  });

  test("rejects duplicate headers case-insensitively", async () => {
    await expect(parseSpreadsheet(csvFile("sku,SKU\nA,B\n")))
      .rejects.toThrow("duplicate column headers");
  });
});
