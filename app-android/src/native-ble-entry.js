// Punto de entrada empaquetado por esbuild -> www/native-ble.js
// Expone el cliente BLE del plugin nativo como window.CapBLE para que ble.js lo use.
import { BleClient } from '@capacitor-community/bluetooth-le';
window.CapBLE = BleClient;
