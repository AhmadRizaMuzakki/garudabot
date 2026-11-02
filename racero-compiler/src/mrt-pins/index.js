/** Motor dan tombol IR untuk board MRT. */
export const methods = {
    handleMenuDcMotorKind(block) {
        return `${block.fields.dcMotorKindMenu.value}`;
    },

    handleMrtPinsSetMotor(block) {
        const motor = block.fields.MOTOR.value;
        const speed = this.getInput(block, "SPEED");

        this.includes.add(`#include <avr/io.h>\n#include <avr/interrupt.h>`);
        this.globals.add(`
volatile uint8_t m_speed[4] = {0, 0, 0, 0};
ISR(TIMER2_OVF_vect) {
    static uint8_t m_cnt = 0;
    if (m_cnt < m_speed[0]) PORTC |= 0x40; else PORTC &= ~0x40; // Motor 0
    if (m_cnt < m_speed[1]) PORTC |= 0x10; else PORTC &= ~0x10; // Motor 1
    if (m_cnt < m_speed[2]) PORTD |= 0x40; else PORTD &= ~0x40; // Motor 2
    if (m_cnt < m_speed[3]) PORTB |= 0x10; else PORTB &= ~0x10; // Motor 3
    m_cnt++;
}
`);
        this.procedures.add(`
void mrt_init() {
    DDRC = 0xFF;
    DDRD |= 0x48;
    DDRB |= 0x10;
    PORTC |= 0x07;
    TCCR2 = (1 << CS21);
    TCCR1A = 0;
    TCCR1B = (1 << WGM12) | (1 << CS11);
    OCR1A = 40000;
    TIMSK |= (1 << TOIE2);
    sei();
}`);
        this.procedures.add(`
void mrt_setMotor(char motorID, char speed) {
    char direction = (speed < 0);
    uint8_t s = (speed < 0) ? -speed : speed;
    if (s > 10) s = 10;          // Keep your 0-10 scale
    uint8_t pwmValue = s * 25;   // Scale to 0-250 for the PWM engine
    if (motorID == 1) {
        if (direction) PORTC &= ~0x20; else PORTC |= 0x20; // PC5 (DIR)
        m_speed[1] = pwmValue;
    } else if (motorID == 0) {
        if (direction) PORTC &= ~0x80; else PORTC |= 0x80; // PC7 (DIR)
        m_speed[0] = pwmValue;
    } else if (motorID == 2) {
        if (direction) PORTD &= ~0x08; else PORTD |= 0x08; // PD3 (DIR)
        m_speed[2] = pwmValue;
    } else if (motorID == 3) {
        if (direction) PORTC &= ~0x08; else PORTC |= 0x08; // PC3 (DIR)
        m_speed[3] = pwmValue;
    }
}`);
        this.setups.add("mrt_init();");
        return `mrt_setMotor(${motor}, ${speed});\n`;
    },

    handleMrtPinsGetIRButton(block) {
        const button = block.fields.BUTTON.value;

        this.globals.add(`
const int IR_PIN = 10;
volatile uint32_t lastPulseTime = 0;
volatile uint32_t buttonSignature = 0;
volatile bool newButtonDetected = false;
uint32_t currentActiveButton = 0;
uint32_t lastButtonPressTime = 0;
        `);
        this.setups.add(`mrt_init();`);
        this.setups.add(`
pinMode(IR_PIN, INPUT_PULLUP);
attachInterrupt(digitalPinToInterrupt(IR_PIN), irDecoderISR, FALLING);
        `);
        this.procedures.add(`
void irDecoderISR() {
    uint32_t now = micros();
    uint32_t pulseGap = now - lastPulseTime;
    lastPulseTime = now;
    if (pulseGap > 10000) {
        buttonSignature = 0;
    } else if (pulseGap > 200 && pulseGap < 5000) {
        buttonSignature = (buttonSignature << 8) | (pulseGap / 100);
        newButtonDetected = true;
    }
}
        `);
        this.procedures.add(`
bool isIRButtonPressed(uint32_t targetButton) {
    if (newButtonDetected) {
        delay(10);
        currentActiveButton = buttonSignature;
        lastButtonPressTime = millis();
        newButtonDetected = false;
    }
    if (millis() - lastButtonPressTime > 150) {
        currentActiveButton = 0; 
    }
    return (currentActiveButton == targetButton);
}
        `);
        return `isIRButtonPressed(${button})`;
    }
};

export const handlers = {
    mrtpins_setMotor: methods.handleMrtPinsSetMotor,
    mrtpins_getIRButton: methods.handleMrtPinsGetIRButton,
    mrtpins_menu_dcMotorKindMenu: methods.handleMenuDcMotorKind
};
