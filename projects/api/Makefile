.PHONY: dev

export JAVA_HOME := $(shell /usr/libexec/java_home -v 25)
export PATH := $(JAVA_HOME)/bin:$(PATH)

# Exportiert AWS-Credentials (auch SSO/IAM-Identity-Center) als Env-Vars für
# den Spring-Prozess, weil das Java SDK SSO-Profile mit `login_session` nicht
# nativ aus ~/.aws/config lesen kann. Funktioniert auch mit statischen Keys.
dev:
	@if command -v aws >/dev/null 2>&1; then \
	  eval "$$(aws configure export-credentials --format env 2>/dev/null)" && ./mvnw spring-boot:run; \
	else \
	  ./mvnw spring-boot:run; \
	fi