package de.actyvyst.api.translation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@RestController
@RequestMapping("/i18n")
@RequiredArgsConstructor
public class TranslationController {

    private final TranslationRepository translationRepository;

    @GetMapping("/{lng}/{ns}")
    public Map<String, String> getTranslations(@PathVariable String lng, @PathVariable String ns) {
        log.debug("Loading translations for lng={}, ns={}", lng, ns);
        List<Translation> translations = translationRepository.findAllByLocale(lng);
        return translations.stream()
                .collect(Collectors.toMap(Translation::getMessageKey, Translation::getValue));
    }

    @PostMapping("/{lng}/{ns}")
    public ResponseEntity<Void> reportMissingKeys(
            @PathVariable String lng,
            @PathVariable String ns,
            @RequestBody(required = false) Object body
    ) {
        log.info("Missing-key report: lng={}, ns={}, body={}", lng, ns, body);
        return ResponseEntity.ok().build();
    }
}