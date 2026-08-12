import { randomUUID } from "node:crypto";
import { encodeFunctionData } from "viem";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { isUniqueViolation, pool, tx } from "../db.js";
import { env } from "../env.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { requireSession } from "../lib/session.js";

const body = z.object({
  slug: z.string().min(1),
  idempotencyKey: z.string().uuid(),
});

const licenseAbi = [
  {
    type: "function",
    name: "redeem",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "voucher",
        type: "tuple",
        components: [
          { name: "orderId", type: "bytes32" },
          { name: "to", type: "address" },
          { name: "contentId", type: "uint256" },
          { name: "amount", type: "uint256" },
          { name: "expiry", type: "uint64" },
        ],
      },
      { name: "signature", type: "bytes" },
    ],
    outputs: [{ name: "holder", type: "address" }],
  },
] as const;

export async function checkoutRoutes(app: FastifyInstance) {
  app.post("/api/checkout", async (request) => {
    const user = requireSession(request.user);
    const { slug, idempotencyKey } = body.parse(request.body);

    const { rows } = await pool.query(
      `SELECT id, price_minor, price_currency, status FROM works WHERE lower(slug) = lower($1)`,
      [slug],
    );

    const work = rows[0];
    if (!work) throw notFound("Obra no encontrada");
    if (work.status !== "published") throw badRequest("not_for_sale", "La obra no esta a la venta");

    const owned = await pool.query(
      `SELECT 1 FROM entitlements WHERE user_id = $1 AND work_id = $2 AND revoked_at IS NULL`,
      [user.userId, work.id],
    );
    if (owned.rowCount) throw conflict("already_owned", "Ya tienes esta obra");

    // El tipo de cambio se congela aqui, al abrir el checkout, y se guarda con la
    // orden. Recalcularlo al liquidar haria que lo que se le debe al creador
    // dejara de coincidir con lo que pago el comprador.
    /**
     * Obra gratuita: no genera orden.
     *
     * No es un atajo. Una orden representa un cobro, y `orders.amount_minor > 0`
     * lo dice explicitamente en el esquema. Crear una orden de 0 chocaba con esa
     * restriccion y el usuario recibia un 500 sin explicacion.
     *
     * Se resolvio asi y NO relajando el CHECK a `>= 0`, porque eso abriria la
     * puerta a ordenes de importe cero por otros caminos —un precio mal
     * calculado, un descuento erroneo— sin que nada las detecte. La restriccion
     * es correcta; lo que estaba mal era pasar por ella.
     *
     * El entitlement se crea igual, con `source = 'grant'`, asi que biblioteca,
     * control de acceso y lector funcionan sin ningun cambio.
     */
    if (Number(work.price_minor) === 0) {
      const yaTenia = await tx(async (db) => {
        const { rowCount } = await db.query(
          `INSERT INTO entitlements (user_id, work_id, source)
           VALUES ($1, $2, 'grant')
           ON CONFLICT (user_id, work_id) WHERE revoked_at IS NULL DO NOTHING`,
          [user.userId, work.id],
        );

        return rowCount === 0;
      });

      return {
        free: true,
        entitled: true,
        alreadyOwned: yaTenia,
        orderId: null,
        redirectUrl: null,
        amountMinor: 0,
        currency: work.price_currency,
        usdcAmount: 0,
        fxRate: 0,
      };
    }

    const fxRate = env.FX_PEN_TO_USDC;
    const usdcAmount = Math.round(Number(work.price_minor) * fxRate * 10_000);

    try {
      const order = await tx(async (db) => {
        const inserted = await db.query<{ id: string }>(
          `INSERT INTO orders
             (user_id, work_id, currency, amount_minor, fx_rate, fx_locked_at,
              usdc_amount, gateway, idempotency_key)
           VALUES ($1, $2, $3, $4, $5, now(), $6, $7, $8)
           RETURNING id`,
          [
            user.userId,
            work.id,
            work.price_currency,
            work.price_minor,
            fxRate,
            usdcAmount,
            "mock",
            idempotencyKey,
          ],
        );

        return inserted.rows[0]!.id;
      });

      return {
        orderId: order,
        // En produccion esto lo devuelve la pasarela. La forma es la misma: el
        // usuario se va del sitio y vuelve por el redirect.
        redirectUrl: `${env.CORS_ORIGIN}/checkout/mock/?order=${order}`,
        amountMinor: Number(work.price_minor),
        currency: work.price_currency,
        usdcAmount,
        fxRate,
      };
    } catch (error) {
      // Doble clic en "Comprar": la segunda peticion choca con el indice unico y
      // se le devuelve la orden que ya existe, no un error.
      if (isUniqueViolation(error, "orders_idempotency_key")) {
        const existing = await pool.query(
          `SELECT id, amount_minor, currency, usdc_amount, fx_rate
             FROM orders WHERE idempotency_key = $1`,
          [idempotencyKey],
        );

        const row = existing.rows[0]!;
        return {
          orderId: row.id,
          redirectUrl: `${env.CORS_ORIGIN}/checkout/mock/?order=${row.id}`,
          amountMinor: Number(row.amount_minor),
          currency: row.currency,
          usdcAmount: Number(row.usdc_amount),
          fxRate: Number(row.fx_rate),
          deduplicated: true,
        };
      }

      if (isUniqueViolation(error, "orders_one_pending_per_work")) {
        throw conflict("pending_order_exists", "Ya tienes una orden pendiente de esta obra");
      }

      throw error;
    }
  });

  app.get("/api/orders/:id", async (request) => {
    const user = requireSession(request.user);
    const { id } = request.params as { id: string };

    const { rows } = await pool.query(
      `SELECT o.id, o.status, o.currency, o.amount_minor, o.usdc_amount,
              o.created_at, o.paid_at, w.slug, w.title,
              v.signature, v.content_id, v.expiry, v.to_address,
              v.redeemed_at, v.cancelled_at
         FROM orders o
         JOIN works w ON w.id = o.work_id
    LEFT JOIN vouchers v ON v.order_id = o.id
        WHERE o.id = $1 AND o.user_id = $2`,
      [id, user.userId],
    );

    const row = rows[0];
    if (!row) throw notFound("Orden no encontrada");

    return {
      order: {
        id: row.id,
        status: row.status,
        currency: row.currency,
        amountMinor: Number(row.amount_minor),
        usdcAmount: Number(row.usdc_amount),
        slug: row.slug,
        title: row.title,
        createdAt: row.created_at,
        paidAt: row.paid_at,
      },
      voucher: row.signature
        ? {
            orderId: id,
            to: row.to_address,
            contentId: String(row.content_id),
            amount: "1",
            expiry: String(Math.floor(new Date(row.expiry).getTime() / 1000)),
            signature: row.signature,
            redeemedAt: row.redeemed_at,
            cancelledAt: row.cancelled_at,
          }
        : null,
    };
  });

  app.get("/api/orders/:id/redeem-tx", async (request) => {
    const user = requireSession(request.user);
    const { id } = request.params as { id: string };

    const { rows } = await pool.query<{
      signature: string | null;
      content_id: string | null;
      expiry: Date | null;
      to_address: string | null;
      redeemed_at: Date | null;
      cancelled_at: Date | null;
    }>(
      `SELECT v.signature, v.content_id, v.expiry, v.to_address, v.redeemed_at, v.cancelled_at
         FROM vouchers v JOIN orders o ON o.id = v.order_id
        WHERE o.id = $1 AND o.user_id = $2`,
      [id, user.userId],
    );

    const voucher = rows[0];
    if (!voucher?.signature || !voucher.content_id || !voucher.to_address) {
      throw notFound("Todavia no hay voucher para esta orden");
    }
    if (voucher.redeemed_at) throw conflict("voucher_redeemed", "La licencia ya fue canjeada");
    if (voucher.cancelled_at) throw conflict("voucher_cancelled", "El voucher fue cancelado");

    const orderId = `0x${id.replaceAll("-", "").padEnd(64, "0")}` as `0x${string}`;
    const expiry = Math.floor(new Date(voucher.expiry!).getTime() / 1000);
    const data = encodeFunctionData({
      abi: licenseAbi,
      functionName: "redeem",
      args: [{
        orderId,
        to: voucher.to_address as `0x${string}`,
        contentId: BigInt(voucher.content_id),
        amount: 1n,
        expiry: BigInt(expiry),
      }, voucher.signature as `0x${string}`],
    });

    return {
      to: env.LICENSE_NFT_ADDRESS,
      data,
      chainId: env.CHAIN_ID,
      voucher: { contentId: voucher.content_id, expiry, to: voucher.to_address },
    };
  });

  app.post("/api/orders/:id/redeemed", async (request) => {
    const user = requireSession(request.user);
    const { id } = request.params as { id: string };
    const { txHash } = z.object({ txHash: z.string() }).parse(request.body);

    // Solo registro: la verdad de si se canjeo esta en la cadena. Esto sirve para
    // no volver a mostrarle el boton al usuario.
    const { rowCount } = await pool.query(
      `UPDATE vouchers v
          SET redeemed_at = now(), redeem_tx = $3
         FROM orders o
        WHERE v.order_id = o.id AND o.id = $1 AND o.user_id = $2
          AND v.redeemed_at IS NULL`,
      [id, user.userId, txHash],
    );

    return { recorded: Boolean(rowCount) };
  });
}
