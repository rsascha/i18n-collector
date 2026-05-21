package de.actyvyst.api.translation;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TranslationRepository extends JpaRepository<Translation, Long> {

    List<Translation> findAllByLocale(String locale);
}