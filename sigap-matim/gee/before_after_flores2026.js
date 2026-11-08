/**************************************************************************
 * Sigap Manggarai Timur — citra sebelum/sesudah gempa Flores 15 Agu 2026
 * Jalankan di Google Earth Engine Code Editor (code.earthengine.google.com)
 *
 * Hasil:
 *   1. Sentinel-2 RGB median sebelum & sesudah
 *   2. NDVI sebelum & sesudah + selisih NDVI (indikasi longsor/vegetasi rusak)
 *   3. Sentinel-1 log-ratio backscatter VV (indikasi perubahan permukaan)
 *   4. Ekspor: (A) GeoTIFF ke Google Drive -> jadikan tile XYZ di QGIS
 *              (B) tile XYZ langsung ke Google Cloud Storage
 *   5. URL tile sementara (untuk uji cepat, kedaluwarsa)
 **************************************************************************/

// ---------- 1. PARAMETER (ubah di sini) ----------
var TGL_GEMPA   = '2026-08-15';
var SEBELUM     = ['2026-05-01', '2026-08-14'];   // jendela pra-gempa
var SESUDAH     = ['2026-08-16', '2026-10-31'];   // jendela pasca-gempa
var BUCKET      = 'NAMA-BUCKET-KALIAN';           // hanya untuk opsi B
var FOLDER_DRIVE = 'sigap_matim';

// Batas kajian. Ganti dengan asset batas resmi BIG yang di-upload:
//   var aoi = ee.FeatureCollection('projects/NAMA-PROJECT/assets/batas_matim').geometry();
var aoi = ee.Geometry.Rectangle([120.33, -9.00, 120.95, -8.22]);

Map.centerObject(aoi, 10);
Map.addLayer(ee.Image().paint(aoi, 0, 2), {palette: ['ffffff']}, 'AOI');

// ---------- 2. SENTINEL-2 (optik) dengan Cloud Score+ ----------
var csPlus = ee.ImageCollection('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED');
var CS_THRESHOLD = 0.6;   // 0.5–0.65; naikkan jika masih banyak awan

function s2Median(range) {
  return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(aoi)
    .filterDate(range[0], range[1])
    .linkCollection(csPlus, ['cs_cdf'])
    .map(function (img) {
      return img.updateMask(img.select('cs_cdf').gte(CS_THRESHOLD))
                .select(['B2', 'B3', 'B4', 'B8', 'B11'])
                .divide(10000);
    })
    .median()
    .clip(aoi);
}
var s2Pre  = s2Median(SEBELUM);
var s2Post = s2Median(SESUDAH);

var visRGB = {bands: ['B4', 'B3', 'B2'], min: 0.02, max: 0.18, gamma: 1.2};
Map.addLayer(s2Pre,  visRGB, 'S2 sebelum (RGB)', false);
Map.addLayer(s2Post, visRGB, 'S2 sesudah (RGB)');

// ---------- 3. NDVI & selisih ----------
var ndviPre  = s2Pre.normalizedDifference(['B8', 'B4']).rename('NDVI');
var ndviPost = s2Post.normalizedDifference(['B8', 'B4']).rename('NDVI');
var dNDVI    = ndviPost.subtract(ndviPre).rename('dNDVI');

var visNDVI  = {min: 0, max: 0.85, palette: ['a50026', 'f46d43', 'fee08b', 'd9ef8b', '66bd63', '006837']};
var visDNDVI = {min: -0.4, max: 0.4, palette: ['8e0152', 'de77ae', 'f7f7f7', '7fbc41', '276419']};
Map.addLayer(ndviPre,  visNDVI,  'NDVI sebelum', false);
Map.addLayer(ndviPost, visNDVI,  'NDVI sesudah', false);
Map.addLayer(dNDVI,    visDNDVI, 'Selisih NDVI (merah = turun)', false);

// ---------- 4. SENTINEL-1 log-ratio (GRD, VV) ----------
// Gunakan satu arah orbit yang sama (relative orbit sama) agar sebanding.
function s1(range) {
  return ee.ImageCollection('COPERNICUS/S1_GRD')
    .filterBounds(aoi)
    .filterDate(range[0], range[1])
    .filter(ee.Filter.eq('instrumentMode', 'IW'))
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
    .filter(ee.Filter.eq('orbitProperties_pass', 'DESCENDING'));  // cek ASCENDING jika data kosong
}
var s1PreCol  = s1(SEBELUM);
var s1PostCol = s1(SESUDAH);
print('Jumlah scene S1 sebelum / sesudah', s1PreCol.size(), s1PostCol.size());
print('Relative orbit tersedia (sebelum)', s1PreCol.aggregate_array('relativeOrbitNumber_start').distinct());

