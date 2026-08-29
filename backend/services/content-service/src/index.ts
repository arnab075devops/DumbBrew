import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import client from "prom-client";
import { config } from "./config.js";
import { pool } from "./db.js";
import { eventsRoutes } from "./routes/events.routes.js";
import { newsletterRoutes } from "./routes/newsletter.routes.js";

const app = Fastify({
  logger: {
    level: config.nodeEnv === "production" ? "info" : "debug"
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

app.get("/healthz", async (_req, reply) => {
  try {
    await pool.query("SELECT 1");
    return reply.send({ status: "ok" });
  } catch (err) {
    app.log.error(err, "healthz db check failed");
    return reply.code(503).send({ status: "unhealthy" });
  }
});

app.get("/metrics", async (_req, reply) => {
  reply.header("Content-Type", registry.contentType);
  return reply.send(await registry.metrics());
});

await app.register(eventsRoutes, { prefix: "/api/events" });
await app.register(newsletterRoutes, { prefix: "/api/newsletter" });

app.setErrorHandler((err, req, reply) => {
  req.log.error(err);
  const status = err.statusCode ?? 500;
  reply.code(status).send({ error: status === 500 ? "internal_error" : err.message });
});

try {
  await app.listen({ port: config.port, host: "0.0.0.0" });
  app.log.info(`content-service listening on ${config.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

async function shutdown(signal: string) {
  app.log.info(`received ${signal}, shutting down`);
  await app.close();
  await pool.end();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
