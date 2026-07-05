"""Graded escalation and arbitration layer for PRAHARI."""

from dataclasses import dataclass, field
from enum import IntEnum
from typing import Any


class EscalationLevel(IntEnum):
    NORMAL = 0
    NUDGE = 1
    MICRO_BREAK = 2
    THROTTLE_LIMIT = 3
    CONTROLLED_STOP = 4


LEVEL_LABELS = {
    EscalationLevel.NORMAL: "Normal operation",
    EscalationLevel.NUDGE: "Gentle haptic / audio nudge",
    EscalationLevel.MICRO_BREAK: "Forced micro-break prompt",
    EscalationLevel.THROTTLE_LIMIT: "Throttle / speed limiting",
    EscalationLevel.CONTROLLED_STOP: "Controlled stop + supervisor alert",
}


@dataclass
class SafetyState:
    fatigue_risk: float = 0.0
    fatigue_confidence: float = 0.0
    time_to_lapse_sec: float | None = None
    zone_intrusion: bool = False
    zone_warning: bool = False
    zone_confidence: float = 0.0
    workers_in_zone: int = 0
    workers_in_warning: int = 0
    offline: bool = True
    escalation: EscalationLevel = EscalationLevel.NORMAL
    machine_throttle_pct: float = 100.0
    alerts: list[str] = field(default_factory=list)
    shap_factors: list[dict[str, Any]] = field(default_factory=list)
    scenario: str = "idle"
    speed_kmh: float = 12.0
    engine_rpm: float = 1800.0
    brake_pressure_psi: float = 0.0
    hydraulic_psi: float = 1200.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "fatigue_risk": round(self.fatigue_risk, 3),
            "fatigue_confidence": round(self.fatigue_confidence, 3),
            "time_to_lapse_sec": (
                round(self.time_to_lapse_sec, 1) if self.time_to_lapse_sec is not None else None
            ),
            "zone_intrusion": self.zone_intrusion,
            "zone_warning": self.zone_warning,
            "zone_confidence": round(self.zone_confidence, 3),
            "workers_in_zone": self.workers_in_zone,
            "workers_in_warning": self.workers_in_warning,
            "offline": self.offline,
            "escalation": int(self.escalation),
            "escalation_label": LEVEL_LABELS[self.escalation],
            "machine_throttle_pct": round(self.machine_throttle_pct, 1),
            "alerts": self.alerts,
            "shap_factors": self.shap_factors,
            "scenario": self.scenario,
            "speed_kmh": round(self.speed_kmh, 1),
            "engine_rpm": round(self.engine_rpm, 1),
            "brake_pressure_psi": round(self.brake_pressure_psi, 1),
            "hydraulic_psi": round(self.hydraulic_psi, 1),
        }


def compute_escalation(state: SafetyState) -> SafetyState:
    """Arbitrate fatigue + blind-zone signals into graded machine response."""
    import random
    alerts: list[str] = []
    level = EscalationLevel.NORMAL
    throttle = 100.0

    if state.zone_intrusion and state.zone_confidence >= 0.85:
        level = EscalationLevel.CONTROLLED_STOP
        throttle = 0.0
        alerts.append(
            f"CRITICAL: {state.workers_in_zone} worker(s) in danger zone "
            f"({state.zone_confidence:.0%} confidence) — controlled stop"
        )
    elif state.fatigue_risk >= 0.92 and state.fatigue_confidence >= 0.88:
        level = EscalationLevel.CONTROLLED_STOP
        throttle = 0.0
        alerts.append("CRITICAL: Imminent operator incapacitation — controlled stop")
    elif state.fatigue_risk >= 0.78 and state.fatigue_confidence >= 0.80:
        level = EscalationLevel.THROTTLE_LIMIT
        throttle = 35.0
        alerts.append("HIGH: Fatigue risk elevated — throttling machine speed")
    elif state.fatigue_risk >= 0.55 and state.fatigue_confidence >= 0.75:
        level = EscalationLevel.MICRO_BREAK
        throttle = 60.0
        alerts.append("MEDIUM: Operator fatigue detected — micro-break recommended")
    elif state.fatigue_risk >= 0.35:
        level = EscalationLevel.NUDGE
        throttle = 85.0
        alerts.append("LOW: Early fatigue signal — gentle nudge to operator")
    elif state.zone_intrusion and state.zone_confidence >= 0.65:
        level = EscalationLevel.THROTTLE_LIMIT
        throttle = 25.0
        alerts.append("HIGH: Possible worker near swing radius — limiting throttle")
    elif state.zone_warning and state.zone_confidence >= 0.50:
        level = EscalationLevel.NUDGE
        throttle = 80.0
        alerts.append(
            f"WARNING: {state.workers_in_warning} worker(s) in outer swing radius "
            f"({state.zone_confidence:.0%} confidence) — nudge operator"
        )

    # Calculate dynamic telemetry based on safety state
    speed = 12.0 * (throttle / 100.0)
    rpm = 800.0 + 1000.0 * (throttle / 100.0)
    brakes = 0.0
    hydraulic = 800.0 + 400.0 * (throttle / 100.0)
    
    if level == EscalationLevel.CONTROLLED_STOP:
        speed = 0.0
        rpm = 800.0  # idle
        brakes = 120.0
        hydraulic = 350.0
    elif level == EscalationLevel.THROTTLE_LIMIT:
        brakes = 35.0
        
    # Add minor noise to make it feel live
    if speed > 0:
        speed += random.uniform(-0.1, 0.1)
        rpm += random.uniform(-10.0, 10.0)
        hydraulic += random.uniform(-15.0, 15.0)
    else:
        rpm += random.uniform(-2.0, 2.0)
        hydraulic += random.uniform(-5.0, 5.0)

    state.escalation = level
    state.machine_throttle_pct = throttle
    state.alerts = alerts
    state.speed_kmh = max(0.0, speed)
    state.engine_rpm = max(0.0, rpm)
    state.brake_pressure_psi = max(0.0, brakes)
    state.hydraulic_psi = max(0.0, hydraulic)
    return state
