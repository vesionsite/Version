/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { Guild } from "@vencord/discord-types";
import { findStoreLazy } from "@webpack";
import { ChannelStore, GuildRoleStore, Menu, React, RestAPI } from "@webpack/common";

const GuildChannelStore = findStoreLazy("GuildChannelStore");

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const randomDelay = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

interface PermissionOverwrite {
    id: string;
    type: number;
    allow: string;
    deny: string;
}

interface FullChannel {
    id: string;
    name: string;
    type: number;
    parent_id: string | null;
    position: number;
    topic: string | null;
    nsfw: boolean;
    rateLimitPerUser: number;
    bitrate: number | null;
    userLimit: number | null;
    permissionOverwrites: PermissionOverwrite[];
    defaultAutoArchiveDuration?: number;
    flags?: number;
}

interface FullRole {
    id: string;
    name: string;
    color: number;
    hoist: boolean;
    position: number;
    permissions: bigint | string;
    mentionable: boolean;
    icon?: string | null;
    unicodeEmoji?: string | null;
}

let isCloning = false;
let progressBar: HTMLElement | null = null;
let notificationContainer: HTMLElement | null = null;
const persistentNotifications: Map<string, HTMLElement> = new Map();

const settings = definePluginSettings({
    channelDelay: {
        type: OptionType.SLIDER,
        description: "Base delay between API requests (ms)",
        default: 800,
        markers: [200, 500, 800, 1000, 1500, 2000],
        stickToMarkers: false
    },
    concurrency: {
        type: OptionType.NUMBER,
        description: "Max concurrent requests (be careful with higher values)",
        default: 1,
    }
});

function injectStyles() {
    if (document.getElementById("server-cloner-styles")) return;

    const style = document.createElement("style");
    style.id = "server-cloner-styles";
    style.textContent = `
        @keyframes cloner-shimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
        }
        @keyframes cloner-fadeIn {
            from { opacity: 0; transform: translateY(-20px) scale(0.95); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes cloner-fadeOut {
            from { opacity: 1; transform: translateY(0) scale(1); }
            to { opacity: 0; transform: translateY(-20px) scale(0.95); }
        }
        @keyframes cloner-progressShrink {
            from { width: 100%; }
            to { width: 0%; }
        }
        
        .cloner-notification-container {
            position: fixed;
            top: 24px;
            right: 24px;
            z-index: 99999;
            display: flex;
            flex-direction: column;
            gap: 12px;
            pointer-events: none;
            align-items: flex-end;
        }
        
        .cloner-notification {
            background: rgba(30, 31, 34, 0.95);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: #dbdee1;
            padding: 14px 18px;
            border-radius: 10px;
            font-size: 14px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
            display: flex;
            align-items: center;
            gap: 12px;
            min-width: 280px;
            max-width: 420px;
            animation: cloner-fadeIn 0.3s cubic-bezier(0.2, 0, 0, 1);
            pointer-events: auto;
            position: relative;
            overflow: hidden;
        }
        
        .cloner-notification.closing {
            animation: cloner-fadeOut 0.2s ease-in forwards;
        }
        
        .cloner-notification-icon {
            flex-shrink: 0;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            font-weight: bold;
        }
        
        .cloner-notification.success .cloner-notification-icon { background: #23a559; color: white; }
        .cloner-notification.error .cloner-notification-icon { background: #f23f43; color: white; }
        .cloner-notification.info .cloner-notification-icon { background: #5865f2; color: white; }
        
        .cloner-notification-content { flex: 1; }
        .cloner-notification-title { font-weight: 700; color: #fff; margin-bottom: 2px; }
        .cloner-notification-message { font-size: 13px; opacity: 0.8; }
        
        .cloner-notification-progress-timer {
            position: absolute;
            bottom: 0;
            left: 0;
            height: 3px;
            background: #5865f2;
            animation: cloner-progressShrink linear forwards;
        }
        
        .cloner-progress-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(4px);
            z-index: 99998;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .cloner-progress-container {
            background: #2b2d31;
            border-radius: 12px;
            padding: 24px;
            width: 440px;
            box-shadow: 0 12px 48px rgba(0, 0, 0, 0.5);
            border: 1px solid rgba(255, 255, 255, 0.05);
        }
        
        .cloner-progress-header {
            display: flex;
            align-items: center;
            gap: 16px;
            margin-bottom: 20px;
        }
        
        .cloner-progress-icon {
            font-size: 32px;
        }
        
        .cloner-progress-title {
            font-size: 18px;
            font-weight: 700;
            color: #fff;
        }
        
        .cloner-progress-subtitle {
            font-size: 12px;
            color: #b5bac1;
        }
        
        .cloner-progress-bar-bg {
            background: #1e1f22;
            border-radius: 6px;
            height: 10px;
            overflow: hidden;
            margin-bottom: 12px;
        }
        
        .cloner-progress-bar-fill {
            height: 100%;
            background: linear-gradient(90deg, #5865f2, #7289da);
            width: 0%;
            transition: width 0.4s ease;
            position: relative;
        }
        
        .cloner-progress-text {
            font-size: 13px;
            color: #b5bac1;
            text-align: center;
            margin-bottom: 20px;
        }
        
        .cloner-cancel-button {
            width: 100%;
            padding: 10px;
            background: #f23f43;
            color: white;
            border: none;
            border-radius: 4px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.2s;
        }
        
        .cloner-cancel-button:hover { background: #d83c3e; }
    `;
    document.head.appendChild(style);
}

