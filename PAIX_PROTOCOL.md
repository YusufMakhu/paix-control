# PAIX — Protocolo BLE reconstruido (referencia)

> Reconstruido por ingeniería inversa de `com.paix.paix` v3.0 (`classes30.dex`, decompilado con jadx en [src/](src)).
> Verificado leyendo el código fuente; las marcas *(hipótesis)* requieren confirmación en hardware.
>
> ## ⛔ REGLA DE SEGURIDAD ABSOLUTA
> **NUNCA** escribir en el servicio OTA **`0000ffd0-0000-1000-8000-00805f9b34fb`** ni sus características (`ffd1/ffd3/ffd4` de base estándar). Es la actualización de firmware (Realtek/RealSil, clases `com.realsil.*`). Escribir ahí puede **inutilizar (brick)** el dispositivo. El control normal **no lo usa jamás**.

---

## 1. Mapa BLE

| Rol | Servicio | Característica | Op | 
|---|---|---|---|
| **WRITE de comandos** | `2e6f1d15-f1c5-4bf6-be38-6e03817cba10` | `19e97635-4207-4c41-a78f-57a7fbd342d0` | Write **con respuesta** |
| Versión FW (solo leer) | `0000d0ff-3c17-d293-8e48-14fe2e4da212` | `0000ffd4-0000-1000-8000-00805f9b34fb` | Read → `uint16` little-endian |
| Batería (estándar) | `0000180f` | `00002a19` | Read/Notify |
| Device Info (estándar) | `0000180a` | — | Read |
| **OTA — PROHIBIDO** | `0000ffd0-...` | `ffd1/ffd3/ffd4` | ⛔ no tocar |

- **Todos los comandos** se escriben en `19e97635…` (`writeCodeChar`).
- **No hay handshake** al conectar: la app solo hace `discoverServices()` + una lectura de la versión FW. No manda nada automáticamente.
- **No se activan notificaciones** (la app nunca llama a `setNotification` / CCCD `00002902`). El protocolo de control es **unidireccional** (fire-and-forget). *(Hipótesis a probar: habilitar CCCD podría revelar respuestas del dispositivo.)*
- **Sin autenticación.**

### Motor de envío (replicar exactamente)
1. La cadena **hex ASCII** → `byte[]` (2 chars = 1 byte).
2. Si `len > 20`: trocear en fragmentos de **20 bytes**; un fragmento por escritura.
3. **Write con respuesta** y esperar la confirmación (`onCharacteristicWrite`) antes del siguiente fragmento (semáforo). Equivale a `writeValueWithResponse()` (Web Bluetooth) / `write_gatt_char(..., response=True)` (bleak). Timeout de seguridad ~500 ms por fragmento.

### Dos "modos" según el nombre BLE anunciado
- **`PAIX`** = badge de matriz redonda **(NUESTRO dispositivo)** → opcode `0x23` = **imagen**.
- **`MOODTORCH`** = torch de color RGB (otro producto) → opcode `0x23` = color/efecto RGB; su app antepone siempre `2201`.

---

## 2. Tabla de comandos (todo es hex ASCII)

| Comando | Familia | Plantilla | Significado | Confianza |
|---|---|---|---|---|
| `07XX` | Preset de firmware | `07` + `XX` | Muestra un gráfico almacenado en la ROM del badge (índice `XX`). | Alta |
| `2201` | Selector "custom view" | `2201` | Precede a las imágenes `23…`. *(¿obligatorio? a probar)* | Alta |
| `23` + img | **Imagen matriz** | `23` + `CC` + 14×`RRRR` = **30 bytes** | `CC`=color anillo (00–09); 14 filas × `uint16` big-endian (bitmap 14×14). Ver §3. Sin checksum ni longitud. | Alta |
| `2209` + 9×`05` | Marquesina | `2209 05 05 05 05 05 05 05 05 05` (11 B) | Activa scroll; luego se envían 9 frames `23…` desplazados 1 celda. Los 9 `05` = velocidad/pasos *(hipótesis)*. | Media |
| `1900` + `HH MM SS` | Reloj | `1900` + hora | Cada campo = `toHexString(valorDecimal)` → 59 = `0x3B` (**no BCD**). Apagar reloj = `0704`. | Alta |
| `23` + RGB | **(Solo MOODTORCH)** color/efecto | `23` + `00`×9 + `EF` + `GG 00 RR 00 BB` + `00`×14 | Orden **G,R,B**; RGB premultiplicado por brillo. `EF`=efecto. *No aplica al badge PAIX.* | Media |

