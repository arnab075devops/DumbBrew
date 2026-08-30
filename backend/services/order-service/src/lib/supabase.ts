import { config } from "../config.js";

// Every request from this service to Supabase uses the service-role key
// (bypasses RLS) — the same pattern auth-service's customers.controller.ts
// already uses for the registration flow. RLS in supabase/schema.sql stays
// on as defense-in-depth against direct PostgREST access, but the actual
// ownership check for every query in this service is the explicit
// `?customer_id=eq.<req.customerId>` (or seller_id=eq...) filter each
// controller adds — never trust a request body's own customer/seller id.
export async function supabaseRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const url = `${config.supabaseUrl}/rest/v1/${path}`;
  return fetch(url, {
    ...init,
    headers: {
      apikey: config.supabaseServiceRoleKey,
      Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });
}

export async function supabaseJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await supabaseRequest(path, init);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`supabase ${path} http ${res.status}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
