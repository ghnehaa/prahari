"""Simulated blind-zone person detection."""

from dataclasses import dataclass
import math
import time


@dataclass
class ZoneConfig:
    center_x: float = 0.5
    center_y: float = 0.5
    radius: float = 0.22
    warning_radius: float = 0.40


@dataclass
class Worker:
    x: float
    y: float
    id: int = 1


@dataclass
class ZoneOutput:
    intrusion: bool
    warning: bool
    confidence: float
    workers_in_zone: int
    workers_in_warning: int


def detect_in_zone(workers: list[Worker], zone: ZoneConfig) -> ZoneOutput:
    in_danger = 0
    in_warning = 0
    max_danger_conf = 0.0
    max_warning_conf = 0.0
    for w in workers:
        dist = math.hypot(w.x - zone.center_x, w.y - zone.center_y)
        if dist <= zone.radius:
            in_danger += 1
            conf = max(0.65, 1.0 - (dist / zone.radius) * 0.25)
            max_danger_conf = max(max_danger_conf, conf)
        elif dist <= zone.warning_radius:
            in_warning += 1
            conf = max(0.50, 1.0 - (dist / zone.warning_radius) * 0.35)
            max_warning_conf = max(max_warning_conf, conf)
            
    return ZoneOutput(
        intrusion=in_danger > 0,
        warning=in_warning > 0,
        confidence=max_danger_conf if in_danger else (max_warning_conf if in_warning else 0.0),
        workers_in_zone=in_danger,
        workers_in_warning=in_warning,
    )


class ZoneScenario:
    """Animated worker paths for blind-zone demo."""

    def __init__(self):
        self.name = "clear"
        self.start = time.time()
        self.manual_workers: list[Worker] = []

    def set_scenario(self, name: str) -> None:
        self.name = name
        self.start = time.time()

    def set_manual_workers(self, workers: list[dict]) -> None:
        self.manual_workers = [Worker(x=w["x"], y=w["y"], id=i + 1) for i, w in enumerate(workers)]

    def get_workers(self) -> list[Worker]:
        if self.manual_workers:
            return self.manual_workers

        t = time.time() - self.start

        if self.name == "clear":
            return [Worker(x=0.82, y=0.78)]

        if self.name == "approach":
            progress = min(1.0, t / 12)
            x = 0.85 - progress * 0.55
            y = 0.72 - progress * 0.18
            return [Worker(x=x, y=y)]

        if self.name == "intrusion":
            return [Worker(x=0.48, y=0.52)]

        if self.name == "mannequin_demo":
            # Demo 2: worker enters danger zone at ~8s
            if t < 8:
                return [Worker(x=0.88, y=0.35)]
            progress = min(1.0, (t - 8) / 4)
            x = 0.88 - progress * 0.42
            y = 0.35 + progress * 0.22
            return [Worker(x=x, y=y)]

        return []
