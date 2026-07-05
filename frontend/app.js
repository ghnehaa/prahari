const canvas = document.getElementById("zone-canvas");
const ctx = canvas.getContext("2d");

let state = {};
let manualWorker = { x: 0.82, y: 0.78 };
let dragging = false;
let lastTick = performance.now();
let frameTimes = [];
let voiceAlertsEnabled = true;
let lastSpokenLevel = -1;
let lastAlertSpokenTime = 0;

// Initialize Chart.js Forecast Line Graph
const ctxChart = document.getElementById("forecast-chart").getContext("2d");
const forecastChart = new Chart(ctxChart, {
  type: "line",
  data: {
    labels: ["0m", "2m", "4m", "6m", "8m", "10m", "12m"],
    datasets: [
      {
        label: "Expected Risk",
        data: [0, 0, 0, 0, 0, 0, 0],
        borderColor: "#06b6d4",
        backgroundColor: "rgba(6, 182, 212, 0.1)",
        borderWidth: 3,
        tension: 0.3,
        fill: false,
        pointRadius: 4,
        pointBackgroundColor: "#06b6d4"
      },
      {
        label: "Upper Bound",
        data: [0, 0, 0, 0, 0, 0, 0],
        borderColor: "rgba(6, 182, 212, 0.15)",
        borderWidth: 1.5,
        borderDash: [4, 4],
        tension: 0.3,
        fill: false,
        pointRadius: 0
      },
      {
        label: "Lower Bound",
        data: [0, 0, 0, 0, 0, 0, 0],
        borderColor: "rgba(6, 182, 212, 0.15)",
        borderWidth: 1.5,
        borderDash: [4, 4],
        tension: 0.3,
        fill: 1, // fills space to Upper Bound dataset index 1
        backgroundColor: "rgba(6, 182, 212, 0.05)",
        pointRadius: 0
      }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false }
    },
    scales: {
      x: {
        grid: { color: "rgba(255,255,255,0.03)" },
        ticks: { color: "#9ca3af", font: { size: 9 } }
      },
      y: {
        min: 0,
        max: 1.0,
        grid: { color: "rgba(255,255,255,0.03)" },
        ticks: {
          color: "#9ca3af",
          font: { size: 9 },
          callback: (value) => `${Math.round(value * 100)}%`
        }
      }
    }
  }
});

const els = {
  countdown: document.getElementById("countdown-value"),
  countdownBlock: document.getElementById("countdown-block"),
  riskBar: document.getElementById("risk-bar"),
  riskVal: document.getElementById("risk-val"),
  confBar: document.getElementById("conf-bar"),
  confVal: document.getElementById("conf-val"),
  shapList: document.getElementById("shap-list"),
  workersCount: document.getElementById("workers-count"),
  zoneConf: document.getElementById("zone-conf"),
  throttleFill: document.getElementById("throttle-fill"),
  throttleVal: document.getElementById("throttle-val"),
  alertsList: document.getElementById("alerts-list"),
  escalationLadder: document.getElementById("escalation-ladder"),
  offlinePill: document.getElementById("offline-pill"),
  latencyMs: document.getElementById("latency-ms"),
  fpsVal: document.getElementById("fps-val"),
  
  // New controls
  voiceToggleBtn: document.getElementById("voice-toggle-btn"),
  cloudToggleBtn: document.getElementById("cloud-toggle-btn"),
  syncNowBtn: document.getElementById("sync-now-btn"),
  logTableBody: document.getElementById("log-table-body"),
  calibrateTriggerBtn: document.getElementById("calibrate-trigger-btn"),
  calibrationOverlay: document.getElementById("calibration-overlay"),
  calCountdown: document.getElementById("cal-countdown"),
  calBarFill: document.getElementById("cal-bar-fill"),
  calHr: document.getElementById("cal-hr"),
  calBlink: document.getElementById("cal-blink"),
  calTemp: document.getElementById("cal-temp"),
  
  // Telemetry
  telSpeed: document.getElementById("tel-speed"),
  telRpm: document.getElementById("tel-rpm"),
  telBrakes: document.getElementById("tel-brakes"),
  telHydraulic: document.getElementById("tel-hydraulic")
};

