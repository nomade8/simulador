import * as THREE from 'three';
import {
    createEnemyInstancedPlanes,
    updateEnemyInstance,
    hideEnemyInstance,
    markEnemyInstancesDirty
} from './planeFactory.js?v=1.0.9';

export default class CombatManager {
    constructor(simulator) {
        this.sim = simulator;
        this.enabled = false;
        this.initialized = false;

        this.score = 0;
        this.wave = 1;
        this.trucksDestroyed = 0;
        this.planesDestroyed = 0;

        // Armamento do jogador
        this.maxAmmo = 1000;
        this.maxBombs = 8;
        this.maxMissiles = 8;
        this.ammo = this.maxAmmo;
        this.bombs = this.maxBombs;
        this.missiles = this.maxMissiles;

        this.gunCooldown = 0;
        this.bombCooldown = 0;
        this.missileCooldown = 0;
        this.isFiringGun = false;

        // Entidades de combate
        this.roadGroup = null;
        this.roadCurve = null;
        this.trucks = [];
        this.enemies = [];
        this.maxEnemies = 6;
        this.enemyInstanced = null;

        // Projéteis
        this.bullets = [];
        this.enemyBullets = [];
        this.bombProjectiles = [];
        this.missileProjectiles = [];
        this.weaponEffects = [];
        this.weaponResources = null;
        this.weaponAudio = null;
        this.flightTuning = {
            patrolSpeed: 32,
            attackSpeed: 42,
            minSpeed: 28,
            maxSpeed: 48,
            maxBank: 0.95,
            turnAcceleration: 24,
            rollResponse: 2,
            pitchResponse: 1.6,
            maxRollRate: 0.85,
            maxPitchRate: 0.24
        };

        // Raycaster reutilizável para altura do terreno
        this._raycaster = new THREE.Raycaster();
        this._down = new THREE.Vector3(0, -1, 0);
        this._tempVec = new THREE.Vector3();
        this._tempVec2 = new THREE.Vector3();
        this._shotSegment = new THREE.Line3();
        this._closestPoint = new THREE.Vector3();
        this._enemyForward = new THREE.Vector3();
        this._terrainOrigin = new THREE.Vector3();

        this.setupWeaponControls();
    }

    initWorld() {
        if (this.initialized) return;
        this.initialized = true;

        this.createHighwayRoad();
        this.enemyInstanced = createEnemyInstancedPlanes(this.sim.scene, this.maxEnemies);
        this.spawnWave(1);
    }

    setEnabled(enabled) {
        this.enabled = !!enabled;
        const missionHud = document.getElementById('missionHud');
        if (missionHud) {
            missionHud.style.display = this.enabled ? 'flex' : 'none';
        }
        if (this.enabled) {
            this.initWorld();
            if (this.roadGroup) this.roadGroup.visible = true;
            this.updateMissionHUD();
        } else {
            if (this.roadGroup) this.roadGroup.visible = false;
            this.clearActiveEntities();
        }
    }

    clearActiveEntities() {
        this.trucks.forEach(t => {
            if (t.mesh) this.sim.scene.remove(t.mesh);
        });
        this.trucks = [];

        this.enemies = [];
        if (this.enemyInstanced) {
            for (let i = 0; i < this.maxEnemies; i++) {
                hideEnemyInstance(this.enemyInstanced.instancedMeshes, i);
            }
            markEnemyInstancesDirty(this.enemyInstanced.instancedMeshes);
        }

        [...this.bullets, ...this.enemyBullets, ...this.bombProjectiles, ...this.missileProjectiles].forEach(p => {
            if (p.mesh) this.sim.scene.remove(p.mesh);
        });
        this.weaponEffects.forEach(effect => {
            this.sim.scene.remove(effect.mesh);
            effect.mesh.material.dispose();
        });
        this.weaponEffects = [];
        this.bullets = [];
        this.enemyBullets = [];
        this.bombProjectiles = [];
        this.missileProjectiles = [];
    }

    getGroundHeightAt(x, z) {
        if (!this.sim.ground) return 0;
        this._raycaster.set(this._terrainOrigin.set(x, 400, z), this._down);
        const hits = this._raycaster.intersectObject(this.sim.ground, false);
        return hits.length > 0 ? hits[0].point.y : 0;
    }

    // Amostra o terreno em toda a largura da via e acrescenta um abaulamento discreto.
    getRoadPoint(t, offset = 0, lift = 0) {
        const point = this.roadCurve.getPointAt(THREE.MathUtils.clamp(t, 0, 1));
        const tangent = this.roadCurve.getTangentAt(THREE.MathUtils.clamp(t, 0, 1)).setY(0).normalize();
        point.addScaledVector(new THREE.Vector3(tangent.z, 0, -tangent.x), offset);
        point.y = this.getGroundHeightAt(point.x, point.z) + 0.24
            + Math.max(0, 1 - Math.abs(offset) / 4.4) * 0.06 + lift;
        return point;
    }

    // Constrói asfalto, acostamentos e sinalização contínua sobre o relevo.
    createHighwayRoad() {
        const controlPoints = [
            new THREE.Vector3(-660, 0, -550), // Saída do aeródromo / base sudoeste
            new THREE.Vector3(-520, 0, -380),
            new THREE.Vector3(-380, 0, -260),
            new THREE.Vector3(-310, 0, -90),  // Contorno a oeste da cidade (cidade fica entre x: -200 e +200)
            new THREE.Vector3(-280, 0, 110),
            new THREE.Vector3(-190, 0, 270),  // Contorno a noroeste da cidade
            new THREE.Vector3(-30, 0, 320),   // Passagem ao norte da cidade (bem livre de prédios)
            new THREE.Vector3(160, 0, 310),
            new THREE.Vector3(330, 0, 360),   // Rumo ao vale nordeste
            new THREE.Vector3(470, 0, 520),
            new THREE.Vector3(620, 0, 680)    // Chegada no aeródromo/posto nordeste
        ];

        controlPoints.forEach(pt => {
            pt.y = this.getGroundHeightAt(pt.x, pt.z) + 0.16;
        });

        this.roadCurve = new THREE.CatmullRomCurve3(controlPoints, false, 'catmullrom', 0.5);
        this.roadGroup = new THREE.Group();

        const segments = Math.ceil(this.roadCurve.getLength() / 1.5);
        const addBand = (left, right, material, lift = 0, columns = 1) => {
            const positions = [];
            const indices = [];
            for (let i = 0; i <= segments; i++) {
                for (let j = 0; j <= columns; j++) {
                    const point = this.getRoadPoint(i / segments, THREE.MathUtils.lerp(left, right, j / columns), lift);
                    positions.push(point.x, point.y, point.z);
                    if (i < segments && j < columns) {
                        const a = i * (columns + 1) + j;
                        const b = a + columns + 1;
                        indices.push(a, b, a + 1, a + 1, b, b + 1);
                    }
                }
            }
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geometry.setIndex(indices);
            geometry.computeVertexNormals();
            const mesh = new THREE.Mesh(geometry, material);
            mesh.receiveShadow = true;
            this.roadGroup.add(mesh);
        };
        const asphalt = new THREE.MeshStandardMaterial({
            color: 0x30343a, roughness: 0.96, metalness: 0, side: THREE.DoubleSide
        });
        const shoulder = new THREE.MeshStandardMaterial({
            color: 0x777469, roughness: 1, side: THREE.DoubleSide
        });
        const yellow = new THREE.MeshBasicMaterial({ color: 0xeebd39, side: THREE.DoubleSide });
        const white = new THREE.MeshBasicMaterial({ color: 0xe3e2d7, side: THREE.DoubleSide });
        addBand(-4.4, -3.6, shoulder, 0, 3);
        addBand(3.6, 4.4, shoulder, 0, 3);
        addBand(-3.6, 3.6, asphalt, 0, 18);
        addBand(-0.22, -0.10, yellow, 0.028);
        addBand(0.10, 0.22, yellow, 0.028);
        addBand(-3.32, -3.19, white, 0.028);
        addBand(3.19, 3.32, white, 0.028);

        this.sim.scene.add(this.roadGroup);
    }

