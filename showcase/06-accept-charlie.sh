#!/usr/bin/env bash
# Showcase: Sepolia step 6 - accept Charlie
set -e
cd "$(dirname "$0")/.."

echo ""
echo "============================================================"
echo "  Sepolia: step 6 - accept Charlie"
echo "============================================================"
echo ""
echo "The team admin accepts Charlie by nullifier."
echo "The nullifier is the only key. The admin never learns Charlie's address."
echo "Acceptance adds the nullifier to the team member list."
echo ""
echo "Transaction:"
echo "  0x15cbc82070ce12e5341ce26a7195603f93de07648a62012413c3479da1c59823"
echo "  https://sepolia.etherscan.io/tx/0x15cbc82070ce12e5341ce26a7195603f93de07648a62012413c3479da1c59823"
echo ""
echo "Next: run 'make sepolia-reveal' to reveal the roster."
echo ""