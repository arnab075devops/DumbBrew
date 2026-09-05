import type { FastifyInstance } from "fastify";
import { searchProducts } from "../controllers/products.controller.js";

// Public, unauthenticated: product search is available to anonymous
// shoppers, same as browsing shop.html itself.
export async function productsRoutes(app: FastifyInstance) {
  app.get("/search", searchProducts);
}
