"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";

export function WalletButton() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openConnectModal, mounted }) => {
        const ready = mounted;
        return (
          <div
            aria-hidden={!ready}
            className={ready ? "flex items-center" : "pointer-events-none invisible"}
          >
            {(() => {
              if (!ready) return null;
              if (account && chain) {
                return (
                  <button
                    type="button"
                    onClick={openAccountModal}
                    className="inline-flex h-10 items-center gap-2 rounded-sm border border-default bg-bg-surface px-3 text-small text-text-primary transition-colors hover:bg-bg-elevated"
                  >
                    <span
                      className="block h-6 w-6 rounded-full bg-accent-soft"
                      aria-hidden="true"
                      style={{
                        backgroundImage:
                          "radial-gradient(circle at 30% 30%, var(--accent-primary), var(--accent-hover))",
                      }}
                    />
                    {account.displayName}
                  </button>
                );
              }
              return (
                <Button variant="primary" size="sm" onClick={openConnectModal}>
                  <Wallet className="h-4 w-4" />
                  Conectar
                </Button>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
