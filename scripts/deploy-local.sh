#!/usr/bin/env bash
# Deploy contracts to local anvil and fund test wallets
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

RPC_URL="${RPC_URL:-http://localhost:8545}"
# Anvil default accounts
DEPLOYER_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
DEPLOYER_ADDR="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
GAME_SERVER_ADDR="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"

echo "⏳ Waiting for anvil..."
for i in $(seq 1 30); do
    if cast chain-id --rpc-url "$RPC_URL" &>/dev/null; then
        echo "✅ Anvil is up"
        break
    fi
    sleep 1
done

echo "🚀 Deploying contracts..."
cd "$ROOT_DIR/contracts"

OUTPUT=$(forge script script/Deploy.s.sol:Deploy \
    --rpc-url "$RPC_URL" \
    --broadcast \
    --private-key "$DEPLOYER_KEY" \
    -vvv 2>&1)

echo "$OUTPUT"

# Extract addresses from output
USDC_ADDR=$(echo "$OUTPUT" | grep "MockUSDC deployed:" | awk '{print $NF}')
PAYOUT_ADDR=$(echo "$OUTPUT" | grep "ClawsinoPayout deployed:" | awk '{print $NF}')
VERIFIER_ADDR=$(echo "$OUTPUT" | grep "FairnessVerifier deployed:" | awk '{print $NF}')

echo ""
echo "📋 Contract Addresses:"
echo "  USDC:      $USDC_ADDR"
echo "  Payout:    $PAYOUT_ADDR"
echo "  Verifier:  $VERIFIER_ADDR"

# Fund the payout contract with bankroll
echo ""
echo "💰 Funding bankroll (100,000 USDC)..."
cast send "$USDC_ADDR" "approve(address,uint256)" "$PAYOUT_ADDR" 100000000000 \
    --rpc-url "$RPC_URL" --private-key "$DEPLOYER_KEY" > /dev/null
cast send "$PAYOUT_ADDR" "deposit(uint256)" 100000000000 \
    --rpc-url "$RPC_URL" --private-key "$DEPLOYER_KEY" > /dev/null
echo "✅ Bankroll funded"

# Mint USDC to test wallets (anvil accounts 2-5)
TEST_WALLETS=(
    "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
    "0x90F79bf6EB2c4f870365E785982E1f101E93b906"
    "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65"
    "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc"
)

echo ""
echo "🪙 Minting test USDC to wallets..."
for wallet in "${TEST_WALLETS[@]}"; do
    cast send "$USDC_ADDR" "mint(address,uint256)" "$wallet" 10000000000 \
        --rpc-url "$RPC_URL" --private-key "$DEPLOYER_KEY" > /dev/null
    echo "  Funded $wallet with 10,000 USDC"
done

echo ""
echo "✅ Local deployment complete!"
echo ""
echo "# Add to .env:"
echo "USDC_ADDRESS=$USDC_ADDR"
echo "PAYOUT_ADDRESS=$PAYOUT_ADDR"
echo "VERIFIER_ADDRESS=$VERIFIER_ADDR"
