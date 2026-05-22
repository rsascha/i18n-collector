.PHONY: dev

export JAVA_HOME := $(shell /usr/libexec/java_home -v 25)
export PATH := $(JAVA_HOME)/bin:$(PATH)

# Im `make dev`-Workflow gibt es nur einen API+DB-Stack. Damit der
# Promote-Button (web-ui-i18n :3001) auch lokal klickbar ist, zeigt das
# Promote-Ziel auf den selben Prozess — UPSERT mit identischen Werten ist
# ein No-Op außer dass `updated_at` wandert. In K8s steht `pre-prod` auf
# `http://api.prod.svc.cluster.local:8080` und `prod` lässt die Var leer
# (→ HTTP 503, weil prod nie promoten soll).
export PUBLIC_API_BASE_URL := http://localhost:8080

# Exportiert AWS-Credentials (auch SSO/IAM-Identity-Center) als Env-Vars für
# den Spring-Prozess, weil das Java SDK SSO-Profile mit `login_session` nicht
# nativ aus ~/.aws/config lesen kann. Funktioniert auch mit statischen Keys.
dev:
	@if command -v aws >/dev/null 2>&1; then \
	  eval "$$(aws configure export-credentials --format env 2>/dev/null)" && ./mvnw spring-boot:run; \
	else \
	  ./mvnw spring-boot:run; \
	fi