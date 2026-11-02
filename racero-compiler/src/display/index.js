/** Blok display I2C (LCD dan OLED). */
export const methods = {
    handleMenuDisplayType(block) {
        return `${block.fields.displayTypeMenu.value}`;
    },

    handleDisplayEnableI2c(block) {
        const display = block.fields.DISPLAY.value;
        const address = this.getInput(block, "ADDRESS");

        this.globals.add(`#define DISPLAY_TYPE ${display}`);
        this.globals.add(`#define DISPLAY_ADDRESS ${address}`);
        this.includes.add("#include <Wire.h>");
        this.setups.add("Wire.begin();");

        if (display === "0") {
            this.includes.add("#include <LiquidCrystal_I2C.h>");
            this.globals.add("LiquidCrystal_I2C lcd(0x27, 16, 2);");
            return `lcd = LiquidCrystal_I2C(DISPLAY_ADDRESS, 16, 2);\nlcd.init();\nlcd.backlight();\nlcd.clear();\nlcd.setCursor(0, 0);\n`;
        } else if (display === "1") {
            this.includes.add('#include "SSD1306Ascii.h"');
            this.includes.add('#include "SSD1306AsciiWire.h"');
            this.globals.add("SSD1306AsciiWire oled;");
            return `oled.begin(&Adafruit128x64, DISPLAY_ADDRESS);\ndelay(50);\noled.setFont(Adafruit5x7);\noled.clear();\noled.setCursor(0, 0);\n`;
        }
        return "";
    },

    handleDisplaySetCursor(block) {
        const col = this.getInput(block, "COLUMN");
        const row = this.getInput(block, "ROW");

        return `\n#if (DISPLAY_TYPE == 0)\nlcd.setCursor(${col}, ${row});\n#endif\n#if (DISPLAY_TYPE == 1)\noled.setCursor(${col}, ${row});\n#endif\n`;
    },

    handleDisplayClearDisplay() {
        return `\n#if (DISPLAY_TYPE == 0)\nlcd.clear();\n#endif\n#if (DISPLAY_TYPE == 1)\noled.clear();\n#endif\n`;
    },

    handleDisplayWriteDisplay(block) {
        const string = this.getInput(block, "STRING");

        return `\n#if (DISPLAY_TYPE == 0)\nlcd.println(${string});\n#endif\n#if (DISPLAY_TYPE == 1)\noled.println(${string});\n#endif\n`;
    }
};

export const handlers = {
    display_enableI2cDisplay: methods.handleDisplayEnableI2c,
    display_setCursor: methods.handleDisplaySetCursor,
    display_clearDisplay: methods.handleDisplayClearDisplay,
    display_writeDisplay: methods.handleDisplayWriteDisplay,
    display_menu_displayTypeMenu: methods.handleMenuDisplayType
};
