#!/usr/bin/env python3
"""
PAIX badge LED — arnes de pruebas BLE seguro (ingenieria inversa).

El badge REVIERTE a su logo al perder la conexion BLE, asi que las pruebas
mantienen la conexion abierta (--hold segundos) para poder observar.

Uso (python per-user):
  py -3.12 paix_test.py scan
  py -3.12 paix_test.py info
  py -3.12 paix_test.py --hold 8 send 0704
  py -3.12 paix_test.py --hold 8 face
  py -3.12 paix_test.py demo            # bateria guiada en UNA conexion
  py -3.12 paix_test.py --hold 8 disc | top | bottom | left | right
  py -3.12 paix_test.py --hold 8 pixel 6 0
  py -3.12 paix_test.py sweep 0 32      # barre presets 07XX (cada uno 'step' s)

SEGURIDAD: solo escribe en 19e97635-...; cualquier 0000ffd* (OTA) aborta.
"""
import argparse
import asyncio
import sys
import time
from datetime import datetime

from bleak import BleakScanner, BleakClient

WRITE_SERVICE = "2e6f1d15-f1c5-4bf6-be38-6e03817cba10"
WRITE_CHAR    = "19e97635-4207-4c41-a78f-57a7fbd342d0"
FW_CHAR       = "0000ffd4-0000-1000-8000-00805f9b34fb"
BATTERY_CHAR  = "00002a19-0000-1000-8000-00805f9b34fb"
OTA_BANNED_PREFIX = "0000ffd"     # ffd0..ffd4: OTA/version, NUNCA escribir
NAME_FILTER = {"PAIX", "MOODTORCH"}
CHUNK = 20

# Mascara circular por fila (de CustomCircleView.andPicBitmap): que columnas
# son validas en cada fila de la matriz 14x14.
CIRCLE_MASK = [0x03F0, 0x07F8, 0x0FFC, 0x1FFE, 0x3FFF, 0x3FFF, 0x3FFF,
               0x3FFF, 0x3FFF, 0x3FFF, 0x1FFE, 0x0FFC, 0x07F8, 0x03F0]
# Cara por defecto del editor (EditFragment.initNewView).
FACE_ROWS = [0, 0, 0, 816, 816, 816, 816, 0, 3084, 1560, 1008, 0, 0, 0]


def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def assert_safe_write(char_uuid: str):
    u = char_uuid.lower()
    if u.startswith(OTA_BANNED_PREFIX):
        raise SystemExit(f"!!! ABORTADO: escritura PROHIBIDA (OTA) en {char_uuid}")
    if u != WRITE_CHAR.lower():
        raise SystemExit(f"!!! ABORTADO: solo se permite escribir en {WRITE_CHAR}, no en {char_uuid}")


# --- constructores de imagen ----------------------------------------------
def rows_to_hex(rows):
    return "".join(f"{r & 0xFFFF:04X}" for r in rows)


def image_cmd(cc_hex, rows):
    """Trama imagen completa: '23' + colorAnillo(1B) + 14 filas (uint16 BE)."""
    return "23" + cc_hex.zfill(2).upper() + rows_to_hex(rows)


def full_disc():            return CIRCLE_MASK[:]
def top_half():             return [CIRCLE_MASK[y] if y <= 6 else 0 for y in range(14)]
def bottom_half():          return [CIRCLE_MASK[y] if y >= 7 else 0 for y in range(14)]
def left_half():            return [CIRCLE_MASK[y] & 0x3F80 for y in range(14)]   # cols 0..6 (bits 13..7)
def right_half():           return [CIRCLE_MASK[y] & 0x007F for y in range(14)]   # cols 7..13 (bits 6..0)
def single_pixel(x, y):
    rows = [0] * 14
    rows[y] = 1 << (13 - x)
    return rows


def vbar(x):
    """Barra vertical en la columna x, recortada al circulo."""
    return [(1 << (13 - x)) if ((CIRCLE_MASK[y] >> (13 - x)) & 1) else 0 for y in range(14)]


