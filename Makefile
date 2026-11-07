# Commands for the backend and the iOS app in ios/.
#
# The iOS targets run inside ios/, so mint picks up ios/Mintfile and the pinned
# xcodegen, SwiftFormat and SwiftLint versions.

IOS_DIR := ios
APP := OpenUIGen
PROJECT := $(APP).xcodeproj
SIMULATOR ?= iPhone 17 Pro
APPSTORE_XCCONFIG := $(IOS_DIR)/$(APP)/Application/Resources/AppStore.xcconfig
SECRETS_XCCONFIG := $(IOS_DIR)/$(APP)/Application/Resources/Secrets.xcconfig

# PORT from the environment, else from .env, else the server's default.
BACKEND_PORT := $(or $(PORT),$(shell sed -n 's/^PORT=//p' .env 2>/dev/null),8080)
BACKEND_URL := http://127.0.0.1:$(BACKEND_PORT)

.PHONY: help backend bootstrap project open close format format-check lint lint-strict preflight \
	build test clean bump-patch bump-minor bump-major

help:
	@echo "Backend"
	@echo "  make backend        Run the API server on :$(BACKEND_PORT) and list its URLs"
	@echo ""
	@echo "iOS ($(IOS_DIR)/)"
	@echo "  make bootstrap      Install mint tools, generate the project, create Secrets.xcconfig"
	@echo "  make project        Regenerate $(PROJECT) from project.yml"
	@echo "  make open           Open the project in Xcode"
	@echo "  make close          Quit Xcode"
	@echo "  make format         Format Swift sources"
	@echo "  make format-check   Fail if any Swift source is unformatted"
	@echo "  make lint           SwiftLint (lint-strict treats warnings as errors)"
	@echo "  make preflight      format-check + lint, run before committing"
	@echo "  make build          Build for the iOS simulator"
	@echo "  make test           Run the unit tests on SIMULATOR='$(SIMULATOR)'"
	@echo "  make clean          Remove build output and the generated project"
	@echo "  make bump-patch     Bump MARKETING_VERSION and commit (also bump-minor, bump-major)"

# --- Backend ------------------------------------------------------------------

backend:
	@if [ ! -f .env ]; then \
		echo "❌ .env is missing. Run 'cp .env.example .env' and fill in the keys."; \
		exit 1; \
	fi
	@[ -d node_modules ] || npm install
	@if lsof -nP -iTCP:$(BACKEND_PORT) -sTCP:LISTEN >/dev/null; then \
		echo "❌ Port $(BACKEND_PORT) is already in use:"; \
		lsof -nP -iTCP:$(BACKEND_PORT) -sTCP:LISTEN; \
		echo "   Stop it with 'kill <PID>', or run 'PORT=8099 make backend'."; \
		exit 1; \
	fi
	@echo ""
	@echo "OpenUI Sports backend → $(BACKEND_URL)"
	@echo "  GET  $(BACKEND_URL)/health                          liveness check, used by the iOS app"
	@echo "  POST $(BACKEND_URL)/lang/sports/stream              generate a new screen, streamed as SSE"
	@echo "  POST $(BACKEND_URL)/lang/sports/:documentId/follow-up edit a saved screen into a new revision"
	@echo "  POST $(BACKEND_URL)/tools/sports_dataset            replay a run's dataset snapshot"
	@echo "  GET  $(BACKEND_URL)/                                the preview page (after npm run preview:build)"
	@echo ""
	PORT=$(BACKEND_PORT) npm run dev

# --- iOS ----------------------------------------------------------------------

bootstrap:
	@command -v brew >/dev/null || { echo "❌ Homebrew is required. See https://brew.sh."; exit 1; }
	@xcode-select -p >/dev/null || { echo "❌ Xcode command line tools are missing. Run xcode-select --install."; exit 1; }
	@command -v mint >/dev/null || brew install mint
	cd $(IOS_DIR) && mint bootstrap
	@[ -f $(SECRETS_XCCONFIG) ] || cp $(SECRETS_XCCONFIG).example $(SECRETS_XCCONFIG)
	@$(MAKE) project
	@echo "✅ Bootstrap complete. 'make open' to start."

project:
	cd $(IOS_DIR) && mint run xcodegen generate --spec project.yml

open:
	@killall Xcode 2>/dev/null || true
	xed $(IOS_DIR)/$(PROJECT)

close:
	@killall Xcode 2>/dev/null || true

format:
	cd $(IOS_DIR) && mint run swiftformat . --quiet

format-check:
	cd $(IOS_DIR) && mint run swiftformat . --lint

lint:
	cd $(IOS_DIR) && mint run swiftlint --quiet

lint-strict:
	cd $(IOS_DIR) && mint run swiftlint --strict

preflight: format-check lint

build:
	cd $(IOS_DIR) && xcodebuild build -project $(PROJECT) -scheme $(APP) \
		-destination 'generic/platform=iOS Simulator'

test:
	cd $(IOS_DIR) && xcodebuild test -project $(PROJECT) -scheme $(APP) \
		-destination 'platform=iOS Simulator,name=$(SIMULATOR)'

# Keeps the tracked Package.resolved, if there is one, while deleting the project.
clean:
	@cd $(IOS_DIR) && \
		resolved=$(PROJECT)/project.xcworkspace/xcshareddata/swiftpm/Package.resolved; \
		saved=""; \
		if [ -f "$$resolved" ]; then saved=$$(mktemp); cp "$$resolved" "$$saved"; fi; \
		rm -rf .build build DerivedData $(PROJECT); \
		if [ -n "$$saved" ]; then mkdir -p "$$(dirname "$$resolved")"; mv "$$saved" "$$resolved"; fi
	@echo "✅ Generated build files removed."

bump-patch bump-minor bump-major:
	@if [ -n "$$(git status --porcelain)" ]; then \
		echo "❌ Commit or stash changes before changing the app version."; \
		exit 1; \
	fi
	@current=$$(sed -n 's/^MARKETING_VERSION = //p' $(APPSTORE_XCCONFIG)); \
	next=$$(echo "$$current" | awk -F. -v level=$(@:bump-%=%) '{ \
		if (level == "major") { $$1++; $$2 = 0; $$3 = 0 } \
		else if (level == "minor") { $$2++; $$3 = 0 } \
		else { $$3++ } \
		print $$1 "." $$2 "." $$3 }'); \
	sed -i '' "s/^MARKETING_VERSION = .*/MARKETING_VERSION = $$next/" $(APPSTORE_XCCONFIG); \
	git add $(APPSTORE_XCCONFIG); \
	git -c commit.gpgsign=false commit -qm "Bump version to $$next"; \
	echo "✅ App version $$current → $$next."
