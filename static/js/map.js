
// ---------- team distribution map (AMap) ----------
// AMap app key / proxy-or-secret marker are rendered by the template as
// data attributes on #map-container (static js cannot contain Jinja).
(function () {
    const container = document.getElementById("map-container");
    if (!container) return;

    // AMap SDK 内部对 2D canvas 频繁调用 getImageData，Chrome 会提示性能问题。
    // 在 SDK 创建 canvas 上下文前注入 willReadFrequently，让它走 CPU 侧读回，消除该警告。
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (contextType, ...args) {
        if (contextType === "2d") {
            const options = { willReadFrequently: true, ...(args[0] ?? {}) };
            return originalGetContext.call(this, contextType, options);
        }
        return originalGetContext.call(this, contextType, ...args);
    };

    // must be set before the AMap loader runs
    // 两种模式由模板的 data-* 属性决定(静态 JS 不能内嵌 Jinja):
    //  1) 代理模式 (data-amap-use-proxy="1", 生产环境推荐): 页面不再携带
    //     securityJsCode, 相关请求改走同源 /_AMapService/*, 由 nginx 在服务端
    //     补 jscode(安全密钥只存在于服务器)。
    //     参考: https://lbs.amap.com/api/javascript-api-v2/guide/abc/jscode
    //  2) 直连模式 (无 data-amap-use-proxy, 本地开发无 nginx 时):
    //     将 securityJsCode 明文写入页面。
    window._AMapSecurityConfig = container.dataset.amapUseProxy
        ? { serviceHost: location.origin + "/_AMapService" }
        : { securityJsCode: container.dataset.amapSecurityCode };

    // type -> fill color, must stay in sync with the legend in index.html
    const TYPE_COLORS = {
        "prepare": "#f59e0b", // planning · 筹备中
        "to do": "#2563eb",   // working · 待进行
        "done": "#10b981",    // done · 已完成
    };
    const FALLBACK_COLOR = "#64748b";

    // backend renders marker data into a <script type="application/json"> tag
    function readPositions() {
        const el = document.getElementById("positions-data");
        if (!el) return [];
        try {
            return JSON.parse(el.textContent || "[]");
        } catch (err) {
            console.error("failed to parse positions data: ", err);
            return [];
        }
    }

    // marker names / team names come from the DB; escape before putting them
    // into InfoWindow HTML to avoid XSS
    function escapeHtml(s) {
        return String(s)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
    }

    function createMarker(AMap, map, pos) {
        const marker = new AMap.CircleMarker({
            center: new AMap.LngLat(pos.longitude, pos.latitude),
            radius: 8,
            strokeColor: "white",
            strokeOpacity: 0.5,
            fillColor: TYPE_COLORS[pos.type] || FALLBACK_COLOR,
            zIndex: 10,
            cursor: "pointer"
        });

        const teams = (pos.team_names || []).map(escapeHtml).join("、") || "—";
        const content =
            '<div class="map-info">' +
            "<strong>" + escapeHtml(pos.name) + "</strong><br>" +
            '<span class="map-info-type">' + escapeHtml(pos.type_desc || pos.type) + "</span><br>" +
            "<small>团队：" + teams + "</small>" +
            "</div>";

        const infoWindow = new AMap.InfoWindow({
            content,
            offset: new AMap.Pixel(0, -12),
            autoMove: true
        });
        marker.on("click", () => infoWindow.open(map, marker.getCenter()));

        return marker;
    }

    // inject the loader so it only executes after the security config above
    const loader = document.createElement("script");
    loader.src = "https://webapi.amap.com/loader.js";
    loader.onload = () => {
        AMapLoader.load({
            key: container.dataset.amapKey,
            version: "2.0"
        })
            .then((AMap) => {
                const map = new AMap.Map("map-container", {
                    viewMode: "2D"
                });

                // 标记点数据由后端通过 <script type="application/json"> 内嵌，
                // 静态 JS 无法直接使用 Jinja，所以从 DOM 读取解析
                const positions = readPositions();
                const markers = positions.map((pos) => createMarker(AMap, map, pos));
                map.add(markers);

                // 有标记时自动缩放到全部标记；空数据保持默认全国视野
                if (markers.length > 0) {
                    map.setFitView(markers, false, [60, 60, 60, 60]);
                }
            })
            .catch((err) => {
                console.error("failed to load map: ", err)
            });
    };
    document.head.appendChild(loader);
})();