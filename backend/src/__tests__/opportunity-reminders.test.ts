import request from "supertest";
import app from "../app";
import { query } from "../config/db";
import { sendEmail } from "../services/email";
import {
  createTestCategory,
  createTestCompany,
  createTestProduct,
  createTestUserFast,
  generateToken,
  makeEmail,
  makeUnique,
} from "./helpers";

jest.mock("../services/email", () => ({
  sendEmail: jest.fn().mockResolvedValue({ success: true, data: { id: "reminder-email" } }),
}));

const mockSendEmail = sendEmail as jest.Mock;

let adminToken: string;
let buyerToken: string;
let buyerCompanyId: string;
let matchingCompanyId: string;
let matchingUserId: string;
let matchingUserEmail: string;
let wrongCategoryUserId: string;
let categoryId: string;
let otherCategoryId: string;
const requestIds: string[] = [];
const productIds: string[] = [];
const companyIds: string[] = [];
const userIds: string[] = [];

async function createScoutRequest(overrides: {
  status?: "open" | "cancelled" | "expired";
  categoryId?: string;
  age?: string;
  deliveryDate?: string;
  title?: string;
} = {}) {
  const result = await query(
    `INSERT INTO scout_requests
       (company_id, created_by, title, quantity, status, category_id, request_type,
        created_at, desired_delivery_date)
     VALUES ($1, $2, $3, 1, $4, $5, 'product', NOW() - $6::interval, $7::date)
     RETURNING id`,
    [
      buyerCompanyId,
      userIds[0],
      overrides.title || makeUnique("Reminder request"),
      overrides.status || "open",
      overrides.categoryId || categoryId,
      overrides.age || "25 hours",
      overrides.deliveryDate || null,
    ]
  );
  requestIds.push(result.rows[0].id);
  return result.rows[0].id as string;
}

beforeAll(async () => {
  const category = await createTestCategory(makeUnique("Reminder Category"));
  const otherCategory = await createTestCategory(makeUnique("Other Category"));
  categoryId = category.id;
  otherCategoryId = otherCategory.id;

  const buyerCompany = await createTestCompany(makeUnique("Reminder Buyer"));
  buyerCompanyId = buyerCompany.id;
  companyIds.push(buyerCompany.id);
  const buyer = await createTestUserFast({ email: makeEmail(`reminder-buyer-${Date.now()}`), companyId: buyerCompany.id });
  userIds.push(buyer.id);
  buyerToken = generateToken(buyer.id, "customer");

  const matchingCompany = await createTestCompany(makeUnique("Matching Provider"));
  matchingCompanyId = matchingCompany.id;
  companyIds.push(matchingCompany.id);
  await query(
    "UPDATE companies SET is_provider = true, verification_status = 'approved', status = 'active' WHERE id = $1",
    [matchingCompany.id]
  );
  const matchingUser = await createTestUserFast({ email: makeEmail(`matching-provider-${Date.now()}`), companyId: matchingCompany.id });
  const matchingUserTwo = await createTestUserFast({
    email: makeEmail(`matching-provider-two-${Date.now()}`),
    companyId: matchingCompany.id,
    companyRole: "viewer",
  });
  matchingUserId = matchingUser.id;
  matchingUserEmail = matchingUser.email;
  userIds.push(matchingUser.id, matchingUserTwo.id);

  const matchingProduct = await createTestProduct({ name: makeUnique("Matching Product"), categoryId });
  productIds.push(matchingProduct.id);
  await query("UPDATE products SET provider_company_id = $1 WHERE id = $2", [matchingCompany.id, matchingProduct.id]);

  const wrongCompany = await createTestCompany(makeUnique("Wrong Category Provider"));
  companyIds.push(wrongCompany.id);
  await query(
    "UPDATE companies SET is_provider = true, verification_status = 'approved', status = 'active' WHERE id = $1",
    [wrongCompany.id]
  );
  const wrongUser = await createTestUserFast({ email: makeEmail(`wrong-provider-${Date.now()}`), companyId: wrongCompany.id });
  wrongCategoryUserId = wrongUser.id;
  userIds.push(wrongUser.id);
  const wrongProduct = await createTestProduct({ name: makeUnique("Wrong Product"), categoryId: otherCategoryId });
  productIds.push(wrongProduct.id);
  await query("UPDATE products SET provider_company_id = $1 WHERE id = $2", [wrongCompany.id, wrongProduct.id]);

  const admin = await createTestUserFast({ email: makeEmail(`reminder-admin-${Date.now()}`), role: "super_admin" });
  userIds.push(admin.id);
  adminToken = generateToken(admin.id, "super_admin");
});

