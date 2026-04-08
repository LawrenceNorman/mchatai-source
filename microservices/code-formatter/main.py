"""Code Formatter — mChatAI microservice for code formatting and syntax highlighting."""

import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()


# ── Models ──

class FormatInput(BaseModel):
    code: str = Field(..., min_length=1)
    language: str = Field(default="python")

class FormatOutput(BaseModel):
    formatted: str
    language: str

class HighlightInput(BaseModel):
    code: str = Field(..., min_length=1)
    language: str = Field(default="python")
    theme: str = Field(default="monokai")

class HighlightOutput(BaseModel):
    html: str
    language: str

class LanguagesOutput(BaseModel):
    languages: list[str]


# ── Endpoints ──

@router.post("/format", response_model=FormatOutput)
async def format_code(body: FormatInput):
    lang = body.language.lower()
    code = body.code

    if lang == "json":
        try:
            parsed = json.loads(code)
            formatted = json.dumps(parsed, indent=2, ensure_ascii=False)
        except json.JSONDecodeError as e:
            raise HTTPException(status_code=400, detail=f"Invalid JSON: {e}")
    elif lang == "python":
        # Basic Python formatting: normalize indentation, strip trailing whitespace
        lines = code.split("\n")
        formatted = "\n".join(line.rstrip() for line in lines)
    elif lang in ("html", "xml"):
        # Basic indentation normalization
        formatted = code.strip()
    elif lang == "sql":
        # Uppercase SQL keywords
        import re
        keywords = ["SELECT", "FROM", "WHERE", "JOIN", "LEFT", "RIGHT", "INNER", "OUTER",
                     "ON", "AND", "OR", "INSERT", "UPDATE", "DELETE", "CREATE", "DROP",
                     "ALTER", "TABLE", "INTO", "VALUES", "SET", "ORDER", "BY", "GROUP",
                     "HAVING", "LIMIT", "OFFSET", "AS", "IN", "NOT", "NULL", "IS", "LIKE",
                     "BETWEEN", "EXISTS", "UNION", "ALL", "DISTINCT", "CASE", "WHEN", "THEN",
                     "ELSE", "END", "COUNT", "SUM", "AVG", "MIN", "MAX"]
        formatted = code
        for kw in keywords:
            formatted = re.sub(rf'\b{kw}\b', kw, formatted, flags=re.IGNORECASE)
    else:
        formatted = code.strip()

    return FormatOutput(formatted=formatted, language=lang)


@router.post("/highlight", response_model=HighlightOutput)
async def highlight_code(body: HighlightInput):
    try:
        from pygments import highlight
        from pygments.lexers import get_lexer_by_name, ClassNotFound
        from pygments.formatters import HtmlFormatter
    except ImportError:
        raise HTTPException(status_code=503, detail="pygments not installed")

    try:
        lexer = get_lexer_by_name(body.language)
    except ClassNotFound:
        raise HTTPException(status_code=400, detail=f"Unsupported language: {body.language}")

    formatter = HtmlFormatter(style=body.theme, noclasses=True)
    html = highlight(body.code, lexer, formatter)
    return HighlightOutput(html=html, language=body.language)


@router.get("/languages", response_model=LanguagesOutput)
async def list_languages():
    try:
        from pygments.lexers import get_all_lexers
        langs = sorted(set(name.lower() for name, aliases, _, _ in get_all_lexers() for name in [aliases[0]] if aliases))
        return LanguagesOutput(languages=langs)
    except ImportError:
        return LanguagesOutput(languages=["python", "json", "html", "css", "sql", "javascript"])
