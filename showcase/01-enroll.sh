#!/usr/bin/env bash
# Showcase: Sepolia step 1 - enroll members
set -e
cd "$(dirname "$0")/.."

echo ""
echo "============================================================"
echo "  Sepolia: step 1 - enroll members"
echo "============================================================"
echo ""
echo "The course owner enrolls the identity commitments of the students."
echo "The owner is the only one who can enroll members."
echo "Enrollment adds the commitment to the Semaphore group (LeanIMT)."
echo ""
echo "Transaction:"
echo "  0xdbce8248b0984abde2d501fc9ae2dd5d3a71cd8c27398d969561ce6fdc23162b"
echo "  https://sepolia.etherscan.io/tx/0xdbce8248b0984abde2d501fc9ae2dd5d3a71cd8c27398d969561ce6fdc23162b"
echo ""
echo "Next: run 'make sepolia-create' to create a team."
echo ""