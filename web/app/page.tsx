"use client";

import Hls from "hls.js";
import {
  AlertCircle,
  ArrowDown,
  Check,
  ChevronDown,
  Globe2,
  Heart,
  LoaderCircle,
  LogOut,
  Maximize,
  MonitorPlay,
  Play,
  Radio,
  Search,
  Signal,
  Tv2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";

type Channel = {
  id: string;
  name: string;
  url: string;
  logo: string;
  group: string;
  country: string;
  tvgId: string;
};

type ChannelResponse = {
  channels: Channel[];
  total: number;
  offset: number;
  limit: number;
  groups: string[];
  error?: string;
};

const PAGE_SIZE = 80;

export default function Home() {
  const { data: session, status: authStatus } = useSession();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [query, setQuery] = useState("");
  const [activeGroup, setActiveGroup] = useState("");
  const [favoriteChannels, setFavoriteChannels] = useState<Channel[]>([]);
  const favorites = useMemo(() => favoriteChannels.map((channel) => channel.id), [favoriteChannels]);
  const [showFavorites, setShowFavorites] = useState(false);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [playbackError, setPlaybackError] = useState("");
  const [muted, setMuted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const loadChannels = useCallback(async (options?: { reset?: boolean; q?: string; group?: string }) => {
    const reset = options?.reset ?? false;
    if (requestRef.current) requestRef.current.abort();
    const controller = new AbortController();
    requestRef.current = controller;

    if (reset) setLoading(true);
    else setLoadingMore(true);
    setError("");

    const nextOffset = reset ? 0 : offset;
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(nextOffset),
      q: options?.q ?? query,
      group: options?.group ?? activeGroup,
    });

    try {
      const response = await fetch(`/api/channels?${params.toString()}`, { signal: controller.signal });
      const payload = (await response.json()) as ChannelResponse;
      if (!response.ok) throw new Error(payload.error || "Could not load channels.");
      setChannels((current) => reset ? payload.channels : [...current, ...payload.channels]);
      setGroups(payload.groups || []);
      setTotal(payload.total || 0);
      setOffset(nextOffset + payload.channels.length);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Something went wrong while loading channels.");
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [activeGroup, offset, query]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadChannels({ reset: true, q: query, group: activeGroup });
    }, query || activeGroup ? 220 : 0);
    return () => window.clearTimeout(timer);
  }, [query, activeGroup]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("gigacast:favorites");
      if (!saved) return;
      const parsed: unknown = JSON.parse(saved);
      if (!Array.isArray(parsed)) return;
      const validChannels = parsed.filter((item): item is Channel =>
        item !== null &&
        typeof item === "object" &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        typeof item.url === "string" &&
        typeof item.logo === "string" &&
        typeof item.group === "string" &&
        typeof item.country === "string" &&
        typeof item.tvgId === "string"
      );
      const uniqueChannels = Array.from(new Map(validChannels.map((channel) => [channel.id, channel])).values());
      setFavoriteChannels(uniqueChannels);
    } catch {
      // Ignore malformed or unavailable browser storage and keep favorites usable in memory.
    }
  }, []);

  useEffect(() => {
    const syncFavorites = (event: StorageEvent) => {
      if (event.key !== "gigacast:favorites") return;
      try {
        const parsed: unknown = event.newValue ? JSON.parse(event.newValue) : [];
        if (!Array.isArray(parsed)) return;
        const validChannels = parsed.filter((item): item is Channel =>
          item !== null &&
          typeof item === "object" &&
          typeof item.id === "string" &&
          typeof item.name === "string" &&
          typeof item.url === "string" &&
          typeof item.logo === "string" &&
          typeof item.group === "string" &&
          typeof item.country === "string" &&
          typeof item.tvgId === "string"
        );
        setFavoriteChannels(Array.from(new Map(validChannels.map((channel) => [channel.id, channel])).values()));
      } catch {
        // Ignore invalid cross-tab updates.
      }
    };
    window.addEventListener("storage", syncFavorites);
    return () => window.removeEventListener("storage", syncFavorites);
  }, []);

  useEffect(() => () => {
    requestRef.current?.abort();
    hlsRef.current?.destroy();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeChannel) return;

    hlsRef.current?.destroy();
    hlsRef.current = null;
    setPlaybackError("");
    video.pause();
    video.removeAttribute("src");
    video.load();

    const isHls = /\\.m3u8(?:$|[?#])/i.test(activeChannel.url);
    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
        maxBufferLength: 30,
      });
      hlsRef.current = hls;
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setPlaybackError("This stream is unavailable or incompatible with browser playback.");
          hls.destroy();
          hlsRef.current = null;
        }
      });
      hls.loadSource(activeChannel.url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        void video.play().catch(() => {});
      });
    } else if (!isHls || video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = activeChannel.url;
      void video.play().catch(() => {});
    } else {
      setPlaybackError("This browser cannot play this HLS stream.");
    }

    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [activeChannel]);

  const visibleChannels = useMemo(
    () => showFavorites ? favoriteChannels : channels,
    [channels, favoriteChannels, showFavorites],
  );

  const toggleFavorite = (channel: Channel) => {
    const nextFavorites = favoriteChannels.some((item) => item.id === channel.id)
      ? favoriteChannels.filter((item) => item.id !== channel.id)
      : [...favoriteChannels, channel];
    setFavoriteChannels(nextFavorites);
    try {
      window.localStorage.setItem("gigacast:favorites", JSON.stringify(nextFavorites));
    } catch {
      setError("Favorites could not be saved in this browser. Check your browser storage settings.");
    }
  };

  const playChannel = (channel: Channel) => {
    setActiveChannel(channel);
    setPlaybackError("");
  };

  const playNext = () => {
    if (!activeChannel || channels.length < 2) return;
    const currentIndex = channels.findIndex((channel) => channel.id === activeChannel.id);
    playChannel(channels[(currentIndex + 1 + channels.length) % channels.length]);
  };

  const toggleFullscreen = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await video.requestFullscreen();
    } catch {
      setPlaybackError("Fullscreen is not available in this browser.");
    }
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="GigaCast home">
          <span className="brand-mark"><Signal size={20} strokeWidth={2.6} /></span>
          <span className="brand-word">Giga<span>Cast</span></span>
        </a>
        <div className="topbar-center"><span className="live-dot" /> LIVE CHANNELS <span className="topbar-divider">/</span> GLOBAL STREAMS</div>
        <div className="topbar-actions"><div className="topbar-right"><span className="status-pip" /> <span>READY TO WATCH</span></div>{authStatus === "loading" ? <span className="auth-loading">Checking account…</span> : session?.user ? <div className="account-control">{session.user.image ? <img className="account-avatar" src={session.user.image} alt="" referrerPolicy="no-referrer" /> : null}<span className="account-name">{session.user.name || session.user.email || "Signed in"}</span><button className="auth-button" onClick={() => void signOut()}><LogOut size={14} /> Sign out</button></div> : <button className="auth-button" onClick={() => void signIn("google")}><svg className="google-mark" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.76 7.18l7.73 6C44.42 37.94 46.98 31.78 46.98 24.55Z"/><path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.52 2.56 10.78l7.97-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.14 1.44-4.89 2.3-8.18 2.3-6.26 0-11.57-4.22-13.46-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg> Continue with Google</button>}</div>
      </header>

      <div className="main-layout">
        <aside className="sidebar">
          <div className="sidebar-heading">YOUR TV</div>
          <button className={`nav-item ${!showFavorites ? "selected" : ""}`} onClick={() => setShowFavorites(false)}>
            <Tv2 size={17} /><span>All channels</span><span className="nav-count">{total.toLocaleString()}</span>
          </button>
          <button className={`nav-item ${showFavorites ? "selected" : ""}`} onClick={() => setShowFavorites(true)}>
            <Heart size={17} /><span>Favorites</span><span className="nav-count">{favorites.length}</span>
          </button>

          <div className="sidebar-section">
            <div className="sidebar-heading">DISCOVER</div>
            <label className="search-box">
              <Search size={16} />
              <input value={query} onChange={(event) => { setQuery(event.target.value); setOffset(0); }} placeholder="Find a channel..." aria-label="Search channels" />
              {query && <button aria-label="Clear search" onClick={() => setQuery("")}><X size={14} /></button>}
              {!query && <kbd>/</kbd>}
            </label>
            <label className="group-select-wrap">
              <Globe2 size={15} />
              <select value={activeGroup} onChange={(event) => { setActiveGroup(event.target.value); setOffset(0); }} aria-label="Filter by category">
                <option value="">All categories</option>
                {groups.map((group) => <option key={group} value={group}>{group}</option>)}
              </select>
              <ChevronDown size={15} />
            </label>
          </div>

          <div className="sidebar-footer">
            <div className="source-badge"><span className="source-icon"><Radio size={15} /></span><span><strong>IPTV-ORG</strong><small>Community playlist</small></span><Check size={14} className="source-check" /></div>
            <p>Publicly listed streams. Availability and playback depend on each broadcaster.</p>
          </div>
        </aside>

        <section className="content">
          <div className="page-intro">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> YOUR WORLD, LIVE</div>
              <h1>Find your <span>frequency.</span></h1>
              <p>Thousands of channels. One click to watch.</p>
            </div>
            <div className="channel-total"><span className="total-icon"><MonitorPlay size={19} /></span><span><strong>{total.toLocaleString()}</strong><small>channels available</small></span></div>
          </div>

          <section className="player-card" aria-label="Video player">
            <div className="player-screen">
              <video ref={videoRef} className="video-element" controls playsInline muted={muted} onError={() => {
                if (activeChannel) setPlaybackError("This channel could not be played. The stream may be offline or block browser playback.");
              }} />
              {!activeChannel && !playbackError && (
                <div className="player-empty">
                  <div className="player-orbit orbit-one" /><div className="player-orbit orbit-two" />
                  <div className="player-emblem"><Play size={25} fill="currentColor" /></div>
                  <div className="player-empty-title">Your screen. Your world.</div>
                  <p>Choose any channel to start watching.</p>
                  <div className="player-hint"><ArrowDown size={13} /> PICK A CHANNEL BELOW</div>
                </div>
              )}
              {playbackError && (
                <div className="player-error">
                  <div className="error-icon"><AlertCircle size={23} /></div>
                  <strong>Stream unavailable</strong>
                  <p>{playbackError}</p>
                  <button onClick={() => activeChannel && playChannel(activeChannel)}>Try again</button>
                </div>
              )}
              {activeChannel && !playbackError && (
                <div className="player-overlay-top">
                  <span className="live-tag"><span className="live-dot" /> LIVE</span>
                  <span className="player-quality"><Signal size={12} /> STREAM</span>
                </div>
              )}
              <button className="fullscreen-button" onClick={() => void toggleFullscreen()} aria-label="Toggle fullscreen"><Maximize size={16} /></button>
            </div>
            <div className="player-info">
              <div className="now-playing">
                <div className="now-logo">{activeChannel?.logo ? <img src={activeChannel.logo} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <Tv2 size={19} />}</div>
                <div className="now-text"><small>NOW PLAYING</small><strong>{activeChannel?.name || "Select a channel"}</strong><span>{activeChannel?.group || "Live TV, on your terms"}</span></div>
              </div>
              <div className="player-actions">
                <button className={`icon-button ${muted ? "active" : ""}`} onClick={() => setMuted((value) => !value)} aria-label={muted ? "Unmute video" : "Mute video"}>{muted ? <VolumeX size={17} /> : <Volume2 size={17} />}</button>
                <button className="next-button" onClick={playNext} disabled={!activeChannel || channels.length < 2}><span>Next channel</span><Play size={14} fill="currentColor" /></button>
              </div>
            </div>
          </section>

          <div className="section-heading">
            <div><div className="eyebrow"><span className="eyebrow-line" /> THE LINEUP</div><h2>{showFavorites ? "Your favorites" : query ? "Search results" : activeGroup || "Explore channels"}</h2></div>
            <div className="result-meta">{loading ? "Loading…" : `${visibleChannels.length.toLocaleString()} shown`} <span className="result-divider">/</span> {total.toLocaleString()} total</div>
          </div>

          {error && (
            <div className="error-banner"><AlertCircle size={18} /><div><strong>Couldn’t load the channel list</strong><p>{error}</p></div><button onClick={() => void loadChannels({ reset: true })}>Retry</button></div>
          )}

          {loading && channels.length === 0 ? (
            <div className="loading-state"><LoaderCircle className="spin" size={25} /><span>Finding channels around the world…</span></div>
          ) : visibleChannels.length === 0 ? (
            <div className="empty-state"><Tv2 size={28} /><strong>{showFavorites ? "No favorites yet" : "No channels found"}</strong><p>{showFavorites ? "Tap the heart on a channel to save it here." : "Try a different search or category."}</p></div>
          ) : (
            <div className="channel-grid">
              {visibleChannels.map((channel, index) => (
                <article key={channel.id + channel.url} className={`channel-card ${activeChannel?.url === channel.url ? "playing" : ""}`} style={{ animationDelay: `${Math.min(index % PAGE_SIZE, 12) * 18}ms` }}>
                  <button className="channel-main" onClick={() => playChannel(channel)} aria-label={`Play ${channel.name}`}>
                    <div className="channel-logo">
                      {channel.logo ? <img src={channel.logo} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <Tv2 size={23} strokeWidth={1.6} />}
                      {activeChannel?.url === channel.url && <span className="playing-indicator"><span /><span /><span /></span>}
                    </div>
                    <div className="channel-details"><strong title={channel.name}>{channel.name}</strong><span>{channel.group}</span></div>
                    <span className="channel-play"><Play size={14} fill="currentColor" /></span>
                  </button>
                  <button className={`favorite-button ${favorites.includes(channel.id) ? "favorited" : ""}`} onClick={() => toggleFavorite(channel)} aria-label={favorites.includes(channel.id) ? `Remove ${channel.name} from favorites` : `Add ${channel.name} to favorites`}><Heart size={15} fill={favorites.includes(channel.id) ? "currentColor" : "none"} /></button>
                </article>
              ))}
            </div>
          )}

          {!showFavorites && !loading && channels.length < total && (
            <button className="load-more" disabled={loadingMore} onClick={() => void loadChannels()}>
              {loadingMore ? <><LoaderCircle size={16} className="spin" /> Loading channels…</> : <>Load more channels <ChevronDown size={16} /></>}
            </button>
          )}
          <footer className="footer"><span>GigaCast <span className="footer-dot">●</span> MADE FOR THE MOMENT</span><span>Playback varies by stream and browser.</span></footer>
        </section>
      </div>
    </main>
  );
}
