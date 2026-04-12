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

function runSearchTag(tag: string) {
    // افتح البحث
    document.dispatchEvent(new KeyboardEvent("keydown", {
        key: "f",
        code: "KeyF",
        ctrlKey: true,
        bubbles: true
    }));

    setTimeout(() => {
        // حاول تجيب input الصح
        let input = document.querySelector("[class*='search'] input") as HTMLInputElement;

        if (!input) {
            input = document.querySelector("input[type='text']") as HTMLInputElement;
        }

        if (!input) return;

        input.focus();

        // اكتب الكلمة
        input.value = tag;

        // فعل التحديث
        input.dispatchEvent(new Event("input", { bubbles: true }));

    }, 150);
}

function makeButton(id: string, text: string): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.id = id;
    btn.textContent = text;
    btn.onclick = () => runSearchTag(text);

    btn.style.marginLeft = "8px";
    btn.style.padding = "6px 12px";
    btn.style.borderRadius = "12px";
    btn.style.border = "none";
    btn.style.cursor = "pointer";
    btn.style.background = "#5865F2";
    btn.style.color = "white";
    btn.style.fontSize = "12px";

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
        toolbar.appendChild(makeButton("vc-dm-search-image", "has:image"));
    }

    if (!document.getElementById("vc-dm-search-video")) {
        toolbar.appendChild(makeButton("vc-dm-search-video", "has:video"));
    }

    if (!document.getElementById("vc-dm-search-file")) {
        toolbar.appendChild(makeButton("vc-dm-search-file", "has:file"));
    }
}

export default definePlugin({
    name: "DmMediaSearch",
    description: "Search buttons for has:image, has:video, has:file",
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