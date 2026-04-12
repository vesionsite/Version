import definePlugin from "@utils/types";

const IMG_EXT = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".avif"];
const VIDEO_EXT = [".mp4", ".webm", ".mov", ".mkv", ".m4v"];

type MediaType = "image" | "video";

type MediaItem = {
    url: string;
    type: MediaType;
    filename: string;
    author: string;
    timestamp: string;
    source: string;
};

let observer: MutationObserver | null = null;

function isProbablyDm(): boolean {
    return /\/channels\/@me\//.test(window.location.pathname);
}

function getFilenameFromUrl(url: string): string {
    try {
        const clean = url.split("?")[0];
        const last = clean.split("/").pop();
        return last || "unknown";
    } catch {
        return "unknown";
    }
}

function inferType(url: string): MediaType | null {
    const lowered = url.toLowerCase().split("?")[0];

    if (IMG_EXT.some(ext => lowered.endsWith(ext))) return "image";
    if (VIDEO_EXT.some(ext => lowered.endsWith(ext))) return "video";

    if (lowered.includes("/attachments/") && /\.(png|jpg|jpeg|gif|webp|bmp|avif)(?:$|\?)/.test(lowered)) return "image";
    if (lowered.includes("/attachments/") && /\.(mp4|webm|mov|mkv|m4v)(?:$|\?)/.test(lowered)) return "video";

    return null;
}

function uniqueByUrl(items: MediaItem[]): MediaItem[] {
    const seen = new Set<string>();
    const out: MediaItem[] = [];

    for (const item of items) {
        if (seen.has(item.url)) continue;
        seen.add(item.url);
        out.push(item);
    }

    return out;
}

function getCurrentChannelName(): string {
    const path = window.location.pathname;
    const match = path.match(/\/channels\/@me\/(\d+)/);
    if (match?.[1]) return `DM ${match[1]}`;
    return "DM";
}

function extractMediaFromDom(): MediaItem[] {
    const items: MediaItem[] = [];
    const messageNodes = Array.from(
        document.querySelectorAll("[id^='chat-messages-'], [class*='messageListItem'], [class*='message_']")
    );

    for (const node of messageNodes) {
        const element = node as HTMLElement;

        const author =
            element.querySelector("[class*='username'], [class*='headerText']")?.textContent?.trim()
            || "Unknown";

        const timestamp =
            element.querySelector("time")?.getAttribute("datetime")
            || element.querySelector("time")?.textContent?.trim()
            || "Unknown time";

        const imgs = Array.from(element.querySelectorAll("img"));
        for (const img of imgs) {
            const src = (img as HTMLImageElement).src;
            if (!src) continue;
            if (!src.includes("cdn.discordapp.com") && !src.includes("media.discordapp.net")) continue;

            const type = inferType(src);
            if (type !== "image") continue;

            items.push({
                url: src,
                type,
                filename: getFilenameFromUrl(src),
                author,
                timestamp,
                source: "image"
            });
        }

        const vids = Array.from(element.querySelectorAll("video"));
        for (const video of vids) {
            const videoEl = video as HTMLVideoElement;
            const sourceEl = video.querySelector("source") as HTMLSourceElement | null;
            const src = videoEl.src || sourceEl?.src;
            if (!src) continue;
            if (!src.includes("cdn.discordapp.com") && !src.includes("media.discordapp.net")) continue;

            const type = inferType(src);
            if (type !== "video") continue;

            items.push({
                url: src,
                type,
                filename: getFilenameFromUrl(src),
                author,
                timestamp,
                source: "video"
            });
        }

        const links = Array.from(element.querySelectorAll("a[href]"));
        for (const link of links) {
            const href = (link as HTMLAnchorElement).href;
            if (!href) continue;
            if (!href.includes("cdn.discordapp.com") && !href.includes("media.discordapp.net")) continue;

            const type = inferType(href);
            if (!type) continue;

            items.push({
                url: href,
                type,
                filename: getFilenameFromUrl(href),
                author,
                timestamp,
                source: "link"
            });
        }
    }

    return uniqueByUrl(items);
}

function removePanel() {
    document.getElementById("vc-dm-media-viewer-overlay")?.remove();
}

function makeButton(label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.onclick = onClick;
    btn.style.padding = "8px 12px";
    btn.style.borderRadius = "8px";
    btn.style.border = "1px solid var(--border-subtle, rgba(255,255,255,0.15))";
    btn.style.background = "var(--background-secondary, #2b2d31)";
    btn.style.color = "var(--text-normal, #fff)";
    btn.style.cursor = "pointer";
    return btn;
}

