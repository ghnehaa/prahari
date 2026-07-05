# PRAHARI — The Sentinel (Prototype)

Offline edge-AI safety guardian prototype for **InnoVent-27**. Simulates the three core systems from the pitch deck:

1. **PREDICT** — Multi-modal operator fatigue fusion with calibrated confidence
2. **PROTECT** — Blind-zone / swing-radius person detection
3. **ADAPT** — Graded escalation from nudge → controlled stop

## Quick start (local)

```powershell
Set-Location "C:\Users\SMB\Desktop\New folder\prahari-prototype"
pip install -r requirements.txt
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8765
```

Open **http://127.0.0.1:8765** in your browser.

---

## Deploy so anyone can open a link

Three options — pick based on how permanent you need the link.

### Option A — Render (recommended, free public URL)

Best for InnoVent submissions: a stable link like `https://prahari-sentinel.onrender.com`.

1. **Push code to GitHub**
   ```powershell
   Set-Location "C:\Users\SMB\Desktop\New folder\prahari-prototype"
   git init
   git add .
   git commit -m "PRAHARI prototype for public demo"
   ```
   Create a new repo on [github.com/new](https://github.com/new), then:
   ```powershell
   git remote add origin https://github.com/YOUR_USERNAME/prahari-prototype.git
   git branch -M main
   git push -u origin main
   ```

2. **Deploy on Render**
   - Go to [render.com](https://render.com) → sign up (free)
   - **New → Blueprint** (or **Web Service**)
   - Connect your GitHub repo
   - Render reads `render.yaml` automatically
   - Click **Apply** / **Deploy**

3. **Share the link**
   - After ~2–3 min, Render gives you: `https://prahari-sentinel.onrender.com`
   - Anyone with that URL can run the demo in their browser

**Note:** Free tier sleeps after ~15 min idle. First visit after sleep takes ~30–60 s to wake up.

---

### Option B — Instant share with ngrok (no GitHub, temporary link)

Good for a quick demo today; link works while your PC is running.

1. Start the app locally (see Quick start above).
2. Install ngrok: [ngrok.com/download](https://ngrok.com/download)
3. In a second terminal:
   ```powershell
   ngrok http 8765
   ```
4. Copy the **Forwarding** URL (e.g. `https://abc123.ngrok-free.app`) and share it.

Link stops working when you close ngrok or shut down your PC.

---

### Option C — Railway (alternative free host)

1. Push to GitHub (same as Option A step 1).
2. Go to [railway.app](https://railway.app) → **New Project → Deploy from GitHub**.
3. Select the repo; Railway detects Python.
4. Set **Start Command**: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
5. **Settings → Generate Domain** → share that URL.

---

## Demo scenarios (match pitch deck)

| Button | What it shows |
|--------|----------------|
| ① Head-nod → risk countdown | Simulated microsleep; risk & countdown escalate; throttle limits |
| ② Worker in danger zone | Animated worker enters swing radius → controlled stop |
| ③ Pull network (offline) | Offline badge stays green; all safety logic runs on-device |
| Reset | Returns to baseline |

Drag the **orange worker** on the blind-zone canvas to manually trigger intrusion detection.

## Project layout

```
prahari-prototype/
  backend/
    main.py              # FastAPI + WebSocket server
    fatigue_fusion.py    # Simulated PPG / blink / posture fusion
    zone_detection.py    # Danger-zone geometry + scenarios
    decision_engine.py   # Graded arbitration layer
  frontend/
    index.html           # Operator HMI
    app.js               # Real-time dashboard
    styles.css
```

## Next steps toward hardware POC

- Replace simulated sensors with USB camera + PPG module (MAX30102)
- Run YOLO person detection (ONNX/NCNN) on blind-zone camera feed
- Connect relay/throttle interface to machine CAN bus
- Add conformal prediction calibration on real operator baselines

Team PRAHARI · JIIT Noida · InnoVent-27
