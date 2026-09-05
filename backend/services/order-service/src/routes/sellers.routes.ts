import type { FastifyInstance } from "fastify";
import { requireSeller } from "../middleware/requireSeller.js";
import { getMySeller, resetSellerPassword } from "../controllers/sellerAuth.controller.js";
import { presignSellerUpload } from "../controllers/uploads.controller.js";
import {
  listMyProducts,
  createMyProduct,
  updateMyProduct,
  deleteMyProduct,
  listMyCollections,
  createMyCollection,
  updateMyCollection,
  deleteMyCollection,
  listMySales,
  fulfillOrderItem,
  listMyNotices,
  acknowledgeNotice
} from "../controllers/sellers.controller.js";

// Everything here requires an approved seller's own JWT (see
// middleware/requireSeller.ts) — applying (public) and logging in (public)
// live in separate route files registered without this hook.
export async function sellersRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireSeller);
  app.get("/me", getMySeller);
  app.post("/auth/reset-password", resetSellerPassword);
  app.post("/uploads/presign", presignSellerUpload);

  app.get("/products", listMyProducts);
  app.post("/products", createMyProduct);
  app.patch("/products/:id", updateMyProduct);
  app.delete("/products/:id", deleteMyProduct);

  app.get("/collections", listMyCollections);
  app.post("/collections", createMyCollection);
  app.patch("/collections/:id", updateMyCollection);
  app.delete("/collections/:id", deleteMyCollection);

  app.get("/orders", listMySales);
  app.patch("/orders/:id/fulfill", fulfillOrderItem);

  app.get("/notices", listMyNotices);
  app.patch("/notices/:id/ack", acknowledgeNotice);
}
