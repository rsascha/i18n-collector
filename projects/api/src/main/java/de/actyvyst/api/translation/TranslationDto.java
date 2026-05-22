package de.actyvyst.api.translation;

import java.time.Instant;

public record TranslationDto(
        Long id,
        String messageKey,
        String locale,
        String value,
        TranslationSource source,
        Instant createdAt,
        Instant updatedAt
) {
    public static TranslationDto from(Translation t) {
        return new TranslationDto(
                t.getId(),
                t.getMessageKey(),
                t.getLocale(),
                t.getValue(),
                t.getSource(),
                t.getCreatedAt(),
                t.getUpdatedAt()
        );
    }
}
