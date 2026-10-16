# Word lists

| File | Rows | Columns | Provenance |
|---|---|---|---|
| `es/common-1000.csv` | 1,253 | `rank,word,translation` (Spanish word, English gloss) | The 2025 TouchLanguage app (Seven Hills Studio), `1000CommonSpanishWords.csv`, published by its owner on 2026-10-15 |
| `es/picture-words.csv` | 408 | `english,emoji,spanish` | Same app (`SpanishWordsImages.csv`) |

The Word lab mode draws candidate words from `common-1000.csv` within the level's
`vocabularyBand` (rank ≤ band). Add a language as `wordlists/<lang>/common-1000.csv`
with the same three columns.
