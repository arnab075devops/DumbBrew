import type { FastifyInstance } from "fastify";
import { requireCustomer } from "../middleware/requireCustomer.js";
import { listWishlist, addWishlistItem, removeWishlistItem } from "../controllers/wishlist.controller.js";

export async function wishlistRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireCustomer);
  app.get("/", listWishlist);
  app.post("/items", addWishlistItem);
  app.delete("/items/:productId", removeWishlistItem);
}
