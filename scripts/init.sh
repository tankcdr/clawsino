#!/bin/sh
# Auto-deploy contracts on Docker startup and write addresses to shared volume
set -eu

RPC_URL="${RPC_URL:-http://localhost:8545}"
DEPLOYER_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
DEPLOYER_ADDR="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
GAME_SERVER_ADDR="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
PLAYER_ADDR="0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
OUTPUT_FILE="${CONTRACTS_FILE:-/data/contracts.json}"

echo "⏳ Waiting for anvil at $RPC_URL..."
for i in $(seq 1 60); do
    if cast chain-id --rpc-url "$RPC_URL" >/dev/null 2>&1; then
        echo "✅ Anvil is up (attempt $i)"
        break
    fi
    if [ "$i" = "60" ]; then
        echo "❌ Anvil not ready after 60s"
        exit 1
    fi
    sleep 1
done

echo "🚀 Deploying contracts..."
cd /contracts

# Install dependencies if lib/ is missing or empty
if [ ! -f "lib/forge-std/src/Script.sol" ]; then
    echo "📦 Installing forge dependencies..."
    git init --quiet 2>/dev/null || true
    forge install foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts --no-commit 2>/dev/null || true
fi

OUTPUT=$(DEPLOYER_PRIVATE_KEY="$DEPLOYER_KEY" GAME_SERVER_ADDRESS="$GAME_SERVER_ADDR" \
    forge script script/Deploy.s.sol:Deploy \
    --rpc-url "$RPC_URL" \
    --broadcast \
    --private-key "$DEPLOYER_KEY" \
    -vvv 2>&1) || true

echo "$OUTPUT"

# Extract addresses from forge output
USDC_ADDR=$(echo "$OUTPUT" | grep "MockUSDC deployed:" | awk '{print $NF}')
PAYOUT_ADDR=$(echo "$OUTPUT" | grep "ClawsinoPayout deployed:" | awk '{print $NF}')
VERIFIER_ADDR=$(echo "$OUTPUT" | grep "FairnessVerifier deployed:" | awk '{print $NF}')

if [ -z "$USDC_ADDR" ] || [ -z "$PAYOUT_ADDR" ]; then
    echo "❌ Failed to extract contract addresses"
    exit 1
fi

echo ""
echo "📋 Contract Addresses:"
echo "  USDC:      $USDC_ADDR"
echo "  Payout:    $PAYOUT_ADDR"
echo "  Verifier:  $VERIFIER_ADDR"

# Fund bankroll (100,000 USDC)
echo ""
echo "💰 Funding bankroll (100,000 USDC)..."
cast send "$USDC_ADDR" "approve(address,uint256)" "$PAYOUT_ADDR" 100000000000 \
    --rpc-url "$RPC_URL" --private-key "$DEPLOYER_KEY" > /dev/null
cast send "$PAYOUT_ADDR" "deposit(uint256)" 100000000000 \
    --rpc-url "$RPC_URL" --private-key "$DEPLOYER_KEY" > /dev/null
echo "✅ Bankroll funded"

# Fund player wallet with 10,000 USDC
echo ""
echo "🪙 Minting 10,000 USDC to player wallet..."
cast send "$USDC_ADDR" "mint(address,uint256)" "$PLAYER_ADDR" 10000000000 \
    --rpc-url "$RPC_URL" --private-key "$DEPLOYER_KEY" > /dev/null
echo "✅ Player funded: $PLAYER_ADDR"

# Write contract addresses to shared volume
mkdir -p "$(dirname "$OUTPUT_FILE")" 2>/dev/null || true
cat > "$OUTPUT_FILE" 2>/dev/null <<EOF
{
  "usdc": "$USDC_ADDR",
  "payout": "$PAYOUT_ADDR",
  "verifier": "$VERIFIER_ADDR",
  "deployer": "$DEPLOYER_ADDR",
  "gameServer": "$GAME_SERVER_ADDR",
  "player": "$PLAYER_ADDR"
}
EOF

echo ""
echo "📄 Wrote contract addresses to $OUTPUT_FILE"
echo "✅ Init complete!"