function removeStyles() {
    const style = document.getElementById("server-cloner-styles");
    if (style) style.remove();
}

function notify(title: string, message: string, type: "success" | "error" | "info" = "info", duration: number = 4000) {
    if (!notificationContainer) {
        notificationContainer = document.createElement("div");
        notificationContainer.className = "cloner-notification-container";
        document.body.appendChild(notificationContainer);
    }

    const notification = document.createElement("div");
    notification.className = `cloner-notification ${type}`;

    const iconMap = { success: "✓", error: "✕", info: "ℹ" };

    notification.innerHTML = `
        <div class="cloner-notification-icon">${iconMap[type]}</div>
        <div class="cloner-notification-content">
            <div class="cloner-notification-title">${title}</div>
            <div class="cloner-notification-message">${message}</div>
        </div>
        ${duration > 0 ? `<div class="cloner-notification-progress-timer" style="animation-duration: ${duration}ms;"></div>` : ""}
    `;

    notificationContainer.appendChild(notification);

    if (duration > 0) {
        setTimeout(() => {
            notification.classList.add("closing");
            setTimeout(() => {
                notification.remove();
                if (notificationContainer?.children.length === 0) {
                    notificationContainer.remove();
                    notificationContainer = null;
                }
            }, 200);
        }, duration);
    }

    return notification;
}

function createPersistentNotification(id: string, title: string, message: string) {
    if (persistentNotifications.has(id)) {
        updateNotification(id, message);
        return id;
    }

    const notification = notify(title, message, "info", 0);
    persistentNotifications.set(id, notification);
    return id;
}

function updateNotification(id: string, message: string) {
    const notification = persistentNotifications.get(id);
    if (notification) {
        const messageEl = notification.querySelector(".cloner-notification-message");
        if (messageEl) messageEl.textContent = message;
    }
}

function closeNotification(id: string) {
    const notification = persistentNotifications.get(id);
    if (notification) {
        notification.classList.add("closing");
        setTimeout(() => {
            notification.remove();
            persistentNotifications.delete(id);
        }, 200);
    }
}

function showProgressBar() {
    if (progressBar) return;

    const overlay = document.createElement("div");
    overlay.className = "cloner-progress-overlay";

    overlay.innerHTML = `
        <div class="cloner-progress-container">
            <div class="cloner-progress-header">
                <div class="cloner-progress-icon">📂</div>
                <div>
                    <div class="cloner-progress-title">Cloning Server</div>
                    <div class="cloner-progress-subtitle">Duplicating roles, channels and settings...</div>
                </div>
            </div>
            <div class="cloner-progress-bar-bg">
                <div class="cloner-progress-bar-fill"></div>
            </div>
            <div class="cloner-progress-text">Initializing...</div>
            <button class="cloner-cancel-button">Abort Cloning</button>
        </div>
    `;

    overlay.querySelector(".cloner-cancel-button")?.addEventListener("click", () => {
        isCloning = false;
        notify("Abort Requested", "Stopping the process safely...", "info");
    });

    document.body.appendChild(overlay);
    progressBar = overlay;
}

function updateProgress(percentage: number, text?: string) {
    if (!progressBar) return;
    const fill = progressBar.querySelector(".cloner-progress-bar-fill") as HTMLElement;
    const textEl = progressBar.querySelector(".cloner-progress-text") as HTMLElement;
    if (fill) fill.style.width = `${Math.min(100, Math.max(0, percentage))}%`;
    if (text && textEl) textEl.textContent = text;
}

