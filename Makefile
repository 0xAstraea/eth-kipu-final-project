# TeamUp ZK — common tasks
# Requires: Node 20+, pnpm, GNU Make
# Testnet: fill contracts/.env (see contracts/.env.example)

PNPM ?= pnpm

ifeq ($(OS),Windows_NT)
  GIT_BASH := $(wildcard C:/Program Files/Git/bin/bash.exe)
  ifneq ($(GIT_BASH),)
    SHELL := $(GIT_BASH)
  endif
endif

.DEFAULT_GOAL := help

.PHONY: help install setup test test-contracts test-frontend coverage \
	check build compile lint typecheck \
	node demo deploy-local interact-local sync abis frontend \
	deploy verify verify-all interact testnet slither gas \
	sepolia sepolia-contracts sepolia-enroll sepolia-create \
	sepolia-apply-bob sepolia-accept-bob sepolia-apply-charlie \
	sepolia-accept-charlie sepolia-reveal sepolia-claim-bob \
	sepolia-claim-charlie sepolia-nft

help:
	$(info TeamUp ZK)
	$(info )
	$(info Setup)
	$(info   make install          Install workspace deps)
	$(info   make setup            Install + create .env files from examples)
	$(info )
	$(info Quality)
	$(info   make test             All tests (contracts + frontend))
	$(info   make coverage         Contract coverage)
	$(info   make check            Typecheck + lint + tests)
	$(info   make build            Compile contracts + build frontend)
	$(info   make slither          Static analysis)
	$(info )
	$(info Local)
	$(info   make node             Hardhat local chain)
	$(info   make deploy-local     Deploy to localhost)
	$(info   make interact-local   Full flow on localhost)
	$(info   make sync             Export ABIs + write frontend/.env.local)
	$(info   make frontend         Next.js dev server)
	$(info   make demo             Narrated local demo)
	$(info )
	$(info Testnet (Sepolia))
	$(info   make deploy           Deploy)
	$(info   make verify           Verify own contracts)
	$(info   make verify-all       Verify own + Semaphore stack)
	$(info   make interact         Full flow (prints tx hashes))
	$(info   make testnet          deploy + verify + interact)
	$(info )
	$(info Showcase (Sepolia txs))
	$(info   make sepolia          All steps in order)
	$(info   make sepolia-contracts   Contract addresses)
	$(info   make sepolia-enroll      Step 1: enroll members)
	$(info   make sepolia-create      Step 2: create team)
	$(info   make sepolia-apply-bob   Step 3: Bob applies)
	$(info   make sepolia-accept-bob  Step 4: accept Bob)
	$(info   make sepolia-apply-charlie  Step 5: Charlie applies)
	$(info   make sepolia-accept-charlie Step 6: accept Charlie)
	$(info   make sepolia-reveal      Step 7: reveal roster)
	$(info   make sepolia-claim-bob   Step 8: Bob claims NFT)
	$(info   make sepolia-claim-charlie Step 9: Charlie claims NFT)
	$(info   make sepolia-nft         Verify NFT ownership)
	@exit 0

install:
	$(PNPM) install

setup: install
	@if [ ! -f contracts/.env ]; then \
		cp contracts/.env.example contracts/.env; \
		echo "Created contracts/.env — fill SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY, ETHERSCAN_API_KEY"; \
	else \
		echo "contracts/.env already exists"; \
	fi
	@if [ ! -f frontend/.env.local ]; then \
		cp frontend/.env.example frontend/.env.local; \
		echo "Created frontend/.env.local"; \
	else \
		echo "frontend/.env.local already exists"; \
	fi

test:
	$(PNPM) test

test-contracts:
	$(PNPM) run test:contracts

test-frontend:
	$(PNPM) run test:frontend

coverage:
	$(PNPM) run coverage

typecheck:
	$(PNPM) run typecheck

lint:
	$(PNPM) run lint

check:
	$(PNPM) run check

compile:
	$(PNPM) run compile

build:
	$(PNPM) run build

slither:
	cd contracts && slither . --filter-paths "node_modules|openzeppelin|semaphore|poseidon"

gas:
	$(PNPM) run gas

node:
	$(PNPM) run node

demo:
	$(PNPM) run demo

deploy-local:
	$(PNPM) run deploy:localhost

interact-local:
	$(PNPM) run interact:localhost

abis:
	$(PNPM) run export:abis

sync: abis
	$(PNPM) run sync:frontend-env

frontend:
	$(PNPM) --filter @teamup/frontend dev

deploy:
	@test -f contracts/.env || (echo "Missing contracts/.env — run: make setup" && exit 1)
	$(PNPM) run deploy:sepolia

verify:
	@test -f contracts/.env || (echo "Missing contracts/.env — run: make setup" && exit 1)
	$(PNPM) run verify:sepolia

verify-all: verify
	cd contracts && $(PNPM) run verify:deps

interact:
	@test -f contracts/.env || (echo "Missing contracts/.env — run: make setup" && exit 1)
	$(PNPM) run interact:sepolia

testnet: deploy verify interact

# ---- Showcase (Sepolia) ----
sepolia: sepolia-contracts sepolia-enroll sepolia-create sepolia-apply-bob \
         sepolia-accept-bob sepolia-apply-charlie sepolia-accept-charlie \
         sepolia-reveal sepolia-claim-bob sepolia-claim-charlie sepolia-nft

sepolia-contracts:
	bash showcase/00-contracts.sh

sepolia-enroll:
	bash showcase/01-enroll.sh

sepolia-create:
	bash showcase/02-create-team.sh

sepolia-apply-bob:
	bash showcase/03-apply-bob.sh

sepolia-accept-bob:
	bash showcase/04-accept-bob.sh

sepolia-apply-charlie:
	bash showcase/05-apply-charlie.sh

sepolia-accept-charlie:
	bash showcase/06-accept-charlie.sh

sepolia-reveal:
	bash showcase/07-reveal.sh

sepolia-claim-bob:
	bash showcase/08-claim-bob.sh

sepolia-claim-charlie:
	bash showcase/09-claim-charlie.sh

sepolia-nft:
	bash showcase/10-nft-verify.sh
