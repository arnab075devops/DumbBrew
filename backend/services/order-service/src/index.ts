import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import client from "prom-client";
import { config } from "./config.js";
import { cartRoutes } from "./routes/cart.routes.js";
import { addressesRoutes } from "./routes/addresses.routes.js";
import { ordersRoutes } from "./routes/orders.routes.js";
import { paymentsRoutes } from "./routes/payments.routes.js";
import { sellersRoutes } from "./routes/sellers.routes.js";
import { sellerPublicRoutes } from "./routes/sellerPublic.routes.js";
import { adminSellersRoutes } from "./routes/adminSellers.routes.js";
import { reviewsRoutes } from "./routes/reviews.routes.js";
import { reportsRoutes } from "./routes/reports.routes.js";
import { adminReportsRoutes } from "./routes/adminReports.routes.js";
import { adminVisitRoutes } from "./routes/adminVisit.routes.js";
import { webhook } from "./controllers/payments.controller.js";

const app = Fastify({
  logger: {
    level: config.nodeEnv === "production" ? "info" : "debug"
  }
});

// Stash the raw body before JSON-parsing it — the Razorpay webhook's
// signature (see lib/razorpay.ts) must be verified against the exact bytes
// Razorpay sent, since re-serializing the parsed object would not
// byte-for-byte match what was signed.
app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
  (req as { rawBody?: string }).rawBody = body as string;
  if (!body) return done(null, {});
  try {
    done(null, JSON.parse(body as string));
  } catch (err) {
    done(err as Error, undefined);
  }
});

const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });
const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
  registers: [registry]
});

app.addHook("onRequest", async (req) => {
  (req as any)._startTime = process.hrtime.bigint();
});
app.addHook("onResponse", async (req, reply) => {
  const start = (req as any)._startTime as bigint | undefined;
  if (!start) return;
  const seconds = Number(process.hrtime.bigint() - start) / 1e9;
  httpRequestDuration.observe(
    { method: req.method, route: req.routeOptions?.url ?? req.url, status_code: String(reply.statusCode) },
    seconds
  );
});

const corsOrigin = config.corsOrigin === "*" ? true : config.corsOrigin.split(",").map((o) => o.trim());
await app.register(cors, { origin: corsOrigin });
await app.register(rateLimit, { max: 200, timeWindow: "1 minute" });

// No local Postgres dependency: every table this service touches (carts,
// orders, products, sellers, ...) lives in Supabase, reached over HTTPS via
// lib/supabase.ts — see the schema.sql comment on that table group. So
// there's nothing local left for healthz to check beyond the process itself.
app.get("/healthz", async (_req, reply) => reply.send({ status: "ok" }));

app.get("/metrics", async (_req, reply) => {
  reply.header("Content-Type", registry.contentType);
  return reply.send(await registry.metrics());
});

await app.register(cartRoutes, { prefix: "/api/cart" });
await app.register(addressesRoutes, { prefix: "/api/addresses" });
await app.register(ordersRoutes, { prefix: "/api/orders" });
await app.register(paymentsRoutes, { prefix: "/api/payments" });
await app.register(sellersRoutes, { prefix: "/api/sellers" });
await app.register(sellerPublicRoutes, { prefix: "/api/sellers" });
await app.register(adminSellersRoutes, { prefix: "/api/admin/sellers" });
await app.register(reviewsRoutes, { prefix: "/api/reviews" });
await app.register(reportsRoutes, { prefix: "/api/reports" });
await app.register(adminReportsRoutes, { prefix: "/api/admin/reports" });
await app.register(adminVisitRoutes, { prefix: "/api/admin/visit-info" });
// Registered directly (not via paymentsRoutes) so it never picks up a
// requireCustomer hook — Razorpay's server calls this, not a signed-in
// browser. A generous, separate rate-limit config since it's legitimate
// high-volume server-to-server traffic, not a customer clicking too fast.
app.post("/api/payments/webhook", { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } }, webhook);

app.setErrorHandler((err, req, reply) => {
  req.log.error(err);
  const status = err.statusCode ?? 500;
  reply.code(status).send({ error: status === 500 ? "internal_error" : err.message });
});

try {
  await app.listen({ port: config.port, host: "0.0.0.0" });
  app.log.info(`order-service listening on ${config.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

async function shutdown(signal: string) {
  app.log.info(`received ${signal}, shutting down`);
  await app.close();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
