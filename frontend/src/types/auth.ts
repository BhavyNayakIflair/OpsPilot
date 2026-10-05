export type RoleType = 'owner' | 'sales' | 'project_manager' | 'finance' | 'employee' | 'approver';
export type Locale = 'en' | 'fr' | 'de' | 'es' | 'it';

export interface User {
  id: string;
  email: string;
  full_name: string;
  locale: Locale;
  role: RoleType;
  org_id: string;
  org_name: string;
  is_active: boolean;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user_id: string;
  org_id?: string;
  role?: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  currency: string;
  plan: string;
  monthly_spend_cap_cents: number;
  ai_spend_cents: number;
  settings: Record<string, any>;
}
