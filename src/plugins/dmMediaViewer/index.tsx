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

function setReactInputValue(input: HTMLInputElement, value: string) {
    const prototype = Object.getPrototypeOf(input);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    const setter = descriptor?.set;

    if (setter) {
        setter.call(input, value);
    } else {
        input.value = value;
    }

    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
}

function findSearchInput(): HTMLInputElement | null {
    const selectors = [
        "input[aria-label*='Search']",
        "input[aria-label*='search']",
        "[class*='search'] input",
        "input[type='text']"
    ];

    for (const selector of selectors) {
        const el = document.querySelector(selector) as HTMLInputElement | null;
        if (el) return el;
    }

    return null;
}

function openSearchAndWrite(tag: string) {
    document.dispatchEvent(new KeyboardEvent("keydown", {
        key: "f",
        code: "KeyF",
        ctrlKey: true,
        bubbles: true
    }));

    let attempts = 0;
    const maxAttempts = 20;

    const timer = window.setInterval(() => {
        attempts++;

        const input = findSearchInput();
        if (!input) {
            if (attempts >= maxAttempts) clearInterval(timer);
            return;
        }

        input.focus();
        setReactInputValue(input, tag);

        clearInterval(timer);
    }, 100);
}

function makeButton(id: string, text: string): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.id = id;
    btn.textContent = text;
    btn.onclick = () => openSearchAndWrite(text);

    btn.style.marginLeft = "8px";
    btn.style.padding = "6px 12px";
    btn.style.borderRadius = "12px";
    btn.style.border = "none";
    btn.style.cursor = "pointer";
    btn.style.background = "#5865F2";
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
    description: "Adds DM search buttons for has:image, has:video, and has:file.",
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