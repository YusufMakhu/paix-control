/* ble.js — capa de transporte BLE unificada.
   - En navegador (Chrome): usa Web Bluetooth (idéntico al comportamiento ya probado).
   - En la APK (Capacitor): usa el plugin BLE nativo (window.CapBLE = BleClient).
   Expone el objeto global BLE con una interfaz estable que usa app.js.
   NO contiene lógica de protocolo/animación: solo transporte. */
'use strict';
const BLE = (function () {
  const WRITE_SERVICE = '2e6f1d15-f1c5-4bf6-be38-6e03817cba10';
  const WRITE_CHAR    = '19e97635-4207-4c41-a78f-57a7fbd342d0';
  const FW_SERVICE    = '0000d0ff-3c17-d293-8e48-14fe2e4da212';
  const FW_CHAR       = '0000ffd4-0000-1000-8000-00805f9b34fb';
  const BAT_SERVICE   = '0000180f-0000-1000-8000-00805f9b34fb';
  const BAT_CHAR      = '00002a19-0000-1000-8000-00805f9b34fb';

  const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

  let connected = false, cbDisc = null;
  let device = null, server = null, writeChar = null;   // web
  let deviceId = null;                                   // native

  const available = () => isNative ? !!window.CapBLE : !!navigator.bluetooth;
  const isConnected = () => connected;
  const remembered = () => isNative ? !!deviceId : !!device;

  // ---------- WEB (Web Bluetooth) ----------
  async function openWeb(opts) {
    server = await device.gatt.connect();
    writeChar = await (await server.getPrimaryService(WRITE_SERVICE)).getCharacteristic(WRITE_CHAR);
    connected = true;
    const info = {};
    try { const f = await (await server.getPrimaryService(FW_SERVICE)).getCharacteristic(FW_CHAR);
          info.fw = (await f.readValue()).getUint16(0, true); } catch (e) {}
    try { const bc = await (await server.getPrimaryService(0x180f)).getCharacteristic(0x2a19);
          info.battery = (await bc.readValue()).getUint8(0);
          await bc.startNotifications();
          bc.addEventListener('characteristicvaluechanged', e => opts && opts.onBattery && opts.onBattery(e.target.value.getUint8(0)));
    } catch (e) {}
    return info;
  }
  async function connectWeb(opts) {
    device = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: 'PAIX' }, { namePrefix: 'MOOD' }],
      optionalServices: [WRITE_SERVICE, FW_SERVICE, 0x180f, 0x180a]
    });
    device.addEventListener('gattserverdisconnected', () => { connected = false; cbDisc && cbDisc(); });
    return openWeb(opts);
  }
  async function writeWeb(bytes) {
    if (!writeChar) throw new Error('no conectado');
    if (writeChar.writeValueWithoutResponse) await writeChar.writeValueWithoutResponse(bytes);
    else await writeChar.writeValue(bytes);
  }
  function disconnectWeb() { if (device && device.gatt.connected) device.gatt.disconnect(); }

  // ---------- NATIVO (Capacitor BleClient = window.CapBLE) ----------
  async function connectNative(opts, reuse) {
    const B = window.CapBLE;
    await B.initialize({ androidNeverForLocation: true });
    if (!reuse || !deviceId) {
      const d = await B.requestDevice({ namePrefix: 'PAIX', optionalServices: [WRITE_SERVICE, FW_SERVICE, BAT_SERVICE] });
      deviceId = d.deviceId;
    }
    await B.connect(deviceId, () => { connected = false; cbDisc && cbDisc(); });
    connected = true;
    const info = {};
    try { info.fw = (await B.read(deviceId, FW_SERVICE, FW_CHAR)).getUint16(0, true); } catch (e) {}
    try { info.battery = (await B.read(deviceId, BAT_SERVICE, BAT_CHAR)).getUint8(0);
          await B.startNotifications(deviceId, BAT_SERVICE, BAT_CHAR, v => opts && opts.onBattery && opts.onBattery(v.getUint8(0)));
    } catch (e) {}
    return info;
  }
  async function writeNative(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    await window.CapBLE.writeWithoutResponse(deviceId, WRITE_SERVICE, WRITE_CHAR, dv);
  }
  async function disconnectNative() { if (deviceId) try { await window.CapBLE.disconnect(deviceId); } catch (e) {} }

  // ---------- API pública ----------
  async function connect(opts) { cbDisc = opts && opts.onDisconnect;
    return isNative ? connectNative(opts, false) : connectWeb(opts); }
  async function reconnect(opts) { cbDisc = opts && opts.onDisconnect;
    return isNative ? connectNative(opts, true) : openWeb(opts); }
  async function write(bytes) { return isNative ? writeNative(bytes) : writeWeb(bytes); }
  function disconnect() { connected = false; if (isNative) disconnectNative(); else disconnectWeb(); }

  return { available, isConnected, remembered, connect, reconnect, write, disconnect,
           get isNative() { return isNative; } };
})();
