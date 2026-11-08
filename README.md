# WebGIS Pascagempa Flores 2026 · Manggarai Timur

Proyek Rekayasa Geodesi-Geomatika 2026 · Kelompok 14 · Teknik Geodesi UGM

```
index.html                      halaman WebGIS (satu file; batas kecamatan BIG tertanam)
data/batas_kecamatan.geojson    batas kecamatan (dipakai skrip GEE untuk statistik)
data/gee_layers.json            URL tile citra sebelum/sesudah  ← diisi otomatis oleh GEE
data/gee_stats.json             statistik perubahan lahan per kecamatan ← diisi otomatis oleh GEE
gee/update_gee.py               skrip Python Earth Engine (dijalankan GitHub Actions)
gee/before_after_flores2026.js  skrip GEE Code Editor (eksplorasi & ekspor manual)
gee/app_split_panel.js          Earth Engine App geser sebelum/sesudah
.github/workflows/gee-update.yml  jadwal otomatis tiap 6 jam
```

> `data/gee_stats.json` saat ini berisi **DATA CONTOH** (ditandai `"contoh": true` dan label kuning di halaman).
> `data/gee_layers.json` masih kosong, sehingga panel citra menampilkan "Citra GEE menyusul".
> Keduanya tertimpa otomatis begitu automasi GEE berjalan.

## 1. Menjalankan di laptop
Buka folder di VS Code → klik kanan `index.html` → **Open with Live Server**.
File JSON hanya bisa dibaca lewat server; kalau `index.html` dibuka dengan dobel-klik, bagian GEE akan tertulis "menyusul".

## 2. Isi halaman
| Bagian | Isi |
|---|---|
| Kartu atas | Rekap rumah rusak BNPB (total, RB/RS/RR/TR, persentase) |
| Peta | Titik bangunan, batas kecamatan, ruas putus, zona isolasi, posko, pusat gempa, gempa susulan, choropleth perubahan lahan, heatmap, **geser sebelum/sesudah** |
| Panel kiri | Cek kondisi di lokasi saya, filter, lapisan, citra GEE, cari, ekspor/impor |
| Ringkasan masyarakat | Bangunan & wilayah terdampak, isolasi, posko, jalan putus |
| Perubahan lahan | Luas indikasi vegetasi hilang (NDVI) dan perubahan radar (Sentinel-1) per kecamatan |
| Gempa susulan | Data USGS langsung: jumlah, terbesar, grafik per hari, 10 terkuat |
| Untuk peneliti | Indeks prioritas per kecamatan, Moran's I, confusion matrix, metode & kualitas data |

## 3. Automasi GEE (otomatis terupdate)

Alurnya: **GitHub Actions** menjalankan `gee/update_gee.py` tiap 6 jam → skrip login ke Earth Engine dengan *service account* → menghitung citra & statistik terbaru → menulis dua file JSON → commit ke repo → GitHub Pages ikut terbarui → WebGIS membaca JSON itu.
Jendela "sesudah" selalu berakhir di hari skrip berjalan, jadi citra Sentinel baru otomatis masuk.

### Langkah sekali saja
1. **Project Google Cloud untuk Earth Engine**
   Daftarkan project untuk penggunaan nonkomersial/akademik di https://code.earthengine.google.com/register (pilih *Unpaid usage → Academia & Research*). Catat **Project ID**.
2. **Aktifkan API**: di https://console.cloud.google.com → pilih project → *APIs & Services → Enable APIs* → **Earth Engine API**.
3. **Buat service account**: *IAM & Admin → Service Accounts → Create*.
   Beri peran **Earth Engine Resource Viewer** dan **Service Usage Consumer**.
   Buka service account → tab *Keys* → *Add key → JSON* → file `.json` terunduh.
   ⚠️ File kunci ini rahasia. **Jangan** di-upload ke repo.
4. **Simpan sebagai secret GitHub**: repo → *Settings → Secrets and variables → Actions → New repository secret*:
   - `GEE_SERVICE_ACCOUNT_KEY` = seluruh isi file JSON kunci
   - `GEE_PROJECT` = Project ID
5. **Jalankan pertama kali**: tab *Actions* → *Perbarui data GEE* → **Run workflow**. Tunggu ±2–5 menit, cek log. Jika hijau, `data/gee_*.json` terisi dan label "DATA CONTOH" hilang.

### Uji di laptop dulu (disarankan)
```bash
pip install earthengine-api
earthengine authenticate
set GEE_PROJECT=project-id-kalian      # Windows  (Mac/Linux: export GEE_PROJECT=...)
python gee/update_gee.py
```

### Hal yang perlu diketahui
- **URL tile Earth Engine berlaku terbatas** (biasanya beberapa jam). Karena itu jadwalnya tiap 6 jam. Jika citra di peta tiba-tiba kosong, perpendek jadwal di `gee-update.yml` (misal `"17 */3 * * *"`) atau pakai cara statis di bagian 4.
- GitHub bisa **menunda** jadwal cron saat server sibuk, dan **menonaktifkan** jadwal di repo publik yang tidak ada aktivitas selama 60 hari. Aktifkan lagi dari tab Actions bila perlu.
- Beberapa organisasi (misal akun kampus) melarang pembuatan kunci service account. Jika tombol *Add key* tidak bisa, pakai akun Google pribadi untuk project GEE.
- Ambang analisis (dNDVI ≤ −0,15; |log-ratio| ≥ 3 dB) ada di bagian atas `update_gee.py`. Kalibrasi dengan data lapangan/UAV dan sebutkan di laporan.

## 4. Alternatif tanpa automasi (statis)
Jalankan `gee/before_after_flores2026.js` di GEE Code Editor → ekspor GeoTIFF ke Drive → QGIS *Generate XYZ tiles (Directory)* zoom 9–14 → simpan ke `tiles/…` → isi URL di `data/gee_layers.json`, contoh:
```json
"sebelum": {"url": "tiles/s2_sebelum/{z}/{x}/{y}.png", "label": "Sebelum: median Mei–14 Agu 2026"}
```
Statistik bisa diisi manual ke `data/gee_stats.json` dari hasil *Zonal Statistics* QGIS, dengan kolom yang sama.

## 5. Mengubah tampilan & data di `index.html`
- **Warna/huruf**: blok `:root` di awal `<style>`. Warna kelas kerusakan juga di `const WARNA` (script).
- **Angka BNPB**: `const BNPB`, `const BNPB_TGL`.
- **Pusat gempa resmi**: `const EPI_ASLI`.
- **Posko & ruas putus**: `const POSKO`, `const RD`.
- **Data bangunan**: tempel CSV ke `CSV_TEXT` atau pakai tombol "Muat CSV sendiri".
- **Wilayah gempa susulan**: `var USGS` (kotak koordinat, magnitudo minimum, interval refresh).
