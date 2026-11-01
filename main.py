from fastapi import FastAPI, Request, Form
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

app = FastAPI()
templates = Jinja2Templates(directory="templates")

tasks = []
next_id = 1


@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    return templates.TemplateResponse(request, "index.html", {"tasks": tasks})


@app.post("/summon")
def summon(title: str = Form(...)):
    global next_id
    tasks.append({"id": next_id, "title": title})
    next_id += 1
    return RedirectResponse("/", status_code=303)


@app.post("/banish/{task_id}")
def banish(task_id: int):
    tasks[:] = [t for t in tasks if t["id"] != task_id]
    return RedirectResponse("/", status_code=303)