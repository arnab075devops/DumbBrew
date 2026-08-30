import type { FastifyInstance } from "fastify";
import { requireCustomer } from "../middleware/requireCustomer.js";
import {
  applyAsSeller,
  getMySeller,
  listMyProducts,
  createMyProduct,
  updateMyProduct,
  listMySales
} from "../controllers/sellers.controller.js";

export async function sellersRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireCustomer);
  app.post("/apply", applyAsSeller);
  app.get("/me", getMySeller);
  app.get("/products", listMyProducts);
  app.post("/products", createMyProduct);
  app.patch("/products/:id", updateMyProduct);
  app.get("/orders", listMySales);
}
