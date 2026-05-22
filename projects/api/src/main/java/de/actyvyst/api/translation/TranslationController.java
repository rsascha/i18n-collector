package de.actyvyst.api.translation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
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
    private final TranslationService translationService;

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
            @RequestBody(required = false) Map<String, String> body
    ) {
        log.info("Missing-key report: lng={}, ns={}, body={}", lng, ns, body);
        if (body != null && !body.isEmpty()) {
            translationService.recordMissingKeys(body);
        }
        return ResponseEntity.ok().build();
    }

    @GetMapping("/translations")
    public List<TranslationDto> listAllTranslations() {
        return translationRepository.findAll().stream()
                .map(TranslationDto::from)
                .toList();
    }

    @PostMapping("/translations/{id}/translate")
    public TranslationDto translatePending(@PathVariable Long id) {
        return TranslationDto.from(translationService.translatePending(id));
    }

    @PatchMapping("/translations/{id}")
    public TranslationDto updateValue(
            @PathVariable Long id,
            @RequestBody UpdateValueRequest body
    ) {
        return TranslationDto.from(translationService.updateValue(id, body.value()));
    }

    @DeleteMapping("/translations/{id}")
    public ResponseEntity<Void> deleteTranslation(@PathVariable Long id) {
        translationService.deleteTranslation(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/translations/import")
    public int importTranslations(@RequestBody List<TranslationDto> payload) {
        log.info("Import: {} Zeilen eingegangen", payload != null ? payload.size() : 0);
        return translationService.importTranslations(payload);
    }

    @PostMapping("/translations/promote")
    public PromoteResult promote() {
        int promoted = translationService.promote();
        return new PromoteResult(promoted);
    }

    public record UpdateValueRequest(String value) {}
    public record PromoteResult(int promoted) {}
}