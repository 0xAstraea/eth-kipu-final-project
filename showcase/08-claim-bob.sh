#!/usr/bin/env bash
# Showcase: Sepolia step 8 - Bob claims NFT
set -e
cd "$(dirname "$0")/.."

echo ""
echo "============================================================"
echo "  Sepolia: step 8 - Bob claims NFT"
echo "============================================================"
echo ""
echo "Bob claims the credential NFT. The NFT goes to a separate address."
echo "The claim uses commit-reveal. The destination is fixed at application time."
echo "The NFT recipient is not Bob's main account."
echo ""
echo "Recipient: 0xDf409B20C5C78a941fD3F42F44Ffba9c36D5D622"
echo ""
echo "Transaction:"
echo "  0x79d9d24a569008ba368c4616f925c2731ec953e7d1820acb195f7d7586cc45de"
echo "  https://sepolia.etherscan.io/tx/0x79d9d24a569008ba368c4616f925c2731ec953e7d1820acb195f7d7586cc45de"
echo ""
echo "Next: run 'make sepolia-claim-charlie' to claim."
echo ""