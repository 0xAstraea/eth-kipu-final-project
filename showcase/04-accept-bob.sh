#!/usr/bin/env bash
# Showcase: Sepolia step 4 - accept Bob
set -e
cd "$(dirname "$0")/.."

echo ""
echo "============================================================"
echo "  Sepolia: step 4 - accept Bob"
echo "============================================================"
echo ""
echo "The team admin accepts Bob by nullifier."
echo "The nullifier is the only key. The admin never learns Bob's address."
echo "Acceptance adds the nullifier to the team member list."
echo ""
echo "Transaction:"
echo "  0x5dd69a7427f0f0c0379c17afed8e1ba3327597e4d56386f0e95ea308419cd457"
echo "  https://sepolia.etherscan.io/tx/0x5dd69a7427f0f0c0379c17afed8e1ba3327597e4d56386f0e95ea308419cd457"
echo ""
echo "Next: run 'make sepolia-apply-charlie' to apply."
echo ""