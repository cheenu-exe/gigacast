import { NextRequest, NextResponse } from "next/server";

const DEFAULT_PLAYLIST = "https://iptv-org.github.io/iptv/index.m3u";
const PAGE_SIZE = 80;

const TAMIL_CHANNEL_ORDER = [
  "sun tv",
  "star vijay",
  "zee tamil",
  "colors tamil",
  "jaya tv",
  "jaya max",
  "kalaignar tv",
  "zee thirai",
  "vijay super",
  "raj tv",
  "sun music",
  "vijay music",
  "isaiaruvi",
  "raj musix",
  "sun news",
  "thanthi news",
  "polimer news",
  "news18 tamil nadu",
  "news7 tamil",
  "sathiyam tv",
  "puthiya thalaimurai",
  "captain news",
  "cauvery news",
  "dd tamil",
  "dd podhigai",
];

type Channel = {
  id: string;
  name: string;
  url: string;
  logo: string;
  group: string;
  country: string;
  language: string;
  tvgId: string;
};

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function categoryFor(channel: Channel): string {
  const name = normalized(channel.name);
  const group = channel.group.toLowerCase();
  const language = channel.language.toLowerCase();
  const isKnownTamil = TAMIL_CHANNEL_ORDER.some((item) => name === item || name.startsWith(`${item} `));
  if (isKnownTamil || language.includes("tamil") || group.includes("tamil")) return "tamil";
  if (/cartoon|kids|animation/.test(group) || /nick|cartoon|disney|hungama|pogo|sonic/.test(name)) return "cartoons";
  if (/sport/.test(group) || /\b(sports?|ten|espn|star sports|sony six)\b/.test(name)) return "sports";
  if (/news/.test(group) || /news|republic|ndtv|aaj tak|india tv|times now|cnn|bbc news/.test(name)) return "news";
  return "other";
}

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
        id: `${(tvgId || name.toLowerCase().replace(/[^a-z0-9]+/g, "-"))}-${index}`,
        name,
        url: line,
        logo: readAttribute(metadata, "tvg-logo"),
        group,
        country: readAttribute(metadata, "tvg-country"),
        language: readAttribute(metadata, "tvg-language"),
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

    const channelsFromDefault = parseM3U(rawPlaylist);
    const extraPlaylistUrl = process.env.IPTV_EXTRA_PLAYLIST_URL;
    let channelsFromExtra: Channel[] = [];

    if (extraPlaylistUrl) {
      try {
        const extraResponse = await fetch(extraPlaylistUrl, {
          headers: { Accept: "audio/x-mpegurl, application/vnd.apple.mpegurl, text/plain, */*" },
          next: { revalidate: 1800 },
          signal: AbortSignal.timeout(20_000),
        });
        if (extraResponse.ok) {
          const extraText = await extraResponse.text();
          if (extraText.includes("#EXTM3U")) channelsFromExtra = parseM3U(extraText);
        }
      } catch {
        // Keep the primary IPTV-org catalogue available if the optional source is offline.
      }
    }

    const seenUrls = new Set<string>();
    const allChannels = [...channelsFromDefault, ...channelsFromExtra].filter((channel) => {
      if (seenUrls.has(channel.url)) return false;
      seenUrls.add(channel.url);
      return true;
    });
    const query = (request.nextUrl.searchParams.get("q") || "").trim().toLocaleLowerCase();
    const group = request.nextUrl.searchParams.get("group") || "";
    const category = request.nextUrl.searchParams.get("category") || "all";
    const offset = Math.max(0, Number.parseInt(request.nextUrl.searchParams.get("offset") || "0", 10) || 0);
    const requestedLimit = Number.parseInt(request.nextUrl.searchParams.get("limit") || String(PAGE_SIZE), 10) || PAGE_SIZE;
    const limit = Math.min(100, Math.max(1, requestedLimit));

    const groups = [...new Set(allChannels.map((channel) => channel.group))].sort((a, b) => a.localeCompare(b));
    const categorizedChannels = category === "tamil"
      ? [...allChannels].sort((a, b) => {
          const rank = (channel: Channel) => {
            const name = normalized(channel.name);
            const index = TAMIL_CHANNEL_ORDER.findIndex((item) => name === item || name.startsWith(`${item} `));
            return index < 0 ? TAMIL_CHANNEL_ORDER.length : index;
          };
          return rank(a) - rank(b);
        })
      : allChannels;
    const filtered = categorizedChannels.filter((channel) => {
      const matchesCategory = category === "all" || categoryFor(channel) === category;
      const matchesGroup = !group || channel.group === group;
      const matchesQuery = !query || [channel.name, channel.group, channel.tvgId, channel.country, channel.language]
        .some((value) => value.toLocaleLowerCase().includes(query));
      return matchesCategory && matchesGroup && matchesQuery;
    });

    return NextResponse.json(
      {
        channels: filtered.slice(offset, offset + limit),
        total: filtered.length,
        offset,
        limit,
        groups,
        source: extraPlaylistUrl ? "multi-source" : "iptv-org",
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
