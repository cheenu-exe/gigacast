import { NextRequest, NextResponse } from "next/server";

const DEFAULT_PLAYLIST = "https://iptv-org.github.io/iptv/index.m3u";
const PAGE_SIZE = 80;

type Channel = {
  id: string;
  name: string;
  url: string;
  logo: string;
  group: string;
  country: string;
  tvgId: string;
};

function readAttribute(line: string, key: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = line.match(new RegExp('(?:^|\\s)' + escaped + '="([^"]*)"', "i"));
  return match?.[1]?.trim() ?? "";
}

function parseM3U(source: string): Channel[] {
  const channels: Channel[] = [];
  let metadata = "";
  let index = 0;

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("#EXTINF:")) {
      metadata = line;
      continue;
    }

    if (line.startsWith("#") || !metadata) continue;

    const comma = metadata.lastIndexOf(",");
    const name = (comma >= 0 ? metadata.slice(comma + 1) : "").trim();
    if (/^https?:\/\//i.test(line) && name) {
      const group = readAttribute(metadata, "group-title") || "Other";
      const tvgId = readAttribute(metadata, "tvg-id");
      channels.push({
        id: tvgId || `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${index}`,
        name,
        url: line,
        logo: readAttribute(metadata, "tvg-logo"),
        group,
        country: readAttribute(metadata, "tvg-country"),
        tvgId,
      });
      index += 1;
    }
    metadata = "";
  }

  return channels;
}

export async function GET(request: NextRequest) {
  try {
    const playlistUrl = process.env.IPTV_PLAYLIST_URL || DEFAULT_PLAYLIST;
    const upstream = await fetch(playlistUrl, {
      headers: { Accept: "audio/x-mpegurl, application/vnd.apple.mpegurl, text/plain, */*" },
      next: { revalidate: 1800 },
      signal: AbortSignal.timeout(20_000),
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Playlist provider returned HTTP ${upstream.status}. Please try again shortly.` },
        { status: 502 },
      );
    }

    const rawPlaylist = await upstream.text();
    if (!rawPlaylist.includes("#EXTM3U")) {
      return NextResponse.json({ error: "The configured source did not return a valid M3U playlist." }, { status: 502 });
    }

    const allChannels = parseM3U(rawPlaylist);
    const query = (request.nextUrl.searchParams.get("q") || "").trim().toLocaleLowerCase();
    const group = request.nextUrl.searchParams.get("group") || "";
    const offset = Math.max(0, Number.parseInt(request.nextUrl.searchParams.get("offset") || "0", 10) || 0);
    const requestedLimit = Number.parseInt(request.nextUrl.searchParams.get("limit") || String(PAGE_SIZE), 10) || PAGE_SIZE;
    const limit = Math.min(100, Math.max(1, requestedLimit));

    const groups = [...new Set(allChannels.map((channel) => channel.group))].sort((a, b) => a.localeCompare(b));
    const filtered = allChannels.filter((channel) => {
      const matchesGroup = !group || channel.group === group;
      const matchesQuery = !query || [channel.name, channel.group, channel.tvgId, channel.country]
        .some((value) => value.toLocaleLowerCase().includes(query));
      return matchesGroup && matchesQuery;
    });

    return NextResponse.json(
      {
        channels: filtered.slice(offset, offset + limit),
        total: filtered.length,
        offset,
        limit,
        groups,
        source: "iptv-org",
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown playlist error";
    return NextResponse.json(
      { error: `Could not load the default playlist: ${message}` },
      { status: 502 },
    );
  }
}
