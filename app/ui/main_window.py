"""Main GigaCast window."""

from __future__ import annotations

from pathlib import Path
from urllib.parse import urlparse

from PySide6.QtCore import Qt, QTimer
from PySide6.QtGui import QAction, QKeySequence
from PySide6.QtWidgets import (
    QFileDialog,
    QFrame,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QSlider,
    QSplitter,
    QVBoxLayout,
    QWidget,
)

from app.player.vlc_engine import VLCPlayer, VLCUnavailableError
from app.playlist.m3u_parser import Channel, is_hls_media_playlist, parse_m3u

_ALLOWED_SCHEMES = {"http", "https", "rtsp", "rtmp", "rtp", "udp", "mms", "ftp"}


def _is_supported_stream_url(value: str) -> bool:
    parsed = urlparse(value.strip())
    scheme = parsed.scheme.lower()
    if scheme not in _ALLOWED_SCHEMES:
        return False
    if scheme in {"udp", "rtp"}:
        return bool(parsed.netloc or parsed.path)
    return bool(parsed.netloc and parsed.hostname)


class MainWindow(QMainWindow):
    """Primary application window with channel list and embedded LibVLC video."""

    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle("GigaCast")
        self.resize(1280, 800)
        self.setMinimumSize(900, 560)

        self._channels: list[Channel] = []
        self._player: VLCPlayer | None = None
        self._muted = False
        self._current_channel: Channel | None = None

        self._build_ui()
        self._apply_style()
        self._create_actions()

        try:
            self._player = VLCPlayer(self.video_surface)
            self._player.set_volume(self.volume_slider.value())
            self.engine_status.setText("VLC engine ready")
        except VLCUnavailableError as exc:
            self.engine_status.setText("VLC engine unavailable")
            self._show_placeholder(
                "Install VLC Media Player for Windows\n"
                "Then restart GigaCast to enable playback."
            )
            self.statusBar().showMessage(str(exc), 12000)

        self._status_timer = QTimer(self)
        self._status_timer.setInterval(500)
        self._status_timer.timeout.connect(self._refresh_playback_status)
        self._status_timer.start()

    def _build_ui(self) -> None:
        root = QWidget(self)
        root_layout = QVBoxLayout(root)
        root_layout.setContentsMargins(16, 12, 16, 12)
        root_layout.setSpacing(12)

        header = QHBoxLayout()
        brand = QLabel("GigaCast")
        brand.setObjectName("brand")
        tagline = QLabel("Live TV, powered by VLC")
        tagline.setObjectName("muted")
        header.addWidget(brand)
        header.addSpacing(14)
        header.addWidget(tagline)
        header.addStretch()
        self.engine_status = QLabel("Starting VLC engine…")
        self.engine_status.setObjectName("engineStatus")
        header.addWidget(self.engine_status)
        root_layout.addLayout(header)

        splitter = QSplitter(Qt.Orientation.Horizontal)
        splitter.setChildrenCollapsible(False)

        sidebar = QFrame()
        sidebar.setObjectName("sidebar")
        sidebar.setMinimumWidth(270)
        sidebar.setMaximumWidth(400)
        side_layout = QVBoxLayout(sidebar)
        side_layout.setContentsMargins(12, 14, 12, 12)
        side_layout.setSpacing(10)

        source_title = QLabel("YOUR CHANNELS")
        source_title.setObjectName("sectionTitle")
        side_layout.addWidget(source_title)

        self.stream_input = QLineEdit()
        self.stream_input.setPlaceholderText("Paste a stream URL…")
        self.stream_input.setClearButtonEnabled(True)
        self.stream_input.returnPressed.connect(self._add_stream)
        side_layout.addWidget(self.stream_input)

        add_stream_button = QPushButton("＋  Add stream")
        add_stream_button.setObjectName("primaryButton")
        add_stream_button.clicked.connect(self._add_stream)
        side_layout.addWidget(add_stream_button)

        self.open_playlist_button = QPushButton("Open M3U playlist…")
        self.open_playlist_button.clicked.connect(self._open_playlist)
        side_layout.addWidget(self.open_playlist_button)

        self.search_input = QLineEdit()
        self.search_input.setPlaceholderText("Search channels…")
        self.search_input.setClearButtonEnabled(True)
        self.search_input.textChanged.connect(self._render_channel_list)
        side_layout.addWidget(self.search_input)

        self.channel_list = QListWidget()
        self.channel_list.setObjectName("channelList")
        self.channel_list.currentItemChanged.connect(self._on_channel_selected)
        side_layout.addWidget(self.channel_list, 1)

        self.channel_count = QLabel("0 channels")
        self.channel_count.setObjectName("muted")
        side_layout.addWidget(self.channel_count)

        splitter.addWidget(sidebar)

        player_panel = QWidget()
        player_layout = QVBoxLayout(player_panel)
        player_layout.setContentsMargins(14, 0, 0, 0)
        player_layout.setSpacing(12)

        self.now_playing = QLabel("Select a channel to start watching")
        self.now_playing.setObjectName("nowPlaying")
        player_layout.addWidget(self.now_playing)

        self.video_surface = QFrame()
        self.video_surface.setObjectName("videoSurface")
        self.video_surface.setAttribute(Qt.WidgetAttribute.WA_NativeWindow, True)
        self.video_surface.setMinimumSize(480, 300)
        self.video_surface_layout = QVBoxLayout(self.video_surface)
        self.video_surface_layout.setContentsMargins(20, 20, 20, 20)
        self.placeholder = QLabel(
            "GigaCast\n\nOpen an M3U playlist or add a stream URL to begin."
        )
        self.placeholder.setObjectName("placeholder")
        self.placeholder.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.placeholder.setWordWrap(True)
        self.video_surface_layout.addWidget(self.placeholder)
        player_layout.addWidget(self.video_surface, 1)

        controls = QHBoxLayout()
        self.play_pause_button = QPushButton("▶  Play")
        self.play_pause_button.clicked.connect(self._play_or_pause)
        controls.addWidget(self.play_pause_button)

        self.stop_button = QPushButton("■  Stop")
        self.stop_button.clicked.connect(self._stop)
        controls.addWidget(self.stop_button)

        self.mute_button = QPushButton("Mute")
        self.mute_button.clicked.connect(self._toggle_mute)
        controls.addWidget(self.mute_button)

        self.volume_slider = QSlider(Qt.Orientation.Horizontal)
        self.volume_slider.setRange(0, 100)
        self.volume_slider.setValue(70)
        self.volume_slider.setFixedWidth(130)
        self.volume_slider.valueChanged.connect(self._set_volume)
        controls.addWidget(QLabel("Volume"))
        controls.addWidget(self.volume_slider)
        controls.addStretch()

        self.fullscreen_button = QPushButton("⛶  Fullscreen")
        self.fullscreen_button.clicked.connect(self._toggle_fullscreen)
        controls.addWidget(self.fullscreen_button)
        player_layout.addLayout(controls)

        self.playback_status = QLabel("Ready")
        self.playback_status.setObjectName("muted")
        player_layout.addWidget(self.playback_status)

        splitter.addWidget(player_panel)
        splitter.setStretchFactor(0, 0)
        splitter.setStretchFactor(1, 1)
        splitter.setSizes([320, 900])

        root_layout.addWidget(splitter, 1)
        self.setCentralWidget(root)
        self.statusBar().showMessage("Ready")

    def _apply_style(self) -> None:
        self.setStyleSheet(
            """
            QMainWindow, QWidget {
                background: #101218;
                color: #edf0f7;
                font-family: "Segoe UI";
                font-size: 10pt;
            }
            #brand {
                font-size: 21pt;
                font-weight: 800;
                letter-spacing: 2px;
                color: #ff8b43;
            }
            #muted { color: #9298a8; }
            #engineStatus {
                color: #9bdfb1;
                background: #1a2922;
                border: 1px solid #2d4938;
                border-radius: 8px;
                padding: 6px 10px;
            }
            #sidebar {
                background: #171a23;
                border: 1px solid #2b2f3b;
                border-radius: 12px;
            }
            #sectionTitle {
                color: #aeb4c4;
                font-weight: 700;
                letter-spacing: 1px;
            }
            #nowPlaying { font-size: 13pt; font-weight: 600; }
            #videoSurface {
                background: #050609;
                border: 1px solid #292d37;
                border-radius: 10px;
            }
            #placeholder { color: #81889a; font-size: 13pt; }
            QLineEdit {
                background: #0f1118;
                border: 1px solid #333848;
                border-radius: 7px;
                padding: 10px;
                selection-background-color: #e97835;
            }
            QLineEdit:focus { border: 1px solid #ff8b43; }
            QPushButton {
                background: #252936;
                border: 1px solid #373d4d;
                border-radius: 7px;
                padding: 9px 12px;
            }
            QPushButton:hover { background: #303648; border-color: #616a80; }
            QPushButton:pressed { background: #1a1e29; }
            #primaryButton {
                background: #e97835;
                border-color: #e97835;
                color: #15171d;
                font-weight: 700;
            }
            #primaryButton:hover { background: #ff8b43; }
            QListWidget {
                background: #101218;
                border: 1px solid #2b2f3b;
                border-radius: 7px;
                outline: 0;
                padding: 4px;
            }
            QListWidget::item { padding: 10px 8px; border-radius: 5px; }
            QListWidget::item:hover { background: #222735; }
            QListWidget::item:selected { background: #4a2c20; color: #ffb47f; }
            QSlider::groove:horizontal {
                background: #343948; height: 5px; border-radius: 2px;
            }
            QSlider::handle:horizontal {
                background: #ff8b43; width: 13px; margin: -5px 0;
                border-radius: 6px;
            }
            QStatusBar { color: #9298a8; }
            """
        )

    def _create_actions(self) -> None:
        open_action = QAction("Open playlist…", self)
        open_action.setShortcut(QKeySequence.StandardKey.Open)
        open_action.triggered.connect(self._open_playlist)
        self.addAction(open_action)

        stop_action = QAction("Stop playback / exit fullscreen", self)
        stop_action.setShortcut("Esc")
        stop_action.triggered.connect(self._exit_fullscreen_or_stop)
        self.addAction(stop_action)

    def _show_placeholder(self, message: str) -> None:
        self.placeholder.setText(message)
        self.placeholder.show()

    def _hide_placeholder(self) -> None:
        self.placeholder.hide()

    def _render_channel_list(self, _query: str | None = None) -> None:
        query = self.search_input.text().strip().casefold()
        previous_url = self._current_channel.url if self._current_channel else None
        self.channel_list.blockSignals(True)
        self.channel_list.clear()
        selected_row = -1

        for channel in self._channels:
            searchable = f"{channel.name} {channel.group} {channel.tvg_id}".casefold()
            if query and query not in searchable:
                continue
            label = f"{channel.name}   ·   {channel.group}" if channel.group else channel.name
            item = QListWidgetItem(label)
            item.setData(Qt.ItemDataRole.UserRole, channel)
            self.channel_list.addItem(item)
            if channel.url == previous_url:
                selected_row = self.channel_list.count() - 1

        if (
            selected_row < 0
            and self._current_channel is None
            and self.channel_list.count()
        ):
            selected_row = 0
        self.channel_list.setCurrentRow(selected_row)
        self.channel_list.blockSignals(False)
        self.channel_count.setText(
            f"{self.channel_list.count()} shown · {len(self._channels)} total"
        )

    def _replace_channels(self, channels: list[Channel], auto_play: bool = True) -> None:
        if not channels:
            QMessageBox.information(
                self, "No channels found", "The playlist contained no channel URLs."
            )
            return
        self._channels = channels
        self._current_channel = None
        self._render_channel_list()
        if auto_play and self.channel_list.count():
            item = self.channel_list.item(0)
            channel = item.data(Qt.ItemDataRole.UserRole)
            self.channel_list.setCurrentItem(item)
            self._play_channel(channel)

    def _append_channel(self, channel: Channel) -> None:
        self._channels.append(channel)
        self.search_input.clear()
        self._render_channel_list()
        for row in range(self.channel_list.count()):
            item = self.channel_list.item(row)
            if item.data(Qt.ItemDataRole.UserRole) == channel:
                self.channel_list.blockSignals(True)
                self.channel_list.setCurrentRow(row)
                self.channel_list.blockSignals(False)
                self._play_channel(channel)
                break

    def _add_stream(self) -> None:
        value = self.stream_input.text().strip()
        if not value:
            self.stream_input.setFocus()
            return
        if not _is_supported_stream_url(value):
            QMessageBox.warning(
                self,
                "Unsupported stream URL",
                "Enter a URL using http, https, rtsp, rtmp, rtp, udp, mms, or ftp.",
            )
            return
        channel = Channel(name=f"Stream {len(self._channels) + 1}", url=value)
        self._append_channel(channel)
        self.stream_input.clear()
        self.statusBar().showMessage("Stream added", 4000)

    def _open_playlist(self) -> None:
        filename, _ = QFileDialog.getOpenFileName(
            self,
            "Open IPTV playlist",
            "",
            "M3U playlists (*.m3u *.m3u8);;All files (*)",
        )
        if not filename:
            return

        path = Path(filename)
        try:
            text = path.read_text(encoding="utf-8-sig", errors="replace")
        except OSError as exc:
            QMessageBox.critical(self, "Could not open playlist", str(exc))
            return

        # An HLS manifest is a single stream, not an IPTV channel catalogue.
        if path.suffix.lower() == ".m3u8" and is_hls_media_playlist(text):
            self._replace_channels([Channel(name=path.stem, url=str(path.resolve()))])
            self.statusBar().showMessage(f"Opened HLS media playlist: {path.name}", 5000)
            return

        channels = parse_m3u(text)
        if not channels:
            QMessageBox.information(
                self, "Empty playlist", "No channel URLs were found in this file."
            )
            return

        self._replace_channels(channels)
        self.statusBar().showMessage(
            f"Loaded {len(channels)} channels from {path.name}", 5000
        )

    def _on_channel_selected(
        self, current: QListWidgetItem | None, _previous: QListWidgetItem | None
    ) -> None:
        if current is None:
            return
        channel = current.data(Qt.ItemDataRole.UserRole)
        if isinstance(channel, Channel) and channel != self._current_channel:
            self._play_channel(channel)

    def _play_channel(self, channel: Channel) -> None:
        self._current_channel = channel
        self.now_playing.setText(channel.name)
        if self._player is None:
            self.playback_status.setText("VLC is not installed or could not be loaded.")
            self._show_placeholder(
                "VLC playback engine unavailable\n\n"
                "Install VLC for Windows and restart GigaCast."
            )
            return
        try:
            self._player.play(channel.url)
            self.playback_status.setText("Connecting…")
            self._hide_placeholder()
            self.statusBar().showMessage(f"Opening {channel.name}", 3500)
        except RuntimeError as exc:
            self.playback_status.setText("Could not start stream")
            self._show_placeholder(f"Could not start playback\n\n{exc}")

    def _play_or_pause(self) -> None:
        if self._player is None:
            self._warn_vlc_missing()
            return
        if self._current_channel is None:
            item = self.channel_list.currentItem()
            if item is not None:
                channel = item.data(Qt.ItemDataRole.UserRole)
                if isinstance(channel, Channel):
                    self._play_channel(channel)
            else:
                QMessageBox.information(
                    self, "No channel selected", "Add a stream or open a playlist first."
                )
            return
        state = self._player.state_name()
        if state in {"playing", "paused"}:
            self._player.pause()
        else:
            self._play_channel(self._current_channel)

    def _stop(self) -> None:
        if self._player is not None:
            self._player.stop()
        self.playback_status.setText("Stopped")
        self.play_pause_button.setText("▶  Play")
        self._show_placeholder("Playback stopped")

    def _set_volume(self, value: int) -> None:
        if self._player is not None:
            self._player.set_volume(value)

    def _toggle_mute(self) -> None:
        if self._player is None:
            return
        self._muted = self._player.toggle_mute()
        self.mute_button.setText("Unmute" if self._muted else "Mute")

    def _toggle_fullscreen(self) -> None:
        if self.isFullScreen():
            self.showNormal()
            self.fullscreen_button.setText("⛶  Fullscreen")
        else:
            self.showFullScreen()
            self.fullscreen_button.setText("▣  Exit fullscreen")

    def _exit_fullscreen_or_stop(self) -> None:
        if self.isFullScreen():
            self.showNormal()
            self.fullscreen_button.setText("⛶  Fullscreen")
        else:
            self._stop()

    def _refresh_playback_status(self) -> None:
        if self._player is None:
            return
        state = self._player.state_name()
        if state == "playing":
            self.playback_status.setText("Playing live")
            self.play_pause_button.setText("Ⅱ  Pause")
            self._hide_placeholder()
        elif state == "paused":
            self.playback_status.setText("Paused")
            self.play_pause_button.setText("▶  Resume")
        elif state == "opening":
            self.playback_status.setText("Opening stream…")
        elif state == "buffering":
            self.playback_status.setText("Buffering…")
        elif state == "error":
            self.playback_status.setText("Playback failed — check URL, network, or format.")
            self.play_pause_button.setText("▶  Retry")
            self._show_placeholder(
                "Stream unavailable\n\n"
                "Check the URL, network connection, access permissions, and stream format."
            )
        elif state == "ended":
            self.playback_status.setText("Stream ended")
            self.play_pause_button.setText("▶  Play")
            self._show_placeholder("Stream ended")

    def _warn_vlc_missing(self) -> None:
        QMessageBox.warning(
            self,
            "VLC runtime unavailable",
            "Install 64-bit VLC Media Player from https://www.videolan.org/vlc/, "
            "then restart GigaCast. Python and VLC must use matching architectures.",
        )

    def closeEvent(self, event) -> None:  # noqa: N802 - Qt override naming
        self._status_timer.stop()
        if self._player is not None:
            self._player.close()
        event.accept()
