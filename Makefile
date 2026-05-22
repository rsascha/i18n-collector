.PHONY: install dev dev-api dev-web dev-web-i18n build build-api build-web build-web-i18n lint test-e2e clean

install:
	pnpm install

dev:
	$(MAKE) -j3 dev-api dev-web dev-web-i18n

dev-api:
	$(MAKE) -C projects/api dev

dev-web:
	pnpm --filter web-ui dev

dev-web-i18n:
	pnpm --filter web-ui-i18n dev

build: build-api build-web build-web-i18n

build-api:
	cd projects/api && ./mvnw -DskipTests package

build-web:
	pnpm --filter web-ui build

build-web-i18n:
	pnpm --filter web-ui-i18n build

lint:
	pnpm --filter web-ui lint
	pnpm --filter web-ui-i18n lint

# Requires `make dev` to be running in another terminal
test-e2e:
	pnpm --filter e2e-tests test

clean:
	cd projects/api && ./mvnw clean
	rm -rf projects/web-ui/.next projects/web-ui/tsconfig.tsbuildinfo
	rm -rf projects/web-ui-i18n/.next projects/web-ui-i18n/tsconfig.tsbuildinfo
