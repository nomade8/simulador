/**
 * airlinerHud.js - Head-Up Display (HUD) Colimado Minimalista de Primeira Pessoa
 *
 * Visual leve, nítido e desobstruído inspirado em HUDs óticos modernos (Boeing 787 HGS / Airbus):
 * - Traços vetoriais finos (1.0 - 1.3px), brilho sutil e sem caixas opacas pesadas
 * - Amplo campo central aberto para visão limpa da pista e do horizonte
 * - Fitas laterais translúcidas de velocidade e altitude com fade vertical suave
 * - Indicador integrado de Potência / N1% com marcador de manete alvo
 */

export default class AirlinerHUD {
    constructor(simulator) {
        this.simulator = simulator;
        this.visible = false;
        this.container = null;
        this.canvas = null;
        this.ctx = null;

        // Histórico para cálculo de tendência de velocidade (speed trend vector)
        this.speedHistory = [];
        this.lastUpdateTime = performance.now();
        this.speedTrend = 0; // projeção de variação em km/h nos próximos 6s

        // Modos do HUD na tecla 'H':
        // 0 = Desligado
        // 1 = Verde Cristal (Normal, leve)
        // 2 = Verde Suave / Dim (~48%)
        // 3 = Âmbar / Vermelho Noturno (Visão Noturna)
        this.hudMode = 0;
        this.colorMode = 'green';
        this.setTheme('green');

        this.hudWarning = '#ffd166';
        this.hudAlert = '#ff5c5c';

        this.initDOM();
        this.initEvents();
    }

    /**
     * Define a paleta leve e translúcida do HUD
     */
    setTheme(theme) {
        this.colorMode = theme;
        if (theme === 'red') {
            this.hudPrimary = 'rgba(255, 92, 92, 0.88)';
            this.hudBright = 'rgba(255, 138, 138, 0.96)';
            this.hudSoft = 'rgba(255, 92, 92, 0.52)';
            this.hudFaint = 'rgba(255, 92, 92, 0.24)';
            this.hudShadow = 'rgba(255, 60, 60, 0.28)';
            this.hudBoxBg = 'rgba(18, 4, 6, 0.26)';
        } else {
            this.hudPrimary = 'rgba(72, 255, 155, 0.86)';
            this.hudBright = 'rgba(145, 255, 195, 0.96)';
            this.hudSoft = 'rgba(72, 255, 155, 0.50)';
            this.hudFaint = 'rgba(72, 255, 155, 0.22)';
            this.hudShadow = 'rgba(0, 255, 135, 0.24)';
            this.hudBoxBg = 'rgba(4, 16, 12, 0.24)';
        }
    }

    /**
     * Inicializa os elementos DOM do HUD
     */
    initDOM() {
        this.container = document.createElement('div');
        this.container.id = 'airlinerHudContainer';
        this.container.className = 'airliner-hud-container';
        this.container.style.display = 'none';

        this.canvas = document.createElement('canvas');
        this.canvas.id = 'airlinerHudCanvas';
        this.canvas.className = 'airliner-hud-canvas';
        this.container.appendChild(this.canvas);

        document.body.appendChild(this.container);

        this.ctx = this.canvas.getContext('2d');
        this.resize();
    }

    /**
     * Ajusta a resolução do canvas para monitores High-DPI / Retina
     */
    resize() {
        if (!this.canvas || !this.container) return;
        const rect = this.container.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        this.width = rect.width || 860;
        this.height = rect.height || 580;

        this.canvas.width = this.width * dpr;
        this.canvas.height = this.height * dpr;

        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(dpr, dpr);
    }

    /**
     * Ouvintes de eventos e tecla de atalho 'H'
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
     * Alterna o modo do HUD pela tecla 'H'
     */
    toggle() {
        this.hudMode = (this.hudMode + 1) % 4;
        this.applyMode();
    }

