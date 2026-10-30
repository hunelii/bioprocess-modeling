# Bioprocess 3D & Huner Biofoundry Embed Contract

Bu doküman, **Huner Biofoundry** ana web sitesi (`https://hunelii.github.io/huner-biofoundry/`) ile **Bioprocess 3D** interaktif modülü (`https://hunelii.github.io/bioprocess-modeling/`) arasındaki iframe entegrasyonu, `postMessage` haberleşme protokolü, devir (handoff) sırası ve görsel hücre eşleştirme değerlerini tanımlar.

---

## 1. Embed Modu (`?embed=1`)

Bioprocess 3D `?embed=1` parametresi ile açıldığında otomatik olarak gömülü moda geçer:
- **Scroll Devre Dışı:** Sayfanın yerel `ScrollTrigger` ve wheel/touch dinleyicileri tamamen kapatılır.
- **Viewport Kilitleme:** `html` ve `body` üzerinde `overflow: hidden`, `height: 100vh`, `width: 100vw`, `margin: 0`, `padding: 0` uygulanır. Sayfa içi kaydırma çubuğu ve yapay spacer yüksekliği oluşmaz.
- **Tam Ekran Canvas:** Üst başlıklar, bölüm metinleri, aşama navigasyon düğmeleri ve alt bilgi çubuğu gizlenir; 3D WebGL Canvas tüm iframe alanını doldurur (`100vw × 100vh`).
- **Harici Sürüş:** Kamera ve sahne ilerlemesi iframe dışından gelen `postMessage` paketleriyle yönetilir.
- **Bağımsız Mod Uyumluluğu:** Sayfa `?embed=1` olmadan açıldığında tüm bağımsız site fonksiyonları (ScrollTrigger, klavye kısayolları, chapter metinleri) eksiksiz çalışmaya devam eder.

---

## 2. postMessage İletişim Sözleşmesi

Tüm mesajlar standart `window.postMessage` API'si üzerinden JSON formatında iletilir.

### 2.1. Bioprocess 3D → Huner (Parent)

| Mesaj Tipi | Payload Şeması | Açıklama |
| :--- | :--- | :--- |
| `bioprocess:ready` | `{ type: 'bioprocess:ready', version: 1, stations: 8 }` | Sahne açılışında shader'lar derlenip (`gl.compile`) ilk ısınma karesi çizildikten sonra iletilir. Huner artık devir animasyonunu başlatabilir. |
| `bioprocess:error` | `{ type: 'bioprocess:error', reason: string }` | WebGL desteği olmaması, context kaybı veya kritik bir render hatasında iletilir; Huner statik poster/yedek görünüme geçebilir. |

### 2.2. Huner (Parent) → Bioprocess 3D

| Mesaj Tipi | Payload Şeması | Değer Aralığı | Açıklama |
| :--- | :--- | :--- | :--- |
| `huner:handoff` | `{ type: 'huner:handoff', t: number }` | `t ∈ [0, 1]` | Hücre devir animasyonu. `t = 0` anında hücre kapalı ve parlar, `t = 1` anında Station 01 normal başlangıç durumuna oturur. Bu sırada `p = 0` sabittir. |
| `huner:progress` | `{ type: 'huner:progress', p: number }` | `p ∈ [0, 1]` | Bioprocess 3D'nin Station 01'den Station 08 (ve Coda overview) aşamalarına doğru kamera ve süreç yolculuğu. |
| `huner:visibility` | `{ type: 'huner:visibility', visible: boolean }` | `true / false` | İframe ekran dışında kaldığında render döngüsü durdurulur (`invalidate()` kesilir), GPU ve pil tüketimi %0'a iner. |

### 2.3. Güvenlik ve Doğrulama
Bioprocess 3D gelen mesajları sıkı bir güvenlik filtresinden geçirir:
- **İzin Verilen Origin'ler:**
  - `https://hunelii.github.io`
  - `http://localhost:*` ve `https://localhost:*`
  - `http://127.0.0.1:*` ve `https://127.0.0.1:*`
- **Şema Doğrulama:** `p` ve `t` değerleri sayısal kontrolünden geçirilir ve `[0, 1]` aralığına kenetlenir (`clamp01`). Geçersiz tipler veya bilinmeyen mesaj yapıları yok sayılır.

---

## 3. Devir Sırası (Handoff Lifecycle, `t: 0 → 1`)

