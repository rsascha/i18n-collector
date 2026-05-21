package de.actyvyst.api.translation;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

@Service
@RequiredArgsConstructor
public class TranslationService {

    private static final String SOURCE_LOCALE = "en";

    private final TranslationRepository translationRepository;

    @Transactional
    public void recordMissingKeys(String locale, Map<String, String> keysWithDefaults) {
        TranslationSource source = SOURCE_LOCALE.equals(locale)
                ? TranslationSource.MANUAL
                : TranslationSource.PENDING;

        keysWithDefaults.forEach((messageKey, defaultValue) ->
                translationRepository.insertIfAbsent(messageKey, locale, defaultValue, source.name())
        );
    }
}