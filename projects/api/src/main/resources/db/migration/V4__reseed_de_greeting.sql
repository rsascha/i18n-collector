INSERT INTO translations (message_key, locale, value, source)
VALUES ('greeting', 'de', 'Hallo Welt', 'MANUAL')
ON CONFLICT (message_key, locale) DO NOTHING;
