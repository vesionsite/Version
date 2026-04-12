import definePlugin from "@utils/types";

let observer: MutationObserver | null = null;

function isDM(): boolean {
    return /\/channels\/@me\//.test(window.location.pathname);
}

function removeButtons() {
    document.getElementById("vc-dm-search-image")?.remove();
    document.getElementById("vc-dm-search-video")?.remove();
    document.getElementById("vc-dm-search-file")?.remove();
}

async function runSearchTag(tag: string) {
    try {
        await navigator.clipboard.writeText(tag);
    } catch {}
}

function makeButton(id: string, text: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.id = id;
    btn.textContent = text;
    btn.title = `Copy ${text}`;
    btn.onclick = onClick;

    btn.style.marginLeft = "8px";
    btn.style.padding = "6px 10px";
    btn.style.borderRadius = "8px";
    btn.style.border = "none";
    btn.style.cursor = "pointer";
    btn.style.background = "var(--brand-500, #5865f2)";
    btn.style.color = "white";
    btn.style.fontSize = "12px";
    btn.style.fontWeight = "600";

    return btn;
}

function injectButtons() {
    const toolbar = document.querySelector("[class*='toolbar']");
    if (!toolbar) return;

    if (!isDM()) {
        removeButtons();
        return;
    }

    if (!document.getElementById("vc-dm-search-image")) {
        toolbar.appendChild(
            makeButton("vc-dm-search-image", "has:image", () => runSearchTag("has:image"))
        );
    }

    if (!document.getElementById("vc-dm-search-video")) {
        toolbar.appendChild(
            makeButton("vc-dm-search-video", "has:video", () => runSearchTag("has:video"))
        );
    }

    if (!document.getElementById("vc-dm-search-file")) {
        toolbar.appendChild(
            makeButton("vc-dm-search-file", "has:file", () => runSearchTag("has:file"))
        );
    }
}

export default definePlugin({
    name: "DmMediaSearch",
    description: "Adds DM search buttons that copy has:image, has:video, and has:file.",
    authors: [],

    start() {
        injectButtons();

        observer = new MutationObserver(() => {
            injectButtons();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    },

    stop() {
        observer?.disconnect();
        observer = null;
        removeButtons();
    }
});