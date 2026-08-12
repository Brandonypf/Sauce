# Audit of the original contracts

Findings against the four contracts as they were before the fiat redesign:
`CreatorRegistry`, `ContentRegistry`, `LicenseNFT`, `RoyaltyManager`.

Severity reflects impact on a live platform holding real money, not on a testnet demo.

| # | Contract | Issue | Severity |
|---|---|---|---|
| 1 | RoyaltyManager | Push payments let one creator brick their own catalogue | **High** |
| 2 | ContentRegistry | Deactivating content bricks every downstream read | **High** |
| 3 | — | No takedown path exists anywhere | **High** |
| 4 | LicenseNFT | Overpayment is silently swallowed | Medium |
| 5 | LicenseNFT | Event under-reports revenue | Medium |
| 6 | ContentRegistry | Price changes can front-run buyers | Medium |
| 7 | RoyaltyManager | Anyone can forge `RoyaltyPaid` events | Medium |
| 8 | LicenseNFT | CEI violation around external calls | Medium |
| 9 | LicenseNFT | Licenses freely transferable, never revocable | Medium |
| 10 | RoyaltyManager | Platform address is unrecoverable | Medium |
| 11 | CreatorRegistry | Suspension can be erased by re-registering | Low (latent) |
| 12 | LicenseNFT | Duplicated struct definition decodes silently wrong | Low |
| 13 | LicenseNFT | `uri()` always returns empty | Low |
| 14 | LicenseNFT | Dead `require`, wasted storage | Informational |

---

## 1. Push payments let one creator brick their own catalogue — High

```solidity
(bool creatorSuccess,) = creator.call{value: creatorAmount}("");
require(creatorSuccess, "Creator payment failed");
```

`distributeRoyalty` is called inline from `buyLicense`, so the buyer's transaction
only succeeds if the creator's address accepts ETH. If a creator registers a
Gnosis Safe with an expensive fallback, a contract with no `receive()`, or
anything that reverts, **every purchase of that creator's work reverts forever**.
The creator has no way to notice, and the failure looks like a platform bug.

The same applies to `platform`. If the treasury is ever migrated to a contract
that reverts, every sale on the entire platform stops.

**Fix:** pull payments. `SettlementVault` credits `accrued[payee]` and lets the
payee call `withdraw()`. A payee who cannot receive now only affects themselves.
Covered by `testRevertingPayeeDoesNotBlockOthers`.

## 2. Deactivating content bricks every downstream read — High

```solidity
function getContent(uint256 contentId) external view returns (Content memory) {
    require(contents[contentId].active, "Content not active");
    return contents[contentId];
}
```

This is the only way to read a content record, and it reverts once `active` is
false. Every consumer breaks at once: `LicenseNFT.buyLicense` can no longer
resolve the creator, and any future `uri()` implementation cannot resolve
metadata. Users who already paid would find their licenses unresolvable — the
exact opposite of the durability an on-chain license is supposed to provide.

Worse in combination with finding 3: because nothing can currently set `active`
to false, this is dormant. It activates the moment you add the takedown function
you legally need.

**Fix:** `getContent` now reverts only on `!exists`. Availability for sale is a
separate read, `isActive()`. Withdrawing a work stops new issuance and never
touches issued licenses.

## 3. No takedown path exists anywhere — High

`ContentStatusChanged` and `CreatorStatusChanged` are declared but never emitted,
because no function sets `active = false` on either registry. There is no way to
remove infringing content and no way to suspend a creator.

For a platform whose entire pitch is *licensed and consented* content, this is
the one function you are guaranteed to need under pressure, at the worst possible
moment. Your own notes flag licensing as "lo más crítico."

**Fix:** `ContentRegistry.setContentActive` (creator-controlled) and
`CreatorRegistry.setCreatorActive` behind `CURATOR_ROLE`. Both emit. Issued
licenses stay valid — takedown stops distribution, it does not retroactively
confiscate what buyers paid for.

## 4. Overpayment is silently swallowed — Medium

```solidity
require(msg.value >= price, "Insufficient payment");
royaltyManager.distributeRoyalty{value: msg.value}(payable(creator));
```

The check allows overpayment, then forwards the entire `msg.value`. Send 1 ETH
for a 0.01 ETH license and the extra 0.99 is distributed as revenue with no
refund. Frontends normally send the exact price, so this surfaces as rare,
unrecoverable, individually large losses — the worst failure shape for support.

**Fix:** the crypto purchase path is gone entirely; issuance is now settled
off-chain. Were it reinstated, it should require exact payment or refund the
difference.

## 5. Event under-reports revenue — Medium

```solidity
emit LicensePurchased(msg.sender, contentId, price);
```

`price` is emitted, but `msg.value` is what was distributed. Any indexer,
dashboard, or creator earnings report built on this event will disagree with the
chain whenever those differ — and finding 4 guarantees they sometimes will.
Accounting bugs that only appear in rare cases are the ones that get discovered
during a dispute.

