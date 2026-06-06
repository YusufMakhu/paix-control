<div align="center">

# PAIX Control

**A local, cloud-free Bluetooth controller for the discontinued PAIX "BackPAIX" round LED badge — reverse-engineered and rebuilt from scratch.**

Made by **[Makhu Studio](https://github.com/YusufMakhu) · YusufMakhu**

[![Demo web](https://img.shields.io/badge/%E2%96%B6%20demo%20web-probar-8e24aa)](https://yusufmakhu.github.io/paix-control/paix-web/)
[![Descargar APK](https://img.shields.io/badge/descargar-APK-3ddc84?logo=android&logoColor=white)](https://github.com/YusufMakhu/paix-control/releases/latest)
[![Licencia](https://img.shields.io/badge/licencia-uso%20personal%20%C2%B7%20no%20comercial-orange)](LICENSE)
[![Donar](https://img.shields.io/badge/PayPal-donar-00457C?logo=paypal&logoColor=white)](https://yusufmakhu.github.io/paix-control/donate.html)

</div>

---

## Why this exists

The **BackPAIX Smart Badge** (a 2016 Kickstarter by PAIX Design) is a wearable round LED matrix you controlled from a phone app over Bluetooth. The company shut down and its cloud (AWS + `backpaix.com`) went dark, so the **official app no longer works** — leaving the hardware bricked-by-abandonment.

**PAIX Control** brings it back to life. The BLE protocol was reverse-engineered from the original app, and this is a brand-new controller — **100% local, no cloud, no accounts** — that runs as a web app *and* as a native Android APK.

## Features

- 🔌 Connect over Bluetooth and keep the link alive (the badge reverts to its logo on disconnect).
- 🖼️ **Built-in patterns** (the firmware's emoji ROM) — smile, wink, sun, snow, logo…
- 😄 **Full-screen animated emoji faces** — wink, blow-kiss, laugh, heart-eyes, blink… (looped natively on-device).
- 🎨 **Circular 14×14 pixel editor** with outer-ring color — draw your own designs.
- 📝 **Scrolling text** with a built-in 5×7 font + insertable mini-icons (♥ ★ ☀ …), continuous loop.
- 🎬 **Animation library** (turn signals, heartbeat, spinner, rain, countdown…) + a **frame-by-frame animation editor** with timeline.
- 🕒 Clock mode, manual command console.
- 💾 Local save + JSON import/export. 🎨 In-app theme (accent colors + backgrounds).
- 📱 Installable **offline Android APK** (Capacitor) — or run as a Web Bluetooth PWA in Chrome.

## How it works

The hardware is a **14×14 monochrome circular LED matrix** (~156 pixels) plus a 32-LED color outer ring, driven by a Realtek RTL8762 BLE SoC.

- Commands are written to a single GATT characteristic, chunked into 20-byte fragments.
- A custom image = `2201` then `23` + ring-color byte + 14×`uint16` rows.
- **Animations are native**: up to **9 frames** are uploaded once (`22 NN` + per-frame durations) and the badge loops them autonomously — *no continuous streaming*, which would overload its 8051 controller and disconnect.

The full reverse-engineered protocol is documented in **[PAIX_PROTOCOL.md](PAIX_PROTOCOL.md)**.

> ⚠️ **Safety:** the app only ever writes to the control characteristic `19e97635…`. The firmware-update (OTA) service `0000ffd0…` is **never touched** — writing there could brick the device.

## Get it / try it

- ▶️ **Live demo (no install):** open **<https://yusufmakhu.github.io/paix-control/paix-web/>** in **Chrome on Android** with your badge nearby. (Web Bluetooth needs a secure context — `github.io` is HTTPS.)
- 📥 **Native Android app:** **[download the latest APK](https://github.com/YusufMakhu/paix-control/releases/latest)** — fully offline. Install guide in **[APK_README.md](APK_README.md)**.

## Run / build it yourself

**Web (Chrome on Android, or desktop Edge/Chrome):** serve the `paix-web/` folder over HTTPS (or `localhost`) and open it — Web Bluetooth requires a secure context.

```bash
cd paix-web
python -m http.server 5179   # then open http://localhost:5179 in Chrome/Edge
```

**Android APK (offline):** see **[APK_README.md](APK_README.md)**. In short, with Node + the Android SDK:

```bash
cd app-android
npm install
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

## Project layout

| Path | What |
|---|---|
| `paix-web/` | The app (HTML/JS, no framework): UI, pixel/animation engine, fonts, BLE transport |
| `paix-web/ble.js` | BLE transport abstraction — Web Bluetooth in the browser, native plugin in the APK |
| `PAIX_PROTOCOL.md` | Reverse-engineered BLE protocol reference |
| `paix_test.py` | Python/`bleak` test harness used during reverse-engineering |
| `app-android/` | Capacitor project that wraps `paix-web/` into an offline APK |

## 🔒 Privacy & source-available

All the source is here and fully inspectable — there's **no analytics, no telemetry, no ads/tracking, and no servers**. The app only talks to **your** badge over Bluetooth; nothing ever leaves your device, and your designs are stored locally (IndexedDB / `localStorage`). Read the code, it's all here.

## ❤️ Support

This was a labour of love to revive abandoned hardware. If it made you smile, a small tip is welcome — completely optional:

[![Donate with PayPal](https://img.shields.io/badge/PayPal-Buy%20me%20a%20coffee-00457C?logo=paypal&logoColor=white&style=for-the-badge)](https://yusufmakhu.github.io/paix-control/donate.html)

## Disclaimer

Independent, non-commercial interoperability project for hardware **you own**. Not affiliated with or endorsed by PAIX Design. This repository contains **only original work** — it does **not** redistribute the official app's code, binaries, or assets.

## License

**Personal-use license** © 2026 **Makhu Studio (YusufMakhu)** — sole owner.
Free for **personal, non-commercial** use; sharing it free of charge is welcome and donations are appreciated. **Selling, reselling or any commercial use is NOT permitted** — that right is reserved exclusively to the owner. See **[LICENSE](LICENSE)**.
