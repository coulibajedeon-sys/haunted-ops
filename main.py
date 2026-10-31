from fastapi import FastAPI
from fastapi.responses import HTMLResponse

app = FastAPI()


@app.get("/", response_class=HTMLResponse)
def home():
    return """
    <html>
      <head><title>Séance</title></head>
      <body style="background:#0b0a12;color:#e8e0ff;font-family:serif;
                   text-align:center;padding-top:20vh;">
        <h1>👻 Séance</h1>
        <p>The spirits are awake...</p>
      </body>
    </html>
    """