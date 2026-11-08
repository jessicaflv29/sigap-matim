# Sigap Manggarai Timur

WebGIS pemetaan sebaran dan kerusakan bangunan pascagempa Flores M7,7 (15 Agustus 2026) di Kabupaten Manggarai Timur, NTT.
Proyek Rekayasa Geodesi-Geomatika 2026 · Kelompok 14 · Teknik Geodesi UGM.

> **Status data:** semua isi folder `data/` saat ini adalah **DATA CONTOH (fiktif)** untuk uji tampilan.
> Angka resmi BNPB di panel Ringkasan (1.078 RB, 1.499 RS, 2.085 RR, 2.704 TR) diambil dari proposal dan sudah asli.

---

## 1. Fitur dan kaitannya dengan tujuan proposal

| Kebutuhan di proposal | Fitur di WebGIS |
|---|---|
| Sebaran & tingkat kerusakan bangunan | Titik bangunan berwarna per kelas RB/RS/RR/TR, filter kelas & kecamatan, popup atribut + foto |
| Prioritas penanganan (KDE) | Toggle **Peta kepadatan** (heatmap berbobot RB=1, RS=0,6, RR=0,3) |
| Integrasi citra satelit | Grid **indikasi kerusakan Sentinel-1**, panel **Citra** dengan geser sebelum/sesudah dari GEE |
| Akses jalan untuk logistik | Layer status jalan (dapat dilalui / terbatas / putus) + daftar ruas |
| Lokasi posko | Layer posko, faskes, dapur umum, titik kumpul + urutan **posko terdekat** dari lokasi pengguna |
| Gempa susulan (BMKG imbau waspada) | Feed langsung katalog USGS, histogram magnitudo, daftar terbaru/terkuat |
| Rekap untuk pengambil keputusan | Angka resmi BNPB + tabel per kecamatan |
| Ringan untuk jaringan terbatas | Tanpa framework, pustaka disimpan lokal di `lib/`, total < 400 KB tanpa tile peta |
| Informasi bagi masyarakat awam | Tombol **Cara membaca peta** (arti kelas, magnitudo vs MMI, batasan, keselamatan) |

## 2. Struktur folder

```
sigap-matim/
├── index.html              halaman utama
├── css/style.css           tampilan (warna, huruf, tata letak)
├── js/config.js            ⬅ FILE YANG KALIAN EDIT (judul, sumber data, angka BNPB, URL citra GEE)
├── js/app.js               logika peta (jarang perlu diubah)
├── lib/                    Leaflet 1.9.4, leaflet.heat, PapaParse (lokal, tidak perlu internet CDN)
├── data/
│   ├── kerusakan_bangunan.csv   titik bangunan
│   ├── posko.csv                posko & fasilitas
│   ├── jalan.geojson            ruas jalan + status
│   ├── indikasi_kerusakan.geojson  grid hasil Sentinel-1
│   └── batas_wilayah.geojson    batas kabupaten/kecamatan
├── tiles/                  (opsional) tile XYZ citra hasil GEE → QGIS
└── gee/
    ├── before_after_flores2026.js   skrip GEE: S2 RGB, NDVI, dNDVI, S1 log-ratio, ekspor
    └── app_split_panel.js           Earth Engine App geser sebelum/sesudah
```

## 3. Menjalankan di laptop (VS Code)

1. Buka folder `sigap-matim` di VS Code.
2. Pasang ekstensi **Live Server** (Ritwick Dey).
3. Klik kanan `index.html` → **Open with Live Server**.

> Jangan buka dengan dobel-klik file. Browser memblokir pemuatan CSV/GeoJSON dari `file://`, sehingga peta kosong dan muncul pesan "Sebagian data gagal dimuat".

## 4. Mengganti data contoh dengan data asli

Setelah semua data asli masuk, buka `js/config.js` dan ubah `modeContoh: true` menjadi `false` agar pita "DATA CONTOH" hilang.

### 4.1 `data/kerusakan_bangunan.csv`  (edit di Excel / Google Sheets)

| Kolom | Wajib | Isi | Contoh |
|---|---|---|---|
| `id` | ya | Kode unik | B0001 |
| `lat`, `lon` | ya | Desimal WGS 84 (EPSG:4326), titik sebagai pemisah desimal | -8.79231, 120.68110 |
| `kecamatan` | ya | Nama kecamatan, ejaan konsisten | Borong |
| `kelas` | ya | **RB / RS / RR / TR** (huruf persis) | RB |
| `desa`, `tipe`, `konstruksi` | tidak | Atribut deskriptif | Rumah tinggal |
| `sumber` | tidak | Interpretasi citra / Verifikasi BNPB / Foto UAV / Survei | Foto UAV |
| `tanggal` | tidak | YYYY-MM-DD | 2026-08-21 |
| `foto_url` | tidak | URL gambar (misal folder `foto/` di repo: `foto/B0001.jpg`) | |
| `catatan` | tidak | Bebas | |

