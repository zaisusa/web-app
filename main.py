import os
import json
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="LectureMind AI API", version="1.0.0")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")

# Инициализация OpenRouter (совместим с OpenAI SDK)
API_KEY = os.getenv("OPENROUTER_API_KEY")
if not API_KEY:
    raise RuntimeError("❌ Не найден OPENROUTER_API_KEY в .env")

client = OpenAI(
    api_key=API_KEY,
    base_url="https://openrouter.ai/api/v1"
)

class TextInput(BaseModel):
    text: str
    subject: str = "Общая дисциплина"

@app.get("/")
def root():
    return {
        "status": "running",
        "docs": "/docs",
        "ui": "/static/index.html"
    }

@app.get("/health")
def health_check():
    return {"status": "ok", "provider": "OpenRouter", "model": "meta-llama/llama-3.1-8b-instruct"}

@app.post("/api/process")
def process_material(data: TextInput):
    if not data.text.strip():
        raise HTTPException(status_code=400, detail="Текст не может быть пустым")

    system_prompt = """Ты — педагогический ИИ-ассистент. Твоя задача — строго структурировать учебный материал.
Верни ТОЛЬКО валидный JSON без пояснений, markdown-разметки или extra текста.
Формат:
{
  "concepts": [{"term": "строка", "definition": "строка"}],
  "logical_links": ["строка 1", "строка 2"],
  "quiz": [{"question": "строка", "options": ["A) ...", "B) ...", "C) ..."], "correct_index": 0, "explanation": "почему"}]
}"""

    user_prompt = f"Дисциплина: {data.subject}\nМатериал для обработки:\n{data.text}"

    try:
        response = client.chat.completions.create(
            model="meta-llama/llama-3.1-8b-instruct",  # Та же модель, что была в Groq
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.3,
            max_tokens=1500,
            response_format={"type": "json_object"}
        )
        raw_content = response.choices[0].message.content
        parsed = json.loads(raw_content)
        return {"data": parsed}
    except json.JSONDecodeError:
        raise HTTPException(500, "ИИ вернул невалидный JSON. Попробуйте изменить текст.")
    except Exception as e:
        raise HTTPException(500, f"Ошибка API: {str(e)}")

@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    # Минималистичная SVG-иконка ()
    svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🎓</text></svg>"""
    return Response(content=svg, media_type="image/svg+xml")