import definePlugin from "@utils/types";

let observer: MutationObserver | null = null;

type MediaType = "image" | "video" | "file";

type MediaItem = {
    url: string;
    type: MediaType;
    filename: string;
};

function isDM() {
    return /\/channels\/@me\//.test(window.location.pathname);
}

function getType(url: string): MediaType | null {
    url = url.toLowerCase();

    if (url.match(/\.(png|jpg|jpeg|gif|webp)/)) return "image";
    if (url.match(/\.(mp4|webm|mov)/)) return "video";
    if (url.includes("attachments")) return "file";

    return null;
}

function getAllMedia(): MediaItem[] {
    const items: MediaItem[] = [];

    document.querySelectorAll("a[href]").forEach(a => {
        const url = (a as HTMLAnchorElement).href;
        if (!url.includes("cdn.discordapp")) return;

        const type = getType(url);
        if (!type) return;

        items.push({
            url,
            type,
            filename: url.split("/").pop() || "file"
        });
    });

    return items;
}

function removeUI() {
    document.getElementById("media-viewer")?.remove();
}

function openUI() {
    if (!isDM()) return alert("افتح DM");

    removeUI();

    const data = getAllMedia();

    let filter: "all" | "image" | "video" | "file" = "all";

    const div = document.createElement("div");
    div.id = "media-viewer";
    div.style.position = "fixed";
    div.style.inset = "0";
    div.style.background = "rgba(0,0,0,0.8)";
    div.style.zIndex = "999999";
    div.style.overflow = "auto";
    div.style.padding = "20px";

    function render() {
        div.innerHTML = "";

        const close = document.createElement("button");
        close.textContent = "Close";
        close.onclick = removeUI;

        const all = document.createElement("button");
        all.textContent = "has:all";
        all.onclick = () => { filter = "all"; render(); };

        const img = document.createElement("button");
        img.textContent = "has:image";
        img.onclick = () => { filter = "image"; render(); };

        const vid = document.createElement("button");
        vid.textContent = "has:video";
        vid.onclick = () => { filter = "video"; render(); };

        const file = document.createElement("button");
        file.textContent = "has:file";
        file.onclick = () => { filter = "file"; render(); };

        div.append(close, all, img, vid, file);

        const grid = document.createElement("div");
        grid.style.display = "grid";
        grid.style.gridTemplateColumns = "repeat(auto-fill,200px)";
        grid.style.gap = "10px";
        grid.style.marginTop = "20px";

        data
            .filter(x => filter === "all" || x.type === filter)
            .forEach(item => {
                const box = document.createElement("div");

                if (item.type === "image") {
                    const i = document.createElement("img");
                    i.src = item.url;
                    i.style.width = "100%";
                    box.appendChild(i);
                } else if (item.type === "video") {
                    const v = document.createElement("video");
                    v.src = item.url;
                    v.controls = true;
                    v.style.width = "100%";
                    box.appendChild(v);
                } else {
                    const a = document.createElement("a");
                    a.href = item.url;
                    a.textContent = item.filename;
                    a.target = "_blank";
                    box.appendChild(a);
                }

                grid.appendChild(box);
            });

        div.appendChild(grid);
    }

    render();
    document.body.appendChild(div);
}

function inject() {
    const btn = document.createElement("button");
    btn.textContent = "Media";
    btn.onclick = openUI;

    const toolbar = document.querySelector("[class*='toolbar']");
    if (toolbar && !document.getElementById("media-btn")) {
        btn.id = "media-btn";
        toolbar.appendChild(btn);
    }
}

export default definePlugin({
    name: "MediaViewer",
    description: "View images/videos/files in DM",
    authors: [],

    start() {
        inject();
        observer = new MutationObserver(inject);
        observer.observe(document.body, { childList: true, subtree: true });
    },

    stop() {
        observer?.disconnect();
        removeUI();
        document.getElementById("media-btn")?.remove();
    }
});