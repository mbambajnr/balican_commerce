import fs from "fs";
import path from "path";
import { MIGRATIONS } from "../config/migrate-all";

describe("database migration runner", () => {
  test("includes every PostgreSQL migration exactly once", () => {
    const configDir = path.resolve(__dirname, "../config");
    const sourceMigrations = fs.readdirSync(configDir)
      .filter((name) => /^migrate(?:-.+)?\.ts$/.test(name))
      .filter((name) => name !== "migrate-all.ts" && name !== "migrate-es.ts")
      .map((name) => name.replace(/\.ts$/, ".js"))
      .sort();

    expect([...new Set(MIGRATIONS)].sort()).toEqual(sourceMigrations);
    expect(new Set(MIGRATIONS).size).toBe(MIGRATIONS.length);
  });

  test("places prerequisite schemas before dependent migrations", () => {
    const position = (name: string) => MIGRATIONS.indexOf(name as (typeof MIGRATIONS)[number]);

    expect(position("migrate-b2b-companies.js")).toBeLessThan(position("migrate-marketplace.js"));
    expect(position("migrate-quotations.js")).toBeLessThan(position("migrate-invoices.js"));
    expect(position("migrate-quotations.js")).toBeLessThan(position("migrate-bookings.js"));
    expect(position("migrate-company-vetting.js")).toBeLessThan(position("migrate-vetting-docs.js"));
    expect(position("migrate-scout.js")).toBeLessThan(position("migrate-agreements.js"));
    expect(position("migrate-procurement-requests.js")).toBeLessThan(position("migrate-procurement-orders.js"));
  });

  test("catalog migration creates the product columns required by its seed", () => {
    const migration = fs.readFileSync(
      path.resolve(__dirname, "../config/migrate-catalog.ts"),
      "utf8"
    );

    expect(migration).toContain("ADD COLUMN IF NOT EXISTS sku VARCHAR(100)");
  });
});
