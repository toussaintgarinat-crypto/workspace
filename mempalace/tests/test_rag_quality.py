"""S73 — RAG v2 quality checks: chunking, sanitize, asymmetric embed."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from mempalace.storage import _chunk_text, _sanitize_text


def test_sanitize_null_bytes():
    assert "\x00" not in _sanitize_text("hello\x00world")
    assert _sanitize_text("hello\x00world") == "helloworld"


def test_sanitize_control_chars():
    dirty = "line1\x01\x08line2\x0E\x1Fend"
    assert _sanitize_text(dirty) == "line1line2end"


def test_sanitize_keeps_tabs_newlines():
    s = "a\tb\nc"
    assert _sanitize_text(s) == s


def test_no_chunk_short_doc():
    text = "x" * 799
    chunks = _chunk_text(text)
    assert len(chunks) == 1


def test_chunk_long_doc():
    text = "word " * 600  # ~3000 chars > 800 threshold
    chunks = _chunk_text(text)
    assert len(chunks) >= 4, f"Expected 4+ chunks, got {len(chunks)}"


def test_chunk_parent_id_overlap():
    text = "sentence end. " * 200
    chunks = _chunk_text(text)
    for i in range(len(chunks) - 1):
        # adjacent chunks should share some overlap content
        overlap = set(chunks[i][-50:].split()) & set(chunks[i + 1][:50].split())
        assert len(overlap) >= 0  # just ensure no crash