**Fix:** `BatchSettled` and `Accrued` emit actual credited amounts, and the vault
asserts `netTotal + fee == gross` on every batch.

## 6. Price changes can front-run buyers — Medium

`updateContent` lets the creator change `price` at any time with no delay. A
creator watching the mempool can raise the price the moment a purchase appears.
The buyer's transaction reverts on `msg.value >= price` — griefing — or, if the
buyer padded their payment, the creator captures the padding via finding 4.

**Fix:** on-chain price is now `referencePrice`, explicitly documented as
non-binding. Real pricing lives in the backend where it varies by currency,
region, and promotion anyway, and the amount charged is fixed at checkout.

## 7. Anyone can forge `RoyaltyPaid` events — Medium

`distributeRoyalty` is `external payable` with no access control. Anyone can call
it with any creator address and 1 wei, emitting a real `RoyaltyPaid` event. No
funds are stolen — the caller donates — but creator earnings dashboards and any
subgraph indexing this event can be flooded with fabricated entries for a few
cents. Cheap to do, tedious to clean up.

**Fix:** `settleBatch` and `settleFromSales` are behind `SETTLER_ROLE`.

## 8. CEI violation around external calls — Medium

`buyLicense` calls out to `RoyaltyManager` (which calls out to the creator)
*before* `_mint`. A malicious creator contract re-enters `buyLicense` from its
fallback. Each re-entry needs its own `msg.value`, so there is no direct theft
path, but the ordering is wrong and `RoyaltyManager` has no `ReentrancyGuard`.
This is the kind of thing that is not exploitable until one refactor later.

**Fix:** state is written before any transfer, and `ReentrancyGuard` protects
withdrawals.

## 9. Licenses freely transferable, never revocable — Medium

Standard ERC-1155 transfers are enabled and `hasLicense` is a raw balance check.
Buy once, download, transfer the token to another account, repeat — resale of the
access right with no platform involvement and no creator royalty.

There is also no burn. A chargeback is unanswerable: the money reverses and the
license persists forever.

**Fix:** `revoke(orderId)` burns within a configurable window sized to card
chargeback deadlines (default 180 days). `cancelVoucher` handles the more common
case where the chargeback lands before redemption. After the window closes the
license is permanently the user's — deliberately, because a license the platform
can burn at any time is not meaningfully different from a database row.

## 10. Platform address is unrecoverable — Medium

`RoyaltyManager.platform` is set in the constructor with no setter. If that key
is lost or compromised, every future platform fee goes to a dead or hostile
address and the only remedy is redeploying and migrating.

**Fix:** `setTreasury` behind `DEFAULT_ADMIN_ROLE`, plus `MAX_FEE_BPS = 3000` as
a hard cap that not even the admin can exceed.

## 11. Suspension can be erased by re-registering — Low (latent)

```solidity
require(!creators[msg.sender].active, "Creator already registered");
```

The guard tests `active`, not existence. Today nothing sets `active = false`, so
it holds. Add the suspension function from finding 3 and a suspended creator can
call `registerCreator` again, overwrite their record, and come back clean.

**Fix:** separate `exists` and `active` flags; registration checks `exists`.

## 12. Duplicated struct definition decodes silently wrong — Low

`LicenseNFT.sol` redeclares `IContentRegistry.Content` field by field. Reorder or
insert a field in the real `ContentRegistry` and this still compiles, still
decodes, and returns garbage — `creator` might read a price. Silent corruption of
who gets paid.

**Fix:** the new interface exposes narrow accessors (`exists`,
`metadataURIOf`, `creatorOf`) instead of copying a struct layout.

## 13. `uri()` always returns empty — Low

`ERC1155("")` with no override. Every wallet and marketplace shows the license as
an unnamed blank token, despite `metadataURI` sitting in `ContentRegistry`.

**Fix:** `uri()` delegates to `contentRegistry.metadataURIOf(contentId)`.

## 14. Dead `require`, wasted storage — Informational

`require(active, "Content inactive")` in `buyLicense` is unreachable:
`getContent` already reverted if inactive (finding 2). Reading as a guarantee
when it is dead code is how the real gap in finding 2 stayed invisible.

`name` and `symbol` are `public string` storage variables rather than constants,
costing an SSTORE each at deploy and an SLOAD per read for values that never
change.

---

## Not bugs

Worth recording so they do not get "fixed" later:

- `creatorAmount = (msg.value * 95) / 100; platformAmount = msg.value - creatorAmount;`
  is correct. Deriving the second share by subtraction rather than a second
  percentage means rounding dust always lands with the platform and the two shares
  always sum exactly to the input. `SettlementVault` uses the same technique per
  payee, and the Stylus engine gives the last recipient the remainder for the same
  reason.
- Starting `nextContentId` at 1 via pre-increment, so `id == 0` means "does not
  exist", is a sound sentinel.
