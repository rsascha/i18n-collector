package de.actyvyst.api.translation;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface TranslationRepository extends JpaRepository<Translation, Long> {

    List<Translation> findAllByLocale(String locale);

    @Modifying
    @Query(
            value = """
                    INSERT INTO translations (message_key, locale, value, source, created_at, updated_at)
                    VALUES (:messageKey, :locale, :value, :source, now(), now())
                    ON CONFLICT (message_key, locale) DO NOTHING
                    """,
            nativeQuery = true
    )
    int insertIfAbsent(
            @Param("messageKey") String messageKey,
            @Param("locale") String locale,
            @Param("value") String value,
            @Param("source") String source
    );
}