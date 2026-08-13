# patch_boards.ps1 — Injects ESP32 board definition into Firmata's Boards.h

$boardsFile = "$env:USERPROFILE\Documents\Arduino\libraries\Firmata\Boards.h"

# Safety check
if (-Not (Test-Path $boardsFile)) {
    Write-Output "Boards.h not found at $boardsFile, skipping patch."
    exit 0
}

$content = Get-Content $boardsFile -Raw

# Skip if already patched
if ($content -match "defined\(ESP32\)") {
    Write-Output "Boards.h already patched, skipping."
    exit 0
}

$esp32Block = @"

// ============================================================
// ESP32 - Injected by RaceroScratch installer
// ============================================================
#elif defined(ESP32)

#define TOTAL_ANALOG_PINS       18
#define TOTAL_PINS              40
#define TOTAL_PORTS             5
#define VERSION_BLINK_PIN       2

#define IS_PIN_DIGITAL(p)       ((p) >= 0 && (p) < 40)
#define IS_PIN_ANALOG(p)        ((p) >= 32 && (p) <= 39)
#define IS_PIN_PWM(p)           ((p) == 2  || (p) == 4  || (p) == 5  || \
                                 (p) == 12 || (p) == 13 || (p) == 14 || \
                                 (p) == 15 || (p) == 16 || (p) == 17 || \
                                 (p) == 18 || (p) == 19 || (p) == 21 || \
                                 (p) == 22 || (p) == 23 || (p) == 25 || \
                                 (p) == 26 || (p) == 27 || (p) == 32 || \
                                 (p) == 33)
#define IS_PIN_SERVO(p)         IS_PIN_DIGITAL(p)
#define IS_PIN_I2C(p)           ((p) == 21 || (p) == 22)
#define IS_PIN_SPI(p)           ((p) == 5  || (p) == 18 || (p) == 19 || (p) == 23)
#define IS_PIN_INTERRUPT(p)     IS_PIN_DIGITAL(p)
#define IS_PIN_SERIAL(p)        ((p) == 1  || (p) == 3  || (p) == 16 || (p) == 17)

#define PIN_TO_DIGITAL(p)       (p)
#define PIN_TO_ANALOG(p)        ((p) - 32)
#define PIN_TO_PWM(p)           (p)
#define PIN_TO_SERVO(p)         (p)

"@

# Insert before the #error line
$content = $content -replace '(#error "Please edit Boards\.h.*?")', "$esp32Block`$1"

Set-Content $boardsFile $content -NoNewline
Write-Output "Boards.h patched successfully."