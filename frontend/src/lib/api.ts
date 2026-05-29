const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

let _authToken: string | null = null;

export function setApiToken(token: string | null) {
  _authToken = token;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = _authToken || (typeof window !== "undefined" ? localStorage.getItem("token") : null);

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Request failed" }));
    throw new ApiError(res.status, body.error || "Request failed");
  }

  return res.json();
}

export const api = {
  // Auth
  register: (data: { email: string; password: string; firstName: string; lastName: string; phone?: string; companyName?: string; businessType?: string; industry?: string; address?: string; city?: string; state?: string; taxId?: string; businessRegistrationNumber?: string; contactPersonName?: string; contactPersonEmail?: string; contactPersonPhone?: string; requestedPaymentTerms?: string }) =>
    request<{ user: any; token: string; company: any }>("/auth/register", { method: "POST", body: JSON.stringify(data) }),
  login: (data: { email: string; password: string }) =>
    request<{ user: any; token: string }>("/auth/login", { method: "POST", body: JSON.stringify(data) }),
  getMe: () => request<{ user: any }>("/auth/me"),
  updateProfile: (data: any) => request<{ user: any }>("/auth/profile", { method: "PUT", body: JSON.stringify(data) }),

  // Products
  getProducts: (params?: { search?: string; category?: string; page?: string }) => {
    const qs = new URLSearchParams(params as any).toString();
    return request<{ products: any[]; pagination: any }>(`/products${qs ? `?${qs}` : ""}`);
  },
  getProduct: (slug: string) => request<{ product: any }>(`/products/${slug}`),
  getCategories: () => request<{ categories: any[] }>("/products/categories/all"),
  createProduct: (data: any) => request<{ product: any }>("/products", { method: "POST", body: JSON.stringify(data) }),
  updateProduct: (id: string, data: any) =>
    request<{ product: any }>(`/products/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  bulkImport: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const token = _authToken || (typeof window !== "undefined" ? localStorage.getItem("token") : null);
    return fetch(`${API_BASE}/products/bulk-import`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    }).then(async (res) => {
      if (!res.ok) { const err = await res.json().catch(() => ({ error: "Import failed" })); throw new ApiError(res.status, err.error); }
      return res.json() as Promise<{ total: number; created: number; skipped: number; errors: { row: number; message: string }[] }>;
    });
  },
  createCategory: (data: { name: string; description?: string }) =>
    request<{ category: any }>("/products/categories", { method: "POST", body: JSON.stringify(data) }),

  // RFQs
  guestRfq: (data: { companyName: string; contactName: string; email: string; phone: string; address: string; productId: string; productName?: string; productSku?: string; quantity: number; message: string; [key: string]: any }) =>
    request<{ rfq: any }>("/rfqs/guest", { method: "POST", body: JSON.stringify(data) }),
  createRfq: (data: { productId: string; quantity: number; deliveryRequirements?: string; notes?: string; [key: string]: any }) =>
    request<{ rfq: any }>("/rfqs", { method: "POST", body: JSON.stringify(data) }),
  getRfqs: (source?: string) => request<{ rfqs: any[] }>(`/rfqs${source ? `?source=${source}` : ""}`),
  getRfq: (id: string) => request<{ rfq: any }>(`/rfqs/${id}`),
  updateRfqStatus: (id: string, data: { status: string; adminNotes?: string }) =>
    request<{ rfq: any }>(`/rfqs/${id}/status`, { method: "PATCH", body: JSON.stringify(data) }),
  bulkRfq: (data: { items: { productId: string; quantity: number }[]; message?: string; deliveryRequirements?: string; notes?: string; [key: string]: any }) =>
    request<{ rfqs: any[] }>("/rfqs/bulk", { method: "POST", body: JSON.stringify(data) }),
  getSession: () => request<{ user: any }>("/auth/session"),

  // Orders
  createOrder: (data: { items: any[]; subtotal: number; tax: number; total: number; paymentMethod: string; poNumber?: string; notes?: string; idempotencyKey?: string; orderType?: string; utm_source?: string; utm_campaign?: string; utm_medium?: string; order_source?: string }) =>
    request<{ order: any }>("/orders", { method: "POST", body: JSON.stringify(data) }),
  getOrders: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<{ orders: any[]; pagination?: any }>(`/orders${qs}`);
  },
  getOrder: (id: string) => request<{ order: any }>(`/orders/${id}`),
  initPaystack: (id: string, email: string) =>
    request<{ authorizationUrl: string; reference: string }>(`/orders/${id}/paystack-init`, {
      method: "POST", body: JSON.stringify({ email }),
    }),
  updateOrderStatus: (id: string, status: string) =>
    request<{ order: any }>(`/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  getOrderPayments: (id: string) => request<{ payments: any[] }>(`/orders/${id}/payments`),
  recordPayment: (id: string, data: { amount: number; method: string; reference?: string; notes?: string }) =>
    request<{ payment: any }>(`/orders/${id}/payments`, { method: "POST", body: JSON.stringify(data) }),

  // Bookings
  checkEligibility: (orderId: string) => request<{ eligible: boolean; reason?: string }>(`/bookings/eligible/${orderId}`),
  createBooking: (data: any) => request<{ booking: any }>("/bookings", { method: "POST", body: JSON.stringify(data) }),
  getBookings: () => request<{ bookings: any[] }>("/bookings"),
  getBooking: (id: string) => request<{ booking: any }>(`/bookings/${id}`),
  getAdminBookings: (params?: { status?: string; search?: string }) => {
    const qs = new URLSearchParams(params as any).toString();
    return request<{ bookings: any[] }>(`/bookings/admin${qs ? `?${qs}` : ""}`);
  },
  getAdminBooking: (id: string) => request<{ booking: any }>(`/bookings/admin/${id}`),
  updateBookingStatus: (id: string, data: { status: string; cancellationReason?: string }) =>
    request<{ booking: any }>(`/bookings/admin/${id}/status`, { method: "PATCH", body: JSON.stringify(data) }),
  rescheduleBooking: (id: string, data: { preferredDate: string; preferredTime?: string; notes?: string }) =>
    request<{ booking: any }>(`/bookings/admin/${id}/reschedule`, { method: "PATCH", body: JSON.stringify(data) }),
  addBookingNotes: (id: string, data: { adminNotes: string }) =>
    request<{ booking: any }>(`/bookings/admin/${id}/notes`, { method: "POST", body: JSON.stringify(data) }),

  // Admin
  getDashboard: () => request<{ stats: any; recentOrders: any[]; pendingRfqs: any[] }>("/admin/dashboard"),
  getCustomers: (params?: Record<string, string | undefined>) => {
    const qs = new URLSearchParams();
    if (params) Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== "") qs.set(k, v); });
    return request<{ customers: any[]; pagination: any }>(`/admin/customers${qs.toString() ? `?${qs}` : ""}`);
  },
  getCustomer: (id: string) => request<{ customer: any }>(`/admin/customers/${id}`),
  updateCustomer: (id: string, data: any) =>
    request<{ customer: any }>(`/admin/customers/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  updateCreditSettings: (id: string, data: { creditLimit: number; isCreditApproved?: boolean; paymentTermsDays?: number }) =>
    request<{ customer: any }>(`/admin/customers/${id}/credit-settings`, {
      method: "PATCH", body: JSON.stringify(data),
    }),
  getCustomerTimeline: (id: string) => request<{ events: any[] }>(`/admin/customers/${id}/timeline`),
  getCustomerFinancialSummary: (id: string) => request<{ summary: any }>(`/admin/customers/${id}/financial-summary`),
  createCustomer: (data: { email: string; password: string; firstName: string; lastName: string; phone?: string; companyName?: string; creditLimit?: number; isCreditApproved?: boolean; paymentTermsDays?: number }) =>
    request<{ customer: any }>("/admin/customers", {
      method: "POST", body: JSON.stringify(data),
    }),

  // CRM
  getStages: () => request<{ stages: any[] }>("/crm/stages"),
  createStage: (data: { name: string; position?: number; color?: string }) =>
    request<{ stage: any }>("/crm/stages", { method: "POST", body: JSON.stringify(data) }),
  updateStage: (id: string, data: any) =>
    request<{ stage: any }>(`/crm/stages/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  getLeads: (params?: { stage?: string; search?: string; assigned?: string; page?: string }) => {
    const qs = new URLSearchParams(params as any).toString();
    return request<{ leads: any[]; pagination: any }>(`/crm/leads${qs ? `?${qs}` : ""}`);
  },
  createLead: (data: any) => request<{ lead: any }>("/crm/leads", { method: "POST", body: JSON.stringify(data) }),
  getLead: (id: string) => request<{ lead: any }>(`/crm/leads/${id}`),
  updateLead: (id: string, data: any) =>
    request<{ lead: any }>(`/crm/leads/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  updateLeadStage: (id: string, data: { stageId: string; notes?: string }) =>
    request<{ lead: any }>(`/crm/leads/${id}/stage`, { method: "PATCH", body: JSON.stringify(data) }),
  getLeadTimeline: (id: string) => request<{ activities: any[] }>(`/crm/leads/${id}/timeline`),
  createActivity: (leadId: string, data: { type: string; description: string; metadata?: any }) =>
    request<{ activity: any }>(`/crm/leads/${leadId}/activities`, { method: "POST", body: JSON.stringify(data) }),
  getCrmCustomerTimeline: (userId: string) => request<{ timeline: any[] }>(`/crm/customers/${userId}/timeline`),
  getTasks: (params?: { completed?: string; overdue?: string; assignee?: string }) => {
    const qs = new URLSearchParams(params as any).toString();
    return request<{ tasks: any[] }>(`/crm/tasks${qs ? `?${qs}` : ""}`);
  },
  createTask: (data: { leadId?: string; assignedTo?: string; title: string; description?: string; dueDate?: string }) =>
    request<{ task: any }>("/crm/tasks", { method: "POST", body: JSON.stringify(data) }),
  updateTask: (id: string, data: any) =>
    request<{ task: any }>(`/crm/tasks/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  getPipeline: () => request<{ pipeline: any[] }>("/crm/pipeline"),

  // Admin Products
  adminGetProducts: (params?: { search?: string; categoryId?: string; stockStatus?: string; isActive?: string; featured?: string; page?: string; limit?: string; sort?: string; order?: string }) => {
    const qs = new URLSearchParams(params as any).toString();
    return request<{ products: any[]; pagination: any }>(`/admin/products${qs ? `?${qs}` : ""}`);
  },
  adminGetProduct: (id: string) => request<{ product: any }>(`/admin/products/${id}`),
  adminCreateProduct: (data: any) => request<{ product: any }>("/admin/products", { method: "POST", body: JSON.stringify(data) }),
  adminUpdateProduct: (id: string, data: any) =>
    request<{ product: any }>(`/admin/products/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  adminDeleteProduct: (id: string) => request<{ message: string }>(`/admin/products/${id}`, { method: "DELETE" }),

  // Admin Categories
  adminGetCategories: (params?: { search?: string; page?: string; limit?: string }) => {
    const qs = new URLSearchParams(params as any).toString();
    return request<{ categories: any[]; pagination: any }>(`/admin/categories${qs ? `?${qs}` : ""}`);
  },
  adminGetCategoryTree: () =>
    request<{ categories: any[] }>("/admin/categories/tree"),
  adminCreateCategory: (data: { name: string; description?: string; parentId?: string; sortOrder?: number; imageUrl?: string }) =>
    request<{ category: any }>("/admin/categories", { method: "POST", body: JSON.stringify(data) }),
  adminUpdateCategory: (id: string, data: { name?: string; description?: string; slug?: string; parentId?: string | null; sortOrder?: number; isActive?: boolean; imageUrl?: string | null }) =>
    request<{ category: any }>(`/admin/categories/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  // Quotations - Admin
  adminCreateQuotation: (rfqId: string) =>
    request<{ quotation: any }>(`/admin/rfqs/${rfqId}/quotations`, { method: "POST" }),
  adminGetRfqQuotations: (rfqId: string) =>
    request<{ quotations: any[] }>(`/admin/rfqs/${rfqId}/quotations`),
  adminGetQuotations: (params?: { status?: string; search?: string; page?: string; limit?: string }) => {
    const qs = new URLSearchParams(params as any).toString();
    return request<{ quotations: any[]; pagination: any }>(`/admin/quotations${qs ? `?${qs}` : ""}`);
  },
  adminGetQuotation: (id: string) => request<{ quotation: any }>(`/admin/quotations/${id}`),
  adminUpdateQuotation: (id: string, data: any) =>
    request<{ quotation: any }>(`/admin/quotations/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  adminSendQuotation: (id: string) =>
    request<{ quotation: any }>(`/admin/quotations/${id}/send`, { method: "POST" }),
  adminCancelQuotation: (id: string) =>
    request<{ quotation: any }>(`/admin/quotations/${id}/cancel`, { method: "POST" }),
  adminReviseQuotation: (id: string) =>
    request<{ quotation: any }>(`/admin/quotations/${id}/revise`, { method: "POST" }),
  adminExpireOverdueQuotations: () =>
    request<{ expired: number }>("/admin/quotations/expire-overdue", { method: "POST" }),

  // Quotations - Customer
  customerGetQuotations: () => request<{ quotations: any[] }>("/customer/quotations"),
  customerGetQuotation: (id: string) => request<{ quotation: any }>(`/customer/quotations/${id}`),
  customerViewQuotation: (id: string) =>
    request<{ quotation: any }>(`/customer/quotations/${id}/viewed`, { method: "POST" }),
  customerAcceptQuotation: (id: string) =>
    request<{ quotation: any }>(`/customer/quotations/${id}/accept`, { method: "POST" }),
  customerRejectQuotation: (id: string, reason?: string) =>
    request<{ quotation: any }>(`/customer/quotations/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) }),

  // Analytics
  trackSearch: (query: string, resultCount: number) =>
    request("/analytics/track-search", { method: "POST", body: JSON.stringify({ query, resultCount }) }),
  trackView: (productId: string, productName: string) =>
    request("/analytics/track-view", { method: "POST", body: JSON.stringify({ productId, productName }) }),
  getOrdersWithParams: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<{ orders: any[]; pagination: any }>(`/orders${qs}`);
  },
  getPopularSearches: () => request<{ searches: any[] }>("/analytics/popular-searches"),
  getPopularProducts: () => request<{ products: any[] }>("/analytics/popular-products"),
  getSearchVolume: () => request<{ volume: any[] }>("/analytics/search-volume"),

  // Companies (B2B)
  getCompanies: (params?: { search?: string; status?: string; page?: string; limit?: string }) => {
    const qs = new URLSearchParams(params as any).toString();
    return request<{ companies: any[]; pagination: any }>(`/admin/companies${qs ? `?${qs}` : ""}`);
  },
  getCompany: (id: string) => request<{ company: any }>(`/admin/companies/${id}`),
  approveCompany: (id: string, data: { status: string; rejectionReason?: string; customerGroupId?: string; assignedSalesRepId?: string; creditLimit?: number; paymentTermsDays?: number }) =>
    request<{ company: any }>(`/admin/companies/${id}/approve`, { method: "PATCH", body: JSON.stringify(data) }),
  updateCompany: (id: string, data: any) =>
    request<{ company: any }>(`/admin/companies/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  // Customer Groups
  getCustomerGroups: () =>
    request<{ customerGroups: any[] }>("/admin/customer-groups"),
  createCustomerGroup: (data: { name: string; description?: string; minimumOrderAmount?: number; isDefault?: boolean }) =>
    request<{ customerGroup: any }>("/admin/customer-groups", { method: "POST", body: JSON.stringify(data) }),
  updateCustomerGroup: (id: string, data: any) =>
    request<{ customerGroup: any }>(`/admin/customer-groups/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  // Company-Specific Pricing
  getCompanyPrices: (params?: { companyId?: string; productId?: string }) => {
    const qs = new URLSearchParams(params as any).toString();
    return request<{ companyPrices: any[] }>(`/admin/company-prices${qs ? `?${qs}` : ""}`);
  },
  createCompanyPrice: (data: { companyId?: string; customerGroupId?: string; productId: string; price: number; minQuantity?: number }) =>
    request<{ companyPrice: any }>("/admin/company-prices", { method: "POST", body: JSON.stringify(data) }),
  deleteCompanyPrice: (id: string) =>
    request<{ message: string }>(`/admin/company-prices/${id}`, { method: "DELETE" }),

  // Sales Reps
  getSalesReps: () => request<{ salesReps: any[] }>("/admin/sales-reps"),

  // Procurement Lists
  getProcurementLists: (params?: { companyId?: string }) => {
    const qs = new URLSearchParams(params as any).toString();
    return request<{ procurementLists: any[] }>(`/admin/procurement-lists${qs ? `?${qs}` : ""}`);
  },
  getProcurementList: (id: string) => request<{ procurementList: any; items: any[] }>(`/admin/procurement-lists/${id}`),

  // Company Sub-Users
  createCompanyUser: (companyId: string, data: { email: string; password: string; firstName: string; lastName: string; phone?: string; companyRole: string }) =>
    request<{ user: any }>(`/admin/companies/${companyId}/users`, { method: "POST", body: JSON.stringify(data) }),

  // B2B Payments
  adminGetPayments: (params?: { status?: string; method?: string; page?: string; limit?: string }) => {
    const qs = new URLSearchParams(params as any).toString();
    return request<{ payments: any[]; bankTransfers: any[]; pagination: any }>(`/admin/payments${qs ? `?${qs}` : ""}`);
  },
  adminGetPayment: (id: string) => request<{ payment: any }>(`/admin/payments/${id}`),
  adminApproveBankTransfer: (id: string) =>
    request<{ success: boolean; paymentStatus: string; amountPaid: number; outstandingAmount: number }>(
      `/admin/bank-transfers/${id}/approve`, { method: "POST" }),
  adminRejectBankTransfer: (id: string, reason?: string) =>
    request<{ success: boolean }>(`/admin/bank-transfers/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) }),
  adminRecordPayment: (orderId: string, data: { amount: number; method: string; reference?: string; notes?: string }) =>
    request<{ success: boolean; paymentStatus: string; amountPaid: number; outstandingAmount: number }>(
      `/admin/orders/${orderId}/record-payment`, { method: "POST", body: JSON.stringify(data) }),
  adminCheckOverdue: () =>
    request<{ updated: number; orders: any[] }>("/admin/orders/check-overdue", { method: "POST" }),
  adminGetCreditSummary: (customerId: string) =>
    request<{ customer: any; creditOrders: any[] }>(`/admin/customers/${customerId}/credit-summary`),
  adminUpdateCreditSettings: (customerId: string, data: any) =>
    request<{ success: boolean }>(`/admin/customers/${customerId}/credit-settings`, { method: "PATCH", body: JSON.stringify(data) }),

  // Customer billing
  customerGetBilling: () =>
    request<{ billing: any; credit: any; orders: any[]; bankTransfers: any[] }>("/customer/billing"),
  customerGetCreditSummary: () =>
    request<{ isCreditApproved: boolean; creditLimit: number; outstandingBalance: number; availableCredit: number; paymentTermsDays: number; activeOrders: any[]; upcomingPayments: any[]; overdueOrders: any[]; recentPayments: any[] }>("/customer/credit-summary"),
  customerSubmitBankTransfer: (orderId: string, data: { amount: number; bankName?: string; accountName?: string; accountNumber?: string; transferReference: string; proofUrl?: string; notes?: string }) =>
    request<{ bankTransfer: any }>(`/orders/${orderId}/bank-transfer`, { method: "POST", body: JSON.stringify(data) }),

  // Quotation → order conversion
  adminConvertQuotationToOrder: (quotationId: string) =>
    request<{ order: any }>(`/orders/from-quotation/${quotationId}`, { method: "POST" }),

  // Cart
  getCart: () => request<{ cart: any }>("/cart"),
  addCartItem: (data: { productId: string; variantId?: string; quantity?: number }) =>
    request<{ cart: any }>("/cart/items", { method: "POST", body: JSON.stringify(data) }),
  updateCartItem: (id: string, quantity: number) =>
    request<{ success: boolean }>(`/cart/items/${id}`, { method: "PATCH", body: JSON.stringify({ quantity }) }),
  removeCartItem: (id: string) => request<{ success: boolean }>(`/cart/items/${id}`, { method: "DELETE" }),
  cartCheckout: (data: { paymentMethod: string; poNumber?: string; shippingMethodId?: string; notes?: string }) =>
    request<{ order: any }>("/cart/checkout", { method: "POST", body: JSON.stringify(data) }),

  // Quick Order
  quickOrderBySku: (data: { items: { sku: string; quantity: number }[]; paymentMethod: string; poNumber?: string; notes?: string }) =>
    request<{ order: any; errors?: any[] }>("/quick-order", { method: "POST", body: JSON.stringify(data) }),
  quickOrderByCsv: (file: File, paymentMethod: string) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("paymentMethod", paymentMethod);
    const token = _authToken || (typeof window !== "undefined" ? localStorage.getItem("token") : null);
    return fetch(`${API_BASE}/quick-order/csv`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    }).then(async (res) => { if (!res.ok) { const err = await res.json().catch(() => ({ error: "Quick order failed" })); throw new ApiError(res.status, err.error); } return res.json() as Promise<{ order: any; errors?: any[] }>; });
  },

  // Reorder
  reorder: (orderId: string) =>
    request<{ order: any }>(`/reorder/${orderId}`, { method: "POST" }),

  // Store Credit
  getStoreCredit: () => request<{ balance: number; transactions: any[] }>("/store-credit"),
  adminGetStoreCredit: (userId: string) => request<{ user: any; transactions: any[] }>(`/admin/store-credit/${userId}`),
  adminAdjustStoreCredit: (userId: string, data: { amount: number; reason: string }) =>
    request<{ user: any }>(`/admin/store-credit/${userId}/adjust`, { method: "POST", body: JSON.stringify(data) }),

  // Payment Methods per Company
  getPaymentMethods: () => request<{ methods: string[] }>("/payment-methods"),
  adminGetCompanyPaymentMethods: (params?: { companyId?: string }) => {
    const qs = new URLSearchParams(params as any).toString();
    return request<{ paymentMethods: any[] }>(`/admin/company-payment-methods${qs ? `?${qs}` : ""}`);
  },
  adminSetCompanyPaymentMethod: (data: { companyId?: string; customerGroupId?: string; method: string; enabled?: boolean }) =>
    request<{ paymentMethod: any }>("/admin/company-payment-methods", { method: "POST", body: JSON.stringify(data) }),

  // Shipping Methods
  adminGetShippingMethods: () => request<{ shippingMethods: any[] }>("/admin/shipping-methods"),
  adminCreateShippingMethod: (data: { name: string; code: string; description?: string; baseRate: number; ratePerKg?: number; estimatedDaysMin?: number; estimatedDaysMax?: number }) =>
    request<{ shippingMethod: any }>("/admin/shipping-methods", { method: "POST", body: JSON.stringify(data) }),
  adminUpdateShippingMethod: (id: string, data: any) =>
    request<{ shippingMethod: any }>(`/admin/shipping-methods/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  getShippingMethods: () => request<{ shippingMethods: any[] }>("/shipping-methods"),
  adminAssignCompanyShipping: (data: { companyId?: string; customerGroupId?: string; shippingMethodId: string; customRate?: number; isEnabled?: boolean }) =>
    request<{ companyShipping: any }>("/admin/company-shipping-methods", { method: "POST", body: JSON.stringify(data) }),

  // Variants
  adminGetVariants: (productId: string) => request<{ variants: any[] }>(`/admin/variants/${productId}`),
  adminCreateVariant: (productId: string, data: { sku: string; name: string; price?: number; stockStatus?: string; optionValues?: any[]; sortOrder?: number }) =>
    request<{ variant: any }>(`/admin/variants/${productId}`, { method: "POST", body: JSON.stringify(data) }),
  adminUpdateVariant: (productId: string, variantId: string, data: any) =>
    request<{ variant: any }>(`/admin/variants/${productId}/${variantId}`, { method: "PATCH", body: JSON.stringify(data) }),
  adminDeleteVariant: (productId: string, variantId: string) =>
    request<{ success: boolean }>(`/admin/variants/${productId}/${variantId}`, { method: "DELETE" }),

  // Option Types
  adminGetOptionTypes: () => request<{ optionTypes: any[] }>("/admin/option-types"),
  adminCreateOptionType: (data: { name: string; presentation?: string; sortOrder?: number }) =>
    request<{ optionType: any }>("/admin/option-types", { method: "POST", body: JSON.stringify(data) }),
  adminCreateOptionValue: (data: { optionTypeId: string; name: string; presentation?: string; sortOrder?: number }) =>
    request<{ optionValue: any }>("/admin/option-values", { method: "POST", body: JSON.stringify(data) }),

  // Invoices
  adminSendInvoice: (id: string) =>
    request<{ message: string; invoice: { id: string; invoice_number: string } }>(`/orders/admin/invoices/${id}/send`, { method: "POST" }),

  // Company Dashboard
  getCompanyDashboard: () => request<{
    user: any; company: any; salesRep: any; storeCredit: { balance: number };
    creditLimit: { limit: number; outstanding: number };
    paymentMethods: string[]; shippingMethods: any[];
    procurementLists: any[]; stats: { ordersCount: number; rfqsCount: number; procurementListsCount: number; teamMembersCount: number };
    onboarding: { needsOnboarding: boolean };
  }>("/company/dashboard"),

  // Team Members (self-service for company users)
  getCompanyTeam: () => request<{ team: any[]; canManage: boolean }>("/company/team"),
  createCompanyTeamMember: (data: { email: string; password: string; firstName: string; lastName: string; phone?: string; companyRole: string }) =>
    request<{ user: any }>("/company/team", { method: "POST", body: JSON.stringify(data) }),
  updateCompanyTeamMember: (userId: string, data: { companyRole?: string; accountStatus?: string }) =>
    request<{ user: any }>(`/company/team/${userId}`, { method: "PATCH", body: JSON.stringify(data) }),

  // Temporary upload (for new product form — no product ID needed)
  adminUploadImage: (file: File) => {
    const formData = new FormData();
    formData.append("image", file);
    const token = _authToken || (typeof window !== "undefined" ? localStorage.getItem("token") : null);
    return fetch(`${API_BASE}/admin/upload`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    }).then(async (res) => {
      if (!res.ok) { const err = await res.json().catch(() => ({ error: "Upload failed" })); throw new ApiError(res.status, err.error); }
      return res.json() as Promise<{ url: string; filename: string }>;
    });
  },

  // Product Media
  adminGetProductMedia: (productId: string) =>
    request<{ media: any[] }>(`/admin/products/${productId}/media`),
  adminUploadProductImages: (productId: string, files: File[]) => {
    const formData = new FormData();
    files.forEach((f) => formData.append("images", f));
    const token = _authToken || (typeof window !== "undefined" ? localStorage.getItem("token") : null);
    return fetch(`${API_BASE}/admin/products/${productId}/media/images`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    }).then(async (res) => {
      if (!res.ok) { const err = await res.json().catch(() => ({ error: "Upload failed" })); throw new ApiError(res.status, err.error); }
      return res.json() as Promise<{ media: any[] }>;
    });
  },
  adminAddProductVideo: (productId: string, data: { url: string; title?: string; alt_text?: string }) =>
    request<{ media: any }>(`/admin/products/${productId}/media/videos`, { method: "POST", body: JSON.stringify(data) }),
  adminSetPrimaryMedia: (productId: string, mediaId: string) =>
    request<{ media: any }>(`/admin/products/${productId}/media/${mediaId}/primary`, { method: "PATCH" }),
  adminReorderMedia: (productId: string, mediaIds: string[]) =>
    request<{ media: any[] }>(`/admin/products/${productId}/media/reorder`, { method: "PUT", body: JSON.stringify({ mediaIds }) }),
  adminUpdateMedia: (productId: string, mediaId: string, data: { alt_text?: string; title?: string; sort_order?: number; thumbnail_url?: string }) =>
    request<{ media: any }>(`/admin/products/${productId}/media/${mediaId}`, { method: "PATCH", body: JSON.stringify(data) }),
  adminDeleteMedia: (productId: string, mediaId: string) =>
    request<{ success: boolean }>(`/admin/products/${productId}/media/${mediaId}`, { method: "DELETE" }),

  // Company Credit
  getCompanyCreditStatus: () => request<{
    creditStatus: string;
    requestedCreditLimit: number | null;
    approvedCreditLimit: number;
    creditUsed: number;
    availableCredit: number;
    creditRiskRating: string;
    creditRejectionReason: string | null;
    creditApprovedAt: string | null;
    nextReviewAt: string | null;
    financeContactName: string | null;
    financeContactEmail: string | null;
    financeContactPhone: string | null;
  }>("/company/credit"),
  applyCompanyCredit: (data: {
    requestedCreditLimit: number;
    preferredPaymentTerms?: string;
    financeContactName?: string;
    financeContactEmail?: string;
    financeContactPhone?: string;
    supportingNotes?: string;
  }) => request<{ message: string }>("/company/credit/apply", { method: "POST", body: JSON.stringify(data) }),
  adminApproveCompanyCredit: (companyId: string, data: {
    approvedCreditLimit: number;
    paymentTermsDays?: number;
    creditRiskRating?: string;
    reviewNotes?: string;
    nextReviewAt?: string;
  }) => request<{ company: any }>(`/admin/companies/${companyId}/credit/approve`, { method: "POST", body: JSON.stringify(data) }),
  adminRejectCompanyCredit: (companyId: string, data: {
    rejectionReason: string;
    reviewNotes?: string;
  }) => request<{ company: any }>(`/admin/companies/${companyId}/credit/reject`, { method: "POST", body: JSON.stringify(data) }),
  adminSuspendCompanyCredit: (companyId: string) =>
    request<{ company: any }>(`/admin/companies/${companyId}/credit/suspend`, { method: "POST" }),
  adminReactivateCompanyCredit: (companyId: string) =>
    request<{ company: any }>(`/admin/companies/${companyId}/credit/reactivate`, { method: "POST" }),
  adminGetCreditVetting: (companyId: string) =>
    request<{
      suggestedRiskLevel: "low" | "medium" | "high";
      suggestedCreditLimit: number | null;
      warnings: string[];
      scores: {
        accountAge: number;
        profileCompleteness: number;
        orderHistory: number;
        paymentHistory: number;
        engagementLevel: number;
        salesRepAssignment: number;
        weightedTotal: number;
      };
      details: {
        accountAgeDays: number;
        profileFieldsPresent: number;
        profileFieldsTotal: number;
        totalOrders: number;
        totalSpent: number;
        avgOrderValue: number | null;
        overdueOutstanding: number;
        cancelledOrderCount: number;
        totalPayments: number;
        totalRfqs: number;
        totalQuotations: number;
        acceptedQuotations: number;
        requestedCreditLimit: number | null;
        hasAssignedSalesRep: boolean;
        hasTaxId: boolean;
        hasRegNumber: boolean;
        hasFinanceContact: boolean;
      };
    }>(`/admin/companies/${companyId}/credit/vetting`),

  // Company Vetting
  getVettingQuestions: () => request<{ questions: any[] }>("/company/vetting/questions"),
  getVettingStatus: () => request<{ vetting: any }>("/company/vetting/status"),
  saveVettingDraft: (data: { answers: { question_key: string; raw_value?: string | null; display_label?: string | null }[] }) =>
    request<{ submissionId: string }>("/company/vetting/draft", { method: "PUT", body: JSON.stringify(data) }),
  submitVetting: (data: { answers: { question_key: string; raw_value?: string | null; display_label?: string | null }[] }) =>
    request<{ submission: any; score: number; band: string }>("/company/vetting/submit", { method: "POST", body: JSON.stringify(data) }),
  adminGetCompanyVetting: (companyId: string) =>
    request<{ vetting: any }>(`/admin/companies/${companyId}/vetting`),
  adminUpdateVettingStatus: (companyId: string, data: { status: string; note?: string }) =>
    request<{ submission: any }>(`/admin/companies/${companyId}/vetting/status`, { method: "PATCH", body: JSON.stringify(data) }),
  adminAddVettingNote: (companyId: string, data: { note: string }) =>
    request<{ message: string }>(`/admin/companies/${companyId}/vetting/note`, { method: "POST", body: JSON.stringify(data) }),
  uploadVettingDocument: async (file: File, questionKey: string) => {
    const token = _authToken || (typeof window !== "undefined" ? localStorage.getItem("token") : null);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("question_key", questionKey);
    const res = await fetch(`${API_BASE}/company/vetting/upload`, {
      method: "POST",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Upload failed" }));
      throw new ApiError(res.status, err.error || "Upload failed");
    }
    return res.json();
  },
  getVettingDocuments: (companyId: string) =>
    request<{ documents: any[] }>(`/admin/companies/${companyId}/vetting/documents`),
  getVettingDocumentUrl: (docId: string) => `/company/vetting/documents/${docId}/download`,

  // Generic
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: any) => request<T>(path, { method: "POST", body: data ? JSON.stringify(data) : undefined }),
};
