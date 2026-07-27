import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export default class CityManager {
    constructor(scene, ground, craterManager = null) {
        this.scene = scene;
        this.ground = ground;
        this.craterManager = craterManager;
        this.buildings = []; 
        this.buildingTypes = {
            house: { 
                colors: [0x8b4513, 0xa0522d, 0xcd853f, 0xdeb887, 0x556b2f], 
                scale: [4.5, 2.5, 4.5], 
                count: 1000, 
                health: 100, // 2 tiros
                name: 'Casa' 
            },
            building: { 
                colors: [0x95a5a6, 0x7f8c8d, '#044f10', 0x34495e, '#661032'], 
                scale: [6, 10, 6], 
                heightScaleRange: [0.7, 1.8], 
                count: 400, 
                health: 200, // 4 tiros
                name: 'Prédio' 
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
                name: 'Escola' 
            },
            cityHall: { 
                colors: [0x2980b9, 0x3498db], 
                scale: [7, 5, 7], 
                count: 10, 
                health: 200, // 4 tiros
                name: 'Prefeitura' 
            },
            powerPlant: { 
                colors: [0x2c3e50, 0x34495e], 
                scale: [9, 6, 9], 
                count: 15, 
                health: 300, // 6 tiros
                name: 'Usina' 
            },
            waterPlant: { 
                colors: [0x3498db, 0x2980b9], 
                scale: [9, 3, 9], 
                count: 15, 
                health: 200, // 4 tiros
                name: 'ETA' 
            }
        };
        
        this.targetIndicators = [];
        this.instancedMeshes = {};
        this.init();
    }

    init() {
        Object.entries(this.buildingTypes).forEach(([type, config]) => {
            const geometry = this.createDetailedGeometry(type, config);
            
            const baseMaterial = new THREE.MeshStandardMaterial({ 
                vertexColors: true,
                roughness: 0.8,
                metalness: 0.1
            });

            // Material emissivo para janelas, luzes e letreiros - isso as deixa vivas independentes da iluminação/sombra
            const windowMaterial = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                emissive: 0xffbb44, // Brilho amarelado vivo
                emissiveIntensity: 4.5,
                roughness: 0.2,
                metalness: 0.8
            });
            
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

    _applyVertexColors(geometry, colorHex) {
        const count = geometry.attributes.position.count;
        const colors = new Float32Array(count * 3);
        const color = new THREE.Color(colorHex);
        for (let i = 0; i < count; i++) {
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        return geometry;
    }

    createDetailedGeometry(type, config) {
        const [w, h, d] = config.scale;
        const baseGeometries = [];
        const windowGeometries = [];

        const C_BODY = 0xffffff;
        const C_ROOF = 0x888888;
        const C_DOOR = 0x4a2e0f;
        const C_DETAIL = 0xdddddd;

        const baseGeom = this._applyVertexColors(new THREE.BoxGeometry(w, h, d), C_BODY);
        baseGeometries.push(baseGeom);

        if (type === 'house') {
            const roofH = h * 0.7;
            const roofGeom = this._applyVertexColors(new THREE.ConeGeometry(w * 0.85, roofH, 4), C_ROOF);
            roofGeom.rotateY(Math.PI / 4);
            roofGeom.translate(0, h * 0.5 + roofH * 0.4, 0);
            baseGeometries.push(roofGeom);
            const doorGeom = this._applyVertexColors(new THREE.BoxGeometry(w * 0.25, h * 0.5, 0.1), C_DOOR);
            doorGeom.translate(0, -h * 0.25, d * 0.5);
            baseGeometries.push(doorGeom);
            const winSize = w * 0.2;
            const winGeom = this._applyVertexColors(new THREE.BoxGeometry(winSize, winSize, 0.1), 0xffffff);
            winGeom.translate(w * 0.25, h * 0.1, d * 0.5);
            windowGeometries.push(winGeom);
            const winGeom2 = winGeom.clone();
            winGeom2.translate(-w * 0.5, 0, 0);
            windowGeometries.push(winGeom2);

        } else if (type === 'building') {
            const topGeom = this._applyVertexColors(new THREE.BoxGeometry(w * 0.8, h * 0.05, d * 0.8), C_ROOF);
            topGeom.translate(0, h * 0.52, 0);
            baseGeometries.push(topGeom);
            const antGeom = this._applyVertexColors(new THREE.CylinderGeometry(0.05, 0.05, h * 0.25), C_DETAIL);
            antGeom.translate(w * 0.2, h * 0.6, 0);
            baseGeometries.push(antGeom);
            const winW = w * 0.2;
            const winH = h * 0.06;
            for (let f = 0; f < 5; f++) {
                const y = (f / 5 - 0.35) * h;
                for (let s = 0; s < 2; s++) {
                    const x = (s === 0 ? 0.25 : -0.25) * w;
                    const win = this._applyVertexColors(new THREE.BoxGeometry(winW, winH, 0.1), 0xffffff);
                    win.translate(x, y, d * 0.5);
                    windowGeometries.push(win);
                    const winB = win.clone();
                    winB.translate(0, 0, -d);
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
            
            const win = this._applyVertexColors(new THREE.BoxGeometry(w * 0.8, h * 0.2, 0.1), 0xffffff);
            win.translate(0, -h * 0.2, d * 0.5);
            windowGeometries.push(win);
        } else if (type === 'school') {
            const block1 = this._applyVertexColors(new THREE.BoxGeometry(w * 0.3, h * 0.5, w * 0.3), 0x3498db);
            block1.translate(-w * 0.3, -h * 0.25, d * 0.5);
            baseGeometries.push(block1);
            const block2 = this._applyVertexColors(new THREE.BoxGeometry(w * 0.3, h * 0.8, w * 0.3), 0xe74c3c);
            block2.translate(w * 0.3, -h * 0.1, d * 0.5);
            baseGeometries.push(block2);
            const schoolWin = this._applyVertexColors(new THREE.BoxGeometry(w * 0.8, h * 0.4, 0.1), 0xffffff);
            schoolWin.translate(0, h * 0.2, d * 0.45);
            windowGeometries.push(schoolWin);
        } else if (type === 'cityHall') {
            const tower = this._applyVertexColors(new THREE.BoxGeometry(w * 0.4, h * 1.5, d * 0.4), C_BODY);
            tower.translate(0, h * 0.25, 0);
            baseGeometries.push(tower);
            const clock = this._applyVertexColors(new THREE.BoxGeometry(w * 0.25, w * 0.25, 0.2), 0xffffff);
            clock.translate(0, h * 0.8, d * 0.2);
            windowGeometries.push(clock);
            for (let i = -1; i <= 1; i++) {
                const pillar = this._applyVertexColors(new THREE.CylinderGeometry(0.2, 0.2, h), C_DETAIL);
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
                        house: 1000,
                        building: 400,
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
                                const hVar = THREE.MathUtils.lerp(minHeightScale, maxHeightScale, Math.random());
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
        const mat = new THREE.MeshStandardMaterial({ 
            color: 0x4b535a, 
            roughness: 0.95,
            metalness: 0.02,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1
        });
        const cityExtent = 200;
        const streetInterval = 50; 
        const streetWidth = 5.5;
        
        for (let x = -cityExtent; x <= cityExtent; x += streetInterval) {
            if (Math.abs(x) < 10) continue; // Evita a pista (eixo X central)
            const geom = new THREE.PlaneGeometry(streetWidth, cityExtent * 2);
            const street = new THREE.Mesh(geom, mat);
            street.rotation.x = -Math.PI / 2;
            street.position.set(x, 0.01, 0);
            street.receiveShadow = true;
            this.scene.add(street);
        }

        for (let z = -cityExtent; z <= cityExtent; z += streetInterval) {
            // Se o Z da rua estiver na faixa da pista, e a rua cruzar o X central, evitamos
            // No entanto, as ruas Z cruzam todo o X. Então vamos pular se Z estiver na área da pista.
            if (Math.abs(z) < 50) continue; 
            const geom = new THREE.PlaneGeometry(cityExtent * 2, streetWidth);
            const street = new THREE.Mesh(geom, mat);
            street.rotation.x = -Math.PI / 2;
            street.position.set(0, 0.01, z);
            street.receiveShadow = true;
            this.scene.add(street);
        }
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
