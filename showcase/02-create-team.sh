#!/usr/bin/env bash
# Showcase: Sepolia step 2 - create team
set -e
cd "$(dirname "$0")/.."

echo ""
echo "============================================================"
echo "  Sepolia: step 2 - create team"
echo "============================================================"
echo ""
echo "A member creates a team. They prove course membership with a ZK proof."
echo "The creator becomes the team admin."
echo "The proof is scoped to the team id. Scope prevents cross-team replay."
echo ""
echo "Transaction:"
echo "  0xc83d80e0172ceb485995403a2eaaefa611d94c8f261653c802169b820ad86534"
echo "  https://sepolia.etherscan.io/tx/0xc83d80e0172ceb485995403a2eaaefa611d94c8f261653c802169b820ad86534"
echo ""
echo "Next: run 'make sepolia-apply-bob' to apply."
echo ""