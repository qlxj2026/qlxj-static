// ---------- banner slideshow ----------
document.addEventListener("DOMContentLoaded", function () {
    const banner = document.getElementById("banner");
    if (!banner) return;
    const items = banner.querySelectorAll(".banner-item");
    const dots = banner.querySelectorAll(".banner-dot");
    const INTERVAL = 3000;
    let current = 0;
    let timer = null;

    function show(index) {
        current = (index + items.length) % items.length;
        items.forEach((item, i) => item.classList.toggle("is-active", i === current));
        dots.forEach((dot, i) => dot.classList.toggle("is-active", i === current));
    }

    function play() {
        stop();
        timer = setInterval(() => show(current + 1), INTERVAL);
    }

    function stop() {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
    }

    dots.forEach((dot, i) => {
        dot.addEventListener("click", () => {
            show(i);
            play();
        });
    });

    banner.addEventListener("mouseenter", stop);
    banner.addEventListener("mouseleave", play);

    play();
});

