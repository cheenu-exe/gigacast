# GigaCast Web

A browser-first, plug-and-play IPTV channel browser for Vercel. The default playlist is the public iptv-org index; viewers do not need to paste a playlist URL.

## Stack

- Next.js App Router + TypeScript
- Custom responsive CSS with reduced-motion support
- hls.js for HLS streams where browser support allows it
- A cached Next.js route to retrieve and parse the default M3U playlist

## Run locally

Use Node.js 20.9+.

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000.

## Deploy to Vercel

1. Import this repository into Vercel.
2. Set **Root Directory** to `web`.
3. Use the Next.js framework preset.
4. Deploy. The app defaults to `https://iptv-org.github.io/iptv/index.m3u`.

Optional environment variable:

- `IPTV_PLAYLIST_URL`: override the default playlist URL on the server. Do not prefix this variable with `NEXT_PUBLIC_`.

The API route caches upstream playlist retrieval for 30 minutes. It returns channel metadata in pages to avoid shipping the entire index to the browser at once.

## Playback notes

The playlist is a directory of publicly listed stream URLs, not a guarantee that each stream is live or licensed for every use. Browser playback depends on each broadcaster's format, codec, CORS policy, authentication, and availability. HLS playback uses hls.js where supported; native HLS is used when the browser provides it. Some transport-stream-only or DRM-protected sources will not play in a browser without additional compatible infrastructure.

Use streams you are authorized to access. GigaCast does not host streams, bypass DRM, or proxy video content.
