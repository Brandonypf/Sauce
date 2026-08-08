# How the three archives were merged

You had three zips that had diverged. This is what each contained, what survived,
and what didn't.

## What was in each

| Archive | Contents | Contracts |
|---|---|---|
| `Sauce-sauce-fixed` | Frontend + contracts | **Original** (RoyaltyManager, Counter) |
| `Sauce-backend-updates` | Contracts only, no frontend | **Original**, plus ABIs, local deployment, integration test |
| `Sauce-contracts-v2` | Everything: frontend, contracts, docs, Stylus | **Redesigned** (SettlementVault, no RoyaltyManager) |

## The actual conflict

This was not a file-level merge. `Sauce-backend-updates` built real tooling —
ABI exports, a local anvil deployment, an end-to-end integration test — **against
the architecture that `Sauce-contracts-v2` replaced.** Its `RoyaltyManager.json`
ABI, its `RoyaltyManager.t.sol`, and its `SauceIntegration.t.sol` all reference
contracts that no longer exist.

Merging by copying files would have produced a repo that doesn't compile. The
work in `backend-updates` had to be *ported*, not copied.

`Sauce-contracts-v2` is the base. Everything else was carried in on top.

---

## Carried forward from `Sauce-backend-updates`

**Integration test → rewritten for the fiat path.** The original walked
`buyLicense{value: 0.01 ether}` and asserted the 95/5 ETH split. That flow is
gone — the buyer pays by card and never touches ETH. `SauceIntegration.t.sol` now
walks the real seam: publish → pay off-chain → sign voucher → redeem → settle →
withdraw, 9 tests. The edge cases matter more than the happy path, so it covers
duplicate webhooks, forged vouchers, chargeback before *and* after redemption,
license permanence once the window closes, takedown not confiscating issued
licenses, and batch retry.

**ABI export → made reproducible.** The committed ABIs were stale build artifacts
including `RoyaltyManager.json`. Replaced with `contracts/script/export-abis.sh`,
which regenerates all five from source. ABIs stay versioned on purpose — the
frontend and backend import them and don't compile Solidity — but a stale ABI
fails at runtime with mis-decoded data rather than at compile time, so run the
script after every change to `src/`.

**Local deployment → made real.** `contracts.local.json` had anvil addresses for
the old four contracts. Added `script/DeployLocal.s.sol`, which deploys the mock
USDC and the full v2 stack and grants all roles in one shot, no env vars needed.
I ran it against anvil; the addresses in `contracts.local.json` are actual output,
not placeholders.

**`PLATFORM_ADDRESS` env var** — already covered. `Deploy.s.sol` takes
`SAUCE_TREASURY` plus `SAUCE_ADMIN`, `SAUCE_USDC`, `SAUCE_ISSUER`, `SAUCE_SETTLER`.

**The overpayment refund fix** — dropped, and this is a compliment. It correctly
fixed audit finding 4 by forwarding `price` instead of `msg.value` and refunding
the difference. But v2 has no payable purchase path at all, so the bug it fixed
no longer exists.

## Carried forward from `Sauce-sauce-fixed`

**The RPC fallback in `lib/wagmi.ts`.** Took it:

```ts
const rpcUrl = process.env.NEXT_PUBLIC_ARB_RPC ?? "https://sepolia-rollup.arbitrum.io/rpc";
```

Better than leaving it `undefined` — the app works out of the box without a
`.env`, and the intended chain is explicit rather than implied by wagmi's default.

## Deliberately not carried forward

**`frontend/app/page.tsx`.** It was back in `Sauce-sauce-fixed`, which
reintroduces the duplicate `/` route — it and `app/(marketing)/page.tsx` both
resolve to `/`, and `next build` fails on static export with
`Cannot read properties of undefined (reading 'clientModules')`. The file is not
lost; it lives at `app/(legacy)/prototype/page.tsx` and serves `/prototype`.

**This is still your call, and it's now been undone once.** If the glass/TitleBar
prototype is the real landing page, delete `app/(marketing)/page.tsx` and move the
prototype back — but only one of them can own `/`.

**`RoyaltyManager.sol` / `.t.sol`, `Counter.*`** — replaced by `SettlementVault`
and template leftovers respectively.

## One thing that was quietly broken

`.gitignore` contained a bare `docs/` line, inherited from the Foundry template
where it hides `forge doc` output. In this repo it also matched the root `docs/`
folder, so `CONTRACT-AUDIT.md` and `ONCHAIN-SCOPE.md` would have been silently
untracked — present on your disk, absent from the repo, invisible to anyone who
cloned it. Narrowed to `contracts/docs/`.

Also removed `contracts/.gitmodules`, which duplicated the root one. Only the root
file is used by git.

---

## Verified

- `forge build` compiles
- `forge test` → **45 passing** across 5 suites
- `forge fmt --check` → clean
- `DeployLocal` deploys against anvil and grants roles

**Not re-verified in this pass:** the frontend build. It is byte-identical to the
`Sauce-contracts-v2` copy that built cleanly, apart from the one-line wagmi
default. Run `npm install && npm run build` to confirm.

## Getting started

```bash
git submodule update --init --recursive

cd contracts
forge test
./script/export-abis.sh

anvil &
forge script script/DeployLocal.s.sol \
  --rpc-url http://127.0.0.1:8545 --broadcast \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

cd ../frontend && npm install && npm run dev
```

## Still open

1. **Which landing page owns `/`** — decided by default twice now, never by you.
2. **`electron@31` is EOL** (current 43.x). Not bumped; can't validate an Electron
   major here.
3. **The Stylus engine is uncompiled.** No Rust toolchain was reachable. Run
   `cargo stylus check` before trusting it.
4. **Batch sharding in `settleFromSales`** — the engine call is bounded by one
   block's gas. Past a few thousand records you need to shard by `batchId`. Worth
   deciding before you size settlement epochs around it.
5. **Design token mismatch** — `tailwind.config.ts` maps to CSS variables
   (`--bg-base`, `--accent-primary`) that `app/globals.css` never declares.
