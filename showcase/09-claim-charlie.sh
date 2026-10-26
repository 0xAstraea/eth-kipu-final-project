#!/usr/bin/env bash
# Showcase: Sepolia step 9 - Charlie claims NFT
set -e
cd "$(dirname "$0")/.."

echo ""
echo "============================================================"
echo "  Sepolia: step 9 - Charlie claims NFT"
echo "============================================================"
echo ""
echo "Charlie claims the credential NFT. The NFT goes to a separate address."
echo "The claim uses commit-reveal. The destination is fixed at application time."
echo "The NFT recipient is not Charlie's main account."
echo ""
echo "Recipient: 0xeB32ACd8254D017256717E2ca2762D392F77c648"
echo ""
echo "Transaction:"
echo "  0xcafb93a6945ce5ed76d1a453cf82b6200f6a64784ff9be7a394f5b545858747e"
echo "  https://sepolia.etherscan.io/tx/0xcafb93a6945ce5ed76d1a453cf82b6200f6a64784ff9be7a394f5b545858747e"
echo ""
echo "Next: run 'make sepolia-nft' to verify NFT ownership."
echo ""