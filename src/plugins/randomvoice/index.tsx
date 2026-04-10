/*
 * RandomVoice - single-file Vencord plugin
 * Built from the uploaded snippets and cleaned up for .tsx usage.
 */

import { definePluginSettings } from "@api/Settings";
import { UserAreaButton, UserAreaRenderProps } from "@api/UserArea";
import { debounce } from "@shared/debounce";
import { Devs } from "@utils/constants";
import definePlugin, { makeRange, OptionType } from "@utils/types";
import type { Channel, VoiceState } from "@vencord/discord-types";
import { findByCodeLazy, findByPropsLazy } from "@webpack";
import {
    ChannelActions,
    ChannelRouter,
    ChannelStore,
    ContextMenuApi,
    FluxDispatcher,
    GuildStore,
    MediaEngineStore,
    Menu,
    PermissionsBits,
    PermissionStore,
    React,
    RelationshipStore,
    SelectedChannelStore,
    Toasts,
    UserStore,
    VoiceActions,
    VoiceStateStore
} from "@webpack/common";

const startStream = findByCodeLazy('type:"STREAM_START"');
const getDesktopSources = findByCodeLazy("desktop sources");
const { isVideoEnabled } = findByPropsLazy("isVideoEnabled");

const NO_SERVERS = "__NONE__";

type RandomVoiceOperation = "<" | ">" | "==";
type StateFilterKey = "mute" | "deafen" | "video" | "stream";
type SelfSettingKey =
    | "selfMute"
    | "selfDeafen"
    | "autoCamera"
    | "autoStream"
    | "leaveEmpty"
    | "autoNavigate"
    | "avoidStages"
    | "avoidAfk"
    | "prioritizeFriends";

type PostJoinAction = () => void | Promise<void>;

interface OperationOption {
    label: string;
    value: RandomVoiceOperation;
    default?: boolean;
}

interface ToggleOption<K extends string> {
    key: K;
    label: string;
}

interface RandomVoiceStateLike {
    userId?: string | null;
    channelId?: string | null;
    oldChannelId?: string | null;
    selfDeaf?: boolean | null;
    selfMute?: boolean | null;
    selfStream?: boolean | null;
    selfVideo?: boolean | null;
}

const operationOptions: OperationOption[] = [
    { label: "More than", value: ">" },
    { label: "Less than", value: "<" },
    { label: "Equal to", value: "==", default: true }
];

const stateFilters: ToggleOption<StateFilterKey>[] = [
    { key: "mute", label: "Muted" },
    { key: "deafen", label: "Deafened" },
    { key: "video", label: "Camera" },
    { key: "stream", label: "Stream" }
];

const selfSettings: ToggleOption<SelfSettingKey>[] = [
    { key: "selfMute", label: "Auto Mute" },
    { key: "selfDeafen", label: "Auto Deafen" },
    { key: "autoCamera", label: "Auto Camera" },
    { key: "autoStream", label: "Auto Stream" },
    { key: "leaveEmpty", label: "Leave when Empty" },
    { key: "autoNavigate", label: "Auto Navigate" },
    { key: "prioritizeFriends", label: "Prioritize Friends" },
    { key: "avoidStages", label: "Avoid Stage" },
    { key: "avoidAfk", label: "Avoid AFK" }
];

