import { createHmac, timingSafeEqual } from "node:crypto";
import type { Db } from "../db.js";
import { env } from "../env.js";
import { conflict, notFound } from "./errors.js";
import { orderIdToBytes32, serializeVoucher, signVoucher } from "./voucher.js";

/**
 * Cumplimiento de una orden pagada.
 *
 * Todo lo de aqui asume que la pasarela va a entregar el mismo webhook varias
 * veces, fuera de orden, y a veces despues de que el usuario ya volvio a la
 * aplicacion. Eso no es un caso raro: es el comportamiento normal de Stripe y
 * Mercado Pago.
 */

export function verifyWebhookSignature(rawBody: string, header: string | undefined): boolean {
  if (!header) return false;

  const expected = createHmac("sha256", env.GATEWAY_WEBHOOK_SECRET).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(header, "utf8");

  // Longitudes distintas hacen que timingSafeEqual lance en vez de devolver false.
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

export interface FulfillResult {
  orderId: string;
  alreadyProcessed: boolean;
  voucher?: ReturnType<typeof serializeVoucher>;
}

/**
 * Marca la orden como pagada, crea el entitlement, firma el voucher y encola el
 * trabajo on-chain. Todo dentro de una transaccion.
 *
 * El orden importa. `gateway_events` se inserta primero: si ese INSERT choca con
 * el indice unico, el webhook ya se proceso y salimos sin tocar nada mas. Es lo
 * que convierte una entrega duplicada en una operacion sin efecto en vez de en dos
 * licencias emitidas.
 */
export async function fulfillOrder(
  db: Db,
  params: { provider: string; eventId: string; orderId: string; payload: unknown },
): Promise<FulfillResult> {
  const { provider, eventId, orderId, payload } = params;

  const eventInsert = await db.query(
    `INSERT INTO gateway_events (provider, event_id, order_id, payload)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (provider, event_id) DO NOTHING
     RETURNING id`,
    [provider, eventId, orderId, JSON.stringify(payload)],
  );

  if (!eventInsert.rowCount) {
    return { orderId, alreadyProcessed: true };
  }

  // FOR UPDATE serializa dos webhooks distintos que apunten a la misma orden.
  const { rows } = await db.query<{
    id: string;
    user_id: string;
    work_id: string;
    status: string;
    usdc_amount: string;
    content_id: string | null;
    wallet: string;
  }>(
    `SELECT o.id, o.user_id, o.work_id, o.status, o.usdc_amount, w.content_id, u.wallet
       FROM orders o
       JOIN works w ON w.id = o.work_id
       JOIN users u ON u.id = o.user_id
      WHERE o.id = $1
      FOR UPDATE OF o`,
    [orderId],
  );

  const order = rows[0];
  if (!order) throw notFound("Orden desconocida");

  if (order.status === "paid") {
    return { orderId, alreadyProcessed: true };
  }

  if (order.status !== "pending") {
    throw conflict("order_not_pending", `La orden esta en estado ${order.status}`);
  }

  await db.query("UPDATE orders SET status = 'paid', paid_at = now() WHERE id = $1", [orderId]);

  // El entitlement es la verdad sobre el acceso, y se crea aqui — no cuando el
  // usuario canjea. Si esperaramos al canje, alguien que pago no podria abrir su
  // contenido hasta conectar una wallet.
  await db.query(
    `INSERT INTO entitlements (user_id, work_id, order_id, source)
     VALUES ($1, $2, $3, 'purchase')
     ON CONFLICT (user_id, work_id) WHERE revoked_at IS NULL DO NOTHING`,
    [order.user_id, order.work_id, orderId],
  );

  let voucher: FulfillResult["voucher"];

  // Una obra recien publicada todavia puede no tener `content_id`: el registro
  // on-chain va por la cola y tarda. El entitlement ya se creo arriba, asi que el
  // comprador puede abrir su contenido igual — lo que falta es el recibo on-chain.
  // Se encola para firmarlo cuando la registracion confirme, en vez de negar la
  // compra o bloquear el webhook esperando a la cadena.
  if (!order.content_id) {
    await db.query(`INSERT INTO outbox (kind, payload) VALUES ('issue_voucher', $1)`, [
      JSON.stringify({ orderId }),
    ]);
  }

  if (order.content_id) {
    const expiry = BigInt(Math.floor(Date.now() / 1000) + env.VOUCHER_TTL_DAYS * 86_400);

    const payloadVoucher = {
      orderId: orderIdToBytes32(orderId),
      to: order.wallet as `0x${string}`,
      contentId: BigInt(order.content_id),
      amount: 1n,
      expiry,
    };

    const signature = await signVoucher(payloadVoucher);
    voucher = serializeVoucher(payloadVoucher, signature);

    await db.query(
      `INSERT INTO vouchers (order_id, to_address, content_id, amount, expiry, signature)
       VALUES ($1, $2, $3, $4, to_timestamp($5), $6)
       ON CONFLICT (order_id) DO NOTHING`,
      [
        orderId,
        payloadVoucher.to,
        order.content_id,
        1,
        Number(expiry),
        signature,
      ],
    );
  }

  // Se encola, no se envia. Escribir en la cadena dentro del handler del webhook
  // significa que un fallo de RPC devuelve 500, la pasarela reintenta, y el estado
  // queda a medias.
  await db.query(
    `INSERT INTO outbox (kind, payload) VALUES ('settle_order', $1)`,
    [JSON.stringify({ orderId, usdcAmount: order.usdc_amount })],
  );

  return { orderId, alreadyProcessed: false, voucher };
}

/**
 * Firma el voucher de una orden ya pagada cuya obra acaba de recibir su
 * `content_id`. Lo usa el relayer al confirmar `register_content`.
 */
export async function issueVoucherForOrder(db: Db, orderId: string): Promise<boolean> {
  const { rows } = await db.query<{ wallet: string; content_id: string | null }>(
    `SELECT u.wallet, w.content_id
       FROM orders o
       JOIN users u ON u.id = o.user_id
       JOIN works w ON w.id = o.work_id
      WHERE o.id = $1 AND o.status = 'paid'`,
    [orderId],
  );

  const row = rows[0];
  if (!row?.content_id) return false;

  const expiry = BigInt(Math.floor(Date.now() / 1000) + env.VOUCHER_TTL_DAYS * 86_400);

  const voucher = {
    orderId: orderIdToBytes32(orderId),
    to: row.wallet as `0x${string}`,
    contentId: BigInt(row.content_id),
    amount: 1n,
    expiry,
  };

  const signature = await signVoucher(voucher);

  const { rowCount } = await db.query(
    `INSERT INTO vouchers (order_id, to_address, content_id, amount, expiry, signature)
     VALUES ($1, $2, $3, 1, to_timestamp($4), $5)
     ON CONFLICT (order_id) DO NOTHING`,
    [orderId, voucher.to, row.content_id, Number(expiry), signature],
  );

  return Boolean(rowCount);
}
