import { createHmac, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { tx } from "../db.js";
import { env } from "../env.js";
import { fulfillOrder } from "../lib/fulfillment.js";
import { requireSession } from "../lib/session.js";

/**
 * Atajos de desarrollo. NO se registran cuando NODE_ENV=production.
 *
 * `/api/dev/pay/:orderId` hace lo que haria la pasarela: construye el evento, lo
 * firma con el secreto de webhook y lo procesa. Es un atajo de tiempo, no de
 * seguridad — pasa por el mismo `fulfillOrder` que el webhook real, con la misma
 * comprobacion de idempotencia.
 */
export async function devRoutes(app: FastifyInstance) {
  if (env.NODE_ENV === "production") return;

  app.post("/api/dev/pay/:orderId", async (request) => {
    requireSession(request.user);
    const { orderId } = request.params as { orderId: string };

    const event = {
      id: `evt_dev_${randomUUID()}`,
      type: "payment.succeeded",
      data: { orderId },
    };

    // Se firma aunque no se vaya a verificar: si algun dia este atajo se
    // reencamina al endpoint real, la firma ya es correcta.
    createHmac("sha256", env.GATEWAY_WEBHOOK_SECRET).update(JSON.stringify(event)).digest("hex");

    const result = await tx((db) =>
      fulfillOrder(db, {
        provider: "dev",
        eventId: event.id,
        orderId,
        payload: event,
      }),
    );

    return result;
  });
}