afterAll(async () => {
  await query("DELETE FROM email_logs WHERE entity_id = ANY($1)", [requestIds]).catch(() => {});
  await query("DELETE FROM notifications WHERE entity_id = ANY($1)", [requestIds]).catch(() => {});
  await query("DELETE FROM notifications WHERE metadata->>'requestId' = ANY($1)", [requestIds]).catch(() => {});
  await query("DELETE FROM scout_quotes WHERE request_id = ANY($1)", [requestIds]).catch(() => {});
  await query("DELETE FROM scout_requests WHERE id = ANY($1)", [requestIds]).catch(() => {});
  await query("DELETE FROM products WHERE id = ANY($1)", [productIds]).catch(() => {});
  await query("DELETE FROM users WHERE id = ANY($1)", [userIds]).catch(() => {});
  await query("DELETE FROM companies WHERE id = ANY($1)", [companyIds]).catch(() => {});
  await query("DELETE FROM categories WHERE id = ANY($1)", [[categoryId, otherCategoryId]]).catch(() => {});
});

beforeEach(() => {
  mockSendEmail.mockClear();
});

test("new Scout requests notify only providers with a matching active catalogue", async () => {
  const response = await request(app)
    .post("/api/scout/requests")
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({ title: "Need matching equipment", quantity: 2, categoryId, requestType: "product" });

  expect(response.status).toBe(201);
  const requestId = response.body.request.id;
  requestIds.push(requestId);

  const matching = await query(
    `SELECT user_id FROM notifications
     WHERE type = 'opportunity.new' AND metadata->>'requestId' = $1
     ORDER BY user_id`,
    [requestId]
  );
  expect(matching.rows.map((row) => row.user_id)).toEqual([matchingUserId]);
  expect(matching.rows.some((row) => row.user_id === wrongCategoryUserId)).toBe(false);

  const emailLog = await query(
    "SELECT status FROM email_logs WHERE entity_id = $1 AND event_type = 'opportunity.new'",
    [requestId]
  );
  expect(emailLog.rows).toHaveLength(1);
  expect(emailLog.rows.every((row) => row.status === "sent")).toBe(true);
});

test("24-hour reminders are category-matched and idempotent", async () => {
  const dueRequestId = await createScoutRequest({ title: "Overdue supplier response" });

  const first = await request(app)
    .post("/api/super-admin/opportunities/send-reminders")
    .set("Authorization", `Bearer ${adminToken}`);
  expect(first.status).toBe(200);

  const remindersAfterFirst = await query(
    `SELECT user_id FROM notifications
     WHERE type = 'opportunity.response_reminder' AND metadata->>'requestId' = $1`,
    [dueRequestId]
  );
  expect(remindersAfterFirst.rows.map((row) => row.user_id)).toEqual([matchingUserId]);
  expect(remindersAfterFirst.rows.some((row) => row.user_id === wrongCategoryUserId)).toBe(false);

  const targetCallsAfterFirst = mockSendEmail.mock.calls.filter((call) =>
    call[0].to === matchingUserEmail && call[0].subject.includes("Overdue supplier response")
  ).length;
  expect(targetCallsAfterFirst).toBe(1);

  const second = await request(app)
    .post("/api/super-admin/opportunities/send-reminders")
    .set("Authorization", `Bearer ${adminToken}`);
  expect(second.status).toBe(200);

  const remindersAfterSecond = await query(
    `SELECT COUNT(*)::int AS count FROM notifications
     WHERE type = 'opportunity.response_reminder' AND metadata->>'requestId' = $1`,
    [dueRequestId]
  );
  expect(remindersAfterSecond.rows[0].count).toBe(1);

  const logs = await query(
    `SELECT COUNT(*)::int AS count FROM email_logs
     WHERE entity_id = $1 AND event_type = 'opportunity.response_reminder'`,
    [dueRequestId]
  );
  expect(logs.rows[0].count).toBe(1);
});

test("reminders skip providers that responded and requests that are closed or expired", async () => {
  const respondedRequestId = await createScoutRequest({ title: "Already answered" });
  await query(
    `INSERT INTO scout_quotes
       (request_id, provider_company_id, submitted_by, quoted_price, status)
     VALUES ($1, $2, $3, 100, 'pending')`,
    [respondedRequestId, matchingCompanyId, matchingUserId]
  );
  const cancelledId = await createScoutRequest({ status: "cancelled", title: "Cancelled request" });
  const expiredId = await createScoutRequest({ status: "expired", title: "Expired request" });
  const pastDeliveryId = await createScoutRequest({ deliveryDate: "2020-01-01", title: "Past delivery request" });

  const response = await request(app)
    .post("/api/super-admin/opportunities/send-reminders")
    .set("Authorization", `Bearer ${adminToken}`);
  expect(response.status).toBe(200);

  const blocked = await query(
    `SELECT metadata->>'requestId' AS request_id FROM notifications
     WHERE type = 'opportunity.response_reminder'
       AND metadata->>'requestId' = ANY($1)`,
    [[respondedRequestId, cancelledId, expiredId, pastDeliveryId]]
  );
  expect(blocked.rows).toHaveLength(0);
});
