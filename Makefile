.PHONY: install dev dev-api dev-web dev-web-i18n build build-api build-web build-web-i18n lint test-e2e clean \
        images image-api image-web image-web-i18n \
        ingress k8s-secrets k8s-public k8s-dev k8s-clean

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

# ---------- Container-Images ----------
# Setzt `colima start --kubernetes` voraus. Images werden direkt in den
# Colima-Daemon geladen, K8s findet sie via imagePullPolicy: IfNotPresent.

images: image-api image-web image-web-i18n

image-api:
	docker build -t api:dev -f projects/api/Dockerfile projects/api

image-web:
	docker build -t web-ui:dev -f projects/web-ui/Dockerfile .

image-web-i18n:
	docker build -t web-ui-i18n:dev -f projects/web-ui-i18n/Dockerfile .

# ---------- Kubernetes ----------
# Colima/k3s schiffert keinen Ingress-Controller mit (anders als k3s
# standalone). Traefik wird einmalig per Helm in kube-system installiert.
# LoadBalancer-IP wird vom klipper-lb auf den Host gemappt.
# Re-run ist sicher (helm upgrade --install).

ingress:
	helm repo add traefik https://traefik.github.io/charts 2>/dev/null || true
	helm repo update traefik
	helm upgrade --install traefik traefik/traefik \
	  -n kube-system \
	  --set service.type=LoadBalancer \
	  --set ports.web.port=80 \
	  --set ports.web.exposedPort=80

# Lädt das bedrock-secret in den `dev`-Namespace. AWS-Credentials werden
# live vom aws-CLI gezogen (`configure export-credentials`) — funktioniert
# sowohl mit SSO als auch mit statischen Keys. Weitere Werte (AWS_REGION,
# BEDROCK_MODEL_ID) kommen aus projects/api/.env, falls vorhanden.
#
# `public` bekommt das Secret bewusst nicht: Auto-Translate sitzt in
# web-ui-i18n und ist nur in `dev` deployed. Der `public`-API-Pod startet
# auch ohne Creds (envFrom optional: true) und braucht Bedrock nicht.
#
# SSO-Tokens laufen typischerweise nach 1h ab — dann erneut: `aws sso login`
# + `make k8s-secrets` + `kubectl rollout restart deploy/api -n dev`.

k8s-secrets:
	@command -v aws >/dev/null 2>&1 || { echo "aws-CLI fehlt — brew install awscli"; exit 1; }
	@set -e; \
	TMP=$$(mktemp); \
	trap "rm -f $$TMP" EXIT; \
	aws configure export-credentials --format env 2>/dev/null | sed 's/^export //' > $$TMP || { \
	  echo "aws configure export-credentials fehlgeschlagen — SSO-Session abgelaufen? Versuche: aws sso login"; \
	  exit 1; \
	}; \
	if [ ! -s $$TMP ]; then \
	  echo "aws-CLI hat keine Credentials geliefert — aws sso login ausführen"; \
	  exit 1; \
	fi; \
	if [ -f projects/api/.env ]; then \
	  grep -Ev '^(#|$$|AWS_ACCESS|AWS_SECRET|AWS_SESSION|AWS_CREDENTIAL)' projects/api/.env >> $$TMP || true; \
	fi; \
	kubectl create namespace dev --dry-run=client -o yaml | kubectl apply -f -; \
	kubectl -n dev delete secret bedrock-secret --ignore-not-found; \
	kubectl -n dev create secret generic bedrock-secret --from-env-file=$$TMP

k8s-public:
	kubectl apply -k k8s/overlays/public

k8s-dev:
	kubectl apply -k k8s/overlays/dev

k8s-clean:
	kubectl delete namespace public --ignore-not-found
	kubectl delete namespace dev    --ignore-not-found
