"""
Metrics Collector for AI Gateway.
Tracks route attempts, success rates, fallbacks, cache hits, and latency percentiles (p50, p95).
Supports reporting for health probes and Prometheus-compatible metrics.
"""
from collections import defaultdict
import math
import threading
import time
from typing import Any, Dict, List, Optional


class AIMetricsCollector:
    """Thread-safe collector for AI route metrics."""

    def __init__(self):
        self._lock = threading.Lock()
        self._attempts = defaultdict(int)
        self._successes = defaultdict(int)
        self._failures = defaultdict(int)
        self._fallbacks = defaultdict(int)
        self._cache_hits = defaultdict(int)
        self._latencies_ms = defaultdict(list)

    def record_attempt(self, route_id: str) -> None:
        with self._lock:
            self._attempts[route_id] += 1

    def record_success(self, route_id: str, latency_ms: float) -> None:
        with self._lock:
            self._successes[route_id] += 1
            # Keep rolling window of last 200 latency samples per route
            samples = self._latencies_ms[route_id]
            samples.append(latency_ms)
            if len(samples) > 200:
                del samples[0]

    def record_failure(self, route_id: str, latency_ms: float) -> None:
        with self._lock:
            self._failures[route_id] += 1
            samples = self._latencies_ms[route_id]
            samples.append(latency_ms)
            if len(samples) > 200:
                del samples[0]

    def record_fallback(self, from_route: str, to_route: str) -> None:
        with self._lock:
            self._fallbacks[f"{from_route}->{to_route}"] += 1

    def record_cache_hit(self, task_type: str) -> None:
        with self._lock:
            self._cache_hits[task_type] += 1

    def _percentile(self, values: List[float], p: float) -> float:
        if not values:
            return 0.0
        sorted_vals = sorted(values)
        k = (len(sorted_vals) - 1) * p
        f = math.floor(k)
        c = math.ceil(k)
        if f == c:
            return sorted_vals[int(k)]
        d0 = sorted_vals[int(f)] * (c - k)
        d1 = sorted_vals[int(c)] * (k - f)
        return round(d0 + d1, 2)

    def get_summary(self) -> Dict[str, Any]:
        with self._lock:
            total_attempts = sum(self._attempts.values())
            total_successes = sum(self._successes.values())
            total_failures = sum(self._failures.values())
            total_cache_hits = sum(self._cache_hits.values())
            total_fallbacks = sum(self._fallbacks.values())

            routes_summary = {}
            all_routes = set(self._attempts.keys()) | set(self._successes.keys()) | set(self._failures.keys())
            for r in all_routes:
                att = self._attempts[r]
                succ = self._successes[r]
                fail = self._failures[r]
                lats = self._latencies_ms[r]
                routes_summary[r] = {
                    "attempts": att,
                    "successes": succ,
                    "failures": fail,
                    "success_rate": round(succ / att * 100, 1) if att > 0 else 0.0,
                    "p50_latency_ms": self._percentile(lats, 0.50),
                    "p95_latency_ms": self._percentile(lats, 0.95),
                }

            overall_success_rate = (
                round(total_successes / total_attempts * 100, 1)
                if total_attempts > 0
                else 100.0
            )
            cache_hit_rate = (
                round(total_cache_hits / (total_attempts + total_cache_hits) * 100, 1)
                if (total_attempts + total_cache_hits) > 0
                else 0.0
            )

            return {
                "total_attempts": total_attempts,
                "total_successes": total_successes,
                "total_failures": total_failures,
                "total_cache_hits": total_cache_hits,
                "total_fallbacks": total_fallbacks,
                "overall_success_rate": overall_success_rate,
                "cache_hit_rate": cache_hit_rate,
                "routes": routes_summary,
            }

    def reset(self) -> None:
        """Reset metrics (useful between test runs)."""
        with self._lock:
            self._attempts.clear()
            self._successes.clear()
            self._failures.clear()
            self._fallbacks.clear()
            self._cache_hits.clear()
            self._latencies_ms.clear()


ai_metrics = AIMetricsCollector()