function formatCountdown(sec) {
  if (sec == null) return "Baseline Stable";
  if (sec >= 60) return `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s`;
  return `${Math.round(sec)} seconds`;
}

function pct(v) {
  return `${Math.round(v * 100)}%`;
}

// Speak voice alerts
function speakAlert(text) {
  if (!voiceAlertsEnabled) return;
  const now = performance.now();
  // Limit voice speech frequency
  if (now - lastAlertSpokenTime < 4500) return;
  lastAlertSpokenTime = now;

  try {
    window.speechSynthesis.cancel(); // kill active speech
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.error("SpeechSynthesis error:", err);
  }
}

function updateUI(data) {
  state = data;
  const risk = data.fatigue_risk || 0;
  const conf = data.fatigue_confidence || 0;

  // Update Incapacitation Countdown
  els.countdown.textContent = formatCountdown(data.time_to_lapse_sec);
  els.countdownBlock.className = "countdown-block";
  if (risk >= 0.78) {
    els.countdownBlock.classList.add("critical");
  } else if (risk >= 0.35) {
    els.countdownBlock.classList.add("alert");
  }

  // Update sliders
  els.riskBar.style.width = pct(risk);
  els.riskVal.textContent = pct(risk);
  els.confBar.style.width = pct(conf);
  els.confVal.textContent = pct(conf);

  // Update SHAP explainability list
  els.shapList.innerHTML = (data.shap_factors || [])
    .map(
      (f) =>
        `<li><span>${f.feature}</span><span class="impact">+${(f.impact * 100).toFixed(0)}%</span></li>`
    )
    .join("") || "<li class='muted-li'>Baseline stable</li>";

  // Update worker telemetry counts
  els.workersCount.textContent = data.workers_in_zone ?? 0;
  els.zoneConf.textContent = pct(data.zone_confidence || 0);

  // Update dynamic CAN-bus telemetry widgets
  els.telSpeed.textContent = `${(data.speed_kmh || 0).toFixed(1)} km/h`;
  els.telRpm.textContent = `${Math.round(data.engine_rpm || 0)} RPM`;
  els.telBrakes.textContent = `${Math.round(data.brake_pressure_psi || 0)} PSI`;
  els.telHydraulic.textContent = `${Math.round(data.hydraulic_psi || 0)} PSI`;

  // Update machine actuation throttle
  const throttle = data.machine_throttle_pct ?? 100;
  els.throttleFill.style.width = `${throttle}%`;
  els.throttleVal.textContent = `${Math.round(throttle)}%`;

  // Update Graded Escalation Steps
  const level = data.escalation ?? 0;
  els.escalationLadder.querySelectorAll(".step").forEach((step) => {
    const l = parseInt(step.dataset.level, 10);
    step.classList.toggle("active", l === level);
    step.classList.toggle("danger", l === level && level >= 3);
  });

  // Handle active alerts list
  if (data.alerts && data.alerts.length) {
    els.alertsList.innerHTML = data.alerts
      .map((a) => `<li class="${a.startsWith("CRITICAL") ? "critical" : ""}">${a}</li>`)
      .join("");
      
    // Trigger voice alert on new safety escalation level
    if (level !== lastSpokenLevel) {
      lastSpokenLevel = level;
      // Get the last alert message
      const speechMsg = data.alerts[data.alerts.length - 1].split(" — ")[0];
      speakAlert(speechMsg);
    }
  } else {
    els.alertsList.innerHTML = "<li class='muted-li'>No active alerts</li>";
    if (level === 0 && lastSpokenLevel !== 0) {
      lastSpokenLevel = 0;
      speakAlert("Safety parameters normalized.");
    }
  }

  // Update offline status pills
  els.offlinePill.textContent = data.offline
    ? "● OFFLINE — ON-DEVICE"
    : "● ONLINE — SYNC ACTIVE";
  els.offlinePill.classList.toggle("online", !data.offline);

  els.cloudToggleBtn.textContent = data.offline
    ? "OFFLINE (BUFFERING)"
    : "ONLINE (CONNECTED)";
  els.cloudToggleBtn.className = `cloud-btn ${data.offline ? "offline" : "online"}`;

  // Update Chart.js Forecast Line Plot
  if (data.forecast && data.forecast.length) {
    const expected = data.forecast.map((f) => f.expected);
    const upper = data.forecast.map((f) => f.upper);
    const lower = data.forecast.map((f) => f.lower);

    forecastChart.data.datasets[0].data = expected;
    forecastChart.data.datasets[1].data = upper;
    forecastChart.data.datasets[2].data = lower;

    // Dynamically change chart colors based on risk severity
    const isCritical = risk >= 0.78;
    const isAlert = risk >= 0.35;
    const primaryColor = isCritical ? "#ef4444" : (isAlert ? "#f97316" : "#06b6d4");
    const bandColor = isCritical ? "rgba(239, 68, 68, 0.05)" : (isAlert ? "rgba(249, 115, 22, 0.05)" : "rgba(6, 182, 212, 0.05)");

    forecastChart.data.datasets[0].borderColor = primaryColor;
    forecastChart.data.datasets[0].pointBackgroundColor = primaryColor;
    forecastChart.data.datasets[2].backgroundColor = bandColor;
    forecastChart.update("none"); // silent update
  }

  // Handle worker position update from API
  if (data.workers && data.workers.length && !dragging) {
    manualWorker = { x: data.workers[0].x, y: data.workers[0].y };
  }
}

