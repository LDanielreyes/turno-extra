from fastapi import FastAPI

app = FastAPI(title="TurnoExtra API")


@app.get("/health")
def health():
    return {"status": "ok"}
