import sqlite3
from contextlib import closing

from fastapi import FastAPI, Request, Form
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

DB_PATH = "db.sqlite3"

app = FastAPI()
templates = Jinja2Templates(directory="templates")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with closing(get_db()) as conn:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS tasks ("
            "id INTEGER PRIMARY KEY AUTOINCREMENT, "
            "title TEXT NOT NULL)"
        )
        conn.commit()


init_db()


@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    with closing(get_db()) as conn:
        rows = conn.execute("SELECT id, title FROM tasks ORDER BY id").fetchall()
    tasks = [dict(r) for r in rows]
    return templates.TemplateResponse(request, "index.html", {"tasks": tasks})


@app.post("/summon")
def summon(title: str = Form(...)):
    with closing(get_db()) as conn:
        conn.execute("INSERT INTO tasks (title) VALUES (?)", (title.strip(),))
        conn.commit()
    return RedirectResponse("/", status_code=303)


@app.post("/banish/{task_id}")
def banish(task_id: int):
    with closing(get_db()) as conn:
        conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        conn.commit()
    return RedirectResponse("/", status_code=303)