// Draw radar canvas
function drawZone() {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // Background grid pattern
  ctx.fillStyle = "#05070a";
  ctx.fillRect(0, 0, w, h);

  // Radar Grid Lines
  ctx.strokeStyle = "rgba(6, 182, 212, 0.05)";
  ctx.lineWidth = 1;
  for (let i = 0; i < w; i += 40) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke();
  }
  for (let j = 0; j < h; j += 40) {
    ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(w, j); ctx.stroke();
  }

  const cx = 0.5 * w;
  const cy = 0.5 * h;

  // Draw Camera Sweep sectors (Rear Swing view angle)
  ctx.fillStyle = "rgba(6, 182, 212, 0.02)";
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, Math.max(w, h), Math.PI * 0.25, Math.PI * 0.75);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, Math.max(w, h), Math.PI * 1.25, Math.PI * 1.75);
  ctx.closePath();
  ctx.fill();

  // Radar concentric rings
  const zone = state.zone || { radius: 0.22, warning_radius: 0.40 };
  const rDanger = zone.radius * Math.min(w, h);
  const rWarning = (zone.warning_radius || 0.40) * Math.min(w, h);

  // 1. Warning Zone
  ctx.beginPath();
  ctx.arc(cx, cy, rWarning, 0, Math.PI * 2);
  ctx.fillStyle = state.zone_warning
    ? "rgba(249, 115, 22, 0.07)"
    : "rgba(255, 255, 255, 0.01)";
  ctx.fill();
  ctx.strokeStyle = state.zone_warning ? "rgba(249, 115, 22, 0.6)" : "rgba(255, 255, 255, 0.1)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 6]);
  ctx.stroke();
  ctx.setLineDash([]);

  // 2. Danger Zone
  ctx.beginPath();
  ctx.arc(cx, cy, rDanger, 0, Math.PI * 2);
  ctx.fillStyle = state.zone_intrusion
    ? "rgba(239, 68, 68, 0.15)"
    : "rgba(239, 68, 68, 0.03)";
  ctx.fill();
  ctx.strokeStyle = state.zone_intrusion ? "#ef4444" : "rgba(239, 68, 68, 0.35)";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw HUD indicators
  ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
  ctx.font = "bold 8px JetBrains Mono";
  ctx.fillText("CRITICAL DANGER ZONE (2m)", cx - 60, cy - rDanger - 6);
  ctx.fillText("WARNING SHIELD ZONE (4m)", cx - 60, cy - rWarning - 6);

  // Drawing the center heavy machinery silhouette
  ctx.strokeStyle = "rgba(6, 182, 212, 0.6)";
  ctx.lineWidth = 2.5;
  ctx.fillStyle = "#0d131f";

  // Center core body
  ctx.beginPath();
  ctx.rect(cx - 16, cy - 22, 32, 44);
  ctx.fill();
  ctx.stroke();

  // Cab cabin details
  ctx.strokeStyle = "#06b6d4";
  ctx.strokeRect(cx - 10, cy - 14, 20, 22);

  // Left & Right Tracks
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(cx - 24, cy - 25, 8, 50);
  ctx.fillRect(cx + 16, cy - 25, 8, 50);
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.strokeRect(cx - 24, cy - 25, 8, 50);
  ctx.strokeRect(cx + 16, cy - 25, 8, 50);

  // Excavator arm indicator
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx - 30, cy + 40);
  ctx.strokeStyle = "rgba(168, 85, 247, 0.6)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.font = "bold 9px DM Sans";
  ctx.fillText("PRAHARI EDGE", cx - 34, cy + 30);

  // Draw worker beacon
  const wx = manualWorker.x * w;
  const wy = manualWorker.y * h;

  // Signal waves pulsing
  const pulseFactor = (Date.now() % 1000) / 1000;
  ctx.beginPath();
  ctx.arc(wx, wy, 12 + pulseFactor * 16, 0, Math.PI * 2);
  ctx.fillStyle = state.zone_intrusion
    ? `rgba(239, 68, 68, ${0.4 * (1 - pulseFactor)})`
    : `rgba(249, 115, 22, ${0.4 * (1 - pulseFactor)})`;
  ctx.fill();

  // Solid Core Beacon
  ctx.beginPath();
  ctx.arc(wx, wy, 9, 0, Math.PI * 2);
  ctx.fillStyle = state.zone_intrusion ? "#ef4444" : "#f97316";
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Text anchor
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 8px JetBrains Mono";
  ctx.fillText("CREW #1", wx + 12, wy + 3);
}

