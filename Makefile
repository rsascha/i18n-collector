.PHONY: install dev dev-api dev-web build build-api build-web lint test-e2e clean

install:
	pnpm install

dev:
	$(MAKE) -j2 dev-api dev-web

dev-api:
	$(MAKE) -C projects/api dev

dev-web:
	pnpm --filter web-ui dev

build: build-api build-web

build-api:
	cd projects/api && ./mvnw -DskipTests package

build-web:
	pnpm --filter web-ui build

lint:
	pnpm --filter web-ui lint

# Requires `make dev` to be running in another terminal
test-e2e:
	pnpm --filter e2e-tests test

clean:
	cd projects/api && ./mvnw clean
	rm -rf projects/web-ui/.next projects/web-ui/tsconfig.tsbuildinfo