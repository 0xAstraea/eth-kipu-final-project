#!/usr/bin/env bash
# Showcase: Sepolia step 5 - Charlie applies
set -e
cd "$(dirname "$0")/.."

echo ""
echo "============================================================"
echo "  Sepolia: step 5 - Charlie applies"
echo "============================================================"
echo ""
echo "Charlie applies with a ZK proof. The contract stores the nullifier, not the address."
echo "The proof authenticates the presentation and the claim commitment."
echo "The nullifier prevents double application without identifying Charlie."
echo ""
echo "Transaction:"
echo "  0x87b9a58be1085a1ed5d2adebc5b76281b9047cee83e9f6845d66d5f66f2ac00f"
echo "  https://sepolia.etherscan.io/tx/0x87b9a58be1085a1ed5d2adebc5b76281b9047cee83e9f6845d66d5f66f2ac00f"
echo ""
echo "Next: run 'make sepolia-accept-charlie' to accept."
echo ""