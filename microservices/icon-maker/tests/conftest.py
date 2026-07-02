import sys
from pathlib import Path

# Service modules are flat in the microservice root (main.py, symbols.py, …).
sys.path.insert(0, str(Path(__file__).parent.parent))
