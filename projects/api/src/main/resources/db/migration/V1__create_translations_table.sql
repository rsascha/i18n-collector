CREATE TABLE translations (
    id           BIGSERIAL    PRIMARY KEY,
    message_key  VARCHAR(255) NOT NULL,
    locale       VARCHAR(10)  NOT NULL,
    value        TEXT         NOT NULL,
    source       VARCHAR(20)  NOT NULL CHECK (source IN ('MANUAL', 'AI')),
    created_at   TIMESTAMP    NOT NULL DEFAULT now(),
    updated_at   TIMESTAMP    NOT NULL DEFAULT now(),
    CONSTRAINT uk_translations_key_locale UNIQUE (message_key, locale)
);

CREATE INDEX idx_translations_locale_key ON translations (locale, message_key);