const settings = definePluginSettings({
    UserAmountOperation: {
        description: "Compare current users in the voice channel",
        type: OptionType.SELECT,
        options: [...operationOptions],
        default: "<"
    },
    UserAmount: {
        description: "Target amount of users",
        type: OptionType.SLIDER,
        markers: makeRange(0, 15, 1),
        default: 3,
        stickToMarkers: true
    },
    spacesLeftOperation: {
        description: "Compare free slots left in the voice channel",
        type: OptionType.SELECT,
        options: [...operationOptions],
        default: ">"
    },
    spacesLeft: {
        description: "Target free slots",
        type: OptionType.SLIDER,
        markers: makeRange(0, 15, 1),
        default: 1,
        stickToMarkers: true
    },
    vcLimitOperation: {
        description: "Compare the voice-channel user limit",
        type: OptionType.SELECT,
        options: [...operationOptions],
        default: ">"
    },
    vcLimit: {
        description: "Target voice-channel limit",
        type: OptionType.SLIDER,
        markers: makeRange(1, 99, 1),
        default: 2,
        stickToMarkers: true
    },
    Servers: {
        description: "Allowed servers, stored as guild ids separated by /",
        type: OptionType.STRING,
        default: ""
    },
    autoNavigate: {
        type: OptionType.BOOLEAN,
        description: "Automatically navigate to the joined channel",
        default: false
    },
    autoCamera: {
        type: OptionType.BOOLEAN,
        description: "Automatically turn on camera after joining",
        default: false
    },
    autoStream: {
        type: OptionType.BOOLEAN,
        description: "Automatically start streaming after joining",
        default: false
    },
    selfMute: {
        type: OptionType.BOOLEAN,
        description: "Automatically mute yourself after joining",
        default: false
    },
    selfDeafen: {
        type: OptionType.BOOLEAN,
        description: "Automatically deafen yourself after joining",
        default: false
    },
    leaveEmpty: {
        type: OptionType.BOOLEAN,
        description: "Jump to another random voice if you become alone in the channel",
        default: false
    },
    prioritizeFriends: {
        type: OptionType.BOOLEAN,
        description: "Prefer channels with friends in them",
        default: false
    },
    avoidStages: {
        type: OptionType.BOOLEAN,
        description: "Avoid stage channels",
        default: true
    },
    avoidAfk: {
        type: OptionType.BOOLEAN,
        description: "Avoid AFK channels",
        default: true
    },
    video: {
        type: OptionType.BOOLEAN,
        description: "Filter by users with camera on",
        default: false
    },
    stream: {
        type: OptionType.BOOLEAN,
        description: "Filter by users who are streaming",
        default: false
    },
    mute: {
        type: OptionType.BOOLEAN,
        description: "Filter by muted users",
        default: false
    },
    deafen: {
        type: OptionType.BOOLEAN,
        description: "Filter by deafened users",
        default: false
    },
    includeStates: {
        type: OptionType.BOOLEAN,
        description: "Only include channels matching the selected state filters",
        default: false
    },
    avoidStates: {
        type: OptionType.BOOLEAN,
        description: "Avoid channels matching the selected state filters",
        default: false
    }
});

function showToast(message: string, type: (typeof Toasts.Type)[keyof typeof Toasts.Type]) {
    Toasts.show({
        message,
        type,
        id: Toasts.genId(),
        options: { position: Toasts.Position.BOTTOM }
    });
}

function RandomVoiceIcon({ className }: { className?: string; }) {
    return (
        <svg className={className} width="18" height="18" viewBox="0 0 24 24">
            <g fill="currentColor">
                <path d="M19,9H14a5.006,5.006,0,0,0-5,5v5a5.006,5.006,0,0,0,5,5h5a5.006,5.006,0,0,0,5-5V14A5.006,5.006,0,0,0,19,9Zm-5,6a1,1,0,1,1,1-1A1,1,0,0,1,14,15Zm5,5a1,1,0,1,1,1-1A1,1,0,0,1,19,20ZM15.6,5,12.069,1.462A5.006,5.006,0,0,0,5,1.462L1.462,5a5.006,5.006,0,0,0,0,7.071L5,15.6a4.961,4.961,0,0,0,2,1.223V14a7.008,7.008,0,0,1,7-7h2.827A4.961,4.961,0,0,0,15.6,5ZM5,10A1,1,0,1,1,6,9,1,1,0,0,1,5,10ZM9,6a1,1,0,1,1,1-1A1,1,0,0,1,9,6Z" />
            </g>
        </svg>
    );
}

function getCurrentUserId() {
    return UserStore.getCurrentUser()?.id ?? null;
}

function getCurrentVoiceChannelId(userId = getCurrentUserId()) {
    if (!userId) return null;

    return VoiceStateStore.getVoiceStateForUser(userId)?.channelId
        ?? SelectedChannelStore.getVoiceChannelId()
        ?? null;
}