function removeProgressBar() {
    if (progressBar) {
        progressBar.remove();
        progressBar = null;
    }
}

class RateLimiter {
    private queue: Array<{ fn: () => Promise<any>, resolve: any, reject: any }> = [];
    private activeRequests = 0;
    private maxConcurrency: number;
    private delay: number;

    constructor(maxConcurrency: number, delay: number) {
        this.maxConcurrency = maxConcurrency;
        this.delay = delay;
    }

    async execute<T>(fn: () => Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            this.queue.push({ fn, resolve, reject });
            this.process();
        });
    }

    private async process() {
        if (this.activeRequests >= this.maxConcurrency || this.queue.length === 0) return;

        this.activeRequests++;
        const { fn, resolve, reject } = this.queue.shift()!;

        try {
            const result = await this.retryWithBackoff(fn);
            resolve(result);
        } catch (e) {
            reject(e);
        } finally {
            this.activeRequests--;
            await sleep(this.delay + randomDelay(0, 100));
            this.process();
        }
    }

    private async retryWithBackoff<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
        try {
            return await fn();
        } catch (error: any) {
            if (error?.status === 429 && retries > 0) {
                const retryAfter = (error.body?.retry_after || 2) * 1000;
                await sleep(retryAfter + 500);
                return this.retryWithBackoff(fn, retries - 1);
            }
            throw error;
        }
    }
}

async function fetchImage(url: string): Promise<string | null> {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    } catch { return null; }
}

