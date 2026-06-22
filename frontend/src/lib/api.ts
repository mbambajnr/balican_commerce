const API_BASE = "/backend-api";

export class ApiError extends Error {
  details: any;
  constructor(public status: number, message: string, details?: any) {
    super(message);
    this.details = details;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    credentials: "same-origin",
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Request failed" }));
    const err = new ApiError(res.status, body.error || body.message || "Request failed", body);
    throw err;
  }

  return res.json();
}

export const api = {
  // Auth
  register: (data: { email: string; password: string; firstName: string; lastName: string; phone?: string; companyName?: string; companyType?: string; businessType?: string; industry?: string; address?: string; city?: string; state?: string; taxId?: string; businessRegistrationNumber?: string; contactPersonName?: string; contactPersonEmail?: string; contactPersonPhone?: string; requestedPaymentTerms?: string }) =>
    request<{ user: any; company: any }>("/auth/register", { method: "POST", body: JSON.stringify(data) }),
  getMe: () => request<{ user: any }>("/auth/me"),
  updateProfile: (data: any) => request<{ user: any }>("/auth/profile", { method: "PUT", body: JSON.stringify(data) }),
  getCompanyProfile: () => request<{ profile: any; completion: { complete: boolean; missingFields: { key: string; label: string }[] } }>("/auth/company-profile"),
  updateCompanyProfile: (data: any) => request<{ profile: any; completion: { complete: boolean; missingFields: { key: string; label: string }[] } }>("/auth/company-profile", { method: "PUT", body: JSON.stringify(data) }),

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
    return fetch(`${API_BASE}/products/bulk-import`, {
      method: "POST",
      body: formData,
      credentials: "same-origin",
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
  orderLifecycle: (id: string, data: { action: "advance" | "complete" | "cancel"; note?: string }) =>
    request<{ order: any; transition: { from: string; to: string } }>(`/orders/${id}/lifecycle`, { method: "PATCH", body: JSON.stringify(data) }),
  getOrderHistory: (id: string) =>
    request<{ history: any[] }>(`/orders/${id}/history`),
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
  getCompanies: (params?: { search?: string; status?: string; companyType?: string; page?: string; limit?: string }) => {
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
    return fetch(`${API_BASE}/quick-order/csv`, {
      method: "POST",
      body: formData,
      credentials: "same-origin",
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
    onboarding: { needsOnboarding: boolean; businessProfile: { complete: boolean; missingFields: { key: string; label: string }[] } | null };
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
    return fetch(`${API_BASE}/admin/upload`, {
      method: "POST",
      body: formData,
      credentials: "same-origin",
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
    return fetch(`${API_BASE}/admin/products/${productId}/media/images`, {
      method: "POST",
      body: formData,
      credentials: "same-origin",
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
    const formData = new FormData();
    formData.append("file", file);
    formData.append("question_key", questionKey);
    const res = await fetch(`${API_BASE}/company/vetting/upload`, {
      method: "POST",
      body: formData,
      credentials: "same-origin",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Upload failed" }));
      throw new ApiError(res.status, err.error || "Upload failed");
    }
    return res.json();
  },
  getVettingDocuments: (companyId: string) =>
    request<{ documents: any[] }>(`/admin/companies/${companyId}/vetting/documents`),
  getVettingDocumentUrl: (docId: string) => `${API_BASE}/company/vetting/documents/${docId}/download`,

  // Marketplace
  getMarketplaceProviders: (params?: { type?: string; region?: string; category?: string; search?: string; page?: string; limit?: string }) => {
    const qs = new URLSearchParams(params as any).toString();
    return request<{ providers: any[]; pagination: any }>(`/marketplace/providers${qs ? `?${qs}` : ""}`);
  },
  getMarketplaceProvider: (id: string) => request<{ provider: any; products: any[]; services: any[] }>(`/marketplace/providers/${id}`),
  getMarketplaceProducts: (params?: { category?: string; search?: string; provider_id?: string; credit?: string; price_min?: string; price_max?: string; page?: string; limit?: string }) => {
    const qs = new URLSearchParams(params as any).toString();
    return request<{ products: any[]; pagination: any }>(`/marketplace/products${qs ? `?${qs}` : ""}`);
  },
  getMarketplaceServices: (params?: { category?: string; search?: string; provider_id?: string; credit?: string; page?: string; limit?: string }) => {
    const qs = new URLSearchParams(params as any).toString();
    return request<{ services: any[]; pagination: any }>(`/marketplace/services${qs ? `?${qs}` : ""}`);
  },
  getMarketplaceService: (slug: string) => request<{ service: any }>(`/marketplace/services/slug/${slug}`),
  getMarketplaceCategories: (type?: string) => request<{ categories: any[]; featuredProviders: any[] }>(`/marketplace/categories${type ? `?type=${type}` : ""}`),
  getMarketplaceProductSuppliers: (id: string) => request<{ suppliers: any[] }>(`/marketplace/products/${id}/suppliers`),

  // Scout feed (supplier-facing open RFQs)
  getScoutFeed: (params?: { category?: string; requestType?: string; status?: string; location?: string; deadline?: string; page?: string; limit?: string }) => {
    const qs = new URLSearchParams(params as any).toString();
    return request<{ rfqs: any[]; pagination: { page: number; limit: number; total: number; pages: number } }>(`/rfqs/scout-feed${qs ? `?${qs}` : ""}`);
  },

  // Provider profile management
  getProviderProfile: () => request<{ company: any; profile: any }>("/provider/profile"),
  updateProviderProfile: (data: any) => request<{ profile: any }>("/provider/profile", { method: "PUT", body: JSON.stringify(data) }),

  // Provider Opportunities (procurement requests)
  getProviderOpportunities: (params?: { category?: string; requestType?: string; location?: string; deadline?: string; search?: string; status?: string; page?: string; limit?: string }) => {
    const qs = new URLSearchParams(params as any).toString();
    return request<{ opportunities: any[]; pagination: any; insights: any }>(`/provider/opportunities${qs ? `?${qs}` : ""}`);
  },
  getProviderOpportunity: (id: string) => request<{ opportunity: any }>(`/provider/opportunities/${id}`),
  submitProviderProposal: (id: string, data: { amount?: number; deliveryDate?: string; creditTerms?: string; availabilityStatus?: string; proposalText: string }) =>
    request<{ proposal: any }>(`/provider/opportunities/${id}/proposals`, { method: "POST", body: JSON.stringify(data) }),
  getProviderMyProposal: (id: string) => request<{ proposal: any }>(`/provider/opportunities/${id}/my-proposal`),
  getScoutRequestProposals: (requestId: string) => request<{ request: any; proposals: any[] }>(`/scout/requests/${requestId}/proposals`),

  // Provider Dashboard
  getProviderDashboard: () => request<{ stats: any; recentProducts: any[]; recentServices: any[]; businessProfile: { complete: boolean; missingFields: { key: string; label: string }[] } | null; opportunityInsights: any }>("/provider/dashboard"),

  getProviderOperationsSummary: () =>
    request<{
      incomingRequests: number;
      quotedCount: number;
      acceptedCount: number;
      declinedCount: number;
      creditProfile: { vetting_status: string; credit_tier: string; credit_limit: number; next_review_at: string } | null;
    }>("/provider/operations/summary"),

  getProviderProducts: (params?: { page?: string; limit?: string; search?: string; status?: string }) => {
    const qs = new URLSearchParams(params as any).toString();
    return request<{ products: any[]; pagination: any }>(`/provider/products${qs ? `?${qs}` : ""}`);
  },
  createProviderProduct: (data: any) => request<{ product: any }>("/provider/products", { method: "POST", body: JSON.stringify(data) }),
  updateProviderProduct: (id: string, data: any) => request<{ product: any }>(`/provider/products/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  toggleProviderProduct: (id: string) => request<{ product: any }>(`/provider/products/${id}/toggle`, { method: "PATCH" }),
  updateProviderProductInventory: (id: string, data: any) => request<{ product: any }>(`/provider/products/${id}/inventory`, { method: "PATCH", body: JSON.stringify(data) }),

  getProviderServices: (params?: { page?: string; limit?: string; search?: string; status?: string }) => {
    const qs = new URLSearchParams(params as any).toString();
    return request<{ services: any[]; pagination: any }>(`/provider/services${qs ? `?${qs}` : ""}`);
  },
  getProviderService: (id: string) => request<{ service: any }>(`/provider/services/${id}`),
  createProviderService: (data: any) => request<{ service: any }>("/provider/services", { method: "POST", body: JSON.stringify(data) }),
  updateProviderService: (id: string, data: any) => request<{ service: any }>(`/provider/services/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  toggleProviderService: (id: string) => request<{ service: any }>(`/provider/services/${id}/toggle`, { method: "PATCH" }),
  updateProviderServiceAvailability: (id: string, data: any) => request<{ service: any }>(`/provider/services/${id}/availability`, { method: "PATCH", body: JSON.stringify(data) }),

  // Procurement Requests (Buyer)
  getProcurementProviders: (params?: { type?: string; search?: string; creditTier?: string; page?: string; limit?: string }) => {
    const qs = new URLSearchParams(params as any).toString();
    return request<{ providers: any[]; pagination: any }>(`/procurement/providers${qs ? `?${qs}` : ""}`);
  },
  createProcurementRequest: (data: any) => request<{ request: any }>("/procurement/requests", { method: "POST", body: JSON.stringify(data) }),
  getProcurementRequests: (params?: { page?: string; limit?: string; status?: string; type?: string }) => {
    const qs = new URLSearchParams(params as any).toString();
    return request<{ requests: any[]; pagination: any }>(`/procurement/requests${qs ? `?${qs}` : ""}`);
  },
  getProcurementRequest: (id: string) => request<{ request: any }>(`/procurement/requests/${id}`),

  updateProcurementRequest: (id: string, data: any) => request<{ request: any }>(`/procurement/requests/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  updateProcurementRequestStatus: (id: string, status: string) => request<{ success: boolean; status: string }>(`/procurement/requests/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),

  acceptProviderQuote: (requestId: string, providerCompanyId: string, adminOverride?: boolean) =>
    request<{ success: boolean; supplierCreditWarning?: string }>(`/procurement/requests/${requestId}/accept-provider/${providerCompanyId}`, {
      method: "POST",
      body: JSON.stringify({ adminOverride: adminOverride || false }),
    }),

  convertProcurementToOrder: (requestId: string) =>
    request<{ success: boolean; order: any }>(`/procurement/requests/${requestId}/convert-to-order`, {
      method: "POST",
    }),

  // Procurement Requests (Provider)
  getProviderProcurementRequests: (params?: { page?: string; limit?: string; status?: string }) => {
    const qs = new URLSearchParams(params as any).toString();
    return request<{ requests: any[]; pagination: any }>(`/provider/procurement/requests${qs ? `?${qs}` : ""}`);
  },
  getProviderProcurementRequest: (id: string) => request<{ request: any; items: any[]; otherProviders: any[] }>(`/provider/procurement/requests/${id}`),
  markProviderProcurementRequestViewed: (id: string) => request<{ success: boolean; status: string }>(`/provider/procurement/requests/${id}/view`, { method: "PATCH" }),
  respondToProviderProcurementRequest: (id: string, data: { response: string; notes?: string; quoteAmount?: number; quoteDetails?: any }) =>
    request<{ success: boolean; response: any }>(`/provider/procurement/requests/${id}/respond`, { method: "PATCH", body: JSON.stringify(data) }),

  // Supplier Credit Vetting (Admin)
  adminGetSupplierCreditVetting: (providerId: string) =>
    request<{ vetting: any; profile: any }>(`/admin/providers/${providerId}/credit-vetting`),
  adminApproveSupplierCredit: (providerId: string, data: { creditTier: string; creditLimit?: number; reviewNotes?: string; nextReviewAt?: string }) =>
    request<{ success: boolean; profile: any }>(`/admin/providers/${providerId}/credit-vetting/approve`, { method: "POST", body: JSON.stringify(data) }),
  adminRejectSupplierCredit: (providerId: string, data: { rejectionReason: string; reviewNotes?: string }) =>
    request<{ success: boolean; profile: any }>(`/admin/providers/${providerId}/credit-vetting/reject`, { method: "POST", body: JSON.stringify(data) }),

  // Procurement Activity Feed
  getProcurementActivity: (params?: { page?: string; limit?: string; eventType?: string }) => {
    const qs = new URLSearchParams(params as any).toString();
    return request<{ activities: any[]; pagination: any }>(`/procurement/activity${qs ? `?${qs}` : ""}`);
  },
  getProviderProcurementActivity: (params?: { page?: string; limit?: string; eventType?: string }) => {
    const qs = new URLSearchParams(params as any).toString();
    return request<{ activities: any[]; pagination: any }>(`/provider/procurement/activity${qs ? `?${qs}` : ""}`);
  },
  getAdminProcurementActivity: (params?: { page?: string; limit?: string; eventType?: string; companyId?: string; providerCompanyId?: string }) => {
    const qs = new URLSearchParams(params as any).toString();
    return request<{ activities: any[]; pagination: any }>(`/admin/procurement/activity${qs ? `?${qs}` : ""}`);
  },

  // Notifications
  getNotifications: (params?: { page?: string; limit?: string }) => {
    const qs = new URLSearchParams(params as any).toString();
    return request<{ notifications: any[]; pagination: any }>(`/notifications${qs ? `?${qs}` : ""}`);
  },
  getUnreadCount: () => request<{ unread: number }>("/notifications/unread-count"),
  markNotificationRead: (id: string) => request<{ success: boolean }>(`/notifications/${id}/read`, { method: "PATCH" }),
  markAllNotificationsRead: () => request<{ success: boolean }>("/notifications/read-all", { method: "PATCH" }),

  // Scout
  createScoutRequest: (data: {
    title: string; description?: string; quantity: number; unit?: string;
    deliveryLocation?: string; desiredDeliveryDate?: string;
    budgetMin?: number; budgetMax?: number; notes?: string;
    categoryId?: string; requestType?: "product" | "service";
  }) => request<{ request: any }>("/scout/requests", { method: "POST", body: JSON.stringify(data) }),

  getScoutRequests: (params?: { status?: string; page?: string; limit?: string }) => {
    const qs = new URLSearchParams((params ?? {}) as any).toString();
    return request<{ requests: any[]; pagination: any }>(`/scout/requests${qs ? `?${qs}` : ""}`);
  },

  getScoutRequest: (id: string) =>
    request<{ request: any; quotes: any[] }>(`/scout/requests/${id}`),

  cancelScoutRequest: (id: string) =>
    request<{ success: boolean }>(`/scout/requests/${id}/cancel`, { method: "PATCH" }),

  acceptScoutQuote: (requestId: string, quoteId: string) =>
    request<{ success: boolean; order: any }>(`/scout/requests/${requestId}/accept-quote/${quoteId}`, { method: "POST" }),

  getScoutAvailable: (params?: {
    search?: string; category?: string; location?: string;
    requestType?: string; deliveryDateBefore?: string;
    page?: string; limit?: string;
  }) => {
    const qs = new URLSearchParams((params ?? {}) as any).toString();
    return request<{ requests: any[]; pagination: any }>(`/scout/available${qs ? `?${qs}` : ""}`);
  },

  getMyScoutQuote: (requestId: string) =>
    request<{ request: any; quote: any | null }>(`/scout/requests/${requestId}/my-quote`),

  submitScoutQuote: (requestId: string, data: {
    quotedPrice: number; deliveryDate?: string; paymentTerms?: string; notes?: string;
  }) => request<{ quote: any }>(`/scout/requests/${requestId}/quote`, { method: "POST", body: JSON.stringify(data) }),

  // Agreements
  acceptProposal: (quoteId: string, data?: { notes?: string }) =>
    request<{ agreement: any }>(`/scout/proposals/${quoteId}/accept`, { method: "POST", body: data ? JSON.stringify(data) : undefined }),

  getAgreements: (params?: { status?: string; page?: string; limit?: string }) => {
    const qs = new URLSearchParams((params ?? {}) as any).toString();
    return request<{ agreements: any[]; pagination: any }>(`/agreements${qs ? `?${qs}` : ""}`);
  },

  getAgreement: (id: string) =>
    request<{ agreement: any }>(`/agreements/${id}`),

  updateAgreementStatus: (id: string, data: { status: string; reason?: string }) =>
    request<{ success: boolean }>(`/agreements/${id}/status`, { method: "PATCH", body: JSON.stringify(data) }),

  convertAgreementToOrder: (id: string) =>
    request<{ success: boolean; order: any }>(`/agreements/${id}/convert-to-order`, { method: "POST" }),

  // Super Admin — Admin User Management
  getAdminUsers: () =>
    request<{ admins: any[] }>("/admin/admins"),

  createAdminUser: (data: { email: string; password: string; firstName: string; lastName: string; phone?: string }) =>
    request<{ admin: any }>("/admin/admins", { method: "POST", body: JSON.stringify(data) }),

  disableAdminUser: (id: string) =>
    request<{ success: boolean }>(`/admin/admins/${id}/disable`, { method: "PATCH" }),

  enableAdminUser: (id: string) =>
    request<{ success: boolean }>(`/admin/admins/${id}/enable`, { method: "PATCH" }),

  // Provider Verification
  getVerificationStatus: () =>
    request<{
      companyId: string;
      verificationStatus: string;
      verifiedUntil?: string | null;
      feeWaiver?: { active: boolean; waivedUntil?: string | null; reason?: string | null };
      verificationFee?: {
        amount: number;
        currency: string;
        renewalPeriodDays: number;
        gracePeriodDays: number;
        latestPayment: any | null;
        canSubmitForReview: boolean;
      };
      documents: any[];
    }>("/provider/verification/status"),

  initVerificationPayment: () =>
    request<{ authorizationUrl: string; reference: string; alreadyPaid?: boolean }>("/provider/verification/payment/init", { method: "POST" }),

  uploadVerificationDocument: async (documentType: string, file: File) => {
    const formData = new FormData();
    formData.append("document", file);
    formData.append("document_type", documentType);
    const res = await fetch(`${API_BASE}/provider/verification/documents/upload`, {
      method: "POST",
      body: formData,
      credentials: "same-origin",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Upload failed" }));
      throw new ApiError(res.status, err.error || "Upload failed");
    }
    return res.json();
  },

  deleteVerificationDocument: (id: string) =>
    request<{ message: string }>(`/provider/verification/documents/${id}`, { method: "DELETE" }),

  submitVerification: () =>
    request<{ message: string }>("/provider/verification/submit", { method: "POST" }),

  // Super Admin Dashboard
  getSuperAdminDashboard: () =>
    request<{
      companies: { total: number; pending: number; active: number; rejected: number; payment_suspended: number; suspended: number };
      pendingVerifications: number;
      pendingDocuments: number;
      planDistribution: { name: string; display_name: string; subscriber_count: number }[];
      recentActivity: { action: string; count: number }[];
    }>("/super-admin/dashboard"),

  getSuperAdminCompanies: (params?: {
    search?: string; status?: string; verificationStatus?: string; companyType?: string;
    page?: string; limit?: string;
  }) => {
    const qs = new URLSearchParams((params ?? {}) as any).toString();
    return request<{ companies: any[]; total: number; page: number; limit: number }>(`/super-admin/companies${qs ? `?${qs}` : ""}`);
  },

  getSuperAdminCompany: (id: string) =>
    request<any>(`/super-admin/companies/${id}`),

  superApproveCompany: (id: string, reason?: string) =>
    request<{ message: string }>(`/super-admin/companies/${id}/approve`, { method: "POST", body: JSON.stringify({ reason }) }),

  superRejectCompany: (id: string, reason?: string) =>
    request<{ message: string }>(`/super-admin/companies/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) }),

  superSuspendCompany: (id: string, reason?: string) =>
    request<{ message: string }>(`/super-admin/companies/${id}/suspend`, { method: "POST", body: JSON.stringify({ reason }) }),

  superReactivateCompany: (id: string, reason?: string) =>
    request<{ message: string }>(`/super-admin/companies/${id}/reactivate`, { method: "POST", body: JSON.stringify({ reason }) }),

  superPaymentSuspendCompany: (id: string, reason?: string) =>
    request<{ message: string }>(`/super-admin/companies/${id}/payment-suspend`, { method: "POST", body: JSON.stringify({ reason }) }),

  superClearPaymentSuspend: (id: string) =>
    request<{ message: string }>(`/super-admin/companies/${id}/clear-payment-suspend`, { method: "POST" }),

  getVerificationFeeSettings: () =>
    request<any>("/super-admin/verification-fee/settings"),

  updateVerificationFeeSettings: (data: { amount: number; renewalPeriodDays: number; gracePeriodDays: number }) =>
    request<any>("/super-admin/verification-fee/settings", { method: "PATCH", body: JSON.stringify(data) }),

  waiveVerificationFee: (id: string, data: { days?: number; reason?: string }) =>
    request<{ company: any }>(`/super-admin/companies/${id}/verification-fee/waive`, { method: "POST", body: JSON.stringify(data) }),

  expireLapsedVerifications: () =>
    request<{ lapsed: number }>("/super-admin/verification/expire-lapsed", { method: "POST" }),

  getCommissionRates: () =>
    request<{ rates: any[] }>("/super-admin/commission-rates"),

  saveCommissionRate: (data: { categoryId?: string | null; ratePercent: number; isActive?: boolean }) =>
    request<{ rate: any }>("/super-admin/commission-rates", { method: "POST", body: JSON.stringify(data) }),

  updateCommissionRate: (id: string, data: { ratePercent?: number; isActive?: boolean }) =>
    request<{ rate: any }>(`/super-admin/commission-rates/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  getSuperAdminDocuments: (params?: { status?: string; page?: string; limit?: string }) => {
    const qs = new URLSearchParams((params ?? {}) as any).toString();
    return request<{ documents: any[]; total: number; page: number; limit: number }>(`/super-admin/documents${qs ? `?${qs}` : ""}`);
  },

  getDocumentDownloadUrl: (id: string) => `${API_BASE}/super-admin/documents/${id}/download`,

  approveDocument: (id: string, notes?: string) =>
    request<{ message: string }>(`/super-admin/documents/${id}/approve`, { method: "POST", body: JSON.stringify({ notes }) }),

  rejectDocument: (id: string, reason: string, notes?: string) =>
    request<{ message: string }>(`/super-admin/documents/${id}/reject`, { method: "POST", body: JSON.stringify({ reason, notes }) }),

  requestDocumentReupload: (id: string, reason: string, notes?: string) =>
    request<{ message: string }>(`/super-admin/documents/${id}/request-reupload`, { method: "POST", body: JSON.stringify({ reason, notes }) }),

  getAuditLogs: (params?: { action?: string; targetType?: string; page?: string; limit?: string }) => {
    const qs = new URLSearchParams((params ?? {}) as any).toString();
    return request<{ logs: any[]; total: number; page: number; limit: number }>(`/super-admin/audit-logs${qs ? `?${qs}` : ""}`);
  },

  getActivityLogs: (params?: { companyId?: string; page?: string; limit?: string }) => {
    const qs = new URLSearchParams((params ?? {}) as any).toString();
    return request<{ logs: any[]; total: number; page: number; limit: number }>(`/super-admin/activity-logs${qs ? `?${qs}` : ""}`);
  },

  getPlans: () =>
    request<any[]>("/super-admin/plans"),

  createPlan: (data: any) =>
    request<any>("/super-admin/plans", { method: "POST", body: JSON.stringify(data) }),

  updatePlan: (id: string, data: any) =>
    request<any>(`/super-admin/plans/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  getCompanySubscriptions: (params?: { status?: string; page?: string; limit?: string }) => {
    const qs = new URLSearchParams((params ?? {}) as any).toString();
    return request<{ subscriptions: any[]; total: number; page: number; limit: number }>(`/super-admin/company-subscriptions${qs ? `?${qs}` : ""}`);
  },

  updateCompanySubscription: (id: string, data: { planId?: string; status?: string }) =>
    request<{ message: string }>(`/super-admin/company-subscriptions/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  // Provider Readiness
  getProviderReadiness: () =>
    request<{ products: any[]; services: any[] }>("/provider/readiness"),

  getProviderCommissions: (params?: { page?: string; limit?: string }) => {
    const qs = new URLSearchParams((params ?? {}) as any).toString();
    return request<{ summary: any; commissions: any[]; pagination: any }>(`/provider/commissions${qs ? `?${qs}` : ""}`);
  },

  getAdminCommissions: (params?: { days?: string; providerCompanyId?: string; status?: string; format?: string }) => {
    const qs = new URLSearchParams((params ?? {}) as any).toString();
    return request<{ summary: any; commissions: any[] }>(`/admin/commissions${qs ? `?${qs}` : ""}`);
  },

  // Recommendation Events
  trackRecommendationEvent: (data: {
    buyerCompanyId: string;
    providerCompanyId: string;
    eventType: string;
    offeringId?: string;
    requestId?: string;
    metadata?: Record<string, any>;
  }) => request<{ message: string }>("/recommendation-events", { method: "POST", body: JSON.stringify(data) }),

  // Scout Request Recommendations
  getScoutRequestRecommendations: (id: string) =>
    request<{ recommendations: any[]; request: any }>(`/requests/${id}/recommendations`),



  // Account Status
  getAccountStatus: () =>
    request<{
      account_status: string; role: string; company_role: string;
      email: string; first_name: string; last_name: string;
      company_id: string | null; company_name: string | null;
      company_status: string | null; verification_status: string | null;
      is_provider: boolean; company_type: string | null;
      status_change_reason: string | null; status_changed_at: string | null;
      rejection_reason: string | null;
      subscription_status: string | null; plan_name: string | null; plan_display_name: string | null;
    }>("/account/status"),

  // Generic
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: any) => request<T>(path, { method: "POST", body: data ? JSON.stringify(data) : undefined }),
};
