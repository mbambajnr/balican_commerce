import request from "supertest";
import app from "../app";
import { query } from "../config/db";
import { trackFunnelEvent } from "../services/funnel-events";
import {
  createTestCategory,
  createTestCompany,
  createTestProduct,
  createTestUserFast,
  generateToken,
  makeEmail,
  makeUnique,
} from "./helpers";

let buyerToken: string;
let providerToken: string;
let buyerCompanyId: string;
let providerCompanyId: string;
let buyerUserId: string;
let providerUserId: string;
let categoryId: string;
let productId: string;
let requestId: string;
let quoteId: string;

const waitForEvents = async () => new Promise((resolve) => setTimeout(resolve, 120));

beforeAll(async () => {
  const category = await createTestCategory(makeUnique("Funnel Category"));
  categoryId = category.id;
  const buyerCompany = await createTestCompany(makeUnique("Funnel Buyer"));
  buyerCompanyId = buyerCompany.id;
  const providerCompany = await createTestCompany(makeUnique("Funnel Provider"));
  providerCompanyId = providerCompany.id;
  await query(
    "UPDATE companies SET is_provider = true, verification_status = 'approved', status = 'active' WHERE id = $1",
    [providerCompanyId]
  );
  const buyer = await createTestUserFast({ email: makeEmail(`funnel-buyer-${Date.now()}`), companyId: buyerCompanyId });
  const provider = await createTestUserFast({ email: makeEmail(`funnel-provider-${Date.now()}`), companyId: providerCompanyId });
  buyerUserId = buyer.id;
  providerUserId = provider.id;
  buyerToken = generateToken(buyer.id, "customer");
  providerToken = generateToken(provider.id, "customer");
  const product = await createTestProduct({ name: makeUnique("Funnel Product"), categoryId });
  productId = product.id;
  await query("UPDATE products SET provider_company_id = $1 WHERE id = $2", [providerCompanyId, productId]);
});

afterAll(async () => {
  await query("DELETE FROM funnel_events WHERE company_id = ANY($1)", [[buyerCompanyId, providerCompanyId]]).catch(() => {});
  await query("DELETE FROM email_logs WHERE entity_id = $1", [requestId]).catch(() => {});
  await query("DELETE FROM notifications WHERE metadata->>'requestId' = $1", [requestId]).catch(() => {});
  await query("DELETE FROM scout_agreements WHERE scout_request_id = $1", [requestId]).catch(() => {});
  await query("DELETE FROM scout_quotes WHERE request_id = $1", [requestId]).catch(() => {});
  await query("DELETE FROM scout_requests WHERE id = $1", [requestId]).catch(() => {});
  await query("DELETE FROM products WHERE id = $1", [productId]).catch(() => {});
  await query("DELETE FROM users WHERE id = ANY($1)", [[buyerUserId, providerUserId]]).catch(() => {});
  await query("DELETE FROM companies WHERE id = ANY($1)", [[buyerCompanyId, providerCompanyId]]).catch(() => {});
  await query("DELETE FROM categories WHERE id = $1", [categoryId]).catch(() => {});
});

test("tracks each request-to-agreement action exactly once", async () => {
  const created = await request(app)
    .post("/api/scout/requests")
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({ title: "Funnel sourcing request", quantity: 1, categoryId, requestType: "product" });
  expect(created.status).toBe(201);
  requestId = created.body.request.id;

  await request(app).get(`/api/provider/opportunities/${requestId}`).set("Authorization", `Bearer ${providerToken}`);
  await request(app).get(`/api/provider/opportunities/${requestId}`).set("Authorization", `Bearer ${providerToken}`);

  const proposal = await request(app)
    .post(`/api/provider/opportunities/${requestId}/proposals`)
    .set("Authorization", `Bearer ${providerToken}`)
    .send({ amount: 500, proposalText: "We can supply this requirement promptly." });
  expect(proposal.status).toBe(201);
  quoteId = proposal.body.proposal.id;
  await request(app)
    .post(`/api/provider/opportunities/${requestId}/proposals`)
    .set("Authorization", `Bearer ${providerToken}`)
    .send({ amount: 525, proposalText: "Updated terms for the same requirement." });

  const accepted = await request(app)
    .post(`/api/scout/proposals/${quoteId}/accept`)
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({});
  expect(accepted.status).toBe(201);
  await waitForEvents();

  const events = await query(
    `SELECT event_name, COUNT(*)::int AS count FROM funnel_events
     WHERE company_id = ANY($1) GROUP BY event_name`,
    [[buyerCompanyId, providerCompanyId]]
  );
  const counts = Object.fromEntries(events.rows.map((row) => [row.event_name, row.count]));
  expect(counts.company_activated).toBe(2);
  expect(counts.sourcing_request_created).toBe(1);
  expect(counts.opportunity_viewed).toBe(1);
  expect(counts.supplier_responded).toBe(1);
  expect(counts.proposal_accepted).toBe(1);
  expect(counts.agreement_signed).toBe(1);
});

test("tracking failures are isolated and event keys are idempotent", async () => {
  const eventKey = `test-idempotent:${Date.now()}`;
  expect(await trackFunnelEvent({
    eventName: "opportunity_viewed",
    eventKey,
    companyId: providerCompanyId,
    userId: providerUserId,
    entityType: "company",
    entityId: providerCompanyId,
  })).toBe(true);
  expect(await trackFunnelEvent({
    eventName: "opportunity_viewed",
    eventKey,
    companyId: providerCompanyId,
    userId: providerUserId,
    entityType: "company",
    entityId: providerCompanyId,
  })).toBe(false);

  await expect(trackFunnelEvent({
    eventName: "opportunity_viewed",
    eventKey: `invalid:${Date.now()}`,
    companyId: "not-a-uuid",
    entityType: "company",
  })).resolves.toBe(false);
});
