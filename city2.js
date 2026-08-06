import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export default class City2Manager {
    constructor(scene, ground, centers = [new THREE.Vector3(600, 0, 700)], craterManager = null) {
        this.scene = scene;
        this.ground = ground;
        this.centers = Array.isArray(centers) ? centers : [centers];
        this.craterManager = craterManager;
        this.buildings = []; 
        this.buildingTypes = {
            house: { 
                colors: [0x3e3e3e, 0x4a4e69, 0x9a8c98, 0xc9ada7], 
                scale: [5, 2.5, 5], 
                count: 50, 
                health: 100,
                name: 'Casa do Aeródromo' 
            },
            building: { 
                colors: [0x1a1a2e, 0x16213e, 0x0f3460, 0x34495e], 
                scale: [8, 12, 8], 
                heightScaleRange: [1.0, 1.4], 
                count: 50, 
                health: 250,
                name: 'Torre de Controle' 
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
                roughness: 0.7,
                metalness: 0.3
            });

            const windowMaterial = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                emissive: 0x00f0ff,
                emissiveIntensity: 5.0,
                roughness: 0.1,
                metalness: 0.9
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
        const C_ROOF = 0x444444;
        const C_DOOR = 0x111111;
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
            const topGeom = this._applyVertexColors(new THREE.BoxGeometry(w * 0.8, h * 0.03, d * 0.8), C_ROOF);
            topGeom.translate(0, h * 0.51, 0);
            baseGeometries.push(topGeom);
            const antGeom = this._applyVertexColors(new THREE.CylinderGeometry(0.1, 0.1, h * 0.4), C_DETAIL);
            antGeom.translate(0, h * 0.7, 0);
            baseGeometries.push(antGeom);
            const winW = w * 0.25;
            const winH = h * 0.05;
            for (let f = 0; f < 6; f++) {
                const y = (f / 6 - 0.35) * h;
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
        
        let houseIndex = 0;
        let buildingIndex = 0;

        // Para cada aeródromo/pista, cria exatamente 6 casas e 1 prédio em volta
        const houseOffsets = [
            { x: -28, z: -35 },
            { x: -28, z: -10 },
            { x: -28, z: 20 },
            { x: 28, z: -35 },
            { x: 28, z: 30 },
            { x: -28, z: 45 }
        ];

        const buildingOffset = { x: 30, z: -5 };

        this.centers.forEach((center) => {
            // 1. Criar 6 Casas
            houseOffsets.forEach((off) => {
                if (houseIndex >= this.buildingTypes.house.count) return;

                const posX = center.x + off.x;
                const posZ = center.z + off.z;

                raycaster.set(new THREE.Vector3(posX, 500, posZ), down);
                const intersects = raycaster.intersectObject(this.ground);

                if (intersects.length > 0) {
                    const groundY = intersects[0].point.y;
                    const config = this.buildingTypes.house;
                    const hVar = 1.0;
                    
                    dummy.position.set(posX, groundY + (config.scale[1] * hVar) / 2, posZ);
                    dummy.rotation.y = off.x < 0 ? Math.PI / 2 : -Math.PI / 2;
                    dummy.scale.set(1, hVar, 1);
                    dummy.updateMatrix();

                    const mesh = this.instancedMeshes.house;
                    mesh.setMatrixAt(houseIndex, dummy.matrix);

                    const color = new THREE.Color(config.colors[Math.floor(Math.random() * config.colors.length)]);
                    mesh.setColorAt(houseIndex, color);

                    const box = new THREE.Box3().setFromCenterAndSize(
                        dummy.position,
                        new THREE.Vector3(config.scale[0], config.scale[1] * hVar, config.scale[2])
                    );

                    this.buildings.push({
                        type: 'house',
                        index: houseIndex,
                        health: config.health,
                        destroyed: false,
                        box,
                        position: dummy.position.clone()
                    });
                    houseIndex++;
                }
            });

            // 2. Criar 1 Prédio (Torre/Terminal)
            if (buildingIndex < this.buildingTypes.building.count) {
                const posX = center.x + buildingOffset.x;
                const posZ = center.z + buildingOffset.z;

                raycaster.set(new THREE.Vector3(posX, 500, posZ), down);
                const intersects = raycaster.intersectObject(this.ground);

                if (intersects.length > 0) {
                    const groundY = intersects[0].point.y;
                    const config = this.buildingTypes.building;
                    const hVar = 1.2;

                    dummy.position.set(posX, groundY + (config.scale[1] * hVar) / 2, posZ);
                    dummy.rotation.y = -Math.PI / 2;
                    dummy.scale.set(1, hVar, 1);
                    dummy.updateMatrix();

                    const mesh = this.instancedMeshes.building;
                    mesh.setMatrixAt(buildingIndex, dummy.matrix);

                    const color = new THREE.Color(config.colors[Math.floor(Math.random() * config.colors.length)]);
                    mesh.setColorAt(buildingIndex, color);

                    const box = new THREE.Box3().setFromCenterAndSize(
                        dummy.position,
                        new THREE.Vector3(config.scale[0], config.scale[1] * hVar, config.scale[2])
                    );

                    this.buildings.push({
                        type: 'building',
                        index: buildingIndex,
                        health: config.health,
                        destroyed: false,
                        box,
                        position: dummy.position.clone()
                    });
                    buildingIndex++;
                }
            }
        });

        Object.values(this.instancedMeshes).forEach(m => {
            m.instanceMatrix.needsUpdate = true;
            if (m.instanceColor) m.instanceColor.needsUpdate = true;
            m.computeBoundingSphere();
        });
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
        
        try {
            if (this.craterManager) {
                const size = new THREE.Vector3();
                b.box.getSize(size);
                const radius = Math.max(1, (size.x + size.z + size.y) / 6 * 1.5);
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
            color: 0x2b2e34, 
            roughness: 0.95,
            metalness: 0.05,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1
        });
        
        
    }
}

