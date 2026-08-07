#!/bin/bash
export PATH="$PATH:$HOME/.foundry/bin"
cd ~/projects/arbitrum-hackathon
set -a
source .env
set +a

echo "== Chain ID =="
cast chain-id --rpc-url "$ARB_RPC"

ADDR=$(cast wallet address --private-key "$PRIVATE_KEY")
echo "== Deployer: $ADDR =="
echo "== Balance (ETH) =="
cast balance "$ADDR" --rpc-url "$ARB_RPC" -e
