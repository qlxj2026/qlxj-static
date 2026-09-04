document.addEventListener("DOMContentLoaded", function () {
    const cards = document.querySelectorAll(".card");
    cards.forEach((card, index) => {
        card.style.opacity = "0";
        card.style.transform = "translateY(12px)";
        setTimeout(() => {
            card.style.transition = "all 0.4s cubic-bezier(0.1, 0.9, 0.2, 1)";
            card.style.opacity = "1";
            card.style.transform = "translateY(0)";
        }, 100 + (index * 60));
    });

    // Fluent 导航激活指示：按当前路径给匹配的 nav-link 加 active（样式见 main.css）
    document.querySelectorAll(".navbar .nav-link").forEach((link) => {
        const href = link.getAttribute("href");
        if (!href || href === "#") return;
        const matched = href === "/" ? location.pathname === "/" : location.pathname.startsWith(href);
        if (matched) link.classList.add("active");
    });

    // 多级下拉子菜单（导航「动态 / 资源」：分类 → 年份团队，见 main.css「多级下拉」段）。
    // 子菜单切换器不带 data-bs-toggle，桌面端由纯 CSS :hover 弹出。但它们在嵌套菜单里同时又是
    // .dropdown-item，Bootstrap 的 autoClose 会在点击时把外层菜单收起来；触屏端没有 :hover，
    // 一分类项就永远打不开年份子菜单。
    // 这里在捕获阶段拦截触屏点击：preventDefault + stopPropagation，避免外层菜单被收起，
    // 同时切换兄弟子菜单的 .show（移动端由 main.css 的 .show 规则展开）。桌面端保留纯 hover 行为。
    document.addEventListener(
        "click",
        function (e) {
            const toggle = e.target.closest(".dropdown-menu .dropdown > .dropdown-toggle");
            if (!toggle) return;
            // 桌面端有 hover，交给 CSS 处理即可，避免键盘/触屏行为冲突
            if (window.matchMedia("(hover: hover)").matches) return;
            e.preventDefault();
            e.stopPropagation();
            const sub = toggle.parentElement.querySelector(":scope > .dropdown-menu");
            if (!sub) return;
            const open = sub.classList.toggle("show");
            toggle.setAttribute("aria-expanded", open ? "true" : "false");
        },
        true,
    );
});
