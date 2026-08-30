import type { FastifyInstance } from "fastify";
import { requireCustomer } from "../middleware/requireCustomer.js";
import { getCart, addItem, updateItem, removeItem } from "../controllers/cart.controller.js";

export async function cartRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireCustomer);
  app.get("/", getCart);
  app.post("/items", addItem);
  app.patch("/items/:id", updateItem);
  app.delete("/items/:id", removeItem);
}
