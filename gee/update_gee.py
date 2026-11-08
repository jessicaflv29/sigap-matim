"""
Pembaruan otomatis hasil Google Earth Engine untuk WebGIS pascagempa Manggarai Timur.

Dijalankan oleh GitHub Actions (.github/workflows/update-gee.yml) secara terjadwal,
atau manual di laptop:  python gee/update_gee.py

Keluaran:
  data/gee_layers.json  URL tile XYZ citra sebelum/sesudah (Sentinel-2 RGB, NDVI, dNDVI, S1 log-ratio)
  data/gee_stats.json   statistik perubahan lahan per kecamatan (ha)

Jendela "sesudah" berakhir pada hari skrip dijalankan, jadi setiap citra baru yang
masuk ke katalog GEE otomatis ikut terpakai.

Kredensial:
  - GitHub Actions: secret GEE_SERVICE_ACCOUNT_KEY (isi file JSON kunci service account)
                    dan GEE_PROJECT (ID Google Cloud project yang terdaftar di Earth Engine).
                    Jika GEE_PROJECT kosong, project_id dari file kunci yang dipakai.
  - Laptop: jalankan `earthengine authenticate` sekali, lalu set GEE_PROJECT:
      PowerShell : $env:GEE_PROJECT="ee-jessicaflavindetadwik"
      CMD        : set GEE_PROJECT=ee-jessicaflavindetadwik
"""
import datetime as dt
import json
import os
import pathlib
import sys

import ee

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / "data"

# ---------------- Parameter ----------------
TGL_GEMPA = "2026-08-15"
SEBELUM = ("2026-05-01", "2026-08-14")
SESUDAH_MULAI = "2026-08-16"
AMBANG_DNDVI = -0.15    # penurunan NDVI dianggap "vegetasi hilang"
AMBANG_NDVI_AWAL = 0.3  # hanya piksel yang sebelumnya bervegetasi
AMBANG_SAR_DB = 3.0     # |log-ratio VV| dianggap "berubah"
CS_THRESHOLD = 0.6      # Cloud Score+ (0.5–0.65)
ORBIT_PASS = "DESCENDING"


def init():
    project = (os.environ.get("GEE_PROJECT") or "").strip() or None
    key = (os.environ.get("GEE_SERVICE_ACCOUNT_KEY") or "").strip()
    if key:
        info = json.loads(key)
        project = project or info.get("project_id")
        creds = ee.ServiceAccountCredentials(info["client_email"], key_data=key)
        ee.Initialize(creds, project=project)
        print("Login service account:", info["client_email"], "| project:", project)
    else:
        if not project:
            sys.exit("GEE_PROJECT belum di-set. Lihat docstring di awal file ini.")
        ee.Initialize(project=project)
        print("Login akun pribadi | project:", project)


