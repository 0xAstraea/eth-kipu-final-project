# TeamUp ZK — common tasks
# Requires: Node 20+, pnpm, GNU Make
# Testnet deploy also needs contracts/.env (see contracts/.env.example)

PNPM ?= pnpm

# On Windows, prefer Git Bash so recipes get a POSIX shell.
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
	deploy verify interact testnet slither gas

help:
	$(info TeamUp ZK)
	$(info )
	$(info Setup)
	$(info   make install          Install all workspace deps)
	$(info   make setup            Install + create .env files from examples)
	$(info )
	$(info Quality)
	$(info   make test             Run all tests (contracts + frontend))
	$(info   make coverage         Contract coverage)
	$(info   make check            Typecheck + lint + tests)
	$(info   make build            Compile contracts + build frontend)
	$(info   make slither          Static analysis (needs slither-analyzer))
	$(info )
	$(info Local)
	$(info   make node             Hardhat local chain)
	$(info   make deploy-local     Deploy to localhost)
	$(info   make interact-local   Run full flow on localhost)
	$(info   make sync             Export ABIs + write frontend/.env.local)
	$(info   make frontend         Start Next.js dev server)
	$(info   make demo             Narrated local protocol demo)
	$(info )
	$(info Testnet (Sepolia) — needs contracts/.env)
	$(info   make deploy           Deploy to Sepolia)
	$(info   make verify           Verify on explorer)
	$(info   make interact         Run full flow on Sepolia)
	$(info   make testnet          deploy + verify + interact)
	@exit 0

# --- Setup ---

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

# --- Quality ---

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

# --- Local ---

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

# --- Testnet (Sepolia) ---

deploy:
	@test -f contracts/.env || (echo "Missing contracts/.env — run: make setup" && exit 1)
	$(PNPM) run deploy:sepolia

verify:
	@test -f contracts/.env || (echo "Missing contracts/.env — run: make setup" && exit 1)
	$(PNPM) run verify:sepolia

interact:
	@test -f contracts/.env || (echo "Missing contracts/.env — run: make setup" && exit 1)
	$(PNPM) run interact:sepolia

testnet: deploy verify interact
	@echo ""
	@echo "Done. Paste addresses into contracts/README.md and tx hashes into On-chain evidence."
