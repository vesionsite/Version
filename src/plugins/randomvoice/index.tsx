import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { makeRange, OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import {
    ChannelRouter,
    ChannelStore,
    GuildStore,
    MediaEngineStore,
    PermissionsBits,
    PermissionStore,
    RelationshipStore,
    SelectedChannelStore,
    Toasts,
    UserStore,
    VoiceStateStore
} from "@webpack/common";

const ChannelActions = findByPropsLazy("selectVoiceChannel");
const VoiceActions = findByPropsLazy("toggleSelfMute", "toggleSelfDeaf");

type RandomVoiceOperation = "<" | ">" | "==";

type RandomVoiceStateLike = {
    channelId?: string | null;
    selfDeaf?: boolean | null;
    selfMute?: boolean | null;
    selfStream?: boolean | null;
    selfVideo?: boolean | null;
};

const settings = definePluginSettings({
    UserAmountOperation: {
        description: "Comparison for number of users in channel",
        type: OptionType.SELECT,
        options: [
            { label: "Less than", value: "<", default: true },
            { label: "More than", value: ">", default: false },
            { label: "Equal to", value: "==", default: false }
        ],
        default: "<"
    },
    UserAmount: {
        description: "Users in channel",
        type: OptionType.SLIDER,
        markers: makeRange(0, 25, 1),
        default: 3,
        stickToMarkers: true
    },
    spacesLeftOperation: {
        description: "Comparison for remaining free slots",
        type: OptionType.SELECT,
        options: [
            { label: "Less than", value: "<", default: false },
            { label: "More than", value: ">", default: true },
            { label: "Equal to", value: "==", default: false }
        ],
        default: ">"
    },
    spacesLeft: {
        description: "Free slots left in channel",
        type: OptionType.SLIDER,
        markers: makeRange(0, 25, 1),
        default: 1,
        stickToMarkers: true
    },
    vcLimitOperation: {
        description: "Comparison for channel user limit",
        type: OptionType.SELECT,
        options: [
            { label: "Less than", value: "<", default: false },
            { label: "More than", value: ">", default: true },
            { label: "Equal to", value: "==", default: false }
        ],
        default: ">"
    },
    vcLimit: {
        description: "Channel user limit",
        type: OptionType.SLIDER,
        markers: makeRange(1, 99, 1),
        default: 2,
        stickToMarkers: true
    },
    Servers: {
        description: "Guild IDs separated by / . Leave empty for all servers",
        type: OptionType.STRING,
        default: ""
    },
    autoNavigate: {
        type: OptionType.BOOLEAN,
        description: "Navigate to selected channel after joining",
        default: false
    },
    selfMute: {
        type: OptionType.BOOLEAN,
        description: "Mute yourself after join",
        default: false
    },
    selfDeafen: {
        type: OptionType.BOOLEAN,
        description: "Deafen yourself after join",
        default: false
    },
    prioritizeFriends: {
        type: OptionType.BOOLEAN,
        description: "Prefer channels where your friends are connected",
        default: false
    },
    avoidStages: {
        type: OptionType.BOOLEAN,
        description: "Avoid stage channels",
        default: false
    },
    avoidAfk: {
        type: OptionType.BOOLEAN,
        description: "Avoid AFK channels",
        default: false
    },
    includeStates: {
        type: OptionType.BOOLEAN,
        description: "Only include channels matching selected state filters",
        default: false
    },
    avoidStates: {
        type: OptionType.BOOLEAN,
        description: "Avoid channels matching selected state filters",
        default: false
    },
    mute: {
        type: OptionType.BOOLEAN,
        description: "Match users who are muted",
        default: false
    },
    deafen: {
        type: OptionType.BOOLEAN,
        description: "Match users who are deafened",
        default: false
    },
    video: {
        type: OptionType.BOOLEAN,
        description: "Match users with camera enabled",
        default: false
    },
    stream: {
        type: OptionType.BOOLEAN,
        description: "Match users who are streaming",
        default: false
    },
    hotkeyEnabled: {
        type: OptionType.BOOLEAN,
        description: "Enable Ctrl+B hotkey",
        default: true
    }
});

function showToast(message: string, type: number) {
    Toasts.show({
        message,
        type,
        id: Toasts.genId(),
        options: { position: Toasts.Position.BOTTOM }
    });
}

function parseServerIds(): string[] {
    return String(settings.store.Servers ?? "")
        .split("/")
        .map(id => id.trim())
        .filter(Boolean);
}

function hasStateFilters(): boolean {
    return Boolean(
        settings.store.mute ||
        settings.store.deafen ||
        settings.store.video ||
        settings.store.stream
    );
}

function matchesOperation(operation: RandomVoiceOperation, left: number, right: number): boolean {
    if (operation === "==") return left === right;
    if (operation === ">") return left > right;
    return left < right;
}

function matchesStateFilters(state: RandomVoiceStateLike): boolean {
    if (settings.store.mute && !state.selfMute) return false;
    if (settings.store.deafen && !state.selfDeaf) return false;
    if (settings.store.video && !state.selfVideo) return false;
    if (settings.store.stream && !state.selfStream) return false;
    return true;
}

function getCurrentUserId(): string | null {
    return UserStore.getCurrentUser?.()?.id ?? null;
}

function isStageChannel(channel: any): boolean {
    return channel?.type === 13 || channel?.isGuildStageVoice?.() === true;
}

function isAfkChannel(channel: any): boolean {
    const guildId = channel?.getGuildId?.() ?? channel?.guild_id;
    if (!guildId) return false;

    const guild = GuildStore.getGuild?.(guildId);
    return guild?.afkChannelId === channel.id;
}

function getVoiceStatesForChannel(channelId: string): Record<string, RandomVoiceStateLike> {
    return (VoiceStateStore.getVoiceStatesForChannel?.(channelId) ?? {}) as Record<string, RandomVoiceStateLike>;
}

function isChannelJoinable(channelId: string): boolean {
    const channel = ChannelStore.getChannel?.(channelId);
    if (!channel) return false;

    const guildId = channel.getGuildId?.() ?? channel.guild_id;
    const serverIds = parseServerIds();

    if (serverIds.length > 0 && (!guildId || !serverIds.includes(guildId))) return false;
    if (settings.store.avoidStages && isStageChannel(channel)) return false;
    if (settings.store.avoidAfk && isAfkChannel(channel)) return false;
    if (!PermissionStore.can?.(PermissionsBits.CONNECT, channel)) return false;

    const voiceStates = getVoiceStatesForChannel(channelId);
    const usersInChannel = Object.keys(voiceStates).length;

    if (channel.userLimit > 0 && usersInChannel >= channel.userLimit) return false;

    const currentUserId = getCurrentUserId();
    if (currentUserId && Object.prototype.hasOwnProperty.call(voiceStates, currentUserId)) return false;

    return true;
}

function matchesChannelFilters(channelId: string): boolean {
    const channel = ChannelStore.getChannel?.(channelId);
    if (!channel) return false;

    const voiceStates = getVoiceStatesForChannel(channelId);
    const usersInChannel = Object.keys(voiceStates).length;
    const channelLimit = channel.userLimit === 0 ? 99 : (channel.userLimit || 99);
    const spacesLeft = channelLimit - usersInChannel;

    if (!matchesOperation(settings.store.UserAmountOperation, usersInChannel, settings.store.UserAmount)) return false;
    if (!matchesOperation(settings.store.spacesLeftOperation, spacesLeft, settings.store.spacesLeft)) return false;
    if (!matchesOperation(settings.store.vcLimitOperation, channelLimit, settings.store.vcLimit)) return false;

    if (!hasStateFilters()) return true;

    const states = Object.values(voiceStates);
    const hasMatch = states.some(state => matchesStateFilters(state));

    if (settings.store.includeStates && !hasMatch) return false;
    if (settings.store.avoidStates && hasMatch) return false;

    return true;
}

function getCandidateChannelIds(): string[] {
    const seen = new Set<string>();
    const users = Object.values(UserStore.getUsers?.() ?? {}) as Array<{ id?: string }>;

    for (const user of users) {
        if (!user?.id) continue;

        const state = VoiceStateStore.getVoiceStateForUser?.(user.id) as RandomVoiceStateLike | undefined;
        const channelId = state?.channelId;

        if (!channelId || seen.has(channelId)) continue;
        if (!isChannelJoinable(channelId)) continue;
        if (!matchesChannelFilters(channelId)) continue;

        seen.add(channelId);
    }

    return Array.from(seen);
}

function getFriendCandidateIds(candidates: string[]): string[] {
    const friendIds = RelationshipStore.getFriendIDs?.() ?? [];
    const candidateSet = new Set(candidates);
    const result = new Set<string>();

    for (const friendId of friendIds) {
        const channelId = VoiceStateStore.getVoiceStateForUser?.(friendId)?.channelId;
        if (channelId && candidateSet.has(channelId)) {
            result.add(channelId);
        }
    }

    return Array.from(result);
}

function pickRandomChannelId(): string | null {
    const candidates = getCandidateChannelIds();
    if (!candidates.length) return null;

    let pool = candidates;
    if (settings.store.prioritizeFriends) {
        const friendCandidates = getFriendCandidateIds(candidates);
        if (friendCandidates.length) {
            pool = friendCandidates;
        }
    }

    return pool[Math.floor(Math.random() * pool.length)] ?? null;
}

function applyPostJoinSettings(): void {
    if (settings.store.selfMute && !MediaEngineStore.isSelfMute?.() && SelectedChannelStore.getVoiceChannelId?.()) {
        VoiceActions.toggleSelfMute?.();
    }

    if (settings.store.selfDeafen && !MediaEngineStore.isSelfDeaf?.() && SelectedChannelStore.getVoiceChannelId?.()) {
        VoiceActions.toggleSelfDeaf?.();
    }
}

function joinRandomVoice(): void {
    const channelId = pickRandomChannelId();

    if (!channelId) {
        showToast("No matching voice channel found.", Toasts.Type.FAILURE);
        return;
    }

    const channel = ChannelStore.getChannel?.(channelId);
    if (!channel) {
        showToast("Voice channel is unavailable.", Toasts.Type.FAILURE);
        return;
    }

    ChannelActions.selectVoiceChannel?.(channelId);

    if (settings.store.autoNavigate) {
        ChannelRouter.transitionToChannel?.(channelId);
    }

    setTimeout(() => applyPostJoinSettings(), 300);
    showToast(`Joined random voice: ${channel.name ?? "Unknown Channel"}`, Toasts.Type.SUCCESS);
}

type PluginWithListener = {
    listener?: (e: KeyboardEvent) => void;
};

export default definePlugin({
    name: "RandomVoice",
    description: "Join a random voice channel with advanced filters and Ctrl+B hotkey.",
    authors: [Devs.Ven, Devs.Nuckyz, Devs.Megu],

    settings,

    start(this: PluginWithListener) {
        this.listener = (e: KeyboardEvent) => {
            if (!settings.store.hotkeyEnabled) return;
            if (!e.ctrlKey) return;
            if (e.key.toLowerCase() !== "b") return;

            e.preventDefault();
            joinRandomVoice();
        };

        window.addEventListener("keydown", this.listener);
        showToast("RandomVoice enabled. Press Ctrl+B to join a random VC.", Toasts.Type.SUCCESS);
    },

    stop(this: PluginWithListener) {
        if (this.listener) {
            window.removeEventListener("keydown", this.listener);
        }

        showToast("RandomVoice disabled.", Toasts.Type.MESSAGE);
    },

    commands: [
        {
            name: "randomvoice",
            description: "Join a random voice channel",
            execute: () => {
                joinRandomVoice();
            }
        }
    ]
});
