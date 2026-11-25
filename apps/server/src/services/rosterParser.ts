// ============================================================
// SecureAssess — Roster File Parser (CSV, XLSX, PDF)
// ============================================================

import { parse as parseCsv } from "csv-parse/sync";
import * as XLSX from "xlsx";

interface RosterEntry {
  fullName: string;
  registerNumber: string;
  year: string;
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[\s_\-]/g, "");
}

function mapRow(row: Record<string, string>): RosterEntry | null {
  const keys = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [normalizeHeader(k), String(v ?? "").trim()])
  );

  const fullName =
    keys["fullname"] ?? keys["name"] ?? keys["studentname"] ?? "";
  const registerNumber =
    keys["registernumber"] ?? keys["rollnumber"] ?? keys["regno"] ?? keys["roll"] ?? keys["id"] ?? "";
  const year =
    keys["year"] ?? keys["yearcourse"] ?? keys["class"] ?? "1";

  if (!fullName || !registerNumber) return null;
  return { fullName, registerNumber, year };
}

export async function parseRosterFile(
  buffer: Buffer,
  filename: string
): Promise<RosterEntry[]> {
  const ext = filename.toLowerCase().split(".").pop();

  if (ext === "csv") {
    const records = parseCsv(buffer.toString("utf-8"), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];
    return records.map(mapRow).filter((r): r is RosterEntry => r !== null);
  }

  if (ext === "xlsx" || ext === "xls") {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]!]!;
    const records = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "" });
    return records.map(mapRow).filter((r): r is RosterEntry => r !== null);
  }

  throw new Error(`Unsupported roster file format: .${ext}. Use CSV or XLSX.`);
}
