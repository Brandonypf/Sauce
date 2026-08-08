# What belongs on-chain

You asked me to pick the settlement model rather than choosing from the list. The
recommendation is **fiat-first, with the chain as provenance and payout rail** —
not "chain as receipt only," because the receipt is the least valuable half.

## The test

For each piece of state, ask: **does this need to remain true and verifiable if
SAUCE disappears, or if someone doesn't trust SAUCE?**

Yes → on-chain. No → Postgres, which is faster, cheaper, private, mutable, and
subject to GDPR deletion requests that a blockchain cannot honour.

Applied to your flow, four things pass and the rest fail.

## On-chain

**1. Creator identity and payout address** — `CreatorRegistry`

The claim "this wallet is the creator of this work" has to be independently
checkable. Payout address is kept separate from identity so a creator can be
paid into a multisig or cold wallet without moving their account.

**2. Content provenance** — `ContentRegistry`

`(creator, contentHash, timestamp)` is a timestamped authorship commitment. This
is the single highest-value thing you put on-chain, and it has nothing to do with
payments. Your first image says licensing and consent are the most critical part
of the project and unrelated to tokens — correct, but an immutable public record
of *who published what, and when they attested they had the rights* is exactly
where a chain helps a licensed-content platform. It is the difference between
"trust our moderation" and "here is the receipt, verify it yourself."

Note `contentIdByHash` also makes re-uploads of the same file detectable.

**3. License issuance as a durable receipt** — `LicenseNFT`

Proof that a specific wallet was granted rights to a specific work, which outlives
your servers. The revocation window matters here: bounded so chargebacks are
answerable, expiring so that afterwards the license is genuinely the user's and
nobody can burn it. An unbounded revocation power would make "your license lives
on the blockchain" marketing rather than fact.

**4. Settlement and splits** — `SettlementVault`

This is where the chain earns its cost. Creators see exactly what they were paid
and on what basis, splits between co-authors execute without trusting your
accounting, and payouts are pull-based so you cannot quietly withhold. It is a
public, auditable ledger of creator revenue — a real competitive claim against
platforms where payout disputes are unfalsifiable.

## Off-chain

Orders, order state machine, fiat amounts, the locked FX rate, gateway
references, invoices, vouchers, PII, and refunds.

Two that need arguing:

**Price.** Prices vary by currency, region, and promotion, and change constantly.
On-chain price also creates the front-running window in finding 6 of the audit.
`referencePrice` exists for a possible crypto-native path and is documented as
non-binding.

**Access control to the content itself.** This is the one people get wrong. A
token balance cannot gate a file. Anyone can read `balanceOf` but only your
server can decide whether to hand over bytes, so entitlement checks and
short-lived signed URLs stay in the backend regardless of what the chain says.
The license is a *receipt*, not a key. The moment you treat `hasLicense` as your
DRM, you have neither.

## What this costs you in honesty

Fiat-first means the platform receives fiat and converts it. **You are custodial
for that leg**, and no contract design changes it. The vault makes everything
verifiable from the moment USDC lands, and payouts non-custodial from there —
but the fiat-to-USDC hop is a regulated money-services activity, which is exactly
the KYC/AML point in your first image. That is a licensing question, not an
architecture question, and it does not have a technical workaround.

Also: **do not write per-sale.** Beyond cost, a transaction per purchase publishes
every user's buying history permanently, linked to their wallet. For otaku and
adult-adjacent content that is a genuine harm, not a privacy nicety. Batch by
epoch — daily or weekly — and the individual purchase stays in your database
where it belongs.

## Concretely

| | Where | Frequency |
|---|---|---|
| Creator registration | Chain | Once per creator |
| Content publication | Chain | Once per work |
| License issuance | Chain | Per purchase, user-triggered redemption |
| Revenue settlement | Chain | Batched per epoch |
| Order / payment / FX | Postgres | Per purchase |
| Entitlement check | Backend | Per access |
| Content delivery | Signed URL | Per access |

## Sequence

```
checkout  →  gateway  →  webhook (idempotent)
                            ↓
                     order PAID in Postgres
                            ↓
              backend signs EIP-712 LicenseVoucher
                            ↓
                user redeems → LicenseNFT.redeem()
                            ↓
        epoch closes → SplitEngine.aggregate → settleBatch
                            ↓
                   creator calls withdraw()
```

The voucher is what your diagram's "license code" should become. A signed EIP-712
message instead of a random string in a database: unforgeable, single-use by
construction, verifiable by the user before they redeem, and no brute-force
surface because there is no secret to guess.
