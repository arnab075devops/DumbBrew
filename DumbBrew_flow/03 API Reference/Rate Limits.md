#route #infra

# Rate Limits

Parent: [[Home]] · See also: [[API Endpoint Map]], [[gateway]]

Two layers of rate limiting exist and are configured independently — don't assume changing one changes the other.

## Layer 1 — nginx (`backend/gateway/nginx.conf`), by client IP

```
limit_req_zone $binary_remote_addr zone=api_general:10m rate=20r/s;
limit_req_zone $binary_remote_addr zone=api_auth:10m rate=5r/s;
limit_req_zone $binary_remote_addr zone=api_webhook:10m rate=50r/s;
limit_req_zone $binary_remote_addr zone=api_seller_public:10m rate=5r/m;
```

| Zone | Rate | Burst | Applied to |
|---|---|---|---|
| `api_general` | 20 r/s | 20 | `/api/auth` (non-login), `/api/events`, `/api/newsletter` |
| `api_auth` | 5 r/s | 5 | `/api/auth/login`, `/api/customers`, `/api/cart`, `/api/addresses`, `/api/orders`, `/api/payments` (not webhook), `/api/sellers` (authenticated), `/api/admin/sellers` |
| `api_webhook` | 50 r/s | 50 | `/api/payments/webhook` only — Razorpay's servers, not a single browser IP, hence looser |
| `api_seller_public` | 5 r/**m** | 3 | `/api/sellers/applications*`, `/api/sellers/auth/login` — unauthenticated writes with no signed-in principal to blame a bad actor on, so this is intentionally the tightest zone in the system (note: per-**minute**, not per-second, unlike every other zone) |

## Layer 2 — Fastify `@fastify/rate-limit`, per-service, in-process

Each service registers a default (`auth-service` 100/min, `content-service` 200/min, `order-service` 200/min) plus per-route overrides:

| Route | Override |
|---|---|
| `POST /api/auth/login` | 10/min |
| `POST /api/customers/register` | 10/min |
| `POST /api/customers/session` | 30/min |
| `POST /api/newsletter/subscribe` | 5/min |
| `POST /api/orders/checkout` | 10/min |
| `POST /api/payments/webhook` | 300/min |

If a request is getting throttled unexpectedly, check **both** layers — nginx rejects before the request ever reaches the Fastify process, so a tight nginx zone can mask a looser Fastify one and vice versa.