Simpan sebagai **CSV UTF-8 (comma delimited)**. Excel versi Indonesia kadang menyimpan dengan titik koma (`;`) dan koma desimal. Jika itu terjadi, simpan dari Google Sheets (File → Download → CSV) atau ubah *Region* Excel ke English.

Dari QGIS: klik kanan layer titik → Export → Save Features As → format CSV, CRS EPSG:4326, *Layer options* `GEOMETRY=AS_XY`, lalu ganti nama kolom X/Y menjadi `lon`/`lat`.

### 4.2 `data/posko.csv`
Kolom: `id, nama, jenis, kecamatan, lon, lat, kapasitas, kontak, kebutuhan, status, diperbarui`.
`jenis` menentukan ikon: mengandung kata *kesehatan/puskesmas* → **+**, *dapur* → **D**, *kumpul* → **K**, selain itu → **P**.

### 4.3 `data/jalan.geojson`  (edit di QGIS atau geojson.io)
Tiap ruas wajib punya properti `nama` dan `status` bernilai **`normal`**, **`rusak`**, atau **`putus`**. Properti lain (opsional): `kelas_jalan`, `keterangan`, `diperbarui`, `sumber`.
Di QGIS: Layer jalan → tambah field `status` (teks) → isi → Export → GeoJSON, CRS **EPSG:4326**, *COORDINATE_PRECISION* 5 agar ukuran file kecil.
Sumber awal disarankan: jaringan jalan OSM (topologi lebih rapi) atau RBI BIG, status dari laporan BPBD/PUPR.

### 4.4 `data/indikasi_kerusakan.geojson`
Grid hasil analisis Sentinel-1 (log-ratio atau penurunan koherensi dari SNAP). Properti wajib: `indeks` (0–1) dan `kelas` (Tinggi/Sedang/Rendah). Ambang warna: ≥ 0,6 tinggi, ≥ 0,35 sedang.
Cara membuat di QGIS: raster hasil → *Create Grid* (misal 100 m atau 500 m) → *Zonal Statistics* (mean) → normalisasi ke 0–1 (field calculator: `("mean" - min) / (max - min)`) → tambah field `kelas` → Export GeoJSON EPSG:4326.
Sebagai pembanding/validasi, gunakan Damage Proxy Map AIT, EOS-RS, dan BRIN untuk gempa ini di portal Sentinel Asia.

### 4.5 `data/batas_wilayah.geojson`
Ganti garis perkiraan dengan batas administrasi resmi (BIG / Indonesia Geospasial). Boleh berisi poligon kecamatan; sederhanakan dulu di QGIS (*Vector → Geometry → Simplify*, toleransi ±0,0005°) agar file di bawah ±1 MB.

### 4.6 Angka resmi & teks (`js/config.js`)
- `ringkasanResmi`: perbarui RB/RS/RR/TR, `sumber`, `tanggal` setiap ada rilis BNPB baru.
- `gempaUtama`: koordinat & keterangan resmi BMKG.
- `tautanLaporan`: isi URL Google Form jika ingin tombol **Laporkan kondisi** muncul.

### 4.7 Membuat data "dinamis" tanpa server (Google Sheets)
1. Impor CSV ke Google Sheets, bagikan ke anggota tim untuk diedit bersama.
2. **File → Bagikan → Publikasikan ke web** → pilih sheet → format **CSV** → Publikasikan.
3. Salin URL-nya ke `config.js`, contoh:
   `bangunan: "https://docs.google.com/spreadsheets/d/e/XXXX/pub?gid=0&single=true&output=csv"`
4. Setiap perubahan di Sheets akan tampil di WebGIS (cache Google sekitar 5 menit) tanpa perlu commit ulang.

Catatan privasi: jangan cantumkan nama pemilik rumah, NIK, atau nomor HP warga di sheet yang dipublikasikan (UU No. 27/2022 tentang PDP).

## 5. Citra sebelum/sesudah dari Google Earth Engine

**Bisa.** GEE tidak bisa "disambung langsung" secara permanen ke situs statis, karena URL tile dari `getMap()` hanya berlaku sementara dan memerlukan kredensial. Ada tiga cara yang stabil:

| Cara | Biaya | Kapan dipakai |
|---|---|---|
| **A. Ekspor GeoTIFF → tile XYZ di QGIS → simpan di repo** | Gratis | **Disarankan** untuk proyek ini |
| B. `Export.map.toCloudStorage` → tile di bucket GCS | Perlu akun billing GCS (ada kuota gratis) | Jika area/zoom besar |
| C. Earth Engine App (`app_split_panel.js`) | Gratis | Eksplorasi interaktif, ditautkan dari tombol di WebGIS |

