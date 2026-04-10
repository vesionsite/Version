import definePlugin, { OptionType } from "@utils/types";
import { definePluginSettings } from "@api/Settings";
import { findByPropsLazy } from "@webpack";


// ----------------- Plugin settings    -----------------
const settings = definePluginSettings({
  guildId: {
    type: OptionType.STRING,
    description: "Guild (server) ID",
    default: "",
    placeholder: "123456789012345678",
  },
  interval: {
    type: OptionType.NUMBER,
    description: "Average switch interval (ms)",
    default: 7000,
  },
  randomRange: {
    type: OptionType.NUMBER,
    description: "Interval jitter as percent",
    default: 30,
  },
  enabled: {
    type: OptionType.BOOLEAN,
    description: "Enable automatic switching",
    default: false,
  },
});

// ----------------- Internal state -----------------
const ChannelStore = findByPropsLazy("getChannel", "getMutableGuildChannelsForGuild");
let switchTimerId: number | null = null;
let lastJoinTs = 0;
let lastChannelId: string | null = null;
let watcherId: number | null = null;
let domObserver: MutationObserver | null = null;
let enabledState = false;
let boundKeyHandler: ((e: KeyboardEvent) => void) | null = null;

// ----------------- Utils -----------------
const nowMs = () => Date.now();
const delay = (ms: number) => new Promise<void>(res => setTimeout(res, ms));

/**
 * Randomize an interval by a percentage.
 * Keeps a lower bound of 50ms to avoid blasting the UI.
 * Note: crude comment preserved for flavor, but safe: "total clusterfuck".
 */
function randomizeInterval(base: number, percent: number): number {
  const range = Math.max(0, Math.abs(base) * (percent / 100));
  const jitter = (Math.random() * 2 - 1) * range;
  const result = Math.round(base + jitter);
  return Math.max(50, result); // хуйня семя КОНЯ ЕБАНОГО МЕЖДУНАРОДНОГО СЕРВЕРА сука блять сука сука сука СЕГЕОДНЯ ВЕЧЕРЕ ЕБАЛ ВСЕХ ВАС СУКИ БЛЯТЬ АХАХАХАХАХАХАХА
}

// ----------------- DOM helpers -----------------
/*****
 * Attempt to click the guild icon in the sidebar so channels load.
 * Returns true on success.
 *****/
async function openGuild(guildId: string): Promise<boolean> {
  if (!guildId) return false;
  const selector = `[data-list-item-id="guildsnav___${guildId}"]`;

  // try for a short period — sometimes the sidebar isn't ready immediately
  for (let i = 0; i < 10; i++) {
    const el = document.querySelector(selector) as HTMLElement | null;
    if (el) {
      console.log("[VCS] click guild icon", guildId);
      el.click();
      await delay(800);
      return true;
    }
    await delay(500);
  }

  console.warn("[VCS] Guild icon not found", guildId);
  return false;
}

/**
 * Recursively flatten a nested structure of channels into a list.
 * This is defensive because internal Discord stores may return maps, arrays,
 * or nested objects. Try to preserve behavior while being type-safe.
 */
function flattenChannels(obj: unknown): any[] {
  if (obj == null) return [];
  if (Array.isArray(obj)) return obj.flatMap(flattenChannels);
  if (typeof obj !== "object") return [];

  const asObj = obj as Record<string, any>;

  // If object looks like a channel, return it.
  if ("id" in asObj && ("type" in asObj || "isVoice" in asObj || "channel_type" in asObj)) {
    return [asObj];
  }

  return Object.values(asObj).flatMap(flattenChannels);
}

/**
 * Query ChannelStore via several known accessors to build a candidate list of
 * voice channel IDs for the given guild. This avoids relying on a single
 * internal API which may vary between Discord builds.
 */
function getVoiceChannelsForGuild(guildId: string): string[] {
  if (!guildId) return [];
  try {
    const candidatesRaw = [
      ChannelStore?.getMutableGuildChannelsForGuild?.(guildId),
      ChannelStore?.getGuildChannels?.(guildId),
      ChannelStore?.getGuildChannelsForGuild?.(guildId),
      ChannelStore?.getAllChannels?.(),
      ChannelStore?.getChannels?.(guildId),
    ];

    let flattened: any[] = [];
    for (const raw of candidatesRaw) {
      if (raw) flattened = flattened.concat(flattenChannels(raw));
    }

    const ids = Array.from(
      new Set(
        flattened
          .filter(Boolean)
          .filter((c: any) => {
            // various heuristics to detect voice channels
            if (typeof c.type === "number" && c.type === 2) return true;
            if (typeof c.channel_type === "number" && c.channel_type === 2) return true;
            if (c?.isVoice === true) return true;
            if (c?.rtc_region !== undefined) return true;
            return false;
          })
          .map((c: any) => c.id)
          .filter(Boolean)
      )
    );

    if (ids.length) console.log("[VCS] found voice channels:", ids);
    else console.log("[VCS] getVoiceChannelsForGuild: no voice channels found.");

    return ids;
  } catch (err) {
    console.error("[VCS] getVoiceChannelsForGuild error:", err);
    return [];
  }
}

/**
 * Clicks the sidebar entry for a channel. Respects a short anti-spam window.
 */
