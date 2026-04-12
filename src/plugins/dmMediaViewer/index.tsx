import {
    React,
    useMemo,
    useState,
    Forms,
    ModalRoot,
    ModalContent,
    ModalHeader,
    ModalCloseButton,
    openModal
} from "@webpack/common";
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

function getCurrentChannelName(): string {
    const title = document.title || "Discord";
    return title.replace(/ \| Discord$/i, "").trim();
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
                source: "message-image"
            });
        }

        const vids = Array.from(element.querySelectorAll("video"));
        for (const video of vids) {
            const src = (video as HTMLVideoElement).src || (video.querySelector("source") as HTMLSourceElement | null)?.src;
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
                source: "message-video"
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
                source: "attachment-link"
            });
        }
    }

    return uniqueByUrl(items);
}

function isProbablyDm(): boolean {
    return /\/channels\/@me\//.test(window.location.pathname);
}

type GalleryModalProps = {
    onClose: () => void;
    items: MediaItem[];
    channelName: string;
};

function GalleryModal({ onClose, items, channelName }: GalleryModalProps) {
    const [tab, setTab] = useState<"all" | "image" | "video">("all");
    const [query, setQuery] = useState("");

    const filtered = useMemo(() => {
        return items.filter(item => {
            if (tab !== "all" && item.type !== tab) return false;

            const hay = `${item.filename} ${item.author} ${item.timestamp}`.toLowerCase();
            return hay.includes(query.toLowerCase());
        });
    }, [items, query, tab]);

    const imageCount = items.filter(x => x.type === "image").length;
    const videoCount = items.filter(x => x.type === "video").length;

    return (
        <ModalRoot size="large">
            <ModalHeader separator={false}>
                <Forms.FormTitle tag="h2">DM Media Viewer — {channelName}</Forms.FormTitle>
                <ModalCloseButton onClick={onClose} />
            </ModalHeader>

            <ModalContent>
                <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <button onClick={() => setTab("all")}>All ({items.length})</button>
                    <button onClick={() => setTab("image")}>Images ({imageCount})</button>
                    <button onClick={() => setTab("video")}>Videos ({videoCount})</button>
                    <input
                        value={query}
                        onChange={e => setQuery((e.target as HTMLInputElement).value)}
                        placeholder="Search filename / user / time"
                        style={{ flex: 1, minWidth: 220, padding: "8px 10px" }}
                    />
                    <button onClick={() => navigator.clipboard.writeText(filtered.map(x => x.url).join("\n"))}>
                        Copy URLs
                    </button>
                </div>

                <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 12 }}>
                    This only shows media currently loaded in the chat. Scroll up in the DM first, then reopen the viewer to collect older media.
                </div>

                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                        gap: 12,
                        paddingBottom: 12
                    }}
                >
                    {filtered.map((item, index) => (
                        <div
                            key={`${item.url}-${index}`}
                            style={{
                                border: "1px solid var(--border-subtle)",
                                borderRadius: 12,
                                overflow: "hidden",
                                background: "var(--background-secondary)",
                                display: "flex",
                                flexDirection: "column"
                            }}
                        >
                            <a href={item.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                                {item.type === "image" ? (
                                    <img
                                        src={item.url}
                                        alt={item.filename}
                                        style={{ width: "100%", height: 180, objectFit: "cover", display: "block" }}
                                    />
                                ) : (
                                    <video
                                        src={item.url}
                                        controls
                                        preload="metadata"
                                        style={{ width: "100%", height: 180, objectFit: "cover", display: "block" }}
                                    />
                                )}
                            </a>

                            <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                                <div style={{ fontWeight: 700, wordBreak: "break-word" }}>{item.filename}</div>
                                <div style={{ fontSize: 12, opacity: 0.85 }}>By: {item.author}</div>
                                <div style={{ fontSize: 12, opacity: 0.85, wordBreak: "break-word" }}>{item.timestamp}</div>
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                    <button onClick={() => window.open(item.url, "_blank", "noopener,noreferrer")}>Open</button>
                                    <button onClick={() => navigator.clipboard.writeText(item.url)}>Copy URL</button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {!filtered.length && (
                    <div style={{ padding: 20, opacity: 0.8 }}>
                        No media found in the currently loaded DM messages.
                    </div>
                )}
            </ModalContent>
        </ModalRoot>
    );
}

function openGallery() {
    if (!isProbablyDm()) {
        alert("Open a DM first, then run DM Media Viewer.");
        return;
    }

    const items = extractMediaFromDom();
    const channelName = getCurrentChannelName() || "DM";

    openModal(props => (
        <GalleryModal
            onClose={props.onClose}
            items={items}
            channelName={channelName}
        />
    ));
}

function injectButton() {
    const tryInsert = () => {
        if (!isProbablyDm()) return;

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
        btn.onclick = openGallery;

        toolbar.appendChild(btn);
    };

    tryInsert();

    const observer = new MutationObserver(() => tryInsert());
    observer.observe(document.body, { childList: true, subtree: true });

    return observer;
}

const plugin = definePlugin({
    name: "DmMediaViewer",
    description: "Shows a simple gallery of images and videos from the currently open DM.",
    authors: [{ name: "OpenAI", id: 0n }],

    observer: undefined as MutationObserver | undefined,

    onKeyDown(e: KeyboardEvent) {
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "m") {
            e.preventDefault();
            openGallery();
        }
    },

    start() {
        this.observer = injectButton();
        window.addEventListener("keydown", this.onKeyDown);
    },

    stop() {
        document.getElementById("vc-dm-media-viewer-button")?.remove();
        this.observer?.disconnect();
        window.removeEventListener("keydown", this.onKeyDown);
    }
});

export default plugin;