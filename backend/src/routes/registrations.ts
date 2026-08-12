import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createPublicClient, encodeFunctionData, http } from "viem";
import { arbitrumSepolia } from "viem/chains";
import { pool } from "../db.js";
import { env } from "../env.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { requireSession } from "../lib/session.js";

/**
 * Firma EIP-712 del creador para el registro on-chain.
 *
 * El creador firma; el relayer envia y paga el gas. Este endpoint es el punto de
 * entrega entre ambos: guarda la firma para que el relayer pueda reconstruir el
 * `RegisterRequest` byte a byte mas tarde.
 *
 * Todo lo que cubre la firma se guarda entero a proposito. Cambiar una coma del
 * titulo invalida la firma, asi que el relayer no puede recomponer los campos
 * desde `works`: tiene que usar exactamente los que se firmaron.
 */

const creatorRegistryAbi = [
  { type: "function", name: "isRegisteredCreator", stateMutability: "view", inputs: [{ name: "creator", type: "address" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "registerCreator", stateMutability: "nonpayable", inputs: [{ name: "name", type: "string" }, { name: "profileURI", type: "string" }, { name: "payout", type: "address" }], outputs: [] },
] as const;

const contentRegistryAbi = [
  { type: "function", name: "nonces", stateMutability: "view", inputs: [{ name: "creator", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
] as const;

function chainForEnv() {
  return env.CHAIN_ID === arbitrumSepolia.id ? arbitrumSepolia : { ...arbitrumSepolia, id: env.CHAIN_ID };
}

function publicChainClient() {
  return createPublicClient({ chain: chainForEnv(), transport: http(env.RPC_URL) });
}

const firmaBody = z.object({
  creatorAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  title: z.string().min(1),
  metadataURI: z.string().default(""),
  contentHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  referencePrice: z.string().regex(/^\d+$/).default("0"),
  nonce: z.string().regex(/^\d+$/),
  deadline: z.number().int().positive(),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
  chainId: z.number().int().positive(),
  verifyingContract: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

export async function registrationRoutes(app: FastifyInstance) {
  /**
   * Datos que el creador necesita para firmar.
   *
   * El `nonce` lo lee el frontend del contrato, no de aqui: la fuente de verdad
   * es la cadena, y devolver una copia de la base invitaria a que se
   * desincronizaran.
   */
  app.get("/api/works/:slug/registration", async (request) => {
    const user = requireSession(request.user);
    const { slug } = request.params as { slug: string };

    const { rows } = await pool.query<{
      id: string;
      title: string;
      content_hash: string;
      cover_url: string;
      price_minor: string;
      content_id: string | null;
      user_id: string;
      signed: boolean;
    }>(
      `SELECT w.id, w.title, w.content_hash, w.cover_url, w.price_minor,
              w.content_id, c.user_id,
              (r.work_id IS NOT NULL) AS signed
         FROM works w
         JOIN creators c ON c.id = w.creator_id
    LEFT JOIN content_registrations r ON r.work_id = w.id
        WHERE lower(w.slug) = lower($1)`,
      [slug],
    );

    const work = rows[0];
    if (!work) throw notFound("Obra no encontrada");
    if (work.user_id !== user.userId) throw forbidden("Esta obra no es tuya");

    const publicClient = publicChainClient();
    const creatorAddress = await pool.query<{ wallet: string | null }>(
      `SELECT wallet FROM users WHERE id = $1`,
      [user.userId],
    );
    const wallet = creatorAddress.rows[0]?.wallet;
    let nonce = "0";
    let registeredOnChain = false;
    if (wallet) {
      nonce = (await publicClient.readContract({
        address: env.CONTENT_REGISTRY_ADDRESS as `0x${string}`,
        abi: contentRegistryAbi,
        functionName: "nonces",
        args: [wallet as `0x${string}`],
      })).toString();
      registeredOnChain = await publicClient.readContract({
        address: env.CREATOR_REGISTRY_ADDRESS as `0x${string}`,
        abi: creatorRegistryAbi,
        functionName: "isRegisteredCreator",
        args: [wallet as `0x${string}`],
      });
    }

    return {
      workId: work.id,
      title: work.title,
      metadataURI: work.cover_url ?? "",
      contentHash: work.content_hash,
      referencePrice: "0",
      chainId: env.CHAIN_ID,
      verifyingContract: env.CONTENT_REGISTRY_ADDRESS,
      alreadySigned: work.signed,
      contentId: work.content_id,
      nonce,
      creatorAddress: wallet,
      registeredOnChain,
      creatorRegistryAddress: env.CREATOR_REGISTRY_ADDRESS,
    };
  });

  app.get("/api/creators/me/onchain", async (request) => {
    const user = requireSession(request.user);
    const { rows } = await pool.query<{ wallet: string | null; name: string }>(
      `SELECT u.wallet, c.name FROM users u JOIN creators c ON c.user_id = u.id WHERE u.id = $1`,
      [user.userId],
    );
    const row = rows[0];
    if (!row?.wallet) throw badRequest("wallet_required", "Vincula una wallet antes de publicar on-chain");
    const publicClient = publicChainClient();
    const registered = await publicClient.readContract({
      address: env.CREATOR_REGISTRY_ADDRESS as `0x${string}`,
      abi: creatorRegistryAbi,
      functionName: "isRegisteredCreator",
      args: [row.wallet as `0x${string}`],
    });
    return {
      wallet: row.wallet,
      registered,
      transaction: registered ? null : {
        to: env.CREATOR_REGISTRY_ADDRESS,
        data: encodeFunctionData({
          abi: creatorRegistryAbi,
          functionName: "registerCreator",
          args: [row.name, "", row.wallet as `0x${string}`],
        }),
      },
    };
  });

  app.post("/api/works/:slug/registration", async (request) => {
    const user = requireSession(request.user);
    const { slug } = request.params as { slug: string };
    const body = firmaBody.parse(request.body);

    const { rows } = await pool.query<{
      id: string;
      content_hash: string;
      user_id: string;
      wallet: string | null;
      content_id: string | null;
    }>(
      `SELECT w.id, w.content_hash, c.user_id, u.wallet, w.content_id
         FROM works w
         JOIN creators c ON c.id = w.creator_id
         JOIN users u ON u.id = c.user_id
        WHERE lower(w.slug) = lower($1)`,
      [slug],
    );

    const work = rows[0];
    if (!work) throw notFound("Obra no encontrada");
    if (work.user_id !== user.userId) throw forbidden("Esta obra no es tuya");
    if (work.content_id) throw badRequest("already_registered", "La obra ya esta en la cadena");

    // El hash tiene que ser el del archivo verificado, no uno que mande el
    // cliente: si no, se podria firmar la autoria de un archivo distinto del que
    // se subio.
    if (body.contentHash.toLowerCase() !== work.content_hash.toLowerCase()) {
      throw badRequest("hash_mismatch", "El hash firmado no es el del archivo subido");
    }

    // La direccion que firma debe ser la wallet vinculada a la cuenta. Sin esta
    // comprobacion, un creador podria atribuir su obra a la wallet de otro.
    if (work.wallet && body.creatorAddress.toLowerCase() !== work.wallet.toLowerCase()) {
      throw badRequest("wrong_signer", "La firma no corresponde a la wallet de tu cuenta");
    }

    await pool.query(
      `INSERT INTO content_registrations
         (work_id, creator_address, title, metadata_uri, content_hash,
          reference_price, nonce, deadline, signature, chain_id, verifying_contract)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (work_id) DO UPDATE SET
         creator_address = EXCLUDED.creator_address,
         title = EXCLUDED.title,
         metadata_uri = EXCLUDED.metadata_uri,
         content_hash = EXCLUDED.content_hash,
         reference_price = EXCLUDED.reference_price,
         nonce = EXCLUDED.nonce,
         deadline = EXCLUDED.deadline,
         signature = EXCLUDED.signature,
         chain_id = EXCLUDED.chain_id,
         verifying_contract = EXCLUDED.verifying_contract,
         signed_at = now()
       WHERE content_registrations.confirmed_at IS NULL`,
      [
        work.id,
        body.creatorAddress.toLowerCase(),
        body.title,
        body.metadataURI,
        body.contentHash.toLowerCase(),
        body.referencePrice,
        body.nonce,
        body.deadline,
        body.signature,
        body.chainId,
        body.verifyingContract.toLowerCase(),
      ],
    );

    // El trabajo ya se encolo al publicar; se despierta por si estaba esperando
    // la firma y agoto sus reintentos.
    await pool.query(
      `UPDATE outbox
          SET status = 'pending', next_attempt_at = now(), attempts = 0
        WHERE kind = 'register_content'
          AND payload->>'workId' = $1
          AND status IN ('pending', 'failed')`,
      [work.id],
    );

    return { signed: true, workId: work.id };
  });
}
