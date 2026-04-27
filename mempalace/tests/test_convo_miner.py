import os
import tempfile
import shutil
import pytest

qdrant_client = pytest.importorskip("qdrant_client", reason="qdrant_client not installed")

from mempalace.convo_miner import mine_convos
from mempalace.storage import get_palace_storage


def test_convo_mining():
    tmpdir = tempfile.mkdtemp()
    with open(os.path.join(tmpdir, "chat.txt"), "w") as f:
        f.write(
            "> What is memory?\nMemory is persistence.\n\n"
            "> Why does it matter?\nIt enables continuity.\n\n"
            "> How do we build it?\nWith structured storage.\n"
        )

    palace_path = os.path.join(tmpdir, "palace")
    mine_convos(tmpdir, palace_path, wing="test_convos")

    col = get_palace_storage(palace_path)
    assert col is not None
    assert col.count() >= 2

    results = col.query(
        query_texts=["memory persistence"],
        n_results=1,
        include=["documents"],
    )
    assert len(results["documents"][0]) > 0

    shutil.rmtree(tmpdir)