    createTruckMesh(isAntiAir = false) {
        const group = new THREE.Group();

        // Cores vibrantes com alto contraste em relação ao asfalto escuro
        // Caminhão normal: Lona Amarelo Ocre / Bege Claro + Cabine Laranja industrial / Vermelho
        // Caminhão Antiaéreo: Carga Verde Oliva Claro / Camuflagem Areia Clara + Cabine Amarelo Alerta
        const cargoColor = isAntiAir ? 0x889955 : (Math.random() > 0.5 ? 0xe67e22 : 0xf1c40f);
        const cabColor = isAntiAir ? 0xd35400 : 0xe74c3c;
        const chassisColor = 0xbdc3c7; // Chassi e para-choque metálico claro para destacar do asfalto

        const cargoMat = new THREE.MeshStandardMaterial({
            color: cargoColor,
            roughness: 0.45,
            metalness: 0.2
        });
        const cabMat = new THREE.MeshStandardMaterial({
            color: cabColor,
            roughness: 0.35,
            metalness: 0.35
        });
        const chassisMat = new THREE.MeshStandardMaterial({
            color: chassisColor,
            roughness: 0.3,
            metalness: 0.8
        });
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
        const rimMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0.9 });
        const glassMat = new THREE.MeshStandardMaterial({ color: 0x68d8d6, roughness: 0.1, metalness: 0.9 });

        // Base/Chassi prateado inferior (cria recorte perfeito sobre o asfalto)
        const frame = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 3.8), chassisMat);
        frame.position.set(0, 0.32, 0.2);
        group.add(frame);

        // Para-choque dianteiro branco/cromado com faróis acesos
        const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.25, 0.15), chassisMat);
        bumper.position.set(0, 0.28, 2.05);
        group.add(bumper);

        // Faróis dianteiros acesos (luz amarela brilhante para enxergar de longe)
        [-0.45, 0.45].forEach(fx => {
            const hl = new THREE.Mesh(
                new THREE.BoxGeometry(0.18, 0.14, 0.05),
                new THREE.MeshBasicMaterial({ color: 0xfffa65 })
            );
            hl.position.set(fx, 0.32, 2.12);
            group.add(hl);
        });

        // Caçamba / Carga com cobertura de lona colorida
        const cargo = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.1, 2.45), cargoMat);
        cargo.position.set(0, 0.92, -0.45);
        cargo.castShadow = true;
        group.add(cargo);

        // Cabine frontal vibrante
        const cab = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.95, 1.15), cabMat);
        cab.position.set(0, 0.85, 1.35);
        cab.castShadow = true;
        group.add(cab);

        // Teto da cabine com faixa branca de contraste
        const cabRoof = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.06, 1.05), chassisMat);
        cabRoof.position.set(0, 1.34, 1.35);
        group.add(cabRoof);

        const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.38, 0.08), glassMat);
        windshield.position.set(0, 0.98, 1.93);
        group.add(windshield);

        // Torre antiaérea ou canhão duplo no caminhão AA
        if (isAntiAir) {
            const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.46, 0.45, 10), chassisMat);
            turret.position.set(0, 1.55, -0.45);
            group.add(turret);

            // Canhões duplos AA
            [-0.14, 0.14].forEach(cx => {
                const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.1, 8), chassisMat);
                barrel.rotation.x = -Math.PI / 3;
                barrel.position.set(cx, 1.85, -0.15);
                group.add(barrel);
            });

            // Giroflex vermelho brilhante no topo
            const beacon = new THREE.Mesh(
                new THREE.CylinderGeometry(0.12, 0.14, 0.18, 8),
                new THREE.MeshBasicMaterial({ color: 0xff2222 })
            );
            beacon.position.set(0, 1.92, -0.45);
            group.add(beacon);
        }

        // Rodas com calotas brancas reluzentes para nunca sumir no chão
        const wheelGeom = new THREE.CylinderGeometry(0.34, 0.34, 0.22, 12);
        wheelGeom.rotateZ(Math.PI / 2);
        const rimGeom = new THREE.CylinderGeometry(0.18, 0.18, 0.23, 10);
        rimGeom.rotateZ(Math.PI / 2);

        [-1.1, -0.05, 1.4].forEach(z => {
            [-0.64, 0.64].forEach(x => {
                const w = new THREE.Mesh(wheelGeom, wheelMat);
                w.position.set(x, 0.34, z);
                group.add(w);

                const rim = new THREE.Mesh(rimGeom, rimMat);
                rim.position.set(x, 0.34, z);
                group.add(rim);
            });
        });

        group.scale.setScalar(1.4);
        this.sim.scene.add(group);
        return { group };
    }

    spawnWave(waveNum) {
        this.wave = waveNum;

        // 1. Spawnar comboio de caminhões na estrada (5 a 7 caminhões)
        const truckCount = Math.min(8, 5 + waveNum);
        for (let i = 0; i < truckCount; i++) {
            const isAA = i % 3 === 1;
            const { group } = this.createTruckMesh(isAA);
            const t = (0.08 + i * 0.065) % 0.9;
            const dir = i < Math.ceil(truckCount / 2) ? 1 : -1;

            const truck = {
                id: `truck_${waveNum}_${i}`,
                mesh: group,
                t: dir === 1 ? t : (0.92 - i * 0.04),
                dir,
                speed: 0.0064 + Math.random() * 0.0024,
                isAntiAir: isAA,
                hp: isAA ? 45 : 30,
                fireCooldown: 2 + Math.random() * 2,
                position: new THREE.Vector3(),
                alive: true
            };
            this.updateTruckTransform(truck, 0);
            this.trucks.push(truck);
        }

        // Distribui os caças a jato nos corredores entre a cidade e os aeroportos.
        // Cidade central: (-200..200, -200..200). Aeroportos principais: (600,700), (-600,-500), (-700,400).
        // Corredores de patrulha com múltiplos waypoints entre a borda da cidade e os aeroportos:
        const corridorRoutes = [
            // Corredor Nordeste (entre a cidade e o aeroporto NE 600, 700, acompanhando a rodovia)
            [
                new THREE.Vector3(260, 58, 280),
                new THREE.Vector3(470, 68, 490),
                new THREE.Vector3(340, 62, 620),
                new THREE.Vector3(140, 56, 360)
            ],
            // Corredor Sudoeste (entre a cidade e o aeroporto SW -600, -500)
            [
                new THREE.Vector3(-270, 56, -240),
                new THREE.Vector3(-480, 66, -390),
                new THREE.Vector3(-360, 64, -140),
                new THREE.Vector3(-290, 58, 120)
            ],
            // Corredor Noroeste (entre a cidade e o aeroporto NW -700, 400)
            [
                new THREE.Vector3(-290, 60, 210),
                new THREE.Vector3(-540, 70, 320),
                new THREE.Vector3(-420, 65, 480),
                new THREE.Vector3(-180, 58, 340)
            ],
            // Corredor Leste / Sudeste (vale aberto entre a cidade e o leste)
            [
                new THREE.Vector3(310, 62, -160),
                new THREE.Vector3(520, 72, 80),
                new THREE.Vector3(390, 66, 260),
                new THREE.Vector3(280, 58, 40)
            ]
        ];

        const patrolRoutes = corridorRoutes.map(route => {
            const curve = new THREE.CatmullRomCurve3(route, true, 'centripetal');
            const samples = curve.getSpacedPoints(128).slice(0, 128);
            samples.forEach(point => {
                point.y = Math.max(point.y + 20, this.getGroundHeightAt(point.x, point.z) + 55);
            });
            return { samples, length: curve.getLength() };
        });
        const planeCount = Math.min(this.maxEnemies, 2 + waveNum);
        for (let i = 0; i < planeCount; i++) {
            const route = corridorRoutes[i % corridorRoutes.length];
            const startWpIdx = i % route.length;
            const nextWpIdx = (startWpIdx + 1) % route.length;
            const startPt = route[startWpIdx];
            const nextPt = route[nextWpIdx];

            const px = startPt.x + (Math.random() - 0.5) * 40;
            const pz = startPt.z + (Math.random() - 0.5) * 40;
            const terrainY = this.getGroundHeightAt(px, pz);
            const initialYaw = Math.atan2(nextPt.x - px, nextPt.z - pz);
            // Usa unidades por segundo na mesma escala de deslocamento do jogador.
            const baseSpeed = this.flightTuning.patrolSpeed + Math.random() * 4;
            const departureTerrain = this.getGroundHeightAt(
                px + Math.sin(initialYaw) * baseSpeed * 3,
                pz + Math.cos(initialYaw) * baseSpeed * 3
            );
            const py = Math.max(terrainY + 65, departureTerrain + 60, startPt.y + 20);

            this.enemies.push({
                index: i,
                position: new THREE.Vector3(px, py, pz),
                rotation: new THREE.Euler(0, initialYaw, 0, 'YXZ'),
                yaw: initialYaw,
                pitch: 0,
                roll: 0,
                baseSpeed,
                speed: baseSpeed,
                velocity: new THREE.Vector3(Math.sin(initialYaw), 0, Math.cos(initialYaw)).multiplyScalar(baseSpeed),
                cruiseAlt: py,
                hp: 50,
                fireCooldown: 2.0 + Math.random() * 2.0,
                alive: true,
                route,
                patrolRoute: patrolRoutes[i % patrolRoutes.length],
                waypointIndex: nextWpIdx,
                state: 'patrol', // 'patrol' | 'intercept' | 'break'
                stateTimer: 0,
                breakDir: (i % 2 === 0 ? 1 : -1),
                breakHeading: initialYaw,
                terrainTimer: 0,
                terrainFloor: terrainY,
                terrainAhead: terrainY
            });
        }

        this.showCombatToast(`🎯 ONDA ${waveNum}: ${truckCount} Caminhões na Estrada • ${planeCount} Caças Inimigos!`);
        this.updateMissionHUD();
    }

    // Busca um ponto adiante na rota contínua para antecipar as curvas da patrulha.
    getEnemyPatrolTarget(enemy) {
        const { samples, length } = enemy.patrolRoute;
        let nearest = 0;
        let bestDistance = Infinity;
        for (let i = 0; i < samples.length; i++) {
            const dx = samples[i].x - enemy.position.x;
            const dz = samples[i].z - enemy.position.z;
            const distance = dx * dx + dz * dz;
            if (distance < bestDistance) {
                bestDistance = distance;
                nearest = i;
            }
        }
        const ahead = (nearest + (enemy.speed * 1.5 + 18) / length * samples.length) % samples.length;
        const index = Math.floor(ahead);
        return this._tempVec2.lerpVectors(samples[index], samples[(index + 1) % samples.length], ahead - index);
    }

    updateTruckTransform(truck, dt) {
        if (!this.roadCurve) return;
        truck.t += truck.dir * truck.speed * dt;
        if (truck.t >= 0.96) {
            truck.t = 0.96;
            truck.dir = -1;
        } else if (truck.t <= 0.04) {
            truck.t = 0.04;
            truck.dir = 1;
        }

        const laneOffset = truck.dir * 1.75;
        const pos = this.getRoadPoint(truck.t, laneOffset);
        const next = this.getRoadPoint(truck.t + truck.dir * 0.001, laneOffset);
        const tangent = next.sub(pos).normalize();

        truck.position.copy(pos);
        truck.mesh.position.copy(pos);
        const leftHeight = this.getRoadPoint(truck.t, laneOffset - 0.6).y;
        const rightHeight = this.getRoadPoint(truck.t, laneOffset + 0.6).y;
        truck.mesh.rotation.set(
            -Math.atan2(tangent.y, Math.hypot(tangent.x, tangent.z)),
            Math.atan2(tangent.x, tangent.z),
            Math.atan2(rightHeight - leftHeight, 1.2) * truck.dir,
            'YXZ'
        );
    }

    setupWeaponControls() {
        window.addEventListener('keydown', (e) => {
            if (!this.enabled || this.sim.gameOver || this.sim.isReplaying) return;
            if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;

            const k = e.key.toLowerCase();
            if (k === 'q') this.isFiringGun = true;
            if (k === 'e') this.dropBomb();
            if (k === 'c') this.fireMissile();
        });

        window.addEventListener('keyup', (e) => {
            if (e.key.toLowerCase() === 'q') this.isFiringGun = false;
        });

        window.addEventListener('pointerdown', (e) => {
            if (!this.enabled || this.sim.gameOver || this.sim.isReplaying) return;
            // Ignora cliques nos controles da interface.
            if (e.target && e.target.closest('button, input, label, .ap-panel, .tod-hud, .wind-hud-selector')) return;

            if (e.button === 0) {
                e.preventDefault();
                this.isFiringGun = true;
            } else if (e.button === 2) {
                e.preventDefault();
                this.fireMissile();
            }
        });

        window.addEventListener('pointerup', (e) => {
            if (e.button === 0) this.isFiringGun = false;
        });

        // Interrompe a rajada quando o mouse perde o controle da janela.
        window.addEventListener('pointercancel', () => {
            this.isFiringGun = false;
        });
        window.addEventListener('blur', () => {
            this.isFiringGun = false;
        });

        window.addEventListener('contextmenu', (e) => {
            if (this.enabled && !this.sim.gameOver && !this.sim.isReplaying) {
                e.preventDefault();
            }
        });
    }

    // Reutiliza o contexto e os ruídos, comprimindo os picos das rajadas.
    getWeaponAudio() {
        if (!this.sim.audioCtx && this.sim.initWebAudioJetEngine) this.sim.initWebAudioJetEngine();
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        const ctx = this.sim.audioCtx || this.weaponAudio?.ctx || (AudioContextClass ? new AudioContextClass() : null);
        if (!ctx || ctx.state === 'closed') return null;
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        if (this.weaponAudio?.ctx === ctx) return this.weaponAudio;
        if (this.weaponAudio) {
            this.weaponAudio.compressor.disconnect();
            this.weaponAudio.output.disconnect();
        }

        const size = Math.ceil(ctx.sampleRate * 2);
        const white = ctx.createBuffer(1, size, ctx.sampleRate);
        const rumble = ctx.createBuffer(1, size, ctx.sampleRate);
        const whiteData = white.getChannelData(0);
        const rumbleData = rumble.getChannelData(0);
        let low = 0;
        for (let i = 0; i < size; i++) {
            const sample = Math.random() * 2 - 1;
            low = (low + sample * 0.035) / 1.035;
            whiteData[i] = sample;
            rumbleData[i] = sample * 0.28 + low * 3.5;
        }
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-16, ctx.currentTime);
        compressor.knee.setValueAtTime(12, ctx.currentTime);
        compressor.ratio.setValueAtTime(4, ctx.currentTime);
        compressor.attack.setValueAtTime(0.003, ctx.currentTime);
        compressor.release.setValueAtTime(0.12, ctx.currentTime);
        const output = ctx.createGain();
        output.gain.setValueAtTime(0.7, ctx.currentTime);
        compressor.connect(output);
        output.connect(ctx.destination);
        this.weaponAudio = { ctx, white, rumble, compressor, output };
        return this.weaponAudio;
    }

    // Combina estalo, impacto grave e ruído de propulsão com caudas suaves.
    playWeaponSound(type) {
        try {
            const audio = this.getWeaponAudio();
            if (!audio) return;
            const { ctx } = audio;
            const now = ctx.currentTime;
            const variation = 0.94 + Math.random() * 0.12;
            const envelope = (gain, start, duration, volume, attack) => {
                gain.gain.setValueAtTime(0.0001, start);
                gain.gain.exponentialRampToValueAtTime(volume, start + attack);
                gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
            };
            const connectVoice = (source, nodes) => {
                let previous = source;
                for (const node of nodes) {
                    previous.connect(node);
                    previous = node;
                }
                previous.connect(audio.compressor);
                source.onended = () => {
                    source.disconnect();
                    nodes.forEach(node => node.disconnect());
                };
            };
            const noise = (buffer, filterType, frequency, endFrequency, volume, duration, attack = 0.003, delay = 0, q = 0.7) => {
                const start = now + delay;
                const source = ctx.createBufferSource();
                source.buffer = buffer;
                source.loop = true;
                source.playbackRate.setValueAtTime(variation, start);
                const filter = ctx.createBiquadFilter();
                filter.type = filterType;
                filter.Q.setValueAtTime(q, start);
                filter.frequency.setValueAtTime(frequency * variation, start);
                filter.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
                const gain = ctx.createGain();
                envelope(gain, start, duration, volume, attack);
                connectVoice(source, [filter, gain]);
                source.start(start, Math.random() * buffer.duration);
                source.stop(start + duration + 0.01);
            };
            const thump = (frequency, endFrequency, volume, duration) => {
                const source = ctx.createOscillator();
                source.type = 'sine';
                source.frequency.setValueAtTime(frequency * variation, now);
                source.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
                const gain = ctx.createGain();
                envelope(gain, now, duration, volume, 0.003);
                connectVoice(source, [gain]);
                source.start(now);
                source.stop(now + duration + 0.01);
            };

            if (type === 'gun') {
                noise(audio.white, 'highpass', 950, 450, 0.45, 0.065);
                noise(audio.white, 'bandpass', 1800, 650, 0.28, 0.14, 0.002, 0, 0.9);
                noise(audio.white, 'bandpass', 3300, 1800, 0.07, 0.085, 0.002, 0.028, 2.2);
                thump(155, 48, 0.42, 0.14);
            } else if (type === 'missile') {
                noise(audio.white, 'highpass', 650, 300, 0.36, 0.14);
                noise(audio.rumble, 'lowpass', 1600, 280, 0.65, 1.65, 0.07);
                noise(audio.white, 'bandpass', 2400, 550, 0.22, 1.1, 0.06, 0.04, 0.55);
                thump(95, 32, 0.38, 0.28);
            } else if (type === 'bomb') {
                thump(340, 110, 0.14, 0.26);
            }
        } catch (e) { }
    }

    getPlaneForwardDir() {
        // Usa a orientação física do voo (sem visualAoA) para os tiros saírem retos na linha de voo
        const ps = this.sim.planeState;
        if (ps) {
            const physicalEuler = new THREE.Euler(-(ps.pitch || 0), ps.rotation || 0, ps.roll || 0, 'YXZ');
            return new THREE.Vector3(0, 0, 1).applyEuler(physicalEuler).normalize();
        }
        return new THREE.Vector3(0, 0, 1).applyQuaternion(this.sim.airplane.quaternion).normalize();
    }

    // Compartilha geometrias e materiais para manter os disparos leves.
    getWeaponResources() {
        if (this.weaponResources) return this.weaponResources;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 64;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.25, 'rgba(255,255,255,0.7)');
        gradient.addColorStop(0.6, 'rgba(255,255,255,0.22)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 64, 64);
        const texture = new THREE.CanvasTexture(canvas);
        const glow = new THREE.SpriteMaterial({
            map: texture, color: 0xffaa45, transparent: true, opacity: 0.7,
            blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
        });
        const smoke = new THREE.SpriteMaterial({
            map: texture, color: 0xcbd1d7, transparent: true, opacity: 0.4,
            depthWrite: false
        });
        const fin = new THREE.BufferGeometry();
        fin.setAttribute('position', new THREE.Float32BufferAttribute([
            0.08, 0, -0.32, 0.36, 0, -0.58, 0.08, 0, -0.61
        ], 3));
        fin.computeVertexNormals();
        this.weaponResources = {
            glow, smoke,
            tracerGeometry: new THREE.CylinderGeometry(0.035, 0.035, 1.9, 6).rotateX(Math.PI / 2),
            tracerMaterial: new THREE.MeshBasicMaterial({ color: 0xfff6cf, toneMapped: false }),
            haloGeometry: new THREE.CylinderGeometry(0.085, 0.045, 2.8, 6).rotateX(Math.PI / 2),
            haloMaterial: new THREE.MeshBasicMaterial({
                color: 0xff9a32, transparent: true, opacity: 0.32,
                blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
            }),
            bodyGeometry: new THREE.CylinderGeometry(0.085, 0.085, 0.96, 12).rotateX(Math.PI / 2),
            noseGeometry: new THREE.ConeGeometry(0.085, 0.32, 12).rotateX(Math.PI / 2),
            finGeometry: fin,
            exhaustGeometry: new THREE.SphereGeometry(1, 8, 6),
            bodyMaterial: new THREE.MeshStandardMaterial({ color: 0xe5e9ee, metalness: 0.65, roughness: 0.32 }),
            darkMaterial: new THREE.MeshStandardMaterial({ color: 0x35414e, metalness: 0.6, roughness: 0.35, side: THREE.DoubleSide }),
            exhaustMaterial: new THREE.MeshBasicMaterial({
                color: 0xffc36a, transparent: true, opacity: 0.85,
                blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
            })
        };
        return this.weaponResources;
    }

    // Emite clarões, fumaça e faíscas com duração limitada.
    emitWeaponEffect(position, type, velocity = new THREE.Vector3()) {
        if (this.weaponEffects.length >= (type === 'smoke' ? 180 : 220)) return;
        const resources = this.getWeaponResources();
        const isSmoke = type === 'smoke';
        const material = (isSmoke ? resources.smoke : resources.glow).clone();
        material.rotation = Math.random() * Math.PI * 2;
        if (type === 'spark') material.color.setHex(0xffdc8c);
        const mesh = new THREE.Sprite(material);
        mesh.position.copy(position);
        const life = isSmoke ? 1.6 : (type === 'muzzle' ? 0.075 : 0.24);
        const size = isSmoke ? 0.65 : (type === 'muzzle' ? 1.15 : 0.32);
        mesh.scale.setScalar(size);
        this.sim.scene.add(mesh);
        this.weaponEffects.push({ mesh, velocity: velocity.clone(), life, duration: life, size, isSmoke });
    }

    updateWeaponEffects(dt) {
        for (let i = this.weaponEffects.length - 1; i >= 0; i--) {
            const effect = this.weaponEffects[i];
            effect.life -= dt;
            if (effect.life <= 0) {
                this.sim.scene.remove(effect.mesh);
                effect.mesh.material.dispose();
                this.weaponEffects.splice(i, 1);
                continue;
            }
            const age = 1 - effect.life / effect.duration;
            effect.mesh.position.addScaledVector(effect.velocity, dt);
            effect.mesh.scale.setScalar(effect.size * (effect.isSmoke ? 1 + age * 4 : 1 + age));
            effect.mesh.material.opacity = (effect.isSmoke ? 0.38 : 0.9) * (1 - age);
        }
    }

    // Verifica todo o trajeto do projétil para evitar atravessar alvos entre quadros.
    projectileHits(start, end, target, radius) {
        this._shotSegment.set(start, end);
        this._shotSegment.closestPointToPoint(target, true, this._closestPoint);
        return this._closestPoint.distanceToSquared(target) <= radius * radius;
    }

    emitImpact(position) {
        for (let i = 0; i < 6; i++) {
            this.emitWeaponEffect(position, 'spark', new THREE.Vector3(
                (Math.random() - 0.5) * 12, Math.random() * 9, (Math.random() - 0.5) * 12
            ));
        }
    }

    fireGun() {
        if (this.ammo <= 0 || this.gunCooldown > 0 || !this.sim.airplane) return;
        this.ammo--;
        this.gunCooldown = 0.09;

        const forward = this.getPlaneForwardDir();
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.sim.airplane.quaternion);
        const sideOffset = (this.ammo % 2 === 0 ? 0.45 : -0.45);

        const spawnPos = this.sim.airplane.position.clone()
            .addScaledVector(forward, 1.4)
            .addScaledVector(right, sideOffset);
        spawnPos.y -= 0.08;

        const resources = this.getWeaponResources();
        const mesh = new THREE.Group();
        mesh.add(new THREE.Mesh(resources.tracerGeometry, resources.tracerMaterial));
        const halo = new THREE.Mesh(resources.haloGeometry, resources.haloMaterial);
        halo.position.z = -0.4;
        mesh.add(halo);
        mesh.position.copy(spawnPos);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), forward);
        this.sim.scene.add(mesh);
        this.emitWeaponEffect(spawnPos, 'muzzle');

        const planeSpeed = (this.sim.planeState.speed || 0) * 0.028 * 60;
        const vel = forward.multiplyScalar(planeSpeed + 145);

        this.bullets.push({ mesh, position: spawnPos, previousPosition: spawnPos.clone(), velocity: vel, life: 2.2 });
        this.playWeaponSound('gun');
        this.updateMissionHUD();
    }

    dropBomb() {
        if (this.bombs <= 0 || this.bombCooldown > 0 || !this.sim.airplane || this.sim._isOnGround) return;
        this.bombs--;
        this.bombCooldown = 0.45;

        const forward = this.getPlaneForwardDir();
        const spawnPos = this.sim.airplane.position.clone().add(new THREE.Vector3(0, -0.5, 0));

        const bombMesh = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.14, 0.45, 4, 8),
            new THREE.MeshStandardMaterial({ color: 0x2f3542, metalness: 0.7, roughness: 0.3 })
        );
        bombMesh.rotation.x = Math.PI / 2;
        bombMesh.position.copy(spawnPos);
        this.sim.scene.add(bombMesh);

        const planeSpeedUnitsPerSec = (this.sim.planeState.speed || 0) * 0.028 * 60;
        const vel = forward.multiplyScalar(planeSpeedUnitsPerSec);

        this.bombProjectiles.push({ mesh: bombMesh, position: spawnPos, velocity: vel, life: 10.0 });
        this.playWeaponSound('bomb');
        this.updateMissionHUD();
    }

    findBestAirTarget() {
        if (!this.sim.airplane) return null;
        const planePos = this.sim.airplane.position;
        const forward = this.getPlaneForwardDir();

        let best = null;
        let bestScore = Infinity;

        for (const e of this.enemies) {
            if (!e.alive) continue;
            const toEnemy = this._tempVec.copy(e.position).sub(planePos);
            const dist = toEnemy.length();
            if (dist > 450) continue;
            toEnemy.normalize();
            const dot = forward.dot(toEnemy);
            if (dot > 0.72) {
                const score = dist * (1.2 - dot);
                if (score < bestScore) {
                    bestScore = score;
                    best = e;
                }
            }
        }
        return best;
    }

    fireMissile() {
        if (this.missiles <= 0 || this.missileCooldown > 0 || !this.sim.airplane) return;
        this.missiles--;
        this.missileCooldown = 0.85;

        const forward = this.getPlaneForwardDir();
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.sim.airplane.quaternion);
        const down = new THREE.Vector3(0, -1, 0).applyQuaternion(this.sim.airplane.quaternion);
        const spawnPos = this.sim.airplane.position.clone().addScaledVector(forward, 0.9)
            .addScaledVector(right, this.missiles % 2 === 0 ? 0.8 : -0.8)
            .addScaledVector(down, 0.3);

        const resources = this.getWeaponResources();
        const missileMesh = new THREE.Group();
        missileMesh.add(new THREE.Mesh(resources.bodyGeometry, resources.bodyMaterial));
        const nose = new THREE.Mesh(resources.noseGeometry, resources.darkMaterial);
        nose.position.z = 0.64;
        missileMesh.add(nose);
        for (let i = 0; i < 4; i++) {
            const fin = new THREE.Mesh(resources.finGeometry, resources.darkMaterial);
            fin.rotation.z = i * Math.PI / 2;
            missileMesh.add(fin);
        }
        const flame = new THREE.Mesh(resources.exhaustGeometry, resources.exhaustMaterial);
        flame.position.z = -0.85;
        flame.scale.set(0.12, 0.12, 0.45);
        missileMesh.add(flame);
        const glow = new THREE.Sprite(resources.glow);
        glow.position.z = -0.6;
        glow.scale.setScalar(0.85);
        missileMesh.add(glow);
        missileMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), forward);
        missileMesh.position.copy(spawnPos);
        this.sim.scene.add(missileMesh);

        const target = this.findBestAirTarget();
        const planeSpeed = (this.sim.planeState.speed || 0) * 0.028 * 60;

        this.missileProjectiles.push({
            mesh: missileMesh,
            position: spawnPos,
            previousPosition: spawnPos.clone(),
            velocity: forward.clone().multiplyScalar(planeSpeed + 48),
            speed: planeSpeed + 48,
            direction: forward.clone(),
            guidance: new THREE.Quaternion(),
            age: 0,
            trailDistance: 0,
            flame,
            target,
            life: 6
        });

        this.playWeaponSound('missile');
        this.updateMissionHUD();
    }

    /**
     * Calcula o ponto previsto no solo onde uma bomba cairia agora (CCIP).
     */
    predictBombImpactPoint() {
        if (!this.sim.airplane || this.sim._isOnGround) return null;
        const pos = this.sim.airplane.position.clone();
        const forward = this.getPlaneForwardDir();
        const speed = (this.sim.planeState.speed || 0) * 0.028 * 60;
        const vel = forward.multiplyScalar(speed);
        const gravity = 18.0;
        const step = 0.12;

        for (let t = 0; t < 6.0; t += step) {
            vel.y -= gravity * step;
            pos.addScaledVector(vel, step);
            const gY = this.getGroundHeightAt(pos.x, pos.z);
            if (pos.y <= gY + 0.2) {
                pos.y = gY;
                return pos;
            }
        }
        return null;
    }

    rearmOnRunway() {
        if (this.ammo < this.maxAmmo || this.bombs < this.maxBombs || this.missiles < this.maxMissiles) {
            this.ammo = this.maxAmmo;
            this.bombs = this.maxBombs;
            this.missiles = this.maxMissiles;
            this.showCombatToast('🔄 Reabastecido: 1.000 tiros, 8 mísseis e 8 bombas!');
            this.updateMissionHUD();
        }
    }

    update(dt) {
        if (!this.enabled || this.sim.gameOver || this.sim.isReplaying) return;
        dt = THREE.MathUtils.clamp(dt, 0, 0.05);
        this.updateWeaponEffects(dt);

        if (this.gunCooldown > 0) this.gunCooldown -= dt;
        if (this.bombCooldown > 0) this.bombCooldown -= dt;
        if (this.missileCooldown > 0) this.missileCooldown -= dt;

        if (this.isFiringGun) {
            this.fireGun();
        }

        // Recarregar se estiver parado/lento na pista
        if (this.sim._onGroundOnRunway && (this.sim.planeState.speed || 0) < 1.2) {
            this.rearmOnRunway();
        }

        // 1. Atualizar Caminhões na Estrada + Fogo Antiaéreo
        const playerPos = this.sim.airplane.position;
        for (let i = this.trucks.length - 1; i >= 0; i--) {
            const truck = this.trucks[i];
            if (!truck.alive) continue;

            this.updateTruckTransform(truck, dt);

            if (truck.isAntiAir) {
                truck.fireCooldown -= dt;
                const dist = truck.position.distanceTo(playerPos);
                if (dist < 170 && truck.fireCooldown <= 0 && !this.sim._isOnGround) {
                    truck.fireCooldown = 2.6 + Math.random() * 1.4;
                    this.spawnEnemyShot(truck.position.clone().add(new THREE.Vector3(0, 1.8, 0)), playerPos, 62);
                }
            }
        }

        // Atualiza os caças com inércia, curvas coordenadas e passes de ataque.
        let anyEnemyAlive = false;
        const playerForward = this.getPlaneForwardDir();
        const playerSpeed = (this.sim.planeState.speed || 0) * 0.028 * 60;

        for (let i = 0; i < this.enemies.length; i++) {
            const enemy = this.enemies[i];
            if (!enemy.alive) {
                hideEnemyInstance(this.enemyInstanced.instancedMeshes, enemy.index);
                continue;
            }
            anyEnemyAlive = true;

            const toPlayer = this._tempVec.copy(playerPos).sub(enemy.position);
            const distToPlayer = toPlayer.length();
            const distFromCity = Math.hypot(enemy.position.x, enemy.position.z);
            const playerDistFromCity = Math.hypot(playerPos.x, playerPos.z);

            enemy.stateTimer = Math.max(0, enemy.stateTimer - dt);

            // Máquina de estados de voo realista:
            // - 'patrol': percorre waypoints entre a cidade e os aeroportos
            // - 'intercept': curva suavemente para engajar o jogador quando ele está no ar por perto (< 520m)
            // - 'break': executa curva inclinada de evasão/reengajamento ao passar muito perto (< 80m) ou chegar perto da cidade
            if (enemy.state === 'break') {
                if (enemy.stateTimer <= 0 && distFromCity > 240) {
                    enemy.state = (distToPlayer < 520 && !this.sim._isOnGround && playerDistFromCity > 200) ? 'intercept' : 'patrol';
                }
            } else if (distFromCity < 230) {
                // Chegou perto demais da cidade -> faz curva inclinada suave para fora (sem empurrão artificial)
                enemy.state = 'break';
                enemy.stateTimer = 2.6;
                const outYaw = Math.atan2(enemy.position.x || 1, enemy.position.z || 1);
                let outDiff = outYaw - enemy.yaw;
                while (outDiff > Math.PI) outDiff -= Math.PI * 2;
                while (outDiff < -Math.PI) outDiff += Math.PI * 2;
                enemy.breakDir = outDiff >= 0 ? 1 : -1;
                enemy.breakHeading = outYaw;
            } else if (!this.sim._isOnGround && distToPlayer < 520 && playerDistFromCity > 190) {
                if (distToPlayer < 75) {
                    // Passou perto do jogador: faz curva de break realista para abrir espaço e voltar
                    enemy.state = 'break';
                    enemy.stateTimer = 2.8 + Math.random() * 1.0;
                    enemy.breakDir = Math.random() > 0.5 ? 1 : -1;
                    enemy.breakHeading = enemy.yaw + enemy.breakDir * 1.35;
                } else {
                    enemy.state = 'intercept';
                }
            } else {
                enemy.state = 'patrol';
            }

            // Definir ponto alvo e atitude desejada conforme o estado
            let targetPos;
            let desiredBank = 0;
            let desiredPitch = 0;

            if (enemy.state === 'break') {
                // Completa a curva de escape e nivela as asas ao alcançar o novo rumo.
                const headingError = Math.atan2(Math.sin(enemy.breakHeading - enemy.yaw), Math.cos(enemy.breakHeading - enemy.yaw));
                desiredBank = THREE.MathUtils.clamp(
                    -Math.atan(headingError * 0.8 * enemy.speed / this.flightTuning.turnAcceleration),
                    -this.flightTuning.maxBank, this.flightTuning.maxBank
                );
                const safeBreakAlt = Math.max(enemy.cruiseAlt + 8, enemy.terrainFloor + 55);
                desiredPitch = THREE.MathUtils.clamp((safeBreakAlt - enemy.position.y) * 0.005, -0.1, 0.18);
            } else {
                if (enemy.state === 'intercept') {
                    // Antecipa o deslocamento do jogador para realizar passes de interceptação.
                    const leadTime = THREE.MathUtils.clamp(distToPlayer / (enemy.speed + playerSpeed), 0.2, 2);
                    targetPos = this._tempVec2.copy(playerPos).addScaledVector(playerForward, playerSpeed * leadTime);
                    targetPos.y = Math.max(targetPos.y + 4, enemy.terrainAhead + 48);
                } else {
                    targetPos = this.getEnemyPatrolTarget(enemy);
                }

                const dx = targetPos.x - enemy.position.x;
                const dy = targetPos.y - enemy.position.y;
                const dz = targetPos.z - enemy.position.z;
                const horizDist = Math.hypot(dx, dz);
                const desiredYaw = Math.atan2(dx, dz);

                let yawDiff = desiredYaw - enemy.yaw;
                while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
                while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;

                // Coordena inclinação e velocidade para executar curvas abertas sem oscilações.
                const desiredTurnRate = THREE.MathUtils.clamp(yawDiff * 0.75, -0.85, 0.85);
                desiredBank = THREE.MathUtils.clamp(
                    -Math.atan(desiredTurnRate * enemy.speed / this.flightTuning.turnAcceleration),
                    -this.flightTuning.maxBank, this.flightTuning.maxBank
                );
                desiredPitch = THREE.MathUtils.clamp(
                    Math.atan2(dy, Math.max(90, horizDist)),
                    -0.22, 0.26
                );
            }

            // Reutiliza sondagens do relevo e antecipa colinas em duas distâncias.
            enemy.terrainTimer -= dt;
            if (enemy.terrainTimer <= 0) {
                enemy.terrainTimer = 0.16;
                const sinYaw = Math.sin(enemy.yaw);
                const cosYaw = Math.cos(enemy.yaw);
                enemy.terrainFloor = this.getGroundHeightAt(enemy.position.x, enemy.position.z);
                enemy.terrainAhead = Math.max(
                    this.getGroundHeightAt(enemy.position.x + sinYaw * enemy.speed * 3, enemy.position.z + cosYaw * enemy.speed * 3),
                    this.getGroundHeightAt(enemy.position.x + sinYaw * enemy.speed * 6, enemy.position.z + cosYaw * enemy.speed * 6)
                );
            }
            const minClearanceY = Math.max(enemy.terrainFloor, enemy.terrainAhead) + 60;

            if (enemy.position.y < minClearanceY) {
                const climbUrgency = THREE.MathUtils.clamp((minClearanceY - enemy.position.y) * 0.014, 0.08, 0.52);
                desiredPitch = Math.max(desiredPitch, climbUrgency);
                desiredBank *= 0.4;
            }

            // Inércia aerodinâmica suave de rolagem (Roll) e arfagem (Pitch)
            enemy.roll += THREE.MathUtils.clamp(
                (desiredBank - enemy.roll) * (1 - Math.exp(-this.flightTuning.rollResponse * dt)),
                -this.flightTuning.maxRollRate * dt, this.flightTuning.maxRollRate * dt
            );
            enemy.pitch += THREE.MathUtils.clamp(
                (desiredPitch - enemy.pitch) * (1 - Math.exp(-this.flightTuning.pitchResponse * dt)),
                -this.flightTuning.maxPitchRate * dt, this.flightTuning.maxPitchRate * dt
            );

            // Curva coordenada: a taxa de guinada (Yaw) vem diretamente da inclinação da asa (tan/sin do roll)
            const turnRate = -this.flightTuning.turnAcceleration * Math.tan(enemy.roll) / Math.max(enemy.speed, 1);
            enemy.yaw += turnRate * dt;
            enemy.yaw = Math.atan2(Math.sin(enemy.yaw), Math.cos(enemy.yaw));

            // O motor mantém energia, com perda moderada de velocidade em subida e curva.
            const targetSpeed = THREE.MathUtils.clamp(
                (enemy.state === 'patrol' ? enemy.baseSpeed : this.flightTuning.attackSpeed + (enemy.state === 'break' ? 2 : 0))
                    - Math.sin(enemy.pitch) * 7 - Math.abs(enemy.roll) * 1.4,
                this.flightTuning.minSpeed, this.flightTuning.maxSpeed
            );
            enemy.speed = THREE.MathUtils.lerp(enemy.speed, targetSpeed, 1 - Math.exp(-1.5 * dt));

            // Aplicar rotação YXZ e mover estritamente na direção do nariz (sem deslizar de lado!)
            enemy.rotation.order = 'YXZ';
            enemy.rotation.set(-enemy.pitch, enemy.yaw, enemy.roll, 'YXZ');

            const moveDir = this._enemyForward.set(0, 0, 1).applyEuler(enemy.rotation);
            enemy.velocity.copy(moveDir).multiplyScalar(enemy.speed);
            enemy.position.addScaledVector(enemy.velocity, dt);

            // Uma colisão real encerra o voo em vez de reposicionar o avião no ar.
            if (enemy.position.y <= enemy.terrainFloor + 2) {
                enemy.alive = false;
                this.sim.createExplosion(enemy.position.clone(), 2.2);
                this.sim.playExplosionSound();
                hideEnemyInstance(this.enemyInstanced.instancedMeshes, enemy.index);
                continue;
            }

            updateEnemyInstance(
                this.enemyInstanced.instancedMeshes,
                this.enemyInstanced.dummyRoot,
                enemy.index,
                enemy.position,
                enemy.rotation
            );

            // Disparo inimigo: apenas quando engajando e alinhado atrás/à frente do jogador
            enemy.fireCooldown -= dt;
            if (enemy.state === 'intercept' && distToPlayer < 230 && enemy.fireCooldown <= 0) {
                const aimDot = moveDir.dot(toPlayer.clone().normalize());
                if (aimDot > 0.84) {
                    enemy.fireCooldown = 2.3 + Math.random() * 1.4;
                    this.spawnEnemyShot(enemy.position.clone(), playerPos, 56);
                }
            }
        }
        if (this.enemyInstanced) {
            markEnemyInstancesDirty(this.enemyInstanced.instancedMeshes);
        }

        // 3. Atualizar Projéteis do Canhão
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            b.life -= dt;
            b.previousPosition.copy(b.position);
            b.position.addScaledVector(b.velocity, dt);
            b.mesh.position.copy(b.position);

            let hit = false;
            // Checar colisão com caças
            for (const e of this.enemies) {
                if (e.alive && this.projectileHits(b.previousPosition, b.position, e.position, 3.4)) {
                    this.damageEnemyPlane(e, 22);
                    this.emitImpact(this._closestPoint);
                    hit = true;
                    break;
                }
            }
            // Checar colisão com caminhões
            if (!hit) {
                for (const t of this.trucks) {
                    if (t.alive && this.projectileHits(b.previousPosition, b.position, t.position, 2.2)) {
                        this.damageTruck(t, 16);
                        this.emitImpact(this._closestPoint);
                        hit = true;
                        break;
                    }
                }
            }

            const groundHit = b.position.y <= this.getGroundHeightAt(b.position.x, b.position.z);
            if (hit || b.life <= 0 || groundHit) {
                if (!hit && groundHit) this.emitImpact(b.position);
                this.sim.scene.remove(b.mesh);
                this.bullets.splice(i, 1);
            }
        }

        // 4. Atualizar Bombas
        for (let i = this.bombProjectiles.length - 1; i >= 0; i--) {
            const bomb = this.bombProjectiles[i];
            bomb.life -= dt;
            bomb.velocity.y -= 18.0 * dt;
            bomb.position.addScaledVector(bomb.velocity, dt);
            bomb.mesh.position.copy(bomb.position);

            const groundY = this.getGroundHeightAt(bomb.position.x, bomb.position.z);
            if (bomb.position.y <= groundY + 0.3 || bomb.life <= 0) {
                // Explosão em área (raio 16m)
                this.sim.createExplosion(bomb.position.clone(), 2.2);
                this.sim.playExplosionSound();
                for (const t of this.trucks) {
                    if (t.alive && t.position.distanceTo(bomb.position) < 16.0) {
                        this.damageTruck(t, 100);
                    }
                }
                this.sim.scene.remove(bomb.mesh);
                this.bombProjectiles.splice(i, 1);
            }
        }

        // 5. Atualizar Mísseis Guiados
        for (let i = this.missileProjectiles.length - 1; i >= 0; i--) {
            const m = this.missileProjectiles[i];
            m.life -= dt;
            m.age += dt;
            m.previousPosition.copy(m.position);
            m.speed = Math.min(145, m.speed + 65 * dt);

            // Limita a curva e mantém a velocidade durante a perseguição do alvo.
            if (m.target && m.target.alive && m.age > 0.18) {
                const interceptTime = THREE.MathUtils.clamp(m.position.distanceTo(m.target.position) / m.speed, 0, 1.8);
                const aim = m.target.position.clone().addScaledVector(m.target.velocity, interceptTime)
                    .sub(m.position).normalize();
                m.guidance.setFromUnitVectors(new THREE.Vector3(0, 0, 1), aim);
                m.mesh.quaternion.rotateTowards(m.guidance, 2.1 * dt);
            }
            m.direction.set(0, 0, 1).applyQuaternion(m.mesh.quaternion);
            m.velocity.copy(m.direction).multiplyScalar(m.speed);
            m.position.addScaledVector(m.velocity, dt);
            m.mesh.position.copy(m.position);
            m.flame.scale.z = 0.4 + Math.sin(m.age * 95) * 0.08;
            const travel = m.previousPosition.distanceTo(m.position);
            const trailTotal = m.trailDistance + travel;
            for (let distance = 1.8 - m.trailDistance; distance <= travel; distance += 1.8) {
                const puff = m.previousPosition.clone().lerp(m.position, distance / Math.max(travel, 0.001))
                    .addScaledVector(m.direction, -0.65);
                this.emitWeaponEffect(puff, 'smoke', new THREE.Vector3(0.25, 0.65, -0.15));
            }
            m.trailDistance = trailTotal % 1.8;

            let hit = false;
            for (const e of this.enemies) {
                if (e.alive && this.projectileHits(m.previousPosition, m.position, e.position, 4.5)) {
                    this.damageEnemyPlane(e, 100);
                    hit = true;
                    break;
                }
            }
            if (!hit) {
                for (const t of this.trucks) {
                    if (t.alive && this.projectileHits(m.previousPosition, m.position, t.position, 3.0)) {
                        this.damageTruck(t, 100);
                        hit = true;
                        break;
                    }
                }
            }

            if (hit || m.life <= 0 || m.position.y <= this.getGroundHeightAt(m.position.x, m.position.z)) {
                if (!hit && m.life > 0) this.sim.createExplosion(m.position.clone(), 1.2);
                this.sim.scene.remove(m.mesh);
                this.missileProjectiles.splice(i, 1);
            }
        }

        // 6. Atualizar Projéteis Inimigos
        for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
            const eb = this.enemyBullets[i];
            eb.life -= dt;
            eb.position.addScaledVector(eb.velocity, dt);
            eb.mesh.position.copy(eb.position);

            if (eb.position.distanceTo(playerPos) < 2.2) {
                this.sim.playerHealth = Math.max(0, this.sim.playerHealth - 6);
                this.sim.updateHealthBar();
                this.sim.startCameraShake(0.14, 10);
                this.sim.scene.remove(eb.mesh);
                this.enemyBullets.splice(i, 1);

                if (this.sim.playerHealth <= 0) {
                    this.sim.handleCrash('Você foi abatido pelo fogo inimigo!');
                    return;
                }
                continue;
            }

            if (eb.life <= 0) {
                this.sim.scene.remove(eb.mesh);
                this.enemyBullets.splice(i, 1);
            }
        }

        // 7. Checar se toda a onda foi eliminada -> iniciar próxima onda
        const anyTruckAlive = this.trucks.some(t => t.alive);
        if (!anyTruckAlive && !anyEnemyAlive) {
            this.trucks = [];
            this.enemies = [];
            this.score += 500;
            this.spawnWave(this.wave + 1);
        }
    }

    spawnEnemyShot(origin, targetPos, speed) {
        const dir = targetPos.clone().sub(origin).normalize();
        const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.14, 6, 6),
            new THREE.MeshBasicMaterial({ color: 0xff3b3b })
        );
        mesh.position.copy(origin);
        this.sim.scene.add(mesh);

        this.enemyBullets.push({
            mesh,
            position: origin.clone(),
            velocity: dir.multiplyScalar(speed),
            life: 2.8
        });
    }

    damageTruck(truck, dmg) {
        if (!truck.alive) return;
        truck.hp -= dmg;
        if (truck.hp <= 0) {
            truck.alive = false;
            this.trucksDestroyed++;
            this.score += 150;
            this.sim.createExplosion(truck.position.clone().add(new THREE.Vector3(0, 1, 0)), 1.8);
            this.sim.playExplosionSound();
            this.sim.scene.remove(truck.mesh);
            this.updateMissionHUD();
        }
    }

    damageEnemyPlane(enemy, dmg) {
        if (!enemy.alive) return;
        enemy.hp -= dmg;
        if (enemy.hp <= 0) {
            enemy.alive = false;
            this.planesDestroyed++;
            this.score += 250;
            this.sim.createExplosion(enemy.position.clone(), 2.2);
            this.sim.playExplosionSound();
            hideEnemyInstance(this.enemyInstanced.instancedMeshes, enemy.index);
            markEnemyInstancesDirty(this.enemyInstanced.instancedMeshes);
            this.updateMissionHUD();
        }
    }

    updateMissionHUD() {
        if (!this.enabled) return;
        const aliveTrucks = this.trucks.filter(t => t.alive).length;
        const alivePlanes = this.enemies.filter(e => e.alive).length;

        const elScore = document.getElementById('missionScore');
        const elTrucks = document.getElementById('missionTrucks');
        const elPlanes = document.getElementById('missionPlanes');
        const elAmmo = document.getElementById('missionAmmo');
        const elBombs = document.getElementById('missionBombs');
        const elMissiles = document.getElementById('missionMissiles');
        const elWave = document.getElementById('missionWave');

        if (elWave) elWave.textContent = `ONDA ${this.wave}`;
        if (elScore) elScore.textContent = this.score;
        if (elTrucks) elTrucks.textContent = aliveTrucks;
        if (elPlanes) elPlanes.textContent = alivePlanes;
        if (elAmmo) elAmmo.textContent = this.ammo;
        if (elBombs) elBombs.textContent = this.bombs;
        if (elMissiles) elMissiles.textContent = this.missiles;
    }

    showCombatToast(msg) {
        if (typeof this.sim.showWindToast === 'function') {
            this.sim.showWindToast(msg);
        }
    }

    // Desenha os marcadores dos caças inimigos em qualquer câmera.
    updateScreenMarkers(camera) {
        const canvas = document.getElementById('combatOverlayCanvas');
        if (!canvas) return;
        if (!this.enabled || !camera || this.sim.gameOver) {
            canvas.style.display = 'none';
            return;
        }
        canvas.style.display = 'block';
        const w = window.innerWidth;
        const h = window.innerHeight;
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
        }
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, w, h);

        const planePos = this.sim.airplane ? this.sim.airplane.position : null;
        if (!planePos) return;

        ctx.font = '600 11px "Outfit", monospace, sans-serif';
        ctx.textAlign = 'center';

        // Marcadores dos Caças Inimigos (vermelho)
        for (const enemy of this.enemies) {
            if (!enemy.alive) continue;
            const proj = enemy.position.clone().project(camera);
            if (proj.z >= 1) continue; // Atrás da câmera

            const sx = (proj.x + 1) * 0.5 * w;
            const sy = (1 - proj.y) * 0.5 * h;
            if (sx < 15 || sx > w - 15 || sy < 15 || sy > h - 15) continue;

            const dist = Math.round(enemy.position.distanceTo(planePos));
            ctx.strokeStyle = 'rgba(255, 70, 70, 0.9)';
            ctx.fillStyle = 'rgba(255, 90, 90, 0.95)';
            ctx.lineWidth = 1.6;

            // Losango de alvo aéreo
            const r = 11;
            ctx.beginPath();
            ctx.moveTo(sx, sy - r);
            ctx.lineTo(sx + r, sy);
            ctx.lineTo(sx, sy + r);
            ctx.lineTo(sx - r, sy);
            ctx.closePath();
            ctx.stroke();

            ctx.fillText(`CAÇA ${dist}m`, sx, sy - r - 6);
        }

    }

    /**
     * Retorna alvos projetados para o HUD em primeira pessoa (Lock-on + CCIP de bomba).
     */
    getHudOverlayData(camera) {
        if (!this.enabled || !camera) return null;

        const lockedEnemy = this.findBestAirTarget();
        let lockedScreenPos = null;
        let lockedDist = 0;

        if (lockedEnemy) {
            const p = lockedEnemy.position.clone().project(camera);
            if (p.z < 1) {
                lockedScreenPos = {
                    nx: (p.x + 1) * 0.5,
                    ny: (1 - p.y) * 0.5
                };
                lockedDist = Math.round(lockedEnemy.position.distanceTo(this.sim.airplane.position));
            }
        }

        let ccipScreenPos = null;
        if (this.bombs > 0 && !this.sim._isOnGround) {
            const impact = this.predictBombImpactPoint();
            if (impact) {
                const p = impact.clone().project(camera);
                if (p.z < 1 && Math.abs(p.x) <= 1.05 && Math.abs(p.y) <= 1.05) {
                    ccipScreenPos = {
                        nx: (p.x + 1) * 0.5,
                        ny: (1 - p.y) * 0.5
                    };
                }
            }
        }

        return {
            lockedScreenPos,
            lockedDist,
            ccipScreenPos,
            ammo: this.ammo,
            bombs: this.bombs,
            missiles: this.missiles
        };
    }
}