function parseServerIds(store = settings.store) {
    return store.Servers
        .split("/")
        .map(id => id.trim())
        .filter(id => id && id !== NO_SERVERS);
}

function setServerIds(serverIds: string[]) {
    settings.store.Servers = serverIds.length ? `/${serverIds.join("/")}` : "";
}

function getSelectedServerIds(store = settings.store) {
    if (!store.Servers || store.Servers === NO_SERVERS) return null;
    return parseServerIds(store);
}

function getRenderableGuilds() {
    return Object.values(GuildStore.getGuilds())
        .filter((guild): guild is NonNullable<typeof guild> => guild != null && typeof guild.id === "string")
        .sort((left, right) => left.name.localeCompare(right.name));
}

function getGuildVoiceStates() {
    return getRenderableGuilds().flatMap(({ id }) =>
        Object.entries((VoiceStateStore.getVoiceStates(id) as Record<string, RandomVoiceStateLike> | null) ?? {})
    );
}

function hasStateFilters(store = settings.store) {
    return stateFilters.some(({ key }) => Boolean(store[key]));
}

function matchesOperation(operation: RandomVoiceOperation, left: number, right: number) {
    if (operation === "==") return left === right;
    if (operation === ">") return left > right;
    return left < right;
}

function isStageChannel(channel: Channel) {
    return channel.type === 13 || channel.isGuildStageVoice?.() === true;
}

function isAfkChannel(channel: Channel) {
    const guildId = channel.getGuildId?.() ?? channel.guild_id;
    if (!guildId) return false;
    return GuildStore.getGuild(guildId)?.afkChannelId === channel.id;
}

function matchesStateFilters(state: RandomVoiceStateLike, store = settings.store) {
    if (store.mute && !state.selfMute) return false;
    if (store.deafen && !state.selfDeaf) return false;
    if (store.video && !state.selfVideo) return false;
    if (store.stream && !state.selfStream) return false;
    return true;
}

function isJoinableChannel(channelId: string, store = settings.store) {
    const channel = ChannelStore.getChannel(channelId);
    if (!channel) return false;

    const selectedServerIds = getSelectedServerIds(store);
    const guildId = channel.getGuildId?.() ?? channel.guild_id;
    if (selectedServerIds != null && (!guildId || !selectedServerIds.includes(guildId))) return false;
    if (store.avoidStages && isStageChannel(channel)) return false;
    if (store.avoidAfk && isAfkChannel(channel)) return false;
    if (!PermissionStore.can(PermissionsBits.CONNECT, channel)) return false;

    const currentUserId = getCurrentUserId();
    const voiceStates = VoiceStateStore.getVoiceStatesForChannel(channelId) as Record<string, RandomVoiceStateLike> | null;
    const usersInChannel = Object.keys(voiceStates ?? {}).length;

    if (channel.userLimit > 0 && usersInChannel >= channel.userLimit) return false;
    if (currentUserId && voiceStates && Object.prototype.hasOwnProperty.call(voiceStates, currentUserId)) return false;

    return true;
}

function matchesChannelFilters(channelId: string, store = settings.store) {
    const channel = ChannelStore.getChannel(channelId);
    if (!channel) return false;

    const voiceStates = VoiceStateStore.getVoiceStatesForChannel(channelId) as Record<string, RandomVoiceStateLike> | null;
    const usersInChannel = Object.keys(voiceStates ?? {}).length;
    const channelLimit = channel.userLimit > 0 ? channel.userLimit : 99;
    const spacesLeft = channelLimit - usersInChannel;

    if (!matchesOperation(store.spacesLeftOperation, spacesLeft, store.spacesLeft)) return false;
    if (!matchesOperation(store.UserAmountOperation, usersInChannel, store.UserAmount)) return false;
    if (!matchesOperation(store.vcLimitOperation, channelLimit, store.vcLimit)) return false;

    if (!hasStateFilters(store) || !voiceStates) return true;

    const channelStates = Object.values(voiceStates);
    const hasMatch = channelStates.some(voiceState => matchesStateFilters(voiceState, store));
    if (store.includeStates && !hasMatch) return false;
    if (store.avoidStates && hasMatch) return false;

    return true;
}

