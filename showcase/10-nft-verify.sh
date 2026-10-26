#!/usr/bin/env bash
# Showcase: Sepolia NFT ownership verification
set -e
cd "$(dirname "$0")/.."

echo ""
echo "============================================================"
echo "  Sepolia: verify NFT ownership"
echo "============================================================"
echo ""
echo "TeamCredential is verified on Etherscan."
echo "Open the contract. Go to Read contract."
echo "Call ownerOf(1) and ownerOf(2)."
echo ""
echo "Expected results:"
echo "  ownerOf(1) = 0xDf409B20C5C78a941fD3F42F44Ffba9c36D5D622 (Bob)"
echo "  ownerOf(2) = 0xeB32ACd8254D017256717E2ca2762D392F77c648 (Charlie)"
echo ""
echo "TeamCredential address:"
echo "  0x403FB7c8DE68E411A5aAfd08768d3fb70f2261F5"
echo "  https://sepolia.etherscan.io/address/0x403FB7c8DE68E411A5aAfd08768d3fb70f2261F5#readContract"
echo ""
echo "Done. Team #1 ran end to end on Sepolia."
echo ""