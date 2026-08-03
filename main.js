import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { createPlayerPlane } from './planeFactory.js?v=1.0.3';
import CityManager from './city.js?v=1.0.3';
import City2Manager from './city2.js?v=1.0.3';
import Autopilot from './autopilot.js?v=1.0.3';

// Adiciona o método de raycast acelerado ao protótipo do Mesh
THREE.Mesh.prototype.raycast = acceleratedRaycast;

class FlightSimulator {
    constructor() {
        console.log("Iniciando Simulador de Voo Puro...");
        try {
            this.gameOver = false;
            this.gameOverDisplayed = false;
            this.playerHealth = 100;

            // Elementos DOM
            this.healthBar = document.getElementById('healthBar');
            this.healthElement = document.getElementById('health');
            this.gameOverScreen = document.getElementById('gameOverScreen');
            this.gameOverTitle = document.getElementById('gameOverTitle');
            this.gameOverMessage = document.getElementById('gameOverMessage');

            // Relatório de Pouso DOM
            this.landingModal = document.getElementById('landingModal');
            this.landingGrade = document.getElementById('landingGrade');
            this.landingTotalScore = document.getElementById('landingTotalScore');
            this.centralityValue = document.getElementById('centralityValue');
            this.centralityScoreBar = document.getElementById('centralityScoreBar');
            this.centralityDesc = document.getElementById('centralityDesc');
            this.forceValue = document.getElementById('forceValue');
            this.forceScoreBar = document.getElementById('forceScoreBar');
            this.forceDesc = document.getElementById('forceDesc');

            // Ouvintes de evento do modal
            const btnContinue = document.getElementById('btnContinue');
            if (btnContinue) {
                btnContinue.addEventListener('click', () => this.continueFlight());
            }
            const btnRestart = document.getElementById('btnRestart');
            if (btnRestart) {
                btnRestart.addEventListener('click', () => location.reload());
            }
            const btnReplay = document.getElementById('btnReplay');
            if (btnReplay) {
                btnReplay.addEventListener('click', () => this.startReplay());
            }

            // Ouvintes dos botões do HUD de Replay
            const btnReplayPlayPause = document.getElementById('btnReplayPlayPause');
            if (btnReplayPlayPause) {
                btnReplayPlayPause.addEventListener('click', () => this.toggleReplayPause());
            }
            const btnReplaySpeed = document.getElementById('btnReplaySpeed');
            if (btnReplaySpeed) {
                btnReplaySpeed.addEventListener('click', () => this.cycleReplaySpeed());
            }
            const btnReplayRestart = document.getElementById('btnReplayRestart');
            if (btnReplayRestart) {
                btnReplayRestart.addEventListener('click', () => {
                    this.replayIndex = 0;
                });
            }
            const btnReplayExit = document.getElementById('btnReplayExit');
            if (btnReplayExit) {
                btnReplayExit.addEventListener('click', () => this.stopReplay());
            }

            // Estado do Replay (Últimos 20 segundos)
            this.flightHistory = [];
            this.maxHistoryDuration = 20;
            this.isReplaying = false;
            this.replayIndex = 0;
            this.replaySpeed = 2.0;
            this.replayPaused = false;
            this.recordedReplayData = [];

            // Estado de voo adicional para pouso (Inicia pousado na pista principal da cidade)
            this.lastAltitude = 0.51;
            this.lastTime = performance.now();
            this.currentVerticalSpeed = 0;
            this.wasInAir = false;
            this.touchdownData = null;
            this.landingReportDisplayed = false;

            this.engineAudioStarted = false;
            this.landingStopStartTime = null;
            this.landingActionTriggered = false;
            this.smokeParticles = [];
            this.spokenCallouts = { 50: false, 40: false, 30: false, 20: false, 10: false };
            this.gpwsVoice = null;
            if ('speechSynthesis' in window) {
                window.speechSynthesis.getVoices();
                window.speechSynthesis.onvoiceschanged = () => {
                    this.preloadGpwsVoice();
                };
                this.preloadGpwsVoice();
            }

            // Configurações de Qualidade de Desempenho
            this.graphicsQuality = 'high';
            this.usePostProcessing = true;
            this.minimapCanvas = document.getElementById('minimapCanvas');

            // Criar Cena
            this.scene = new THREE.Scene();

            // Ajuste do fog para um visual suave e realista usando FogExp2
            const fogColor = new THREE.Color('#7acdf3');
            this.scene.background = fogColor;
            this.scene.fog = new THREE.FogExp2(fogColor, 0.00065);

            // Mensagem de Pouso HUD
            this.createLandingMessage();

            // Câmera e Renderizador (near plane 0.2 para evitar Z-fighting e renderizar pistas perfeitamente)
            this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.2, 20000);
            this.renderer = new THREE.WebGLRenderer({
                antialias: false,
                logarithmicDepthBuffer: false
            });
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.BasicShadowMap;
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            document.body.appendChild(this.renderer.domElement);

            // Post-processing
            this.composer = new EffectComposer(this.renderer);
            const renderPass = new RenderPass(this.scene, this.camera);
            this.composer.addPass(renderPass);

            const outputPass = new OutputPass();
            this.composer.addPass(outputPass);

            // Céu com gradiente
            this.createSkyGradient();

            // Iluminação
            this.setupLights();

            // Criar Terreno, Pista, Vegetação, Nuvens e Cidade
            this.createScene();

            // Criar Avião (Pousado na pista da cidade)
            this.createPlane();
            this.cameraOffset = new THREE.Vector3(0, 1.3, -1);

            // Configurar Câmera
            this.setupCamera();

            // OrbitControls desativados (mantendo apenas estrutura básica de câmera que segue o avião)
            this.controls = new OrbitControls(this.camera, this.renderer.domElement);
            this.controls.target.copy(this.airplane.position);
            this.controls.enablePan = false;
            this.controls.enableZoom = false;
            this.controls.enableRotate = false;
            this.controls.enabled = false;

            // Configurar Controles de Voo e Tela Inicial
            this.setupControls();
            this.setupEngineAudio();
            this.setupStartScreen();

            // Variáveis de Estado de Voo (Inicia parado no solo com trem baixado)
            this.planeState = {
                speed: 0,
                altitude: 0.51,
                fuel: 100,
                rotation: 0, // Yaw
                pitch: 0,    // Pitch
                roll: 0,     // Roll
                flapTarget: 0,
                flapAngle: 0,
                gearRetracted: true, // Trem de Pouso BAIXADO
                isTurningLeft: false,
                isTurningRight: false,
                isPitchingUp: false,
                isPitchingDown: false
            };

            this.cameraMode = 'thirdPerson';
            this.orbitYaw = 0;
            this.orbitPitch = 0.3;
            this.orbitDistance = 12;
            this.isMouseDragging = false;
            this.previousMousePosition = { x: 0, y: 0 };

            this.cameraShake = { frames: 0, totalFrames: 0, intensity: 0 };

            // Instanciar o Piloto Automático
            this.autopilot = new Autopilot(this);

            this.updateHealthBar();
            this.updateHUD();

            console.log("Iniciando animação do simulador...");
            this.animate();
        } catch (error) {
            console.error("Erro na inicialização do simulador:", error);
        }
    }

    updateHealthBar() {
        if (this.healthBar) {
            const healthPercentage = Math.max(0, this.playerHealth);
            this.healthBar.style.width = `${healthPercentage}%`;
            if (this.healthElement) {
                this.healthElement.textContent = Math.round(healthPercentage);
            }
            if (healthPercentage > 60) {
                this.healthBar.style.backgroundColor = '#4CAF50'; // Verde
            } else if (healthPercentage > 30) {
                this.healthBar.style.backgroundColor = '#ffc107'; // Amarelo
            } else {
                this.healthBar.style.backgroundColor = '#f44336'; // Vermelho
            }
        }
    }

    setupLights() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        const sunLight = new THREE.DirectionalLight(0xffffff, 0.7);
        sunLight.position.set(50, 200, 100);
        sunLight.castShadow = true;

        sunLight.shadow.mapSize.width = 2048;
        sunLight.shadow.mapSize.height = 2048;
        sunLight.shadow.camera.near = 1;
        sunLight.shadow.camera.far = 500;
        sunLight.shadow.camera.left = -100;
        sunLight.shadow.camera.right = 100;
        sunLight.shadow.camera.top = 100;
        sunLight.shadow.camera.bottom = -100;
        sunLight.shadow.autoUpdate = true;
        this.sunLight = sunLight;
        this.scene.add(sunLight);

        // Criar o halo do sol
        const haloMaterial = new THREE.SpriteMaterial({
            map: this.createHaloTexture(),
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            transparent: true
        });
        this.sunHalo = new THREE.Sprite(haloMaterial);
        this.sunHalo.scale.set(650, 650, 1);
        this.scene.add(this.sunHalo);

        const fillLight = new THREE.DirectionalLight(0x8088ff, 0.5);
        fillLight.position.set(-50, 100, -100);
        fillLight.shadow.autoUpdate = false;
        this.scene.add(fillLight);

        const rimLight = new THREE.DirectionalLight(0xfff0dd, 0.5);
        rimLight.position.set(0, 50, -200);
        rimLight.shadow.autoUpdate = false;
        this.scene.add(rimLight);
    }

    createHaloTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        // Círculo com gradiente radial para simular brilho/halo solar
        const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
        gradient.addColorStop(0, 'rgba(255, 255, 235, 1.0)');
        gradient.addColorStop(0.12, 'rgba(255, 238, 170, 0.7)');
        gradient.addColorStop(0.35, 'rgba(255, 195, 90, 0.3)');
        gradient.addColorStop(0.65, 'rgba(255, 175, 75, 0.08)');
        gradient.addColorStop(1.0, 'rgba(255, 175, 75, 0.0)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 256, 256);

        return new THREE.CanvasTexture(canvas);
    }

    createProceduralTerrain() {
        // Terreno procedural com montanhas, serras e vales (4000x4000 com 90x90 segmentos)
        const size = 4000;
        const segments = 90;
        const groundGeometry = new THREE.PlaneGeometry(size, size, segments, segments);
        const posAttr = groundGeometry.attributes.position;
        const count = posAttr.count;

        // Centros de todas as 8 pistas (4 principais + 4 pequenas) para achatamento perfeito das zonas de pouso
        const runwayCenters = [
            new THREE.Vector2(0, 0),
            new THREE.Vector2(600, 700),
            new THREE.Vector2(-600, -500),
            new THREE.Vector2(-700, 400),
            new THREE.Vector2(1000, -800),
            new THREE.Vector2(-1100, 900),
            new THREE.Vector2(-400, -1200),
            new THREE.Vector2(1200, 500)
        ];

        // Função de ruído multi-oitavas para montar a topografia procedural
        function getTerrainElevation(x, z) {
            // Fator de suavização perto das pistas de pouso
            let minDistToRunway = Infinity;
            for (let rc of runwayCenters) {
                const dist = Math.hypot(x - rc.x, z - rc.y);
                if (dist < minDistToRunway) minDistToRunway = dist;
            }

            // Se estiver a menos de 140m da pista, terreno é plano. De 140m a 320m faz transição suave.
            let flattenFactor = 1.0;
            if (minDistToRunway < 140) {
                flattenFactor = 0;
            } else if (minDistToRunway < 320) {
                const t = (minDistToRunway - 140) / (320 - 140);
                flattenFactor = t * t * (3 - 2 * t); // Smoothstep
            }

            // Oitavas de relevo (serras distantes + colinas suaves)
            const n1 = Math.sin(x * 0.0018 + 0.4) * Math.cos(z * 0.0018 + 0.8) * 160; // Montanhas de grande escala
            const n2 = Math.sin(x * 0.005 - z * 0.004) * Math.cos(x * 0.003 + z * 0.005) * 65; // Serras médias
            const n3 = Math.sin(x * 0.012) * Math.cos(z * 0.012) * 18; // Ondulações de terreno
            const n4 = Math.sin(x * 0.035 + z * 0.025) * 4; // Micro-relevo

            // Criar vales suaves e picos elevados
            let height = Math.max(0, n1 + n2 + n3 + n4);
            return height * flattenFactor;
        }

        for (let i = 0; i < count; i++) {
            // Note que em PlaneGeometry (X, Y, Z), antes de rotacionar no eixo X, a altura do terreno fica em posAttr.setZ(i, h)
            const vx = posAttr.getX(i);
            const vy = posAttr.getY(i); // este vy corresponderá a -Z no mundo após rotação
            const h = getTerrainElevation(vx, -vy);
            posAttr.setZ(i, h);
        }

        groundGeometry.computeVertexNormals();
        groundGeometry.boundsTree = new MeshBVH(groundGeometry);

        // Gerar texturas em Alta Qualidade (1024x1024) e Modo Leve (256x256)
        this.highResTerrainTexture = this.generateTerrainTexture(1024);
        this.lowResTerrainTexture = this.generateTerrainTexture(256);

        this.groundMaterial = new THREE.MeshStandardMaterial({
            map: this.highResTerrainTexture,
            color: '#ffffff',
            roughness: 0.9,
            metalness: 0.05,
            flatShading: false
        });

        this.ground = new THREE.Mesh(groundGeometry, this.groundMaterial);
        this.ground.rotation.x = -Math.PI / 2;
        this.ground.receiveShadow = true;
        this.scene.add(this.ground);
    }

    generateTerrainTexture(size) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(size, size);

        function textureNoise(x, y) {
            const n = Math.sin(x * 0.015) * Math.cos(y * 0.015) +
                Math.sin(x * 0.035) * Math.cos(y * 0.035) * 0.5 +
                Math.sin(x * 0.08) * Math.cos(y * 0.08) * 0.25;
            return (n + 1) / 2;
        }

        const scale = 1024 / size;
        for (let x = 0; x < size; x++) {
            for (let y = 0; y < size; y++) {
                const index = (y * size + x) * 4;
                const wx = x * scale;
                const wy = y * scale;
                const nVal = textureNoise(wx, wy);
                const nVal2 = textureNoise(wx * 2.8, wy * 2.8);

                const grassR = 24, grassG = 95, grassB = 28;
                const mossR = 40, mossG = 115, mossB = 32;
                const earthR = 85, earthG = 75, earthB = 45;

                let r, g, b;
                if (nVal > 0.65) {
                    const factor = (nVal - 0.65) / 0.35;
                    r = grassR + (earthR - grassR) * factor;
                    g = grassG + (earthG - grassG) * factor;
                    b = grassB + (earthB - grassB) * factor;
                } else {
                    r = grassR + (mossR - grassR) * nVal2;
                    g = grassG + (mossG - grassG) * nVal2;
                    b = grassB + (mossB - grassB) * nVal2;
                }

                const noiseVariation = (Math.random() - 0.5) * 18;
                imageData.data[index] = Math.max(0, Math.min(255, r + noiseVariation));
                imageData.data[index + 1] = Math.max(0, Math.min(255, g + noiseVariation));
                imageData.data[index + 2] = Math.max(0, Math.min(255, b + noiseVariation));
                imageData.data[index + 3] = 255;
            }
        }
        ctx.putImageData(imageData, 0, 0);

        const terrainTexture = new THREE.CanvasTexture(canvas);
        terrainTexture.wrapS = THREE.RepeatWrapping;
        terrainTexture.wrapT = THREE.RepeatWrapping;
        terrainTexture.repeat.set(16, 16);

        if (size > 500) {
            const maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();
            terrainTexture.anisotropy = maxAnisotropy;
        } else {
            terrainTexture.anisotropy = 1;
        }
        return terrainTexture;
    }

    createScene() {
        this.createProceduralTerrain();

        // Criar 4 Pistas de Pouso Principais
        this.runways = [];
        this.createRunway({ position: new THREE.Vector3(0, 0, 0), width: 8.5, length: 140 });
        this.createRunway({ position: new THREE.Vector3(600, 0, 700), width: 8.5, length: 140 });
        this.createRunway({ position: new THREE.Vector3(-600, 0, -500), width: 8.5, length: 140 });
        this.createRunway({ position: new THREE.Vector3(-700, 0, 400), width: 8.5, length: 140 });

        // Criar 4 Pistas Pequenas (Aeródromos) com a mesma marcação completa, soleiras e iluminação
        this.createRunway({ position: new THREE.Vector3(1000, 0, -800), width: 5.5, length: 90, rotationY: Math.PI });
        this.createRunway({ position: new THREE.Vector3(-1100, 0, 900), width: 5.5, length: 90, rotationY: (2 * Math.PI) / 2 });
        this.createRunway({ position: new THREE.Vector3(-400, 0, -1200), width: 5.5, length: 90, rotationY: Math.PI });
        this.createRunway({ position: new THREE.Vector3(1200, 0, 500), width: 5.5, length: 90, rotationY: (5 * Math.PI) });

        // Vegetação e Parques Eólicos nas montanhas
        this.ground.updateMatrixWorld(true);
        this.createStylizedVegetation();
        this.createWindTurbines();

        // Nuvens
        this.createClouds();

        // Cidade 1 Principal e Aeródromos secundários
        this.cityManager = new CityManager(this.scene, this.ground);
        this.city2Manager = new City2Manager(this.scene, this.ground, [
            new THREE.Vector3(600, 0, 700),
            new THREE.Vector3(-600, 0, -500),
            new THREE.Vector3(-700, 0, 400),
            new THREE.Vector3(1000, 0, -800),
            new THREE.Vector3(-1100, 0, 900),
            new THREE.Vector3(-400, 0, -1200),
            new THREE.Vector3(1200, 0, 500)
        ]);
    }

    createRunway(config = {}) {
        const position = config.position || new THREE.Vector3(0, 0, 0);
        const rotationY = config.rotationY || 0;
        const width = config.width || 8.5;
        const length = config.length || 140;

        const runwayGroup = new THREE.Group();
        runwayGroup.position.copy(position);
        runwayGroup.rotation.y = rotationY;

        // Base/Plano cinza de aeroporto embaixo da pista (apenas para aeródromos/pistas secundárias)
        if (config.hasAirportPlaza || (position.x !== 0 || position.z !== 0)) {
            const plazaGeom = new THREE.PlaneGeometry(80, 180);
            const plazaMat = new THREE.MeshStandardMaterial({
                color: '#7d807e',
                roughness: 0.8,
                metalness: 0.1,
                polygonOffset: true,
                polygonOffsetFactor: -1,
                polygonOffsetUnits: -1
            });

            const plazaMesh = new THREE.Mesh(plazaGeom, plazaMat);
            plazaMesh.rotation.x = -Math.PI / 2;
            plazaMesh.position.y = 0.08;
            plazaMesh.receiveShadow = true;
            runwayGroup.add(plazaMesh);
        }

        // 1. Asfalto principal da pista
        const runwayGeom = new THREE.PlaneGeometry(width, length);
        const runwayMat = new THREE.MeshStandardMaterial({
            color: 0x2d3134,
            roughness: 0.9,
            metalness: 0.1,
            polygonOffset: true,
            polygonOffsetFactor: -3,
            polygonOffsetUnits: -3
        });
        const runwayMesh = new THREE.Mesh(runwayGeom, runwayMat);
        runwayMesh.rotation.x = -Math.PI / 2;
        runwayMesh.position.y = 0.15;
        runwayMesh.receiveShadow = true;
        runwayGroup.add(runwayMesh);

        // 2. Bordas de concreto
        const borderGeom = new THREE.PlaneGeometry(width + 2.0, length + 8);
        const borderMat = new THREE.MeshStandardMaterial({
            color: 0x1c1e20,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2
        });
        const border = new THREE.Mesh(borderGeom, borderMat);
        border.rotation.x = -Math.PI / 2;
        border.position.y = 0.12;
        runwayGroup.add(border);

        // Material comum de marcação branca
        const stripeMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            polygonOffset: true,
            polygonOffsetFactor: -4,
            polygonOffsetUnits: -4
        });

        // 3. Faixas centrais descontínuas
        const centerlineGeom = new THREE.PlaneGeometry(0.4, 2.5);
        const halfLen = length / 2;
        for (let z = -halfLen + 15; z <= halfLen - 15; z += 7) {
            const centerline = new THREE.Mesh(centerlineGeom, stripeMat);
            centerline.rotation.x = -Math.PI / 2;
            centerline.position.set(0, 0.18, z);
            runwayGroup.add(centerline);
        }

        // 4. Marcadores de Cabeceira ("Teclas de Piano") nas duas cabeceiras
        const thresholdKeyGeom = new THREE.PlaneGeometry(0.4, 4);
        [-halfLen + 6, halfLen - 6].forEach((thresholdZ) => {
            for (let k = -3; k <= 3; k++) {
                if (k === 0) continue;
                const key = new THREE.Mesh(thresholdKeyGeom, stripeMat);
                key.rotation.x = -Math.PI / 2;
                key.position.set(k * 0.8, 0.18, thresholdZ);
                runwayGroup.add(key);
            }
        });

        // 5. Pontos de Pouso (Touchdown Zone / Aiming Point Markers)
        const touchdownGeom = new THREE.PlaneGeometry(1.2, 8);
        [-halfLen + 25, halfLen - 25].forEach((tdZ) => {
            [-1.8, 1.8].forEach((tdX) => {
                const tdMark = new THREE.Mesh(touchdownGeom, stripeMat);
                tdMark.rotation.x = -Math.PI / 2;
                tdMark.position.set(tdX, 0.18, tdZ);
                runwayGroup.add(tdMark);
            });
        });

        // 6. Luzes laterais de pista e luzes de soleira (cabeceira)
        const lightGeom = new THREE.SphereGeometry(0.25, 8, 8);
        const greenLightMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const redLightMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const whiteLightMat = new THREE.MeshBasicMaterial({ color: 0xffffaa });

        // Luzes de soleiras (Verde entrada, Vermelho fim)
        for (let side = -1; side <= 1; side += 2) {
            const gLight = new THREE.Mesh(lightGeom, greenLightMat);
            gLight.position.set(side * (width / 2 + 0.6), 0.22, halfLen - 1);
            runwayGroup.add(gLight);

            const rLight = new THREE.Mesh(lightGeom, redLightMat);
            rLight.position.set(side * (width / 2 + 0.6), 0.22, -halfLen + 1);
            runwayGroup.add(rLight);
        }

        // Luzes laterais ao longo do comprimento da pista
        for (let z = -halfLen + 5; z <= halfLen - 5; z += 10) {
            for (let side = -1; side <= 1; side += 2) {
                const edgeLight = new THREE.Mesh(lightGeom, whiteLightMat);
                edgeLight.position.set(side * (width / 2 + 0.6), 0.22, z);
                runwayGroup.add(edgeLight);
            }
        }

        this.scene.add(runwayGroup);

        const runwayData = {
            position: position.clone(),
            rotationY,
            width,
            length,
            mesh: runwayMesh,
            group: runwayGroup
        };

        if (!this.runways) this.runways = [];
        this.runways.push(runwayData);

        return runwayData;
    }

    /**
     * Criador de 4 Pistas Menores (Metade do tamanho padrão: 4.25m x 70m)
     * Utiliando THREE.InstancedMesh para alta performance com diferentes Headings
     */
    createSmallInstancedRunways() {
        // As 4 pistas pequenas agora são geradas diretamente via createRunway
        // com todas as marcações de cabeceira, zona de toque e iluminação.
    }

    isPosOnRunway(planePos, r) {
        const dx = planePos.x - r.position.x;
        const dz = planePos.z - r.position.z;
        const rot = r.rotationY || 0;
        const cos = Math.cos(-rot);
        const sin = Math.sin(-rot);
        const localX = dx * cos - dz * sin;
        const localZ = dx * sin + dz * cos;
        return (Math.abs(localX) < r.width / 2 + 1.2 && Math.abs(localZ) < r.length / 2 + 2.0);
    }

    createStylizedVegetation() {
        const createTreeMaterial = () => {
            const hue = 0.33 + (Math.random() * 0.12 - 0.06);
            const color = new THREE.Color().setHSL(hue, 0.65, 0.25 + Math.random() * 0.2);
            return new THREE.MeshPhongMaterial({
                color: color,
                flatShading: true,
                shininess: 0
            });
        };

        const createBushMaterial = () => {
            const hue = 0.35 + (Math.random() * 0.1 - 0.05);
            const color = new THREE.Color().setHSL(hue, 0.55, 0.35 + Math.random() * 0.2);
            return new THREE.MeshPhongMaterial({
                color: color,
                flatShading: true,
                shininess: 0
            });
        };

        const vegetationGroup = new THREE.Group();
        const runwayCenters = [
            { x: 0, z: 0 },
            { x: 600, z: 700 },
            { x: -600, z: -500 },
            { x: -700, z: 400 },
            { x: 1000, z: -800 },
            { x: -1100, z: 900 },
            { x: -400, z: -1200 },
            { x: 1200, z: 500 }
        ];

        const raycaster = new THREE.Raycaster();
        const down = new THREE.Vector3(0, -1, 0);

        for (let i = 0; i < 850; i++) {
            const posX = (Math.random() - 0.5) * 3600;
            const posZ = (Math.random() - 0.5) * 3600;

            // Evita colocar árvores diretamente sobre ou muito próximas das pistas
            let nearRunway = false;
            for (let rc of runwayCenters) {
                if (Math.hypot(posX - rc.x, posZ - rc.z) < 130) {
                    nearRunway = true;
                    break;
                }
            }
            if (nearRunway) continue;

            const randomScale = Math.random() * 0.6 + 0.9;
            let vegMesh;

            if (Math.random() > 0.35) {
                const treeGroup = new THREE.Group();
                const trunkGeometry = new THREE.CylinderGeometry(0.18, 0.3, 2.2 * randomScale, 5);
                const trunkMaterial = new THREE.MeshPhongMaterial({
                    color: 0x4A2E0F,
                    flatShading: true
                });
                const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
                trunk.position.y = 1.1 * randomScale;
                treeGroup.add(trunk);

                const numLeaves = Math.floor(Math.random() * 3) + 3;
                const material = createTreeMaterial();
                for (let j = 0; j < numLeaves; j++) {
                    const size = (0.9 + Math.random() * 0.6) * randomScale;
                    const leafGeometry = new THREE.IcosahedronGeometry(size, 1);
                    const leafMesh = new THREE.Mesh(leafGeometry, material);
                    const offsetX = (Math.random() - 0.5) * size * 0.7;
                    const offsetZ = (Math.random() - 0.5) * size * 0.7;
                    leafMesh.position.set(offsetX, 2.0 * randomScale + (Math.random() * 0.6), offsetZ);
                    leafMesh.scale.set(1, 0.75 + Math.random() * 0.35, 1);
                    treeGroup.add(leafMesh);
                }
                vegMesh = treeGroup;
            } else {
                const bushGroup = new THREE.Group();
                const numSpheres = Math.floor(Math.random() * 3) + 2;
                for (let j = 0; j < numSpheres; j++) {
                    const sphereSize = (0.7 + Math.random() * 0.4) * randomScale;
                    const sphereGeometry = new THREE.SphereGeometry(sphereSize, 6, 5);
                    const sphereMesh = new THREE.Mesh(sphereGeometry, createBushMaterial());
                    sphereMesh.position.set(
                        (Math.random() - 0.5) * 0.6,
                        sphereSize * 0.7,
                        (Math.random() - 0.5) * 0.6
                    );
                    bushGroup.add(sphereMesh);
                }
                vegMesh = bushGroup;
            }

            vegMesh.rotation.y = Math.random() * Math.PI;

            raycaster.set(new THREE.Vector3(posX, 600, posZ), down);
            const intersects = raycaster.intersectObject(this.ground);
            if (intersects.length > 0) {
                const groundY = intersects[0].point.y;
                // Não coloca vegetação se for alto demais (picos de pedras)
                if (groundY < 180) {
                    vegMesh.position.set(posX, groundY, posZ);
                    vegetationGroup.add(vegMesh);
                }
            }

            vegMesh.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
        }
        this.scene.add(vegetationGroup);
    }

    createWindTurbines() {
        this.windTurbineBlades = [];
        const turbineGroup = new THREE.Group();
        const raycaster = new THREE.Raycaster();
        const down = new THREE.Vector3(0, -1, 0);

        // Locais nas cristas de serras para instalar turbinas eólicas
        const turbineLocations = [
            { x: 800, z: -950 },
            { x: 850, z: -1050 },
            { x: 900, z: -600 },
            { x: 1050, z: -500 },
            { x: -1000, z: 900 },
            { x: -1150, z: 1020 },
            { x: -1200, z: 1140 },
            { x: 800, z: 1200 },
            { x: 920, z: 1300 },
            { x: 1040, z: 1400 }
        ];

        const towerMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.3 });
        const bladeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });

        turbineLocations.forEach(loc => {
            raycaster.set(new THREE.Vector3(loc.x, 800, loc.z), down);
            const intersects = raycaster.intersectObject(this.ground);
            if (intersects.length === 0) return;

            const groundY = intersects[0].point.y;
            const singleTurbine = new THREE.Group();
            singleTurbine.position.set(loc.x, groundY, loc.z);

            // Torre cônica alta
            const towerGeom = new THREE.CylinderGeometry(0.6, 1.2, 35, 12);
            const towerMesh = new THREE.Mesh(towerGeom, towerMat);
            towerMesh.position.y = 17.5;
            singleTurbine.add(towerMesh);

            // Nacela (cabeça do gerador)
            const nacelleGeom = new THREE.BoxGeometry(2, 2, 4);
            const nacelleMesh = new THREE.Mesh(nacelleGeom, towerMat);
            nacelleMesh.position.set(0, 35, 0);
            singleTurbine.add(nacelleMesh);

            // Cubo e Pás da hélice
            const bladesPivot = new THREE.Group();
            bladesPivot.position.set(0, 35, 2.1);

            for (let b = 0; b < 3; b++) {
                const bladeGeom = new THREE.BoxGeometry(0.4, 14, 0.1);
                const bladeMesh = new THREE.Mesh(bladeGeom, bladeMat);
                bladeMesh.position.y = 7;

                const bladeHolder = new THREE.Group();
                bladeHolder.rotation.z = (b * Math.PI * 2) / 3;
                bladeHolder.add(bladeMesh);
                bladesPivot.add(bladeHolder);
            }

            singleTurbine.add(bladesPivot);
            this.windTurbineBlades.push(bladesPivot);

            turbineGroup.add(singleTurbine);
        });

        this.scene.add(turbineGroup);
    }

    createClouds() {
        const cloudMaterial = new THREE.MeshLambertMaterial({
            color: '#fcfcfc',
            transparent: true,
            opacity: 0.3,
            flatShading: true
        });

        for (let i = 0; i < 15; i++) {
            const cloudGroup = new THREE.Group();
            const mainSphereSize = Math.random() * 3 + 2;
            const mainSphere = new THREE.Mesh(
                new THREE.SphereGeometry(mainSphereSize, 6, 8),
                cloudMaterial
            );
            cloudGroup.add(mainSphere);

            const numDetails = Math.floor(Math.random() * 2) + 2;
            for (let j = 0; j < numDetails; j++) {
                const detailSize = mainSphereSize * (Math.random() * 0.6 + 0.4);
                const detail = new THREE.Mesh(
                    new THREE.SphereGeometry(detailSize, 5, 8),
                    cloudMaterial
                );
                detail.position.set(
                    (Math.random() - 0.5) * mainSphereSize,
                    (Math.random() - 0.5) * mainSphereSize * 0.9,
                    (Math.random() - 0.5) * mainSphereSize
                );
                cloudGroup.add(detail);
            }

            cloudGroup.position.set(
                Math.random() * 200 - 100,
                Math.random() * 20 + 25,
                Math.random() * 200 - 100
            );
            this.scene.add(cloudGroup);
        }
    }

    createPlane() {
        this.airplane = createPlayerPlane(this.scene);
        this.airplane.position.set(0, 0.51, -50);
        this.airplane.rotation.set(0, 0, 0);
    }

    createSkyGradient() {
        const canvas = document.createElement('canvas');
        canvas.width = 2;
        canvas.height = 256;
        const context = canvas.getContext('2d');
        const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, '#44c0f1');
        gradient.addColorStop(0.5, '#3786ee');
        gradient.addColorStop(1, '#076794');
        context.fillStyle = gradient;
        context.fillRect(0, 0, canvas.width, canvas.height);

        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        this.scene.background = texture;
    }

    createLandingMessage() {
        this.landingMessage = document.createElement('div');
        this.landingMessage.id = 'landingMessage';
        document.body.appendChild(this.landingMessage);
    }

    setupCamera() {
        this.camera.position.copy(this.airplane.position).add(this.cameraOffset);
        this.camera.lookAt(this.airplane.position);
    }

    updateHUD() {
        document.getElementById('speed').textContent = Math.round(this.planeState.speed * 30);
        document.getElementById('altitude').textContent = Math.round(this.planeState.altitude * 5);
        document.getElementById('fuel').textContent = Math.round(this.planeState.fuel);

        const flapsVal = this.planeState.flapTarget === 0.5 ? "15°" : (this.planeState.flapTarget === 1.0 ? "30°" : "0°");
        const flapsEl = document.getElementById('flaps');
        if (flapsEl) {
            flapsEl.textContent = flapsVal;
        }

        const gearEl = document.getElementById('gearStatus');
        if (gearEl) {
            gearEl.textContent = this.planeState.gearRetracted ? "BAIXADO" : "RECOLHIDO";
            gearEl.style.color = this.planeState.gearRetracted ? "#4caf50" : "#ff5252";
        }

        const crosshair = document.getElementById('crosshair');
        if (crosshair) {
            crosshair.style.display = this.cameraMode === 'front' ? 'block' : 'none';
        }

        const fuelBar = document.getElementById('fuelBar');
        if (fuelBar) {
            fuelBar.style.width = `${this.planeState.fuel}%`;
        }

        // Atualizar Proa / Heading (0° a 360°) no topo da tela
        let headingDeg = Math.round((-this.planeState.rotation * (180 / Math.PI)) % 360);
        if (headingDeg < 0) headingDeg += 360;

        const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        const index = Math.round(headingDeg / 45) % 8;
        const cardinal = directions[index];

        const hdgValEl = document.getElementById('headingValue');
        const cardValEl = document.getElementById('cardinalValue');
        if (hdgValEl) hdgValEl.textContent = `${headingDeg.toString().padStart(3, '0')}°`;
        if (cardValEl) cardValEl.textContent = cardinal;

        this.updateHealthBar();
    }

    setupControls() {
        const tryStartEngineAudio = () => {
            if (!this.engineAudioStarted && !this.gameOver && !this.landingReportDisplayed && this.planeState.fuel > 0) {
                this.startEngineAudio();
            }
        };

        window.addEventListener('keydown', tryStartEngineAudio);
        window.addEventListener('pointerdown', tryStartEngineAudio);

        const keyStates = {
            ArrowUp: false,
            ArrowDown: false,
            ArrowLeft: false,
            ArrowRight: false,
            w: false,
            s: false,
            a: false,
            d: false,
            ' ': false,
            x: false
        };

        document.addEventListener('keydown', (event) => {
            // Ignorar atalhos de voo se o usuário estiver digitando nos campos de texto do Piloto Automático
            if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
                return;
            }

            const key = event.key.toLowerCase();
            if (key === 'v') {
                this.toggleCameraMode();
            }
            if (key === 'f') {
                // Alternar flaps: 0 (Retraído) -> 0.5 (15°) -> 1.0 (30°) -> 0
                if (this.planeState.flapTarget === 0) this.planeState.flapTarget = 0.5;
                else if (this.planeState.flapTarget === 0.5) this.planeState.flapTarget = 1.0;
                else this.planeState.flapTarget = 0;
            }
            if (key === 'g') {
                // Alternar recolhimento das rodas / trem de pouso
                this.planeState.gearRetracted = !this.planeState.gearRetracted;
            }
            if (key === 'r') {
                if (this.isReplaying) {
                    this.stopReplay();
                } else {
                    this.startReplay();
                }
            }

            const code = event.key;
            if (keyStates.hasOwnProperty(code) || keyStates.hasOwnProperty(key)) {
                if (keyStates.hasOwnProperty(code)) keyStates[code] = true;
                if (keyStates.hasOwnProperty(key)) keyStates[key] = true;
                this.updatePlaneStateFromKeys(keyStates);
            }
        });

        document.addEventListener('keyup', (event) => {
            if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
                return;
            }

            const key = event.key.toLowerCase();
            const code = event.key;
            if (keyStates.hasOwnProperty(code) || keyStates.hasOwnProperty(key)) {
                if (keyStates.hasOwnProperty(code)) keyStates[code] = false;
                if (keyStates.hasOwnProperty(key)) keyStates[key] = false;
                this.updatePlaneStateFromKeys(keyStates);
            }
        });

        // Controles de mouse para a 3ª câmera (Visão Externa Orbital)
        window.addEventListener('pointerdown', (e) => {
            if (this.cameraMode === 'orbit') {
                this.isMouseDragging = true;
                this.previousMousePosition = { x: e.clientX, y: e.clientY };
            }
        });

        window.addEventListener('pointermove', (e) => {
            if (this.isMouseDragging && this.cameraMode === 'orbit') {
                const deltaX = e.clientX - this.previousMousePosition.x;
                const deltaY = e.clientY - this.previousMousePosition.y;

                this.orbitYaw -= deltaX * 0.005;
                this.orbitPitch += deltaY * 0.005;

                const maxPitch = Math.PI / 2 - 0.05;
                const minPitch = -Math.PI / 2 + 0.05;
                this.orbitPitch = THREE.MathUtils.clamp(this.orbitPitch, minPitch, maxPitch);

                this.previousMousePosition = { x: e.clientX, y: e.clientY };
            }
        });

        window.addEventListener('pointerup', () => {
            this.isMouseDragging = false;
        });

        window.addEventListener('pointercancel', () => {
            this.isMouseDragging = false;
        });

        window.addEventListener('wheel', (e) => {
            if (this.cameraMode === 'orbit') {
                this.orbitDistance += e.deltaY * 0.01;
                this.orbitDistance = THREE.MathUtils.clamp(this.orbitDistance, 4, 50);
            }
        }, { passive: true });
    }

    setupStartScreen() {
        this.startScreen = document.getElementById('startScreen');
        this.btnStartGame = document.getElementById('btnStartGame');
        this.optQualityLow = document.getElementById('optQualityLow');
        this.optQualityHigh = document.getElementById('optQualityHigh');

        if (this.optQualityLow && this.optQualityHigh) {
            this.optQualityLow.addEventListener('click', () => {
                const radio = this.optQualityLow.querySelector('input[type="radio"]');
                if (radio) radio.checked = true;
                this.optQualityLow.classList.add('active');
                this.optQualityHigh.classList.remove('active');
            });

            this.optQualityHigh.addEventListener('click', () => {
                const radio = this.optQualityHigh.querySelector('input[type="radio"]');
                if (radio) radio.checked = true;
                this.optQualityHigh.classList.add('active');
                this.optQualityLow.classList.remove('active');
            });
        }

        if (this.btnStartGame) {
            this.btnStartGame.addEventListener('click', () => {
                const selectedRadio = document.querySelector('input[name="graphicsQuality"]:checked');
                const qualityMode = selectedRadio ? selectedRadio.value : 'high';
                this.setQualityMode(qualityMode);

                if (this.startScreen) {
                    this.startScreen.classList.remove('visible');
                }
                this.startEngineAudio();
            });
        }
    }

    setQualityMode(mode) {
        this.graphicsQuality = mode;
        if (mode === 'low') {
            this.renderer.shadowMap.enabled = false;
            this.renderer.setPixelRatio(1.0);
            this.usePostProcessing = false;
            if (this.groundMaterial && this.lowResTerrainTexture) {
                this.groundMaterial.map = this.lowResTerrainTexture;
                this.groundMaterial.needsUpdate = true;
            }
        } else {
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.BasicShadowMap;
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            this.usePostProcessing = true;
            if (this.groundMaterial && this.highResTerrainTexture) {
                this.groundMaterial.map = this.highResTerrainTexture;
                this.groundMaterial.needsUpdate = true;
            }
        }
    }

    updateMinimap() {
        if (!this.minimapCanvas || !this.airplane) return;
        const ctx = this.minimapCanvas.getContext('2d');
        const w = this.minimapCanvas.width;
        const h = this.minimapCanvas.height;
        const cx = w / 2;
        const cy = h / 2;

        ctx.clearRect(0, 0, w, h);

        // 1. Fundo do Radar
        ctx.fillStyle = 'rgba(4, 8, 15, 0.92)';
        ctx.beginPath();
        ctx.arc(cx, cy, cx - 2, 0, Math.PI * 2);
        ctx.fill();

        // 2. Anéis de Alcance (1km e 2km) e Linhas de Grade
        ctx.strokeStyle = 'rgba(0, 242, 254, 0.2)';
        ctx.lineWidth = 1;

        ctx.beginPath();
        ctx.arc(cx, cy, (cx - 2) * 0.5, 0, Math.PI * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx, cy, cx - 2, 0, Math.PI * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx, 4);
        ctx.lineTo(cx, h - 4);
        ctx.moveTo(4, cy);
        ctx.lineTo(w - 4, cy);
        ctx.stroke();

        // Clipping circular para elementos internos
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, cx - 4, 0, Math.PI * 2);
        ctx.clip();

        const planePos = this.airplane.position;
        const theta = this.planeState ? (this.planeState.rotation || 0) : 0;
        const scale = (cx - 4) / 2000;

        const sinT = Math.sin(theta);
        const cosT = Math.cos(theta);

        // 3. Desenhar Pistas (Runways) orientadas em relação ao avião (Track-Up: FRENTE = TOPO DO MINIMAPA)
        if (this.runways && this.runways.length > 0) {
            for (let i = 0; i < this.runways.length; i++) {
                const r = this.runways[i];
                const vx = r.position.x - planePos.x;
                const vz = r.position.z - planePos.z;

                // Projeção nos eixos local do avião (Forward = FRENTE, Right = DIREITA)
                const forwardDist = vx * sinT + vz * cosT;
                const rightDist = -vx * cosT + vz * sinT;

                const rx = cx + rightDist * scale;
                const ry = cy - forwardDist * scale;

                ctx.save();
                ctx.translate(rx, ry);
                ctx.rotate((r.rotationY || 0) - theta);

                const rw = Math.max(4, (r.width || 8.5) * scale * 3);
                const rl = Math.max(12, (r.length || 140) * scale);

                if (i === 0) {
                    ctx.fillStyle = '#00ff87';
                    ctx.shadowColor = '#00ff87';
                    ctx.shadowBlur = 8;
                } else {
                    ctx.fillStyle = '#00f2fe';
                    ctx.shadowColor = '#00f2fe';
                    ctx.shadowBlur = 4;
                }

                ctx.fillRect(-rw / 2, -rl / 2, rw, rl);

                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1;
                ctx.strokeRect(-rw / 2, -rl / 2, rw, rl);
                ctx.restore();
            }
        }

        ctx.restore(); // Fim do clipping circular

        // 4. Bússola Dinâmica nos Anéis (N, S, L, O girando conforme a proa)
        const R = cx - 12;

        ctx.font = 'bold 10px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Norte (N) - Vermelho
        ctx.fillStyle = '#ff4b4b';
        ctx.fillText('N', cx - R * sinT, cy + R * cosT);

        // Sul (S), Leste (L), Oeste (O) - Ciano
        ctx.fillStyle = '#00f2fe';
        ctx.fillText('S', cx + R * sinT, cy - R * cosT);
        ctx.fillText('L', cx - R * cosT, cy - R * sinT);
        ctx.fillText('O', cx + R * cosT, cy + R * sinT);

        // 5. Ícone do Avião do Jogador no Centro (Sempre apontando para FRENTE / CIMA)
        ctx.save();
        ctx.translate(cx, cy);

        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#cedb0fff';
        ctx.lineWidth = 1.5;
        ctx.shadowColor = '#487575ff';
        ctx.shadowBlur = 10;

        ctx.beginPath();
        ctx.moveTo(0, -10); // Nariz apontado para cima (Frente)
        ctx.lineTo(7, 8);   // Asa Direita
        ctx.lineTo(0, 4);   // Centro Cauda
        ctx.lineTo(-7, 8);  // Asa Esquerda
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.restore();
    }

    toggleCameraMode() {
        if (this.cameraMode === 'thirdPerson') {
            this.cameraMode = 'front';
        } else if (this.cameraMode === 'front') {
            this.cameraMode = 'orbit';
            this.orbitYaw = Math.PI + (this.planeState ? this.planeState.rotation : 0);
            this.orbitPitch = 0.2;
        } else {
            this.cameraMode = 'thirdPerson';
        }
    }

    startReplay() {
        if (!this.flightHistory || this.flightHistory.length === 0) return;

        // Clonar os últimos 20s gravados no histórico de voo
        this.recordedReplayData = this.flightHistory.map(item => ({
            time: item.time,
            position: item.position.clone(),
            quaternion: item.quaternion.clone(),
            rotation: item.rotation,
            pitch: item.pitch,
            roll: item.roll,
            speed: item.speed,
            altitude: item.altitude,
            fuel: item.fuel,
            flapTarget: item.flapTarget,
            gearRetracted: item.gearRetracted
        }));

        if (this.recordedReplayData.length < 2) return;

        this.isReplaying = true;
        this.replayIndex = 0;
        this.replayPaused = false;
        this.replaySpeed = 2.0;

        // Ocultar modal de pouso se exibido
        if (this.landingModal) {
            this.landingModal.classList.remove('visible');
            this.landingModal.style.display = 'none';
        }

        // Exibir HUD de Replay
        const replayHUD = document.getElementById('replayHUD');
        if (replayHUD) {
            replayHUD.classList.add('visible');
        }

        const speedBtn = document.getElementById('btnReplaySpeed');
        if (speedBtn) speedBtn.textContent = '⚡ Vel: 2.0x';

        const pauseBtn = document.getElementById('btnReplayPlayPause');
        if (pauseBtn) pauseBtn.textContent = '⏸ Pausar';
    }

    stopReplay() {
        this.isReplaying = false;
        const replayHUD = document.getElementById('replayHUD');
        if (replayHUD) {
            replayHUD.classList.remove('visible');
        }

        // Retornar ao relatório de pouso se havíamos acabado de pousar
        if (this.touchdownData && this.landingModal) {
            this.landingModal.style.display = 'flex';
            setTimeout(() => this.landingModal.classList.add('visible'), 50);
        }
    }

    toggleReplayPause() {
        this.replayPaused = !this.replayPaused;
        const pauseBtn = document.getElementById('btnReplayPlayPause');
        if (pauseBtn) {
            pauseBtn.textContent = this.replayPaused ? '▶ Reproduzir' : '⏸ Pausar';
        }
    }

    cycleReplaySpeed() {
        if (this.replaySpeed === 2.0) {
            this.replaySpeed = 1.0; // Normal
        } else if (this.replaySpeed === 1.0) {
            this.replaySpeed = 0.5; // Câmera Lenta
        } else {
            this.replaySpeed = 2.0; // Acelerado (Primeira opção)
        }

        const speedBtn = document.getElementById('btnReplaySpeed');
        if (speedBtn) {
            speedBtn.textContent = `⚡ Vel: ${this.replaySpeed.toFixed(1)}x`;
        }
    }

    updatePlaneStateFromKeys(keyStates) {
        this.planeState.isTurningLeft = keyStates.ArrowLeft || keyStates.a;
        this.planeState.isTurningRight = keyStates.ArrowRight || keyStates.d;
        this.planeState.isPitchingUp = keyStates.ArrowDown || keyStates.s;
        this.planeState.isPitchingDown = keyStates.ArrowUp || keyStates.w;

        const maxSpeed = 20;
        const minSpeed = 0;
        const speedChangeAmount = 0.05;

        if (keyStates.x) {
            this.planeState.speed = Math.min(this.planeState.speed + speedChangeAmount, maxSpeed);
        }
        if (keyStates[' ']) {
            this.planeState.speed = Math.max(this.planeState.speed - speedChangeAmount, minSpeed);
        }
    }

    setupEngineAudio() {
        this.audioCtx = null;
        this.engineAudioStarted = false;
    }

    initWebAudioJetEngine() {
        if (this.audioCtx) return;
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;

        this.audioCtx = new AudioContextClass();

        // 1. Gerar 3 segundos de Ruído de Jato Puro (Brown Noise)
        const bufferSize = this.audioCtx.sampleRate * 3;
        const noiseBuffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        let lastOut = 0.0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            lastOut = (lastOut + (0.02 * white)) / 1.02;
            output[i] = lastOut * 3.0;
        }

        // Fonte de áudio em loop
        this.noiseSource = this.audioCtx.createBufferSource();
        this.noiseSource.buffer = noiseBuffer;
        this.noiseSource.loop = true;

        // 2. Filtro Lowpass Suave (Apenas som grave/médio de ruído de jato, sem apitos agudos)
        this.jetLowpassFilter = this.audioCtx.createBiquadFilter();
        this.jetLowpassFilter.type = 'lowpass';
        this.jetLowpassFilter.frequency.setValueAtTime(220, this.audioCtx.currentTime);
        this.jetLowpassFilter.Q.setValueAtTime(0.7, this.audioCtx.currentTime);

        // 3. Node de Ganho Geral
        this.jetGainNode = this.audioCtx.createGain();
        this.jetGainNode.gain.setValueAtTime(0.12, this.audioCtx.currentTime);

        // Conexão direta: noiseSource -> jetLowpassFilter -> jetGainNode -> destination
        this.noiseSource.connect(this.jetLowpassFilter);
        this.jetLowpassFilter.connect(this.jetGainNode);
        this.jetGainNode.connect(this.audioCtx.destination);
    }

    startEngineAudio() {
        if (this.engineAudioStarted) return;
        try {
            if (!this.audioCtx) {
                this.initWebAudioJetEngine();
            }
            if (this.audioCtx && this.audioCtx.state === 'suspended') {
                this.audioCtx.resume();
            }
            if (this.noiseSource && !this.noiseSourceStarted) {
                this.noiseSource.start(0);
                this.noiseSourceStarted = true;
            }
            this.engineAudioStarted = true;
            this.updateEngineAudio();
        } catch (e) {
            console.warn("Erro ao iniciar áudio do motor a jato:", e);
        }
    }

    updateEngineAudio() {
        if (!this.engineAudioStarted || !this.audioCtx || !this.planeState) return;

        const speedRatio = THREE.MathUtils.clamp((this.planeState.speed - 0) / (20 - 0), 0, 1);
        const now = this.audioCtx.currentTime;

        // Frequência do ruído de jato: 220Hz em idle -> 1200Hz na aceleração máxima (somente ruído aveludado e potente)
        const lowpassFreq = THREE.MathUtils.lerp(220, 1200, Math.pow(speedRatio, 0.9));

        // Volume proporcional
        const mainGain = THREE.MathUtils.lerp(0.12, 0.35, speedRatio);

        // Atualização suave
        if (this.jetLowpassFilter) this.jetLowpassFilter.frequency.setTargetAtTime(lowpassFreq, now, 0.05);
        if (this.jetGainNode) this.jetGainNode.gain.setTargetAtTime(mainGain, now, 0.05);
    }

    stopEngineAudio() {
        if (!this.engineAudioStarted || !this.audioCtx) return;
        try {
            if (this.jetGainNode) {
                this.jetGainNode.gain.setTargetAtTime(0, this.audioCtx.currentTime, 0.1);
            }
            if (this.audioCtx && this.audioCtx.state === 'running') {
                this.audioCtx.suspend();
            }
        } catch (e) {
            console.warn("Erro ao parar áudio:", e);
        }
        this.engineAudioStarted = false;
    }

    preloadGpwsVoice() {
        if (!('speechSynthesis' in window)) return;
        const voices = window.speechSynthesis.getVoices();
        if (!voices || voices.length === 0) return;

        console.log("Vozes disponíveis no sistema:", voices.map(v => `${v.name} (${v.lang})`));

        // Nomes de vozes MASCULINAS conhecidas em navegadores (Windows, Mac, Chrome, Edge)
        const maleKeywords = ['david', 'mark', 'alex', 'fred', 'daniel', 'george', 'guy', 'oliver', 'richard', 'uk english male', 'male'];

        // Nomes de vozes FEMININAS a ignorar obrigatoriamente
        const femaleKeywords = ['zira', 'hazel', 'susan', 'catherine', 'heather', 'linda', 'samantha', 'victoria', 'karen', 'female', 'google us english'];

        // 1. Buscar voz MASCULINA em inglês
        this.gpwsVoice = voices.find(v => {
            const name = v.name.toLowerCase();
            const isEnglish = v.lang.startsWith('en');
            const isMale = maleKeywords.some(kw => name.includes(kw));
            const isFemale = femaleKeywords.some(kw => name.includes(kw));
            return isEnglish && isMale && !isFemale;
        });

        // 2. Fallback: Qualquer voz em inglês que NÃO seja reconhecidamente feminina
        if (!this.gpwsVoice) {
            this.gpwsVoice = voices.find(v => {
                const name = v.name.toLowerCase();
                const isEnglish = v.lang.startsWith('en');
                const isFemale = femaleKeywords.some(kw => name.includes(kw));
                return isEnglish && !isFemale;
            });
        }

        if (this.gpwsVoice) {
            console.log("Voz MASCULINA GPWS Selecionada com Sucesso:", this.gpwsVoice.name);
        }
    }

    speakCallout(text) {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();

            // Re-garantir que a voz robótica foi carregada se a lista de vozes mudou
            if (!this.gpwsVoice) {
                this.preloadGpwsVoice();
            }

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'en-US';
            utterance.rate = 1.0;
            utterance.pitch = 0.85; // Tom sintetizado de computador de bordo
            utterance.volume = 1.0;

            if (this.gpwsVoice) {
                utterance.voice = this.gpwsVoice;
            }

            window.speechSynthesis.speak(utterance);
        }
    }

    checkAltitudeCallouts(distanceToGround) {
        const hudAlt = distanceToGround * 5;
        const callouts = [50, 40, 30, 20, 10];

        // Só dispara chamadas sonoras de altitude GPWS se o avião estiver DESCENDO em aproximação de pouso (sink rate > 0.3 m/s)
        const isDescending = this.currentVerticalSpeed > 0.3;

        if (this.wasInAir && !this._isOnGround && isDescending) {
            for (let target of callouts) {
                if (hudAlt <= target && !this.spokenCallouts[target]) {
                    this.spokenCallouts[target] = true;
                    this.speakCallout(target.toString());
                    break;
                }
            }
        }

        if (hudAlt > 60) {
            for (let target of callouts) {
                this.spokenCallouts[target] = false;
            }
        }
    }

    playExplosionSound() {
        const audio = new Audio('./explosion boa.mp3');
        audio.volume = 0.6;
        audio.play().catch(() => { });
    }

    startCameraShake(intensity = 0.1, frames = 20) {
        this.cameraShake.intensity = intensity;
        this.cameraShake.frames = frames;
        this.cameraShake.totalFrames = frames;
    }

    checkLanding() {
        if (!this.airplane || !this.ground || !this.runways) return;

        const planePos = this.airplane.position;
        let onRunway = false;

        for (let r of this.runways) {
            if (this.isPosOnRunway(planePos, r)) {
                onRunway = true;
                break;
            }
        }

        const altitude = this.planeState.altitude;
        const currentSpeedKmh = Math.round(this.planeState.speed * 30);

        if (onRunway && altitude < 1.0) {
            // Recuperar combustível e integridade gradualmente
            if (this.planeState.fuel < 100) {
                this.planeState.fuel = Math.min(100, this.planeState.fuel + 0.5);
            }
            if (this.playerHealth < 100) {
                this.playerHealth = Math.min(100, this.playerHealth + 0.3);
                this.updateHealthBar();
            }

            // Exibir mensagem de pouso seguro se desacelerar
            if (this.planeState.speed < 2 && !this.landingReportDisplayed) {
                this.landingMessage.style.display = 'block';
                this.landingMessage.textContent = 'Pouso Seguro - Reabastecendo e Reparando';
            } else {
                this.landingMessage.style.display = 'none';
            }

            // Exibir relatório de voo 1 seg após atingir 0.0km/h (velocidade 0)
            if (this.touchdownData && !this.landingReportDisplayed) {
                if (currentSpeedKmh <= 0 || this.planeState.speed <= 0.01) {
                    if (!this.landingTimer) {
                        this.landingTimer = setTimeout(() => {
                            this.showLandingModal();
                            this.landingTimer = null;
                        }, 1000);
                    }
                } else {
                    if (this.landingTimer) {
                        clearTimeout(this.landingTimer);
                        this.landingTimer = null;
                    }
                }
            }
        } else {
            this.landingMessage.style.display = 'none';
            if (this.landingTimer) {
                clearTimeout(this.landingTimer);
                this.landingTimer = null;
            }
        }
    }

    showLandingModal() {
        if (!this.touchdownData || this.landingReportDisplayed) return;

        this.landingReportDisplayed = true;
        this.stopEngineAudio();

        const { deviation, verticalSpeed } = this.touchdownData;

        // 1. Cálculo do Score de Alinhamento / Centralidade (Largura máxima antes da borda é 3.5m)
        const centralityScore = Math.max(0, 100 - (deviation / 3.5) * 100);
        let centralityRating = "Perfeita (No Centro)";
        if (deviation > 2.5) {
            centralityRating = "Descentralizada (Perto da Borda)";
        } else if (deviation > 1.5) {
            centralityRating = "Aceitável";
        } else if (deviation > 0.5) {
            centralityRating = "Boa (Perto do Centro)";
        }

        // 2. Cálculo do Score de Suavidade do Toque (Velocidade Vertical)
        let forceScore = 100;
        let forceRating = "Manteiga (Extremamente Suave)";
        if (verticalSpeed > 0.5) {
            forceScore = Math.max(0, 100 - (verticalSpeed - 0.5) * 25);
            if (verticalSpeed > 3.0) {
                forceRating = "Duro (Impacto Forte)";
            } else if (verticalSpeed > 1.5) {
                forceRating = "Firme";
            } else {
                forceRating = "Suave";
            }
        }

        // Pontuação Total baseada em Suavidade e Alinhamento (máx 1000)
        const totalScore = Math.round((centralityScore + forceScore) / 2 * 10);

        // Determinar Nota e Cor
        let grade = "F";
        let gradeClass = "red";
        if (totalScore >= 950) {
            grade = "A+";
            gradeClass = "emerald";
        } else if (totalScore >= 900) {
            grade = "A";
            gradeClass = "cyan";
        } else if (totalScore >= 800) {
            grade = "B";
            gradeClass = "gold";
        } else if (totalScore >= 700) {
            grade = "C";
            gradeClass = "orange";
        } else if (totalScore >= 500) {
            grade = "D";
            gradeClass = "red";
        } else {
            grade = "F";
            gradeClass = "red";
        }

        // Atualizar DOM do Modal
        if (this.landingGrade) {
            this.landingGrade.textContent = grade;
            this.landingGrade.className = "rating-badge " + gradeClass;
        }
        if (this.landingTotalScore) {
            this.landingTotalScore.textContent = `Pontuação: ${totalScore} / 1000`;
        }

        if (this.centralityValue) this.centralityValue.textContent = `${deviation.toFixed(2)}m`;
        if (this.centralityScoreBar) this.centralityScoreBar.style.width = `0%`;
        if (this.centralityDesc) this.centralityDesc.textContent = `${centralityRating} (${Math.round(centralityScore)}/100)`;

        if (this.forceValue) this.forceValue.textContent = `${verticalSpeed.toFixed(2)} m/s`;
        if (this.forceScoreBar) this.forceScoreBar.style.width = `0%`;
        if (this.forceDesc) this.forceDesc.textContent = `${forceRating} (${Math.round(forceScore)}/100)`;

        // Exibir o modal
        if (this.landingModal) {
            this.landingModal.style.display = 'flex';
            // Pequeno delay para a animação do CSS e preenchimento das barras
            setTimeout(() => {
                this.landingModal.classList.add('visible');

                // Animar barras de progresso
                setTimeout(() => {
                    if (this.centralityScoreBar) this.centralityScoreBar.style.width = `${centralityScore}%`;
                    if (this.forceScoreBar) this.forceScoreBar.style.width = `${forceScore}%`;
                }, 150);
            }, 50);
        }
    }

    continueFlight() {
        if (this.landingTimer) {
            clearTimeout(this.landingTimer);
            this.landingTimer = null;
        }
        this.landingReportDisplayed = false;
        this.touchdownData = null;
        this.wasInAir = false; // Permite re-armar quando subir acima de 4m de altitude

        if (this.landingModal) {
            this.landingModal.classList.remove('visible');
            setTimeout(() => {
                this.landingModal.style.display = 'none';
            }, 500);
        }

        // Reiniciar áudio do motor ao continuar o voo
        if (this.planeState.fuel > 0) {
            this.startEngineAudio();
        }
    }

    createExplosion(pos, scale = 1) {
        const explosionGroup = new THREE.Group();
        explosionGroup.position.copy(pos);
        this.scene.add(explosionGroup);

        const particleCount = 10;
        const particles = [];

        for (let i = 0; i < particleCount; i++) {
            const size = (0.3 + Math.random() * 0.4) * scale;
            const geom = new THREE.SphereGeometry(size, 8, 8);
            const color = new THREE.Color().setHSL(0.02 + Math.random() * 0.08, 1, 0.5);
            const mat = new THREE.MeshBasicMaterial({
                color: color,
                transparent: true,
                opacity: 0.9
            });
            const mesh = new THREE.Mesh(geom, mat);

            mesh.position.set(
                (Math.random() - 0.5) * scale * 0.8,
                (Math.random() - 0.5) * scale * 0.8,
                (Math.random() - 0.5) * scale * 0.8
            );

            explosionGroup.add(mesh);
            particles.push({
                mesh: mesh,
                velocity: mesh.position.clone().normalize().multiplyScalar(0.08 * scale),
                grow: 1.02 + Math.random() * 0.04
            });
        }

        let frames = 0;
        const maxFrames = 50;

        const animateExplosion = () => {
            frames++;
            const life = 1 - (frames / maxFrames);

            particles.forEach((p) => {
                p.mesh.position.add(p.velocity);
                p.mesh.scale.multiplyScalar(p.grow);
                p.mesh.material.opacity = life;
            });

            if (frames < maxFrames) {
                requestAnimationFrame(animateExplosion);
            } else {
                this.scene.remove(explosionGroup);
                particles.forEach((p) => {
                    p.mesh.geometry.dispose();
                    p.mesh.material.dispose();
                });
            }
        };

        animateExplosion();
    }

    createSmokeParticle(pos) {
        const geom = new THREE.SphereGeometry(0.12 + Math.random() * 0.12, 5, 5);
        const mat = new THREE.MeshBasicMaterial({
            color: 0x555555,
            transparent: true,
            opacity: 0.6
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.copy(pos).add(new THREE.Vector3(
            (Math.random() - 0.5) * 0.15,
            (Math.random() - 0.5) * 0.15,
            (Math.random() - 0.5) * 0.15
        ));
        this.scene.add(mesh);
        this.smokeParticles.push({
            mesh: mesh,
            velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 0.015,
                0.01 + Math.random() * 0.02,
                (Math.random() - 0.5) * 0.015
            ),
            grow: 1.01 + Math.random() * 0.02
        });
    }

    createTouchdownSmoke() {
        if (!this.airplane) return;

        // Posições locais das rodas do avião
        const wheelOffsets = [
            new THREE.Vector3(-1.5, -0.82, -0.1), // Pneu traseiro esquerdo
            new THREE.Vector3(1.5, -0.82, -0.1),  // Pneu traseiro direito
            new THREE.Vector3(0, -0.82, 1.4)      // Pneu dianteiro
        ];

        this.airplane.updateMatrixWorld(true);

        wheelOffsets.forEach((offset) => {
            const worldPos = offset.clone().applyMatrix4(this.airplane.matrixWorld);

            // Baforada/fumaçinha rápida nos pneus (6 partículas por roda)
            for (let i = 0; i < 6; i++) {
                const radius = 0.10 + Math.random() * 0.10;
                const geom = new THREE.SphereGeometry(radius, 5, 5);
                const mat = new THREE.MeshBasicMaterial({
                    color: '#88898a',
                    transparent: true,
                    opacity: 0.5
                });
                const mesh = new THREE.Mesh(geom, mat);

                mesh.position.copy(worldPos).add(new THREE.Vector3(
                    (Math.random() - 0.5) * 0.25,
                    Math.random() * 0.08,
                    (Math.random() - 0.5) * 0.25
                ));

                this.scene.add(mesh);

                this.smokeParticles.push({
                    mesh: mesh,
                    velocity: new THREE.Vector3(
                        (Math.random() - 0.5) * 0.04,
                        0.02 + Math.random() * 0.03,
                        (Math.random() - 0.5) * 0.04
                    ),
                    grow: 1.04 + Math.random() * 0.02,
                    fadeSpeed: 0.05 + Math.random() * 0.02 // Dissipa rapidamente (~0.25s - 0.3s)
                });
            }
        });
    }

    handleCrash(message) {
        if (this.gameOver) return;
        this.gameOver = true;

        // Criar grande explosão
        this.createExplosion(this.airplane.position.clone(), 3.0);
        this.playExplosionSound();
        this.stopEngineAudio();

        // Esconder o avião
        this.airplane.visible = false;

        // Mostrar tela de fim de jogo
        if (this.gameOverScreen) {
            this.gameOverTitle.textContent = "SIMULAÇÃO ENCERRADA";
            this.gameOverMessage.textContent = message;
            this.gameOverScreen.style.display = 'flex';
            setTimeout(() => {
                this.gameOverScreen.classList.add('visible');
            }, 100);
        }
    }

    animate() {
        if (this.gameOver) {
            this.composer.render();
            return;
        }

        if (this.isReplaying) {
            if (!this.replayPaused && this.recordedReplayData.length > 1) {
                this.replayIndex += this.replaySpeed * 0.4;

                if (this.replayIndex >= this.recordedReplayData.length - 1) {
                    this.replayIndex = 0; // Loop automático do replay
                }
            }

            const idx = Math.floor(this.replayIndex);
            const nextIdx = Math.min(idx + 1, this.recordedReplayData.length - 1);
            const alpha = this.replayIndex - idx;

            const frameA = this.recordedReplayData[idx];
            const frameB = this.recordedReplayData[nextIdx];

            if (frameA && frameB) {
                // Interpolação suave de posição e rotação
                this.airplane.position.lerpVectors(frameA.position, frameB.position, alpha);
                this.airplane.quaternion.slerpQuaternions(frameA.quaternion, frameB.quaternion, alpha);

                // Atualizar estado das superfícies móveis de controle
                if (this.airplane.userData && typeof this.airplane.userData.updateControlSurfaces === 'function') {
                    this.airplane.userData.updateControlSurfaces({
                        rotation: THREE.MathUtils.lerp(frameA.rotation, frameB.rotation, alpha),
                        pitch: THREE.MathUtils.lerp(frameA.pitch, frameB.pitch, alpha),
                        roll: THREE.MathUtils.lerp(frameA.roll, frameB.roll, alpha),
                        flapAngle: frameA.flapTarget || 0,
                        gearRetracted: frameA.gearRetracted !== undefined ? frameA.gearRetracted : true
                    });
                }

                // Atualizar estado de voo temporário para exibir no HUD
                this.planeState.speed = THREE.MathUtils.lerp(frameA.speed, frameB.speed, alpha);
                this.planeState.altitude = THREE.MathUtils.lerp(frameA.altitude, frameB.altitude, alpha);
                this.planeState.fuel = frameA.fuel;
                this.planeState.rotation = THREE.MathUtils.lerp(frameA.rotation, frameB.rotation, alpha);

                // Progresso no Replay HUD
                const progressBar = document.getElementById('replayProgressBar');
                if (progressBar) {
                    const progress = (this.replayIndex / (this.recordedReplayData.length - 1)) * 100;
                    progressBar.style.width = `${progress}%`;
                }
            }

            // Suporte completo a troca de câmeras (V) durante o Replay (incluindo órbita 360° no mouse)
            if (this.cameraMode === 'thirdPerson') {
                if (this.airplane) this.airplane.visible = true;
                const targetCameraPosition = this.airplane.position.clone().add(this.cameraOffset.clone().applyQuaternion(this.airplane.quaternion));
                this.camera.position.lerp(targetCameraPosition, 0.15);
                this.camera.lookAt(this.airplane.position);
            } else if (this.cameraMode === 'front') {
                if (this.airplane) this.airplane.visible = false;
                const frontOffset = new THREE.Vector3(0, 0.4, 0.2);
                const targetCameraPosition = frontOffset.clone().applyQuaternion(this.airplane.quaternion).add(this.airplane.position);
                this.camera.position.copy(targetCameraPosition);
                const targetRotation = this.airplane.quaternion.clone().multiply(
                    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)
                );
                this.camera.quaternion.copy(targetRotation);
            } else if (this.cameraMode === 'orbit') {
                if (this.airplane) this.airplane.visible = true;
                const x = this.orbitDistance * Math.cos(this.orbitPitch) * Math.sin(this.orbitYaw);
                const y = this.orbitDistance * Math.sin(this.orbitPitch);
                const z = this.orbitDistance * Math.cos(this.orbitPitch) * Math.cos(this.orbitYaw);
                const targetCameraPosition = this.airplane.position.clone().add(new THREE.Vector3(x, y, z));
                this.camera.position.copy(targetCameraPosition);
                this.camera.lookAt(this.airplane.position);
            }

            this.updateHUD();
            this.composer.render();
            requestAnimationFrame(() => this.animate());
            return;
        }

        if (this.landingReportDisplayed) {
            this.composer.render();
            requestAnimationFrame(() => this.animate());
            return;
        }

        // Gravar histórico contínuo de voo para Replay (últimos 20 segundos)
        const nowHistory = performance.now();
        this.flightHistory.push({
            time: nowHistory,
            position: this.airplane.position.clone(),
            quaternion: this.airplane.quaternion.clone(),
            rotation: this.planeState.rotation,
            pitch: this.planeState.pitch,
            roll: this.planeState.roll,
            speed: this.planeState.speed,
            altitude: this.planeState.altitude,
            fuel: this.planeState.fuel,
            flapTarget: this.planeState.flapTarget,
            gearRetracted: this.planeState.gearRetracted
        });

        const cutoffHistory = nowHistory - (this.maxHistoryDuration * 1000);
        while (this.flightHistory.length > 0 && this.flightHistory[0].time < cutoffHistory) {
            this.flightHistory.shift();
        }

        // Atualizar áudio do motor
        this.updateEngineAudio();

        // Atualizar fumaça
        for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
            const p = this.smokeParticles[i];
            p.mesh.position.add(p.velocity);
            p.mesh.scale.multiplyScalar(p.grow);
            p.mesh.material.opacity -= (p.fadeSpeed || 0.02);
            if (p.mesh.material.opacity <= 0) {
                this.scene.remove(p.mesh);
                p.mesh.geometry.dispose();
                p.mesh.material.dispose();
                this.smokeParticles.splice(i, 1);
            }
        }

        // Criar fumaça se a integridade estiver baixa
        if (this.playerHealth < 50 && Math.random() < 0.25) {
            this.createSmokeParticle(this.airplane.position);
        }

        // Verificar pouso e estado na pista
        this.checkLanding();

        // Atualizar matriz de transformação do avião
        this.airplane.updateMatrixWorld(true);
        const playerBoundingBox = new THREE.Box3().setFromObject(this.airplane);
        playerBoundingBox.expandByScalar(0.08);

        // --- Detecção de Colisões ---

        // 1. Colisão com Edifícios da Cidade
        let cityBuildingHit = this.cityManager.checkPlaneCollision(playerBoundingBox);
        let activeManager = this.cityManager;
        if (!cityBuildingHit) {
            cityBuildingHit = this.city2Manager.checkPlaneCollision(playerBoundingBox);
            activeManager = this.city2Manager;
        }

        if (cityBuildingHit) {
            this.playerHealth -= 40;
            this.updateHealthBar();
            console.log(`Colisão com edifício: ${cityBuildingHit.type}`);

            // Explosão menor no prédio e sua destruição
            this.createExplosion(this.airplane.position.clone(), 1.5);
            this.playExplosionSound();
            activeManager.destroyBuilding(cityBuildingHit);

            this.startCameraShake(0.35, 24);

            if (this.playerHealth <= 0) {
                this.handleCrash("Você colidiu contra um edifício da cidade!");
                return;
            }
        }

        // 2. Altitude em relação ao solo usando Raycasting
        const raycaster = new THREE.Raycaster();
        const down = new THREE.Vector3(0, -1, 0);
        raycaster.set(this.airplane.position, down);

        const runwayMeshes = (this.runways || []).map(r => r.mesh);
        const intersects = raycaster.intersectObjects([this.ground, ...runwayMeshes], true);
        let groundAltitude = 0;

        if (intersects.length > 0) {
            const actualGroundY = intersects[0].point.y;
            const distanceToGround = intersects[0].distance;
            this.planeState.altitude = this.airplane.position.y;

            // Calcular velocidade vertical baseada na alteração de altitude
            const now = performance.now();
            const dt = (now - this.lastTime) / 1000;
            this.lastTime = now;
            if (dt > 0) {
                const diff = this.lastAltitude - distanceToGround;
                // Ignorar ruídos extremos ou reinicializações
                if (Math.abs(diff) < 20) {
                    const vs = diff / dt;
                    // Filtro passa-baixa para suavizar o sink rate
                    this.currentVerticalSpeed = THREE.MathUtils.lerp(this.currentVerticalSpeed, vs, 0.2);
                }
            }
            this.lastAltitude = distanceToGround;

            // Resetar o estado no ar se subiu acima de 4 metros
            if (distanceToGround > 4.0) {
                this.wasInAir = true;
            }

            // Avisos de altitude sonoros (GPWS callouts: 50, 40, 30, 20, 10)
            this.checkAltitudeCallouts(distanceToGround);

            // Flag de estar muito perto ou no chão
            let onRunway = false;
            let activeRunway = null;
            const planePos = this.airplane.position;

            for (let r of (this.runways || [])) {
                if (this.isPosOnRunway(planePos, r)) {
                    onRunway = true;
                    activeRunway = r;
                    break;
                }
            }

            const WHEEL_HEIGHT_OFFSET = 0.36; // Altura exata da base dos pneus ao centro do avião (escala 0.25)
            const groundTouchThreshold = 0.38; // Limiar de tolerância para contato das rodas

            // Detectar Pouso Sem Trem de Pouso (Explosão)
            if (distanceToGround <= groundTouchThreshold && !this.planeState.gearRetracted) {
                this.handleCrash("pouso sem trem de pouso");
                return;
            }

            // Detectar o Toque no Solo (Touchdown)
            if (distanceToGround <= groundTouchThreshold && onRunway && this.wasInAir) {
                this.wasInAir = false;
                const targetRunwayX = activeRunway ? activeRunway.position.x : planePos.x;
                const deviation = Math.abs(planePos.x - targetRunwayX);
                const vsAtTouchdown = Math.max(0, this.currentVerticalSpeed);
                this.touchdownData = {
                    speedKmh: this.planeState.speed * 30,
                    deviation: deviation,
                    verticalSpeed: vsAtTouchdown
                };

                // Tremor de câmera proporcional ao impacto do pouso
                let shakeIntensity = 0.01 + (vsAtTouchdown / 25) * 0.01;
                shakeIntensity = Math.min(0.1, Math.max(0.01, shakeIntensity));

                let shakeFrames = Math.round(10 + (vsAtTouchdown / 25) * 1); // ~0.3s a 0.6s de tremor
                shakeFrames = Math.min(36, Math.max(10, shakeFrames));

                this.startCameraShake(shakeIntensity, shakeFrames);

                // Fumaçinha rápida saindo dos pneus no momento do toque no solo
                this.createTouchdownSmoke();
            }

            const minHeight = actualGroundY + WHEEL_HEIGHT_OFFSET;

            if (distanceToGround <= groundTouchThreshold) {
                // Impede o avião de afundar no solo em qualquer situação de pouso/frenagem
                if (this.airplane.position.y < minHeight) {
                    this.airplane.position.y = minHeight;
                }

                // Se não estiver na pista de pouso e encostar no solo
                if (!onRunway) {
                    if (distanceToGround <= 0.27) {
                        // Causa dano proporcional à velocidade fora da pista
                        if (this.planeState.speed > 3) {
                            const damage = this.planeState.speed * 4;
                            this.playerHealth -= damage;
                            this.updateHealthBar();
                            this.createExplosion(this.airplane.position.clone(), 0.5);
                        }
                        this.planeState.speed = Math.max(0, this.planeState.speed - 0.07); // Freia

                        if (this.playerHealth <= 0) {
                            this.handleCrash("Você colidiu contra o terreno irregular!");
                            return;
                        }
                    }
                }
            }

            this._isOnGround = (distanceToGround <= groundTouchThreshold);
            this._currentMinHeight = minHeight;
            this._onGroundOnRunway = (this._isOnGround && onRunway && this.planeState.speed < 1);
        } else {
            this.planeState.altitude = this.airplane.position.y;
            this._currentMinHeight = -1000;
            this._onGroundOnRunway = false;
            this.lastAltitude = this.airplane.position.y;
            this.lastTime = performance.now();
        }

        // --- Atualizar Piloto Automático (se ativado) ---
        if (this.autopilot) {
            this.autopilot.update(this.planeState, this._isOnGround);
        }

        // --- Atualizar Yaw, Pitch e Roll baseando-se nos controles ---
        const turnSpeed = 0.005;
        const pitchSpeed = 0.003;
        const maxPitch = 0.9;
        const maxRoll = 0.65;
        const rollLerpFactor = 0.05;

        let speedKmh = this.planeState.speed * 30;
        let targetRoll = 0;

        if (this.planeState.isTurningLeft) {
            this.planeState.rotation += turnSpeed;
            targetRoll = -maxRoll;
        } else if (this.planeState.isTurningRight) {
            this.planeState.rotation -= turnSpeed;
            targetRoll = +maxRoll;
        }

        if (this._isOnGround) {
            // No solo, nivelar suavemente o roll sem solavanco ou puxões
            const levelFactor = 0.03;
            this.planeState.roll = THREE.MathUtils.lerp(this.planeState.roll, 0, levelFactor);

            // Ao tentar subir o nariz (cabrar) para decolar ou no pouso, dar resposta direta
            if (this.planeState.isPitchingUp) {
                const takeoffPitchSpeed = 0.015; // Resposta mais rápida para rotacionar o bico no chão
                this.planeState.pitch = Math.min(this.planeState.pitch + takeoffPitchSpeed, maxPitch);
            } else if (this.planeState.isPitchingDown) {
                this.planeState.pitch = Math.max(this.planeState.pitch - pitchSpeed, 0);
            } else {
                // Mantém controle de atitude suave, nivelando muito delicadamente apenas em velocidades muito baixas
                if (speedKmh < 60) {
                    this.planeState.pitch = THREE.MathUtils.lerp(this.planeState.pitch, 0, 0.02);
                }
            }
        } else {
            this.planeState.roll = THREE.MathUtils.lerp(this.planeState.roll, targetRoll, rollLerpFactor);

            if (this.planeState.isPitchingUp) {
                this.planeState.pitch = Math.min(this.planeState.pitch + pitchSpeed, maxPitch);
            } else if (this.planeState.isPitchingDown) {
                this.planeState.pitch = Math.max(this.planeState.pitch - pitchSpeed, -maxPitch);
            }
        }

        // Consumo de Combustível
        if (this.planeState.fuel > 0 && this.planeState.speed > 0) {
            this.planeState.fuel -= 0.015 * (this.planeState.speed / 100);
            this.planeState.fuel = Math.max(this.planeState.fuel, 0);
        } else if (this.planeState.fuel <= 0) {
            // Combustível esgotado: inicia descida e perde aceleração
            const gravity = 0.03;
            this.planeState.pitch = Math.max(this.planeState.pitch - 0.003, -0.4);
            if (!this._onGroundOnRunway) {
                this.airplane.position.y -= gravity;
            }
            this.planeState.speed = Math.max(0, this.planeState.speed - 0.03);
        }

        // --- Efeito dos Flaps na Velocidade (Redução Gradual e Suave) ---
        const flapLevel = Math.round((this.planeState.flapTarget || 0) * 2); // 0 (Fechado), 1 (Fase 1), 2 (Fase 2)
        if (this._currentFlapSpeedMult === undefined) this._currentFlapSpeedMult = 1.0;

        // Desejamos 5% de redução de velocidade por fase de flap
        const targetFlapSpeedMult = 1.0 - (0.05 * flapLevel);

        if (Math.abs(this._currentFlapSpeedMult - targetFlapSpeedMult) > 0.0001) {
            const oldMult = this._currentFlapSpeedMult;
            // Transição gradual a cada frame (suave ao longo de ~1 a 2 segundos)
            this._currentFlapSpeedMult = THREE.MathUtils.lerp(this._currentFlapSpeedMult, targetFlapSpeedMult, 0.025);
            const stepRatio = this._currentFlapSpeedMult / oldMult;
            this.planeState.speed *= stepRatio;
        }

        speedKmh = this.planeState.speed * 30;

        // --- VELOCIDADES REAIS DE JATO BIMOTOR (em km/h) ---
        // Stall sem flaps: 200 km/h. Com flaps completos (flapLevel 2): 185 km/h.
        const stallSpeedClean = 230;
        const stallSpeedFullFlaps = 210;
        const currentStallSpeed = THREE.MathUtils.lerp(stallSpeedClean, stallSpeedFullFlaps, (this.planeState.flapTarget || 0));

        // Eficiência de Sustentação Aerodinâmica
        const liftEfficiency = THREE.MathUtils.clamp(speedKmh / currentStallSpeed, 0, 1);

        // --- Stall (Perda de sustentação por gravidade se voando abaixo da velocidade de stall) ---
        if (speedKmh < currentStallSpeed && !this._isOnGround) {
            const stallSeverity = (currentStallSpeed - speedKmh) / currentStallSpeed;
            const stallGravity = 0.18 * stallSeverity;
            this.airplane.position.y -= stallGravity;
        }

        // --- Inclinação Visual (Ângulo de Ataque - AoA) por Baixa Velocidade ---
        let targetAoA = 0;
        if (!this._isOnGround && speedKmh < currentStallSpeed) {
            const stallSeverity = (currentStallSpeed - speedKmh) / currentStallSpeed;
            targetAoA = 0.70 * stallSeverity; // Até ~12.5 graus de inclinação de nariz para cima
        }

        if (this._isOnGround) {
            this.planeState.visualAoA = 0;
        } else {
            this.planeState.visualAoA = THREE.MathUtils.lerp(this.planeState.visualAoA || 0, targetAoA, 0.08);
        }

        // Aplicar rotações ao objeto
        this.airplane.rotation.order = 'YXZ';
        this.airplane.rotation.y = this.planeState.rotation;
        this.airplane.rotation.x = -(this.planeState.pitch + this.planeState.visualAoA);
        this.airplane.rotation.z = this.planeState.roll;

        // Atualizar superfícies móveis de controle (Flaps, Ailerons, Profundor e Leme)
        if (this.airplane.userData && typeof this.airplane.userData.updateControlSurfaces === 'function') {
            this.airplane.userData.updateControlSurfaces(this.planeState);
        }

        // Calcular vetor de movimento (usando apenas a rotação física, sem a inclinação visual do AoA)
        const physicalEuler = new THREE.Euler(-this.planeState.pitch, this.planeState.rotation, this.planeState.roll, 'YXZ');
        const moveDirection = new THREE.Vector3(0, 0, 1).applyEuler(physicalEuler);

        // Sustentação vertical calculada com base na eficiência aerodinâmica
        if (moveDirection.y > 0) {
            moveDirection.y *= liftEfficiency;
        }

        const moveVector = moveDirection.multiplyScalar(this.planeState.speed * 0.02);
        this.airplane.position.add(moveVector);

        // Impedir o avião de afundar no solo apenas quando NÃO estiver subindo/decolando
        if (this._currentMinHeight !== -1000 && this.airplane.position.y < this._currentMinHeight) {
            if (moveVector.y <= 0) {
                this.airplane.position.y = this._currentMinHeight;
            }
        }

        if (this.cameraMode === 'thirdPerson') {
            if (this.airplane && !this.gameOver) {
                this.airplane.visible = true;
            }
            // Posição final da câmera
            const targetCameraPosition = this.airplane.position.clone().add(this.cameraOffset.clone().applyQuaternion(this.airplane.quaternion));

            this.camera.position.lerp(targetCameraPosition, 0.07);
            this.camera.lookAt(this.airplane.position);
        } else if (this.cameraMode === 'front') {
            if (this.airplane) {
                this.airplane.visible = false;
            }
            // Posição local da primeira pessoa no avião (cockpit/frente)
            const frontOffset = new THREE.Vector3(0, 0.4, 0.2);
            const targetCameraPosition = frontOffset.clone().applyQuaternion(this.airplane.quaternion).add(this.airplane.position);

            // Lerp de posição para suavizar movimentos bruscos
            this.camera.position.lerp(targetCameraPosition, 0.1);

            // Slerp de rotação (quaternion) para suavizar a orientação
            const targetRotation = this.airplane.quaternion.clone().multiply(
                new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)
            );
            this.camera.quaternion.slerp(targetRotation, 0.1);
        } else if (this.cameraMode === 'orbit') {
            if (this.airplane && !this.gameOver) {
                this.airplane.visible = true;
            }
            // Câmera Externa Orbital 360° em volta do avião controlada pelo mouse
            const x = this.orbitDistance * Math.cos(this.orbitPitch) * Math.sin(this.orbitYaw);
            const y = this.orbitDistance * Math.sin(this.orbitPitch);
            const z = this.orbitDistance * Math.cos(this.orbitPitch) * Math.cos(this.orbitYaw);
            const targetCameraPosition = this.airplane.position.clone().add(new THREE.Vector3(x, y, z));

            this.camera.position.lerp(targetCameraPosition, 0.15);
            this.camera.lookAt(this.airplane.position);
        }

        // Tremor de câmera (shake) unificado aplicado após o posicionamento e rotação da câmera
        if (this.cameraShake.frames > 0 && this.cameraShake.totalFrames > 0) {
            const t = this.cameraShake.frames / this.cameraShake.totalFrames;
            // Decaimento quadrático rápido e suave (desaparece rapidamente após o toque)
            const fade = t * t;
            const shakeAmount = this.cameraShake.intensity * fade;

            const step = this.cameraShake.totalFrames - this.cameraShake.frames;
            const freq = step * 0.2;

            if (this.cameraMode === 'thirdPerson' || this.cameraMode === 'orbit') {
                // Em terceira pessoa / órbita: tremor perceptível com variação aleatória suave
                const offsetX = (Math.sin(freq * 1.5) * 0.6 + (Math.random() - 0.5) * 0.4) * shakeAmount * 1.5;
                const offsetY = (Math.cos(freq * 1.8) * 0.8 + (Math.random() - 0.5) * 0.4) * shakeAmount * 2.0;
                const offsetZ = (Math.sin(freq * 1.2) * 0.5) * shakeAmount * 1.2;
                this.camera.position.add(new THREE.Vector3(offsetX, offsetY, offsetZ));
            } else if (this.cameraMode === 'front') {
                // Em primeira pessoa: tranco de impacto realista no cockpit (posição + rotação da cabeça do piloto)
                const posMult = 3.5;
                const rotMult = 2.0;

                const offsetX = (Math.sin(freq * 1.5) * 0.3 + (Math.random() - 0.5) * 0.3) * shakeAmount * posMult;
                const offsetY = (Math.cos(freq * 1.8) * 0.4 + (Math.random() - 0.5) * 0.3) * shakeAmount * posMult;
                const offsetZ = (Math.sin(freq * 1.2) * 0.3) * shakeAmount * posMult;
                this.camera.position.add(new THREE.Vector3(offsetX, offsetY, offsetZ));

                const rotShake = new THREE.Euler(
                    (Math.cos(freq * 2.0) * 0.6 + (Math.random() - 0.5) * 0.3) * shakeAmount * rotMult,
                    (Math.sin(freq * 1.5) * 0.3 + (Math.random() - 0.5) * 0.2) * shakeAmount * rotMult,
                    (Math.sin(freq * 1.8) * 0.5 + (Math.random() - 0.5) * 0.3) * shakeAmount * rotMult
                );
                this.camera.quaternion.multiply(new THREE.Quaternion().setFromEuler(rotShake));
            }

            this.cameraShake.frames--;
        }

        // Atualizar HUD
        this.updateHUD();

        // Luz do sol seguindo o avião
        if (this.sunLight && this.airplane) {
            this.sunLight.position.set(
                this.airplane.position.x + 50,
                this.airplane.position.y + 200,
                this.airplane.position.z + 100
            );
            this.sunLight.target = this.airplane;
        }

        // Rotação contínua das hélices dos geradores eólicos
        if (this.windTurbineBlades && this.windTurbineBlades.length > 0) {
            for (let i = 0; i < this.windTurbineBlades.length; i++) {
                this.windTurbineBlades[i].rotation.z += 0.025;
            }
        }

        // Atualizar a posição do halo do sol para acompanhar a câmera
        if (this.sunHalo && this.camera) {
            const sunDir = new THREE.Vector3(50, 200, 100).normalize();
            this.sunHalo.position.copy(this.camera.position).addScaledVector(sunDir, 5000);
        }

        // Renderizar cena
        if (this.usePostProcessing && this.composer) {
            this.composer.render();
        } else {
            this.renderer.render(this.scene, this.camera);
        }

        // Atualizar Minimapa de Pistas
        this.updateMinimap();

        // Próximo frame
        requestAnimationFrame(() => this.animate());
    }
}

// Inicializar simulador de voo
const simulator = new FlightSimulator();

// Responsividade
window.addEventListener('resize', () => {
    simulator.camera.aspect = window.innerWidth / window.innerHeight;
    simulator.camera.updateProjectionMatrix();
    simulator.renderer.setSize(window.innerWidth, window.innerHeight);
    if (simulator.composer) {
        simulator.composer.setSize(window.innerWidth, window.innerHeight);
    }
});
