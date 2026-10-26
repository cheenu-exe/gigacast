from app.playlist.m3u_parser import Channel, is_hls_media_playlist, parse_m3u


def test_parse_standard_iptv_playlist_with_attributes():
    playlist = """#EXTM3U
#EXTINF:-1 tvg-id="news.in" tvg-name="News India" tvg-logo="https://example.com/logo.png" group-title="News",News India HD
https://example.com/live/news/index.m3u8
#EXTINF:-1 group-title="Sports",Sports One
https://example.com/sports/stream
"""
    channels = parse_m3u(playlist)

    assert channels == [
        Channel(
            name="News India HD",
            url="https://example.com/live/news/index.m3u8",
            group="News",
            logo="https://example.com/logo.png",
            tvg_id="news.in",
        ),
        Channel(
            name="Sports One",
            url="https://example.com/sports/stream",
            group="Sports",
        ),
    ]


def test_utf8_bom_and_tvg_name_fallback():
    playlist = '\ufeff#EXTM3U\n#EXTINF:-1 tvg-name="Tamil HD" group-title="Tamil",\nhttps://example.com/tamil'
    channels = parse_m3u(playlist)

    assert len(channels) == 1
    assert channels[0].name == "Tamil HD"
    assert channels[0].group == "Tamil"


def test_plain_urls_without_extinf_are_supported():
    playlist = (
        "#EXTM3U\nhttps://example.com/channel-one\n"
        "https://example.com/channel-two?token=x"
    )
    channels = parse_m3u(playlist)

    assert len(channels) == 2
    assert channels[0].name == "channel-one"
    assert channels[1].name == "channel-two"


def test_display_name_can_contain_commas():
    channels = parse_m3u(
        '#EXTM3U\n#EXTINF:-1 tvg-name="A, B",News, International\n'
        "https://example.com/news"
    )

    assert channels[0].name == "News, International"
    assert channels[0].tvg_id == ""


def test_empty_playlist_has_no_channels():
    assert parse_m3u("#EXTM3U\n#EXTVLCOPT:http-user-agent=Example\n") == []


def test_hls_manifest_is_detected_as_single_media_playlist():
    assert is_hls_media_playlist(
        "#EXTM3U\n#EXT-X-TARGETDURATION:8\n#EXT-X-MEDIA-SEQUENCE:1\nsegment.ts"
    )


def test_basic_iptv_playlist_is_not_treated_as_hls_manifest():
    assert not is_hls_media_playlist(
        "#EXTM3U\n#EXTINF:-1,Channel\nhttps://example.com/live.m3u8"
    )