async function cloneServer(guild: Guild) {
    if (isCloning) return notify("Busy", "Wait for current operation to finish", "error");

    isCloning = true;
    showProgressBar();

    const limiter = new RateLimiter(settings.store.concurrency, settings.store.channelDelay);
    const roleIdMap: Record<string, string> = {};
    const channelIdMap: Record<string, string> = {};

    try {
        updateProgress(5, "Fetching guild data...");

        // Get fresh guild data
        const guildDataResponse = await RestAPI.get({ url: `/guilds/${guild.id}` });
        const fullGuildData = guildDataResponse.body;

        // Fetch assets in parallel
        const [icon, banner, splash] = await Promise.all([
            guild.icon ? fetchImage(`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=512`) : Promise.resolve(null),
            fullGuildData.banner ? fetchImage(`https://cdn.discordapp.com/banners/${guild.id}/${fullGuildData.banner}.png?size=1024`) : Promise.resolve(null),
            fullGuildData.splash ? fetchImage(`https://cdn.discordapp.com/splashes/${guild.id}/${fullGuildData.splash}.png?size=1024`) : Promise.resolve(null),
        ]);

        updateProgress(10, "Creating new server...");
        const createResponse = await RestAPI.post({
            url: "/guilds",
            body: { name: guild.name, icon }
        });

        if (!createResponse?.body?.id) throw new Error("Could not create server");
        const newGuildId = createResponse.body.id;

        // Map @everyone role
        const sourceRoles = GuildRoleStore.getRoles(guild.id);
        const targetRoles = GuildRoleStore.getRoles(newGuildId);
        const sourceEveryone = Object.values(sourceRoles).find(r => r.name === "@everyone");
        const targetEveryone = Object.values(targetRoles).find(r => r.name === "@everyone");

        if (sourceEveryone && targetEveryone) {
            roleIdMap[sourceEveryone.id] = (targetEveryone as any).id;
            // Update target @everyone permissions
            await limiter.execute(() => RestAPI.patch({
                url: `/guilds/${newGuildId}/roles/${(targetEveryone as any).id}`,
                body: { permissions: sourceEveryone.permissions.toString() }
            }));
        }

        // Roles
        const sortedRoles = Object.values(sourceRoles)
            .filter(r => r.name !== "@everyone" && !r.managed)
            .sort((a, b) => a.position - b.position);

        updateProgress(20, `Creating ${sortedRoles.length} roles...`);
        for (let i = 0; i < sortedRoles.length; i++) {
            if (!isCloning) break;
            const role = sortedRoles[i];
            const resp = await limiter.execute(() => RestAPI.post({
                url: `/guilds/${newGuildId}/roles`,
                body: {
                    name: role.name,
                    color: role.color,
                    hoist: role.hoist,
                    mentionable: role.mentionable,
                    permissions: role.permissions.toString()
                }
            }));
            if (resp.body?.id) roleIdMap[role.id] = resp.body.id;
            updateProgress(20 + (i / sortedRoles.length) * 20, `Role: ${role.name}`);
        }

        // Channels
        const allChannels = Object.values(ChannelStore.getMutableGuildChannelsForGuild(guild.id)) as any[];
        const categories = allChannels.filter(c => c.type === 4).sort((a, b) => a.position - b.position);
        const others = allChannels.filter(c => c.type !== 4).sort((a, b) => a.position - b.position);

        const mapOverwrites = (overwrites: any[]) => overwrites.map(ow => ({
            id: roleIdMap[ow.id] || ow.id,
            type: ow.type,
            allow: ow.allow,
            deny: ow.deny
        })).filter(ow => ow.id);

        updateProgress(45, `Creating ${categories.length} categories...`);
        for (let i = 0; i < categories.length; i++) {
            if (!isCloning) break;
            const cat = categories[i];
            const resp = await limiter.execute(() => RestAPI.post({
                url: `/guilds/${newGuildId}/channels`,
                body: {
                    name: cat.name,
                    type: 4,
                    position: cat.position,
                    permission_overwrites: mapOverwrites(cat.permissionOverwrites || [])
                }
            }));
            if (resp.body?.id) channelIdMap[cat.id] = resp.body.id;
        }

        updateProgress(60, `Creating ${others.length} channels...`);
        for (let i = 0; i < others.length; i++) {
            if (!isCloning) break;
            const ch = others[i];
            await limiter.execute(() => RestAPI.post({
                url: `/guilds/${newGuildId}/channels`,
                body: {
                    name: ch.name,
                    type: ch.type,
                    topic: ch.topic,
                    nsfw: ch.nsfw,
                    bitrate: ch.bitrate,
                    user_limit: ch.userLimit,
                    parent_id: ch.parent_id ? channelIdMap[ch.parent_id] : null,
                    position: ch.position,
                    permission_overwrites: mapOverwrites(ch.permissionOverwrites || []),
                    rate_limit_per_user: ch.rateLimitPerUser,
                    default_auto_archive_duration: ch.defaultAutoArchiveDuration
                }
            }));
            updateProgress(60 + (i / others.length) * 30, `Channel: ${ch.name}`);
        }

        // Final settings
        updateProgress(95, "Applying guild settings...");
        await limiter.execute(() => RestAPI.patch({
            url: `/guilds/${newGuildId}`,
            body: {
                banner,
                splash,
                description: fullGuildData.description,
                verification_level: fullGuildData.verification_level,
                default_message_notifications: fullGuildData.default_message_notifications,
                explicit_content_filter: fullGuildData.explicit_content_filter,
                preferred_locale: fullGuildData.preferred_locale,
                afk_timeout: fullGuildData.afk_timeout,
                afk_channel_id: fullGuildData.afk_channel_id ? channelIdMap[fullGuildData.afk_channel_id] : null,
                system_channel_id: fullGuildData.system_channel_id ? channelIdMap[fullGuildData.system_channel_id] : null,
                system_channel_flags: fullGuildData.system_channel_flags,
                rules_channel_id: fullGuildData.rules_channel_id ? channelIdMap[fullGuildData.rules_channel_id] : null,
                public_updates_channel_id: fullGuildData.public_updates_channel_id ? channelIdMap[fullGuildData.public_updates_channel_id] : null,
            }
        }));

        updateProgress(100, "Done!");
        notify("Success", `Server "${guild.name}" cloned successfully!`, "success");
    } catch (e: any) {
        console.error(e);
        notify("Error", e.message || "Failed to clone server", "error");
    } finally {
        isCloning = false;
        setTimeout(removeProgressBar, 1500);
    }
}

const CloneIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
    </svg>
);

const guildContextMenuPatch: NavContextMenuPatchCallback = (children: any[], props: { guild?: Guild; }) => {
    if (!props?.guild) return;

    const group = findGroupChildrenByChildId("privacy", children);
    const menuItem = (
        <Menu.MenuItem
            id="clone-server-pro"
            label="Clone Server"
            action={() => cloneServer(props.guild!)}
            icon={CloneIcon}
        />
    );

    if (group) {
        group.push(menuItem);
    } else {
        children.push(<Menu.MenuGroup>{menuItem}</Menu.MenuGroup>);
    }
};

export default definePlugin({
    name: "ServerClonerV2",
    description: "Modern & high-speed server cloning with full support for roles, channels, and community features.",
    authors: [Devs["3Tb"]],
    settings,

    start() {
        injectStyles();
    },

    stop() {
        removeStyles();
    },

    contextMenus: {
        "guild-context": guildContextMenuPatch,
        "guild-header-popout": guildContextMenuPatch
    }
});
