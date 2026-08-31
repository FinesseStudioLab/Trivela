"""Tests for the pagination helper."""

from trivela._pagination import paginate


def _make_pages(*pages):
    """Return a fetch callable that returns pages in order."""
    call_count = [0]

    def fetch(page, limit):
        idx = call_count[0]
        call_count[0] += 1
        return pages[min(idx, len(pages) - 1)]

    return fetch


def test_paginate_single_page():
    page = {
        "data": [{"id": "1"}, {"id": "2"}],
        "pagination": {"hasNextPage": False},
    }
    results = list(paginate(_make_pages(page), parse_item=lambda d: d["id"]))
    assert results == ["1", "2"]


def test_paginate_multiple_pages():
    page1 = {
        "data": [{"id": "a"}],
        "pagination": {"hasNextPage": True},
    }
    page2 = {
        "data": [{"id": "b"}],
        "pagination": {"hasNextPage": False},
    }
    results = list(paginate(_make_pages(page1, page2), parse_item=lambda d: d["id"]))
    assert results == ["a", "b"]


def test_paginate_empty():
    page = {"data": [], "pagination": {"hasNextPage": False}}
    results = list(paginate(_make_pages(page), parse_item=lambda d: d))
    assert results == []
