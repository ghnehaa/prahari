"""Simulated multi-modal fatigue fusion with conformal-style confidence."""

from dataclasses import dataclass
import math
import random
import time


@dataclass
class SensorInputs:
    blink_rate: float
    eye_closure_pct: float
    head_nod_angle: float
    posture_slump: float
    heart_rate: float
    skin_temp_c: float
    baseline_hr: float = 72.0


@dataclass
class OperatorBaseline:
    heart_rate: float = 72.0
    blink_rate: float = 18.0
    eye_closure_pct: float = 0.05
    skin_temp_c: float = 36.6


@dataclass
class FatigueOutput:
    risk: float
    confidence: float
    time_to_lapse_sec: float | None
    shap_factors: list[dict]
    forecast: list[dict]


def _clamp(value: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, value))


def fuse_fatigue(inputs: SensorInputs, baseline: OperatorBaseline = None) -> FatigueOutput:
    """Fuse behavioural + physiological signals into calibrated risk with forecast."""
    if baseline is None:
        baseline = OperatorBaseline()

    # Calculate deviations based on user-calibrated baseline
    blink_dev = _clamp(abs(inputs.blink_rate - baseline.blink_rate) / max(baseline.blink_rate, 1.0))
    
    eye_diff = inputs.eye_closure_pct - baseline.eye_closure_pct
    eye_risk = _clamp(eye_diff / max(1.0 - baseline.eye_closure_pct, 0.1))
    
    nod_risk = _clamp(inputs.head_nod_angle / 35.0)
    slump_risk = _clamp(inputs.posture_slump)
    
    hr_delta = (inputs.heart_rate - baseline.heart_rate) / max(baseline.heart_rate, 1.0)
    hr_risk = _clamp(hr_delta * 1.2)
    
    heat_risk = _clamp((inputs.skin_temp_c - baseline.skin_temp_c) / 2.5)

    weights = {
        "eye_closure": 0.28,
        "head_nod": 0.22,
        "posture_slump": 0.14,
        "heart_rate": 0.18,
        "heat_stress": 0.10,
        "blink_dynamics": 0.08,
    }
    raw = {
        "eye_closure": eye_risk,
        "head_nod": nod_risk,
        "posture_slump": slump_risk,
        "heart_rate": hr_risk,
        "heat_stress": heat_risk,
        "blink_dynamics": blink_dev,
    }

    risk = sum(raw[k] * weights[k] for k in weights)
    agreement = 1.0 - (max(raw.values()) - min(raw.values())) * 0.35
    confidence = _clamp(0.55 + agreement * 0.4 + (0.1 if risk > 0.4 else 0))

    if risk >= 0.25:
        lead = max(30.0, 360.0 * (1.0 - risk))
        time_to_lapse = lead + random.uniform(-8.0, 8.0)
    else:
        time_to_lapse = None

    shap = [
        {"feature": k.replace("_", " ").title(), "impact": round(v * w, 3), "direction": "increases risk"}
        for k, v in sorted(raw.items(), key=lambda x: x[1] * weights[x[0]], reverse=True)
        for w in [weights[k]]
    ]

    # Generate 12-minute future forecast (7 points at 0, 2, 4, 6, 8, 10, 12 minutes)
    forecast_points = []
    for m in [0, 2, 4, 6, 8, 10, 12]:
        # For a given future minute, project risk escalation
        if time_to_lapse is not None:
            # Escalating scenario: risk reaches 1.0 at time_to_lapse_sec
            time_fraction = min(1.0, (m * 60.0) / time_to_lapse)
            expected_risk = risk + (1.0 - risk) * (time_fraction ** 1.5)
        else:
            # Baseline scenario: steady risk with small fluctuations
            expected_risk = risk + (0.02 * math.sin(m * 0.5))
        
        # Conformal interval width expands in the future
        interval_width = (1.0 - confidence) * (1.0 + 0.1 * m)
        lower_bound = _clamp(expected_risk - interval_width / 2.0)
        upper_bound = _clamp(expected_risk + interval_width / 2.0)
        
        forecast_points.append({
            "minute": m,
            "expected": round(_clamp(expected_risk), 3),
            "lower": round(lower_bound, 3),
            "upper": round(upper_bound, 3)
        })


class FatigueScenario:
    """Time-varying simulated operator state for demo scenarios."""

    def __init__(self, name: str = "idle"):
        self.name = name
        self.start = time.time()
        self._phase = 0.0

    def set_scenario(self, name: str) -> None:
        self.name = name
        self.start = time.time()

    def sample(self) -> SensorInputs:
        t = time.time() - self.start

        if self.name == "idle":
            return SensorInputs(
                blink_rate=16 + random.uniform(-2, 2),
                eye_closure_pct=0.05 + random.uniform(0, 0.03),
                head_nod_angle=2 + random.uniform(-1, 1),
                posture_slump=0.08,
                heart_rate=70 + random.uniform(-3, 3),
                skin_temp_c=36.6 + random.uniform(-0.2, 0.2),
            )

        if self.name == "heat_stress":
            progress = _clamp(t / 90)
            return SensorInputs(
                blink_rate=14 + progress * 6,
                eye_closure_pct=0.08 + progress * 0.15,
                head_nod_angle=5 + progress * 8,
                posture_slump=0.1 + progress * 0.2,
                heart_rate=78 + progress * 22,
                skin_temp_c=36.9 + progress * 1.4,
            )

        if self.name == "microsleep":
            progress = _clamp(t / 45)
            nod = 8 + 25 * math.sin(t * 0.35) ** 2 + progress * 12
            return SensorInputs(
                blink_rate=10 + progress * 8,
                eye_closure_pct=0.12 + progress * 0.45,
                head_nod_angle=nod,
                posture_slump=0.15 + progress * 0.35,
                heart_rate=82 + progress * 15,
                skin_temp_c=37.0 + progress * 0.3,
            )

        if self.name == "head_nod_demo":
            # Demo 1: simulated head nod → escalating risk
            progress = _clamp(t / 35)
            nod = progress * 32
            return SensorInputs(
                blink_rate=12 + progress * 5,
                eye_closure_pct=0.1 + progress * 0.35,
                head_nod_angle=nod,
                posture_slump=0.12 + progress * 0.28,
                heart_rate=76 + progress * 18,
                skin_temp_c=36.8 + progress * 0.5,
            )

        return SensorInputs(
            blink_rate=16,
            eye_closure_pct=0.05,
            head_nod_angle=2,
            posture_slump=0.08,
            heart_rate=72,
            skin_temp_c=36.6,
        )
