import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export default class CityManager {
    constructor(scene, ground, craterManager = null, runways = []) {
        this.scene = scene;
        this.ground = ground;
        this.craterManager = craterManager;
        this.runways = runways;
        this.buildings = []; 
        this.buildingTypes = {
            house: { 
                colors: [0xe0cdb0, 0xcbbca5, 0xb6c2b3, 0xd5b8a5, 0xc3c9cf],
                scale: [4.5, 2.5, 4.5], 
                count: 1000, 
                health: 100, // 2 tiros
                name: 'House'
            },
            building: { 
                colors: [0xb5c0c7, 0x899aa6, 0xd0cbbd, 0x758996, 0xa9b0ae],
                scale: [6, 10, 6], 
                heightScaleRange: [0.7, 1.8], 
                count: 400, 
                health: 200, // 4 tiros
                name: 'Building'
            },
            health: { 
                colors: [0xffffff, 0xe0e0e0], 
                scale: [6, 4, 6], 
                count: 20, 
                health: 200, // 4 tiros
                name: 'Hospital' 
            },
            school: { 
                colors: [0xf1c40f, 0xf39c12], 
                scale: [8, 3.5, 6], 
                count: 20, 
                health: 200, // 4 tiros
                name: 'School'
            },
            cityHall: { 
                colors: [0x2980b9, 0x3498db], 
                scale: [7, 5, 7], 
                count: 10, 
                health: 200, // 4 tiros
                name: 'City Hall'
            },
            powerPlant: { 
                colors: [0x2c3e50, 0x34495e], 
                scale: [9, 6, 9], 
                count: 15, 
                health: 300, // 6 tiros
                name: 'Power Plant'
            },
            waterPlant: { 
                colors: [0x3498db, 0x2980b9], 
                scale: [9, 3, 9], 
                count: 15, 
                health: 200, // 4 tiros
                name: 'Water Treatment Plant'
            }
        };
        
        this.targetIndicators = [];
        this.instancedMeshes = {};
        this.init();
    }

    init() {
        this.windowMaterials = [];
        Object.entries(this.buildingTypes).forEach(([type, config]) => {
            const geometry = this.createDetailedGeometry(type, config);
            
            const baseMaterial = new THREE.MeshStandardMaterial({ 
                vertexColors: true,
                roughness: 0.9,
                metalness: 0.06
            });

            // Material emissivo para janelas, luzes e letreiros - isso as deixa vivas independentes da iluminação/sombra
            const windowMaterial = new THREE.MeshStandardMaterial({
                color: 0x527086,
                emissive: 0xffd397, // Mantém a iluminação quente das janelas.
                emissiveIntensity: 4.5,
                roughness: 0.32,
                metalness: 0.25
            });
            this.windowMaterials.push(windowMaterial);
            
            const instancedMesh = new THREE.InstancedMesh(geometry, [baseMaterial, windowMaterial], config.count);
            instancedMesh.castShadow = true;
            instancedMesh.receiveShadow = true;
            instancedMesh.frustumCulled = false;
            
            const dummy = new THREE.Object3D();
            dummy.scale.set(0, 0, 0);
            dummy.position.set(0, -1000, 0);
            dummy.updateMatrix();
            for (let i = 0; i < config.count; i++) {
                instancedMesh.setMatrixAt(i, dummy.matrix);
                instancedMesh.setColorAt(i, new THREE.Color(0xffffff));
            }
            
            this.scene.add(instancedMesh);
            this.instancedMeshes[type] = instancedMesh;
        });

        this.generateCity();
        this.createStreets();
    }

    setWindowEmissiveIntensity(intensity) {
        if (this.windowMaterials) {
            this.windowMaterials.forEach(mat => {
                mat.emissiveIntensity = intensity;
            });
        }
    }

    _applyVertexColors(geometry, colorHex) {
        const count = geometry.attributes.position.count;
        const colors = new Float32Array(count * 3);
        const color = new THREE.Color(colorHex);
        geometry.computeBoundingBox();
        const minY = geometry.boundingBox.min.y;
        const height = Math.max(geometry.boundingBox.max.y - minY, 0.01);
        const normals = geometry.attributes.normal;
        const positions = geometry.attributes.position;
        for (let i = 0; i < count; i++) {
            // Acrescenta profundidade às fachadas com a geometria já existente.
            const shade = 0.85 + (positions.getY(i) - minY) / height * 0.12
                + Math.max(0, normals.getY(i)) * 0.03 - Math.max(0, -normals.getZ(i)) * 0.05;
            colors[i * 3] = color.r * shade;
            colors[i * 3 + 1] = color.g * shade;
            colors[i * 3 + 2] = color.b * shade;
        }
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        return geometry;
    }

    createDetailedGeometry(type, config) {
        const [w, h, d] = config.scale;
        const baseGeometries = [];
        const windowGeometries = [];

        const C_BODY = 0xffffff;
        const C_ROOF = type === 'house' ? 0xa97960 : 0x56636c;
        const C_DOOR = 0x3c4650;
        const C_DETAIL = 0xc4cbd0;

        const baseGeom = this._applyVertexColors(new THREE.BoxGeometry(w, h, d), C_BODY);
        baseGeometries.push(baseGeom);

        if (type === 'house') {
            const roofH = h * 0.7;
            const roofGeom = this._applyVertexColors(new THREE.ConeGeometry(w * 0.85, roofH, 4), C_ROOF);
            roofGeom.rotateY(Math.PI / 4);
            roofGeom.translate(0, h * 0.5 + roofH * 0.4, 0);
            baseGeometries.push(roofGeom);
            const doorGeom = this._applyVertexColors(new THREE.PlaneGeometry(w * 0.25, h * 0.5), C_DOOR);
            doorGeom.translate(0, -h * 0.25, d * 0.5 + 0.035);
            baseGeometries.push(doorGeom);
            const winSize = w * 0.2;
            const winGeom = this._applyVertexColors(new THREE.PlaneGeometry(winSize, winSize), 0xffffff);
            winGeom.translate(w * 0.25, h * 0.1, d * 0.5 + 0.04);
            windowGeometries.push(winGeom);
            const winGeom2 = winGeom.clone();
            winGeom2.translate(-w * 0.5, 0, 0);
            windowGeometries.push(winGeom2);

        } else if (type === 'building') {
            const topGeom = this._applyVertexColors(new THREE.BoxGeometry(w * 0.8, h * 0.05, d * 0.8), C_ROOF);
            topGeom.translate(0, h * 0.52, 0);
            baseGeometries.push(topGeom);
            const antGeom = this._applyVertexColors(new THREE.CylinderGeometry(0.05, 0.05, h * 0.25, 6), C_DETAIL);
            antGeom.translate(w * 0.2, h * 0.6, 0);
            baseGeometries.push(antGeom);
            const winW = w * 0.2;
            const winH = h * 0.06;
            for (let f = 0; f < 5; f++) {
                const y = (f / 5 - 0.35) * h;
                for (let s = 0; s < 2; s++) {
                    const x = (s === 0 ? 0.25 : -0.25) * w;
                    const win = this._applyVertexColors(new THREE.PlaneGeometry(winW, winH), 0xffffff);
                    win.translate(x, y, d * 0.5 + 0.04);
                    windowGeometries.push(win);
                    const winB = win.clone();
                    winB.rotateY(Math.PI);
                    windowGeometries.push(winB);
                }
            }
        } else if (type === 'health') {
            const crossH = this._applyVertexColors(new THREE.BoxGeometry(w * 0.5, h * 0.15, 0.2), 0xff0000);
            crossH.translate(0, h * 0.2, d * 0.5);
            baseGeometries.push(crossH);
            const crossV = this._applyVertexColors(new THREE.BoxGeometry(w * 0.15, h * 0.5, 0.2), 0xff0000);
            crossV.translate(0, h * 0.2, d * 0.5);
            baseGeometries.push(crossV);
            
            const win = this._applyVertexColors(new THREE.PlaneGeometry(w * 0.8, h * 0.2), 0xffffff);
            win.translate(0, -h * 0.2, d * 0.5 + 0.04);
            windowGeometries.push(win);
        } else if (type === 'school') {
            const block1 = this._applyVertexColors(new THREE.BoxGeometry(w * 0.3, h * 0.5, w * 0.3), 0x3498db);
            block1.translate(-w * 0.3, -h * 0.25, d * 0.5);
            baseGeometries.push(block1);
            const block2 = this._applyVertexColors(new THREE.BoxGeometry(w * 0.3, h * 0.8, w * 0.3), 0xe74c3c);
            block2.translate(w * 0.3, -h * 0.1, d * 0.5);
            baseGeometries.push(block2);
            const schoolWin = this._applyVertexColors(new THREE.PlaneGeometry(w * 0.8, h * 0.4), 0xffffff);
            schoolWin.translate(0, h * 0.2, d * 0.5 + 0.04);
            windowGeometries.push(schoolWin);
        } else if (type === 'cityHall') {
            const tower = this._applyVertexColors(new THREE.BoxGeometry(w * 0.4, h * 1.5, d * 0.4), C_BODY);
            tower.translate(0, h * 0.25, 0);
            baseGeometries.push(tower);
            const clock = this._applyVertexColors(new THREE.PlaneGeometry(w * 0.25, w * 0.25), 0xffffff);
            clock.translate(0, h * 0.8, d * 0.2 + 0.04);
            windowGeometries.push(clock);
            for (let i = -1; i <= 1; i++) {
                const pillar = this._applyVertexColors(new THREE.CylinderGeometry(0.2, 0.2, h, 8), C_DETAIL);
                pillar.translate(i * w * 0.3, 0, d * 0.5);
                baseGeometries.push(pillar);
            }
        } else if (type === 'powerPlant') {
            const chimney = this._applyVertexColors(new THREE.CylinderGeometry(w * 0.15, w * 0.2, h * 1.5, 8), C_ROOF);
            chimney.translate(w * 0.3, h * 0.5, 0);
            baseGeometries.push(chimney);
            const chimney2 = chimney.clone();
            chimney2.translate(-w * 0.6, 0, 0);
            baseGeometries.push(chimney2);

           
        } else if (type === 'waterPlant') {
            for (let i = -1; i <= 1; i += 2) {
                const tank = this._applyVertexColors(new THREE.CylinderGeometry(w * 0.25, w * 0.25, h * 2, 12), 0x3498db);
                tank.translate(i * w * 0.3, h * 0.5, 0);
                baseGeometries.push(tank);
            }
        }

        const mergedBase = BufferGeometryUtils.mergeGeometries(baseGeometries);
        if (windowGeometries.length > 0) {
            const mergedWindows = BufferGeometryUtils.mergeGeometries(windowGeometries);
            return BufferGeometryUtils.mergeGeometries([mergedBase, mergedWindows], true);
        } else {
            return BufferGeometryUtils.mergeGeometries([mergedBase], true);
        }
    }

    generateCity() {
        const raycaster = new THREE.Raycaster();
        const down = new THREE.Vector3(0, -1, 0);
        const dummy = new THREE.Object3D();
        
        const counts = {};
        Object.keys(this.buildingTypes).forEach(t => counts[t] = 0);

        const gridSize = 10; 
        const cityExtent = 200; 
        const streetWidth = 4;
        const streetInterval = 25; 

        const occupied = new Set();
        const getCoordKey = (x, z) => `${Math.round(x/gridSize)},${Math.round(z/gridSize)}`;

        try {
            for (let x = -cityExtent; x < cityExtent; x += gridSize) {
                for (let z = -cityExtent; z < cityExtent; z += gridSize) {
                    
                    const modX = Math.abs(x % streetInterval);
                    const modZ = Math.abs(z % streetInterval);
                    if (modX < streetWidth || modZ < streetWidth) continue;
                    if (Math.abs(x) < 20 && Math.abs(z) < 100) continue;
                    if (occupied.has(getCoordKey(x, z))) continue;

                    const dist = Math.sqrt(x*x + z*z);
                    const isCentral = dist < 80;

                    let availableTypes = Object.keys(this.buildingTypes).filter(t => counts[t] < this.buildingTypes[t].count);
                    
                    if (isCentral) {
                        availableTypes = availableTypes.filter(t => t !== 'powerPlant' && t !== 'waterPlant');
                    }

                    if (availableTypes.length === 0) continue;

                    const weights = {
                        house: isCentral ? 250 : 1000,
                        building: isCentral ? 850 : 280,
                        powerPlant: 15,
                        waterPlant: 15,
                        health: 20,
                        school: 20,
                        cityHall: 10
                    };

                    let totalWeight = availableTypes.reduce((sum, t) => sum + weights[t], 0);
                    let rand = Math.random() * totalWeight;
                    
                    let type;
                    for (let t of availableTypes) {
                        if (rand < weights[t]) {
                            type = t;
                            break;
                        }
                        rand -= weights[t];
                    }
                    if (!type) type = availableTypes[0];

                    const config = this.buildingTypes[type];
                    if (counts[type] < config.count) {
                        const tilesX = Math.ceil(config.scale[0] / gridSize);
                        const tilesZ = Math.ceil(config.scale[2] / gridSize);
                        
                        let canPlace = true;
                        for(let i=0; i<tilesX; i++) {
                            for(let j=0; j<tilesZ; j++) {
                                if (occupied.has(getCoordKey(x + i*gridSize, z + j*gridSize))) {
                                    canPlace = false; break;
                                }
                            }
                        }

                        if (canPlace) {
                            for(let i=0; i<tilesX; i++) {
                                for(let j=0; j<tilesZ; j++) {
                                    occupied.add(getCoordKey(x + i*gridSize, z + j*gridSize));
                                }
                            }

                            const posX = x + (tilesX - 1) * gridSize * 0.5;
                            const posZ = z + (tilesZ - 1) * gridSize * 0.5;

                            raycaster.set(new THREE.Vector3(posX, 500, posZ), down);
                            const intersects = raycaster.intersectObject(this.ground);

                            if (intersects.length > 0) {
                                const groundY = intersects[0].point.y;
                                const index = counts[type];
                                
                                // Usa uma faixa configurável para variar a altura
                                const [minHeightScale, maxHeightScale] = config.heightScaleRange || [0.9, 1.1];
                                const heightBias = type === 'building' && isCentral ? 0.45 + Math.random() * 0.55 : Math.random();
                                const hVar = THREE.MathUtils.lerp(minHeightScale, maxHeightScale, heightBias);
                                dummy.position.set(posX, groundY + (config.scale[1] * hVar)/2, posZ);
                                dummy.rotation.y = (Math.floor(Math.random() * 4) * Math.PI / 2);
                                dummy.scale.set(1, hVar, 1);
                                dummy.updateMatrix();
                                
                                const mesh = this.instancedMeshes[type];
                                mesh.setMatrixAt(index, dummy.matrix);
                                
                                const color = new THREE.Color(config.colors[Math.floor(Math.random() * config.colors.length)]);
                                color.multiplyScalar(0.9 + Math.random() * 0.2);
                                mesh.setColorAt(index, color);

                                const box = new THREE.Box3().setFromCenterAndSize(
                                    dummy.position,
                                    new THREE.Vector3(config.scale[0], config.scale[1] * hVar, config.scale[2])
                                );

                                this.buildings.push({
                                    type, index, health: config.health, destroyed: false, box, position: dummy.position.clone()
                                });
                                counts[type]++;
                            }
                        }
                    }
                }
            }
        } catch (e) { console.error(e); }

        Object.values(this.instancedMeshes).forEach(m => {
            m.instanceMatrix.needsUpdate = true;
            if (m.instanceColor) m.instanceColor.needsUpdate = true;
            m.computeBoundingSphere();
        });
    }

    checkCollisions(bullets, explosionCallback, onDestroyed, onHit) {
        for (let i = bullets.length - 1; i >= 0; i--) {
            const bullet = bullets[i];
            for (let j = 0; j < this.buildings.length; j++) {
                const b = this.buildings[j];
                if (!b.destroyed && b.box.containsPoint(bullet.position)) {
                    b.health -= 50;
                    if (onHit) onHit(b, bullet);
                    if (explosionCallback) {
                        const size = new THREE.Vector3();
                        b.box.getSize(size);
                        const scale = (size.x + size.y + size.z) / 10;
                        explosionCallback(bullet.position, scale);
                    }
                    if (b.health <= 0) {
                        this.destroyBuilding(b);
                        if (onDestroyed) onDestroyed(b);
                    }
                    return i; 
                }
            }
        }
        return -1;
    }

    destroyBuilding(b) {
        b.destroyed = true;
        const mesh = this.instancedMeshes[b.type];
        const dummy = new THREE.Object3D();
        dummy.scale.set(0, 0, 0);
        dummy.position.set(0, -1000, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(b.index, dummy.matrix);
        mesh.instanceMatrix.needsUpdate = true;
        // criar apenas UMA cratera correspondente ao prédio destruído
        try {
            if (this.craterManager) {
                const size = new THREE.Vector3();
                b.box.getSize(size);
                const radius = Math.max(1, (size.x + size.z + size.y) / 6*1.5);
                this.craterManager.createCrater(b.position, radius);
            }
        } catch (e) {
            console.warn('Erro ao criar cratera ao destruir prédio:', e);
        }
    }

    checkPlaneCollision(playerBoundingBox) {
        for (let i = 0; i < this.buildings.length; i++) {
            const b = this.buildings[i];
            if (!b.destroyed && playerBoundingBox.intersectsBox(b.box)) return b;
        }
        return null;
    }

    createStreets() {
        // Reúne as ruas e calçadas em um único lote, acompanhando o terreno.
        const mat = new THREE.MeshStandardMaterial({ 
            color: 0xffffff,
            vertexColors: true,
            roughness: 0.95,
            metalness: 0.02,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2
        });
        const cityExtent = 200;
        const streetInterval = 50; 
        const positions = [];
        const colors = [];
        const indices = [];
        const raycaster = new THREE.Raycaster();
        const origin = new THREE.Vector3();
        const down = new THREE.Vector3(0, -1, 0);
        const asphalt = new THREE.Color(0x969da3);
        const sidewalk = new THREE.Color(0xb3afa4);
        const stripe = new THREE.Color(0xd8c28a);
        const bands = [[-4, -2.75], [-2.75, -0.09], [-0.09, 0.09], [0.09, 2.75], [2.75, 4]];
        // Reserva a pista e suas margens antes de gerar as ruas e calçadas.
        const runwayZones = this.runways.map(runway => {
            const sin = Math.abs(Math.sin(runway.rotationY));
            const cos = Math.abs(Math.cos(runway.rotationY));
            const halfWidth = runway.width / 2 + 4;
            const halfLength = runway.length / 2 + 8;
            return {
                x: runway.position.x, z: runway.position.z,
                halfX: cos * halfWidth + sin * halfLength,
                halfZ: sin * halfWidth + cos * halfLength
            };
        });
        const addStreet = (fixed, alongZ) => {
            for (let s = 0; s < 100; s++) {
                const from = -cityExtent + s * 4;
                const to = from + 4;
                bands.forEach(([left, right], band) => {
                    const minX = alongZ ? fixed + left : from;
                    const maxX = alongZ ? fixed + right : to;
                    const minZ = alongZ ? from : fixed + left;
                    const maxZ = alongZ ? to : fixed + right;
                    if (runwayZones.some(zone =>
                        minX < zone.x + zone.halfX && maxX > zone.x - zone.halfX &&
                        minZ < zone.z + zone.halfZ && maxZ > zone.z - zone.halfZ
                    )) return;
                    const base = positions.length / 3;
                    const color = band === 0 || band === 4 ? sidewalk : (band === 2 && Math.floor(s / 2) % 2 === 0 ? stripe : asphalt);
                    for (const [offset, distance] of [[left, from], [right, from], [left, to], [right, to]]) {
                        const x = alongZ ? fixed + offset : distance;
                        const z = alongZ ? distance : fixed + offset;
                        raycaster.set(origin.set(x, 500, z), down);
                        const hits = raycaster.intersectObject(this.ground, false);
                        positions.push(x, (hits[0]?.point.y || 0) + (band === 0 || band === 4 ? 0.32 : 0.24), z);
                        color.toArray(colors, colors.length);
                    }
                    if (alongZ) indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
                    else indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
                });
            }
        };
        for (let x = -cityExtent; x <= cityExtent; x += streetInterval) {
            if (Math.abs(x) < 10) continue; // Evita a pista (eixo X central)
            addStreet(x, true);
        }

        for (let z = -cityExtent; z <= cityExtent; z += streetInterval) {
            if (Math.abs(z) < 50) continue; 
            addStreet(z, false);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        const streets = new THREE.Mesh(geometry, mat);
        streets.receiveShadow = true;
        this.scene.add(streets);
        this.streets = streets;
    }

    setTargets() {
        // Reset targets
        this.buildings.forEach(b => b.isTarget = false);
        
        let targetsSet = 0;
        const totalBuildings = this.buildings.length;
        if (totalBuildings === 0) return 0;

        // Categorias desejadas para a missão
        const categories = ['house', 'powerPlant', 'waterPlant', 'building', 'health'];
        const chosenTargets = [];

        categories.forEach(cat => {
            const possible = this.buildings.filter(b => b.type === cat && !b.destroyed);
            if (possible.length > 0) {
                // Escolha puramente aleatória para evitar que fiquem apenas nas bordas
                const bestChoice = possible[Math.floor(Math.random() * possible.length)];
                bestChoice.isTarget = true;
                chosenTargets.push(bestChoice);
                targetsSet++;
            }
        });

        // Se por algum motivo não deu 5, completa com infraestrutura aleatória
        if (targetsSet < 5) {
            const others = this.buildings.filter(b => !b.isTarget && !b.destroyed);
            while (targetsSet < 5 && others.length > 0) {
                const idx = Math.floor(Math.random() * others.length);
                const b = others[idx];
                b.isTarget = true;
                chosenTargets.push(b);
                targetsSet++;
                others.splice(idx, 1);
            }
        }

        return targetsSet;
    }
}