def disk_rows(rmax):
    """Disco lleno de radio rmax (recortado al circulo)."""
    rows = [0] * 14
    for y in range(14):
        for x in range(14):
            if not ((CIRCLE_MASK[y] >> (13 - x)) & 1):
                continue
            if ((x - 6.5) ** 2 + (y - 6.5) ** 2) ** 0.5 <= rmax:
                rows[y] |= (1 << (13 - x))
    return rows


BREATHE_SEQ = list(range(0, 8)) + list(range(7, 0, -1))  # crecer 0->7 y menguar 7->1


def frame_for(mode, i):
    """Devuelve (rows) para el fotograma i segun el modo."""
    if mode == "blink":
        return full_disc() if (i % 2 == 0) else [0] * 14
    if mode == "breathe":
        return disk_rows(BREATHE_SEQ[i % len(BREATHE_SEQ)])
    # 'bar': barra de 2 columnas barriendo I->D
    x = i % 14
    return [a | b for a, b in zip(vbar(x), vbar((x + 1) % 14))]


async def cmd_anim(address, secs, fps, per_frame_2201, mode):
    """Test de streaming de fotogramas a 'fps'. mode: 'bar' o 'blink'."""
    addr = await pick_device(address)
    interval = 1.0 / max(1.0, fps)
    log(f"Conectando a {addr} ... ({mode} {secs}s @ {fps} fps, 2201/frame={per_frame_2201})")
    async with BleakClient(addr) as client:
        log(f"Conectado: {client.is_connected}")
        if not per_frame_2201:
            await write_payload(client, "2201")
        t0 = time.monotonic(); i = 0
        while time.monotonic() - t0 < secs:
            tf = time.monotonic()
            if per_frame_2201:
                await write_payload_quiet(client, "2201")
            await write_payload_quiet(client, image_cmd("07", frame_for(mode, i)))
            i += 1
            await asyncio.sleep(max(0, interval - (time.monotonic() - tf)))
        dt = time.monotonic() - t0
        log(f"Enviados {i} frames en {dt:.1f}s = {i/dt:.1f} fps efectivos")
    log("Desconectado (volvera al logo).")


async def stream_once(addr, secs, fps, p2201, chunkdelay):
    """Una tanda de streaming con deteccion de desconexion. Devuelve string-resultado."""
    disc = {"t": None}
    def on_disc(c):
        if disc["t"] is None:
            disc["t"] = time.monotonic()
    interval = 1.0 / max(1.0, fps)
    tag = f"fps{fps:>4} 2201/frame={str(p2201):5} pausa={int(chunkdelay*1000):2}ms {secs:.0f}s"
    try:
        dev = await BleakScanner.find_device_by_address(addr, timeout=10.0)
        if dev is None:
            return f"{tag} -> NO ANUNCIA (senal debil o dormido)"
        client = BleakClient(dev, disconnected_callback=on_disc)
        await client.connect()
    except Exception as e:
        return f"{tag} -> NO CONECTA ({e})"
    try:
        char = client.services.get_characteristic(WRITE_CHAR)
        assert_safe_write(char.uuid)
        if not p2201:
            await client.write_gatt_char(char, bytes.fromhex("2201"), response=False)
        t0 = time.monotonic(); i = 0
        while time.monotonic() - t0 < secs and disc["t"] is None:
            tf = time.monotonic()
            try:
                if p2201:
                    await client.write_gatt_char(char, bytes.fromhex("2201"), response=False)
                    if chunkdelay: await asyncio.sleep(chunkdelay)
                img = bytes.fromhex(image_cmd("07", vbar(i % 14)))
                for k in range(0, len(img), 20):
                    await client.write_gatt_char(char, img[k:k + 20], response=False)
                    if chunkdelay: await asyncio.sleep(chunkdelay)
            except Exception as e:
                return f"{tag} -> ERROR escritura @frame {i}: {e}"
            i += 1
            await asyncio.sleep(max(0, interval - (time.monotonic() - tf)))
        dt = time.monotonic() - t0
        if disc["t"] is not None:
            return f"{tag} -> DESCONECTO @ {disc['t']-t0:4.1f}s ({i} frames)"
        return f"{tag} -> OK estable {dt:.0f}s ({i} frames, {i/dt:.1f} fps real)"
    finally:
        try:
            if client.is_connected: await client.disconnect()
        except Exception:
            pass


