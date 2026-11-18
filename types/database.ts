export interface Store {
  id: string;
  owner_line_id: string;
  store_name: string;
  bank_info: string;
  subscription_status: 'active' | 'expired';
  expires_at: string | null;
  created_at: string;
}

export interface Service {
  id: string;
  store_id: string;
  name: string;
  price: number;
  deposit: number;
  duration_minutes: number;
  created_at: string;
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
  created_at: string;
  // 關聯查詢時可帶出服務名稱
  services?: Service;
}