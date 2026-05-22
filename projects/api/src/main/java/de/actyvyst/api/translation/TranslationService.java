package de.actyvyst.api.translation;

import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
// RestClient.Builder ist in Spring Boot 4 mit webmvc nicht automatisch verfügbar,
// wir bauen den Client direkt via RestClient.create() im Konstruktor.
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Locale;
import java.util.Map;

@Slf4j
@Service
public class TranslationService {

    private final TranslationRepository translationRepository;
    private final I18nProperties i18nProperties;
    private final SyncProperties syncProperties;
    private final ChatClient chatClient;
    private final RestClient restClient;

    public TranslationService(
            TranslationRepository translationRepository,
            I18nProperties i18nProperties,
            SyncProperties syncProperties,
            ChatClient.Builder chatClientBuilder
    ) {
        this.translationRepository = translationRepository;
        this.i18nProperties = i18nProperties;
        this.syncProperties = syncProperties;
        this.chatClient = chatClientBuilder.build();
        // RestClient.Builder ist in Spring Boot 4 + spring-boot-starter-webmvc
        // nicht automatisch als Bean verfügbar — direkt instanziieren reicht.
        this.restClient = RestClient.create();
    }

    /**
     * Erzeugt für jeden gemeldeten Key einen Eintrag pro {@code supportedLngs}:
     * {@code sourceLng} → {@code MANUAL} (mit defaultValue als kanonischem Source-Text),
     * alle übrigen Locales → {@code PENDING}. Idempotent via ON CONFLICT DO NOTHING.
     * Symmetrisch — die Report-Locale aus der URL spielt für das Fan-out keine Rolle.
     */
    @Transactional
    public void recordMissingKeys(Map<String, String> keysWithDefaults) {
        String sourceLng = i18nProperties.sourceLng();

        keysWithDefaults.forEach((messageKey, defaultValue) -> {
            for (String lng : i18nProperties.supportedLngs()) {
                TranslationSource source = lng.equals(sourceLng)
                        ? TranslationSource.MANUAL
                        : TranslationSource.PENDING;
                translationRepository.insertIfAbsent(messageKey, lng, defaultValue, source.name());
            }
        });
    }

    @Transactional
    public Translation updateValue(Long id, String value) {
        if (value == null || value.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Value must not be empty");
        }
        Translation t = translationRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Translation " + id + " not found"));

        t.setValue(value);
        t.setSource(TranslationSource.MANUAL);
        return translationRepository.save(t);
    }

    @Transactional
    public void deleteTranslation(Long id) {
        if (!translationRepository.existsById(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Translation " + id + " not found");
        }
        translationRepository.deleteById(id);
    }

    @Transactional
    public Translation translatePending(Long id) {
        Translation t = translationRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Translation " + id + " not found"));

        if (t.getSource() != TranslationSource.PENDING) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Translation " + id + " is " + t.getSource() + ", not PENDING"
            );
        }

        String sourceText = t.getValue();
        String translated = translateViaClaude(sourceText, t.getLocale());
        log.info("Translated id={} ({} → {}): '{}' → '{}'",
                id, i18nProperties.sourceLng(), t.getLocale(), sourceText, translated);

        t.setValue(translated);
        t.setSource(TranslationSource.AI);
        return translationRepository.save(t);
    }

    private String translateViaClaude(String englishText, String targetLocale) {
        String targetLanguage = languageNameFor(targetLocale);
        String prompt = """
                Translate the following UI string from English into %s.
                Return only the translated string. No quotes, no explanation, no surrounding whitespace.

                Text: %s
                """.formatted(targetLanguage, englishText);

        String content = chatClient.prompt()
                .user(prompt)
                .call()
                .content();
        if (content == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "Bedrock returned no content for '" + englishText + "' (" + targetLocale + ")"
            );
        }
        return content.trim();
    }

    private static String languageNameFor(String localeCode) {
        return Locale.forLanguageTag(localeCode).getDisplayLanguage(Locale.ENGLISH);
    }

    /**
     * Liefert alle „freigegebenen" Zeilen (AI + MANUAL) als DTO-Liste.
     * Ziel: Promote nach public — PENDING wird bewusst ausgeschlossen, das
     * sind Platzhalter ohne fertige Übersetzung.
     */
    public List<TranslationDto> exportApproved() {
        return translationRepository
                .findAllBySourceIn(List.of(TranslationSource.AI, TranslationSource.MANUAL))
                .stream()
                .map(TranslationDto::from)
                .toList();
    }

    /**
     * UPSERT pro DTO-Zeile via Repository. Bei Konflikt (message_key, locale)
     * werden value + source des eingehenden DTO übernommen, updated_at = now().
     * Idempotent.
     */
    @Transactional
    public int importTranslations(List<TranslationDto> payload) {
        if (payload == null || payload.isEmpty()) {
            return 0;
        }
        payload.forEach(dto -> translationRepository.upsert(
                dto.messageKey(),
                dto.locale(),
                dto.value(),
                dto.source().name()
        ));
        return payload.size();
    }

    /**
     * Orchestriert den dev → public Sync: liest die eigene AI+MANUAL-Liste,
     * postet sie an {@code ${app.sync.public-api-base-url}/i18n/translations/import}.
     * Returnt die Anzahl der gepushten Zeilen.
     */
    public int promote() {
        String baseUrl = syncProperties.publicApiBaseUrl();
        if (baseUrl == null || baseUrl.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "PUBLIC_API_BASE_URL ist nicht konfiguriert — Promote ist nur im dev-Namespace aktiv."
            );
        }

        List<TranslationDto> payload = exportApproved();
        if (payload.isEmpty()) {
            log.info("Promote: keine AI/MANUAL-Zeilen zu übertragen.");
            return 0;
        }

        try {
            Integer imported = restClient.post()
                    .uri(baseUrl + "/i18n/translations/import")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(payload)
                    .retrieve()
                    .body(new ParameterizedTypeReference<>() {});
            int count = imported != null ? imported : 0;
            log.info("Promoted {} Zeilen nach {}", count, baseUrl);
            return count;
        } catch (RestClientException e) {
            log.error("Promote fehlgeschlagen gegen {}: {}", baseUrl, e.getMessage());
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "Promote fehlgeschlagen: " + e.getMessage(),
                    e
            );
        }
    }
}