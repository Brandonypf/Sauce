# SAUCE Split Engine (Arbitrum Stylus)

Collapses a batch of already-collected fiat sales into one amount per creator,
applying each work's split rules. Returns the result to `SettlementVault`, which
holds the money and pays out. **This contract never touches funds.**

## Why Stylus here, and not for royalties generally

Your notes propose Stylus for "reparto de ganancias automatizadas." As written —
a 95/5 split and two transfers — Stylus buys nothing. That workload is dominated
by storage and external-call costs, which are identical in any language, and
Stylus adds activation overhead on top.

The real win is the **aggregation step before the transfers**. Collapsing 10,000
sales into 200 creator payouts needs a keyed accumulator over the batch. In
Solidity you either write to storage per record, or grow memory, which prices
quadratically. In Stylus the map lives in WASM memory, which is far cheaper, and
storage is written once per creator instead of once per sale.

So the split is deliberate:

- **Rust/Stylus** — the compute: parse, apply split tables, aggregate, round.
- **Solidity** — the money: custody, access control, transfers, accounting.

That boundary is also a safety property. `aggregate` is `view` and stateless with
respect to funds, so a bug in split policy cannot drain the vault. And the vault
does not trust the engine anyway: it re-sums the returned amounts and reverts if
they disagree with the engine's declared total (`EngineOverAllocated`).

Honest caveat: for small batches this loses to plain Solidity. The crossover is
somewhere in the low hundreds of records — measure before deploying, don't take
the architecture on faith.

## Batch format

Big-endian, tightly packed, no padding. On Arbitrum calldata is posted to L1 and
is usually the dominant cost, so the encoding is packed to the byte rather than
ABI-encoded.

```
[0]      version      u8   = 1
[1..3]   recordCount  u16

then recordCount × 26 bytes:
  [0..8]   contentId  u64
  [8..10]  region     u16   (0 = default split)
  [10..26] amount     u128  (token base units; 6 decimals for USDC)
```

A version byte in position 0 means an out-of-date backend fails loudly instead of
misreading bytes. Length is checked exactly, not as a minimum.

## Splits

`set_split(contentId, region, recipients[], bps[])`, owner-only. Basis points
must sum to exactly 10,000 — a split summing to less would leave money unassigned
and the vault's total check would reject the batch.

`region = 0` is the default. A sale in a region with no specific split falls back
to it. This covers "porcentajes dinámicos, splits por región" from your third
image without putting region policy in the vault.

Platform fee is **not** applied here. The vault applies it per payee at settlement
so there is a single place where the fee is defined and capped.

## Rounding

The last recipient receives `amount - distributed` rather than their percentage.
Without it, floor division leaves dust unassigned and the vault reverts because
the declared total doesn't match the sum. Same technique as `SettlementVault`,
and as the original `RoyaltyManager` — that part of the old code was right.

Output is ordered by address (`BTreeMap`, not a hash map) so the same batch always
produces identical calldata and the backend can diff its own computation against
the engine's.

## Build

```bash
rustup target add wasm32-unknown-unknown
cargo install --force cargo-stylus
cargo stylus check
cargo stylus deploy --private-key-path=<path>
```

Then point the vault at it: `SettlementVault.setSplitEngine(address)`.

> **Not compiled or verified.** No Rust toolchain was available in the environment
> where this was written, so it has never been through `cargo stylus check`. The
> logic and encoding are the parts worth reviewing; expect to fix API details.
> `stylus-sdk` moves between minor versions — in particular host access
> (`msg::sender()` vs `self.vm()`) and the storage macros changed recently, so
> pin the SDK version and reconcile against the docs for that exact release.
