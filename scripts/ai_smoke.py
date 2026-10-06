#!/usr/bin/env python3
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
backend_script = root / "backend" / "scripts" / "ai_smoke.py"

env = dict(sys.path)
cmd = [sys.executable, str(backend_script)]
sys.exit(subprocess.call(cmd))
