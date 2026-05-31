import { Pool, PoolClient } from "pg";
import { config } from "./index";

export const pool = new Pool({
  connectionString: config.database.connectionString,
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err);
  process.exit(-1);
});

export async function query(text: string, params?: any[]) {
  const res = await pool.query(text, params);
  return res;
}

export type TransactionClient = PoolClient;

export async function transaction<T>(fn: (client: TransactionClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
