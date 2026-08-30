import type { FastifyInstance } from "fastify";
import { requireCustomer } from "../middleware/requireCustomer.js";
import { listAddresses, createAddress, updateAddress, deleteAddress } from "../controllers/addresses.controller.js";

export async function addressesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireCustomer);
  app.get("/", listAddresses);
  app.post("/", createAddress);
  app.patch("/:id", updateAddress);
  app.delete("/:id", deleteAddress);
}