FILL_ORDER = [(x, y) for y in range(14) for x in range(14) if (CIRCLE_MASK[y] >> (13 - x)) & 1]


def fill_rows(n):
    rows = [0] * 14
    for (x, y) in FILL_ORDER[:n]:
        rows[y] |= (1 << (13 - x))
    return rows


async def cmd_native(address, secs, dur, count, fill=False):
    """Sube N frames con cabecera 22+NN+duraciones y observa si el badge anima
    SOLO (sin streaming) y se mantiene conectado."""
    addr = await pick_device(address)
    disc = {"t": None}
    def on_disc(c):
        if disc["t"] is None: disc["t"] = time.monotonic()
    frames = [fill_rows(k + 1) for k in range(count)] if fill else [disk_rows(r) for r in range(count)]
    header = '22' + f'{count:02X}' + (f'{dur:02X}' * count)
    log(f"NATIVO: cabecera {header}  + {count} frames (dur={dur:#04x} c/u)")
    dev = await BleakScanner.find_device_by_address(addr, timeout=10.0)
    if dev is None:
        log("El badge NO se anuncia. Reinícialo (desenchufa/enchufa la batería) y reintenta.", )
        return
    async with BleakClient(dev, disconnected_callback=on_disc) as client:
        log(f"Conectado: {client.is_connected}. Subiendo cabecera + {count} frames…")
        await write_payload_quiet(client, header)
        for fr in frames:
            await write_payload_quiet(client, image_cmd('07', fr))
            await asyncio.sleep(0.05)
        log(f"Subida completa. AHORA NO MANDO NADA durante {secs}s. ¿El badge anima solo?")
        t0 = time.monotonic()
        while time.monotonic() - t0 < secs and disc["t"] is None:
            await asyncio.sleep(0.5)
        if disc["t"] is not None:
            log(f"DESCONECTO @ {disc['t']-t0:.1f}s (mal).", )
        else:
            log(f"OK: {secs}s conectado SIN mandar nada. Si animó solo => mecanismo nativo confirmado.", )
    log("Fin (al desconectar puede volver al logo).")


async def cmd_stability(address):
    addr = await pick_device(address)
    # (secs, fps, p2201, chunkdelay_ms) -- todas con 2201/frame (lo unico estable)
    configs = [(30, 10, True, 15), (30, 8, True, 25), (40, 6, True, 30)]
    log("=== TEST DE ESTABILIDAD (re-escanea antes de cada una) ===")
    for secs, fps, p, cd in configs:
        log(await stream_once(addr, secs, fps, p, cd / 1000.0))
        await asyncio.sleep(3.0)
    log("=== fin ===")


async def write_payload_quiet(client, hexstr):
    char = client.services.get_characteristic(WRITE_CHAR)
    assert_safe_write(char.uuid)
    data = bytes.fromhex(hexstr.replace(" ", ""))
    use_response = "write" in char.properties
    for i in range(0, len(data), CHUNK):
        await client.write_gatt_char(char, data[i:i + CHUNK], response=use_response)


# --- BLE -------------------------------------------------------------------
async def pick_device(address):
    if address:
        return address
    log("Escaneando 10 s en busca de PAIX/MOODTORCH ...")
    found = await BleakScanner.discover(timeout=10.0, return_adv=True)
    for addr, (dev, adv) in sorted(found.items(), key=lambda kv: -(kv[1][1].rssi or -999)):
        nm = (dev.name or adv.local_name or "").upper()
        if nm in NAME_FILTER:
            log(f"  objetivo: {addr} '{nm}' rssi={adv.rssi}")
            return addr
    raise SystemExit("No se encontro PAIX/MOODTORCH. Acercalo y reintenta.")


