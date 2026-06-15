import path from "path";
import { parse } from "csv-parse/sync";
import { readSheet } from "read-excel-file/node";

export const SPREADSHEET_MAX_FILE_SIZE = 5 * 1024 * 1024;
export const SPREADSHEET_MAX_ROWS = 1000;
const SPREADSHEET_MAX_COLUMNS = 50;
const SPREADSHEET_MAX_CELL_LENGTH = 10_000;
const XLSX_MAX_UNCOMPRESSED_SIZE = 25 * 1024 * 1024;
const XLSX_MAX_ENTRIES = 2_000;

export class SpreadsheetParseError extends Error {}

type CellValue = string | number | boolean | Date | null;

export async function parseSpreadsheet(
  file: Pick<Express.Multer.File, "buffer" | "originalname" | "mimetype" | "size">
): Promise<Record<string, string>[]> {
  if (file.size > SPREADSHEET_MAX_FILE_SIZE) {
    throw new SpreadsheetParseError("Spreadsheet exceeds the 5 MB size limit");
  }

  const extension = path.extname(file.originalname).toLowerCase();
  let data: CellValue[][];

  if (extension === ".csv") {
    validateCsvType(file.mimetype);
    data = parseCsv(file.buffer);
  } else if (extension === ".xlsx") {
    validateXlsxType(file.mimetype, file.buffer);
    validateXlsxArchive(file.buffer);
    try {
      data = await readSheet(file.buffer) as CellValue[][];
    } catch {
      throw new SpreadsheetParseError("Invalid or unsupported XLSX file");
    }
  } else {
    throw new SpreadsheetParseError("Only CSV and XLSX files are supported");
  }

  return rowsToObjects(data);
}

function validateCsvType(mimeType: string): void {
  const allowed = ["text/csv", "application/csv", "text/plain", "application/vnd.ms-excel"];
  if (mimeType && !allowed.includes(mimeType)) {
    throw new SpreadsheetParseError("File content type does not match CSV");
  }
}

function validateXlsxType(mimeType: string, buffer: Buffer): void {
  const allowed = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/zip",
    "application/octet-stream",
  ];
  if (mimeType && !allowed.includes(mimeType)) {
    throw new SpreadsheetParseError("File content type does not match XLSX");
  }
  if (buffer.length < 4 || buffer.readUInt32LE(0) !== 0x04034b50) {
    throw new SpreadsheetParseError("XLSX file does not have a valid ZIP signature");
  }
}

function validateXlsxArchive(buffer: Buffer): void {
  let offset = 0;
  let entries = 0;
  let uncompressedSize = 0;

  while (offset <= buffer.length - 46) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      offset++;
      continue;
    }

    entries++;
    uncompressedSize += buffer.readUInt32LE(offset + 24);
    if (entries > XLSX_MAX_ENTRIES || uncompressedSize > XLSX_MAX_UNCOMPRESSED_SIZE) {
      throw new SpreadsheetParseError("XLSX archive expands beyond the allowed limit");
    }

    const filenameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    offset += 46 + filenameLength + extraLength + commentLength;
  }

  if (entries === 0) {
    throw new SpreadsheetParseError("XLSX archive directory is missing");
  }
}

function parseCsv(buffer: Buffer): CellValue[][] {
  try {
    return parse(buffer, {
      bom: true,
      relax_column_count: false,
      skip_empty_lines: true,
      trim: true,
      max_record_size: SPREADSHEET_MAX_COLUMNS * SPREADSHEET_MAX_CELL_LENGTH,
      to: SPREADSHEET_MAX_ROWS + 2,
    }) as CellValue[][];
  } catch {
    throw new SpreadsheetParseError("Invalid CSV file");
  }
}

function rowsToObjects(data: CellValue[][]): Record<string, string>[] {
  if (data.length === 0) return [];
  if (data.length > SPREADSHEET_MAX_ROWS + 1) {
    throw new SpreadsheetParseError(`Spreadsheet cannot contain more than ${SPREADSHEET_MAX_ROWS} data rows`);
  }

  const headers = data[0].map((value) => cellToString(value).trim());
  if (headers.length === 0 || headers.every((header) => !header)) {
    throw new SpreadsheetParseError("Spreadsheet header row is empty");
  }
  if (headers.length > SPREADSHEET_MAX_COLUMNS) {
    throw new SpreadsheetParseError(`Spreadsheet cannot contain more than ${SPREADSHEET_MAX_COLUMNS} columns`);
  }
  if (headers.some((header) => !header)) {
    throw new SpreadsheetParseError("Spreadsheet contains an empty column header");
  }
  if (new Set(headers.map((header) => header.toLowerCase())).size !== headers.length) {
    throw new SpreadsheetParseError("Spreadsheet contains duplicate column headers");
  }

  return data.slice(1).map((row) => {
    if (row.length > SPREADSHEET_MAX_COLUMNS) {
      throw new SpreadsheetParseError(`Spreadsheet cannot contain more than ${SPREADSHEET_MAX_COLUMNS} columns`);
    }
    const object: Record<string, string> = {};
    headers.forEach((header, index) => {
      const value = cellToString(row[index] ?? null);
      if (value.length > SPREADSHEET_MAX_CELL_LENGTH) {
        throw new SpreadsheetParseError(`A spreadsheet cell exceeds ${SPREADSHEET_MAX_CELL_LENGTH} characters`);
      }
      object[header] = value;
    });
    return object;
  });
}

function cellToString(value: CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}
