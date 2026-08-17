/**
 * airlinerHud.js - Head-Up Display (HUD) de Avião de Passageiros
 * 
 * Simula fielmente os HUDs de aeronaves comerciais modernas (Boeing 787, 737 MAX, Rockwell Collins HGS)
 * com visual vetorial verde fosforescente, lente combinadora ótica, fita de velocidade à esquerda,
 * fita de altitude à direita, pitch ladder, roll arc, boresight, flight path vector e modos FMA.
 */

export default class AirlinerHUD {
    constructor(simulator) {
        this.simulator = simulator;
        this.visible = true;
        this.container = null;
        this.canvas = null;
        this.ctx = null;

        // Histórico para cálculo de aceleração e tendência de velocidade (speed trend vector)
        this.speedHistory = [];
        this.lastUpdateTime = performance.now();
        this.speedTrend = 0; // aceleração km/h por segundo

        // Cores padrão estilo CRT / HUD Ótico Colimado
        this.hudGreen = '#00ff66';
        this.hudGreenBright = '#39ff14';
        this.hudGreenDim = 'rgba(0, 255, 102, 0.4)';
        this.hudGreenBg = 'rgba(0, 255, 102, 0.08)';
        this.hudWarning = '#ffcc00';
        this.hudAlert = '#ff3333';

        this.initDOM();
        this.initEvents();
    }

    /**
     * Inicializa os elementos DOM do HUD
     */
    initDOM() {
        // Container principal do HUD
        this.container = document.createElement('div');
        this.container.id = 'airlinerHudContainer';
        this.container.className = 'airliner-hud-container';

        // Canvas vetorial de alta precisão (HUD verde direto na tela)
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'airlinerHudCanvas';
        this.canvas.className = 'airliner-hud-canvas';
        this.container.appendChild(this.canvas);

        document.body.appendChild(this.container);

        this.ctx = this.canvas.getContext('2d');
        this.resize();
    }

    /**
     * Ajusta a resolução do canvas para a escala física do monitor (Retina/High-DPI)
     */
    resize() {
        if (!this.canvas || !this.container) return;
        const rect = this.container.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        this.width = rect.width || 760;
        this.height = rect.height || 540;

        this.canvas.width = this.width * dpr;
        this.canvas.height = this.height * dpr;

        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(dpr, dpr);
    }

