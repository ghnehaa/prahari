"""PRAHARI prototype — offline edge safety guardian demo server."""

import asyncio
import json
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.decision_engine import SafetyState, compute_escalation
from backend.fatigue_fusion import FatigueScenario, fuse_fatigue, OperatorBaseline
from backend.zone_detection import ZoneConfig, ZoneScenario, detect_in_zone

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"

app = FastAPI(title="PRAHARI Sentinel Prototype", version="0.1.0")

fatigue = FatigueScenario("idle")
zone = ZoneScenario()
zone_config = ZoneConfig()
offline_mode = True
connected: set[WebSocket] = set()

active_baseline = OperatorBaseline()
safety_logs: list[dict] = []
last_logged_alerts: set[str] = set()


class ScenarioRequest(BaseModel):
    fatigue_scenario: str | None = None
    zone_scenario: str | None = None
    offline: bool | None = None


class WorkersRequest(BaseModel):
    workers: list[dict]


class CalibrateRequest(BaseModel):
    heart_rate: float
    blink_rate: float
    eye_closure_pct: float
    skin_temp_c: float


def build_state() -> tuple[SafetyState, list, dict, list]:
    inputs = fatigue.sample()
    fused = fuse_fatigue(inputs, active_baseline)
    workers = zone.get_workers()
    zone_out = detect_in_zone(workers, zone_config)

    state = SafetyState(
        fatigue_risk=fused.risk,
        fatigue_confidence=fused.confidence,
        time_to_lapse_sec=fused.time_to_lapse_sec,
        zone_intrusion=zone_out.intrusion,
        zone_warning=zone_out.warning,
        zone_confidence=zone_out.confidence,
        workers_in_zone=zone_out.workers_in_zone,
        workers_in_warning=zone_out.workers_in_warning,
        offline=offline_mode,
        shap_factors=fused.shap_factors,
        scenario=f"{fatigue.name}|{zone.name}",
    )
    state = compute_escalation(state)

    # Log new alerts
    import datetime
    for alert in state.alerts:
        # We clean prefix CRITICAL/WARNING to check uniqueness
        alert_clean = alert.split(" — ")[0] if " — " in alert else alert
        if alert_clean not in last_logged_alerts:
            last_logged_alerts.add(alert_clean)
            timestamp = datetime.datetime.now().strftime("%H:%M:%S")
            severity = "CRITICAL" if "CRITICAL" in alert else ("WARNING" if "WARNING" in alert else "INFO")
            safety_logs.append({
                "timestamp": timestamp,
                "event": alert,
                "severity": severity,
                "synced": not offline_mode
            })
            if len(safety_logs) > 50:
                safety_logs.pop(0)

    # Clear memory when everything returns to normal
    if state.escalation == 0:
        last_logged_alerts.clear()

    sensors = {
        "blink_rate": round(inputs.blink_rate, 1),
        "heart_rate": round(inputs.heart_rate, 1),
        "skin_temp_c": round(inputs.skin_temp_c, 1),
    }
    return state, workers, sensors, fused.forecast


def state_payload() -> dict:
    state, workers, sensors, forecast = build_state()
    data = state.to_dict()
    data["workers"] = [{"x": w.x, "y": w.y, "id": w.id} for w in workers]
    data["zone"] = {
        "center_x": zone_config.center_x,
        "center_y": zone_config.center_y,
        "radius": zone_config.radius,
        "warning_radius": zone_config.warning_radius,
    }
    data["sensors"] = sensors
    data["forecast"] = forecast
    return data


async def broadcast_loop() -> None:
    while True:
        if connected:
            payload_dict = state_payload()
            dead: list[WebSocket] = []
            for ws in connected:
                try:
                    await ws.send_json(payload_dict)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                connected.discard(ws)
        await asyncio.sleep(0.25)


@app.on_event("startup")
async def startup() -> None:
    asyncio.create_task(broadcast_loop())


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(FRONTEND / "index.html")


@app.get("/api/state")
async def get_state() -> dict:
    return state_payload()


@app.post("/api/scenario")
async def set_scenario(req: ScenarioRequest) -> dict:
    global offline_mode
    if req.fatigue_scenario:
        fatigue.set_scenario(req.fatigue_scenario)
    if req.zone_scenario:
        zone.set_scenario(req.zone_scenario)
        zone.manual_workers = []
    if req.offline is not None:
        offline_mode = req.offline
        # Sync current log buffer to cloud if transitioning online
        if not offline_mode:
            for log in safety_logs:
                log["synced"] = True
    return {"ok": True, "state": state_payload()}


@app.post("/api/workers")
async def set_workers(req: WorkersRequest) -> dict:
    zone.set_manual_workers(req.workers)
    zone.name = "manual"
    return {"ok": True}


@app.post("/api/calibrate")
async def calibrate_operator(req: CalibrateRequest) -> dict:
    global active_baseline
    active_baseline.heart_rate = req.heart_rate
    active_baseline.blink_rate = req.blink_rate
    active_baseline.eye_closure_pct = req.eye_closure_pct
    active_baseline.skin_temp_c = req.skin_temp_c

    # Add calibration event to log
    import datetime
    timestamp = datetime.datetime.now().strftime("%H:%M:%S")
    safety_logs.append({
        "timestamp": timestamp,
        "event": f"System calibrated. HR baseline: {req.heart_rate:.0f} bpm, Blink baseline: {req.blink_rate:.1f} bpm, Temp baseline: {req.skin_temp_c:.1f}°C",
        "severity": "INFO",
        "synced": not offline_mode
    })
    if len(safety_logs) > 50:
        safety_logs.pop(0)

    return {"ok": True, "baseline": {
        "heart_rate": active_baseline.heart_rate,
        "blink_rate": active_baseline.blink_rate,
        "eye_closure_pct": active_baseline.eye_closure_pct,
        "skin_temp_c": active_baseline.skin_temp_c
    }}


@app.get("/api/logs")
async def get_logs() -> dict:
    return {"logs": safety_logs}


@app.post("/api/sync_logs")
async def sync_logs() -> dict:
    for log in safety_logs:
        log["synced"] = True
    return {"ok": True}


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    connected.add(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        connected.discard(ws)


app.mount("/static", StaticFiles(directory=FRONTEND), name="static")
