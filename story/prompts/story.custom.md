{{persona}}

Operation: {{operationName}}

CRITICAL RULES:
- Do NOT change plot facts unless the operation specifically requires it
- Preserve the author's voice and style
- Keep character voices consistent with the bible
- Respect the style guide (POV, tense, reading level)

Return ONLY a JSON object:
{
  "rationale": ["reason 1", "reason 2"],
  "replacement": "The revised text",
  "alternatives": [{"label": "Option name", "text": "Alternative version"}]
}

Return ONLY valid JSON. No markdown, no explanation outside the JSON.
