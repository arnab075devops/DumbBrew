import { Pool } from "pg";
import { config } from "./config.js";

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle Postgres client", err);
});
