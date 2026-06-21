export type OrderLifecycleAction = "advance" | "complete" | "cancel";
export type OrderLifecycleRole = "admin" | "supplier" | "buyer";

interface LifecycleTransitionInput {
  currentStatus: string;
  action: OrderLifecycleAction;
  note?: string;
  isBuyer: boolean;
  isSupplier: boolean;
  isAdmin: boolean;
}

interface LifecycleTransitionSuccess {
  ok: true;
  newStatus: string;
  role: OrderLifecycleRole;
}

interface LifecycleTransitionFailure {
  ok: false;
  status: 400 | 403;
  body: { error: string; currentStatus?: string };
}

export type LifecycleTransitionResult = LifecycleTransitionSuccess | LifecycleTransitionFailure;

const SUPPLIER_FORWARD_TRANSITIONS: Record<string, string> = {
  pending: "confirmed",
  confirmed: "processing",
  processing: "ready_or_shipped",
  ready_or_shipped: "delivered",
};

const SUPPLIER_CANCEL_FROM = ["pending", "confirmed", "processing"];
const BUYER_CANCEL_FROM = ["pending"];

export const VALID_SERVICE_STATUSES = [
  "requested",
  "scheduled",
  "assigned",
  "in_progress",
  "completed",
  "cancelled",
] as const;

export function generateOrderNumber(now = Date.now(), random = Math.random()) {
  return `ORD-${now.toString(36).toUpperCase()}-${random.toString(36).substring(2, 6).toUpperCase()}`;
}

export function generateInvoiceNumber(now = Date.now(), random = Math.random()) {
  return `INV-${now.toString(36).toUpperCase()}-${random.toString(36).substring(2, 6).toUpperCase()}`;
}

export function validatePaystackPayment(
  total: number,
  receivedAmount: unknown,
  receivedCurrency: unknown,
  expectedCurrency: string,
) {
  const expectedAmount = Math.round(total * 100);
  return {
    expectedAmount,
    amountMatches: Number.isInteger(receivedAmount) && receivedAmount === expectedAmount,
    currencyMatches: receivedCurrency === expectedCurrency,
  };
}

export function calculatePaymentApplication(total: number, previouslyPaid: number, amount: number) {
  const amountPaid = previouslyPaid + amount;
  const outstandingAmount = Math.max(0, total - amountPaid);

  return {
    amountPaid,
    outstandingAmount,
    exceedsTotal: amountPaid > total,
    paymentStatus: outstandingAmount <= 0 ? "paid" : "partially_paid",
  } as const;
}

export function resolveLifecycleTransition(input: LifecycleTransitionInput): LifecycleTransitionResult {
  const { currentStatus, action, note, isBuyer, isSupplier, isAdmin } = input;

  if (currentStatus === "completed") {
    return { ok: false, status: 400, body: { error: "Completed orders cannot be changed" } };
  }
  if (currentStatus === "cancelled") {
    return { ok: false, status: 400, body: { error: "Cancelled orders cannot be changed" } };
  }

  let newStatus: string | undefined;

  if (action === "advance") {
    if (!isSupplier && !isAdmin) {
      return { ok: false, status: 403, body: { error: "Only the supplier can advance order status" } };
    }
    newStatus = SUPPLIER_FORWARD_TRANSITIONS[currentStatus];
    if (!newStatus) {
      return {
        ok: false,
        status: 400,
        body: { error: `Cannot advance from status "${currentStatus}"`, currentStatus },
      };
    }
  } else if (action === "complete") {
    if (!isBuyer && !isAdmin) {
      return { ok: false, status: 403, body: { error: "Only the buyer can mark an order as completed" } };
    }
    if (currentStatus !== "delivered") {
      return {
        ok: false,
        status: 400,
        body: { error: "Order must be in 'delivered' status to mark as completed", currentStatus },
      };
    }
    newStatus = "completed";
  } else if (action === "cancel") {
    if (!note?.trim()) {
      return { ok: false, status: 400, body: { error: "Reason is required for cancellation" } };
    }
    if (isSupplier || isAdmin) {
      if (!SUPPLIER_CANCEL_FROM.includes(currentStatus)) {
        return {
          ok: false,
          status: 400,
          body: { error: `Supplier cannot cancel an order in "${currentStatus}" status`, currentStatus },
        };
      }
    } else if (isBuyer && !BUYER_CANCEL_FROM.includes(currentStatus)) {
      return {
        ok: false,
        status: 400,
        body: { error: "Buyer can only cancel orders that are still pending", currentStatus },
      };
    }
    newStatus = "cancelled";
  }

  if (!newStatus) {
    return { ok: false, status: 400, body: { error: "Invalid action" } };
  }

  return {
    ok: true,
    newStatus,
    role: isAdmin ? "admin" : isSupplier ? "supplier" : "buyer",
  };
}
