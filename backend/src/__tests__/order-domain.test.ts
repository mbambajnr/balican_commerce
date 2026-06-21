import {
  calculatePaymentApplication,
  generateInvoiceNumber,
  generateOrderNumber,
  resolveLifecycleTransition,
  validatePaystackPayment,
  VALID_SERVICE_STATUSES,
} from "../services/order-domain";

describe("order-domain", () => {
  describe("reference generation", () => {
    it("preserves the existing order and invoice number formats", () => {
      expect(generateOrderNumber(1_700_000_000_000, 0.123456)).toMatch(/^ORD-[A-Z0-9]+-[A-Z0-9]{4}$/);
      expect(generateInvoiceNumber(1_700_000_000_000, 0.654321)).toMatch(/^INV-[A-Z0-9]+-[A-Z0-9]{4}$/);
    });
  });

  describe("Paystack validation", () => {
    it("accepts only the exact integer amount and currency", () => {
      expect(validatePaystackPayment(500, 50_000, "GHS", "GHS")).toEqual({
        expectedAmount: 50_000,
        amountMatches: true,
        currencyMatches: true,
      });
      expect(validatePaystackPayment(500, 49_999, "GHS", "GHS").amountMatches).toBe(false);
      expect(validatePaystackPayment(500, 50_000.5, "GHS", "GHS").amountMatches).toBe(false);
      expect(validatePaystackPayment(500, 50_000, "USD", "GHS").currencyMatches).toBe(false);
    });

    it("rounds decimal totals to the smallest currency unit", () => {
      expect(validatePaystackPayment(10.235, 1_024, "GHS", "GHS").expectedAmount).toBe(1_024);
    });
  });

  describe("payment application", () => {
    it("calculates partial, full, and excessive payments", () => {
      expect(calculatePaymentApplication(1_000, 100, 400)).toEqual({
        amountPaid: 500,
        outstandingAmount: 500,
        exceedsTotal: false,
        paymentStatus: "partially_paid",
      });
      expect(calculatePaymentApplication(1_000, 500, 500)).toEqual({
        amountPaid: 1_000,
        outstandingAmount: 0,
        exceedsTotal: false,
        paymentStatus: "paid",
      });
      expect(calculatePaymentApplication(1_000, 900, 200)).toEqual({
        amountPaid: 1_100,
        outstandingAmount: 0,
        exceedsTotal: true,
        paymentStatus: "paid",
      });
    });
  });

  describe("lifecycle transitions", () => {
    const supplier = { isBuyer: false, isSupplier: true, isAdmin: false };
    const buyer = { isBuyer: true, isSupplier: false, isAdmin: false };
    const admin = { isBuyer: false, isSupplier: false, isAdmin: true };

    it.each([
      ["pending", "confirmed"],
      ["confirmed", "processing"],
      ["processing", "ready_or_shipped"],
      ["ready_or_shipped", "delivered"],
    ])("advances suppliers from %s to %s", (currentStatus, newStatus) => {
      expect(resolveLifecycleTransition({ currentStatus, action: "advance", ...supplier })).toEqual({
        ok: true,
        newStatus,
        role: "supplier",
      });
    });

    it("allows only a buyer or admin to complete a delivered order", () => {
      expect(resolveLifecycleTransition({ currentStatus: "delivered", action: "complete", ...buyer })).toEqual({
        ok: true,
        newStatus: "completed",
        role: "buyer",
      });
      expect(resolveLifecycleTransition({ currentStatus: "delivered", action: "complete", ...admin })).toEqual({
        ok: true,
        newStatus: "completed",
        role: "admin",
      });
      expect(resolveLifecycleTransition({ currentStatus: "delivered", action: "complete", ...supplier })).toMatchObject({
        ok: false,
        status: 403,
      });
    });

    it("preserves cancellation permissions and messages", () => {
      expect(resolveLifecycleTransition({ currentStatus: "pending", action: "cancel", note: "Changed", ...buyer })).toMatchObject({
        ok: true,
        newStatus: "cancelled",
      });
      expect(resolveLifecycleTransition({ currentStatus: "confirmed", action: "cancel", note: "Changed", ...buyer })).toEqual({
        ok: false,
        status: 400,
        body: { error: "Buyer can only cancel orders that are still pending", currentStatus: "confirmed" },
      });
      expect(resolveLifecycleTransition({ currentStatus: "confirmed", action: "cancel", note: "No stock", ...supplier })).toMatchObject({
        ok: true,
        newStatus: "cancelled",
      });
      expect(resolveLifecycleTransition({ currentStatus: "pending", action: "cancel", ...buyer })).toEqual({
        ok: false,
        status: 400,
        body: { error: "Reason is required for cancellation" },
      });
    });

    it.each(["completed", "cancelled"])("rejects changes to final status %s", (currentStatus) => {
      expect(resolveLifecycleTransition({ currentStatus, action: "advance", ...supplier })).toMatchObject({
        ok: false,
        status: 400,
      });
    });
  });

  it("exports the unchanged service status vocabulary", () => {
    expect(VALID_SERVICE_STATUSES).toEqual([
      "requested",
      "scheduled",
      "assigned",
      "in_progress",
      "completed",
      "cancelled",
    ]);
  });
});
