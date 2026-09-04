const toolbarOptions = [
        [{ "font": [] }],
        [{ "header": [1, 2, 3, 4, 5, 6, false] }],
        ["bold", "italic", "underline", "strike"],
        ["blockquote", "code-block"],
        ["link", "image", "video", "formula", "bilibili"],
        [{ "script": "sub" }, { "script": "super" }],
        [{ "indent": "-1" }, { "indent": "+1" }],
        [{ "color": [] }, { "background": [] }],
        [{ "align": [] }]
    ];

    // adapted from demo/video/bili-embed.js (updated: no ES export, highQuality
    // flag no longer inverted, wrapper uses a responsive 16:9 box)
    function getBilibiliEmbedCode(url, options = {}) {
        const bvidMatch = url.match(/BV[a-zA-Z0-9]+/);
        if (!bvidMatch) {
            throw new Error("invalid bilibili video url: no BV id found");
        }
        const bvid = bvidMatch[0];

        const poster = options.poster ? 1 : 0;
        const page = options.page || 1;
        const highQuality = options.highQuality === false ? 0 : 1;
        const autoplay = options.autoplay !== undefined ? (options.autoplay ? "true" : "false") : 0;
        const muted = options.muted ? "true" : "false";
        const hasMutedBtn = options.hasMutedBtn ? 1 : 0;
        const danmaku = options.danmaku !== undefined ? (options.danmaku ? 1 : 0) : 0;
        const noFullScreenBtn = options.noFullScreenBtn ? 1 : 0;
        const rememberPlayPos = options.rememberPlayPos ? 1 : 0;
        const t = options.t || 0;

        const src =
            `https://player.bilibili.com/player.html?isOutside=true&bvid=${bvid}&page=${page}&highQuality=${highQuality}&autoplay=${autoplay}&muted=${muted}&hasMutedButton=${hasMutedBtn}&danmaku=${danmaku}&noFullScreenButton=${noFullScreenBtn}&fjw=${rememberPlayPos}&poster=${poster}&t=${t}`;
        const code = `<div style="position: relative; width: 100%; height: 0; padding-bottom: 56.25%;">
<iframe style="position: absolute; width: 100%; height: 100%; left: 0; top: 0;" src="${src}" frameborder="no" scrolling="no" allowfullscreen="true"></iframe>
</div>`;
        return code;
    }

    // embed blot so the iframe round-trips through the editor's delta/HTML.
    // must be registered BEFORE new Quill(): the toolbar builds at construction
    // and ignores buttons whose format is unknown at that point
    const BlockEmbed = Quill.import("blots/block/embed");

    class BilibiliEmbed extends BlockEmbed {
        static blotName = "bilibili";
        static tagName = "div";
        static className = "bilibili-video-embed";

        static create(url) {
            const node = super.create();
            node.dataset.bvid = url.match(/BV[a-zA-Z0-9]+/)[0];
            node.innerHTML = getBilibiliEmbedCode(url);
            return node;
        }

        static value(node) {
            return node.dataset.bvid
                ? `https://www.bilibili.com/video/${node.dataset.bvid}`
                : "";
        }
    }
    Quill.register(BilibiliEmbed);

    const quill = new Quill("#editor-container", {
        modules: {
            toolbar: toolbarOptions
        },
        placeholder: "please write something here.",
        theme: "snow"
    });

    const toolbar = quill.getModule("toolbar");
    toolbar.addHandler("bilibili", function () {
        const url = prompt("paste a bilibili video url (e.g. https://www.bilibili.com/video/BVxxxx):");
        if (!url) return;
        try {
            getBilibiliEmbedCode(url); // validate before inserting
        } catch (err) {
            alert("could not embed video: " + err.message);
            return;
        }
        const range = quill.getSelection(true);
        quill.insertEmbed(range.index, "bilibili", url, Quill.sources.USER);
        quill.setSelection(range.index + 1);
    });

    const form = document.getElementById("submit_text");
    const hiddenField = document.getElementById("hiddenContent");

    form.addEventListener("submit", function (e) {
        e.preventDefault();
        hiddenField.value = quill.getSemanticHTML(0);
        if (!hiddenField.value.trim()) {
            alert("cannot submit empty text");
            return;
        }
        form.submit();
    });
