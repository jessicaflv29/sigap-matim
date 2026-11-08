/**************************************************************************
 * Earth Engine App: geser sebelum/sesudah (opsional)
 * Tempel di Code Editor, lalu Apps > New App > Publish.
 * Tautan App ditaruh di js/config.js -> tautanGeeApp.
 **************************************************************************/
var aoi = ee.Geometry.Rectangle([120.33, -9.00, 120.95, -8.22]);
var csPlus = ee.ImageCollection('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED');
function s2(a, b) {
  return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED').filterBounds(aoi).filterDate(a, b)
    .linkCollection(csPlus, ['cs_cdf'])
    .map(function (i) { return i.updateMask(i.select('cs_cdf').gte(0.6)).divide(10000); })
    .median().clip(aoi);
}
var vis = {bands: ['B4', 'B3', 'B2'], min: 0.02, max: 0.18, gamma: 1.2};
var kiri = ui.Map(), kanan = ui.Map();
kiri.addLayer(s2('2026-05-01', '2026-08-14'), vis, 'Sebelum');
kanan.addLayer(s2('2026-08-16', '2026-10-31'), vis, 'Sesudah');
kiri.add(ui.Label('Sebelum gempa (Mei – 14 Agu 2026)'));
kanan.add(ui.Label('Sesudah gempa (16 Agu – Okt 2026)', {position: 'top-right'}));
var linker = ui.Map.Linker([kiri, kanan]);
var split = ui.SplitPanel({firstPanel: kiri, secondPanel: kanan, wipe: true, style: {stretch: 'both'}});
ui.root.widgets().reset([split]);
kiri.centerObject(aoi, 10);
