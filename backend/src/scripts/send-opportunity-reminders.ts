import { pool } from "../config/db";
import { dispatchDueOpportunityReminders } from "../services/opportunity-notifications";

async function run() {
  const result = await dispatchDueOpportunityReminders();
  console.log(JSON.stringify(result));
}

run()
  .catch((err) => {
    console.error("Opportunity reminder job failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
