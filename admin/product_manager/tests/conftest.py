import sys
import os
from pathlib import Path
from unittest.mock import MagicMock

# Add the project root to sys.path so tests can import modules like 'models'
root_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(root_dir))

# Mock portalocker since it might not be installed in the test environment
sys.modules['portalocker'] = MagicMock()
