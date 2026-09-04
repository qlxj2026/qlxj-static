// support for mermaid
// from https://github.com/trentm/python-markdown2/wiki/mermaid
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@9/dist/mermaid.esm.min.mjs';
import * as pdfjsLib from "https://unpkg.com/pdfjs-dist@6.2.108/build/pdf.min.mjs";

mermaid.initialize({
    securityLevel: 'strict',
    startOnLoad: true
});
let observer = new MutationObserver(mutations => {
    for (let mutation of mutations) {
        mutation.target.style.visibility = "visible";
    }
});
document.querySelectorAll("pre.mermaid-pre div.mermaid").forEach(item => {
    observer.observe(item, {
        attributes: true,
        attributeFilter: ['data-processed']
    });
});

// support of other post types (only download is supported as we cannot render them)
async function downloadFile(fileUrl) {
    try {

        presigned_url = fileUrl;

        const link = document.createElement("a");
        link.href = presigned_url;
        // link.download = data.filename;

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (err) {
        console.error("Download fialed:", err);
        alert("Unable to download the file");
    }
}
const btn = document.getElementById("download-btn")
if (btn !== null) {
    btn.addEventListener("click", function () {
        const fileUrl = this.dataset.fileUrl;
        downloadFile(fileUrl);
    });
}

// ---------- pdf viewer ----------
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://unpkg.com/pdfjs-dist@6.2.108/build/pdf.worker.min.mjs";

// Cap the backing-store resolution: on phones with dpr=3+ rendering at
// full device ratio triples canvas memory for no visible improvement.
const MAX_DPR = 2;
// A cheap low-res pass fills the slot immediately, then the sharp pass
// replaces it.
const LOW_RES_DOWNSCALE = 0.5;
// Start rendering pages slightly before they scroll into view.
const PRE_RENDER_MARGIN = "600px 0px";
// Drop a page's canvas once it is well out of view; a large PDF cannot
// keep every page rasterized in memory.
const UNLOAD_MARGIN = "2000px 0px";
const MAX_CONCURRENT_RENDERS = 2;

function renderToCanvas(page, canvas, scale, outputScale) {
    const viewport = page.getViewport({ scale });
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    return page.render({
        canvasContext: ctx,
        viewport,
        // draw into the oversized backing store at device resolution
        transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null,
    });
}

const fmtMB = b => (b / 1048576).toFixed(1) + " MB";

function setupViewer(elem) {
    const loading = elem.querySelector("#loading");
    const slots = new Map();        // page number -> placeholder element
    const renderTasks = new Map();  // page number -> in-flight render task
    const rendered = new Set();     // page numbers that have a canvas on screen
    const queue = [];               // page numbers waiting to render
    let activeRenders = 0;
    let pdf = null;
    let baseScale = 1;              // scale that fits one page to the viewer width

    const renderIO = new IntersectionObserver(entries => {
        for (const e of entries) {
            if (e.isIntersecting) enqueue(+e.target.dataset.page);
        }
    }, { rootMargin: PRE_RENDER_MARGIN });

    const unloadIO = new IntersectionObserver(entries => {
        for (const e of entries) {
            if (!e.isIntersecting) unload(+e.target.dataset.page);
        }
    }, { rootMargin: UNLOAD_MARGIN });

    function enqueue(num) {
        if (rendered.has(num) || queue.includes(num)) return;
        queue.push(num);
        pump();
    }

    async function pump() {
        if (activeRenders >= MAX_CONCURRENT_RENDERS || queue.length === 0) return;
        const num = queue.shift();
        const slot = slots.get(num);
        if (!slot) return pump();
        activeRenders++;
        try {
            await renderPage(num, slot);
        } catch (err) {
            if (err?.name !== "RenderingCancelledException") {
                console.error(`failed to render page ${num}:`, err);
            }
        } finally {
            activeRenders--;
            pump();
        }
    }

    async function renderPage(num, slot) {
        const page = await pdf.getPage(num);

        // low-res pass: shows up fast while the sharp pass renders
        const low = document.createElement("canvas");
        const lowTask = renderToCanvas(page, low, baseScale * LOW_RES_DOWNSCALE, 1);
        renderTasks.set(num, lowTask);
        await lowTask.promise;
        slot.replaceChildren(low);
        rendered.add(num);

        // sharp pass at device resolution
        const high = document.createElement("canvas");
        const highTask = renderToCanvas(page, high, baseScale, Math.min(window.devicePixelRatio || 1, MAX_DPR));
        renderTasks.set(num, highTask);
        try {
            await highTask.promise;
            slot.replaceChildren(high);
        } catch (err) {
            if (err?.name === "RenderingCancelledException") {
                // keep the low-res canvas already on screen
            } else {
                throw err;
            }
        } finally {
            renderTasks.delete(num);
            page.cleanup();
        }
    }

    function unload(num) {
        const i = queue.indexOf(num);
        if (i !== -1) queue.splice(i, 1);
        renderTasks.get(num)?.cancel();
        renderTasks.delete(num);

        const slot = slots.get(num);
        if (slot?.firstChild) {
            slot.replaceChildren();
            rendered.delete(num);
            pdf.getPage(num).then(p => p.cleanup()).catch(() => {});
        }
    }

    async function init() {
        try {
            const loadingTask = pdfjsLib.getDocument({
                url: elem.dataset.url,
                rangeChunkSize: 262144, // 256KB: stream a big PDF instead of fetching it whole
                disableAutoFetch: true, // only fetch the byte ranges pages actually need
            });
            // show download progress; with working range/stream support the
            // first pages render while this is still counting up
            loadingTask.onProgress = ({ loaded, total }) => {
                if (!loading) return;
                let p = loading.querySelector(".loading-progress");
                if (!p) {
                    p = document.createElement("p");
                    p.className = "loading-progress";
                    loading.appendChild(p);
                }
                p.textContent = total > 0
                    ? `${fmtMB(loaded)} / ${fmtMB(total)}`
                    : fmtMB(loaded);
                // p.textContent = "loading";
            };
            pdf = await loadingTask.promise;

            const first = await pdf.getPage(1);
            const viewport = first.getViewport({ scale: 1 });
            baseScale = elem.clientWidth / viewport.width;

            const frag = document.createDocumentFragment();
            for (let i = 1; i <= pdf.numPages; i++) {
                const slot = document.createElement("div");
                slot.className = "pdf-page-wrapper";
                slot.dataset.page = i;
                // reserve the page height up front so the scrollbar does not jump
                slot.style.minHeight = Math.floor(viewport.height * baseScale) + "px";
                frag.appendChild(slot);
                slots.set(i, slot);
            }
            loading?.remove();
            elem.appendChild(frag);

            for (const slot of slots.values()) {
                renderIO.observe(slot);
                unloadIO.observe(slot);
            }
            first.cleanup();
        } catch (err) {
            console.error("failed to load pdf:", err);
            if (loading) {
                loading.innerHTML = `
                    <div class="alert alert-danger" role="alert">
                        ⚠ failed to load pdf, please check whether the url is valid or contact the admin
                    </div>
                    `;
            }
        }
    }

    init();
}

function initPdfViewers() {
    document.querySelectorAll(".pdf-viewer").forEach(setupViewer);
}

// module scripts run deferred, after the document is parsed
initPdfViewers();
