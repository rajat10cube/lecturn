"""Test environment defaults (applied before the app is imported).

Seeds a known admin (admin/change-me) so Basic-auth tests work, isolates the DB
to a temp dir, and disables startup scanning. External env still wins (setdefault).
"""

import os
import tempfile

os.environ.pop("LECTURN_CONFIG", None)
os.environ.setdefault("LECTURN_DATA_DIR", tempfile.mkdtemp(prefix="lecturn-test-"))
os.environ.setdefault("LECTURN_AUTH", "basic")
os.environ.setdefault("LECTURN_AUTH_USER", "admin")
os.environ.setdefault("LECTURN_AUTH_PASS", "change-me")
os.environ.setdefault("LECTURN_SCAN_ON_START", "false")
os.environ.setdefault("LECTURN_MIN_VIDEO_BYTES", "1000")  # tiny test videos still count
