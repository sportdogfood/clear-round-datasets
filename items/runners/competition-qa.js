{
  "target_fields": [
    "hello.intro",
    "hello.transition",
    "hello.outro_pivot",
    "hello.outro_main",
    "event.event_paragraph",
    "venue.venue_paragraph",
    "host_city.paragraph_80w"
  ],
  "canonical_proper_nouns": {
    "esp_summer_series": "ESP Summer Series",
    "wellington_international": "Wellington International",
    "wellington_fl": "Wellington, FL"
  },
  "string_replacements": [
    { "from": "Wellington, FN", "to": "Wellington, FL", "reason": "state code typo" },
    { "from": "jlumping", "to": "jumping", "reason": "typo" }
  ],
  "forbidden_tokens": [
    "logas",
    "slung of heat mirrors",
    "heat mirrors",
    "morners",
    "fcus"
  ],
  "max_sentence_words": 32,
  "min_sentence_words": 5
}
