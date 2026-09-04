// compact live strip only — full charts live on the sysinfo page
  function fmtBytes(n, suffix) {
    if (n == null || isNaN(n)) return '--';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0, v = n;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return v.toFixed(v >= 100 || i === 0 ? 0 : 1) + ' ' + units[i] + (suffix || '');
  }

  function fmtUptime(sec) {
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (d > 0) return `${d}天 ${h}时`;
    if (h > 0) return `${h}时 ${m}分`;
    return `${m}分`;
  }

  let lastNetSample = null;
  let miniPollTimer = null;   // setInterval handle; null while paused

  function fetchMiniStatus() {
    fetch('/api/sysinfo/status')
      .then(r => r.json())
      .then(data => {
        const now = Date.now();
        document.getElementById('mini-cpu').textContent = data.cpu_percent.toFixed(1) + '%';
        document.getElementById('mini-mem').textContent = data.memory.percent.toFixed(1) + '%';
        document.getElementById('mini-disk').textContent = data.disk.percent.toFixed(1) + '%';

        if (lastNetSample) {
          const dt = (now - lastNetSample.t) / 1000;
          if (dt > 0) {
            document.getElementById('mini-net-recv').textContent =
              fmtBytes(Math.max(0, (data.net_io.bytes_recv - lastNetSample.recv) / dt), '/s');
            document.getElementById('mini-net-sent').textContent =
              fmtBytes(Math.max(0, (data.net_io.bytes_sent - lastNetSample.sent) / dt), '/s');
          }
        }
        lastNetSample = { t: now, recv: data.net_io.bytes_recv, sent: data.net_io.bytes_sent };

        document.getElementById('mini-uptime').textContent = fmtUptime(data.uptime);
      })
      .catch(err => {
        console.error('Error to fetch Data: ', err);
        const dot = document.getElementById('sysinfo-live-dot');
        if (dot) {
          dot.classList.remove('text-bg-success');
          dot.classList.add('text-bg-secondary');
          dot.textContent = '● 离线';
        }
      });
  }

  function startMiniPolling() {
    if (miniPollTimer !== null) return;
    fetchMiniStatus();
    miniPollTimer = setInterval(fetchMiniStatus, 2000);
  }

  function stopMiniPolling() {
    if (miniPollTimer !== null) {
      clearInterval(miniPollTimer);
      miniPollTimer = null;
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    // poll only while the page is visible: pause the API when the user
    // switches to another browser tab or window; on return, reset the
    // network baseline so the paused time doesn't show as a traffic spike
    if (!document.hidden) startMiniPolling();

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        stopMiniPolling();
      } else {
        lastNetSample = null;
        startMiniPolling();
      }
    });
  });
