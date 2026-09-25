# Disabled vendored ESP32Servo / ESP32PWM / WeELFESP32Motor

These files used to live under `src/` and were auto-compiled whenever any
weeecode header was included. The old ESP32PWM API breaks ESP32 Arduino core 3.x
(`_ledcSetupTimerFreq` arity / constructor mismatch).

Use instead:
- Official Library Manager package `ESP32Servo` (sketchbook)
- Sibling library `WeELFESP32Motor` for Live Mode M1/M2 LEDC driver

Do not move these files back into `src/`.
