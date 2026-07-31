/**
 * Autopilot.js - Módulo de Piloto Automático para o Simulador de Voo
 * 
 * Funcionalidades:
 * - Ativação/Desativação via tecla 'P' ou Painel HUD.
 * - Restrição: Funciona exclusivamente em voo.
 * - Nivelamento suave das asas (roll -> 0) e do nariz (pitch -> 0).
 * - Manutenção de Altitude Alvo (em metros) de maneira suave.
 * - Manutenção de Velocidade Alva (em km/h) de maneira suave.
 */

export default class Autopilot {
    constructor(simulator) {
        this.simulator = simulator;
        this.enabled = false;
        
        // Parâmetros Alvo Padrão
        this.targetAltitude = 500; // Metros (HUD exibe altitude * 5)
        this.targetSpeed = 360;    // km/h (HUD exibe speed * 30)

        // Limites de Segurança do Voo
        this.minSpeedKmh = 270;    // Abaixo disso o avião entra em stall
        this.maxSpeedKmh = 600;    // Velocidade máxima permitida
        this.minAltitudeMeters = 50;
        this.maxAltitudeMeters = 5000;

        // Elementos DOM da UI do Piloto Automático
        this.panelElement = null;
        this.statusBadge = null;
        this.altInput = null;
        this.speedInput = null;
        this.toggleBtn = null;
        this.notificationElement = null;

        // Suavização (filtros / coeficientes lerp)
        this.rollLerpFactor = 0.04;
        this.pitchLerpFactor = 0.03;
        this.speedLerpFactor = 0.02;

        this.initUI();
        this.initEventListeners();
    }

