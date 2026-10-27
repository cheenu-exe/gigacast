# GigaCast

**A plug-and-play IPTV channel browser, with a Vercel-ready web app and an optional Windows desktop prototype.**

The web version lives in `web/`: it loads the default iptv-org M3U playlist automatically, lets viewers search and switch channels, and uses browser playback where streams are compatible. It does not host video streams. See [`web/README.md`](web/README.md) for local development and Vercel deployment. For Vercel, set the project Root Directory to `web`.

## Desktop prototype

- Dark Qt desktop interface built with PySide6
- Embedded video surface backed by LibVLC (does not launch the separate VLC UI)
- Import local IPTV-style M3U playlists
- Detect a local HLS M3U8 manifest as one media item
- Add a network stream URL manually
- Search channels by name, group, or TVG ID
- Channel switching, play/pause, stop, volume, mute, and fullscreen
- GitHub Actions parser tests

## Stack

- Python 3.11+
- PySide6 (Qt for Python)
- python-vlc (Python bindings for LibVLC)
- VLC Media Player for Windows, preferably 64-bit

## Requirements

1. Windows 10 or 11.
2. 64-bit Python.
3. VLC for Windows installed from [VideoLAN](https://www.videolan.org/vlc/).
4. A stream URL or playlist you are authorized to access and play.

Python and VLC should use matching architectures. The app can open and parse playlists without VLC loaded, but playback requires the VLC native libraries and plugins.

## Run from source

Open PowerShell in the repository folder:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements-dev.txt
python -m app.main
```

If PowerShell blocks activation, use the virtual environment's Python executable directly:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m app.main
```

For a missing VLC DLL, install desktop VLC and restart the terminal/app. The runtime loader checks the common VideoLAN install folders and the optional VLC_PATH environment variable.

## Test the playlist parser

```powershell
python -m pytest
```

The parser tests do not require live stream access. The Windows GitHub Actions workflow runs these tests on pushes and pull requests to main.

## Layout

```text
app/
  main.py
  ui/main_window.py
  player/vlc_engine.py
  playlist/m3u_parser.py
tests/
  test_m3u_parser.py
requirements.txt
requirements-dev.txt
pyproject.toml
```

## Stream and playlist notes

M3U playlists are channel catalogues; they do not guarantee that each URL is online or browser/player compatible. Playback success depends on the stream format, codecs, authentication, DRM, network conditions, server configuration, and VLC plugin support. Local HLS manifests are treated as one media item rather than a channel list.

## Legal and responsible use

Use streams and playlists you own or are authorized to access. A publicly reachable URL is not automatically licensed for redistribution. GigaCast does not bundle channel URLs or bypass DRM/access controls.

The project source is licensed under MIT (see LICENSE). VLC/LibVLC and third-party components have their own licenses. Review the applicable terms before redistributing a packaged application or VLC binaries.
