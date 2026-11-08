/* Sigap Manggarai Timur — logika WebGIS.
   Data & teks diatur di js/config.js; file ini jarang perlu diubah. */
(function () {
  "use strict";
  const CFG = window.SIGAP_CONFIG;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => Number(n).toLocaleString("id-ID");
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  const KELAS = [
    { k: "RB", nama: "Rusak berat", v: "--rb", bobot: 1 },
    { k: "RS", nama: "Rusak sedang", v: "--rs", bobot: 0.6 },
    { k: "RR", nama: "Rusak ringan", v: "--rr", bobot: 0.3 },
    { k: "TR", nama: "Tidak rusak", v: "--tr", bobot: 0 },
  ];
  const KMAP = Object.fromEntries(KELAS.map((x) => [x.k, x]));
  const ROAD = {
    normal: { nama: "Dapat dilalui", v: "--road-ok" },
    rusak: { nama: "Terbatas", v: "--road-dmg" },
    putus: { nama: "Putus", v: "--road-cut" },
  };

  const state = {
    kelasOn: new Set(KELAS.map((x) => x.k)),
    kec: "",
    bangunan: [], posko: [], jalan: null, indikasi: null, batas: null,
    eq: [], eqSort: "waktu",
    ref: null, picking: false,
    compare: null, // {before, after}
  };

  /* ---------- Theme ---------- */
  function savedTheme() { try { return localStorage.getItem("sigap-tema"); } catch (e) { return null; } }
  function applyTheme(t) { if (t) document.documentElement.setAttribute("data-theme", t); }
  applyTheme(savedTheme());
  function isDark() {
    const t = document.documentElement.getAttribute("data-theme");
    return t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  $("#btnTema").addEventListener("click", () => {
    const next = isDark() ? "light" : "dark";
    applyTheme(next);
    try { localStorage.setItem("sigap-tema", next); } catch (e) {}
    restyleAll();
  });

  /* ---------- Static text ---------- */
  $("#judul").textContent = CFG.judul;
  $("#subjudul").textContent = CFG.subjudul;
  document.title = CFG.judul;
  $("#ribbon").hidden = !CFG.modeContoh;
  $("#timInfo").textContent = `${CFG.tim} · Pembimbing: ${CFG.pembimbing}`;
  if (CFG.tautanLaporan) { const b = $("#btnLapor"); b.href = CFG.tautanLaporan; b.hidden = false; }
  if (CFG.tautanGeeApp) { $("#btnGeeApp").href = CFG.tautanGeeApp; $("#blokGeeApp").hidden = false; }

  /* ---------- Map ---------- */
  const map = L.map("map", {
    center: CFG.peta.pusat, zoom: CFG.peta.zoom, minZoom: CFG.peta.zoomMin, maxZoom: CFG.peta.zoomMaks,
    zoomControl: true, preferCanvas: true,
  });
  map.attributionControl.setPrefix(false);

  const basemaps = {
    "Peta jalan (OSM)": L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: "© OpenStreetMap contributors" }),
    "Citra satelit (Esri)": L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19, attribution: "Citra © Esri, Maxar, Earthstar Geographics" }),
    "Topografi (OpenTopoMap)": L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
      maxZoom: 17, attribution: "© OpenTopoMap (CC-BY-SA), © OpenStreetMap" }),
  };
  basemaps["Peta jalan (OSM)"].addTo(map);
  const layerCtl = L.control.layers(basemaps, null, { position: "topright", collapsed: true }).addTo(map);
  L.control.scale({ imperial: false, position: "bottomright" }).addTo(map);

  // Panes control drawing order
  [["pBefore", 230], ["pAfter", 240], ["pSingle", 260], ["pBatas", 350], ["pGrid", 360], ["pJalan", 420], ["pEq", 430], ["pBangunan", 440], ["pPosko", 460]]
    .forEach(([n, z]) => { map.createPane(n).style.zIndex = z; });
  map.getPane("pBatas").style.pointerEvents = "none";

  const renderer = L.canvas({ padding: 0.3 });
  const groups = {
    batas: L.layerGroup(), grid: L.layerGroup(), jalan: L.layerGroup(), bangunan: L.layerGroup(),
    posko: L.layerGroup(), eq: L.layerGroup(), epi: L.layerGroup(), heat: null, me: L.layerGroup(),
  };
  groups.me.addTo(map);

  /* ---------- Data loading ---------- */
  function loadJSON(url) {
    return fetch(url, { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return r.json(); });
  }
  function loadCSV(url) {
    return new Promise((res, rej) => Papa.parse(url, {
      download: true, header: true, skipEmptyLines: true, dynamicTyping: false,
      complete: (r) => res(r.data), error: (e) => rej(new Error(`${url}: ${e.message || e}`)),
    }));
  }
  const num = (v) => { const n = parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : null; };

  Promise.allSettled([
    loadJSON(CFG.data.batas), loadCSV(CFG.data.bangunan), loadCSV(CFG.data.posko),
    loadJSON(CFG.data.jalan), loadJSON(CFG.data.indikasi),
  ]).then(([b, bg, pk, jl, ind]) => {
    const errs = [b, bg, pk, jl, ind].filter((x) => x.status === "rejected").map((x) => x.reason.message);
    if (errs.length) showError("Sebagian data gagal dimuat: " + errs.join("; ") +
      ". Pastikan halaman dibuka lewat server (Live Server/GitHub Pages), bukan dobel-klik file.");

    if (b.status === "fulfilled") state.batas = b.value;
    if (bg.status === "fulfilled") {
      state.bangunan = bg.value.map((r) => ({ ...r, lat: num(r.lat), lon: num(r.lon), kelas: String(r.kelas || "").trim().toUpperCase() }))
        .filter((r) => r.lat !== null && r.lon !== null && KMAP[r.kelas]);
    }
    if (pk.status === "fulfilled") state.posko = pk.value.map((r) => ({ ...r, lat: num(r.lat), lon: num(r.lon) })).filter((r) => r.lat !== null && r.lon !== null);
    if (jl.status === "fulfilled") state.jalan = jl.value;
    if (ind.status === "fulfilled") state.indikasi = ind.value;

    buildKecSelect();
    buildChips();
    drawBatas(); drawGrid(); drawJalan(); drawPosko(); drawEpicentre();
    refreshBangunan();
    renderResmi();
    renderRoads();
    renderPosko();
    buildLayerList();
    buildCitra();
    renderLegend();
    if (state.batas) { try { map.fitBounds(L.geoJSON(state.batas).getBounds(), { padding: [10, 10] }); } catch (e) {} }
  });

  function showError(msg) {
    const d = document.createElement("div");
    d.className = "ribbon"; d.hidden = false;
    d.innerHTML = `<strong>Perhatian.</strong> ${esc(msg)}`;
    document.body.insertBefore(d, document.body.firstChild);
  }

  /* ---------- Layers ---------- */
  function drawBatas() {
    groups.batas.clearLayers();
    if (!state.batas) return;
    L.geoJSON(state.batas, {
      pane: "pBatas", interactive: false,
      style: () => ({ color: css("--fg"), weight: 2, opacity: 0.7, dashArray: "6 4", fill: false }),
    }).addTo(groups.batas);
    groups.batas.addTo(map);
  }

  function gridColor(p) {
    const v = Number(p.indeks);
    return v >= 0.6 ? css("--grid-hi") : v >= 0.35 ? css("--grid-md") : css("--grid-lo");
  }
  function drawGrid() {
    groups.grid.clearLayers();
    if (!state.indikasi) return;
    L.geoJSON(state.indikasi, {
      pane: "pGrid", renderer,
      style: (f) => ({ color: gridColor(f.properties), weight: 0.5, fillColor: gridColor(f.properties), fillOpacity: 0.45, opacity: 0.6 }),
      onEachFeature: (f, l) => l.bindPopup(`<div class="pop"><h4>Indikasi perubahan (SAR)</h4><table>
        <tr><td>Indeks</td><td><b>${esc(f.properties.indeks)}</b> (${esc(f.properties.kelas)})</td></tr>
        <tr><td>Arti</td><td>Perubahan permukaan terdeteksi dari citra radar. Perlu dicek dengan data lapangan atau citra resolusi tinggi.</td></tr></table></div>`),
    }).addTo(groups.grid);
  }

  function drawJalan() {
    groups.jalan.clearLayers();
    if (!state.jalan) return;
    L.geoJSON(state.jalan, {
      pane: "pJalan",
      style: (f) => {
        const s = ROAD[f.properties.status] || ROAD.normal;
        return { color: css(s.v), weight: f.properties.status === "normal" ? 3 : 4.5, dashArray: f.properties.status === "putus" ? "7 6" : null, opacity: 0.95 };
      },
      onEachFeature: (f, l) => {
        f.__layer = l;
        const p = f.properties, s = ROAD[p.status] || ROAD.normal;
        l.bindPopup(`<div class="pop"><h4>${esc(p.nama)}</h4><table>
          <tr><td>Status</td><td><span class="tag" style="--c:${css(s.v)}">${esc(s.nama)}</span></td></tr>
          <tr><td>Kelas jalan</td><td>${esc(p.kelas_jalan)}</td></tr>
          <tr><td>Keterangan</td><td>${esc(p.keterangan)}</td></tr>
          <tr><td>Diperbarui</td><td>${esc(p.diperbarui)}</td></tr>
          <tr><td>Sumber</td><td>${esc(p.sumber)}</td></tr></table></div>`);
      },
    }).addTo(groups.jalan);
    groups.jalan.addTo(map);
  }

  function poskoAbbr(j) {
    const s = String(j || "").toLowerCase();
    return s.includes("kesehatan") || s.includes("puskesmas") ? "+" : s.includes("dapur") ? "D" : s.includes("kumpul") ? "K" : "P";
  }
  function drawPosko() {
    groups.posko.clearLayers();
    state.posko.forEach((p) => {
      const m = L.marker([p.lat, p.lon], {
        pane: "pPosko",
        icon: L.divIcon({ className: "", html: `<div class="posko-icon">${poskoAbbr(p.jenis)}</div>`, iconSize: [22, 22], iconAnchor: [11, 11] }),
        title: p.nama,
      });
      m.bindPopup(`<div class="pop"><h4>${esc(p.nama)}</h4><table>
        <tr><td>Jenis</td><td>${esc(p.jenis)}</td></tr>
        <tr><td>Kecamatan</td><td>${esc(p.kecamatan)}</td></tr>
        ${p.kapasitas && p.kapasitas !== "0" ? `<tr><td>Kapasitas</td><td>${esc(p.kapasitas)} jiwa</td></tr>` : ""}
        ${p.kebutuhan ? `<tr><td>Kebutuhan</td><td>${esc(p.kebutuhan)}</td></tr>` : ""}
        ${p.kontak ? `<tr><td>Kontak</td><td>${esc(p.kontak)}</td></tr>` : ""}
        <tr><td>Status</td><td>${esc(p.status)}</td></tr>
        <tr><td>Diperbarui</td><td>${esc(p.diperbarui)}</td></tr></table></div>`);
      p.__m = m;
      m.addTo(groups.posko);
    });
    groups.posko.addTo(map);
  }

  function drawEpicentre() {
    groups.epi.clearLayers();
    const g = CFG.gempaUtama;
    if (!g) return;
    L.marker([g.lat, g.lon], {
      pane: "pPosko", icon: L.divIcon({ className: "", html: '<div class="epi-icon">★</div>', iconSize: [30, 30], iconAnchor: [15, 15] }),
    }).bindPopup(`<div class="pop"><h4>${esc(g.nama)}</h4><table>
      <tr><td>Waktu</td><td>${new Date(g.waktu).toLocaleString("id-ID", { timeZone: "Asia/Makassar" })} WITA</td></tr>
      <tr><td>Magnitudo</td><td>${esc(g.magnitudo)}</td></tr>
      <tr><td>Kedalaman</td><td>${esc(g.kedalamanKm)} km</td></tr>
      <tr><td>Keterangan</td><td>${esc(g.keterangan)}</td></tr></table></div>`).addTo(groups.epi);
    groups.epi.addTo(map);
  }

  function filtered() {
    return state.bangunan.filter((r) => state.kelasOn.has(r.kelas) && (!state.kec || r.kecamatan === state.kec));
  }

  function refreshBangunan() {
    groups.bangunan.clearLayers();
    const rows = filtered();
    rows.forEach((r) => {
      const c = css(KMAP[r.kelas].v);
      const m = L.circleMarker([r.lat, r.lon], {
        pane: "pBangunan", renderer, radius: r.kelas === "RB" ? 6 : r.kelas === "TR" ? 4 : 5,
        color: css("--surface"), weight: 1, fillColor: c, fillOpacity: 0.95,
      });
      m.bindPopup(() => `<div class="pop"><h4>${esc(r.tipe || "Bangunan")} · ${esc(r.id)}</h4><table>
        <tr><td>Kerusakan</td><td><span class="tag" style="--c:${c}">${esc(KMAP[r.kelas].nama)}</span></td></tr>
        <tr><td>Wilayah</td><td>${esc(r.desa)}, Kec. ${esc(r.kecamatan)}</td></tr>
        ${r.konstruksi ? `<tr><td>Konstruksi</td><td>${esc(r.konstruksi)}</td></tr>` : ""}
        <tr><td>Sumber</td><td>${esc(r.sumber)}</td></tr>
        <tr><td>Tanggal</td><td>${esc(r.tanggal)}</td></tr>
        <tr><td>Koordinat</td><td>${r.lat.toFixed(5)}, ${r.lon.toFixed(5)}</td></tr>
        ${r.catatan ? `<tr><td>Catatan</td><td>${esc(r.catatan)}</td></tr>` : ""}
        </table>${r.foto_url ? `<a href="${esc(r.foto_url)}" target="_blank" rel="noopener"><img src="${esc(r.foto_url)}" alt="Foto kondisi bangunan ${esc(r.id)}" loading="lazy"></a>` : ""}</div>`);
      m.addTo(groups.bangunan);
    });
    if (!map.hasLayer(groups.bangunan) && $("#lyr-bangunan")?.checked !== false) groups.bangunan.addTo(map);

    // Heatmap (KDE) weighted by damage class
    if (groups.heat) map.removeLayer(groups.heat);
    const pts = rows.filter((r) => KMAP[r.kelas].bobot > 0).map((r) => [r.lat, r.lon, KMAP[r.kelas].bobot]);
    groups.heat = L.heatLayer(pts, { radius: 28, blur: 22, maxZoom: 13, minOpacity: 0.25,
      gradient: { 0.2: "#2c7bb6", 0.45: "#abd9e9", 0.65: "#fdae61", 0.85: "#d7191c", 1: "#7f0000" } });
    if ($("#tglHeat").checked) groups.heat.addTo(map);

    renderKecTable();
    updateChipCounts();
  }

  /* ---------- Filters ---------- */
  function buildChips() {
    const wrap = $("#chipsKelas");
    wrap.innerHTML = "";
    KELAS.forEach((x) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "chip"; b.dataset.k = x.k; b.setAttribute("aria-pressed", "true");
      b.style.setProperty("--c", `var(${x.v})`);
      b.innerHTML = `<span class="sw"></span>${x.nama}<span class="n" data-n="${x.k}">0</span>`;
      b.addEventListener("click", () => {
        if (state.kelasOn.has(x.k)) state.kelasOn.delete(x.k); else state.kelasOn.add(x.k);
        b.setAttribute("aria-pressed", String(state.kelasOn.has(x.k)));
        refreshBangunan();
      });
      wrap.appendChild(b);
    });
  }
  function updateChipCounts() {
    const base = state.bangunan.filter((r) => !state.kec || r.kecamatan === state.kec);
    KELAS.forEach((x) => { const el = $(`[data-n="${x.k}"]`); if (el) el.textContent = fmt(base.filter((r) => r.kelas === x.k).length); });
    $("#petaMeta").textContent = `${fmt(filtered().length)} dari ${fmt(state.bangunan.length)} titik`;
  }
  function buildKecSelect() {
    const sel = $("#selKec");
    const names = [...new Set(state.bangunan.map((r) => r.kecamatan).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id"));
    names.forEach((n) => { const o = document.createElement("option"); o.value = n; o.textContent = n; sel.appendChild(o); });
    sel.addEventListener("change", () => { setKec(sel.value); });
  }
  function setKec(k) {
    state.kec = k; $("#selKec").value = k;
    refreshBangunan();
    const rows = filtered();
    if (k && rows.length) map.fitBounds(L.latLngBounds(rows.map((r) => [r.lat, r.lon])).pad(0.25));
  }
  $("#tglHeat").addEventListener("change", (e) => {
    if (!groups.heat) return;
    if (e.target.checked) groups.heat.addTo(map); else map.removeLayer(groups.heat);
    renderLegend();
  });

  /* ---------- Summary panels ---------- */
  function renderResmi() {
    const r = CFG.ringkasanResmi;
    const tot = KELAS.reduce((s, x) => s + (Number(r[x.k]) || 0), 0);
    $("#resmiTotal").textContent = fmt(tot);
    $("#resmiMeta").textContent = `${r.sumber} · ${new Date(r.tanggal).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}`;
    $("#resmiBar").innerHTML = KELAS.map((x) => `<i style="width:${(100 * (r[x.k] || 0)) / tot}%;background:var(${x.v})" title="${x.nama}: ${fmt(r[x.k] || 0)}"></i>`).join("");
    $("#resmiList").innerHTML = KELAS.map((x) => `<div style="--c:var(${x.v})"><dt>${x.nama}</dt><dd>${fmt(r[x.k] || 0)}<small>${((100 * (r[x.k] || 0)) / tot).toFixed(1)}%</small></dd></div>`).join("");
  }

  function renderKecTable() {
    const by = {};
    state.bangunan.filter((r) => state.kelasOn.has(r.kelas)).forEach((r) => {
      const o = (by[r.kecamatan] ||= { RB: 0, RS: 0, RR: 0, TR: 0 });
      o[r.kelas]++;
    });
    const rows = Object.entries(by).map(([k, o]) => ({ k, ...o, tot: o.RB + o.RS + o.RR + o.TR }))
      .sort((a, b) => (b.RB * 3 + b.RS * 2 + b.RR) - (a.RB * 3 + a.RS * 2 + a.RR));
    $("#tblKec tbody").innerHTML = rows.map((r) => `<tr data-k="${esc(r.k)}" class="${state.kec === r.k ? "is-on" : ""}" tabindex="0">
      <td>${esc(r.k)}</td><td class="num">${r.RB}</td><td class="num">${r.RS}</td><td class="num">${r.RR}</td><td class="num">${r.tot}</td>
      <td><div class="minibar">${KELAS.map((x) => `<i style="width:${r.tot ? (100 * r[x.k]) / r.tot : 0}%;background:var(${x.v})"></i>`).join("")}</div></td></tr>`).join("")
      || `<tr><td colspan="6" class="note">Tidak ada titik untuk filter ini.</td></tr>`;
    $$("#tblKec tbody tr[data-k]").forEach((tr) => {
      const go = () => setKec(state.kec === tr.dataset.k ? "" : tr.dataset.k);
      tr.addEventListener("click", go);
      tr.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    });
  }

  function renderRoads() {
    const feats = state.jalan?.features || [];
    const cnt = { normal: 0, rusak: 0, putus: 0 };
    feats.forEach((f) => { cnt[f.properties.status] = (cnt[f.properties.status] || 0) + 1; });
    $("#jalanMeta").textContent = `${feats.length} ruas`;
    $("#roadSum").innerHTML = Object.entries(ROAD).map(([k, s]) => `<span class="pill" style="--c:var(${s.v})">${s.nama}<b>${cnt[k] || 0}</b></span>`).join("");
    const order = { putus: 0, rusak: 1, normal: 2 };
    const list = feats.slice().sort((a, b) => order[a.properties.status] - order[b.properties.status]);
    $("#roadList").innerHTML = list.map((f, i) => {
      const p = f.properties, s = ROAD[p.status] || ROAD.normal;
      return `<li data-i="${i}"><span class="road-ico ${p.status}" style="--c:var(${s.v})"></span><span class="t"><b>${esc(p.nama)}</b><small>${esc(p.keterangan)}</small></span><small>${esc(s.nama)}</small></li>`;
    }).join("");
    $$("#roadList li").forEach((li) => li.addEventListener("click", () => {
      const f = list[li.dataset.i];
      if (f.__layer) { map.fitBounds(f.__layer.getBounds().pad(0.4)); f.__layer.openPopup(); }
    }));
  }

  function haversine(a, b) {
    const R = 6371, t = Math.PI / 180;
    const dLat = (b[0] - a[0]) * t, dLon = (b[1] - a[1]) * t;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * t) * Math.cos(b[0] * t) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function renderPosko() {
    let list = state.posko.slice();
    if (state.ref) list.forEach((p) => { p.__d = haversine(state.ref, [p.lat, p.lon]); });
    if (state.ref) list.sort((a, b) => a.__d - b.__d);
    $("#poskoList").innerHTML = list.map((p, i) => `<li data-i="${i}"><span class="pk-ico">${poskoAbbr(p.jenis)}</span>
      <span class="t"><b>${esc(p.nama)}</b><small>${esc(p.jenis)} · ${esc(p.kecamatan)}${p.kebutuhan ? " · Butuh: " + esc(p.kebutuhan) : ""}</small></span>
      <span class="d">${state.ref ? p.__d.toFixed(1) + " km" : ""}</span></li>`).join("") || `<li><span></span><span class="note">Belum ada data posko.</span><span></span></li>`;
    $$("#poskoList li[data-i]").forEach((li) => li.addEventListener("click", () => {
      const p = list[li.dataset.i];
      map.setView([p.lat, p.lon], Math.max(map.getZoom(), 13)); p.__m.openPopup();
    }));
  }
  function setRef(latlng, label) {
    state.ref = [latlng.lat, latlng.lng];
    groups.me.clearLayers();
    L.marker(latlng, { pane: "pPosko", icon: L.divIcon({ className: "", html: '<div class="me-icon"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }) }).addTo(groups.me);
    $("#lokasiInfo").textContent = `${label}: ${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}. Jarak dihitung garis lurus; periksa status jalan sebelum berangkat.`;
    renderPosko();
  }
  $("#btnLokasi").addEventListener("click", () => {
    if (!navigator.geolocation) { $("#lokasiInfo").textContent = "Peramban ini tidak mendukung lokasi. Gunakan 'Pilih titik di peta'."; return; }
    $("#lokasiInfo").textContent = "Mencari lokasi…";
    navigator.geolocation.getCurrentPosition(
      (pos) => { const ll = L.latLng(pos.coords.latitude, pos.coords.longitude); setRef(ll, "Lokasi Anda"); map.setView(ll, 12); },
      () => { $("#lokasiInfo").textContent = "Lokasi tidak diizinkan atau tidak ditemukan. Gunakan 'Pilih titik di peta'."; },
      { enableHighAccuracy: true, timeout: 10000 });
  });
  function setPicking(on) { state.picking = on; $("#picking").hidden = !on; map.getContainer().style.cursor = on ? "crosshair" : ""; }
  $("#btnPilihTitik").addEventListener("click", () => setPicking(true));
  $("#batalPilih").addEventListener("click", () => setPicking(false));
  map.on("click", (e) => { if (state.picking) { setPicking(false); setRef(e.latlng, "Titik dipilih"); } });

  /* ---------- Aftershocks (USGS) ---------- */
  function eqColorVar(mag) { return mag >= 6 ? "--rb" : mag >= 5 ? "--rs" : mag >= 4 ? "--rr" : "--eq"; }
  function loadEq() {
    const g = CFG.gempaSusulan;
    if (!g?.aktif) { $("#tab-susulan").hidden = true; return; }
    const q = new URLSearchParams({ format: "geojson", starttime: g.mulai, minlatitude: g.kotak.latMin, maxlatitude: g.kotak.latMaks,
      minlongitude: g.kotak.lonMin, maxlongitude: g.kotak.lonMaks, minmagnitude: g.magMin, orderby: "time", limit: 3000 });
    const st = $("#usgsStatus");
    fetch("https://earthquake.usgs.gov/fdsnws/event/1/query?" + q)
      .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then((js) => {
        state.eq = js.features.map((f) => ({ id: f.id, mag: f.properties.mag, place: f.properties.place, time: f.properties.time,
          url: f.properties.url, depth: f.geometry.coordinates[2], lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] }));
        st.textContent = "Diperbarui " + new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
        st.className = "meta live ok";
        drawEq(); renderEq();
      })
      .catch((e) => { st.textContent = "Gagal memuat USGS (" + e.message + ")"; st.className = "meta live err"; });
  }
  function drawEq() {
    groups.eq.clearLayers();
    state.eq.forEach((q) => {
      L.circleMarker([q.lat, q.lon], {
        pane: "pEq", renderer, radius: Math.max(3, (q.mag - 2) * 3.2), color: css(eqColorVar(q.mag)), weight: 1.5,
        fillColor: css(eqColorVar(q.mag)), fillOpacity: 0.18,
      }).bindPopup(`<div class="pop"><h4>M${q.mag.toFixed(1)} · ${esc(q.place)}</h4><table>
        <tr><td>Waktu</td><td>${new Date(q.time).toLocaleString("id-ID", { timeZone: "Asia/Makassar" })} WITA</td></tr>
        <tr><td>Kedalaman</td><td>${q.depth.toFixed(0)} km</td></tr>
        <tr><td>Detail</td><td><a href="${esc(q.url)}" target="_blank" rel="noopener">Halaman USGS</a></td></tr></table></div>`)
        .addTo(groups.eq);
    });
  }
  function renderEq() {
    const eq = state.eq;
    const max = eq.reduce((m, q) => (q.mag > (m?.mag ?? -1) ? q : m), null);
    const d7 = eq.filter((q) => Date.now() - q.time < 7 * 864e5).length;
    $("#eqStats").innerHTML = `<div><b>${fmt(eq.length)}</b><small>kejadian M${CFG.gempaSusulan.magMin}+</small></div>
      <div><b>${max ? "M" + max.mag.toFixed(1) : "–"}</b><small>terbesar</small></div>
      <div><b>${fmt(d7)}</b><small>7 hari terakhir</small></div>`;
    // histogram
    const bands = [["2,5–3,9", 2.5, 4], ["4,0–4,9", 4, 5], ["5,0–5,9", 5, 6], ["6,0+", 6, 99]];
    const counts = bands.map((b) => eq.filter((q) => q.mag >= b[1] && q.mag < b[2]).length);
    const W = 340, H = 120, pad = 22, bw = (W - 20) / bands.length, maxC = Math.max(1, ...counts);
    $("#eqHisto").innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Histogram magnitudo">
      <line class="axis" x1="10" x2="${W - 10}" y1="${H - pad}" y2="${H - pad}"/>
      ${counts.map((c, i) => { const h = ((H - pad - 18) * c) / maxC, x = 10 + i * bw + 8; return `
        <rect class="bar" x="${x}" y="${H - pad - h}" width="${bw - 16}" height="${h}" rx="2"/>
        <text class="val" x="${x + (bw - 16) / 2}" y="${H - pad - h - 4}" text-anchor="middle">${c}</text>
        <text x="${x + (bw - 16) / 2}" y="${H - 6}" text-anchor="middle">M${bands[i][0]}</text>`; }).join("")}
    </svg>`;
    const list = eq.slice().sort((a, b) => (state.eqSort === "mag" ? b.mag - a.mag : b.time - a.time)).slice(0, 60);
    $("#eqList").innerHTML = list.map((q, i) => `<li data-i="${i}"><span class="mag" style="--c:var(${eqColorVar(q.mag)})">${q.mag.toFixed(1)}</span>
      <span class="t"><b>${esc(q.place || "Flores")}</b><small>${new Date(q.time).toLocaleString("id-ID", { timeZone: "Asia/Makassar", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} WITA · ${q.depth.toFixed(0)} km</small></span><span></span></li>`).join("")
      || `<li><span></span><span class="note">Tidak ada kejadian pada rentang ini.</span><span></span></li>`;
    $$("#eqList li[data-i]").forEach((li) => li.addEventListener("click", () => {
      const q = list[li.dataset.i];
      if (!map.hasLayer(groups.eq)) { groups.eq.addTo(map); const c = $("#lyr-eq"); if (c) c.checked = true; }
      map.setView([q.lat, q.lon], 10);
    }));
  }
  $$(".seg-b").forEach((b) => b.addEventListener("click", () => {
    $$(".seg-b").forEach((x) => x.classList.toggle("is-on", x === b));
    state.eqSort = b.dataset.sort; renderEq();
  }));
  loadEq();
  if (CFG.gempaSusulan?.aktif) setInterval(loadEq, Math.max(1, CFG.gempaSusulan.refreshMenit) * 60000);

  /* ---------- Layer list ---------- */
  function buildLayerList() {
    const items = [
      { id: "bangunan", g: () => groups.bangunan, on: true, nama: "Kerusakan bangunan", ket: "Titik survei, verifikasi, dan interpretasi citra", sym: `<i class="dot rb"></i>` },
      { id: "grid", g: () => groups.grid, on: false, nama: "Indikasi kerusakan (Sentinel-1)", ket: "Grid perubahan citra radar", sym: `<i class="sq" style="--c:var(--grid-hi);width:12px;height:12px;display:block;background:var(--grid-hi)"></i>` },
      { id: "jalan", g: () => groups.jalan, on: true, nama: "Status jalan", ket: "Dapat dilalui, terbatas, putus", sym: `<i class="ln putus"></i>` },
      { id: "posko", g: () => groups.posko, on: true, nama: "Posko & fasilitas", ket: "Posko, dapur umum, faskes, titik kumpul", sym: `<span class="pk-ico" style="width:16px;height:16px;font-size:9px">P</span>` },
      { id: "eq", g: () => groups.eq, on: false, nama: "Gempa susulan (USGS)", ket: "Lingkaran = magnitudo", sym: `<i class="dot" style="--c:var(--eq)"></i>` },
      { id: "epi", g: () => groups.epi, on: true, nama: "Pusat gempa utama", ket: "BMKG", sym: `<span style="color:var(--rb)">★</span>` },
      { id: "batas", g: () => groups.batas, on: true, nama: "Batas wilayah", ket: CFG.modeContoh ? "Masih garis perkiraan" : "Batas administrasi", sym: `<i class="ln" style="--c:var(--fg);background:repeating-linear-gradient(90deg,var(--fg) 0 4px,transparent 4px 7px)"></i>` },
    ];
    $("#layerList").innerHTML = items.map((x) => `<label class="lyr" for="lyr-${x.id}"><input type="checkbox" id="lyr-${x.id}" ${x.on ? "checked" : ""}>
      <span class="sym">${x.sym}</span><span>${x.nama}<small>${x.ket}</small></span></label>`).join("");
    items.forEach((x) => {
      const g = x.g();
      if (x.on) g.addTo(map); else map.removeLayer(g);
      $(`#lyr-${x.id}`).addEventListener("change", (e) => { if (e.target.checked) x.g().addTo(map); else map.removeLayer(x.g()); renderLegend(); });
    });
  }

  /* ---------- Legend ---------- */
  function renderLegend() {
    const parts = [];
    if (map.hasLayer(groups.bangunan)) parts.push(`<div><h4>Kerusakan bangunan</h4>${KELAS.map((x) => `<div class="row"><i class="dot" style="--c:var(${x.v})"></i>${x.nama}</div>`).join("")}</div>`);
    if (map.hasLayer(groups.grid)) parts.push(`<div><h4>Indikasi SAR</h4>
      <div class="row"><i class="sq" style="--c:var(--grid-hi)"></i>Tinggi (≥ 0,6)</div>
      <div class="row"><i class="sq" style="--c:var(--grid-md)"></i>Sedang</div>
      <div class="row"><i class="sq" style="--c:var(--grid-lo)"></i>Rendah</div></div>`);
    if (map.hasLayer(groups.jalan)) parts.push(`<div><h4>Jalan</h4>
      <div class="row"><i class="ln ok"></i>Dapat dilalui</div><div class="row"><i class="ln rusak"></i>Terbatas</div><div class="row"><i class="ln putus"></i>Putus</div></div>`);
    if (groups.heat && map.hasLayer(groups.heat)) parts.push(`<div><h4>Kepadatan kerusakan</h4>
      <div style="height:8px;border-radius:2px;background:linear-gradient(90deg,#2c7bb6,#abd9e9,#fdae61,#d7191c,#7f0000)"></div>
      <div class="row" style="justify-content:space-between"><span>rendah</span><span>tinggi</span></div></div>`);
    $("#legend").innerHTML = parts.join("");
    $("#legendBox").hidden = parts.length === 0;
  }

  (function legendToggle() {
    const t = $("#legendTgl"), body = $("#legend");
    const set = (open) => { t.setAttribute("aria-expanded", String(open)); body.hidden = !open; };
    if (window.matchMedia("(max-width: 820px)").matches) set(false);
    t.addEventListener("click", () => set(t.getAttribute("aria-expanded") !== "true"));
  })();

  /* ---------- Before / after (swipe) ---------- */
  function tile(url, pane, maxNativeZoom, opacity = 1) {
    return L.tileLayer(url, { pane, maxNativeZoom: maxNativeZoom || 14, maxZoom: CFG.peta.zoomMaks, opacity, attribution: "Citra: Copernicus Sentinel / Google Earth Engine" });
  }
  function buildCitra() {
    const pairs = (CFG.citra || []).filter((c) => c.sebelum?.url && c.sesudah?.url);
    const singles = (CFG.citraTunggal || []).filter((c) => c.url);
    $("#citraKosong").hidden = pairs.length > 0;
    $("#citraList").innerHTML = pairs.map((c, i) => `<div class="citra-item" data-i="${i}"><div><b>${esc(c.nama)}</b>
      <small>${esc(c.sebelum.label)} → ${esc(c.sesudah.label)}</small></div>
      <button class="btn" type="button" data-i="${i}">Bandingkan</button></div>`).join("");
    $$("#citraList button").forEach((b) => b.addEventListener("click", () => {
      const c = pairs[b.dataset.i];
      startCompare(tile(c.sebelum.url, "pBefore", c.maxNativeZoom), tile(c.sesudah.url, "pAfter", c.maxNativeZoom), c.sebelum.label, c.sesudah.label);
      $$(".citra-item").forEach((x) => x.classList.toggle("is-on", x.dataset.i === b.dataset.i));
    }));

    $("#blokTunggal").hidden = singles.length === 0;
    $("#citraTunggalList").innerHTML = singles.map((c, i) => `<label class="lyr" for="ct-${i}"><input type="checkbox" id="ct-${i}"><span>${esc(c.nama)}</span></label>
      <input class="lyr-opacity" type="range" min="0" max="1" step="0.05" value="${c.opacity ?? 0.75}" id="cto-${i}" aria-label="Transparansi ${esc(c.nama)}">`).join("");
    singles.forEach((c, i) => {
      c.__l = tile(c.url, "pSingle", c.maxNativeZoom, c.opacity ?? 0.75);
      $(`#ct-${i}`).addEventListener("change", (e) => (e.target.checked ? c.__l.addTo(map) : map.removeLayer(c.__l)));
      $(`#cto-${i}`).addEventListener("input", (e) => c.__l.setOpacity(Number(e.target.value)));
    });
    $("#btnDemoSwipe").addEventListener("click", () => {
      startCompare(
        L.tileLayer(basemaps["Peta jalan (OSM)"]._url, { pane: "pBefore", maxZoom: 19 }),
        L.tileLayer(basemaps["Citra satelit (Esri)"]._url, { pane: "pAfter", maxZoom: 19 }),
        "Kiri: peta jalan OSM (uji coba)", "Kanan: citra satelit Esri (uji coba)");
    });
  }

  let swipeX = 0.5;
  function startCompare(before, after, lblL, lblR) {
    stopCompare();
    state.compare = { before, after };
    before.addTo(map); after.addTo(map);
    $("#swipeL").textContent = lblL; $("#swipeR").textContent = lblR;
    $("#swipe").hidden = false;
    clip();
  }
  function stopCompare() {
    if (!state.compare) return;
    map.removeLayer(state.compare.before); map.removeLayer(state.compare.after);
    state.compare = null; $("#swipe").hidden = true;
    map.getPane("pBefore").style.clip = ""; map.getPane("pAfter").style.clip = "";
    $$(".citra-item").forEach((x) => x.classList.remove("is-on"));
  }
  function clip() {
    if (!state.compare) return;
    const size = map.getSize();
    const nw = map.containerPointToLayerPoint([0, 0]);
    const se = map.containerPointToLayerPoint(size);
    const x = nw.x + size.x * swipeX;
    map.getPane("pBefore").style.clip = `rect(${nw.y}px, ${x}px, ${se.y}px, ${nw.x}px)`;
    map.getPane("pAfter").style.clip = `rect(${nw.y}px, ${se.x}px, ${se.y}px, ${x}px)`;
    $("#swipeLine").style.left = `${swipeX * 100}%`;
  }
  map.on("move zoom resize zoomend moveend", clip);
  (function dragSwipe() {
    const knob = $("#swipeKnob");
    let drag = false;
    const setFrom = (clientX) => {
      const r = map.getContainer().getBoundingClientRect();
      swipeX = Math.min(0.98, Math.max(0.02, (clientX - r.left) / r.width)); clip();
    };
    knob.addEventListener("pointerdown", (e) => { drag = true; knob.setPointerCapture(e.pointerId); e.preventDefault(); });
    knob.addEventListener("pointermove", (e) => { if (drag) setFrom(e.clientX); });
    knob.addEventListener("pointerup", () => { drag = false; });
    knob.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") { swipeX = Math.max(0.02, swipeX - 0.05); clip(); }
      if (e.key === "ArrowRight") { swipeX = Math.min(0.98, swipeX + 0.05); clip(); }
    });
  })();
  $("#swipeClose").addEventListener("click", stopCompare);

  /* ---------- Tabs ---------- */
  $$(".tab").forEach((t) => t.addEventListener("click", () => {
    $$(".tab").forEach((x) => { x.classList.toggle("is-on", x === t); x.setAttribute("aria-selected", String(x === t)); });
    $$(".tabpane").forEach((p) => { p.hidden = p.dataset.pane !== t.dataset.tab; });
    if (t.dataset.tab === "susulan" && !map.hasLayer(groups.eq)) { groups.eq.addTo(map); const c = $("#lyr-eq"); if (c) c.checked = true; renderLegend(); }
  }));

  /* ---------- Modal ---------- */
  const modal = $("#modal");
  $("#btnPanduan").addEventListener("click", () => { modal.hidden = false; $("#modalX").focus(); });
  $("#modalX").addEventListener("click", () => { modal.hidden = true; });
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.hidden = true; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { modal.hidden = true; setPicking(false); } });

  /* ---------- Theme restyle ---------- */
  function restyleAll() {
    drawBatas(); drawGrid(); drawJalan(); refreshBangunan(); drawEq(); renderRoads();
    ["grid", "eq"].forEach((k) => { const c = $(`#lyr-${k}`); if (c && !c.checked) map.removeLayer(groups[k]); });
    ["batas", "jalan"].forEach((k) => { const c = $(`#lyr-${k}`); if (c && !c.checked) map.removeLayer(groups[k]); });
  }
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", restyleAll);
})();
