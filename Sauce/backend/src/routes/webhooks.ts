import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { tx } from "../db.js";
import { fulfillOrder, verifyWebhookSignature } from "../lib/fulfillment.js";
import { badRequest } from "../lib/errors.js";

const payload = z.object({
  id: z.string().min(1),
  type: z.string(),
  data: z.object({ orderId: z.string().uuid() }),
});

export async function webhookRoutes(app: FastifyInstance) {
  app.post("/api/webhooks/:provider", async (request, reply) => {
    const { provider } = request.params as { provider: string };

    // La firma se valida sobre el cuerpo crudo, antes de parsear. Validar sobre el
    // objeto ya deserializado permite falsificaciones por reordenamiento de claves.
    const raw = (request as { rawBody?: string }).rawBody ?? JSON.stringify(request.body);
    const header = request.headers["x-sauce-signature"] as string | undefined;

    if (!verifyWebhookSignature(raw, header)) {
      throw badRequest("bad_signature", "Firma de webhook invalida");
    }

    const event = payload.parse(request.body);

    if (event.type !== "payment.succeeded") {
      // Se responde 200 igual: un 4xx haria que la pasarela reintente para siempre
      // un evento que nunca vamos a procesar.
      return reply.code(200).send({ ignored: true, type: event.type });
    }

    const result = await tx((db) =>
      fulfillOrder(db, {
        provider,
        eventId: event.id,
        orderId: event.data.orderId,
        payload: event,
      }),
    );

    return reply.code(200).send(result);
  });
}
