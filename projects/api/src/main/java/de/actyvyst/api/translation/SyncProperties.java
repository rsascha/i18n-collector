package de.actyvyst.api.translation;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Konfiguration für den Promote-Flow von dev nach public.
 * {@code publicApiBaseUrl} zeigt auf den `public`-Namespace-API-Service
 * (cluster-intern via Kubernetes-DNS), z. B. `http://api.public.svc.cluster.local:8080`.
 * In `public` selbst leer/null — promote ist eine dev-only Operation.
 */
@ConfigurationProperties(prefix = "app.sync")
public record SyncProperties(String publicApiBaseUrl) {
}
