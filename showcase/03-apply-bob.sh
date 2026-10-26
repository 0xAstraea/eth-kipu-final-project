#!/usr/bin/env bash
# Showcase: Sepolia step 3 - Bob applies
set -e
cd "$(dirname "$0")/.."

echo ""
echo "============================================================"
echo "  Sepolia: step 3 - Bob applies"
echo "============================================================"
echo ""
echo "Bob applies with a ZK proof. The contract stores the nullifier, not the address."
echo "The proof authenticates the presentation and the claim commitment."
echo "The nullifier prevents double application without identifying Bob."
echo ""
echo "Transaction:"
echo "  0x1ef50695dc2b010ff3b7c66ffe04062b1fa3c752ea7ceabb1405f944d2d5fda3"
echo "  https://sepolia.etherscan.io/tx/0x1ef50695dc2b010ff3b7c66ffe04062b1fa3c752ea7ceabb1405f944d2d5fda3"
echo ""
echo "Next: run 'make sepolia-accept-bob' to accept."
echo ""