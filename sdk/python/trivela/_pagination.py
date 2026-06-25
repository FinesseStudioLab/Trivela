"""Cursor / offset pagination helper that yields items across all pages."""

from __future__ import annotations

from typing import Any, Callable, Dict, Generator, List, Optional, TypeVar

T = TypeVar("T")


def paginate(
    fetch: Callable[[int, int], Dict[str, Any]],
    *,
    parse_item: Callable[[Dict[str, Any]], T],
    page_size: int = 50,
) -> Generator[T, None, None]:
    """Iterate all pages from an endpoint that returns {data, pagination}.

    Args:
        fetch:      Callable(page, limit) → raw response dict.
        parse_item: Converts a raw dict item to a typed model.
        page_size:  Items per page (default 50).

    Yields:
        Typed model instances from every page.
    """
    page = 1
    while True:
        resp = fetch(page, page_size)
        items: List[Dict[str, Any]] = resp.get("data", [])
        for item in items:
            yield parse_item(item)
        pagination = resp.get("pagination", {})
        if not pagination.get("hasNextPage", False):
            break
        page += 1