    /**
     * Ouvintes de eventos e teclas de atalho
     */
    initEvents() {
        window.addEventListener('resize', () => this.resize());

        window.addEventListener('keydown', (e) => {
            if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
                return;
            }
            if (e.key.toLowerCase() === 'h') {
                this.toggle();
            }
        });
    }

    /**
     * Alterna a visibilidade do HUD de passageiros
     */
    toggle() {
        this.visible = !this.visible;
        if (this.container) {
            this.container.style.display = this.visible ? 'flex' : 'none';
        }
    }

    /**
     * Atualização do loop de renderização (chamado a cada frame pelo simulador)
     */
    update(telemetry) {
        if (!this.visible || !this.ctx || !this.width || !this.height) return;

        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;
        const cx = w / 2;
        const cy = h / 2;

        // Limpar canvas
        ctx.clearRect(0, 0, w, h);

        // Extrair telemetria com valores seguros
        const speedKmh = telemetry.speedKmh || 0;
        const altitudeMeters = telemetry.altitudeMeters || 0;
        const radioAltitude = telemetry.radioAltitude !== undefined ? telemetry.radioAltitude : altitudeMeters;
        const verticalSpeed = telemetry.verticalSpeed || 0; // m/s
        const pitchRad = telemetry.pitch || 0;
        const visualAoA = telemetry.visualAoA || 0;
        const effectivePitchDeg = (pitchRad + visualAoA) * (180 / Math.PI);
        const rollRad = telemetry.roll || 0;
        const rollDeg = rollRad * (180 / Math.PI);
        const headingDeg = telemetry.headingDeg !== undefined ? telemetry.headingDeg : 0;
        const targetSpeed = telemetry.targetSpeed || 360;
        const targetAltitude = telemetry.targetAltitude || 500;
        const apEnabled = telemetry.apEnabled || false;
        const isOnGround = telemetry.isOnGround || false;

        // Cálculo de tendência de velocidade (speed trend vector em 6 segundos)
        const now = performance.now();
        const dt = (now - this.lastUpdateTime) / 1000;
        this.lastUpdateTime = now;
        if (dt > 0 && dt < 1) {
            this.speedHistory.push({ time: now, speed: speedKmh });
            if (this.speedHistory.length > 30) this.speedHistory.shift();

            if (this.speedHistory.length >= 2) {
                const oldest = this.speedHistory[0];
                const timeDiff = (now - oldest.time) / 1000;
                if (timeDiff > 0.1) {
                    const accel = (speedKmh - oldest.speed) / timeDiff; // km/h por seg
                    this.speedTrend = THREE_Math_lerp(this.speedTrend, accel * 6, 0.1); // Projeção para 6 segundos
                }
            }
        }

        ctx.save();

        // Configuração de linha e brilho colimado (HUD Vector Phosphor)
        ctx.strokeStyle = this.hudGreen;
        ctx.fillStyle = this.hudGreen;
        ctx.lineWidth = 1.8;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = 'rgba(0, 255, 102, 0.65)';
        ctx.shadowBlur = 4;
        ctx.font = '600 13px "Outfit", monospace, sans-serif';

        // 1. Modos de Voo (FMA - Flight Mode Annunciator Bar) no topo
        this.drawFMA(ctx, cx, 42, {
            apEnabled,
            targetSpeed,
            targetAltitude,
            isOnGround,
            headingDeg
        });

        // 2. Fita de Proa / Lubber Line no Topo Central
        this.drawHeadingTape(ctx, cx, 68, headingDeg);

        // 3. Arco de Roll / Bank Angle Indicator
        this.drawRollScale(ctx, cx, cy - 35, rollDeg);

        // 4. Horizonte Artificial e Pitch Ladder (Rotaciona com o Roll e translada com o Pitch)
        this.drawPitchLadder(ctx, cx, cy, effectivePitchDeg, rollDeg);

        // 5. Boresight Fixo (Símbolo de Asas / Waterbird do avião)
        this.drawBoresight(ctx, cx, cy);

        // 6. Flight Path Vector (FPV - Vetor de Trajetória de Voo)
        this.drawFlightPathVector(ctx, cx, cy, telemetry);

        // 7. Fita de Velocidade à Esquerda (Airspeed Tape)
        this.drawSpeedTape(ctx, cx - 210, cy, speedKmh, targetSpeed, this.speedTrend, isOnGround);

        // 8. Fita de Altitude à Direita (Altitude Tape & VSI)
        this.drawAltitudeTape(ctx, cx + 210, cy, altitudeMeters, targetAltitude, verticalSpeed, radioAltitude, isOnGround);

        // 9. Altímetro de Radar / Distância do Solo no Centro Inferior
        this.drawRadioAltitude(ctx, cx, cy + 120, radioAltitude, isOnGround);

        ctx.restore();
    }

    /**
     * Desenha a Barra de Modos de Voo (FMA - Flight Mode Annunciators)
     */
    drawFMA(ctx, cx, topY, data) {
        ctx.save();
        ctx.font = '700 11px "Outfit", monospace, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Modo de Velocidade (Esquerda)
        const spdMode = data.apEnabled ? 'MCP SPD' : 'MAN SPD';
        ctx.fillText(spdMode, cx - 180, topY);

        // Modo de Navegação Lateral (Centro-Esquerda)
        const latMode = data.apEnabled ? 'HDG HOLD' : 'LNAV / ROLL';
        ctx.fillText(latMode, cx - 70, topY);

        // Modo Vertical / Glideslope (Centro-Direita)
        const vertMode = data.isOnGround ? 'TAKEOFF' : (data.apEnabled ? 'ALT HOLD' : 'PITCH / VNAV');
        ctx.fillText(vertMode, cx + 70, topY);

        // Status do Piloto Automático / Sistema (Direita)
        const apText = data.apEnabled ? 'A/P 1+2 CMD' : 'FD / 2 CH';
        ctx.fillStyle = data.apEnabled ? this.hudGreenBright : this.hudGreen;
        ctx.fillText(apText, cx + 180, topY);

        ctx.restore();
    }

    /**
     * Desenha a Fita de Proa / Lubber Line no Topo
     */
    drawHeadingTape(ctx, cx, y, headingDeg) {
        ctx.save();
        const width = 220;
        const pxPerDeg = 2.4;

        // Caixa delimitadora superior
        ctx.beginPath();
        ctx.moveTo(cx - width / 2, y + 16);
        ctx.lineTo(cx + width / 2, y + 16);
        ctx.stroke();

        // Triângulo ponteiro central
        ctx.beginPath();
        ctx.moveTo(cx, y + 16);
        ctx.lineTo(cx - 5, y + 23);
        ctx.lineTo(cx + 5, y + 23);
        ctx.closePath();
        ctx.fill();

        // Clipping para fita de proa
        ctx.save();
        ctx.beginPath();
        ctx.rect(cx - width / 2, y - 20, width, 40);
        ctx.clip();

        const startDeg = Math.floor((headingDeg - 40) / 5) * 5;
        const endDeg = Math.ceil((headingDeg + 40) / 5) * 5;

        for (let d = startDeg; d <= endDeg; d += 5) {
            const normalized = ((d % 360) + 360) % 360;
            const x = cx + (d - headingDeg) * pxPerDeg;

            const isMajor = d % 10 === 0;
            const tickH = isMajor ? 8 : 4;

            ctx.beginPath();
            ctx.moveTo(x, y + 16);
            ctx.lineTo(x, y + 16 - tickH);
            ctx.stroke();

            if (isMajor) {
                let label = (normalized / 10).toString().padStart(2, '0');
                if (normalized === 0) label = 'N';
                else if (normalized === 90) label = 'E';
                else if (normalized === 180) label = 'S';
                else if (normalized === 270) label = 'W';

                ctx.font = '700 10px "Outfit", monospace, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.fillText(label, x, y + 6);
            }
        }

        ctx.restore();

        // Leitura digital da proa atual logo acima do ponteiro
        ctx.font = '700 12px "Outfit", monospace, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(`${Math.round(headingDeg).toString().padStart(3, '0')}°`, cx, y + 26);

        ctx.restore();
    }

    /**
     * Desenha o Arco de Roll / Bank Angle Indicator
     */
    drawRollScale(ctx, cx, cy, rollDeg) {
        ctx.save();
        const radius = 130;

        // Arco do indicador de roll no topo
        ctx.beginPath();
        ctx.arc(cx, cy, radius, -Math.PI * 0.72, -Math.PI * 0.28);
        ctx.stroke();

        // Ticks de inclinação (-60°, -45°, -30°, -20°, -10°, 0°, 10°, 20°, 30°, 45°, 60°)
        const angles = [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60];
        angles.forEach(deg => {
            const rad = (-90 + deg) * (Math.PI / 180);
            const isMajor = Math.abs(deg) === 0 || Math.abs(deg) === 30 || Math.abs(deg) === 60;
            const len = isMajor ? 9 : 5;

            const x1 = cx + Math.cos(rad) * radius;
            const y1 = cy + Math.sin(rad) * radius;
            const x2 = cx + Math.cos(rad) * (radius - len);
            const y2 = cy + Math.sin(rad) * (radius - len);

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();

            // Marcador de 0° (Triângulo central apontando para cima)
            if (deg === 0) {
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x1 - 4, y1 - 6);
                ctx.lineTo(x1 + 4, y1 - 6);
                ctx.closePath();
                ctx.fill();
            }
        });

        // Ponteiro de Roll Dinâmico (Triângulo móvel que acompanha a inclinação das asas)
        const pointerRad = (-90 - rollDeg) * (Math.PI / 180);
        const px = cx + Math.cos(pointerRad) * (radius + 2);
        const py = cy + Math.sin(pointerRad) * (radius + 2);

        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(pointerRad + Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-5, 8);
        ctx.lineTo(5, 8);
        ctx.closePath();
        ctx.fillStyle = this.hudGreenBright;
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        ctx.restore();
    }

    /**
     * Desenha a Pitch Ladder móvel e o Horizonte Artificial
     */
    drawPitchLadder(ctx, cx, cy, pitchDeg, rollDeg) {
        ctx.save();

        // Delimitar a área de visualização central da pitch ladder
        ctx.beginPath();
        ctx.rect(cx - 165, cy - 170, 330, 340);
        ctx.clip();

        // Transladar para o centro e aplicar rotação do Roll
        ctx.translate(cx, cy);
        ctx.rotate((-rollDeg * Math.PI) / 180);

        const pxPerDegree = 6.8; // Escala de pixels por grau de pitch
        const pitchOffsetY = pitchDeg * pxPerDegree;

        // 1. Linha do Horizonte (Pitch 0°)
        const horizY = pitchOffsetY;
        const horizGap = 45;
        const horizLen = 130;

        ctx.lineWidth = 2.0;
        // Asa esquerda do horizonte
        ctx.beginPath();
        ctx.moveTo(-horizLen, horizY);
        ctx.lineTo(-horizGap, horizY);
        ctx.stroke();

        // Asa direita do horizonte
        ctx.beginPath();
        ctx.moveTo(horizGap, horizY);
        ctx.lineTo(horizLen, horizY);
        ctx.stroke();

        // 2. Degraus de Pitch (-30° a +30° de 5 em 5 graus)
        const pitchSteps = [-30, -25, -20, -15, -10, -5, 5, 10, 15, 20, 25, 30];
        const rungWidth = 65;
        const gap = 24;
        const tipH = 7;

        ctx.lineWidth = 1.6;
        ctx.font = '700 11px "Outfit", monospace, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        pitchSteps.forEach(deg => {
            const y = horizY - deg * pxPerDegree;
            const isClimb = deg > 0;
            const tipDir = isClimb ? 1 : -1; // Pernas viradas para o horizonte

            if (isClimb) {
                // Subida (Nariz para cima): Linha contínua
                ctx.setLineDash([]);
            } else {
                // Descida (Nariz para baixo): Linha tracejada padrão aeronáutico
                ctx.setLineDash([5, 4]);
            }

            // Barra Esquerda
            ctx.beginPath();
            ctx.moveTo(-gap, y);
            ctx.lineTo(-rungWidth, y);
            ctx.lineTo(-rungWidth, y + tipH * tipDir);
            ctx.stroke();

            // Barra Direita
            ctx.beginPath();
            ctx.moveTo(gap, y);
            ctx.lineTo(rungWidth, y);
            ctx.lineTo(rungWidth, y + tipH * tipDir);
            ctx.stroke();

            // Numeração de graus nas laterais (sem tracejado)
            ctx.setLineDash([]);
            const label = Math.abs(deg).toString();
            ctx.fillText(label, -rungWidth - 14, y);
            ctx.fillText(label, rungWidth + 14, y);
        });

        ctx.restore();
    }

    /**
     * Desenha o Boresight (Símbolo de Asas / Waterbird fixo no centro da tela)
     */
    drawBoresight(ctx, cx, cy) {
        ctx.save();
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = this.hudGreenBright;

        // Asas do avião em formato de gaivota / chevron invertido (estilo Boeing / Collins)
        ctx.beginPath();
        // Asa esquerda
        ctx.moveTo(cx - 32, cy - 2);
        ctx.lineTo(cx - 14, cy - 2);
        ctx.lineTo(cx - 6, cy + 5);
        ctx.lineTo(cx, cy + 2);
        // Asa direita
        ctx.lineTo(cx + 6, cy + 5);
        ctx.lineTo(cx + 14, cy - 2);
        ctx.lineTo(cx + 32, cy - 2);
        ctx.stroke();

        // Ponto central de mira
        ctx.beginPath();
        ctx.arc(cx, cy, 2, 0, Math.PI * 2);
        ctx.fillStyle = this.hudGreenBright;
        ctx.fill();

        ctx.restore();
    }

    /**
     * Desenha o Flight Path Vector (FPV - Círculo com asas indicando a trajetória real do voo)
     */
    drawFlightPathVector(ctx, cx, cy, telemetry) {
        ctx.save();

        const speedKmh = telemetry.speedKmh || 0;
        const vs = telemetry.verticalSpeed || 0; // m/s
        const pitchRad = telemetry.pitch || 0;
        const visualAoA = telemetry.visualAoA || 0;

        // Deslocamento vertical baseado no ângulo de subida/descida real (Glide Path Angle)
        let fpaDeg = 0;
        if (speedKmh > 30) {
            const speedMs = speedKmh / 3.6;
            fpaDeg = (Math.asin(Math.max(-1, Math.min(1, -vs / speedMs)))) * (180 / Math.PI);
        } else {
            fpaDeg = (pitchRad + visualAoA) * (180 / Math.PI);
        }

        const pxPerDegree = 6.8;
        const currentPitchDeg = (pitchRad + visualAoA) * (180 / Math.PI);
        const pitchDiff = (currentPitchDeg - fpaDeg);

        // Deslocamento suave do FPV no centro
        const fpvY = cy + THREE_Math_clamp(pitchDiff * pxPerDegree, -70, 70);
        const fpvX = cx;

        ctx.lineWidth = 1.8;
        ctx.strokeStyle = this.hudGreenBright;

        // Círculo central com aleta vertical e asas horizontais
        const r = 5.5;
        ctx.beginPath();
        ctx.arc(fpvX, fpvY, r, 0, Math.PI * 2);
        ctx.stroke();

        // Aleta superior
        ctx.beginPath();
        ctx.moveTo(fpvX, fpvY - r);
        ctx.lineTo(fpvX, fpvY - r - 5);
        ctx.stroke();

        // Asa esquerda
        ctx.beginPath();
        ctx.moveTo(fpvX - r, fpvY);
        ctx.lineTo(fpvX - r - 10, fpvY);
        ctx.stroke();

        // Asa direita
        ctx.beginPath();
        ctx.moveTo(fpvX + r, fpvY);
        ctx.lineTo(fpvX + r + 10, fpvY);
        ctx.stroke();

        ctx.restore();
    }

    /**
     * Desenha a Fita de Velocidade (Airspeed Tape) à Esquerda
     */
    drawSpeedTape(ctx, x, cy, currentSpeed, targetSpeed, speedTrend, isOnGround) {
        ctx.save();
        const tapeWidth = 65;
        const tapeHeight = 280;
        const topY = cy - tapeHeight / 2;
        const bottomY = cy + tapeHeight / 2;
        const pxPerUnit = 2.2; // 2.2px por km/h

        // 1. Linha vertical guia da fita
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(x + tapeWidth, topY);
        ctx.lineTo(x + tapeWidth, bottomY);
        ctx.stroke();

        // 2. Ticks e numerações móveis com clipping
        ctx.save();
        ctx.beginPath();
        ctx.rect(x - 20, topY, tapeWidth + 25, tapeHeight);
        ctx.clip();

        const startSpd = Math.max(0, Math.floor((currentSpeed - 70) / 10) * 10);
        const endSpd = Math.ceil((currentSpeed + 70) / 10) * 10;

        ctx.font = '700 12px "Outfit", monospace, sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';

        for (let spd = startSpd; spd <= endSpd; spd += 10) {
            const y = cy - (spd - currentSpeed) * pxPerUnit;
            const isMajor = spd % 20 === 0;
            const tickLen = isMajor ? 12 : 6;

            ctx.beginPath();
            ctx.moveTo(x + tapeWidth, y);
            ctx.lineTo(x + tapeWidth - tickLen, y);
            ctx.stroke();

            if (isMajor) {
                ctx.fillText(spd.toString(), x + tapeWidth - 16, y);
            }
        }

        // Faixa de Stall / Perigo de Velocidade Baixa (< 185 km/h)
        const stallSpeed = 185;
        if (stallSpeed > currentSpeed - 80) {
            const stallY = cy - (stallSpeed - currentSpeed) * pxPerUnit;
            ctx.fillStyle = 'rgba(255, 60, 60, 0.25)';
            ctx.fillRect(x + tapeWidth - 6, Math.max(topY, stallY), 6, bottomY - Math.max(topY, stallY));

            ctx.strokeStyle = '#ff3333';
            ctx.beginPath();
            ctx.moveTo(x + tapeWidth - 6, Math.max(topY, stallY));
            ctx.lineTo(x + tapeWidth, Math.max(topY, stallY));
            ctx.stroke();
            ctx.strokeStyle = this.hudGreen;
        }

        // Bug de Velocidade Alvo (Target Speed Bug / MCP SPD)
        if (targetSpeed > currentSpeed - 70 && targetSpeed < currentSpeed + 70) {
            const bugY = cy - (targetSpeed - currentSpeed) * pxPerUnit;
            ctx.fillStyle = this.hudGreenBright;
            ctx.beginPath();
            ctx.moveTo(x + tapeWidth, bugY);
            ctx.lineTo(x + tapeWidth - 10, bugY - 6);
            ctx.lineTo(x + tapeWidth - 10, bugY + 6);
            ctx.closePath();
            ctx.fill();
        }

        // Vetor de Tendência de Velocidade (Speed Trend Vector)
        if (Math.abs(speedTrend) > 1.5) {
            const trendY = cy - THREE_Math_clamp(speedTrend * pxPerUnit, -90, 90);
            ctx.strokeStyle = this.hudGreenBright;
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            ctx.moveTo(x + tapeWidth + 3, cy);
            ctx.lineTo(x + tapeWidth + 3, trendY);
            // Seta
            const arrowDir = speedTrend > 0 ? -1 : 1;
            ctx.lineTo(x + tapeWidth - 1, trendY - 4 * arrowDir);
            ctx.moveTo(x + tapeWidth + 3, trendY);
            ctx.lineTo(x + tapeWidth + 7, trendY - 4 * arrowDir);
            ctx.stroke();
            ctx.lineWidth = 1.8;
            ctx.strokeStyle = this.hudGreen;
        }

        ctx.restore();

        // 3. Caixa de Leitura Digital da Velocidade Atual (Pointer Box)
        const boxH = 26;
        const boxW = 55;
        const boxX = x + tapeWidth - boxW - 8;
        const boxY = cy - boxH / 2;

        ctx.fillStyle = 'rgba(5, 12, 10, 0.92)';
        ctx.beginPath();
        ctx.moveTo(boxX, boxY);
        ctx.lineTo(boxX + boxW, boxY);
        ctx.lineTo(boxX + boxW + 8, cy); // Ponta apontando para a fita
        ctx.lineTo(boxX + boxW, boxY + boxH);
        ctx.lineTo(boxX, boxY + boxH);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = this.hudGreenBright;
        ctx.font = '700 16px "Outfit", monospace, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(Math.round(currentSpeed).toString(), boxX + boxW / 2, cy);

        // 4. Mostrador de Velocidade Alvo no Topo da Fita (ex: 360)
        ctx.font = '700 13px "Outfit", monospace, sans-serif';
        ctx.fillStyle = this.hudGreen;
        ctx.textAlign = 'left';
        ctx.fillText(`IAS ${Math.round(targetSpeed)}`, x - 10, topY - 10);

        ctx.restore();
    }

    /**
     * Desenha a Fita de Altitude (Altitude Tape & VSI) à Direita
     */
    drawAltitudeTape(ctx, x, cy, currentAltitude, targetAltitude, verticalSpeed, radioAltitude, isOnGround) {
        ctx.save();
        const tapeWidth = 65;
        const tapeHeight = 280;
        const topY = cy - tapeHeight / 2;
        const bottomY = cy + tapeHeight / 2;
        const pxPerUnit = 0.55; // 0.55px por metro

        // 1. Linha vertical guia da fita
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(x, topY);
        ctx.lineTo(x, bottomY);
        ctx.stroke();

        // 2. Ticks e numerações com clipping
        ctx.save();
        ctx.beginPath();
        ctx.rect(x - 5, topY, tapeWidth + 30, tapeHeight);
        ctx.clip();

        const startAlt = Math.max(0, Math.floor((currentAltitude - 250) / 20) * 20);
        const endAlt = Math.ceil((currentAltitude + 250) / 20) * 20;

        ctx.font = '700 12px "Outfit", monospace, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        for (let alt = startAlt; alt <= endAlt; alt += 20) {
            const y = cy - (alt - currentAltitude) * pxPerUnit;
            const isMajor = alt % 100 === 0;
            const tickLen = isMajor ? 12 : 6;

            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + tickLen, y);
            ctx.stroke();

            if (isMajor) {
                ctx.fillText(alt.toString(), x + 16, y);
            }
        }

        // Bug de Altitude Alvo (Target Altitude Bug / MCP ALT)
        if (targetAltitude > currentAltitude - 240 && targetAltitude < currentAltitude + 240) {
            const bugY = cy - (targetAltitude - currentAltitude) * pxPerUnit;
            ctx.fillStyle = this.hudGreenBright;
            ctx.beginPath();
            ctx.moveTo(x, bugY);
            ctx.lineTo(x + 10, bugY - 6);
            ctx.lineTo(x + 10, bugY + 6);
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();

        // 3. Caixa de Leitura Digital da Altitude Atual (Pointer Box)
        const boxH = 26;
        const boxW = 60;
        const boxX = x + 8;
        const boxY = cy - boxH / 2;

        ctx.fillStyle = 'rgba(5, 12, 10, 0.92)';
        ctx.beginPath();
        ctx.moveTo(boxX, boxY);
        ctx.lineTo(boxX + boxW, boxY);
        ctx.lineTo(boxX + boxW, boxY + boxH);
        ctx.lineTo(boxX, boxY + boxH);
        ctx.lineTo(boxX - 8, cy); // Ponta apontando para a esquerda
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = this.hudGreenBright;
        ctx.font = '700 16px "Outfit", monospace, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(Math.round(currentAltitude).toString().padStart(4, '0'), boxX + boxW / 2, cy);

        // 4. Mostrador de Altitude Alvo no Topo da Fita (ex: 3000)
        ctx.font = '700 13px "Outfit", monospace, sans-serif';
        ctx.fillStyle = this.hudGreen;
        ctx.textAlign = 'right';
        ctx.fillText(`ALT ${Math.round(targetAltitude)}`, x + tapeWidth + 10, topY - 10);

        // 5. Escala de Velocidade Vertical (VSI - Vertical Speed Indicator) à extrema direita
        this.drawVSI(ctx, x + tapeWidth + 24, cy, verticalSpeed);

        ctx.restore();
    }

    /**
     * Desenha o Indicador de Razão de Subida/Descida (VSI)
     */
    drawVSI(ctx, vsiX, cy, verticalSpeed) {
        ctx.save();
        const vsiH = 140;

        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(vsiX, cy - vsiH / 2);
        ctx.lineTo(vsiX, cy + vsiH / 2);
        ctx.stroke();

        // Ticks de VSI (0, ±2, ±5, ±10 m/s)
        const vsiMarks = [-10, -5, -2, 0, 2, 5, 10];
        vsiMarks.forEach(val => {
            const vy = cy - (val / 10) * (vsiH / 2);
            ctx.beginPath();
            ctx.moveTo(vsiX, vy);
            ctx.lineTo(vsiX + 5, vy);
            ctx.stroke();
        });

        // Ponteiro / Agulha de Razão de Subida
        const clampedVS = THREE_Math_clamp(-verticalSpeed, -10, 10);
        const ptrY = cy - (clampedVS / 10) * (vsiH / 2);

        ctx.fillStyle = this.hudGreenBright;
        ctx.beginPath();
        ctx.moveTo(vsiX, ptrY);
        ctx.lineTo(vsiX + 8, ptrY - 4);
        ctx.lineTo(vsiX + 8, ptrY + 4);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }

    /**
     * Desenha a Altitude de Radar (Distância real do solo) no centro inferior
     */
    drawRadioAltitude(ctx, cx, y, radioAltitude, isOnGround) {
        if (radioAltitude > 1200) return; // Só exibe em aproximação e pouso (< 1200m)

        ctx.save();
        ctx.font = '700 15px "Outfit", monospace, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const displayAlt = isOnGround ? 0 : Math.round(radioAltitude);
        ctx.fillText(`${displayAlt} R`, cx, y);

        // Subtítulo de auxílio ao pouso
        if (displayAlt <= 50 && !isOnGround) {
            ctx.fillStyle = this.hudGreenBright;
            ctx.font = '700 12px "Outfit", monospace, sans-serif';
            ctx.fillText('FLARE / TOUCHDOWN', cx, y + 20);
        }

        ctx.restore();
    }
}

/**
 * Utilitários matemáticos auxiliares
 */
function THREE_Math_lerp(x, y, t) {
    return (1 - t) * x + t * y;
}

function THREE_Math_clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}
