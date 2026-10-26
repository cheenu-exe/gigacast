# VLcast

**A Windows desktop IPTV player powered by VLC's LibVLC engine.**

VLcast is a native desktop application for watching authorized live streams from M3U/M3U8 playlists. VLC handles playback; VLcast provides the channel browser and controls.

## Planned first release

- Embedded LibVLC playback inside the app window
- Open local M3U/M3U8 playlist files
- Add a single network stream URL
- Search and switch channels
- Play/pause, stop, volume, mute, and fullscreen
- Clear playback/error status messages

## Stack

- Python 3.11+
- PySide6 (Qt for Python)
- python-vlc (bindings to LibVLC)
- VLC media player for Windows (64-bit recommended)

## Requirements

1. Windows 10/11.
2. 64-bit Python.
3. VLC media player for Windows installed from [VideoLAN](https://www.videolan.org/vlc/).
4. A stream URL or playlist you are authorized to access and play.

Keep the architecture simple for the first milestone. The app does not host, rebroadcast, or provide TV channels. Users supply their own authorized playlist or stream URLs.

## Run from source

In PowerShell, from the repository folder:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
python -m app.main
```

If PowerShell blocks activation, run the venv's interpreter directly:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m app.main
```

The VLC installation and Python architecture must match (normally 64-bit). If LibVLC cannot be found, install desktop VLC and ensure its installation directory is available to the process. See troubleshooting below.

## Repository layout

```text
app/
  main.py                 Application entry point
  ui/main_window.py       Main window and channel list
  player/vlc_engine.py    LibVLC playback wrapper
  playlist/m3u_parser.py  M3U playlist parser
tests/
  test_m3u_parser.py
requirements.txt
```

## Supported playlist basics

The initial parser handles standard `#EXTM3U` playlists and `#EXTINF` channel metadata, including common `tvg-name`, `tvg-logo`, and `group-title` attributes. Playback depends on stream availability, codecs, authentication, DRM, network conditions, and VLC plugin support.

## Troubleshooting

- **VLC/LibVLC not found:** install VLC for Windows and confirm its architecture matches Python. Restart the terminal/app after installing.
- **Blank video area:** verify the URL in VLC first; some streams may require credentials, use unsupported DRM, or be restricted by the server.
- **Playlist imports but channels fail:** M3U files only list streams; they do not guarantee that each stream is live or authorized.
- **Windows firewall/network issues:** check access to the source URL and whether a VPN or proxy is required.

## Legal and responsible use

Use streams and playlists you own or are authorized to access. Publicly reachable stream URLs are not automatically licensed for redistribution. VLcast does not bundle TV channel URLs or bypass DRM/access controls.

## License

The project source is licensed under the MIT License (see `LICENSE`). VLC/LibVLC and third-party components are separately licensed; review their terms before redistributing a packaged application or VLC binaries.