async def cmd_scan():
    log("Escaneando 10 s (todos)...")
    found = await BleakScanner.discover(timeout=10.0, return_adv=True)
    for addr, (dev, adv) in sorted(found.items(), key=lambda kv: -(kv[1][1].rssi or -999)):
        name = dev.name or adv.local_name or "(sin nombre)"
        mark = "  <== PAIX/MOODTORCH" if name.upper() in NAME_FILTER else ""
        log(f"  {addr}  rssi={adv.rssi:>4}  '{name}'{mark}")


async def cmd_info(address):
    addr = await pick_device(address)
    log(f"Conectando a {addr} ...")
    async with BleakClient(addr) as client:
        log(f"Conectado: {client.is_connected}")
        for s in client.services:
            tag = "  [OTA/version - NO ESCRIBIR]" if "ffd" in s.uuid.lower() else ""
            log(f"SERVICE {s.uuid}{tag}")
            for c in s.characteristics:
                log(f"   CHAR {c.uuid}  props={','.join(c.properties)}")
        try:
            raw = await client.read_gatt_char(FW_CHAR)
            log(f"FW (0000ffd4) raw={raw.hex()} uint16LE={int.from_bytes(raw[:2],'little')}")
        except Exception as e:
            log(f"FW no leido: {e}")
        try:
            bat = await client.read_gatt_char(BATTERY_CHAR)
            log(f"Bateria = {int(bat[0])}%")
        except Exception as e:
            log(f"Bateria no leida: {e}")
    log("Desconectado.")


async def write_payload(client, hexstr):
    hexstr = hexstr.replace(" ", "").upper()
    if len(hexstr) % 2:
        raise SystemExit(f"Hex impar: {hexstr}")
    char = client.services.get_characteristic(WRITE_CHAR)
    if char is None:
        raise SystemExit(f"!!! No existe la caracteristica {WRITE_CHAR}")
    assert_safe_write(char.uuid)
    use_response = "write" in char.properties      # 19e97635 = write-without-response -> False
    data = bytes.fromhex(hexstr)
    log(f"  > {hexstr} ({len(data)} B, response={use_response})")
    for i in range(0, len(data), CHUNK):
        chunk = data[i:i + CHUNK]
        await client.write_gatt_char(char, chunk, response=use_response)
        await asyncio.sleep(0.05)


async def hold_connection(client, seconds, label=""):
    log(f"  ...mostrando{(' '+label) if label else ''} durante {seconds}s (conexion abierta)")
    end = seconds
    while end > 0:
        await asyncio.sleep(min(1.0, end))
        end -= 1


async def cmd_send(address, payloads, hold):
    addr = await pick_device(address)
    log(f"Conectando a {addr} ...")
    async with BleakClient(addr) as client:
        log(f"Conectado: {client.is_connected}")
        for p in payloads:
            await write_payload(client, p)
        await hold_connection(client, hold)
    log("Desconectado (el badge volvera al logo).")


async def cmd_demo(address, hold):
    """Bateria de calibracion en UNA sola conexion (no revierte entre pasos)."""
    steps = [
        ("1) DISCO COMPLETO (todos los LEDs + anillo morado)", ["2201", image_cmd("07", full_disc())]),
        ("2) CARA (diseno propio: ojos arriba, sonrisa abajo)", ["2201", image_cmd("07", FACE_ROWS)]),
        ("3) MITAD SUPERIOR encendida",                         ["2201", image_cmd("00", top_half())]),
        ("4) MITAD IZQUIERDA encendida",                        ["2201", image_cmd("00", left_half())]),
        ("5) 1 PIXEL arriba-centro (X=6,Y=0)",                  ["2201", image_cmd("00", single_pixel(6, 0))]),
        ("6) SOLO ANILLO morado (interior apagado)",            ["2201", image_cmd("07", [0] * 14)]),
    ]
    addr = await pick_device(address)
    log(f"Conectando a {addr} ...")
    async with BleakClient(addr) as client:
        log(f"Conectado: {client.is_connected}")
        for label, payloads in steps:
            # parpadeo oscuro 0.6s como separador entre pasos
            await write_payload(client, image_cmd("00", [0] * 14))
            await asyncio.sleep(0.6)
            log(f"=== {label} ===")
            for p in payloads:
                await write_payload(client, p)
            await hold_connection(client, hold, label)
    log("Desconectado (el badge volvera al logo).")


