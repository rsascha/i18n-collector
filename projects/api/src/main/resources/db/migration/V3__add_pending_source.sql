ALTER TABLE translations
    DROP CONSTRAINT IF EXISTS translations_source_check;

ALTER TABLE translations
    ADD CONSTRAINT translations_source_check
        CHECK (source IN ('MANUAL', 'AI', 'PENDING'));