Huner Biofoundry akışı:
1. Hücreye yaklaşma
2. Büyüme
3. Duvar açılması (organel kesiti)
4. Duvarın geri kapanması
5. Hücrenin içten parlaması
6. **Bioprocess Devri Başlar (`t: 0 → 1`):**

### Handoff Aşamaları:
- **`t = 0` (Tepe Parlama Anı):**
  - Sahne **yalnızca** kapalı ve içten parlayan kahraman hücreyi (`A_spore_illustrative`) gösterir.
  - Arka plan ve sis rengi Huner'in "05 / INSIDE LIFE" sahnesinin koyu yeşiliyle birebir aynıdır: `#22311d`.
  - Kamera hücreye yakın konumdadır (`FOV: 35.0°`, mesafe ~0.54m); hücre ekranın tam ortasında Huner'deki kapalı hücre ölçeğinde görünür.
  - Laboratuvar donanımları, hacimsel god-ray ışık demeti ve bokeh parçacıkları gizlidir (opaklık = 0).
  - İç parlama (`uGlow`) maksimum seviyededir (2.8).
- **`t: 0 → 1` (Geri Çekilme ve Belirme):**
  - İç parlama (`uGlow`) yumuşakça sönümlenir (`(1 - t) * 2.8`).
  - Kamera aynı bakış açısı doğrultusunda geri çekilerek Station 01 normal açısına oturur (`position: [1.18, -1.55, 1.72]`, `target: [1.2, -0.03, 1.37]`, `FOV: 32.0°`).
  - Arka plan rengi `#22311d`'den Bioprocess'in koyu uzay rengi olan `#07120d`'ye yumuşakça enterpole olur.
  - Hacimsel god-ray ışık demeti (`beamShader`), bokeh parçacıkları ve mikrometre donanım tablası yumuşakça belirir.
- **`t = 1` (Station 01 Hazır Durumu):**
  - Devir tamamlanmıştır. Kullanıcı sayfayı kaydırdıkça Huner `huner:progress` mesajı gönderir ve Station 01 → 08 yolculuğu başlar.
- **Tersine Çevrilebilirlik:** Tüm geçişler tamamen deterministik matematiksel fonksiyonlara bağlıdır; kullanıcı yukarı kaydırdığında hiçbir sıçrama veya ani kaybolma olmadan aynı yoldan `t = 0` parlayan hücreye geri döner.

---

## 4. Hücre Eşleştirme Değerleri (Cell Matching Constants)

Bioprocess 3D kahraman sporu ile Huner Biofoundry hücresini görsel olarak eşitlemek için kullanılan birebir değerler:

### 4.1. Renk Paleti (Colors)
| Tanım | HEX Kodu | RGB Değeri | Açıklama |
| :--- | :--- | :--- | :--- |
| **Huner Arka Planı** | `#22311d` | `(34, 49, 29)` | Huner hücre sahnesi arka planı (`t = 0` başlangıcı) |
| **Bioprocess Arka Planı** | `#07120d` | `(7, 18, 13)` | Bioprocess derin laboratuvar arka planı (`t = 1`) |
| **Tepe Parlama (Peak Glow)** | `#d8ffb8` | `(216, 255, 184)` | Devir anında hücrenin içten yaydığı ışıma |
| **Kitin Hücre Duvarı** | `#6c8056` | `(108, 128, 86)` | Dış basidiyospor kabuğu |
| **Kesit Duvar Kenarı** | `#b8bc8b` | `(184, 188, 139)` | Açılan kitin duvarı katmanları ve lipid başlıkları |
| **Plazma Zarı (Membrane)** | `#607548` | `(96, 117, 72)` | Çift katmanlı fosfolipid zar |
| **Sitoplazma (Cytoplasm)** | `#354c2b` | `(53, 76, 43)` | İç sitoplazmik sıvı matrisi |
| **Ribozomlar (Ribosomes)** | `#b0b68d` | `(176, 182, 141)` | Sitoplazmik ve ER ribozom tanecikleri |
| **Çekirdek Kılıfı (Nucleus)**| `#a87b48` | `(168, 123, 72)` | Nükleer zar kılıfı |
| **Çekirdekçik & Porlar** | `#d2b481` | `(210, 180, 129)` | Nükleolus gövdesi ve nükleer por halkaları |
| **Kromatin DNA** | `#74502d` | `(116, 80, 45)` | Sarmal DNA filament tüpleri |
| **Vakuol (Vacuole)** | `#b7c59d` | `(183, 197, 157)` | Sıvı dolu vakuol kesesi |
| **Mitokondri Dış Zar** | `#9eae76` | `(158, 174, 118)` | Mitokondri dış kılıfı |
| **Mitokondri Matriksi** | `#57693d` | `(87, 105, 61)` | Mitokondri iç sıvısı |
| **Mitokondri Krista** | `#c0c893` | `(192, 200, 147)` | Kıvrımlı iç krista sırtları |