    /**
     * Aplica o estado visual atual do HUD
     */
    applyMode() {
        if (!this.container) return;
        switch (this.hudMode) {
            case 0:
                this.visible = false;
                this.container.style.display = 'none';
                break;
            case 1:
                this.visible = true;
                this.setTheme('green');
                this.container.style.opacity = '0.92';
                this.container.style.display = 'flex';
                this.resize();
                break;
            case 2:
                this.visible = true;
                this.setTheme('green');
                this.container.style.opacity = '0.48';
                this.container.style.display = 'flex';
                this.resize();
                break;
            case 3:
                this.visible = true;
                this.setTheme('red');
                this.container.style.opacity = '0.90';
                this.container.style.display = 'flex';
                this.resize();
                break;
        }
    }

    /**
     * Loop de renderização do HUD colimado
     */
    update(telemetry) {
        if (!this.visible || !this.ctx || !this.width || !this.height) return;

        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;
        const cx = w / 2;
        const cy = h / 2;

        ctx.clearRect(0, 0, w, h);

        const speedKmh = telemetry.speedKmh || 0;
        const throttle = telemetry.throttle !== undefined ? telemetry.throttle : 0;
        const enginePower = telemetry.enginePower !== undefined ? telemetry.enginePower : throttle;
        const isBraking = !!telemetry.isBraking;
        const altitudeMeters = telemetry.altitudeMeters || 0;
        const radioAltitude = telemetry.radioAltitude !== undefined ? telemetry.radioAltitude : altitudeMeters;
        const verticalSpeed = telemetry.verticalSpeed || 0;
        const pitchRad = telemetry.pitch || 0;
        const visualAoA = telemetry.visualAoA || 0;
        const effectivePitchDeg = (pitchRad + visualAoA) * (180 / Math.PI);
        const rollRad = telemetry.roll || 0;
        const rollDeg = rollRad * (180 / Math.PI);
        const headingDeg = telemetry.headingDeg !== undefined ? telemetry.headingDeg : 0;
        const targetSpeed = telemetry.targetSpeed || 360;
        const targetAltitude = telemetry.targetAltitude || 500;
        const apEnabled = !!telemetry.apEnabled;
        const isOnGround = !!telemetry.isOnGround;

        // Tendência de velocidade (6s)
        const now = performance.now();
        const dt = (now - this.lastUpdateTime) / 1000;
        this.lastUpdateTime = now;
        if (dt > 0 && dt < 1) {
            this.speedHistory.push({ time: now, speed: speedKmh });
            if (this.speedHistory.length > 24) this.speedHistory.shift();

            if (this.speedHistory.length >= 2) {
                const oldest = this.speedHistory[0];
                const timeDiff = (now - oldest.time) / 1000;
                if (timeDiff > 0.1) {
                    const accel = (speedKmh - oldest.speed) / timeDiff;
                    this.speedTrend = lerp(this.speedTrend, accel * 6, 0.12);
                }
            }
        }

        // Espaçamento adaptativo para manter o centro completamente livre
        const tapeOffset = Math.min(270, w * 0.33);

        ctx.save();
        ctx.strokeStyle = this.hudPrimary;
        ctx.fillStyle = this.hudPrimary;
        ctx.lineWidth = 1.15;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = this.hudShadow;
        ctx.shadowBlur = 1.5;
        ctx.font = '500 11px "Outfit", monospace, sans-serif';

        // 1. Barra minimalista de status FMA no topo
        this.drawFMA(ctx, cx, 26, { apEnabled, isOnGround, isBraking });

        // 2. Fita de Proa minimalista no topo central
        this.drawHeadingTape(ctx, cx, 52, headingDeg);

        // 3. Arco de Roll delicado
        this.drawRollScale(ctx, cx, cy - 28, rollDeg);

        // 4. Horizonte Artificial e Pitch Ladder leve com fade nas bordas
        this.drawPitchLadder(ctx, cx, cy, effectivePitchDeg, rollDeg);

        // 5. Boresight minimalista no centro
        this.drawBoresight(ctx, cx, cy);

        // 6. Flight Path Vector (FPV) + Seta de energia/aceleração
        this.drawFlightPathVector(ctx, cx, cy, telemetry, this.speedTrend);

        // 7. Fita de Velocidade à Esquerda (aberta e translúcida)
        this.drawSpeedTape(ctx, cx - tapeOffset, cy, speedKmh, targetSpeed, this.speedTrend, apEnabled);

        // 8. Indicador Minimalista de Potência (N1 / THR) abaixo da fita de velocidade
        this.drawPowerIndicator(ctx, cx - tapeOffset, cy + 162, throttle, enginePower, isBraking);

        // 9. Fita de Altitude + VSI à Direita
        this.drawAltitudeTape(ctx, cx + tapeOffset, cy, altitudeMeters, targetAltitude, verticalSpeed, apEnabled);

        // 10. Altímetro de Radar no centro inferior (somente em baixa altitude)
        this.drawRadioAltitude(ctx, cx, cy + 150, radioAltitude, isOnGround);

        ctx.restore();
    }

