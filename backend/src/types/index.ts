export interface User {
  id: string;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  role: "customer" | "sales" | "ops" | "admin" | "super_admin";
  created_at: Date;
  updated_at: Date;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category_id: string;
  price: number;
  compare_price: number | null;
  stock_status: string;
  images: string[];
  variants: any[];
  specs: Record<string, any>;
  seo_title: string | null;
  seo_description: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface RFQ {
  id: string;
  user_id: string;
  product_id: string;
  quantity: number;
  delivery_requirements: string | null;
  file_url: string | null;
  notes: string | null;
  status: "pending" | "quoted" | "accepted" | "rejected";
  admin_notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Order {
  id: string;
  user_id: string;
  order_number: string;
  items: any[];
  subtotal: number;
  tax: number;
  total: number;
  status: "pending" | "paid" | "processing" | "completed" | "cancelled";
  payment_method: string | null;
  paystack_reference: string | null;
  invoice_url: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export type BookingStatus = "requested" | "confirmed" | "rescheduled" | "in_progress" | "completed" | "cancelled";

export interface ServiceBooking {
  id: string;
  order_id: string;
  user_id: string;
  preferred_date: string;
  preferred_time_slot: string | null;
  location: string;
  contact_phone: string | null;
  contact_name: string | null;
  notes: string | null;
  status: BookingStatus;
  assigned_to: string | null;
  service_type: string | null;
  admin_notes: string | null;
  confirmed_date: string | null;
  confirmed_time_slot: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  quotation_id: string | null;
  rfq_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  created_at: Date;
}

export interface LeadStage {
  id: string;
  name: string;
  position: number;
  color: string;
  created_at: Date;
}

export interface Lead {
  id: string;
  user_id: string | null;
  stage_id: string;
  company: string | null;
  contact_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  source: string | null;
  value: number | null;
  notes: string | null;
  assigned_to: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Activity {
  id: string;
  lead_id: string;
  user_id: string | null;
  type: string;
  description: string;
  metadata: Record<string, any>;
  created_at: Date;
}

export interface Task {
  id: string;
  lead_id: string | null;
  assigned_to: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  is_completed: boolean;
  created_at: Date;
  updated_at: Date;
}
