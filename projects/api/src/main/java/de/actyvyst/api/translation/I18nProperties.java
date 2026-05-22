package de.actyvyst.api.translation;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

/**
 * Lokalisierungs-Konfiguration. Die Werte müssen synchron zu
 * projects/web-ui/src/i18n/i18n.ts gehalten werden — bei Sprach-Erweiterungen
 * beide Stellen anpassen.
 */
@ConfigurationProperties(prefix = "app.i18n")
public record I18nProperties(String sourceLng, List<String> supportedLngs) {
}