function renderItems(container: HTMLElement, items: MediaItem[], filter: "all" | "image" | "video", query: string) {
    container.innerHTML = "";

    const filtered = items.filter(item => {
        if (filter !== "all" && item.type !== filter) return false;
        const hay = `${item.filename} ${item.author} ${item.timestamp}`.toLowerCase();
        return hay.includes(query.toLowerCase());
    });

    if (!filtered.length) {
        const empty = document.createElement("div");
        empty.textContent = "No media found in the currently loaded DM messages.";
        empty.style.opacity = "0.8";
        empty.style.padding = "16px 0";
        container.appendChild(empty);
        return;
    }

    const grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "repeat(auto-fill, minmax(220px, 1fr))";
    grid.style.gap = "12px";

    for (const item of filtered) {
        const card = document.createElement("div");
        card.style.border = "1px solid var(--border-subtle, rgba(255,255,255,0.15))";
        card.style.borderRadius = "12px";
        card.style.overflow = "hidden";
        card.style.background = "var(--background-secondary, #2b2d31)";
        card.style.display = "flex";
        card.style.flexDirection = "column";

        if (item.type === "image") {
            const img = document.createElement("img");
            img.src = item.url;
            img.alt = item.filename;
            img.style.width = "100%";
            img.style.height = "180px";
            img.style.objectFit = "cover";
            img.style.display = "block";
            card.appendChild(img);
        } else {
            const video = document.createElement("video");
            video.src = item.url;
            video.controls = true;
            video.preload = "metadata";
            video.style.width = "100%";
            video.style.height = "180px";
            video.style.objectFit = "cover";
            video.style.display = "block";
            card.appendChild(video);
        }

        const body = document.createElement("div");
        body.style.padding = "10px";
        body.style.display = "flex";
        body.style.flexDirection = "column";
        body.style.gap = "6px";

        const filename = document.createElement("div");
        filename.textContent = item.filename;
        filename.style.fontWeight = "700";
        filename.style.wordBreak = "break-word";

        const author = document.createElement("div");
        author.textContent = `By: ${item.author}`;
        author.style.fontSize = "12px";
        author.style.opacity = "0.85";

        const timestamp = document.createElement("div");
        timestamp.textContent = item.timestamp;
        timestamp.style.fontSize = "12px";
        timestamp.style.opacity = "0.85";
        timestamp.style.wordBreak = "break-word";

        const actions = document.createElement("div");
        actions.style.display = "flex";
        actions.style.gap = "8px";
        actions.style.flexWrap = "wrap";

        const openBtn = makeButton("Open", () => window.open(item.url, "_blank", "noopener,noreferrer"));
        const copyBtn = makeButton("Copy URL", async () => {
            try {
                await navigator.clipboard.writeText(item.url);
            } catch {}
        });

        actions.append(openBtn, copyBtn);
        body.append(filename, author, timestamp, actions);
        card.appendChild(body);
        grid.appendChild(card);
    }

    container.appendChild(grid);
}

