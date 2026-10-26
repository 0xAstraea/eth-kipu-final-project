#!/usr/bin/env bash
# Showcase: run all Sepolia steps in order
set -e
cd "$(dirname "$0")/.."

for script in showcase/00-contracts.sh showcase/01-enroll.sh showcase/02-create-team.sh \
             showcase/03-apply-bob.sh showcase/04-accept-bob.sh showcase/05-apply-charlie.sh \
             showcase/06-accept-charlie.sh showcase/07-reveal.sh showcase/08-claim-bob.sh \
             showcase/09-claim-charlie.sh showcase/10-nft-verify.sh; do
  bash "$script"
done

echo "============================================================"
echo "  Sepolia showcase complete."
echo "============================================================"
echo ""