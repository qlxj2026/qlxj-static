const HISTORY_LEN = 20;   // points kept per chart
  const POLL_MS = 2000;     // server caches sysinfo for 2s

  let chart_cpu = null, chart_mem = null, chart_net = null, chart_disk = null;
  let lastNetSample = null;   // { t, sent, recv } for rate computation
  let diskInitialized = false;
  let pollTimer = null;       // setInterval handle; null while paused

  // ---- formatters ----
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

  function nowLabel() { return new Date().toLocaleTimeString('zh-CN', { hour12: false }); }

  // ---- line chart factory ----
  const baseLineOptions = (yMax, yUnit) => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    elements: { point: { radius: 0 } },
    scales: {
      x: { ticks: { maxTicksLimit: 6 }, grid: { display: false } },
      y: {
        beginAtZero: true,
        max: yMax,
        ticks: {
          maxTicksLimit: 6,
          callback: (v) => yUnit ? fmtBytes(v, '/s') : v
        }
      }
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (item) => item.dataset.label + ': ' +
            (yUnit ? fmtBytes(item.parsed.y, '/s') : item.parsed.y.toFixed(1) + '%')
        }
      }
    }
  });

  function makeLineChart(canvasId, datasets, yMax, yUnit) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;
    return new Chart(ctx, {
      type: 'line',
      data: { labels: [], datasets },
      options: baseLineOptions(yMax, yUnit),
    });
  }

  let chartsInitialized = false;

  function initCharts() {
    // polling can be paused/resumed on tab switches; charts are created once
    if (chartsInitialized) return;
    chartsInitialized = true;
    chart_cpu = makeLineChart('sys_cpu_canvans', [{
      label: 'CPU %', data: [],
      borderColor: 'rgb(75, 192, 192)',
      backgroundColor: 'rgba(75, 192, 192, 0.12)',
      fill: true, tension: 0.35,
    }], 100);

    chart_mem = makeLineChart('sys_mem_canvans', [{
      label: 'Memory %', data: [],
      borderColor: 'rgb(255, 159, 64)',
      backgroundColor: 'rgba(255, 159, 64, 0.12)',
      fill: true, tension: 0.35,
    }], 100);

    chart_net = makeLineChart('sys_net_canvans', [
      {
        label: '下载 ↓', data: [],
        borderColor: 'rgb(14, 165, 164)',
        backgroundColor: 'rgba(14, 165, 164, 0.12)',
        fill: true, tension: 0.35,
      },
      {
        label: '上传 ↑', data: [],
        borderColor: 'rgb(99, 102, 241)',
        backgroundColor: 'rgba(99, 102, 241, 0.12)',
        fill: true, tension: 0.35,
      },
    ], undefined, true);
    if (chart_net) chart_net.options.plugins.legend = { display: true, labels: { boxWidth: 12 } };

    // doughnut for disk usage (canvas can't resolve CSS vars — use raw rgba)
    const diskCtx = document.getElementById('sys_disk_canvans');
    if (diskCtx) {
      chart_disk = new Chart(diskCtx, {
        type: 'doughnut',
        data: {
          labels: ['已用', '可用'],
          datasets: [{
            data: [0, 1],
            backgroundColor: ['rgba(14, 165, 164, 0.95)', 'rgba(14, 165, 164, 0.18)'],
            borderWidth: 2,
            borderColor: getComputedStyle(document.documentElement)
              .getPropertyValue('--fluent-surface') || '#fff',
            hoverOffset: 4,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '68%',
          animation: { duration: 300 },
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 12 } },
            tooltip: {
              callbacks: {
                label: (item) => `${item.label}: ${fmtBytes(item.parsed)}`
              }
            }
          },
        },
        plugins: [{
          id: 'centerText',
          afterDraw(chart) {
            const pct = chart.$centerPercent;
            if (pct == null) return;
            // anchor on the arc center (chartArea center drifts when legend/padding shift)
            const arc = chart.getDatasetMeta(0).data[0];
            if (!arc) return;
            const ctx = chart.ctx;
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = '700 20px sans-serif';
            ctx.fillStyle = getComputedStyle(document.documentElement)
              .getPropertyValue('--fluent-text-primary') || '#242424';
            ctx.fillText(pct.toFixed(1) + '%', arc.x, arc.y - 8);
            ctx.font = '500 11px sans-serif';
            ctx.fillStyle = '#616161';
            ctx.fillText('已使用', arc.x, arc.y + 12);
            ctx.restore();
          }
        }],
      });
    }
  }

  function pushPoint(chart, label, values) {
    if (!chart) return;
    chart.data.labels.push(label);
    if (chart.data.labels.length > HISTORY_LEN) chart.data.labels.shift();
    values.forEach((v, dsIndex) => {
      const ds = chart.data.datasets[dsIndex].data;
      ds.push(v);
      if (ds.length > HISTORY_LEN) ds.shift();
    });
    chart.update('none');
  }

  function setBar(barId, pct) {
    const bar = document.getElementById(barId);
    if (bar) {
      bar.style.width = Math.min(pct, 100).toFixed(1) + '%';
      bar.classList.toggle('bg-warning', pct >= 70 && pct < 90);
      bar.classList.toggle('bg-danger', pct >= 90);
    }
  }

  function markOffline() {
    const dot = document.getElementById('sysinfo-live-dot');
    if (dot) {
      dot.classList.remove('text-bg-success');
      dot.classList.add('text-bg-secondary');
      dot.textContent = '● 离线';
    }
  }

  function fetchData() {
    fetch('/api/sysinfo/status')
      .then(r => r.json())
      .then(data => {
        const label = nowLabel();
        const now = Date.now();

        // ---- CPU ----
        document.getElementById('sys-cpu-value').textContent = data.cpu_percent.toFixed(1) + '%';
        document.getElementById('kpi-cpu').textContent = data.cpu_percent.toFixed(1);
        setBar('kpi-cpu-bar', data.cpu_percent);
        pushPoint(chart_cpu, label, [data.cpu_percent]);

        // ---- Memory ----
        const mem = data.memory;
        document.getElementById('sys-mem-value').textContent = mem.percent.toFixed(1) + '%';
        document.getElementById('kpi-mem').textContent = mem.percent.toFixed(1);
        setBar('kpi-mem-bar', mem.percent);
        pushPoint(chart_mem, label, [mem.percent]);

        // ---- Network I/O: rates from successive samples ----
        const net = data.net_io;
        if (lastNetSample) {
          const dt = (now - lastNetSample.t) / 1000;
          if (dt > 0) {
            const recvRate = Math.max(0, (net.bytes_recv - lastNetSample.recv) / dt);
            const sentRate = Math.max(0, (net.bytes_sent - lastNetSample.sent) / dt);
            document.getElementById('kpi-net-recv').textContent = fmtBytes(recvRate, '/s');
            document.getElementById('kpi-net-sent').textContent = fmtBytes(sentRate, '/s');
            document.getElementById('sys-net-value').textContent =
              `↓ ${fmtBytes(recvRate, '/s')} · ↑ ${fmtBytes(sentRate, '/s')}`;
            pushPoint(chart_net, label, [recvRate, sentRate]);
          }
        }
        lastNetSample = { t: now, recv: net.bytes_recv, sent: net.bytes_sent };

        // ---- Disk ----
        const disk = data.disk;
        document.getElementById('sys-disk-value').textContent = disk.percent.toFixed(1) + '%';
        document.getElementById('kpi-disk').textContent = disk.percent.toFixed(1);
        setBar('kpi-disk-bar', disk.percent);
        document.getElementById('disk-used').textContent = fmtBytes(disk.used);
        document.getElementById('disk-free').textContent = fmtBytes(disk.free);
        document.getElementById('disk-total').textContent = fmtBytes(disk.total);
        document.getElementById('disk-percent').textContent = disk.percent.toFixed(1) + '%';
        if (chart_disk) {
          chart_disk.data.datasets[0].data = [disk.used, disk.free];
          chart_disk.$centerPercent = disk.percent;
          chart_disk.update(diskInitialized ? 'none' : undefined);
          diskInitialized = true;
        }

        // ---- Uptime ----
        document.getElementById('kpi-uptime').textContent = fmtUptime(data.uptime);
      })
      .catch(err => {
        console.error('Error to fetch Data: ', err);
        markOffline();
      });
  }

  function startPolling() {
    if (pollTimer !== null) return;
    initCharts();
    fetchData();
    pollTimer = setInterval(fetchData, POLL_MS);
  }

  function stopPolling() {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    // poll only while the page is visible: pause the API when the user
    // switches to another browser tab or window; on return, reset the
    // network baseline so the paused time doesn't show as a traffic spike
    if (!document.hidden) startPolling();

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        stopPolling();
      } else {
        lastNetSample = null;
        startPolling();
      }
    });
  });
