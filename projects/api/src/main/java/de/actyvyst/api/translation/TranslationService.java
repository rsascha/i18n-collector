package de.actyvyst.api.translation;

import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.Locale;
import java.util.Map;

@Slf4j
@Service
public class TranslationService {

    private final TranslationRepository translationRepository;
    private final I18nProperties i18nProperties;
    private final ChatClient chatClient;

    public TranslationService(
            TranslationRepository translationRepository,
            I18nProperties i18nProperties,
            ChatClient.Builder chatClientBuilder
    ) {
        this.translationRepository = translationRepository;
        this.i18nProperties = i18nProperties;
        this.chatClient = chatClientBuilder.build();
    }

    /**
     * Erzeugt für jeden gemeldeten Key einen Eintrag pro {@code supportedLngs}:
     * {@code sourceLng} → {@code MANUAL} (mit defaultValue als kanonischem Source-Text),
     * alle übrigen Locales → {@code PENDING}. Idempotent via ON CONFLICT DO NOTHING.
     * Die Locale aus der URL spielt für das Fan-out keine Rolle — das Verhalten ist
     * symmetrisch, egal welche Sprache den missing-key-Report ausgelöst hat.
     */
    @Transactional
    public void recordMissingKeys(String reportLocale, Map<String, String> keysWithDefaults) {
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

        return chatClient.prompt()
                .user(prompt)
                .call()
                .content()
                .trim();
    }

    private static String languageNameFor(String localeCode) {
        return Locale.forLanguageTag(localeCode).getDisplayLanguage(Locale.ENGLISH);
    }
}