function getCandidateChannelIds(store = settings.store) {
    const candidates = new Set<string>();

    for (const [, state] of getGuildVoiceStates()) {
        const channelId = state.channelId;
        if (!channelId || candidates.has(channelId)) continue;
        if (!isJoinableChannel(channelId, store)) continue;
        if (!matchesChannelFilters(channelId, store)) continue;
        candidates.add(channelId);
    }

    return [...candidates];
}

function getFriendChannelIds() {
    const friendChannelIds = new Set<string>();

    for (const userId of RelationshipStore.getFriendIDs()) {
        const channelId = VoiceStateStore.getVoiceStateForUser(userId)?.channelId;
        if (channelId && isJoinableChannel(channelId)) {
            friendChannelIds.add(channelId);
        }
    }

    return friendChannelIds;
}

function pickRandomChannel(store = settings.store) {
    const candidates = getCandidateChannelIds(store);
    const friendChannelIds = store.prioritizeFriends ? getFriendChannelIds() : null;
    const friendCandidates = store.prioritizeFriends
        ? candidates.filter(channelId => friendChannelIds?.has(channelId))
        : [];

    const pool = friendCandidates.length ? friendCandidates : candidates;
    return pool[Math.floor(Math.random() * pool.length)] ?? null;
}

async function enableCamera() {
    if (isVideoEnabled?.()) return;

    FluxDispatcher.dispatch({
        type: "MEDIA_ENGINE_SET_VIDEO_ENABLED",
        enabled: true
    });
}

async function startChannelStream(channel: Channel) {
    if (isStageChannel(channel) || !PermissionStore.can(PermissionsBits.STREAM, channel)) return;

    const selectedChannelId = SelectedChannelStore.getVoiceChannelId();
    if (!selectedChannelId) return;

    const sources = await getDesktopSources(MediaEngineStore.getMediaEngine(), ["screen"], null);
    const source = sources?.[0];
    if (!source) return;

    startStream(channel.guild_id ?? null, selectedChannelId, {
        pid: null,
        sourceId: source.id,
        sourceName: source.name,
        audioSourceId: null,
        sound: true,
        previewDisabled: false
    });
}

function runAfterVoiceJoin(channelId: string, callbacks: PostJoinAction[]) {
    let attempts = 0;
    const interval = setInterval(() => {
        attempts++;

        if (getCurrentVoiceChannelId() !== channelId) {
            if (attempts < 40) return;
            clearInterval(interval);
            return;
        }

        clearInterval(interval);
        for (const callback of callbacks) {
            void callback();
        }
    }, 100);
}

async function joinRandomVoice() {
    const channelId = pickRandomChannel();
    if (!channelId) {
        showToast("No suitable voice channel was found.", Toasts.Type.MESSAGE);
        return;
    }

    const channel = ChannelStore.getChannel(channelId);
    if (!channel) {
        showToast("Voice channel is unavailable.", Toasts.Type.FAILURE);
        return;
    }

    const { store } = settings;
    ChannelActions.selectVoiceChannel(channelId);

    if (store.autoNavigate) {
        ChannelRouter.transitionToChannel(channelId);
    }

    const postJoinActions: PostJoinAction[] = [];
    if (store.selfMute && !MediaEngineStore.isSelfMute()) {
        postJoinActions.push(() => VoiceActions.toggleSelfMute());
    }
    if (store.selfDeafen && !MediaEngineStore.isSelfDeaf()) {
        postJoinActions.push(() => VoiceActions.toggleSelfDeaf());
    }
    if (store.autoCamera) {
        postJoinActions.push(enableCamera);
    }
    if (store.autoStream) {
        postJoinActions.push(() => startChannelStream(channel));
    }

    if (postJoinActions.length) {
        runAfterVoiceJoin(channelId, postJoinActions);
    }

    showToast("Joined a random voice channel.", Toasts.Type.SUCCESS);
}

function RandomVoiceButton({ iconForeground, hideTooltips, nameplate }: UserAreaRenderProps) {
    return (
        <UserAreaButton
            onClick={() => void joinRandomVoice()}
            onContextMenu={event => ContextMenuApi.openContextMenu(event, () => <RandomVoiceMenu onClose={ContextMenuApi.closeContextMenu} />)}
            role="button"
            tooltipText={hideTooltips ? void 0 : "Random Voice"}
            icon={<RandomVoiceIcon className={iconForeground} />}
            plated={nameplate != null}
        />
    );
}

