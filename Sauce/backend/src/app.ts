import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { pool } from "./db.js";
import { env, isProd } from "./env.js";
import { HttpError } from "./lib/errors.js";
import { resolveSession, type SessionUser } from "./lib/session.js";
import { authRoutes } from "./routes/auth.js";
import { catalogRoutes } from "./routes/catalog.js";
import { checkoutRoutes } from "./routes/checkout.js";
import { creatorRoutes } from "./routes/creators.js";
import { devRoutes } from "./routes/dev.js";
import { libraryRoutes } from "./routes/library.js";
import { webhookRoutes } from "./routes/webhooks.js";

declare module "fastify" {
  interface FastifyRequest {
    user: SessionUser | null;
  }
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: isProd ? true : { transport: undefined },
    trustProxy: true,
  });

  await app.register(cors, {
    origin: env.CORS_ORIGIN.split(",").map((s) => s.trim()),
    credentials: true,
  });

  await app.register(cookie);

  await app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute",
    // Con varias replicas esto limita por pod, no globalmente. Para limitar de
    // verdad hace falta un store compartido (Redis); documentado en el README.
  });

  // El cuerpo crudo se conserva solo para webhooks: la firma HMAC se valida sobre
  // los bytes exactos que llegaron, no sobre el JSON reserializado.
  app.addHook("preParsing", async (request, _reply, payload) => {
    if (!request.url.startsWith("/api/webhooks/")) return payload;

    const chunks: Buffer[] = [];
    for await (const chunk of payload) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks);
    (request as { rawBody?: string }).rawBody = raw.toString("utf8");

    const { Readable } = await import("node:stream");
    return Readable.from(raw);
  });

  // Varios POST no llevan cuerpo (/access, /logout). Fastify rechaza por defecto
  // un `Content-Type: application/json` con cuerpo vacio, y casi cualquier cliente
  // — incluido nuestro `lib/api.ts` — pone esa cabecera en todas las peticiones.
  // Se trata el cuerpo vacio como `{}` en vez de convertirlo en un error.
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_request, body, done) => {
      if (!body || (typeof body === "string" && body.trim() === "")) {
        return done(null, {});
      }

      try {
        done(null, JSON.parse(body as string));
      } catch {
        const error = new HttpError(400, "invalid_json", "El cuerpo no es JSON valido");
        done(error, undefined);
      }
    },
  );

  app.decorateRequest("user", null);

  app.addHook("onRequest", async (request) => {
    const sessionId = request.cookies[env.SESSION_COOKIE];
    request.user = sessionId ? await resolveSession(pool, sessionId) : null;
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.status).send({ error: error.code, message: error.message });
    }

    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: "validation_error",
        message: "Datos invalidos",
        issues: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }

    // Fastify y sus plugins lanzan errores que ya traen su propio statusCode
    // (cuerpo malformado, payload demasiado grande, rate limit). Devolverlos como
    // 500 esconde un error del cliente detras de una alerta de servidor, y hace
    // que el reintento del cliente parezca razonable cuando no lo es.
    const fastifyError = error as { statusCode?: number; code?: string; message?: string };
    const status = fastifyError.statusCode;

    if (typeof status === "number" && status >= 400 && status < 500) {
      return reply.code(status).send({
        error: fastifyError.code ?? "bad_request",
        message: fastifyError.message ?? "Peticion invalida",
      });
    }

    reply.log.error(error);
    return reply.code(500).send({ error: "internal_error", message: "Error interno" });
  });

  // Liveness: el proceso responde. No consulta la base a proposito — si Postgres
  // se cae, Kubernetes no debe reiniciar los pods de la API en bucle.
  app.get("/health", async () => ({ status: "ok" }));

  // Readiness: puede atender trafico. Aqui si se consulta la base, porque un pod
  // sin base no debe recibir peticiones.
  app.get("/ready", async (_request, reply) => {
    try {
      await pool.query("SELECT 1");
      return { status: "ready" };
    } catch {
      return reply.code(503).send({ status: "not_ready" });
    }
  });

  await app.register(authRoutes);
  await app.register(catalogRoutes);
  await app.register(checkoutRoutes);
  await app.register(creatorRoutes);
  await app.register(libraryRoutes);
  await app.register(webhookRoutes);
  await app.register(devRoutes);

  return app;
}