function openPanel() {
    if (!isProbablyDm()) {
        alert("Open a DM first.");
        return;
    }

    removePanel();

    const items = extractMediaFromDom();
    const channelName = getCurrentChannelName();

    const overlay = document.createElement("div");
    overlay.id = "vc-dm-media-viewer-overlay";
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(0, 0, 0, 0.7)";
    overlay.style.zIndex = "999999";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";

    const panel = document.createElement("div");
    panel.style.width = "min(1200px, 95vw)";
    panel.style.height = "min(85vh, 900px)";
    panel.style.background = "var(--background-primary, #1e1f22)";
    panel.style.color = "var(--text-normal, #fff)";
    panel.style.borderRadius = "16px";
    panel.style.border = "1px solid var(--border-subtle, rgba(255,255,255,0.15))";
    panel.style.display = "flex";
    panel.style.flexDirection = "column";
    panel.style.overflow = "hidden";
    panel.onclick = e => e.stopPropagation();

    overlay.onclick = () => removePanel();

    const header = document.createElement("div");
    header.style.padding = "16px";
    header.style.borderBottom = "1px solid var(--border-subtle, rgba(255,255,255,0.15))";
    header.style.display = "flex";
    header.style.flexDirection = "column";
    header.style.gap = "12px";

    const titleRow = document.createElement("div");
    titleRow.style.display = "flex";
    titleRow.style.justifyContent = "space-between";
    titleRow.style.alignItems = "center";
    titleRow.style.gap = "12px";

    const title = document.createElement("div");
    title.textContent = `DM Media Viewer — ${channelName}`;
    title.style.fontSize = "20px";
    title.style.fontWeight = "700";

    const closeBtn = makeButton("Close", removePanel);
    titleRow.append(title, closeBtn);

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.gap = "8px";
    controls.style.flexWrap = "wrap";
    controls.style.alignItems = "center";

    let currentFilter: "all" | "image" | "video" = "all";
    let currentQuery = "";

    const content = document.createElement("div");
    content.style.padding = "16px";
    content.style.overflow = "auto";
    content.style.flex = "1";

    const info = document.createElement("div");
    info.textContent = "Shows only media currently loaded in chat. Scroll up in the DM first, then reopen for older media.";
    info.style.fontSize = "12px";
    info.style.opacity = "0.8";
    info.style.marginBottom = "12px";

    const search = document.createElement("input");
    search.placeholder = "Search filename / user / time";
    search.value = "";
    search.style.flex = "1";
    search.style.minWidth = "220px";
    search.style.padding = "8px 10px";
    search.style.borderRadius = "8px";
    search.style.border = "1px solid var(--border-subtle, rgba(255,255,255,0.15))";
    search.style.background = "var(--background-tertiary, #111214)";
    search.style.color = "var(--text-normal, #fff)";
    search.oninput = () => {
        currentQuery = search.value;
        renderItems(content, items, currentFilter, currentQuery);
    };

    const allBtn = makeButton(`All (${items.length})`, () => {
        currentFilter = "all";
        renderItems(content, items, currentFilter, currentQuery);
    });

    const imageCount = items.filter(x => x.type === "image").length;
    const videoCount = items.filter(x => x.type === "video").length;

    const imagesBtn = makeButton(`Images (${imageCount})`, () => {
        currentFilter = "image";
        renderItems(content, items, currentFilter, currentQuery);
    });

    const videosBtn = makeButton(`Videos (${videoCount})`, () => {
        currentFilter = "video";
        renderItems(content, items, currentFilter, currentQuery);
    });

    const copyAllBtn = makeButton("Copy URLs", async () => {
        const filtered = items.filter(item => {
            if (currentFilter !== "all" && item.type !== currentFilter) return false;
            const hay = `${item.filename} ${item.author} ${item.timestamp}`.toLowerCase();
            return hay.includes(currentQuery.toLowerCase());
        });

        try {
            await navigator.clipboard.writeText(filtered.map(x => x.url).join("\n"));
        } catch {}
    });

    controls.append(allBtn, imagesBtn, videosBtn, search, copyAllBtn);
    header.append(titleRow, controls);
    panel.append(header);

    const contentWrap = document.createElement("div");
    contentWrap.style.display = "flex";
    contentWrap.style.flexDirection = "column";
    contentWrap.style.flex = "1";
    contentWrap.style.minHeight = "0";

    contentWrap.append(info, content);
    contentWrap.style.padding = "0 16px 16px 16px";
    panel.append(contentWrap);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    renderItems(content, items, currentFilter, currentQuery);
}

function injectButton() {
    const tryInsert = () => {
        const oldBtn = document.getElementById("vc-dm-media-viewer-button");
        if (!isProbablyDm()) {
            oldBtn?.remove();
            return;
        }

        const toolbar = document.querySelector("[class*='toolbar']");
        if (!toolbar || document.getElementById("vc-dm-media-viewer-button")) return;

        const btn = document.createElement("button");
        btn.id = "vc-dm-media-viewer-button";
        btn.textContent = "Media";
        btn.title = "Open DM Media Viewer";
        btn.style.marginLeft = "8px";
        btn.style.padding = "6px 10px";
        btn.style.borderRadius = "8px";
        btn.style.border = "none";
        btn.style.cursor = "pointer";
        btn.style.background = "var(--brand-500, #5865f2)";
        btn.style.color = "white";
        btn.onclick = openPanel;

        toolbar.appendChild(btn);
    };

    tryInsert();

    observer = new MutationObserver(() => tryInsert());
    observer.observe(document.body, { childList: true, subtree: true });
}

function onKeyDown(e: KeyboardEvent) {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "m") {
        e.preventDefault();
        openPanel();
    }

    if (e.key === "Escape") {
        removePanel();
    }
}

export default definePlugin({
    name: "DmMediaViewer",
    description: "Shows a simple gallery of images and videos from the currently open DM.",
    authors: [],

    start() {
        injectButton();
        window.addEventListener("keydown", onKeyDown);
    },

    stop() {
        observer?.disconnect();
        observer = null;
        window.removeEventListener("keydown", onKeyDown);
        document.getElementById("vc-dm-media-viewer-button")?.remove();
        removePanel();
    }
});