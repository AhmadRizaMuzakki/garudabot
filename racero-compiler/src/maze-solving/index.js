import { methods as pinMethods } from "../pins/index.js";

/**
 * Maze Solving MRT.
 * Hat upload memakai handler kosong yang sama dengan hat Pins.
 * Delay_ms, Bunyi_Tone, Gerak_Robot, Luruskan_Posisi_Roda, Aksi_Finish,
 * hitam, kalibrasi, dan Tunggu_Start ditulis lengkap di sketch.
 * mcu initialization menyiapkan buzzer, motor AVR, dan sensor IN 1–IN 5.
 * Isi fungsi mengikuti kode maze solving di PDF: Delay_ms maksimal 1000,
 * kalibrasi kontras 300, Tunggu_Start menunggu sensor tengah, dan hitam()
 * berhenti di simpang lewat status_break_simpang.
 */
export const methods = {
    ensureMazeSolverHeader() {
        this.mazeActive = true;
        this.includes.add("#include <stdint.h>");
        this.includes.add("#include <avr/io.h>");
        this.includes.add("#include <avr/interrupt.h>");
        this.includes.add(`typedef enum {
            MAJU,
            MAJU_MS,
            MUNDUR_MS,
            KIRI_MS,
            KANAN_MS,
            KIRI_LINE,
            KANAN_LINE,
            PUTAR_BALIK,
            BERHENTI_MS,
            GARIS_PUTUS,
            GARIS_HILANG,
            GARIS_PARALEL
        } JenisAksi;`);
        this.includes.add(`
            #define NOTE_DO 523
            #define NOTE_RE 587
            #define NOTE_MI 659
            #define NOTE_SOL 784
            #define NOTE_LA 880
            #define NOTE_LOW 250`
        );
        this.globals.add(`
            int threshold_sensor[5] = {450, 450, 450, 450, 450};
            int memori_arah_terakhir = 0;
            int status_break_simpang = 0;`
        );
        this.globals.add(`
            #define Milliseconds 0
            #define High 1
            #define ON_BOARD 5
            #define IN1 24
            #define IN2 25
            #define IN3 26
            #define IN4 27
            #define IN5 28
            #define L1_Motor 0
            #define L2_Motor 1
            #define R1_Motor 2
            #define R2_Motor 3

            volatile uint8_t maze_m_speed[4] = {0, 0, 0, 0};

            ISR(TIMER2_OVF_vect) {
                static uint8_t maze_m_cnt = 0;
                if (maze_m_cnt < maze_m_speed[0]) PORTC |= 0x40; else PORTC &= ~0x40;
                if (maze_m_cnt < maze_m_speed[1]) PORTC |= 0x10; else PORTC &= ~0x10;
                if (maze_m_cnt < maze_m_speed[2]) PORTD |= 0x40; else PORTD &= ~0x40;
                if (maze_m_cnt < maze_m_speed[3]) PORTB |= 0x10; else PORTB &= ~0x10;
                maze_m_cnt++;
            }

            void maze_mrt_motor_init(void) {
                DDRC = 0xFF;
                DDRD |= 0x48;
                DDRB |= 0x10;
                PORTC |= 0x07;
                TCCR2 = (1 << CS21);
                TIMSK |= (1 << TOIE2);
                sei();
            }

            void Delay(int satuan, uint16_t nilai) {
                (void)satuan;
                delay(nilai);
            }

            void Buzzer_Tone(int pin, uint16_t durasi_ms, uint16_t frekuensi, int duty) {
                (void)duty;
                pinMode(pin, OUTPUT);
                if (frekuensi == 0 || durasi_ms == 0) {
                    digitalWrite(pin, LOW);
                    return;
                }
                uint32_t setengah = (uint32_t)500000 / frekuensi;
                uint32_t putaran = ((uint32_t)durasi_ms * (uint32_t)1000) / (setengah * (uint32_t)2);
                for (uint32_t i = 0; i < putaran; i++) {
                    digitalWrite(pin, HIGH);
                    delayMicroseconds(setengah);
                    digitalWrite(pin, LOW);
                    delayMicroseconds(setengah);
                }
            }

            void DC_Motor(int motorID, int speed) {
                static uint8_t siap = 0;
                if (!siap) {
                    maze_mrt_motor_init();
                    siap = 1;
                }
                uint8_t mundur = speed < 0;
                int s = speed < 0 ? -speed : speed;
                if (s > 20) s = 20;
                uint8_t pwm = (uint8_t)(s * 12);
                if (motorID == 1) {
                    if (mundur) PORTC &= ~0x20; else PORTC |= 0x20;
                    maze_m_speed[1] = pwm;
                } else if (motorID == 0) {
                    if (mundur) PORTC &= ~0x80; else PORTC |= 0x80;
                    maze_m_speed[0] = pwm;
                } else if (motorID == 2) {
                    if (mundur) PORTD &= ~0x08; else PORTD |= 0x08;
                    maze_m_speed[2] = pwm;
                } else if (motorID == 3) {
                    if (mundur) PORTC &= ~0x08; else PORTC |= 0x08;
                    maze_m_speed[3] = pwm;
                }
            }

            int Analog_Read(int pin, int mode, int threshold) {
                int mentah = analogRead(pin);
                if (threshold <= 0) return mentah;
                if (mode == High) return mentah >= threshold ? 1 : 0;
                return mentah < threshold ? 1 : 0;
            }

            void scan_remote_signal(void) {
            }

            void Delay_ms(uint16_t milidetik) {
                if (milidetik > 1000) milidetik = 1000;
                Delay(Milliseconds, milidetik);
            }

            void Bunyi_Tone(uint16_t frekuensi, uint16_t durasi_ms) {
                Buzzer_Tone(ON_BOARD, durasi_ms, frekuensi, 10);
                Delay_ms(durasi_ms + 20);
            }

            void Gerak_Robot(int speed_kiri, int speed_kanan) {
                if (speed_kiri > 20) speed_kiri = 20;
                if (speed_kiri < -20) speed_kiri = -20;
                if (speed_kanan > 20) speed_kanan = 20;
                if (speed_kanan < -20) speed_kanan = -20;
                DC_Motor(L1_Motor, speed_kiri);
                DC_Motor(L2_Motor, speed_kiri);
                DC_Motor(R1_Motor, speed_kanan);
                DC_Motor(R2_Motor, speed_kanan);
            }

            void Luruskan_Posisi_Roda(int speed_max) {
                int v_koreksi = speed_max - 5;
                if (v_koreksi < 10) v_koreksi = 10;
                while (1) {
                    scan_remote_signal();
                    Gerak_Robot(-v_koreksi, v_koreksi);
                    Delay(Milliseconds, 1);
                    if (Analog_Read(IN2, High, threshold_sensor[1]) == 1) break;
                }
                while (1) {
                    scan_remote_signal();
                    Gerak_Robot(v_koreksi, -v_koreksi);
                    Delay(Milliseconds, 1);
                    if (Analog_Read(IN4, High, threshold_sensor[3]) == 1) break;
                }
                Gerak_Robot(0, 0);
                Delay_ms(50);
            }`
        );
        this.globals.add(`
            void Aksi_Finish(void) {
                Gerak_Robot(0, 0);
                Bunyi_Tone(NOTE_DO, 150);
                Bunyi_Tone(NOTE_MI, 150);
                Bunyi_Tone(NOTE_SOL, 150);
                Bunyi_Tone(NOTE_LA, 150);
                Bunyi_Tone(NOTE_SOL, 400);
                while (1) {
                    Gerak_Robot(0, 0);
                    Delay_ms(1000);
                }
            }`
        );
        this.globals.add(`
            void hitam(JenisAksi aksi, int v_cepat, int v_lambat, int milidetik) {
                if (status_break_simpang == 1) return;
                switch (aksi) {
                    case MAJU:
                        for (int t = 0; t < milidetik; t += 10) {
                            scan_remote_signal();
                            if (Analog_Read(IN1, High, 0) > 700 && Analog_Read(IN5, High, 0) > 700) {
                                Gerak_Robot(0, 0);
                                status_break_simpang = 1;
                                break;
                            }
                            int s1 = Analog_Read(IN1, High, threshold_sensor[0]);
                            int s2 = Analog_Read(IN2, High, threshold_sensor[1]);
                            int s3 = Analog_Read(IN3, High, threshold_sensor[2]);
                            int s4 = Analog_Read(IN4, High, threshold_sensor[3]);
                            int s5 = Analog_Read(IN5, High, threshold_sensor[4]);
                            if ((s1 && s5) || (s1 && s3) || (s5 && s3)) {
                                Gerak_Robot(0, 0);
                                Bunyi_Tone(NOTE_SOL, 200);
                                status_break_simpang = 1;
                                break;
                            }
                            if (s3 && !s1 && !s5) {
                                Gerak_Robot(v_cepat, v_cepat);
                                memori_arah_terakhir = 0;
                            } else if (s2 || s1) {
                                Gerak_Robot(v_cepat, -v_lambat);
                                memori_arah_terakhir = 1;
                            } else if (s4 || s5) {
                                Gerak_Robot(-v_lambat, v_cepat);
                                memori_arah_terakhir = 2;
                            } else if (memori_arah_terakhir == 1) {
                                Gerak_Robot(v_cepat, -v_lambat);
                            } else if (memori_arah_terakhir == 2) {
                                Gerak_Robot(-v_lambat, v_cepat);
                            } else {
                                Gerak_Robot(v_lambat, v_lambat);
                            }
                            Delay_ms(10);
                        }
                        break;
                    case KIRI_LINE:
                        Gerak_Robot(-v_lambat, v_cepat);
                        Delay_ms(150);
                        while (1) {
                            scan_remote_signal();
                            Gerak_Robot(-v_lambat, v_cepat);
                            if (Analog_Read(IN3, High, threshold_sensor[2])) break;
                            Delay_ms(5);
                        }
                        Luruskan_Posisi_Roda(v_cepat);
                        break;
                    case KANAN_LINE:
                        Gerak_Robot(v_cepat, -v_lambat);
                        Delay_ms(150);
                        while (1) {
                            scan_remote_signal();
                            Gerak_Robot(v_cepat, -v_lambat);
                            if (Analog_Read(IN3, High, threshold_sensor[2])) break;
                            Delay_ms(5);
                        }
                        Luruskan_Posisi_Roda(v_cepat);
                        break;
                    case PUTAR_BALIK:
                        Gerak_Robot(v_cepat, -v_cepat);
                        Delay_ms(300);
                        while (1) {
                            scan_remote_signal();
                            Gerak_Robot(v_cepat, -v_cepat);
                            if (Analog_Read(IN3, High, threshold_sensor[2])) break;
                            Delay_ms(5);
                        }
                        Luruskan_Posisi_Roda(v_cepat);
                        break;
                    case GARIS_PUTUS:
                        while (1) {
                            scan_remote_signal();
                            Gerak_Robot(v_cepat, v_cepat);
                            if (Analog_Read(IN2, High, threshold_sensor[1]) ||
                                Analog_Read(IN3, High, threshold_sensor[2]) ||
                                Analog_Read(IN4, High, threshold_sensor[3])) {
                                Bunyi_Tone(NOTE_MI, 80);
                                break;
                            }
                            Delay_ms(5);
                        }
                        break;
                    case GARIS_HILANG:
                        while (1) {
                            scan_remote_signal();
                            Gerak_Robot(v_cepat, v_cepat);
                            int s1 = Analog_Read(IN1, High, threshold_sensor[0]);
                            int s3 = Analog_Read(IN3, High, threshold_sensor[2]);
                            int s5 = Analog_Read(IN5, High, threshold_sensor[4]);
                            if ((s1 && s5) || (s1 && s3) || (s5 && s3)) {
                                Gerak_Robot(0, 0);
                                Bunyi_Tone(NOTE_SOL, 200);
                                status_break_simpang = 1;
                                break;
                            }
                            Delay_ms(5);
                        }
                        break;
                    case GARIS_PARALEL:
                        while (1) {
                            scan_remote_signal();
                            int s1 = Analog_Read(IN1, High, threshold_sensor[0]);
                            int s3 = Analog_Read(IN3, High, threshold_sensor[2]);
                            int s5 = Analog_Read(IN5, High, threshold_sensor[4]);
                            if (s1 && !s5) Gerak_Robot(v_lambat, v_cepat);
                            else if (s5 && !s1) Gerak_Robot(v_cepat, v_lambat);
                            else Gerak_Robot(v_cepat, v_cepat);
                            if (s3 && (s1 || s5)) {
                                Gerak_Robot(0, 0);
                                Bunyi_Tone(NOTE_SOL, 200);
                                status_break_simpang = 1;
                                break;
                            }
                            Delay_ms(5);
                        }
                        break;
                    case MAJU_MS:
                        Gerak_Robot(v_cepat, v_cepat);
                        Delay_ms(milidetik);
                        Gerak_Robot(0, 0);
                        break;
                    case MUNDUR_MS:
                        Gerak_Robot(-v_cepat, -v_cepat);
                        Delay_ms(milidetik);
                        Gerak_Robot(0, 0);
                        break;
                    case KIRI_MS:
                        Gerak_Robot(-v_lambat, v_cepat);
                        Delay_ms(milidetik);
                        Gerak_Robot(0, 0);
                        break;
                    case KANAN_MS:
                        Gerak_Robot(v_cepat, -v_lambat);
                        Delay_ms(milidetik);
                        Gerak_Robot(0, 0);
                        break;
                    case BERHENTI_MS:
                        Gerak_Robot(0, 0);
                        Delay_ms(milidetik);
                        break;
                }
            }`
        );
        this.globals.add(`
            void MCU_Initialization(void) {
                maze_mrt_motor_init();
                pinMode(ON_BOARD, OUTPUT);
                digitalWrite(ON_BOARD, LOW);
                pinMode(IN1, INPUT);
                pinMode(IN2, INPUT);
                pinMode(IN3, INPUT);
                pinMode(IN4, INPUT);
                pinMode(IN5, INPUT);
                memori_arah_terakhir = 0;
                status_break_simpang = 0;
                Gerak_Robot(0, 0);
            }`
        );
        this.globals.add(`
            void Jalankan_Kalibrasi_Dan_Cek_Sensor(void) {
                int putih[5] = {0, 0, 0, 0, 0};
                int hitam_raw[5] = {0, 0, 0, 0, 0};
                int status_semua_sensor_oke = 1;
                Bunyi_Tone(NOTE_DO, 400);
                Delay_ms(1000);
                Delay_ms(1000);
                Delay_ms(1000);
                putih[0] = Analog_Read(IN1, High, 0);
                putih[1] = Analog_Read(IN2, High, 0);
                putih[2] = Analog_Read(IN3, High, 0);
                putih[3] = Analog_Read(IN4, High, 0);
                putih[4] = Analog_Read(IN5, High, 0);
                Bunyi_Tone(NOTE_RE, 150);
                Bunyi_Tone(NOTE_RE, 150);
                Delay_ms(1000);
                Delay_ms(1000);
                Delay_ms(1000);
                hitam_raw[0] = Analog_Read(IN1, High, 0);
                hitam_raw[1] = Analog_Read(IN2, High, 0);
                hitam_raw[2] = Analog_Read(IN3, High, 0);
                hitam_raw[3] = Analog_Read(IN4, High, 0);
                hitam_raw[4] = Analog_Read(IN5, High, 0);
                for (int i = 0; i < 5; i++) {
                    int selisih_kontras = hitam_raw[i] - putih[i];
                    if (selisih_kontras < 300) status_semua_sensor_oke = 0;
                    threshold_sensor[i] = (putih[i] + hitam_raw[i]) / 2;
                }
                if (status_semua_sensor_oke == 1) {
                    Bunyi_Tone(NOTE_MI, 150);
                    Bunyi_Tone(NOTE_SOL, 500);
                } else {
                    Bunyi_Tone(NOTE_LOW, 400);
                    Bunyi_Tone(NOTE_LOW, 400);
                }
            }

            void Tunggu_Start(void) {
                Gerak_Robot(0, 0);
                Bunyi_Tone(NOTE_DO, 150);
                Bunyi_Tone(NOTE_MI, 150);
                while (1) {
                    scan_remote_signal();
                    if (Analog_Read(IN3, High, threshold_sensor[2])) {
                        Bunyi_Tone(NOTE_SOL, 100);
                        Bunyi_Tone(NOTE_LA, 100);
                        Bunyi_Tone(880 * 2, 300);
                        break;
                    }
                    Delay_ms(20);
                }
            }`
        );
    },

    handleMazeJenisAksi(block) {
        this.ensureMazeSolverHeader();
        const enums = {
            mazesolvingmrt_Maju: "MAJU",
            mazesolvingmrt_Maju_ms: "MAJU_MS",
            mazesolvingmrt_Mundur_ms: "MUNDUR_MS",
            mazesolvingmrt_Kiri_ms: "KIRI_MS",
            mazesolvingmrt_Kanan_ms: "KANAN_MS",
            mazesolvingmrt_Kiri_line: "KIRI_LINE",
            mazesolvingmrt_Kanan_line: "KANAN_LINE",
            mazesolvingmrt_Putar_balik: "PUTAR_BALIK",
            mazesolvingmrt_Berhenti_ms: "BERHENTI_MS",
            mazesolvingmrt_Garis_Putus: "GARIS_PUTUS",
            mazesolvingmrt_Garis_hilang: "GARIS_HILANG",
            mazesolvingmrt_Garis_Paralel: "GARIS_PARALEL"
        };
        return enums[block.opcode] || "MAJU";
    },

    handleMazeHitam(block) {
        this.ensureMazeSolverHeader();
        const aksi = this.getMenuValue(block, "JenisAksi", "MAJU");
        const vCepat = this.getInput(block, "vfast") || "0";
        const vLambat = this.getInput(block, "vslow") || "0";
        const milidetik = this.getInput(block, "ms") || "0";
        return `hitam(${aksi}, ${vCepat}, ${vLambat}, ${milidetik});\n`;
    },

    handleMazeKalibrasi() {
        this.ensureMazeSolverHeader();
        return "Jalankan_Kalibrasi_Dan_Cek_Sensor();\n";
    },

    handleMazeMcuInitialization() {
        this.ensureMazeSolverHeader();
        return "MCU_Initialization();\n";
    },

    handleMazeTungguStart() {
        this.ensureMazeSolverHeader();
        return "Tunggu_Start();\n";
    },

    handleMazeAksiFinish() {
        this.ensureMazeSolverHeader();
        return "Aksi_Finish();\n";
    },

    handleMazeSimpang() {
        this.ensureMazeSolverHeader();
        return "status_break_simpang = 0;\n";
    }
};

