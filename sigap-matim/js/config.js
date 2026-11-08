/* =====================================================================
   KONFIGURASI WEBGIS — file ini yang paling sering kalian edit.
   Tidak perlu menyentuh app.js untuk mengganti data, teks, atau citra.
   ===================================================================== */
window.SIGAP_CONFIG = {

  // true = tampilkan pita "DATA CONTOH". Ubah ke false setelah semua data diganti data asli.
  modeContoh: true,

  judul: "Sigap Manggarai Timur",
  subjudul: "Kerusakan bangunan, akses jalan, dan posko pascagempa Flores M7,7 · 15 Agustus 2026",

  // Pusat & zoom awal peta
  peta: { pusat: [-8.57, 120.66], zoom: 10, zoomMin: 8, zoomMaks: 18 },

  // ---------------------------------------------------------------
  // SUMBER DATA. Boleh path lokal (folder data/) ATAU URL CSV dari
  // Google Sheets: File > Bagikan > Publikasikan ke web > format CSV.
  // ---------------------------------------------------------------
  data: {
    batas: "data/batas_wilayah.geojson",
    bangunan: "data/kerusakan_bangunan.csv",     // kolom wajib: id, lat, lon, kecamatan, kelas
    posko: "data/posko.csv",                     // kolom wajib: id, nama, jenis, lon, lat
    jalan: "data/jalan.geojson",                 // properti wajib: nama, status (normal/rusak/putus)
    indikasi: "data/indikasi_kerusakan.geojson"  // properti wajib: indeks (0–1), kelas
  },

  // Angka resmi agregat kabupaten (sumber: verifikasi BNPB, dikutip di proposal Bab I).
  // Perbarui angka & tanggal setiap ada rilis baru.
  ringkasanResmi: {
    sumber: "BNPB, verifikasi rumah rusak (sementara)",
    tanggal: "2026-08-25",
    RB: 1078, RS: 1499, RR: 2085, TR: 2704
  },

  // Gempa utama (BMKG). Ganti koordinat dengan nilai resmi BMKG/USGS.
  gempaUtama: {
    nama: "Gempa Flores M7,7",
    waktu: "2026-08-15T05:58:00+08:00",
    lat: -8.34, lon: 121.54, kedalamanKm: 15, magnitudo: 7.7,
    keterangan: "30 km timur laut Mbay, Nagekeo (BMKG). Sesar naik busur belakang Flores."
  },

  // Gempa susulan langsung dari katalog USGS (FDSN).
  gempaSusulan: {
    aktif: true,
    mulai: "2026-08-14",
    kotak: { latMin: -9.4, latMaks: -7.6, lonMin: 119.6, lonMaks: 122.6 },
    magMin: 2.5,
    refreshMenit: 5
  },

  // ---------------------------------------------------------------
  // CITRA SEBELUM–SESUDAH (dari Google Earth Engine).
  // Isi 'url' dengan pola tile XYZ {z}/{x}/{y}. Lihat README bagian GEE.
  // Contoh hasil QGIS "Generate XYZ tiles": "tiles/s2_sebelum/{z}/{x}/{y}.png"
  // Contoh hasil Export.map GEE ke Cloud Storage:
  //   "https://storage.googleapis.com/NAMA-BUCKET/s2_sebelum/{z}/{x}/{y}"
  // Biarkan url kosong ("") jika belum ada; layer tidak akan muncul di daftar.
  // ---------------------------------------------------------------
  citra: [
    { id: "s2_rgb", nama: "Sentinel-2 warna asli",
      sebelum: { url: "", label: "Sebelum: median Mei–14 Agu 2026" },
      sesudah: { url: "", label: "Sesudah: median 16 Agu–Okt 2026" },
      maxNativeZoom: 14 },
    { id: "ndvi", nama: "NDVI (indikasi longsor)",
      sebelum: { url: "", label: "NDVI sebelum" },
      sesudah: { url: "", label: "NDVI sesudah" },
      maxNativeZoom: 14 }
  ],
  // Layer tunggal (bukan pasangan), misalnya selisih NDVI atau log-ratio SAR Sentinel-1
  citraTunggal: [
    { id: "s1_logratio", nama: "Perubahan backscatter Sentinel-1 (dB)", url: "", maxNativeZoom: 13, opacity: 0.75 },
    { id: "dndvi", nama: "Selisih NDVI (sesudah − sebelum)", url: "", maxNativeZoom: 14, opacity: 0.75 }
  ],
  // Tautan Earth Engine App (opsional) untuk eksplorasi interaktif di GEE
  tautanGeeApp: "",

  // Formulir laporan warga (misal Google Form). Kosongkan untuk menyembunyikan tombol.
  tautanLaporan: "",

  tim: "Kelompok 14 PRGG 2026 · Teknik Geodesi UGM",
  pembimbing: "Cecep Pratama, S.Si., M.Si., D.Sc."
};
