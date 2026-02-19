from fastapi import FastAPI, WebSocket
from fastapi.responses import HTMLResponse
app = FastAPI()

@app.get('/')
def root():
    return {'status':'nara-hub backend running'}

@app.websocket('/ws')
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            data = await ws.receive_text()
            # echo for now
            await ws.send_text(f'Nara: {data}')
    except Exception:
        await ws.close()
