import type { FastifyInstance } from "fastify";
import { applyAsSeller } from "../controllers/sellerApplications.controller.js";
import { presignApplicationUpload } from "../controllers/uploads.controller.js";
import { sellerLogin } from "../controllers/sellerAuth.controller.js";

// No auth hook — registered as its own plugin instance (Fastify hooks don't
// leak across sibling plugins even when they share a prefix), sitting
// alongside sellers.routes.ts under the same /api/sellers prefix. These are
// the only three unauthenticated seller-domain endpoints: applying has to be
// open to anyone, and logging in is how a seller gets a token in the first
// place.
export async function sellerPublicRoutes(app: FastifyInstance) {
  app.post("/applications", applyAsSeller);
  app.post("/applications/upload-url", presignApplicationUpload);
  app.post("/auth/login", sellerLogin);
}