### 4.2. Geometri ve Ölçek (Geometry & Scale)
- **Spore Dünya Konumu:** `SPORE_ANCHOR = [1.2, -0.03, 1.37]`
- **Spore Ölçeği:** `specimenScale = [0.128, 0.082, 0.168]`
- **Ekranda Kapladığı Dikey Açıklık Oranı:** `0.67` (Huner'deki kapalı hücre ölçeğiyle eşleştirilmiştir)
- **Hilum / Apikulus Çıkıntısı:** `[-0.28, 0.0, -0.76]`

### 4.3. Rotasyon ve Yönelim (Rotation)
- **Handoff Başlangıç Rotasyonu (`t = 0`):** `rotation = [-0.24, 0.22, -0.36]` (ekran merkezine dönük kapalı hücre)
- **Station 01 Başlangıç Rotasyonu (`t = 1`):** `rotation = [-0.24, 0.22, -0.36]` (kesintisiz devamlılık)

### 4.4. Kamera Konfigürasyonu (Camera)
- **Handoff Yakın Konumu (`t = 0`):** `position = [1.193, -0.56, 1.49]` (hücreye ~0.54m mesafe)
- **Handoff Kamera Açısı (`t = 0`):** `FOV = 35.0°` (Huner `FungalCell` FOV değeri ile birebir eşleşme)
- **Station 01 Normal Konumu (`t = 1`):** `position = [1.18, -1.55, 1.72]` (hücreye ~1.56m mesafe)
- **Station 01 Kamera Açısı (`t = 1`):** `FOV = 32.0°` (Bioprocess 3D normal FOV değeri)
- **Kamera Hedefi (Target):** `[1.2, -0.03, 1.37]` (Devir boyunca `SPORE_ANCHOR` üzerinde kilitlidir)

### 4.5. Aydınlatma Değerleri (Lighting)
- **Hacimsel Demet Yönü:** `(-0.45, -0.35, 0.82)`
- **Dolgu Işık Yönü:** `(0.6, -0.5, -0.4)`
- **İç Işıma Şiddeti (`uGlow`):** `t = 0` anında `2.8`, `t = 1` anında `0.0`.

---

## 5. Örnek Entegrasyon Kodu (Huner Tarafı)

```html
<!-- Huner Biofoundry HTML / React İçinde -->
<iframe
  id="bioprocess-frame"
  src="https://hunelii.github.io/bioprocess-modeling/?embed=1"
  style="width: 100vw; height: 100vh; border: none; display: block;"
  allow="autoplay"
/>
```

```javascript
// Huner Biofoundry JavaScript Kontrolcüsü
const iframe = document.getElementById('bioprocess-frame');
const bioprocessOrigin = 'https://hunelii.github.io';

// 1. Ready ve Error Dinleyicisi
window.addEventListener('message', (event) => {
  if (event.origin !== bioprocessOrigin) return;
  const { type, reason, version, stations } = event.data || {};

  if (type === 'bioprocess:ready') {
    console.log(`Bioprocess hazır (v${version}, ${stations} istasyon).`);
  } else if (type === 'bioprocess:error') {
    console.warn('Bioprocess WebGL hatası:', reason);
    // Statik yedeğe geç
  }
});

// 2. Devir (Handoff) Gönderimi (Huner scroll aşaması 05 -> 06 geçişi)
function onHunerScroll(handoffValue, journeyProgress, isVisible) {
  if (!iframe.contentWindow) return;

  // Görünürlük kontrolü
  iframe.contentWindow.postMessage({
    type: 'huner:visibility',
    visible: isVisible
  }, bioprocessOrigin);

  if (handoffValue < 1.0) {
    // Devir aşaması: t: 0 -> 1
    iframe.contentWindow.postMessage({
      type: 'huner:handoff',
      t: Math.max(0, Math.min(1, handoffValue))
    }, bioprocessOrigin);
  } else {
    // Bioprocess yolculuk aşaması: p: 0 -> 1
    iframe.contentWindow.postMessage({
      type: 'huner:progress',
      p: Math.max(0, Math.min(1, journeyProgress))
    }, bioprocessOrigin);
  }
}
```