def main():
    init()
    hari_ini = dt.date.today().isoformat()
    sesudah = (SESUDAH_MULAI, hari_ini)

    batas_gj = json.loads((DATA / "batas_kecamatan.geojson").read_text(encoding="utf-8"))
    feats = [ee.Feature(f["geometry"], {"kecamatan": f["properties"].get("NAMOBJ")}) for f in batas_gj["features"]]
    kec = ee.FeatureCollection(feats)
    geom = kec.geometry()
    aoi = geom.bounds()

    # ---------- Sentinel-2 + Cloud Score+ ----------
    cs = ee.ImageCollection("GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED")

    def s2_median(rng):
        col = (ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
               .filterBounds(aoi).filterDate(rng[0], rng[1])
               .linkCollection(cs, ["cs_cdf"])
               .map(lambda i: i.updateMask(i.select("cs_cdf").gte(CS_THRESHOLD))
                    .select(["B2", "B3", "B4", "B8"]).divide(10000)))
        return col.median().clip(geom), col.size().getInfo()

    s2_pre, n_pre = s2_median(SEBELUM)
    s2_post, n_post = s2_median(sesudah)
    print(f"Scene S2: sebelum={n_pre}, sesudah={n_post}")
    if n_pre == 0 or n_post == 0:
        sys.exit("Tidak ada scene Sentinel-2 pada salah satu periode. Periksa tanggal/AOI.")

    ndvi_pre = s2_pre.normalizedDifference(["B8", "B4"])
    ndvi_post = s2_post.normalizedDifference(["B8", "B4"])
    dndvi = ndvi_post.subtract(ndvi_pre).rename("dndvi")

    # ---------- Sentinel-1 log-ratio ----------
    def s1_col(rng, orbit):
        col = (ee.ImageCollection("COPERNICUS/S1_GRD").filterBounds(aoi).filterDate(rng[0], rng[1])
               .filter(ee.Filter.eq("instrumentMode", "IW"))
               .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV")))
        if orbit:
            col = col.filter(ee.Filter.eq("orbitProperties_pass", orbit))
        return col.select("VV")

    orbit = ORBIT_PASS
    n_s1_pre = s1_col(SEBELUM, orbit).size().getInfo()
    n_s1_post = s1_col(sesudah, orbit).size().getInfo()
    if n_s1_pre == 0 or n_s1_post == 0:
        print(f"Peringatan: scene S1 {orbit} kosong di salah satu periode; memakai semua orbit.")
        orbit = None
        n_s1_pre = s1_col(SEBELUM, orbit).size().getInfo()
        n_s1_post = s1_col(sesudah, orbit).size().getInfo()
    print(f"Scene S1 ({orbit or 'ASC+DESC'}): sebelum={n_s1_pre}, sesudah={n_s1_post}")
    if n_s1_pre == 0 or n_s1_post == 0:
        sys.exit("Tidak ada scene Sentinel-1 pada salah satu periode.")

    def s1(rng):
        return s1_col(rng, orbit).mean().focalMedian(30, "circle", "meters")

    logratio = s1(sesudah).subtract(s1(SEBELUM)).rename("lr").clip(geom)

    # ---------- Tile URL ----------
    vis_rgb = {"bands": ["B4", "B3", "B2"], "min": 0.02, "max": 0.18, "gamma": 1.2}
    vis_ndvi = {"min": 0, "max": 0.85, "palette": ["a50026", "f46d43", "fee08b", "d9ef8b", "66bd63", "006837"]}
    vis_d = {"min": -0.4, "max": 0.4, "palette": ["8e0152", "de77ae", "f7f7f7", "7fbc41", "276419"]}
    vis_lr = {"min": -4, "max": 4, "palette": ["2166ac", "92c5de", "f7f7f7", "f4a582", "b2182b"]}

    def url(img, vis):
        return img.getMapId(vis)["tile_fetcher"].url_format

    label_post = f"Sesudah: median 16 Agu 2026 – {dt.date.today():%d %b %Y}"
    layers = {
        "contoh": False,
        "diperbarui": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "catatan": "URL tile Earth Engine berlaku terbatas; file ini diperbarui berkala oleh GitHub Actions.",
        "pasangan": [
            {"id": "s2_rgb", "nama": "Sentinel-2 warna asli",
             "sebelum": {"url": url(s2_pre, vis_rgb), "label": "Sebelum: median Mei – 14 Agu 2026"},
             "sesudah": {"url": url(s2_post, vis_rgb), "label": label_post}},
            {"id": "ndvi", "nama": "NDVI (kehijauan vegetasi)",
             "sebelum": {"url": url(ndvi_pre, vis_ndvi), "label": "NDVI sebelum"},
             "sesudah": {"url": url(ndvi_post, vis_ndvi), "label": "NDVI sesudah"}},
        ],
        "tunggal": [
            {"id": "dndvi", "nama": "Selisih NDVI (merah = vegetasi berkurang)", "url": url(dndvi, vis_d)},
            {"id": "s1_logratio", "nama": "Perubahan backscatter Sentinel-1 (dB)", "url": url(logratio, vis_lr)},
        ],
    }

    # ---------- Statistik per kecamatan ----------
    ha = ee.Image.pixelArea().divide(1e4)
    veg_hilang = dndvi.lte(AMBANG_DNDVI).And(ndvi_pre.gte(AMBANG_NDVI_AWAL))
    sar_ubah = logratio.abs().gte(AMBANG_SAR_DB)
    stack = (ha.rename("luas_ha")
             .addBands(ha.updateMask(veg_hilang).rename("ha_vegetasi_turun"))
             .addBands(ha.updateMask(sar_ubah).rename("ha_sar_berubah")))
    sums = stack.reduceRegions(collection=kec, reducer=ee.Reducer.sum(), scale=20, tileScale=4)
    means = dndvi.reduceRegions(collection=kec, reducer=ee.Reducer.mean().setOutputs(["mean_dndvi"]), scale=20, tileScale=4)

    s_info = sums.getInfo()["features"]
    m_info = {f["properties"]["kecamatan"]: f["properties"].get("mean_dndvi") for f in means.getInfo()["features"]}
    rows = []
    for f in s_info:
        p = f["properties"]
        rows.append({
            "kecamatan": p["kecamatan"],
            "luas_ha": round(p.get("luas_ha") or 0),
            "ha_vegetasi_turun": round(p.get("ha_vegetasi_turun") or 0),
            "ha_sar_berubah": round(p.get("ha_sar_berubah") or 0),
            "mean_dndvi": round(m_info.get(p["kecamatan"]) or 0, 3),
        })

    stats = {
        "contoh": False,
        "diperbarui": layers["diperbarui"],
        "metode": {"sebelum": f"{SEBELUM[0]}/{SEBELUM[1]}", "sesudah": f"{sesudah[0]}/{sesudah[1]}",
                   "ambang_dndvi": AMBANG_DNDVI, "ambang_sar_db": AMBANG_SAR_DB,
                   "scene_s2_sebelum": n_pre, "scene_s2_sesudah": n_post,
                   "orbit_s1": orbit or "ASC+DESC",
                   "scene_s1_sebelum": n_s1_pre, "scene_s1_sesudah": n_s1_post},
        "kecamatan": rows,
    }

    (DATA / "gee_layers.json").write_text(json.dumps(layers, ensure_ascii=False, indent=1), encoding="utf-8")
    (DATA / "gee_stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=1), encoding="utf-8")
    print("Selesai:", len(rows), "kecamatan; scene S2", n_pre, "/", n_post)


if __name__ == "__main__":
    main()
