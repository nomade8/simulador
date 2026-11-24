import * as THREE from 'three';
import {
    createEnemyInstancedPlanes,
    updateEnemyInstance,
    hideEnemyInstance,
    markEnemyInstancesDirty
} from './planeFactory.js?v=1.0.8';

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
        this.maxAmmo = 240;
        this.maxBombs = 8;
        this.maxMissiles = 6;
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

        // Raycaster reutilizável para altura do terreno
        this._raycaster = new THREE.Raycaster();
        this._down = new THREE.Vector3(0, -1, 0);
        this._tempVec = new THREE.Vector3();
        this._tempVec2 = new THREE.Vector3();

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
        this.bullets = [];
        this.enemyBullets = [];
        this.bombProjectiles = [];
        this.missileProjectiles = [];
    }

    getGroundHeightAt(x, z) {
        if (!this.sim.ground) return 0;
        this._raycaster.set(new THREE.Vector3(x, 400, z), this._down);
        const hits = this._raycaster.intersectObject(this.sim.ground, false);
        return hits.length > 0 ? hits[0].point.y : 0;
    }

    /**
     * Constrói uma rodovia cênica contornando completamente a cidade principal (raio > 240m),
     * conectando a base militar/pista sudoeste (-600, -500) até o aeródromo/cidade 2 no nordeste (600, 700).
     */
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

        const segments = 220;
        const roadWidth = 5.2;
        const positions = [];
        const uvs = [];
        const indices = [];

        const stripePositions = [];
        const stripeIndices = [];

        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const pt = this.roadCurve.getPointAt(t);
            pt.y = this.getGroundHeightAt(pt.x, pt.z) + 0.16;

            const tangent = this.roadCurve.getTangentAt(t).setY(0).normalize();
            const side = new THREE.Vector3(-tangent.z, 0, tangent.x);

            const left = pt.clone().addScaledVector(side, -roadWidth * 0.5);
            const right = pt.clone().addScaledVector(side, roadWidth * 0.5);

            positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
            uvs.push(0, t * 50, 1, t * 50);

            // Faixa amarela central dupla
            const sLeft = pt.clone().addScaledVector(side, -0.14);
            const sRight = pt.clone().addScaledVector(side, 0.14);
            sLeft.y += 0.035;
            sRight.y += 0.035;
            stripePositions.push(sLeft.x, sLeft.y, sLeft.z, sRight.x, sRight.y, sRight.z);

            if (i < segments) {
                const base = i * 2;
                indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
                if (i % 2 === 0) {
                    stripeIndices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
                }
            }
        }

        const roadGeom = new THREE.BufferGeometry();
        roadGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        roadGeom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        roadGeom.setIndex(indices);
        roadGeom.computeVertexNormals();

        const roadMat = new THREE.MeshStandardMaterial({
            color: 0x242830,
            roughness: 0.9,
            metalness: 0.05,
            side: THREE.DoubleSide
        });
        const roadMesh = new THREE.Mesh(roadGeom, roadMat);
        roadMesh.receiveShadow = true;
        this.roadGroup.add(roadMesh);

        const stripeGeom = new THREE.BufferGeometry();
        stripeGeom.setAttribute('position', new THREE.Float32BufferAttribute(stripePositions, 3));
        stripeGeom.setIndex(stripeIndices);
        stripeGeom.computeVertexNormals();

        const stripeMat = new THREE.MeshBasicMaterial({
            color: 0xfbc531,
            side: THREE.DoubleSide
        });
        this.roadGroup.add(new THREE.Mesh(stripeGeom, stripeMat));

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

        // Marcador aéreo vermelho/âmbar nítido sobre o caminhão
        const marker = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.45, 0),
            new THREE.MeshBasicMaterial({ color: isAntiAir ? 0xff4757 : 0xffa502, wireframe: true })
        );
        marker.position.set(0, 3.3, 0);
        group.add(marker);

        group.scale.setScalar(1.4);
        this.sim.scene.add(group);
        return { group, marker };
    }

    spawnWave(waveNum) {
        this.wave = waveNum;

        // 1. Spawnar comboio de caminhões na estrada (5 a 7 caminhões)
        const truckCount = Math.min(8, 5 + waveNum);
        for (let i = 0; i < truckCount; i++) {
            const isAA = i % 3 === 1;
            const { group, marker } = this.createTruckMesh(isAA);
            const t = (0.08 + i * 0.065) % 0.9;
            const dir = i < Math.ceil(truckCount / 2) ? 1 : -1;

            const truck = {
                id: `truck_${waveNum}_${i}`,
                mesh: group,
                marker,
                t: dir === 1 ? t : (0.92 - i * 0.04),
                dir,
                speed: 0.008 + Math.random() * 0.003,
                isAntiAir: isAA,
                hp: isAA ? 45 : 30,
                fireCooldown: 2 + Math.random() * 2,
                position: new THREE.Vector3(),
                alive: true
            };
            this.updateTruckTransform(truck, 0);
            this.trucks.push(truck);
        }

        // 2. Spawnar aviões monomotores inimigos voando no espaço aéreo ENTRE a cidade e os aeroportos
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
            const py = Math.max(terrainY + 38, startPt.y + (Math.random() - 0.5) * 10);

            const initialYaw = Math.atan2(nextPt.x - px, nextPt.z - pz);
            // Velocidade de avião monomotor a hélice (~150 a 185 km/h)
            const baseSpeed = 0.088 + Math.random() * 0.018;

            this.enemies.push({
                index: i,
                position: new THREE.Vector3(px, py, pz),
                rotation: new THREE.Euler(0, initialYaw, 0, 'YXZ'),
                yaw: initialYaw,
                pitch: 0,
                roll: 0,
                baseSpeed,
                speed: baseSpeed,
                cruiseAlt: startPt.y,
                hp: 50,
                fireCooldown: 2.0 + Math.random() * 2.0,
                alive: true,
                route,
                waypointIndex: nextWpIdx,
                state: 'patrol', // 'patrol' | 'intercept' | 'break'
                stateTimer: 0,
                breakDir: (i % 2 === 0 ? 1 : -1),
                swayPhase: Math.random() * Math.PI * 2
            });
        }

        this.showCombatToast(`🎯 ONDA ${waveNum}: ${truckCount} Caminhões na Estrada • ${planeCount} Caças Inimigos!`);
        this.updateMissionHUD();
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

        const pos = this.roadCurve.getPointAt(truck.t);
        pos.y = this.getGroundHeightAt(pos.x, pos.z) + 0.14;
        const tangent = this.roadCurve.getTangentAt(truck.t).multiplyScalar(truck.dir);

        truck.position.copy(pos);
        truck.mesh.position.copy(pos);
        truck.mesh.rotation.y = Math.atan2(tangent.x, tangent.z);
        if (truck.marker) {
            truck.marker.rotation.y += dt * 2.5;
        }
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
            // Não disparar se clicar em botões de UI ou se estiver na câmera orbital girando
            if (e.target && e.target.closest('button, input, label, .ap-panel, .tod-hud, .wind-hud-selector')) return;
            if (this.sim.cameraMode === 'orbit') return;

            if (e.button === 0) {
                this.isFiringGun = true;
            } else if (e.button === 2) {
                this.fireMissile();
            }
        });

        window.addEventListener('pointerup', (e) => {
            if (e.button === 0) this.isFiringGun = false;
        });

        window.addEventListener('contextmenu', (e) => {
            if (this.enabled && !this.sim.gameOver && this.sim.cameraMode !== 'orbit') {
                e.preventDefault();
            }
        });
    }

    playWeaponSound(type) {
        try {
            const ctx = this.sim.audioCtx || new (window.AudioContext || window.webkitAudioContext)();
            if (ctx.state === 'suspended') ctx.resume();

            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            if (type === 'gun') {
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(190, now);
                osc.frequency.exponentialRampToValueAtTime(55, now + 0.06);
                gain.gain.setValueAtTime(0.12, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 0.075);
            } else if (type === 'bomb') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(340, now);
                osc.frequency.exponentialRampToValueAtTime(110, now + 0.25);
                gain.gain.setValueAtTime(0.14, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 0.27);
            } else if (type === 'missile') {
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(520, now);
                osc.frequency.exponentialRampToValueAtTime(160, now + 0.35);
                gain.gain.setValueAtTime(0.16, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 0.37);
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

        const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.14, 6, 6),
            new THREE.MeshBasicMaterial({ color: 0xffe066 })
        );
        mesh.position.copy(spawnPos);
        this.sim.scene.add(mesh);

        const planeSpeed = (this.sim.planeState.speed || 0) * 0.028 * 60;
        const vel = forward.multiplyScalar(planeSpeed + 105);

        this.bullets.push({ mesh, position: spawnPos, velocity: vel, life: 2.2 });
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
        const spawnPos = this.sim.airplane.position.clone().addScaledVector(forward, 1.5);

        const missileMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.08, 0.75, 8),
            new THREE.MeshBasicMaterial({ color: 0xff5252 })
        );
        missileMesh.rotation.x = Math.PI / 2;
        missileMesh.position.copy(spawnPos);
        this.sim.scene.add(missileMesh);

        const target = this.findBestAirTarget();
        const planeSpeed = (this.sim.planeState.speed || 0) * 0.028 * 60;

        this.missileProjectiles.push({
            mesh: missileMesh,
            position: spawnPos,
            velocity: forward.clone().multiplyScalar(planeSpeed + 68),
            target,
            life: 4.5
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
            this.showCombatToast('🔄 Munição, Bombas e Mísseis Recarregados na Pista!');
            this.updateMissionHUD();
        }
    }

    update(dt) {
        if (!this.enabled || this.sim.gameOver || this.sim.isReplaying) return;

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

        // 2. Atualizar Aviões Inimigos (Monomotores com voo aerodinâmico realista entre cidade e aeroportos)
        let anyEnemyAlive = false;
        const timeSec = performance.now() * 0.001;
        const playerForward = this.getPlaneForwardDir();

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
            } else if (!this.sim._isOnGround && distToPlayer < 520 && playerDistFromCity > 190) {
                if (distToPlayer < 75) {
                    // Passou perto do jogador: faz curva de break realista para abrir espaço e voltar
                    enemy.state = 'break';
                    enemy.stateTimer = 2.8 + Math.random() * 1.0;
                    enemy.breakDir = Math.random() > 0.5 ? 1 : -1;
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
                // Curva inclinada aberta (~50°) com leve subida para manobra realista de escape/reengajamento
                desiredBank = -enemy.breakDir * 0.92;
                const safeBreakAlt = Math.max(enemy.cruiseAlt + 12, this.getGroundHeightAt(enemy.position.x, enemy.position.z) + 45);
                desiredPitch = THREE.MathUtils.clamp((safeBreakAlt - enemy.position.y) * 0.015 + 0.08, -0.15, 0.24);
            } else {
                if (enemy.state === 'intercept') {
                    // Mira num ponto ligeiramente atrás do jogador (perseguição de cauda realista)
                    targetPos = this._tempVec2.copy(playerPos).addScaledVector(playerForward, -35);
                    targetPos.y = Math.max(targetPos.y + 4, this.getGroundHeightAt(targetPos.x, targetPos.z) + 38);
                } else {
                    // Patrulha de waypoint em waypoint nos corredores entre a cidade e os aeroportos
                    const wp = enemy.route[enemy.waypointIndex];
                    const distToWp = Math.hypot(wp.x - enemy.position.x, wp.z - enemy.position.z);
                    if (distToWp < 65) {
                        enemy.waypointIndex = (enemy.waypointIndex + 1) % enemy.route.length;
                    }
                    const activeWp = enemy.route[enemy.waypointIndex];
                    const wpTerrain = this.getGroundHeightAt(activeWp.x, activeWp.z);
                    targetPos = this._tempVec2.set(
                        activeWp.x,
                        Math.max(wpTerrain + 40, activeWp.y),
                        activeWp.z
                    );
                }

                const dx = targetPos.x - enemy.position.x;
                const dy = targetPos.y - enemy.position.y;
                const dz = targetPos.z - enemy.position.z;
                const horizDist = Math.hypot(dx, dz);
                const desiredYaw = Math.atan2(dx, dz);

                let yawDiff = desiredYaw - enemy.yaw;
                while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
                while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;

                // Bank-to-turn realista: inclina a asa na direção da curva (até ~58°)
                // yawDiff > 0 (virar à esquerda) -> roll negativo (asa esquerda desce)
                const maxBankAngle = 1.02;
                desiredBank = THREE.MathUtils.clamp(-yawDiff * 1.9, -maxBankAngle, maxBankAngle);

                // Pequena ondulação natural de voo em cruzeiro (ar em movimento)
                const airSway = Math.sin(timeSec * 0.9 + enemy.swayPhase) * 0.04;
                desiredBank += airSway;

                // Arfagem suave para buscar altitude + leve cabrada coordenada em curvas acentuadas
                const bankLiftComp = Math.abs(enemy.roll) * 0.06;
                desiredPitch = THREE.MathUtils.clamp(
                    Math.atan2(dy, Math.max(45, horizDist)) + bankLiftComp,
                    -0.25,
                    0.28
                );
            }

            // Antecipação de terreno à frente (evita "teleporte" vertical: o avião puxa o nariz naturalmente antes de colinas)
            const lookAheadDist = 55;
            const aheadX = enemy.position.x + Math.sin(enemy.yaw) * lookAheadDist;
            const aheadZ = enemy.position.z + Math.cos(enemy.yaw) * lookAheadDist;
            const terrainNow = this.getGroundHeightAt(enemy.position.x, enemy.position.z);
            const terrainAhead = this.getGroundHeightAt(aheadX, aheadZ);
            const minClearanceY = Math.max(terrainNow, terrainAhead) + 34;

            if (enemy.position.y < minClearanceY) {
                const climbUrgency = THREE.MathUtils.clamp((minClearanceY - enemy.position.y) * 0.025, 0.12, 0.34);
                desiredPitch = Math.max(desiredPitch, climbUrgency);
            }

            // Inércia aerodinâmica suave de rolagem (Roll) e arfagem (Pitch)
            enemy.roll = THREE.MathUtils.lerp(enemy.roll, desiredBank, 1 - Math.exp(-3.4 * dt));
            enemy.pitch = THREE.MathUtils.lerp(enemy.pitch, desiredPitch, 1 - Math.exp(-2.4 * dt));

            // Curva coordenada: a taxa de guinada (Yaw) vem diretamente da inclinação da asa (tan/sin do roll)
            const turnRate = THREE.MathUtils.clamp(-Math.sin(enemy.roll) * 1.12, -1.0, 1.0);
            enemy.yaw += turnRate * dt;

            // Variação realista de velocidade de monomotor: perde um pouco subindo, ganha descendo
            const targetSpeed = THREE.MathUtils.clamp(
                enemy.baseSpeed - Math.sin(enemy.pitch) * 0.025,
                0.068,
                0.125
            );
            enemy.speed = THREE.MathUtils.lerp(enemy.speed, targetSpeed, 1 - Math.exp(-1.5 * dt));

            // Aplicar rotação YXZ e mover estritamente na direção do nariz (sem deslizar de lado!)
            enemy.rotation.order = 'YXZ';
            enemy.rotation.set(-enemy.pitch, enemy.yaw, enemy.roll, 'YXZ');

            const moveDir = new THREE.Vector3(0, 0, 1).applyEuler(enemy.rotation);
            enemy.position.addScaledVector(moveDir, enemy.speed * 60 * dt);

            // Trava de segurança mínima absoluta apenas para não atravessar o chão
            const hardFloor = terrainNow + 18;
            if (enemy.position.y < hardFloor) {
                enemy.position.y = hardFloor;
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
            b.position.addScaledVector(b.velocity, dt);
            b.mesh.position.copy(b.position);

            let hit = false;
            // Checar colisão com caças
            for (const e of this.enemies) {
                if (e.alive && b.position.distanceTo(e.position) < 3.4) {
                    this.damageEnemyPlane(e, 22);
                    hit = true;
                    break;
                }
            }
            // Checar colisão com caminhões
            if (!hit) {
                for (const t of this.trucks) {
                    if (t.alive && b.position.distanceTo(t.position) < 3.6) {
                        this.damageTruck(t, 16);
                        hit = true;
                        break;
                    }
                }
            }

            if (hit || b.life <= 0 || b.position.y <= this.getGroundHeightAt(b.position.x, b.position.z)) {
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

            if (m.target && m.target.alive) {
                const desired = m.target.position.clone().sub(m.position).normalize().multiplyScalar(85);
                m.velocity.lerp(desired, Math.min(1, dt * 4.5));
            }

            m.position.addScaledVector(m.velocity, dt);
            m.mesh.position.copy(m.position);
            m.mesh.lookAt(m.position.clone().add(m.velocity));
            m.mesh.rotateX(Math.PI / 2);

            let hit = false;
            for (const e of this.enemies) {
                if (e.alive && m.position.distanceTo(e.position) < 4.5) {
                    this.damageEnemyPlane(e, 100);
                    hit = true;
                    break;
                }
            }
            if (!hit) {
                for (const t of this.trucks) {
                    if (t.alive && m.position.distanceTo(t.position) < 4.5) {
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

    /**
     * Desenha marcadores 2D projetados na tela para todos os caças e caminhões inimigos visíveis,
     * funcionando em qualquer câmera (3ª pessoa, 1ª pessoa ou órbita).
     */
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

        // Marcadores dos Caminhões na Estrada (âmbar)
        for (const truck of this.trucks) {
            if (!truck.alive) continue;
            const proj = truck.position.clone().add(new THREE.Vector3(0, 2.2, 0)).project(camera);
            if (proj.z >= 1) continue;

            const sx = (proj.x + 1) * 0.5 * w;
            const sy = (1 - proj.y) * 0.5 * h;
            if (sx < 15 || sx > w - 15 || sy < 15 || sy > h - 15) continue;

            const dist = Math.round(truck.position.distanceTo(planePos));
            if (dist > 480) continue;

            ctx.strokeStyle = truck.isAntiAir ? 'rgba(255, 140, 50, 0.85)' : 'rgba(255, 210, 90, 0.78)';
            ctx.fillStyle = ctx.strokeStyle;
            ctx.lineWidth = 1.3;
            ctx.strokeRect(sx - 7, sy - 7, 14, 14);
            ctx.fillText(`${dist}m`, sx, sy - 11);
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
