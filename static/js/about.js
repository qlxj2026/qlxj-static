/* 关于页脚本：特性卡片滚动入场动效。
   先给 <html> 加 .js 再观察视口，因此 CSS 只在 .js 存在时隐藏卡片；
   无 JS / 不支持 IntersectionObserver 时内容保持完全可见（渐进增强）。 */
(function () {
    'use strict';

    var root = document.documentElement;
    var features = document.querySelectorAll('.feature-grid .feature');
    if (features.length === 0) {
        return;
    }

    root.classList.add('js');

    if (!('IntersectionObserver' in window)) {
        for (var i = 0; i < features.length; i++) {
            features[i].classList.add('in');
        }
        return;
    }

    var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add('in');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.12 });

    for (var j = 0; j < features.length; j++) {
        observer.observe(features[j]);
    }
})();