export const handlers = {
    mazesolvingmrt_uploadProgram: pinMethods.handlePinsBoardStart,
    mazesolvingmrt_MCU_Initialization: methods.handleMazeMcuInitialization,
    mazesolvingmrt_kalibrasi_dan_cek_sensor: methods.handleMazeKalibrasi,
    mazesolvingmrt_Tunggu_Start: methods.handleMazeTungguStart,
    mazesolvingmrt_HITAM: methods.handleMazeHitam,
    mazesolvingmrt_Aksi_finish: methods.handleMazeAksiFinish,
    mazesolvingmrt_simpang: methods.handleMazeSimpang,
    mazesolvingmrt_Maju: methods.handleMazeJenisAksi,
    mazesolvingmrt_Maju_ms: methods.handleMazeJenisAksi,
    mazesolvingmrt_Mundur_ms: methods.handleMazeJenisAksi,
    mazesolvingmrt_Kiri_ms: methods.handleMazeJenisAksi,
    mazesolvingmrt_Kanan_ms: methods.handleMazeJenisAksi,
    mazesolvingmrt_Kiri_line: methods.handleMazeJenisAksi,
    mazesolvingmrt_Kanan_line: methods.handleMazeJenisAksi,
    mazesolvingmrt_Putar_balik: methods.handleMazeJenisAksi,
    mazesolvingmrt_Berhenti_ms: methods.handleMazeJenisAksi,
    mazesolvingmrt_Garis_Putus: methods.handleMazeJenisAksi,
    mazesolvingmrt_Garis_hilang: methods.handleMazeJenisAksi,
    mazesolvingmrt_Garis_Paralel: methods.handleMazeJenisAksi
};

export const setupEntryOpcodes = ["mazesolvingmrt_uploadProgram"];