function canvasToNorm(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: Math.max(0, Math.min(1, ((e.clientX - rect.left) * scaleX) / canvas.width)),
    y: Math.max(0, Math.min(1, ((e.clientY - rect.top) * scaleY) / canvas.height)),
  };
}

async function pushWorker() {
  await fetch("/api/workers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workers: [manualWorker] }),
  });
}

// Drag & Drop Worker Hooks
canvas.addEventListener("mousedown", (e) => {
  dragging = true;
  manualWorker = canvasToNorm(e);
  pushWorker();
});

canvas.addEventListener("mousemove", (e) => {
  if (!dragging) return;
  manualWorker = canvasToNorm(e);
  pushWorker();
});

canvas.addEventListener("mouseup", () => { dragging = false; });
canvas.addEventListener("mouseleave", () => { dragging = false; });

// Shift Calibration Manager
let calInterval = null;
let calCount = 5;
let sumHr = 0, sumBlink = 0, sumTemp = 0;
let calSamples = 0;

els.calibrateTriggerBtn.addEventListener("click", () => {
  els.calibrationOverlay.classList.remove("hidden");
  speakAlert("Shift Calibration initiated. Please look at the camera sensor.");
  
  calCount = 5;
  sumHr = 0;
  sumBlink = 0;
  sumTemp = 0;
  calSamples = 0;
  els.calCountdown.textContent = calCount;
  els.calBarFill.style.width = "0%";
  
  calInterval = setInterval(async () => {
    calCount--;
    els.calCountdown.textContent = calCount;
    els.calBarFill.style.width = `${((5 - calCount) / 5) * 100}%`;
    
    // Sample live simulation telemetry
    const curHr = 70 + Math.random() * 6;
    const curBlink = 15 + Math.random() * 4;
    const curTemp = 36.5 + Math.random() * 0.4;
    
    sumHr += curHr;
    sumBlink += curBlink;
    sumTemp += curTemp;
    calSamples++;
    
    els.calHr.textContent = `${Math.round(curHr)} bpm`;
    els.calBlink.textContent = `${Math.round(curBlink)} bpm`;
    els.calTemp.textContent = `${curTemp.toFixed(1)} °C`;
    
    if (calCount <= 0) {
      clearInterval(calInterval);
      
      const avgHr = sumHr / calSamples;
      const avgBlink = sumBlink / calSamples;
      const avgTemp = sumTemp / calSamples;
      
      // Save to baseline calibration endpoint
      const res = await fetch("/api/calibrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          heart_rate: avgHr,
          blink_rate: avgBlink,
          eye_closure_pct: 0.05, // calibration eye closure baseline
          skin_temp_c: avgTemp
        })
      });
      
      if (res.ok) {
        speakAlert("System calibrated. Thresholds adjusted for your baseline.");
        els.calibrationOverlay.classList.add("hidden");
        fetchLogs();
      }
    }
  }, 1000);
});

