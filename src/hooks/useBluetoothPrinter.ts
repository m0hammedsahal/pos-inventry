import { useSyncExternalStore } from "react";
import {
  getBluetoothState,
  getServerBluetoothState,
  subscribeBluetooth,
  type BluetoothPrinterState,
} from "@/services/bluetoothPrinter";

/** Live Bluetooth printer status (connected, name, errors) for the UI. */
export function useBluetoothPrinter(): BluetoothPrinterState {
  return useSyncExternalStore(subscribeBluetooth, getBluetoothState, getServerBluetoothState);
}
