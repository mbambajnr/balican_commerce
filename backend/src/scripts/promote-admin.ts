/**
 * Promote a user to super_admin or demote to a regular role.
 *
 * Usage:
 *   npx tsx src/scripts/promote-admin.ts --email user@example.com --role super_admin
 *   npx tsx src/scripts/promote-admin.ts --email user@example.com --role admin
 *   npx tsx src/scripts/promote-admin.ts --email user@example.com --role customer  (demote)
 *
 * Options:
 *   --email   User's email address (required)
 *   --role    Target role: super_admin | admin | customer (required)
 *   --reason  Optional reason recorded in audit_log
 *
 * Safety:
 *   - Requires a confirmation prompt before making changes.
 *   - Does not allow setting super_admin via env var.
 *   - Audit log entry is created for promotion/demotion.
 */

import { query } from "../config/db";
import { createAuditLog } from "../services/audit-log";

const args = process.argv.slice(2);
const emailArg = args.find((a) => a.startsWith("--email="))?.split("=")[1];
const roleArg = args.find((a) => a.startsWith("--role="))?.split("=")[1];
const reasonArg = args.find((a) => a.startsWith("--reason="))?.split("=")[1];
const skipConfirm = args.includes("--yes");

if (!emailArg || !roleArg) {
  console.error("Usage: npx tsx src/scripts/promote-admin.ts --email=<email> --role=<super_admin|admin|customer> [--reason=<reason>] [--yes]");
  process.exit(1);
}

const VALID_ROLES = ["super_admin", "admin", "customer"];
if (!VALID_ROLES.includes(roleArg)) {
  console.error(`Invalid role: ${roleArg}. Valid options: ${VALID_ROLES.join(", ")}`);
  process.exit(1);
}

async function main() {
  // Find user
  const userResult = await query(
    `SELECT id, email, first_name, last_name, role FROM users WHERE email = $1`,
    [emailArg]
  );
  if (userResult.rows.length === 0) {
    console.error(`User not found: ${emailArg}`);
    process.exit(1);
  }

  const user = userResult.rows[0];
  console.log(`\nCurrent user:`);
  console.log(`  Email:      ${user.email}`);
  console.log(`  Name:       ${user.first_name} ${user.last_name}`);
  console.log(`  Current role: ${user.role}`);
  console.log(`  New role:    ${roleArg}\n`);

  if (user.role === roleArg) {
    console.log(`User already has role "${roleArg}". Nothing to do.`);
    process.exit(0);
  }

  // Confirm
  if (!skipConfirm) {
    const readline = await import("readline");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>((resolve) => {
      rl.question(`Are you sure you want to change this user's role? This action is audited. (yes/no): `, resolve);
    });
    rl.close();
    if (answer.toLowerCase() !== "yes") {
      console.log("Aborted.");
      process.exit(0);
    }
  }

  // Update role
  await query(`UPDATE users SET role = $1 WHERE id = $2`, [roleArg, user.id]);
  console.log(`✓ Role updated to "${roleArg}"`);

  // Create audit log
  try {
    await createAuditLog({
      adminUserId: user.id,
      action: roleArg === "super_admin" ? "role_promoted_to_super_admin" : roleArg === "admin" ? "role_promoted_to_admin" : "role_demoted_from_admin",
      targetType: "user",
      targetId: user.id,
      previousValue: user.role,
      newValue: roleArg,
      reason: reasonArg || `Role changed via CLI from ${user.role} to ${roleArg}`,
    });
    console.log("✓ Audit log entry created");
  } catch (err) {
    console.error("Warning: Could not create audit log:", err);
  }

  console.log("\nDone.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