    /**
     * Barra FMA discreta e limpa
     */
    drawFMA(ctx, cx, topY, data) {
        ctx.save();
        ctx.font = '500 10px "Outfit", monospace, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = this.hudSoft;

        const thrMode = data.isBraking ? 'BRK' : (data.apEnabled ? 'A/T SPD' : 'MAN THR');
        const latMode = data.apEnabled ? 'HDG' : 'ROLL';
        const vertMode = data.isOnGround ? 'TOGA' : (data.apEnabled ? 'ALT' : 'FPA');

        ctx.fillText(thrMode, cx - 120, topY);
        ctx.fillText(latMode, cx, topY);
        ctx.fillText(vertMode, cx + 120, topY);

        if (data.apEnabled) {
            ctx.fillStyle = this.hudBright;
            ctx.fillText('AP', cx + 178, topY);
        }

        ctx.restore();
    }

    /**
     * Fita de Proa leve no topo central
     */
    drawHeadingTape(ctx, cx, y, headingDeg) {
        ctx.save();
        const width = 200;
        const pxPerDeg = 2.2;

        // Linha base sutil
        ctx.strokeStyle = this.hudSoft;
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(cx - width / 2, y + 12);
        ctx.lineTo(cx + width / 2, y + 12);
        ctx.stroke();

        // Ponteiro vazado central
        ctx.strokeStyle = this.hudBright;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(cx, y + 13);
        ctx.lineTo(cx - 4, y + 19);
        ctx.lineTo(cx + 4, y + 19);
        ctx.closePath();
        ctx.stroke();

        // Ticks com fade lateral suave
        ctx.save();
        ctx.beginPath();
        ctx.rect(cx - width / 2, y - 16, width, 30);
        ctx.clip();

        const startDeg = Math.floor((headingDeg - 45) / 5) * 5;
        const endDeg = Math.ceil((headingDeg + 45) / 5) * 5;

        ctx.font = '500 9.5px "Outfit", monospace, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';

        for (let d = startDeg; d <= endDeg; d += 5) {
            const normalized = ((d % 360) + 360) % 360;
            const x = cx + (d - headingDeg) * pxPerDeg;
            const edgeFade = 1 - clamp(Math.abs(x - cx) / (width * 0.52), 0, 1);
            if (edgeFade <= 0.05) continue;

            ctx.globalAlpha = edgeFade;
            const isMajor = d % 10 === 0;
            const tickH = isMajor ? 6 : 3;

            ctx.strokeStyle = this.hudPrimary;
            ctx.lineWidth = isMajor ? 1.1 : 0.85;
            ctx.beginPath();
            ctx.moveTo(x, y + 12);
            ctx.lineTo(x, y + 12 - tickH);
            ctx.stroke();

            if (isMajor) {
                let label = (normalized / 10).toString().padStart(2, '0');
                if (normalized === 0) label = 'N';
                else if (normalized === 90) label = 'E';
                else if (normalized === 180) label = 'S';
                else if (normalized === 270) label = 'W';

                ctx.fillStyle = this.hudPrimary;
                ctx.fillText(label, x, y + 4);
            }
        }
        ctx.restore();

        // Leitura digital discreta da proa
        ctx.font = '500 11px "Outfit", monospace, sans-serif';
        ctx.fillStyle = this.hudBright;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(`${Math.round(headingDeg).toString().padStart(3, '0')}°`, cx, y + 22);

        ctx.restore();
    }