function RandomVoiceMenu({ onClose }: { onClose(): void; }) {
    const [, rerender] = React.useReducer(value => value + 1, 0);
    const { store } = settings;
    const guilds = getRenderableGuilds();
    const allServerIds = guilds.map(guild => guild.id);
    const selectedServerIds = getSelectedServerIds(store) ?? allServerIds;

    const update = <K extends keyof typeof store>(key: K, value: (typeof store)[K]) => {
        store[key] = value;
        rerender();
    };

    const toggle = <K extends SelfSettingKey | StateFilterKey | "includeStates" | "avoidStates">(key: K) => {
        update(key, !store[key]);
    };

    const selectAllServers = () => {
        setServerIds(guilds.map(guild => guild.id));
        rerender();
    };

    const clearServers = () => {
        setServerIds([]);
        rerender();
    };

    const toggleServer = (guildId: string) => {
        setServerIds(
            selectedServerIds.includes(guildId)
                ? selectedServerIds.filter(id => id !== guildId)
                : [...selectedServerIds, guildId]
        );
        rerender();
    };

    const setSlider = <K extends "UserAmount" | "spacesLeft" | "vcLimit">(key: K) =>
        debounce((value: number) => {
            store[key] = Math.round(value);
            rerender();
        }, 50);

    return (
        <Menu.Menu navId="random-voice" onClose={onClose} aria-label="Random Voice">
            <Menu.MenuItem id="random-voice-join-now" label="Join Random Voice" action={() => void joinRandomVoice()} />

            <Menu.MenuSeparator />

            <Menu.MenuItem id="random-voice-servers" label="Servers">
                <>
                    <Menu.MenuCheckboxItem
                        id="random-voice-select-all-servers"
                        label="Select All"
                        checked={selectedServerIds.length === allServerIds.length && allServerIds.length > 0}
                        action={selectAllServers}
                    />
                    <Menu.MenuCheckboxItem
                        id="random-voice-clear-servers"
                        label="Clear Filter"
                        checked={getSelectedServerIds(store) == null}
                        action={clearServers}
                    />
                    <Menu.MenuSeparator />
                    {guilds.map(guild => (
                        <Menu.MenuCheckboxItem
                            key={guild.id}
                            id={`random-voice-server-${guild.id}`}
                            label={guild.name}
                            checked={selectedServerIds.includes(guild.id)}
                            action={() => toggleServer(guild.id)}
                        />
                    ))}
                </>
            </Menu.MenuItem>

            <Menu.MenuItem id="random-voice-state-filters" label="State Filters">
                <>
                    {stateFilters.map(({ key, label }) => (
                        <Menu.MenuCheckboxItem
                            key={key}
                            id={`random-voice-filter-${key}`}
                            label={label}
                            checked={store[key]}
                            action={() => toggle(key)}
                        />
                    ))}
                    <Menu.MenuSeparator />
                    <Menu.MenuCheckboxItem
                        id="random-voice-include-states"
                        label="Include Filters"
                        checked={store.includeStates}
                        disabled={store.avoidStates || !hasStateFilters(store)}
                        action={() => toggle("includeStates")}
                    />
                    <Menu.MenuCheckboxItem
                        id="random-voice-avoid-states"
                        label="Avoid Filters"
                        checked={store.avoidStates}
                        disabled={store.includeStates || !hasStateFilters(store)}
                        action={() => toggle("avoidStates")}
                    />
                </>
            </Menu.MenuItem>

            <Menu.MenuSeparator />

            {renderOperationGroup({
                id: "users",
                label: "User Amount",
                sliderKey: "UserAmount",
                sliderValue: store.UserAmount,
                operationKey: "UserAmountOperation",
                operationValue: store.UserAmountOperation,
                onOperationChange: value => update("UserAmountOperation", value),
                onSliderChange: setSlider("UserAmount")
            })}

            <Menu.MenuSeparator />

            {renderOperationGroup({
                id: "spaces-left",
                label: "Spaces Left",
                sliderKey: "spacesLeft",
                sliderValue: store.spacesLeft,
                operationKey: "spacesLeftOperation",
                operationValue: store.spacesLeftOperation,
                onOperationChange: value => update("spacesLeftOperation", value),
                onSliderChange: setSlider("spacesLeft")
            })}

            <Menu.MenuSeparator />

            {renderOperationGroup({
                id: "voice-limit",
                label: "Voice Limit",
                sliderKey: "vcLimit",
                sliderValue: store.vcLimit,
                operationKey: "vcLimitOperation",
                operationValue: store.vcLimitOperation,
                onOperationChange: value => update("vcLimitOperation", value),
                onSliderChange: setSlider("vcLimit")
            })}

            <Menu.MenuSeparator />

            <Menu.MenuItem id="random-voice-self-settings" label="Join Settings">
                <>
                    {selfSettings.map(({ key, label }) => (
                        <Menu.MenuCheckboxItem
                            key={key}
                            id={`random-voice-setting-${key}`}
                            label={label}
                            checked={store[key]}
                            action={() => toggle(key)}
                        />
                    ))}
                </>
            </Menu.MenuItem>
        </Menu.Menu>
    );
}

