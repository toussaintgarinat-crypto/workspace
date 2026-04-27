import os
import tempfile
import shutil
import yaml
import pytest

qdrant_client = pytest.importorskip("qdrant_client", reason="qdrant_client not installed")

from mempalace.miner import mine
from mempalace.storage import get_palace_storage


def test_project_mining():
    tmpdir = tempfile.mkdtemp()
    os.makedirs(os.path.join(tmpdir, "backend"))
    with open(os.path.join(tmpdir, "backend", "app.py"), "w") as f:
        f.write("def main():\n    print('hello world')\n" * 20)
    with open(os.path.join(tmpdir, "mempalace.yaml"), "w") as f:
        yaml.dump(
            {
                "wing": "test_project",
                "rooms": [
                    {"name": "backend", "description": "Backend code"},
                    {"name": "general", "description": "General"},
                ],
            },
            f,
        )

    palace_path = os.path.join(tmpdir, "palace")
    mine(tmpdir, palace_path)

    col = get_palace_storage(palace_path)
    assert col is not None
    assert col.count() > 0

    shutil.rmtree(tmpdir)