// GRD di GEE sudah dalam dB -> log-ratio = mean(dB post) - mean(dB pre). Speckle diredam focal median.
var s1Pre  = s1PreCol.select('VV').mean().focalMedian(30, 'circle', 'meters');
var s1Post = s1PostCol.select('VV').mean().focalMedian(30, 'circle', 'meters');
var logRatio = s1Post.subtract(s1Pre).rename('logratio_dB').clip(aoi);

var visLR = {min: -4, max: 4, palette: ['2166ac', '92c5de', 'f7f7f7', 'f4a582', 'b2182b']};
Map.addLayer(logRatio, visLR, 'S1 log-ratio VV (dB)', false);
// Catatan: CCD (penurunan koherensi) yang lebih sensitif untuk bangunan butuh data SLC
// dan diproses di SNAP, bukan di GEE. Hasil SNAP bisa diunggah sebagai asset lalu
// diekspor dengan cara yang sama seperti di bawah.

// ---------- 5. Versi RGB 8-bit siap jadi tile ----------
var rgbPre    = s2Pre.visualize(visRGB);
var rgbPost   = s2Post.visualize(visRGB);
var ndviPreV  = ndviPre.visualize(visNDVI);
var ndviPostV = ndviPost.visualize(visNDVI);
var dNDVIV    = dNDVI.visualize(visDNDVI);
var lrV       = logRatio.visualize(visLR);

// ---------- 6A. EKSPOR KE DRIVE (gratis, paling disarankan) ----------
// Hasil GeoTIFF -> QGIS: Processing > Raster tools > "Generate XYZ tiles (Directory)"
// zoom 9–14, format PNG/JPG, lalu salin folder tile ke repo /tiles/...
function toDrive(img, nama, skala) {
  Export.image.toDrive({
    image: img, description: nama, folder: FOLDER_DRIVE, fileNamePrefix: nama,
    region: aoi, scale: skala, crs: 'EPSG:4326', maxPixels: 1e10, fileFormat: 'GeoTIFF'
  });
}
toDrive(rgbPre,    's2_sebelum', 10);
toDrive(rgbPost,   's2_sesudah', 10);
toDrive(ndviPreV,  'ndvi_sebelum', 10);
toDrive(ndviPostV, 'ndvi_sesudah', 10);
toDrive(dNDVIV,    'dndvi', 10);
toDrive(lrV,       's1_logratio', 20);
// Data nilai asli (bukan visual) untuk analisis di QGIS/GeoDa:
toDrive(dNDVI.toFloat(),    'dndvi_nilai', 10);
toDrive(logRatio.toFloat(), 's1_logratio_nilai', 20);

// ---------- 6B. EKSPOR TILE LANGSUNG KE CLOUD STORAGE (opsional) ----------
// Butuh bucket GCS publik. Hapus komentar untuk memakai.
/*
function toTiles(img, nama) {
  Export.map.toCloudStorage({
    image: img, description: 'tiles_' + nama, bucket: BUCKET, path: nama,
    region: aoi, minZoom: 8, maxZoom: 14, fileFormat: 'png', writePublicTiles: true,
    skipEmptyTiles: true
  });
}
toTiles(rgbPre, 's2_sebelum');
toTiles(rgbPost, 's2_sesudah');
toTiles(dNDVIV, 'dndvi');
toTiles(lrV, 's1_logratio');
// URL di config.js: 'https://storage.googleapis.com/' + BUCKET + '/s2_sebelum/{z}/{x}/{y}'
// (buka satu file tile di bucket untuk memastikan ada/tidaknya ekstensi .png)
*/

// ---------- 7. URL TILE SEMENTARA (uji cepat saja) ----------
// URL ini KEDALUWARSA dalam beberapa jam/hari; jangan dipakai untuk versi final.
function printUrl(img, label) {
  img.getMap({}, function (m) { print(label, m.urlFormat); });
}
printUrl(rgbPre,  'URL sementara S2 sebelum');
printUrl(rgbPost, 'URL sementara S2 sesudah');