function renderOperationGroup({
    id,
    label,
    sliderKey,
    sliderValue,
    operationKey,
    operationValue,
    onOperationChange,
    onSliderChange
}: {
    id: string;
    label: string;
    sliderKey: string;
    sliderValue: number;
    operationKey: string;
    operationValue: RandomVoiceOperation;
    onOperationChange(value: RandomVoiceOperation): void;
    onSliderChange(value: number): void;
}) {
    return (
        <Menu.MenuGroup label={label.toUpperCase()}>
            <Menu.MenuControlItem
                id={`random-voice-slider-${sliderKey}`}
                label={label}
                control={(props, ref) => (
                    <Menu.MenuSliderControl
                        ref={ref}
                        {...props}
                        minValue={0}
                        maxValue={sliderKey === "vcLimit" ? 99 : 15}
                        value={sliderValue}
                        onChange={onSliderChange}
                        renderValue={value => `${Math.round(value)}`}
                    />
                )}
            />
            <Menu.MenuItem id={`random-voice-operation-${operationKey}`} label="Parameters">
                <>
                    {operationOptions.map(option => (
                        <Menu.MenuRadioItem
                            key={option.value}
                            id={`random-voice-operation-${id}-${option.value}`}
                            group={`random-voice-${id}`}
                            label={option.label}
                            checked={operationValue === option.value}
                            action={() => onOperationChange(option.value)}
                        />
                    ))}
                </>
            </Menu.MenuItem>
        </Menu.MenuGroup>
    );
}

export default definePlugin({
    name: "RandomVoice",
    description: "Adds a button near the mute area to join a random voice channel with filters.",
    authors: [Devs.Vendicated],
    settings,

    userAreaButton: {
        icon: RandomVoiceIcon,
        render: RandomVoiceButton
    },

    flux: {
        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: VoiceState[]; }) {
            const currentUserId = getCurrentUserId();
            if (!currentUserId || !settings.store.leaveEmpty) return;

            const myChannelId = getCurrentVoiceChannelId(currentUserId);
            if (!myChannelId) return;

            const touchedCurrentChannel = voiceStates.some(state =>
                state.userId === currentUserId
                || state.channelId === myChannelId
                || state.oldChannelId === myChannelId
            );
            if (!touchedCurrentChannel) return;

            const myOwnJoin = voiceStates.some(state =>
                state.userId === currentUserId
                && state.channelId === myChannelId
                && state.oldChannelId !== myChannelId
            );
            if (myOwnJoin) return;

            const channelStates = VoiceStateStore.getVoiceStatesForChannel(myChannelId) as Record<string, VoiceState> | null;
            const otherUsers = Object.values(channelStates ?? {}).filter(state => state.userId !== currentUserId);

            if (!otherUsers.length) {
                void joinRandomVoice();
            }
        }
    }
});