    /**
     * Arco de inclinação lateral (Roll Scale) fino e elegante
     */
    drawRollScale(ctx, cx, cy, rollDeg) {
        ctx.save();
        const radius = 128;

        ctx.strokeStyle = this.hudFaint;
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, -Math.PI * 0.70, -Math.PI * 0.30);
        ctx.stroke();

        const angles = [-45, -30, -20, -10, 0, 10, 20, 30, 45];
        ctx.strokeStyle = this.hudSoft;
        angles.forEach(deg => {
            const rad = (-90 + deg) * (Math.PI / 180);
            const isMajor = deg === 0 || Math.abs(deg) === 30;
            const len = isMajor ? 7 : 4;

            const x1 = cx + Math.cos(rad) * radius;
            const y1 = cy + Math.sin(rad) * radius;
            const x2 = cx + Math.cos(rad) * (radius - len);
            const y2 = cy + Math.sin(rad) * (radius - len);

            ctx.lineWidth = isMajor ? 1.15 : 0.85;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        });

        // Ponteiro triangular vazado de roll
        const clampedRoll = clamp(rollDeg, -55, 55);
        const pointerRad = (-90 - clampedRoll) * (Math.PI / 180);
        const px = cx + Math.cos(pointerRad) * (radius + 2);
        const py = cy + Math.sin(pointerRad) * (radius + 2);

        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(pointerRad + Math.PI / 2);
        ctx.strokeStyle = this.hudBright;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-4, 7);
        ctx.lineTo(4, 7);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();

        ctx.restore();
    }

    /**
     * Horizonte Artificial e Pitch Ladder minimalista com fade vertical
     */
    drawPitchLadder(ctx, cx, cy, pitchDeg, rollDeg) {
        ctx.save();

        const clipHalfW = 148;
        const clipHalfH = 138;
        ctx.beginPath();
        ctx.rect(cx - clipHalfW, cy - clipHalfH, clipHalfW * 2, clipHalfH * 2);
        ctx.clip();

        ctx.translate(cx, cy);
        ctx.rotate((-rollDeg * Math.PI) / 180);

        const pxPerDegree = 6.2;
        const horizY = pitchDeg * pxPerDegree;

        // 1. Linha do Horizonte (aberta no centro para não poluir a mira/pista)
        const horizGap = 38;
        const horizLen = 115;
        const horizFade = 1 - clamp(Math.abs(horizY) / (clipHalfH * 1.05), 0, 1);

        if (horizFade > 0.05) {
            ctx.save();
            ctx.globalAlpha = horizFade * 0.85;
            ctx.strokeStyle = this.hudPrimary;
            ctx.lineWidth = 1.25;
            ctx.beginPath();
            ctx.moveTo(-horizLen, horizY);
            ctx.lineTo(-horizGap, horizY);
            ctx.moveTo(horizGap, horizY);
            ctx.lineTo(horizLen, horizY);
            ctx.stroke();
            ctx.restore();
        }

        // 2. Degraus de Pitch espaçados (a cada 10° principais + marcas curtas de 5°)
        const pitchSteps = [-30, -20, -10, -5, 5, 10, 20, 30];
        ctx.font = '400 10px "Outfit", monospace, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        pitchSteps.forEach(deg => {
            const y = horizY - deg * pxPerDegree;
            const fade = 1 - clamp(Math.abs(y) / (clipHalfH * 0.98), 0, 1);
            if (fade <= 0.05) return;

            const isClimb = deg > 0;
            const isMajor = Math.abs(deg) % 10 === 0;
            const tipDir = isClimb ? 1 : -1;
            const gap = isMajor ? 28 : 30;
            const rungWidth = isMajor ? 56 : 42;
            const tipH = isMajor ? 5 : 0;

            ctx.save();
            ctx.globalAlpha = fade * (isMajor ? 0.78 : 0.45);
            ctx.strokeStyle = this.hudPrimary;
            ctx.lineWidth = isMajor ? 1.1 : 0.85;
            ctx.setLineDash(isClimb ? [] : [4, 4]);

            // Esquerda
            ctx.beginPath();
            ctx.moveTo(-gap, y);
            ctx.lineTo(-rungWidth, y);
            if (tipH > 0) ctx.lineTo(-rungWidth, y + tipH * tipDir);
            ctx.stroke();

            // Direita
            ctx.beginPath();
            ctx.moveTo(gap, y);
            ctx.lineTo(rungWidth, y);
            if (tipH > 0) ctx.lineTo(rungWidth, y + tipH * tipDir);
            ctx.stroke();

            if (isMajor) {
                ctx.setLineDash([]);
                ctx.fillStyle = this.hudSoft;
                const label = Math.abs(deg).toString();
                ctx.fillText(label, -rungWidth - 12, y);
                ctx.fillText(label, rungWidth + 12, y);
            }
            ctx.restore();
        });

        ctx.restore();
    }

    /**
     * Boresight leve (asas finas com ponto central discreto)
     */
    drawBoresight(ctx, cx, cy) {
        ctx.save();
        ctx.lineWidth = 1.35;
        ctx.strokeStyle = this.hudBright;

        ctx.beginPath();
        // Asa esquerda
        ctx.moveTo(cx - 22, cy);
        ctx.lineTo(cx - 8, cy);
        ctx.lineTo(cx - 5, cy + 4);
        // Asa direita
        ctx.moveTo(cx + 22, cy);
        ctx.lineTo(cx + 8, cy);
        ctx.lineTo(cx + 5, cy + 4);
        ctx.stroke();

        // Ponto central mínimo
        ctx.beginPath();
        ctx.arc(cx, cy, 1.4, 0, Math.PI * 2);
        ctx.fillStyle = this.hudBright;
        ctx.fill();

        ctx.restore();
    }

    /**
     * Flight Path Vector (FPV) minimalista + Energy Caret (aceleração/desaceleração)
     */
    drawFlightPathVector(ctx, cx, cy, telemetry, speedTrend) {
        ctx.save();

        const speedKmh = telemetry.speedKmh || 0;
        const vs = telemetry.verticalSpeed || 0;
        const pitchRad = telemetry.pitch || 0;
        const visualAoA = telemetry.visualAoA || 0;

        let fpaDeg = 0;
        if (speedKmh > 30) {
            const speedMs = speedKmh / 3.6;
            fpaDeg = Math.asin(clamp(-vs / speedMs, -1, 1)) * (180 / Math.PI);
        } else {
            fpaDeg = (pitchRad + visualAoA) * (180 / Math.PI);
        }

        const pxPerDegree = 6.2;
        const currentPitchDeg = (pitchRad + visualAoA) * (180 / Math.PI);
        const pitchDiff = currentPitchDeg - fpaDeg;

        const fpvY = cy + clamp(pitchDiff * pxPerDegree, -72, 72);
        const fpvX = cx;

        ctx.lineWidth = 1.25;
        ctx.strokeStyle = this.hudBright;

        const r = 4.5;
        ctx.beginPath();
        ctx.arc(fpvX, fpvY, r, 0, Math.PI * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(fpvX, fpvY - r);
        ctx.lineTo(fpvX, fpvY - r - 4);
        ctx.moveTo(fpvX - r, fpvY);
        ctx.lineTo(fpvX - r - 8, fpvY);
        ctx.moveTo(fpvX + r, fpvY);
        ctx.lineTo(fpvX + r + 8, fpvY);
        ctx.stroke();

        // Seta sutil de energia/aceleração à esquerda do FPV
        if (Math.abs(speedTrend) > 2) {
            const caretOffsetY = clamp(-speedTrend * 0.45, -18, 18);
            const caretX = fpvX - r - 15;
            const caretY = fpvY + caretOffsetY;
            ctx.strokeStyle = this.hudPrimary;
            ctx.lineWidth = 1.1;
            ctx.beginPath();
            ctx.moveTo(caretX - 4, caretY - 3);
            ctx.lineTo(caretX, caretY);
            ctx.lineTo(caretX - 4, caretY + 3);
            ctx.stroke();
        }

        ctx.restore();
    }

    /**
     * Fita de Velocidade (Airspeed Tape) leve e translúcida à esquerda
     */
    drawSpeedTape(ctx, anchorX, cy, currentSpeed, targetSpeed, speedTrend, apEnabled) {
        ctx.save();
        const tapeHeight = 236;
        const topY = cy - tapeHeight / 2;
        const bottomY = cy + tapeHeight / 2;
        const pxPerUnit = 2.0;

        // Linha guia fina
        ctx.strokeStyle = this.hudSoft;
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(anchorX, topY);
        ctx.lineTo(anchorX, bottomY);
        ctx.stroke();

        // Ticks com fade nas extremidades superior e inferior
        ctx.save();
        ctx.beginPath();
        ctx.rect(anchorX - 75, topY, 86, tapeHeight);
        ctx.clip();

        const startSpd = Math.max(0, Math.floor((currentSpeed - 65) / 10) * 10);
        const endSpd = Math.ceil((currentSpeed + 65) / 10) * 10;

        ctx.font = '400 10.5px "Outfit", monospace, sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';

        for (let spd = startSpd; spd <= endSpd; spd += 10) {
            const y = cy - (spd - currentSpeed) * pxPerUnit;
            const fade = 1 - clamp(Math.abs(y - cy) / (tapeHeight * 0.52), 0, 1);
            if (fade <= 0.04) continue;
            // Evitar sobreposição com o readout central
            if (Math.abs(y - cy) < 14) continue;

            ctx.save();
            ctx.globalAlpha = fade * 0.85;
            const isMajor = spd % 20 === 0;
            const tickLen = isMajor ? 8 : 4;

            ctx.strokeStyle = this.hudPrimary;
            ctx.lineWidth = isMajor ? 1.05 : 0.8;
            ctx.beginPath();
            ctx.moveTo(anchorX, y);
            ctx.lineTo(anchorX - tickLen, y);
            ctx.stroke();

            if (isMajor) {
                ctx.fillStyle = this.hudSoft;
                ctx.fillText(spd.toString(), anchorX - 12, y);
            }
            ctx.restore();
        }

        // Marcação discreta de stall (< 185 km/h)
        const stallSpeed = 185;
        if (stallSpeed > currentSpeed - 70) {
            const stallY = cy - (stallSpeed - currentSpeed) * pxPerUnit;
            ctx.strokeStyle = 'rgba(255, 85, 85, 0.72)';
            ctx.lineWidth = 2.0;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(anchorX - 2, Math.max(topY, stallY));
            ctx.lineTo(anchorX - 2, bottomY);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Bug de Velocidade Alvo (somente quando Piloto Automático ativo)
        if (apEnabled && targetSpeed > currentSpeed - 65 && targetSpeed < currentSpeed + 65) {
            const bugY = cy - (targetSpeed - currentSpeed) * pxPerUnit;
            ctx.strokeStyle = this.hudBright;
            ctx.lineWidth = 1.25;
            ctx.beginPath();
            ctx.moveTo(anchorX, bugY);
            ctx.lineTo(anchorX - 7, bugY - 4);
            ctx.lineTo(anchorX - 7, bugY + 4);
            ctx.closePath();
            ctx.stroke();
        }

        // Vetor de tendência de velocidade (fino e limpo)
        if (Math.abs(speedTrend) > 2) {
            const trendY = cy - clamp(speedTrend * pxPerUnit, -80, 80);
            ctx.strokeStyle = this.hudBright;
            ctx.lineWidth = 1.3;
            ctx.beginPath();
            ctx.moveTo(anchorX + 3, cy);
            ctx.lineTo(anchorX + 3, trendY);
            const arrowDir = speedTrend > 0 ? -1 : 1;
            ctx.lineTo(anchorX, trendY - 3.5 * arrowDir);
            ctx.moveTo(anchorX + 3, trendY);
            ctx.lineTo(anchorX + 6, trendY - 3.5 * arrowDir);
            ctx.stroke();
        }

        ctx.restore();

        // Caixa translúcida e leve do valor atual
        const boxH = 24;
        const boxW = 48;
        const boxX = anchorX - boxW - 7;
        const boxY = cy - boxH / 2;

        ctx.fillStyle = this.hudBoxBg;
        ctx.strokeStyle = this.hudBright;
        ctx.lineWidth = 1.15;
        ctx.beginPath();
        ctx.moveTo(boxX, boxY);
        ctx.lineTo(boxX + boxW, boxY);
        ctx.lineTo(boxX + boxW + 6, cy);
        ctx.lineTo(boxX + boxW, boxY + boxH);
        ctx.lineTo(boxX, boxY + boxH);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = this.hudBright;
        ctx.font = '500 14px "Outfit", monospace, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(Math.round(currentSpeed).toString(), boxX + boxW / 2, cy);

        // Cabeçalho discreto
        ctx.font = '400 10px "Outfit", monospace, sans-serif';
        ctx.fillStyle = this.hudSoft;
        ctx.textAlign = 'right';
        ctx.fillText(apEnabled ? `SPD ${Math.round(targetSpeed)}` : 'KM/H', anchorX, topY - 12);

        ctx.restore();
    }

    /**
     * Indicador minimalista de Potência (N1 / THR) sob a fita de velocidade
     */
    drawPowerIndicator(ctx, anchorX, y, throttle, enginePower, isBraking) {
        ctx.save();
        const barW = 54;
        const barX = anchorX - barW;
        const n1Pct = Math.round(clamp(enginePower, 0, 1) * 100);
        const thrRatio = clamp(throttle, 0, 1);
        const n1Ratio = clamp(enginePower, 0, 1);

        // Rótulo e percentual
        ctx.font = '500 10.5px "Outfit", monospace, sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = isBraking ? this.hudAlert : (n1Pct >= 92 ? this.hudWarning : this.hudBright);
        ctx.fillText(isBraking ? 'BRK' : `N1 ${n1Pct}%`, anchorX, y - 8);

        // Trilho fino da barra de potência
        ctx.strokeStyle = this.hudFaint;
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(barX, y + 4);
        ctx.lineTo(barX + barW, y + 4);
        ctx.stroke();

        // Preenchimento fino da potência atual N1
        ctx.strokeStyle = n1Pct >= 92 ? this.hudWarning : this.hudBright;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(barX, y + 4);
        ctx.lineTo(barX + barW * n1Ratio, y + 4);
        ctx.stroke();

        // Marcador vertical da posição da manete alvo (Throttle)
        const targetX = barX + barW * thrRatio;
        ctx.strokeStyle = this.hudPrimary;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(targetX, y);
        ctx.lineTo(targetX, y + 8);
        ctx.stroke();

        ctx.restore();
    }

    /**
     * Fita de Altitude (Altitude Tape & VSI) leve à direita
     */
    drawAltitudeTape(ctx, anchorX, cy, currentAltitude, targetAltitude, verticalSpeed, apEnabled) {
        ctx.save();
        const tapeHeight = 236;
        const topY = cy - tapeHeight / 2;
        const bottomY = cy + tapeHeight / 2;
        const pxPerUnit = 0.52;

        // Linha guia fina
        ctx.strokeStyle = this.hudSoft;
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(anchorX, topY);
        ctx.lineTo(anchorX, bottomY);
        ctx.stroke();

        // Ticks com fade nas extremidades
        ctx.save();
        ctx.beginPath();
        ctx.rect(anchorX - 10, topY, 86, tapeHeight);
        ctx.clip();

        const startAlt = Math.max(0, Math.floor((currentAltitude - 240) / 20) * 20);
        const endAlt = Math.ceil((currentAltitude + 240) / 20) * 20;

        ctx.font = '400 10.5px "Outfit", monospace, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        for (let alt = startAlt; alt <= endAlt; alt += 20) {
            const y = cy - (alt - currentAltitude) * pxPerUnit;
            const fade = 1 - clamp(Math.abs(y - cy) / (tapeHeight * 0.52), 0, 1);
            if (fade <= 0.04) continue;
            if (Math.abs(y - cy) < 14) continue;

            ctx.save();
            ctx.globalAlpha = fade * 0.85;
            const isMajor = alt % 100 === 0;
            const tickLen = isMajor ? 8 : 4;

            ctx.strokeStyle = this.hudPrimary;
            ctx.lineWidth = isMajor ? 1.05 : 0.8;
            ctx.beginPath();
            ctx.moveTo(anchorX, y);
            ctx.lineTo(anchorX + tickLen, y);
            ctx.stroke();

            if (isMajor) {
                ctx.fillStyle = this.hudSoft;
                ctx.fillText(alt.toString(), anchorX + 12, y);
            }
            ctx.restore();
        }

        // Bug de Altitude Alvo (quando Piloto Automático ativo)
        if (apEnabled && targetAltitude > currentAltitude - 230 && targetAltitude < currentAltitude + 230) {
            const bugY = cy - (targetAltitude - currentAltitude) * pxPerUnit;
            ctx.strokeStyle = this.hudBright;
            ctx.lineWidth = 1.25;
            ctx.beginPath();
            ctx.moveTo(anchorX, bugY);
            ctx.lineTo(anchorX + 7, bugY - 4);
            ctx.lineTo(anchorX + 7, bugY + 4);
            ctx.closePath();
            ctx.stroke();
        }

        ctx.restore();

        // Caixa translúcida de altitude atual
        const boxH = 24;
        const boxW = 54;
        const boxX = anchorX + 7;
        const boxY = cy - boxH / 2;

        ctx.fillStyle = this.hudBoxBg;
        ctx.strokeStyle = this.hudBright;
        ctx.lineWidth = 1.15;
        ctx.beginPath();
        ctx.moveTo(boxX, boxY);
        ctx.lineTo(boxX + boxW, boxY);
        ctx.lineTo(boxX + boxW, boxY + boxH);
        ctx.lineTo(boxX, boxY + boxH);
        ctx.lineTo(boxX - 6, cy);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = this.hudBright;
        ctx.font = '500 14px "Outfit", monospace, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(Math.round(currentAltitude).toString(), boxX + boxW / 2, cy);

        // Cabeçalho discreto
        ctx.font = '400 10px "Outfit", monospace, sans-serif';
        ctx.fillStyle = this.hudSoft;
        ctx.textAlign = 'left';
        ctx.fillText(apEnabled ? `ALT ${Math.round(targetAltitude)}` : 'ALT M', anchorX, topY - 12);

        // VSI compacto e leve ao lado direito
        this.drawVSI(ctx, anchorX + 68, cy, verticalSpeed);

        ctx.restore();
    }

    /**
     * Indicador de Razão de Subida/Descida (VSI) minimalista
     */
    drawVSI(ctx, vsiX, cy, verticalSpeed) {
        ctx.save();
        const vsiH = 120;

        ctx.strokeStyle = this.hudFaint;
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(vsiX, cy - vsiH / 2);
        ctx.lineTo(vsiX, cy + vsiH / 2);
        ctx.stroke();

        const vsiMarks = [-10, -5, 0, 5, 10];
        ctx.strokeStyle = this.hudSoft;
        vsiMarks.forEach(val => {
            const vy = cy - (val / 10) * (vsiH / 2);
            ctx.beginPath();
            ctx.moveTo(vsiX, vy);
            ctx.lineTo(vsiX + (val === 0 ? 6 : 3.5), vy);
            ctx.stroke();
        });

        // Barra fina do centro até a razão atual
        const clampedVS = clamp(-verticalSpeed, -10, 10);
        const ptrY = cy - (clampedVS / 10) * (vsiH / 2);

        ctx.strokeStyle = this.hudBright;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(vsiX, cy);
        ctx.lineTo(vsiX, ptrY);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(vsiX, ptrY, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = this.hudBright;
        ctx.fill();

        ctx.restore();
    }

    /**
     * Altímetro de Radar discreto no centro inferior
     */
    drawRadioAltitude(ctx, cx, y, radioAltitude, isOnGround) {
        if (radioAltitude > 800) return;

        ctx.save();
        ctx.font = '500 13px "Outfit", monospace, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const displayAlt = isOnGround ? 0 : Math.round(radioAltitude);
        ctx.fillStyle = displayAlt <= 30 && !isOnGround ? this.hudWarning : this.hudPrimary;
        ctx.fillText(`RA ${displayAlt}m`, cx, y);

        if (displayAlt <= 40 && !isOnGround) {
            ctx.fillStyle = this.hudBright;
            ctx.font = '500 10px "Outfit", monospace, sans-serif';
            ctx.fillText('FLARE', cx, y + 16);
        }

        ctx.restore();
    }
}

function lerp(x, y, t) {
    return (1 - t) * x + t * y;
}

function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}