### Sub-códigos `07XX` (presets de ROM)
| Hex | Patrón | | Hex | Patrón |
|---|---|---|---|---|
| `0701` | logo PAIX | | `0710` | xd |
| `0704` | smile (display por defecto) | | `0711` | surprised |
| `0709` | hi | | `0717` | listening |
| `070A` | snow | | `0718` | star |
| `070B` | rain | | `0705` | **armar alarma** |
| `070C` | sun | | `0706` | **desarmar alarma** |
| `070D` | wink | | `0702/0703` | biker giro izq/der |
| `070F` | unhappy | | `0708` | biker stop |

> Catálogo completo a barrer en hardware: índices `0x00`–`0x20` (puede haber presets ocultos).

### Códigos de color del anillo exterior (`CC` en la imagen `23`)
`00` negro · `01` blanco · `02` rojo · `03` verde · `04` azul · `05` cian · `06` amarillo · `07` morado (def.) · `08` rojo claro · `09` rosa.

---

## 3. Codificación de imagen (14×14 monocromo) — RESUELTO

- **Matriz lógica 14×14** recortada a círculo (~156 LEDs activos). **Monocromo, 1 bit/píxel.**
- Estado = `short[14]` (`picBitmap`): **un `uint16` por fila** (Y = 0 arriba … 13 abajo). Dentro de cada fila, **la columna X se mapea al bit `13 - X`** → **X=0 es el bit 13 (MSB de los 14)**, X=13 es el bit 0. Bits 15 y 14 siempre 0.
  - encender: `fila[Y] |= 1 << (13 - X)`
  - apagar: `fila[Y] &= ~(1 << (13 - X))`
- **Serialización**: filas 0→13 en orden; cada fila como **4 hex = `uint16` big-endian**. 14×4 = **56 hex = 28 bytes**.
- **Máscara circular** por fila (esquinas siempre apagadas): filas 0/13 → 6 px (`0x03F0`), 1/12 → 8 (`0x07F8`), 2/11 → 10 (`0x0FFC`), 3/10 → 12 (`0x1FFE`), 4–9 → 14 (`0x3FFF`).
- **Trama completa**: `"23" + CC + fila0..fila13` = `23` + 1 byte + 28 bytes = **30 bytes** (se envía en 2 fragmentos: 20 + 10).
- **Subir un diseño** (como hace la app): enviar `2201`, luego la trama `23…`.

### Vectores de prueba conocidos
- **Cara por defecto** (`initNewView`): filas `{0,0,0,816,816,816,816,0,3084,1560,1008,0,0,0}`, anillo `07`:
  `2307 000000000000033003300330033000000C0C061803F0000000000000`
- **Imagen vacía** (solo anillo morado): `2307` + `0000`×14.
- **1 píxel** (esquina sup-izq lógica, X=0 Y=0 → bit13 fila0): `2300` + `2000` + `0000`×13.

---

## 3bis. Animaciones — modo NATIVO (crítico para estabilidad) ✅ verificado en hardware

⚠️ **El streaming continuo de fotogramas CUELGA el dispositivo.** Mandar imágenes `23` en bucle a >5 fps satura el firmware (8051): a los ~15-20 s **se desconecta y deja de anunciarse** hasta reiniciarlo. La app oficial **nunca** hacía streaming.

**Mecanismo nativo correcto** (de `DisplayFragment.showSyncDialog`, verificado): se suben **N fotogramas UNA sola vez** y el badge los **reproduce en bucle él solo**, sin más tráfico (sigue animando aunque desconectes el BLE):

```
1) cabecera:  22 NN d0 d1 ... d(N-1)      // 22=display, NN=nº de frames, dk=duración del frame k
2) N frames:  por cada frame  ->  23 CC R0..R13   (sin 2201 entre ellos)
```

- **NN máximo ≈ 9** (probado: `2209…` anima perfecto; con NN=40 no reproduce bien → el buffer es ~9). 
- `dk` = duración/velocidad de cada frame (la app usa `05` para todos). Valores mayores = más lento *(a confirmar el rango exacto)*.
- Cada frame es la misma trama de imagen de §3 (`23` + color anillo + bitmap 14×14).
- **Una imagen estática** se manda con `2201` + `23…` (como en §3). **Una animación** (≥2 frames) se manda con la cabecera `22 NN …`.
- **Texto**: como el buffer es ~9, el texto largo se muestra **por páginas** (ventanas de 14 px que cubren la frase) usando este mismo mecanismo nativo. El scroll suave píxel a píxel NO es viable (requeriría streaming).

## 4. Notas de comportamiento
- **Alarma antirrobo**: la detección es por pérdida de enlace BLE y la **sirena la hace el teléfono** (`R.raw.alarm` + vibración). El badge solo recibe `0705`/`0706`.
- **Biker**: al armarlo, la app **desconecta** el BLE; el modo corre autónomo en el badge.
- **Versión FW**: `uint16` little-endian desde `0000ffd4`. Solo informativo (la app lo usaba para ofrecer OTA por la nube, ya muerta).
