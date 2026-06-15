import { pool } from "../config/db";
import { MIGRATIONS } from "../config/migrate-all";
import { getStorageDriver } from "./storage";

type CheckStatus = "ok" | "error";

export interface ReadinessResult {
  ready: boolean;
  checks: {
    database: CheckStatus;
    schema: CheckStatus;
    storage: CheckStatus;
  };
}

export async function checkReadiness(): Promise<ReadinessResult> {
  const checks: ReadinessResult["checks"] = {
    database: "error",
    schema: "error",
    storage: "error",
  };

  try {
    await pool.query("SELECT 1");
    checks.database = "ok";
  } catch {
    checks.database = "error";
  }

  if (checks.database === "ok") {
    try {
      const applied = await pool.query<{ name: string }>(
        "SELECT name FROM schema_migrations WHERE name = ANY($1::text[])",
        [[...MIGRATIONS]]
      );
      const appliedNames = new Set(applied.rows.map((row) => row.name));
      checks.schema = MIGRATIONS.every((name) => appliedNames.has(name)) ? "ok" : "error";
    } catch {
      checks.schema = "error";
    }
  }

  try {
    await getStorageDriver().checkReadiness();
    checks.storage = "ok";
  } catch {
    checks.storage = "error";
  }

  return {
    ready: Object.values(checks).every((status) => status === "ok"),
    checks,
  };
}
