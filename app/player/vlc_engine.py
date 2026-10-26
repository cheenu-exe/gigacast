"""Small Windows-friendly wrapper around VLC's LibVLC media player."""

from __future__ import annotations

import importlib
import os
import sys
from pathlib import Path
from typing import Any


class VLCUnavailableError(RuntimeError):
    """Raised when python-vlc or the VLC native libraries cannot be loaded."""


def _prepare_windows_dll_search() -> list[Any]:
    """Make common VLC install locations visible to Windows DLL loading."""
    handles: list[Any] = []
    if sys.platform != "win32":
        return handles

    candidates: list[Path] = []
    configured = os.environ.get("VLC_PATH")
    if configured:
        candidates.append(Path(configured))

    for env_name in ("PROGRAMFILES", "PROGRAMFILES(X86)"):
        root = os.environ.get(env_name)
        if root:
            candidates.append(Path(root) / "VideoLAN" / "VLC")

    for folder in candidates:
        if not (folder / "libvlc.dll").is_file():
            continue
        try:
            handles.append(os.add_dll_directory(str(folder)))
        except (AttributeError, OSError):
            pass
        os.environ["PATH"] = str(folder) + os.pathsep + os.environ.get("PATH", "")
        plugin_dir = folder / "plugins"
        if plugin_dir.is_dir() and not os.environ.get("VLC_PLUGIN_PATH"):
            os.environ["VLC_PLUGIN_PATH"] = str(plugin_dir)
        break

    return handles


class VLCPlayer:
    """Embed a LibVLC media player into a Qt video widget.

    VLC's native runtime performs playback inside the application; the VLC
    desktop interface is not launched.
    """

    def __init__(self, video_widget: Any) -> None:
        self._dll_handles = _prepare_windows_dll_search()
        try:
            self._vlc = importlib.import_module("vlc")
        except (ImportError, OSError) as exc:
            raise VLCUnavailableError(
                "The python-vlc package or VLC native libraries could not be loaded."
            ) from exc

        try:
            self._instance = self._vlc.Instance("--no-video-title-show")
            if self._instance is None:
                raise RuntimeError("LibVLC could not create an instance.")
            self._player = self._instance.media_player_new()
            self._player.set_hwnd(int(video_widget.winId()))
        except Exception as exc:
            raise VLCUnavailableError(
                "Could not load VLC's native runtime. Install 64-bit VLC from "
                "https://www.videolan.org/vlc/ and ensure VLC matches Python's architecture."
            ) from exc

    def play(self, source: str) -> None:
        """Play a network MRL or local media file."""
        source_path = Path(source)
        try:
            if source_path.is_file():
                media = self._instance.media_new_path(str(source_path.resolve()))
            else:
                media = self._instance.media_new(source)
            self._player.set_media(media)
            result = self._player.play()
            if result == -1:
                raise RuntimeError("LibVLC refused to start playback.")
        except Exception as exc:
            raise RuntimeError(f"Could not start playback: {exc}") from exc

    def pause(self) -> None:
        """Toggle pause/resume when media has been loaded."""
        if self._player.get_media() is not None:
            self._player.pause()

    def stop(self) -> None:
        self._player.stop()

    def set_volume(self, volume: int) -> None:
        self._player.audio_set_volume(max(0, min(100, int(volume))))

    def toggle_mute(self) -> bool:
        """Toggle mute and return the new mute state."""
        muted = bool(self._player.audio_get_mute())
        self._player.audio_set_mute(not muted)
        return not muted

    def state_name(self) -> str:
        """Return a lowercase LibVLC state name for UI status polling."""
        try:
            state = self._player.get_state()
            states = (
                (self._vlc.State.NothingSpecial, "nothing_special"),
                (self._vlc.State.Opening, "opening"),
                (self._vlc.State.Buffering, "buffering"),
                (self._vlc.State.Playing, "playing"),
                (self._vlc.State.Paused, "paused"),
                (self._vlc.State.Stopped, "stopped"),
                (self._vlc.State.Ended, "ended"),
                (self._vlc.State.Error, "error"),
            )
            for candidate, name in states:
                if state == candidate:
                    return name
            return "unknown"
        except Exception:
            return "unknown"

    def close(self) -> None:
        """Release native playback resources."""
        try:
            self._player.stop()
            self._player.release()
        except Exception:
            pass
        try:
            self._instance.release()
        except Exception:
            pass
        # Keep DLL directory handles alive until after LibVLC releases its resources.
        self._dll_handles.clear()