// Sync Manager APIs
async function fetchLogs() {
  try {
    const res = await fetch("/api/logs");
    const data = await res.json();
    
    if (data.logs && data.logs.length) {
      els.logTableBody.innerHTML = data.logs
        .reverse()
        .map((log) => {
          const syncBadge = log.synced
            ? "<span class='badge-sync synced'>Synced</span>"
            : "<span class='badge-sync buffered'>Buffered (Local)</span>";
          const rowClass = log.severity.toLowerCase();
          return `<tr class="${rowClass}">
            <td>${log.timestamp}</td>
            <td>${log.event}</td>
            <td>${log.severity}</td>
            <td>${syncBadge}</td>
          </tr>`;
        })
        .join("");
    } else {
      els.logTableBody.innerHTML = `<tr>
        <td colspan="4" class="muted text-center">No telemetry logs recorded in this session.</td>
      </tr>`;
    }
  } catch (err) {
    console.error("Error loading event logs:", err);
  }
}

els.cloudToggleBtn.addEventListener("click", async () => {
  const isOnlineNow = els.cloudToggleBtn.classList.contains("online");
  // Toggle link status
  await fetch("/api/scenario", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ offline: isOnlineNow }), // toggles online state
  });
  fetchLogs();
});

els.syncNowBtn.addEventListener("click", async () => {
  speakAlert("Initiating cloud synchronization.");
  const res = await fetch("/api/sync_logs", { method: "POST" });
  if (res.ok) {
    fetchLogs();
  }
});

// Voice pill toggle hook
els.voiceToggleBtn.addEventListener("click", () => {
  voiceAlertsEnabled = !voiceAlertsEnabled;
  els.voiceToggleBtn.textContent = voiceAlertsEnabled
    ? "🔊 Voice Alerts: ON"
    : "🔇 Voice Alerts: OFF";
  els.voiceToggleBtn.classList.toggle("pill-active", voiceAlertsEnabled);
});

// Scenario triggers
document.querySelectorAll(".demo-btn").forEach((btn) => {
  // skip calibration and reset/sync buttons
  if (btn.id === "calibrate-trigger-btn" || btn.id === "sync-now-btn") return;
  btn.addEventListener("click", async () => {
    const demo = btn.dataset.demo;
    let body = {};

    if (demo === "head_nod") {
      body = { fatigue_scenario: "head_nod_demo", zone_scenario: "clear" };
      speakAlert("Starting scenario one: operator fatigue simulation.");
    } else if (demo === "mannequin") {
      body = { fatigue_scenario: "idle", zone_scenario: "mannequin_demo" };
      speakAlert("Starting scenario two: ground crew danger zone intrusion.");
    } else if (demo === "offline") {
      body = { offline: true, fatigue_scenario: "microsleep", zone_scenario: "clear" };
      speakAlert("Starting scenario three: active link cut. Running fully on-device.");
    } else if (demo === "reset") {
      body = { fatigue_scenario: "idle", zone_scenario: "clear", offline: true };
      manualWorker = { x: 0.82, y: 0.78 };
      await pushWorker();
      speakAlert("Dashboard reset. System monitoring normal.");
    }

    await fetch("/api/scenario", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    fetchLogs();
  });
});

function connectWS() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws`);

  ws.onmessage = (ev) => {
    const now = performance.now();
    const dt = now - lastTick;
    lastTick = now;
    frameTimes.push(dt);
    if (frameTimes.length > 20) frameTimes.shift();
    const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    els.latencyMs.textContent = Math.round(dt);
    els.fpsVal.textContent = (1000 / avg).toFixed(1);

    updateUI(JSON.parse(ev.data));
    drawZone();
  };

  ws.onclose = () => setTimeout(connectWS, 1500);
}

connectWS();
setInterval(drawZone, 100);
setInterval(fetchLogs, 2000); // Poll logs every 2s
fetchLogs();

