# Archived Compose demos

This directory is outside every Android source set. Files here are retained only
for provenance while production behavior is migrated to canonical native flows.
They must not be imported, compiled, registered in navigation, or described as
supported product behavior.

## BluetoothPairingScreen.kt

- Archived on: 2026-07-27
- Original source path:
  `app/src/main/java/com/example/smart_health_android/ui/screens/BluetoothPairingScreen.kt`
- Original bytes: `34,467`
- Original lines: `904`
- Original SHA-256:
  `BD1A2D0C407C0BBFD49F1D6B13F53071D0F29CCC4E8B56C5D6D6D623D3180626`
- Reason: the unused demo auto-completed a hard-coded QR scan and presented
  backend inventory polling as Bluetooth radar discovery. CodeGraph reported
  zero callers.
- Canonical replacement: `DevicePairingScreen` with real QR/manual claim,
  secure setup-AP guidance, idempotent backend acceptance and authenticated
  WSS online confirmation.
- Compatibility: the legacy `bluetooth?...` URL alias remains temporarily but
  resolves to `DevicePairingScreen`; no BLE UX is exposed until Android and
  firmware implement an authenticated GATT contract with hardware proof.

The archived Kotlin file was moved intact except for changing its deprecation
message from “Legacy demo flow” to “Archived demo flow”. The checksum above is
for the exact pre-archive source.
