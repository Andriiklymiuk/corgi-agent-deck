PLUGIN := com.andriiklymiuk.agent-deck
PLUGIN_DIR := $(PLUGIN).sdPlugin

.PHONY: install build restart watch test validate pack link dev

install:
	npm install

build:
	npm run build

# Rebuild and reload the plugin in the Stream Deck app.
restart: build
	npx streamdeck restart $(PLUGIN)

watch:
	npm run watch

test:
	npm test

validate:
	npm run validate

pack:
	npm run pack

# Once per machine: developer mode, then symlink the plugin into Stream Deck.
link:
	npx streamdeck link $(PLUGIN_DIR)

dev:
	npx streamdeck dev
