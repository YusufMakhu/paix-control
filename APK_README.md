# PAIX Control — APK para Android

**Archivo:** [`PAIX-Control.apk`](PAIX-Control.apk) (≈5 MB) · paquete `com.paix.control` v1.0
APK **offline total**: toda la app va dentro; no necesita internet ni servidor. El Bluetooth usa el plugin **nativo** de Android (más fiable que Web Bluetooth).

## 📲 Instalar en tu móvil
1. Copia `PAIX-Control.apk` al teléfono (cable USB, Google Drive, Telegram a ti mismo, etc.).
2. Ábrelo desde el móvil. Android pedirá permitir **"Instalar apps desconocidas"** para esa app (Archivos/Chrome) → actívalo y continúa.
3. Instala. Aparecerá **PAIX Control** con su icono.
4. Al abrirla por primera vez, concede los permisos de **Bluetooth / dispositivos cercanos** cuando los pida.
5. Pulsa **Conectar** → elige **PAIX** en la lista → ¡a disfrutar! (Galería, emojis animados, editor, texto, animaciones, temas en Ajustes.)

> Está firmada con clave de depuración (perfecto para uso personal/sideload). Compatible con Android 6 hasta el 15+.

## 🔁 Recompilar (tras cambiar la web en `paix-web/`)
Requiere las herramientas ya instaladas en `C:\Users\YLOMA\.paix-tools` (JDK 21, Android SDK) y Node.js.

```powershell
$env:JAVA_HOME="C:\Users\YLOMA\.paix-tools\jdk\jdk-21.0.11+10"
$env:ANDROID_SDK_ROOT="C:\Users\YLOMA\.paix-tools\android-sdk"
cd G:\MakhuStudio\paix\app-android
npm run build                 # copia paix-web -> www y empaqueta el BLE nativo
.\node_modules\.bin\cap.cmd copy android
cd android
.\gradlew.bat assembleDebug --no-daemon
# APK -> android\app\build\outputs\apk\debug\app-debug.apk
```

## Notas técnicas
- La lógica (protocolo, animaciones nativas ≤9 frames, texto, emojis, editor) es **idéntica** a la web. Solo el **transporte BLE** se adapta: navegador = Web Bluetooth, APK = plugin nativo (`ble.js` + `native-ble.js`).
- Seguridad: la app **solo** escribe en la característica de control `19e97635…`; el servicio OTA `0000ffd0` jamás se toca.
- Para una versión "release" firmada con tu propia clave (actualizable a largo plazo), se puede generar un keystore y compilar `assembleRelease`; dímelo si lo quieres.