    /**
     * Cria e adiciona a interface do Piloto Automático no DOM.
     */
    initUI() {
        // Estêiner de notificação flutuante (toast)
        this.notificationElement = document.createElement('div');
        this.notificationElement.id = 'apNotification';
        this.notificationElement.className = 'ap-notification';
        document.body.appendChild(this.notificationElement);

        // Painel do Piloto Automático no HUD (canto superior direito)
        this.panelElement = document.createElement('div');
        this.panelElement.id = 'autopilot-panel';
        this.panelElement.className = 'ap-panel';
        this.panelElement.innerHTML = `
            <div class="ap-header">
                <div class="ap-title">
                    <span class="ap-icon">✈️</span>
                    <span>PILOTO AUTOMÁTICO</span>
                </div>
                <div id="apStatusBadge" class="ap-badge ap-off">DESLIGADO</div>
            </div>
            
            <div class="ap-body">
                <div class="ap-field">
                    <label for="apAltInput">ALTITUDE ALVO (m)</label>
                    <div class="ap-input-group">
                        <input type="number" id="apAltInput" min="50" max="5000" step="50" value="${this.targetAltitude}">
                        <button type="button" id="btnSyncAlt" class="ap-btn-sub" title="Usar altitude atual">USAR ATUAL</button>
                    </div>
                </div>

                <div class="ap-field">
                    <label for="apSpeedInput">VELOCIDADE ALVO (km/h)</label>
                    <div class="ap-input-group">
                        <input type="number" id="apSpeedInput" min="270" max="600" step="10" value="${this.targetSpeed}">
                        <button type="button" id="btnSyncSpeed" class="ap-btn-sub" title="Usar velocidade atual">USAR ATUAL</button>
                    </div>
                </div>

                <div class="ap-actions">
                    <button type="button" id="btnToggleAP" class="ap-btn ap-btn-toggle">
                        LIGAR (P)
                    </button>
                    <button type="button" id="btnLevelPlane" class="ap-btn ap-btn-level" title="Nivelar asas e inclinação imediatamente">
                        NIVELAR AVIÃO
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(this.panelElement);

        // Obter referências DOM
        this.statusBadge = document.getElementById('apStatusBadge');
        this.altInput = document.getElementById('apAltInput');
        this.speedInput = document.getElementById('apSpeedInput');
        this.toggleBtn = document.getElementById('btnToggleAP');

        // Eventos nos inputs
        this.altInput.addEventListener('change', (e) => {
            let val = parseFloat(e.target.value);
            if (isNaN(val)) val = 500;
            this.targetAltitude = Math.max(this.minAltitudeMeters, Math.min(this.maxAltitudeMeters, val));
            this.altInput.value = this.targetAltitude;
        });

        this.altInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') e.target.blur();
        });

        this.speedInput.addEventListener('change', (e) => {
            let val = parseFloat(e.target.value);
            if (isNaN(val)) val = 360;
            this.targetSpeed = Math.max(this.minSpeedKmh, Math.min(this.maxSpeedKmh, val));
            this.speedInput.value = this.targetSpeed;
        });

        this.speedInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') e.target.blur();
        });

        const removeFocus = (e) => {
            if (e && e.target && typeof e.target.blur === 'function') {
                e.target.blur();
            }
            if (document.activeElement && typeof document.activeElement.blur === 'function') {
                document.activeElement.blur();
            }
        };

        document.getElementById('btnSyncAlt').addEventListener('click', (e) => {
            removeFocus(e);
            if (this.simulator && this.simulator.planeState) {
                const currentAlt = Math.round(this.simulator.planeState.altitude * 5);
                this.targetAltitude = Math.max(this.minAltitudeMeters, currentAlt);
                this.altInput.value = this.targetAltitude;
                this.showNotification(`Altitude Alvo ajustada para ${this.targetAltitude}m`);
            }
        });

        document.getElementById('btnSyncSpeed').addEventListener('click', (e) => {
            removeFocus(e);
            if (this.simulator && this.simulator.planeState) {
                const currentSpeed = Math.round(this.simulator.planeState.speed * 30);
                this.targetSpeed = Math.max(this.minSpeedKmh, Math.min(this.maxSpeedKmh, currentSpeed));
                this.speedInput.value = this.targetSpeed;
                this.showNotification(`Velocidade Alvo ajustada para ${this.targetSpeed} km/h`);
            }
        });

        this.toggleBtn.addEventListener('click', (e) => {
            removeFocus(e);
            this.toggle();
        });

        document.getElementById('btnLevelPlane').addEventListener('click', (e) => {
            removeFocus(e);
            this.levelPlaneNow();
        });
    }

    /**
     * Adiciona ouvintes de teclado globais.
     */
    initEventListeners() {
        window.addEventListener('keydown', (event) => {
            // Se algum botão da interface tiver o foco, remove o foco imediatamente para que o espaço não clique no botão
            if (document.activeElement && document.activeElement.tagName === 'BUTTON') {
                document.activeElement.blur();
            }

            // Ignorar atalhos de controle se o usuário estiver digitando em um input numérico
            if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
                return;
            }

            // Apenas a tecla 'P' ativa/desativa o Piloto Automático
            if (event.key.toLowerCase() === 'p') {
                this.toggle();
            }
        });
    }

    /**
     * Alterna o estado do Piloto Automático (Ligar/Desligar).
     */
    toggle() {
        if (this.enabled) {
            this.disable("Piloto Automático DESATIVADO");
        } else {
            this.enable();
        }
    }

    /**
     * Tenta ativar o Piloto Automático. Valida se a aeronave está em voo.
     */
    enable() {
        if (!this.simulator || !this.simulator.planeState) return;

        // Verificar se o avião está em solo ou se o jogo acabou
        if (this.simulator.gameOver || this.simulator._isOnGround || this.simulator.planeState.altitude < 1.5) {
            this.showNotification("⚠️ Piloto Automático só funciona em VOO!", true);
            return;
        }

        this.enabled = true;
        this.updateUIState();

        // Se os valores nos inputs forem razoáveis, garantir sincronia
        if (this.altInput && this.altInput.value) {
            this.targetAltitude = parseFloat(this.altInput.value) || this.targetAltitude;
        }
        if (this.speedInput && this.speedInput.value) {
            this.targetSpeed = parseFloat(this.speedInput.value) || this.targetSpeed;
        }

        this.showNotification("✈️ Piloto Automático ATIVADO");
    }

    /**
     * Desativa o Piloto Automático.
     */
    disable(reason = "Piloto Automático DESATIVADO") {
        if (!this.enabled) return;
        this.enabled = false;
        this.updateUIState();
        this.showNotification(reason);
    }

    /**
     * Nivelamento instantâneo das atitudes de voo e atualização dos alvos.
     */
    levelPlaneNow() {
        if (!this.simulator || !this.simulator.planeState) return;

        // Zerar instantaneamente os ângulos de rotação/inclinação (asas e nariz retos)
        this.simulator.planeState.roll = 0;
        this.simulator.planeState.pitch = 0;
        this.simulator.planeState.visualAoA = 0;

        // Desativar comandos de atitude manuais
        this.simulator.planeState.isTurningLeft = false;
        this.simulator.planeState.isTurningRight = false;
        this.simulator.planeState.isPitchingUp = false;
        this.simulator.planeState.isPitchingDown = false;

        // Sincronizar parâmetros alvos com o voo atual
        const currentAlt = Math.round(this.simulator.planeState.altitude * 5);
        const currentSpeed = Math.round(this.simulator.planeState.speed * 30);

        this.targetAltitude = Math.max(this.minAltitudeMeters, currentAlt);
        this.targetSpeed = Math.max(this.minSpeedKmh, Math.min(this.maxSpeedKmh, currentSpeed));

        if (this.altInput) this.altInput.value = this.targetAltitude;
        if (this.speedInput) this.speedInput.value = this.targetSpeed;

        // Se o Piloto Automático não estiver ativado e a aeronave estiver em voo, ativa-o
        if (!this.enabled && !this.simulator._isOnGround && this.simulator.planeState.altitude > 1.5) {
            this.enable();
        }

        this.showNotification("⚖️ Avião Nivelado (Asas e Nariz Zerados)");
    }

    /**
     * Atualiza os elementos visuais da interface (Badge & Botão).
     */
    updateUIState() {
        if (!this.statusBadge || !this.toggleBtn) return;

        if (this.enabled) {
            this.statusBadge.textContent = "ATIVADO";
            this.statusBadge.className = "ap-badge ap-on";
            this.toggleBtn.textContent = "DESLIGAR (P)";
            this.toggleBtn.classList.add("active");
        } else {
            this.statusBadge.textContent = "DESLIGADO";
            this.statusBadge.className = "ap-badge ap-off";
            this.toggleBtn.textContent = "LIGAR (P)";
            this.toggleBtn.classList.remove("active");
        }
    }

    /**
     * Exibe notificações visuais temporárias na tela.
     */
    showNotification(message, isWarning = false) {
        if (!this.notificationElement) return;

        this.notificationElement.textContent = message;
        this.notificationElement.style.backgroundColor = isWarning ? 'rgba(231, 76, 60, 0.9)' : 'rgba(46, 204, 113, 0.9)';
        this.notificationElement.style.borderColor = isWarning ? '#e74c3c' : '#2ecc71';
        this.notificationElement.classList.add('visible');

        if (this.notifyTimer) clearTimeout(this.notifyTimer);
        this.notifyTimer = setTimeout(() => {
            this.notificationElement.classList.remove('visible');
        }, 2800);
    }

    /**
     * Loop principal de atualização do Piloto Automático.
     * Deve ser chamado dentro do loop de animação do simulador.
     */
    update(planeState, isOnGround) {
        if (!this.enabled) return;

        // Segurança 1: Se pousou ou tocou o solo, desativa imediatamente o P.A.
        if (isOnGround || (planeState && planeState.altitude < 1.0)) {
            this.disable("⚠️ P.A. desativado automaticamente ao se aproximar do solo!");
            return;
        }

        // Segurança 2: Se o jogo encerrou
        if (this.simulator && this.simulator.gameOver) {
            this.disable();
            return;
        }

        // --- 1. NIVELAMENTO SUAVE DAS ASAS (ROLL) APENAS QUANDO O PILOTO NÃO ESTÁ CURVANDO ---
        // Se o piloto estiver usando A/D ou Setas Esquerda/Direita para virar o avião,
        // permite a curva normalmente. Quando soltar as teclas, o P.A. nivela as asas.
        if (!planeState.isTurningLeft && !planeState.isTurningRight) {
            planeState.roll += (0 - planeState.roll) * this.rollLerpFactor;
        }

        // --- 2. CONTROLE SUAVE DE ALTITUDE ABSOLUTA & INCLINAÇÃO (PITCH) ---
        const currentAltitudeMeters = planeState.altitude * 5;
        const altitudeError = this.targetAltitude - currentAltitudeMeters;

        // Se o piloto não estiver ajustando a altura manualmente (W/S ou Cima/Baixo), o P.A. mantém a altitude alvo
        if (!planeState.isPitchingUp && !planeState.isPitchingDown) {
            const maxClimbPitch = 0.32;   // ~18 graus
            const maxDescentPitch = -0.25; // ~14 graus

            let targetPitch = altitudeError * 0.0012;
            targetPitch = Math.max(maxDescentPitch, Math.min(maxClimbPitch, targetPitch));

            planeState.pitch += (targetPitch - planeState.pitch) * this.pitchLerpFactor;
        }

        // --- 3. CONTROLE SUAVE DE VELOCIDADE (SPEED) ---
        const targetSpeedInternal = this.targetSpeed / 30; // Conversão de km/h para unidade interna do jogo
        
        // Transição suave de aceleração / desaceleração
        planeState.speed += (targetSpeedInternal - planeState.speed) * this.speedLerpFactor;
    }
}