async def cmd_sweep(address, start, end, step):
    addr = await pick_device(address)
    log(f"Conectando a {addr} ...")
    async with BleakClient(addr) as client:
        log(f"Conectado: {client.is_connected}")
        for code in range(start, end + 1):
            hexc = f"07{code:02X}"
            log(f"=== preset {hexc} (indice {code}) ===")
            await write_payload(client, hexc)
            await hold_connection(client, step, hexc)
    log("Desconectado.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--address", default="16:88:80:11:15:7B")
    ap.add_argument("--hold", type=float, default=7.0, help="segundos con la conexion abierta tras enviar")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("scan"); sub.add_parser("info"); sub.add_parser("demo")
    sub.add_parser("face"); sub.add_parser("disc")
    sub.add_parser("top"); sub.add_parser("bottom"); sub.add_parser("left"); sub.add_parser("right")
    p = sub.add_parser("send"); p.add_argument("payloads", nargs="+")
    p = sub.add_parser("clear"); p.add_argument("cc", nargs="?", default="07")
    p = sub.add_parser("pixel"); p.add_argument("x", type=int); p.add_argument("y", type=int)
    p = sub.add_parser("sweep"); p.add_argument("start", type=int); p.add_argument("end", type=int); p.add_argument("--step", type=float, default=4.0)
    p = sub.add_parser("anim"); p.add_argument("--secs", type=float, default=8.0); p.add_argument("--fps", type=float, default=12.0); p.add_argument("--p2201", action="store_true"); p.add_argument("--mode", default="bar", choices=["bar", "blink", "breathe"])
    sub.add_parser("stability")
    p = sub.add_parser("native"); p.add_argument("--secs", type=float, default=25.0); p.add_argument("--dur", type=lambda v:int(v,0), default=5); p.add_argument("--count", type=int, default=9); p.add_argument("--fill", action="store_true")
    a = ap.parse_args()

    if a.cmd == "scan":   asyncio.run(cmd_scan())
    elif a.cmd == "info": asyncio.run(cmd_info(a.address))
    elif a.cmd == "demo": asyncio.run(cmd_demo(a.address, a.hold))
    elif a.cmd == "send": asyncio.run(cmd_send(a.address, a.payloads, a.hold))
    elif a.cmd == "face": asyncio.run(cmd_send(a.address, ["2201", image_cmd("07", FACE_ROWS)], a.hold))
    elif a.cmd == "disc": asyncio.run(cmd_send(a.address, ["2201", image_cmd("07", full_disc())], a.hold))
    elif a.cmd == "top":  asyncio.run(cmd_send(a.address, ["2201", image_cmd("00", top_half())], a.hold))
    elif a.cmd == "bottom": asyncio.run(cmd_send(a.address, ["2201", image_cmd("00", bottom_half())], a.hold))
    elif a.cmd == "left": asyncio.run(cmd_send(a.address, ["2201", image_cmd("00", left_half())], a.hold))
    elif a.cmd == "right": asyncio.run(cmd_send(a.address, ["2201", image_cmd("00", right_half())], a.hold))
    elif a.cmd == "clear": asyncio.run(cmd_send(a.address, ["2201", image_cmd(a.cc, [0]*14)], a.hold))
    elif a.cmd == "pixel": asyncio.run(cmd_send(a.address, ["2201", image_cmd("00", single_pixel(a.x, a.y))], a.hold))
    elif a.cmd == "sweep": asyncio.run(cmd_sweep(a.address, a.start, a.end, a.step))
    elif a.cmd == "anim":  asyncio.run(cmd_anim(a.address, a.secs, a.fps, a.p2201, a.mode))
    elif a.cmd == "stability": asyncio.run(cmd_stability(a.address))
    elif a.cmd == "native": asyncio.run(cmd_native(a.address, a.secs, a.dur, a.count, a.fill))


if __name__ == "__main__":
    main()