### Cara A (disarankan)
1. Buka https://code.earthengine.google.com, tempel `gee/before_after_flores2026.js`.
2. Sesuaikan tanggal di bagian **PARAMETER** dan, jika ada, ganti `aoi` dengan asset batas resmi.
3. **Run**. Cek layer di peta GEE dan jumlah scene Sentinel-1 di Console. Jika 0, ganti `DESCENDING` ke `ASCENDING`.
4. Tab **Tasks** → klik **Run** pada tiap ekspor → file masuk ke Google Drive folder `sigap_matim`.
5. Unduh GeoTIFF, buka di QGIS → **Processing Toolbox → Raster tools → Generate XYZ tiles (Directory)**:
   - Extent: layer citra · Minimum zoom **9**, Maximum zoom **14** · Format PNG (atau JPG untuk RGB agar lebih kecil)
   - Output directory: `sigap-matim/tiles/s2_sebelum` (lalu ulangi untuk `s2_sesudah`, `ndvi_sebelum`, dst.)
   - Biarkan "Use inverted tile Y axis (TMS)" **tidak** dicentang.
6. Isi `config.js`:
   ```js
   citra: [
     { id: "s2_rgb", nama: "Sentinel-2 warna asli",
       sebelum: { url: "tiles/s2_sebelum/{z}/{x}/{y}.png", label: "Sebelum: median Mei–14 Agu 2026" },
       sesudah: { url: "tiles/s2_sesudah/{z}/{x}/{y}.png", label: "Sesudah: median 16 Agu–Okt 2026" },
       maxNativeZoom: 14 },
   ],
   citraTunggal: [
     { id: "dndvi", nama: "Selisih NDVI", url: "tiles/dndvi/{z}/{x}/{y}.png", maxNativeZoom: 14, opacity: 0.75 },
     { id: "s1_logratio", nama: "Perubahan backscatter Sentinel-1 (dB)", url: "tiles/s1_logratio/{z}/{x}/{y}.png", maxNativeZoom: 13, opacity: 0.75 }
   ],
   ```
7. Muat ulang halaman → tab **Citra** → **Bandingkan** → geser garis di peta.

Perkiraan ukuran: area Manggarai Timur pada zoom 9–14 ≈ 1.000–1.500 tile per layer, ±20–50 MB per layer. Masih di bawah batas GitHub Pages (1 GB per situs, file < 100 MB).

### Cara B
Hapus komentar blok **6B** di skrip, isi `BUCKET`, jalankan Tasks. URL di `config.js`: `https://storage.googleapis.com/NAMA-BUCKET/s2_sebelum/{z}/{x}/{y}` (buka satu tile di bucket untuk memastikan ada atau tidaknya ekstensi `.png`).

### Catatan metode
- Sentinel-2 di skrip memakai **Cloud Score+** untuk masking awan. Musim kemarau Agustus–Oktober di Flores umumnya cukup cerah, tetapi periksa tetap ada piksel kosong.
- Log-ratio Sentinel-1 GRD di GEE hanya mengukur perubahan amplitudo. **Coherence Change Detection** yang lebih sensitif terhadap bangunan butuh data SLC dan diproses di SNAP. Hasil SNAP bisa diunggah ke GEE sebagai asset atau langsung diubah menjadi tile di QGIS.
- Resolusi 10–20 m tidak cukup untuk menilai rumah satu per satu. Gunakan sebagai indikasi area, lalu validasi dengan foto UAV/citra resolusi tinggi/data BNPB.

## 6. Publikasi ke GitHub Pages

1. Buat repositori GitHub (misal `sigap-matim`), unggah seluruh isi folder (atau `git push` dari VS Code).
2. Repo → **Settings → Pages** → Source: *Deploy from a branch* → Branch `main` / folder `/ (root)` → Save.
3. Tunggu 1–2 menit, situs tersedia di `https://NAMA-AKUN.github.io/sigap-matim/`.
4. Setiap commit ke `main` otomatis memperbarui situs.

## 7. Pengujian (untuk Bab Pengujian & Evaluasi)

- **Black Box**: buat tabel uji untuk tiap fitur (filter kelas, filter kecamatan, popup, heatmap, posko terdekat, geser citra, feed USGS, tema gelap).
- **Usability**: System Usability Scale (10 butir, skor ≥ 68 dianggap baik) ke responden warga/mahasiswa.
- **Performa**: Chrome DevTools → Lighthouse, dan tab Network → throttling **Slow 4G / 3G** untuk mensimulasikan jaringan terbatas.
- **Ketelitian data**: confusion matrix (OA, PA, UA) antara kelas hasil citra dan data referensi.

## 8. Sumber data & atribusi
Peta dasar © OpenStreetMap contributors, Esri World Imagery, OpenTopoMap · Gempa: USGS Earthquake Hazards Program (FDSN) · Citra: Copernicus Sentinel-1/2 via Google Earth Engine · Data kerusakan resmi: BNPB · Leaflet (BSD-2), leaflet.heat (BSD-2), PapaParse (MIT).

Halaman ini untuk informasi dan kajian akademik, bukan sistem peringatan resmi.
