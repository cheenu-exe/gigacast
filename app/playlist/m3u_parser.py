"""Parser for common IPTV-style M3U playlists."""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Channel:
    """A channel entry parsed from a playlist or entered by the user."""

    name: str
    url: str
    group: str = ""
    logo: str = ""
    tvg_id: str = ""


_ATTRIBUTE_RE = re.compile(
    r"""([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s,]+))"""
)
_DURATION_RE = re.compile(r"^\s*-?\d+(?:\.\d+)?(?:\s+|$)")


def _split_extinf(value: str) -> tuple[str, str]:
    """Split EXTINF metadata from its display name at the first unquoted comma."""
    quote: str | None = None
    for index, char in enumerate(value):
        if char in {"'", '"'}:
            if quote is None:
                quote = char
            elif quote == char:
                quote = None
        elif char == "," and quote is None:
            return value[:index], value[index + 1 :].strip()
    return value, ""


def _attributes(value: str) -> dict[str, str]:
    """Extract quoted or unquoted key/value attributes from an EXTINF header."""
    found: dict[str, str] = {}
    for match in _ATTRIBUTE_RE.finditer(value):
        key = match.group(1).lower()
        found[key] = next(
            (part for part in match.groups()[1:] if part is not None),
            "",
        )
    return found


def _fallback_name(url: str, number: int) -> str:
    """Choose a human-readable label for a URL lacking EXTINF metadata."""
    cleaned = url.rstrip("/")
    tail = cleaned.rsplit("/", maxsplit=1)[-1].split("?", maxsplit=1)[0]
    return tail or f"Channel {number}"


def parse_m3u(text: str) -> list[Channel]:
    """Parse a basic M3U/EXTM3U playlist into channels.

    Supports standard EXTINF entries and common tvg-name, tvg-id, tvg-logo,
    and group-title attributes. Plain URLs are also accepted. This parses the
    playlist structure only; it does not verify whether a stream is reachable.
    """
    channels: list[Channel] = []
    pending: dict[str, str] | None = None
    current_group = ""

    for raw_line in text.lstrip("\ufeff").splitlines():
        line = raw_line.strip()
        if not line:
            continue

        if line.upper().startswith("#EXTINF:"):
            metadata, display_name = _split_extinf(line[len("#EXTINF:") :])
            metadata = _DURATION_RE.sub("", metadata, count=1)
            attrs = _attributes(metadata)
            pending = {
                "name": display_name or attrs.get("tvg-name", ""),
                "group": attrs.get("group-title", current_group),
                "logo": attrs.get("tvg-logo", ""),
                "tvg_id": attrs.get("tvg-id", ""),
            }
            continue

        if line.upper().startswith("#EXTGRP:"):
            current_group = line.split(":", maxsplit=1)[1].strip()
            continue

        # Ignore metadata, comments, and HLS directives; they are not channel URLs.
        if line.startswith("#"):
            continue

        if pending is not None:
            name = pending["name"] or pending["tvg_id"] or _fallback_name(
                line, len(channels) + 1
            )
            channels.append(
                Channel(
                    name=name,
                    url=line,
                    group=pending["group"],
                    logo=pending["logo"],
                    tvg_id=pending["tvg_id"],
                )
            )
            pending = None
        else:
            channels.append(
                Channel(name=_fallback_name(line, len(channels) + 1), url=line)
            )

    return channels


def is_hls_media_playlist(text: str) -> bool:
    """Return True when text looks like an HLS manifest rather than an IPTV list."""
    upper = text.upper()
    return "#EXTM3U" in upper and any(
        marker in upper
        for marker in (
            "#EXT-X-TARGETDURATION",
            "#EXT-X-MEDIA-SEQUENCE",
            "#EXT-X-STREAM-INF",
            "#EXT-X-PLAYLIST-TYPE",
        )
    )
