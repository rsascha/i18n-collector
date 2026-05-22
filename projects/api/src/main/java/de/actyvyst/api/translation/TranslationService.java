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

    private static final String SOURCE_LOCALE = "en";

    private final TranslationRepository translationRepository;
    private final ChatClient chatClient;

    public TranslationService(TranslationRepository translationRepository, ChatClient.Builder chatClientBuilder) {
        this.translationRepository = translationRepository;
        this.chatClient = chatClientBuilder.build();
    }

    @Transactional
    public void recordMissingKeys(String locale, Map<String, String> keysWithDefaults) {
        TranslationSource source = SOURCE_LOCALE.equals(locale)
                ? TranslationSource.MANUAL
                : TranslationSource.PENDING;

        keysWithDefaults.forEach((messageKey, defaultValue) ->
                translationRepository.insertIfAbsent(messageKey, locale, defaultValue, source.name())
        );
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
        log.info("Translated id={} ({} → {}): '{}' → '{}'", id, SOURCE_LOCALE, t.getLocale(), sourceText, translated);

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