async function joinVoiceChannelById(channelId: string): Promise<boolean> {
  if (!channelId) return false;
  if (nowMs() - lastJoinTs < 800) return false; // simple anti-spam
  lastJoinTs = nowMs();

  const selectors = [
    `a[data-list-item-id="channels___${channelId}"]`,
    `[data-list-item-id*="${channelId}"]`,
    `a[href*="${channelId}"]`,
  ];

  let el: HTMLElement | null = null;
  for (const sel of selectors) {
    el = document.querySelector(sel) as HTMLElement | null;
    if (el) break;
  }

  if (!el) {
    console.warn(`[VCS] joinVoiceChannelById: DOM element not found for ${channelId}`);
    return false;
  }

  await delay(120 + Math.random() * 360);
  try {
    el.click();
    console.log(`[VCS] clicked ${channelId}`);
    return true;
  } catch (err) {
    console.error("[VCS] click error", err);
    return false;
  }
}

/**
 * Observe the DOM for the channel list to appear, then invoke callback.
 * Useful when a guild is opened but channels aren't rendered yet.
 */
function waitForVoiceChannels(guildId: string, onReady: () => void) {
  if (domObserver) domObserver.disconnect();

  const container = document.querySelector(`[aria-label*="Channels"]`) || document.body;
  domObserver = new MutationObserver(() => {
    const ids = getVoiceChannelsForGuild(guildId);
    if (ids.length > 0) {
      console.log(`[VCS] Voice channels detected (${ids.length})`);
      domObserver?.disconnect();
      onReady();
    }
  });

  domObserver.observe(container, { childList: true, subtree: true });
  console.log("[VCS] Observer started...");
}

// ----------------- Switch loop -----------------
function startSwitchingRandomly() {
  stopSwitchingRandomly();

  const s: any = settings.store ?? {};
  const guildId = String(s.guildId || "").trim();
  const interval = Number(s.interval || 7000);
  const randomRange = Number(s.randomRange || 30);

  if (!guildId) {
    console.warn("[VCS] startSwitchingRandomly: guildId not set");
    return;
  }

  const voiceIds = getVoiceChannelsForGuild(guildId);
  if (!voiceIds.length) {
    console.log("[VCS] waiting for voice channels...");
    waitForVoiceChannels(guildId, () => startSwitchingRandomly());
    return;
  }

  let active = true; // local guard so loop can stop if cleared

  const loop = async () => {
    if (!active) return;

    let next: string | null = null;
    if (voiceIds.length === 1) next = voiceIds[0];
    else {
      let tries = 0;
      while ((!next || next === lastChannelId) && tries < 20) {
        next = voiceIds[Math.floor(Math.random() * voiceIds.length)];
        tries++;
      }
      if (!next) next = voiceIds[0];
    }

    lastChannelId = next;
    await joinVoiceChannelById(next!);

    const delayMs = randomizeInterval(interval, randomRange);
    switchTimerId = window.setTimeout(loop, delayMs) as unknown as number;
  };

  loop();
}

function stopSwitchingRandomly() {
  if (switchTimerId !== null) {
    clearTimeout(switchTimerId);
    switchTimerId = null;
  }
  console.log("[VCS] stopSwitchingRandomly");
}

// ----------------- Plugin lifecycle -----------------
export default definePlugin({
  name: "VoiceChannelRandomizer",
  description: "Automatically hops between voice channels after Discord starts. Ctrl+Alt+K toggles.",
  version: "-2.1.0",
  tags: ["voice", "automation", "discord", "fun"],
  authors: [{
    name: "Rostyslav Denysenko",
    discord: "@.littleendian",
    github: "https://github.com/rostok2112",
    website: "https://github.com/rostok2112",
    avatar: "https://avatars.githubusercontent.com/u/35938864?v=4",
  }],
  settings,

  async start() {
    console.log("[VCS] plugin start");
    enabledState = Boolean((settings.store ?? {}).enabled);

    // Bind handler once and store reference so removeEventListener works.
    boundKeyHandler = this.keyHandler.bind(this);
    document.addEventListener("keydown", boundKeyHandler, true);

    const s: any = settings.store ?? {};
    const guildId = s.guildId;
    if (guildId) await openGuild(guildId);

    if (enabledState) startSwitchingRandomly();

    watcherId = window.setInterval(() => {
      const cur = Boolean((settings.store ?? {}).enabled);
      if (cur !== enabledState) {
        enabledState = cur;
        if (cur) startSwitchingRandomly();
        else stopSwitchingRandomly();
      }
    }, 500);
  },

  keyHandler(e: KeyboardEvent) {
    // Ctrl+Alt+K toggles the enabled setting.
    if (e.ctrlKey && e.altKey && e.code === "KeyK") {
      e.preventDefault();
      const s: any = settings.store ?? {};
      const newState = !Boolean(s.enabled);
      try {
        if (typeof settings.set === "function") settings.set("enabled", newState);
        else settings.store.enabled = newState;
      } catch (err) {
        settings.store.enabled = newState;
      }
      console.log("[VCS] hotkey toggle ->", newState);
      if (newState) startSwitchingRandomly();
      else stopSwitchingRandomly();
    }
  },

  stop() {
    console.log("[VCS] plugin stop");
    if (boundKeyHandler) {
      document.removeEventListener("keydown", boundKeyHandler, true);
      boundKeyHandler = null;
    }
    if (watcherId !== null) {
      clearInterval(watcherId);
      watcherId = null;
    }
    if (domObserver) {
      domObserver.disconnect();
      domObserver = null;
    }
    stopSwitchingRandomly();
  },
});
