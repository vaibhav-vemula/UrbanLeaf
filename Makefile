# UrbanLeaf AI — Development Commands

.PHONY: install dev frontend backend blockchain deploy help

##@ Setup

install: ## Install all dependencies
	@echo "Installing frontend dependencies..."
	cd frontend && npm install
	@echo "Installing blockchain service dependencies..."
	cd backend/blockchain-service && npm install
	@echo "Installing Python backend dependencies..."
	cd backend && pip install -r requirements.txt
	@echo "Done. All dependencies installed."

##@ Development

dev: ## Start all services in parallel (requires separate terminals or tmux)
	@echo "Starting all services..."
	@echo "  frontend  → http://localhost:3000"
	@echo "  api       → http://localhost:4000"
	@echo "  blockchain→ http://localhost:5000"
	@$(MAKE) -j3 frontend backend blockchain

frontend: ## Start the Next.js frontend (port 3000)
	cd frontend && npm run dev

backend: ## Start the Python FastAPI backend (port 4000)
	cd backend && uvicorn main:app --reload --port 4000

blockchain: ## Start the Node.js blockchain service (port 5000)
	cd backend/blockchain-service && npm run dev

##@ Smart Contracts

compile: ## Compile smart contracts
	cd backend/blockchain-service && npm run compile

deploy: ## Deploy smart contract to Arbitrum Sepolia
	cd backend/blockchain-service && npm run deploy

##@ Utilities

clean: ## Remove build artifacts and caches
	rm -rf frontend/.next
	rm -rf backend/__pycache__
	rm -rf backend/blockchain-service/artifacts
	rm -rf backend/blockchain-service/cache

help: ## Show this help message
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

.DEFAULT_GOAL := help
