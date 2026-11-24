export type StoreType = 'booking' | 'ecommerce' | 'hybrid';

export interface Store {
  id: string;
  store_name: string;
  store_type?: StoreType;
  bank_info: string;
  owner_line_id: string;
  shipping_fee?: number;
  free_shipping_threshold?: number | null;
  created_at?: string;
  expires_at?: string | null;
}

export interface Service {
  id: string;
  store_id: string;
  name: string;
  price: number;
  duration_minutes: number;
  deposit: number;
  created_at?: string;
}

export interface StoreException {
  id: string;
  store_id: string;
  exception_date: string; // YYYY-MM-DD
  is_closed: boolean;
  open_time: string | null; // HH:mm:ss
  close_time: string | null; // HH:mm:ss
  reason: string | null;
  created_at: string;
}

export interface WorkingHour {
  id: string;
  store_id: string;
  day_of_week: number; // 0=週日 ~ 6=週六
  open_time: string;
  close_time: string;
  is_closed: boolean;
  created_at: string;
}

export interface Appointment {
  id: string;
  store_id: string;
  customer_line_id: string;
  customer_name: string;
  service_id: string;
  start_time: string;
  end_time: string;
  payment_status: 'pending_verify' | 'confirmed' | 'cancelled';
  bank_last_five: string;
  created_at?: string;
  services?: {
    name: string;
    price?: number;
    deposit?: number;
  };
}

export interface Product {
  id: string;
  store_id: string;
  name: string;
  description: string;
  price: number;
  unit: string;
  stock: number | null;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
}

export type OrderStatus = 'pending_verify' | 'confirmed' | 'shipped' | 'cancelled';
export type DeliveryMethod = 'pickup' | 'cold_delivery';

export interface OrderItem {
  id?: string;
  order_id?: string;
  product_id: string | null;
  product_name: string;
  unit: string;
  unit_price: number;
  quantity: number;
  line_total: number;
}

export interface Order {
  id: string;
  store_id: string;
  customer_line_id: string;
  customer_name: string;
  customer_phone: string;
  delivery_method: DeliveryMethod;
  delivery_address: string;
  preferred_date: string | null;
  subtotal: number;
  shipping_fee: number;
  total_amount: number;
  bank_last_five: string;
  status: OrderStatus;
  tracking_number: string;
  note: string;
  created_at: string;
  order_items?: OrderItem[];
}