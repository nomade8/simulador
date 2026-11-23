import * as THREE from 'three';

export const PLANE_SCALE = 0.35;

const _tempMatrix = new THREE.Matrix4();
const _hideMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

export function getPlanePartDefinitions(includeLandingGear = true) {
    const wingMaterial = new THREE.MeshStandardMaterial({
        color: '#fcfcfc',
        roughness: 1,
        metalness: 0
    });
    const tailFinMaterial = new THREE.MeshPhongMaterial({
        color: '#fcfcfc',
        flatShading: true
    });
    const wheelMaterial = new THREE.MeshPhongMaterial({ color: 0x333333, flatShading: true });
    const strutMaterial = new THREE.MeshPhongMaterial({ color: 0x777777, flatShading: true });

    const parts = [];

    const addPart = (name, geometry, material, transform = {}) => {
        const local = new THREE.Object3D();
        if (transform.position) local.position.copy(transform.position);
        if (transform.rotation) {
            if (transform.rotation.x !== undefined) local.rotation.x = transform.rotation.x;
            if (transform.rotation.y !== undefined) local.rotation.y = transform.rotation.y;
            if (transform.rotation.z !== undefined) local.rotation.z = transform.rotation.z;
        }
        if (transform.scale) local.scale.copy(transform.scale);
        local.updateMatrix();

        parts.push({
            name,
            geometry,
            material,
            localMatrix: local.matrix.clone(),
            castShadow: transform.castShadow !== false
        });
    };

    const fuselageGeometry = new THREE.CapsuleGeometry(0.5, 3, 4, 8);
    addPart(
        'fuselage',
        fuselageGeometry,
        new THREE.MeshPhongMaterial({ color: '#0e036b', flatShading: true }),
        { rotation: { x: Math.PI / 2 } }
    );

    addPart(
        'wings',
        new THREE.CylinderGeometry(1, 1, 1.5, 32),
        wingMaterial,
        {
            position: new THREE.Vector3(0, 0.01, 0),
            scale: new THREE.Vector3(3.28678, 0.081655, 0.8)
        }
    );

    addPart(
        'tailFin',
        new THREE.BoxGeometry(0.1, 1, 1),
        tailFinMaterial,
        { position: new THREE.Vector3(0, 0.75, -1.5) }
    );

    addPart(
        'tailPlane',
        new THREE.BoxGeometry(2.3, 0.1, 0.8),
        wingMaterial,
        { position: new THREE.Vector3(0, 0, -1.6) }
    );

    if (includeLandingGear) {
        const rearWheelGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.15, 16);
        addPart(
            'rearWheel',
            rearWheelGeometry,
            wheelMaterial,
            {
                position: new THREE.Vector3(0, -0.7, -1.8),
                rotation: { z: Math.PI / 2 }
            }
        );

        addPart(
            'rearStrut',
            new THREE.CylinderGeometry(0.05, 0.05, 0.2, 8),
            strutMaterial,
            { position: new THREE.Vector3(0, -0.6, -1.8) }
        );

        const frontWheelGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16);
        const frontStrutGeometry = new THREE.CylinderGeometry(0.06, 0.06, 0.6, 8);
        const frontWheelOffset = 2.0;

        addPart(
            'frontWheelLeft',
            frontWheelGeometry,
            wheelMaterial,
            {
                position: new THREE.Vector3(-frontWheelOffset, -0.6, 0.5),
                rotation: { z: Math.PI / 2 }
            }
        );
        addPart(
            'frontStrutLeft',
            frontStrutGeometry,
            strutMaterial,
            { position: new THREE.Vector3(-frontWheelOffset, -0.3, 0.5) }
        );
        addPart(
            'frontWheelRight',
            frontWheelGeometry.clone(),
            wheelMaterial,
            {
                position: new THREE.Vector3(frontWheelOffset, -0.6, 0.5),
                rotation: { z: Math.PI / 2 }
            }
        );
        addPart(
            'frontStrutRight',
            frontStrutGeometry.clone(),
            strutMaterial,
            { position: new THREE.Vector3(frontWheelOffset, -0.3, 0.5) }
        );
    }

    return parts;
}

/**
 * Textura procedural da fuselagem preservando a identidade visual clássica do avião:
 * corpo azul-marinho profundo (#0e036b), barriga branca limpa, filete vermelho/prata
 * e fileira sutil de janelas de cabine nas laterais.
 *
 * Mapeamento UV do LatheGeometry com rotateX(+PI/2):
 * - U = 0.0 / 1.0 -> parte inferior (barriga)
 * - U = 0.25 -> lateral +X
 * - U = 0.50 -> parte superior (dorso)
 * - U = 0.75 -> lateral -X
 * - Canvas Y = 0 (V = 1) -> bico (+Z)
 * - Canvas Y = H (V = 0) -> cauda (-Z)
 */
function createFuselageTexture(fuselageColor = '#0e036b') {
    const W = 1024;
    const H = 512;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // 1. Corpo azul profundo característico do avião original
    ctx.fillStyle = fuselageColor;
    ctx.fillRect(0, 0, W, H);

    // 2. Barriga branca limpa (u próximo de 0 e 1)
    ctx.fillStyle = '#f0f3f6';
    ctx.fillRect(0, 0, W * 0.19, H);
    ctx.fillRect(W * 0.81, 0, W * 0.19, H);

    // 3. Faixa divisória fina (vermelho coral + prata) entre o azul e o branco
    ctx.fillStyle = '#ff5252';
    ctx.fillRect(W * 0.19, 0, 8, H);
    ctx.fillRect(W * 0.81 - 8, 0, 8, H);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.fillRect(W * 0.19 + 10, 0, 3, H);
    ctx.fillRect(W * 0.81 - 13, 0, 3, H);

    // 4. Linhas sutis de acabamento / painéis
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let y = 75; y < H - 45; y += 48) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
    }

    // 5. Fileira de janelas da cabine nas laterais
    const sideCenters = [W * 0.295, W * 0.705];
    const winStartY = H * 0.27;
    const winEndY = H * 0.71;
    const numWindows = 14;
    const stepY = (winEndY - winStartY) / numWindows;

    sideCenters.forEach((cx) => {
        for (let i = 0; i < numWindows; i++) {
            const wy = winStartY + i * stepY;

            // Moldura clara sutil
            ctx.fillStyle = 'rgba(220, 235, 255, 0.45)';
            ctx.beginPath();
            ctx.roundRect(cx - 8, wy - 4.5, 16, 9, 3.5);
            ctx.fill();

            // Vidro escuro refletivo
            ctx.fillStyle = '#091826';
            ctx.beginPath();
            ctx.roundRect(cx - 6.5, wy - 3.3, 13, 6.6, 2.5);
            ctx.fill();

            // Reflexo azulado discreto
            ctx.fillStyle = 'rgba(135, 210, 255, 0.32)';
            ctx.fillRect(cx - 4, wy - 1.8, 3.5, 3.2);
        }
    });

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
}

export function createPlayerPlane(scene, fuselageColor = '#0e036b') {
    const airplane = new THREE.Group();

    // --- MATERIAIS DE ALTA QUALIDADE (PALETA CLÁSSICA APRIMORADA) ---
    const fuselageTexture = createFuselageTexture(fuselageColor);
    const fuselageBodyMat = new THREE.MeshStandardMaterial({
        map: fuselageTexture,
        roughness: 0.22,
        metalness: 0.42
    });

    const fuselageMat = new THREE.MeshStandardMaterial({
        color: fuselageColor,
        roughness: 0.22,
        metalness: 0.48
    });

    const bellyMat = new THREE.MeshStandardMaterial({
        color: 0xf0f3f6,
        roughness: 0.3,
        metalness: 0.2
    });

    const cockpitMat = new THREE.MeshStandardMaterial({
        color: 0x0b1d26,
        roughness: 0.08,
        metalness: 0.94
    });

    const wingMat = new THREE.MeshStandardMaterial({
        color: 0xfdfdfd,
        roughness: 0.26,
        metalness: 0.14
    });

    const leadingEdgeMat = new THREE.MeshStandardMaterial({
        color: 0xd6dee8,
        roughness: 0.2,
        metalness: 0.68
    });

    const controlSurfaceMat = new THREE.MeshStandardMaterial({
        color: 0xd9e1e8,
        roughness: 0.32,
        metalness: 0.26
    });

    const accentMat = new THREE.MeshStandardMaterial({
        color: 0xff5252,
        roughness: 0.28,
        metalness: 0.36
    });

    const engineHousingMat = new THREE.MeshStandardMaterial({
        color: '#191cd1',
        roughness: 0.32,
        metalness: 0.55
    });

    const chromeMat = new THREE.MeshStandardMaterial({
        color: 0xe5ecf4,
        roughness: 0.14,
        metalness: 0.9
    });

    const engineIntakeMat = new THREE.MeshStandardMaterial({
        color: 0x111418,
        roughness: 0.7,
        metalness: 0.85
    });

    const turbineFanMat = new THREE.MeshStandardMaterial({
        color: 0xb8c2cc,
        roughness: 0.25,
        metalness: 0.88
    });

    const exhaustMetalMat = new THREE.MeshStandardMaterial({
        color: 0x3b424d,
        roughness: 0.35,
        metalness: 0.86
    });

    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1e2024, roughness: 0.88 });
    const hubMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.25, metalness: 0.8 });
    const strutMat = new THREE.MeshStandardMaterial({ color: 0x8a97a6, roughness: 0.22, metalness: 0.82 });

    const lightRedMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    const lightGreenMat = new THREE.MeshBasicMaterial({ color: 0x00ff55 });
    const lightWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    // --- 1. FUSELAGEM ESCULPIDA (CONTÍNUA E SUAVE, SEM EMENDAS BRUSCAS) ---
    const fuselageGroup = new THREE.Group();

    const fuselageProfile = [
        new THREE.Vector2(0.03, -2.85),
        new THREE.Vector2(0.14, -2.55),
        new THREE.Vector2(0.28, -2.12),
        new THREE.Vector2(0.42, -1.62),
        new THREE.Vector2(0.50, -1.10),
        new THREE.Vector2(0.55, -0.35),
        new THREE.Vector2(0.56, 0.55),
        new THREE.Vector2(0.55, 1.25),
        new THREE.Vector2(0.49, 1.72),
        new THREE.Vector2(0.38, 2.10),
        new THREE.Vector2(0.24, 2.38),
        new THREE.Vector2(0.10, 2.54),
        new THREE.Vector2(0.00, 2.60)
    ];

    const bodyGeom = new THREE.LatheGeometry(fuselageProfile, 36);
    bodyGeom.rotateX(Math.PI / 2);

    // Elevação sutil no cone de cauda para silhueta mais elegante
    const posAttr = bodyGeom.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
        const z = posAttr.getZ(i);
        if (z < -1.1) {
            const t = THREE.MathUtils.clamp((-1.1 - z) / 1.75, 0, 1);
            posAttr.setY(i, posAttr.getY(i) + t * t * 0.16);
        }
    }
    bodyGeom.computeVertexNormals();

    const bodyMesh = new THREE.Mesh(bodyGeom, fuselageBodyMat);
    bodyMesh.castShadow = true;
    fuselageGroup.add(bodyMesh);

    // Carenagem inferior de raiz da asa (Wing-to-body fairing branca)
    const fairingGeom = new THREE.CapsuleGeometry(0.40, 1.35, 8, 16);
    fairingGeom.rotateX(Math.PI / 2);
    fairingGeom.scale(1.15, 0.42, 1.0);
    const fairingMesh = new THREE.Mesh(fairingGeom, bellyMat);
    fairingMesh.position.set(0, -0.34, 0.08);
    fuselageGroup.add(fairingMesh);

    // Cabine do Piloto / Canopy envolvente estilizado (fiel ao original, mais polido)
    const cockpitGeom = new THREE.SphereGeometry(0.47, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.46);
    cockpitGeom.scale(0.86, 0.62, 1.65);
    const cockpitMesh = new THREE.Mesh(cockpitGeom, cockpitMat);
    cockpitMesh.position.set(0, 0.31, 1.08);
    cockpitMesh.rotation.x = 0.08;
    fuselageGroup.add(cockpitMesh);

    // Antena dorsal e faróis anti-colisão piscantes
    const antennaMesh = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.15, 0.14), bellyMat);
    antennaMesh.position.set(0, 0.60, -0.35);
    antennaMesh.rotation.x = -0.35;
    fuselageGroup.add(antennaMesh);

    const topBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), lightRedMat);
    topBeacon.position.set(0, 0.57, 0.20);
    fuselageGroup.add(topBeacon);

    const bottomBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), lightRedMat);
    bottomBeacon.position.set(0, -0.52, -0.25);
    fuselageGroup.add(bottomBeacon);

    airplane.add(fuselageGroup);

    // --- 2. ASAS PRINCIPAIS ENFLECHADAS PARA TRÁS (-Z) COM SUPERFÍCIES MÓVEIS ENCAIXADAS ---
    // Nota de eixo: ExtrudeGeometry com rotateX(+PI/2) mapeia shape.x -> X e shape.y -> +Z.
    // Portanto, +Y no Shape = FRENTE (+Z) e -Y no Shape = TRÁS (-Z).
    const wingGroup = new THREE.Group();
    const strobeLights = [];

    let leftFlapPivot = null;
    let rightFlapPivot = null;
    let leftAileronPivot = null;
    let rightAileronPivot = null;

    const flapGeom = new THREE.BoxGeometry(1.75, 0.048, 0.30);
    const aileronGeom = new THREE.BoxGeometry(1.85, 0.045, 0.26);

    for (const side of [-1, 1]) {
        const halfWingGroup = new THREE.Group();
        halfWingGroup.position.set(0, -0.02, 0.0);
        halfWingGroup.rotation.z = side * 0.042; // Diedro suave para cima (~2.4°)

        // Perfil da asa: bordo de ataque recua da raiz (+0.72) até a ponta (+0.02),
        // e bordo de fuga fica reto em z = -0.44 para encaixe perfeito dos flaps e ailerons!
        const wingShape = new THREE.Shape();
        wingShape.moveTo(side * 0.35, 0.72);   // Raiz bordo de ataque (frente +Z)
        wingShape.lineTo(side * 4.55, 0.02);   // Ponta bordo de ataque (enflechada para trás!)
        wingShape.lineTo(side * 4.55, -0.44);  // Ponta bordo de fuga (-Z)
        wingShape.lineTo(side * 0.35, -0.44);  // Raiz bordo de fuga (-Z)
        wingShape.closePath();

        const wingGeom = new THREE.ExtrudeGeometry(wingShape, {
            depth: 0.048,
            bevelEnabled: true,
            bevelThickness: 0.024,
            bevelSize: 0.032,
            bevelSegments: 3
        });
        // Centralizar espessura em Y = 0 após rotateX(+PI/2)
        wingGeom.translate(0, 0, -0.024);
        wingGeom.rotateX(Math.PI / 2);

        const wingMesh = new THREE.Mesh(wingGeom, wingMat);
        wingMesh.castShadow = true;
        halfWingGroup.add(wingMesh);

        // Friso metálico no bordo de ataque (acompanhando exatamente a linha da raiz à ponta)
        const dx = 4.55 - 0.35;
        const dz = 0.02 - 0.72;
        const leLength = Math.hypot(dx, dz);
        const leGeom = new THREE.CylinderGeometry(0.028, 0.020, leLength, 10);
        leGeom.rotateZ(Math.PI / 2);
        const leMesh = new THREE.Mesh(leGeom, leadingEdgeMat);
        leMesh.position.set(side * (0.35 + 4.55) * 0.5, 0, (0.72 + 0.02) * 0.5 + 0.015);
        leMesh.rotation.y = side * Math.atan2(-dz, dx);
        halfWingGroup.add(leMesh);

        // Winglet vermelho aerodinâmico na ponta da asa (fiel ao original, agora enflechado)
        const wShape = new THREE.Shape();
        wShape.moveTo(0.0, 0.0);    // Base frontal (+Z = 0.02)
        wShape.lineTo(0.46, 0.0);   // Base traseira (-Z = -0.44)
        wShape.lineTo(0.62, 0.52);  // Topo traseiro enflechado para trás
        wShape.lineTo(0.32, 0.52);  // Topo frontal
        wShape.closePath();

        const wingletGeom = new THREE.ExtrudeGeometry(wShape, {
            depth: 0.036,
            bevelEnabled: true,
            bevelThickness: 0.012,
            bevelSize: 0.012,
            bevelSegments: 2
        });
        wingletGeom.translate(0, 0, -0.018);
        wingletGeom.rotateY(Math.PI / 2); // +X do shape -> -Z (para trás!)

        const wingletMesh = new THREE.Mesh(wingletGeom, accentMat);
        wingletMesh.position.set(side * 4.55, 0.0, 0.02);
        wingletMesh.rotation.z = side * -0.20;
        wingletMesh.castShadow = true;
        halfWingGroup.add(wingletMesh);

        // Carenagens de trilho de flap (Flap Track Fairings) coladas sob a asa
        [1.15, 2.05, 3.10].forEach((fx) => {
            const pod = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.28, 6, 8), bellyMat);
            pod.rotation.x = Math.PI / 2;
            pod.position.set(side * fx, -0.055, -0.34);
            halfWingGroup.add(pod);
        });

        // Luz de navegação (Esquerda: Vermelha, Direita: Verde) na ponta do winglet
        const navLight = new THREE.Mesh(
            new THREE.SphereGeometry(0.05, 8, 8),
            side === -1 ? lightRedMat : lightGreenMat
        );
        navLight.position.set(side * 4.65, 0.51, -0.42);
        halfWingGroup.add(navLight);

        // Strobe branco piscante na ponta traseira da asa
        const strobeLight = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), lightWhiteMat);
        strobeLight.position.set(side * 4.58, 0.0, -0.44);
        halfWingGroup.add(strobeLight);
        strobeLights.push(strobeLight);

        // --- FLAP E AILERON DENTRO DO GRUPO DA ASA (ENCAIXE 100% COLADO EM Z = -0.44) ---
        const flapPivot = new THREE.Group();
        flapPivot.position.set(side * 1.48, 0.0, -0.44);
        const flapMesh = new THREE.Mesh(flapGeom, controlSurfaceMat);
        flapMesh.position.set(0, 0, -0.15);
        flapMesh.castShadow = true;
        flapPivot.add(flapMesh);
        halfWingGroup.add(flapPivot);

        const aileronPivot = new THREE.Group();
        aileronPivot.position.set(side * 3.42, 0.0, -0.44);
        const aileronMesh = new THREE.Mesh(aileronGeom, controlSurfaceMat);
        aileronMesh.position.set(0, 0, -0.13);
        aileronMesh.castShadow = true;
        aileronPivot.add(aileronMesh);
        halfWingGroup.add(aileronPivot);

        if (side === -1) {
            leftFlapPivot = flapPivot;
            leftAileronPivot = aileronPivot;
        } else {
            rightFlapPivot = flapPivot;
            rightAileronPivot = aileronPivot;
        }

        wingGroup.add(halfWingGroup);
    }
    airplane.add(wingGroup);

    // --- 3. CAUDA ENFLECHADA PARA TRÁS (-Z) COM LEME E PROFUNDOR COLADOS ---
    // Deriva Vertical (Estabilizador Vertical azul-marinho enflechado para trás)
    const finShape = new THREE.Shape();
    finShape.moveTo(0.0, 0.0);     // Raiz frontal (z = -1.28)
    finShape.lineTo(0.32, 0.14);   // Fillet dorsal suave
    finShape.lineTo(0.92, 1.38);   // Topo frontal (enflechado para trás)
    finShape.lineTo(1.26, 1.38);   // Topo traseiro
    finShape.lineTo(1.26, 0.0);    // Base traseira vertical em z = -2.54
    finShape.closePath();

    const finGeom = new THREE.ExtrudeGeometry(finShape, {
        depth: 0.06,
        bevelEnabled: true,
        bevelThickness: 0.022,
        bevelSize: 0.022,
        bevelSegments: 2
    });
    finGeom.translate(0, 0, -0.03);
    finGeom.rotateY(Math.PI / 2); // +X do shape -> -Z (para trás!)

    const tailFinMesh = new THREE.Mesh(finGeom, fuselageMat);
    tailFinMesh.position.set(0, 0.28, -1.28);
    tailFinMesh.castShadow = true;
    airplane.add(tailFinMesh);

    // Leme de Direção Móvel (Rudder vermelho colado na borda traseira vertical em z = -2.54)
    const rudderPivot = new THREE.Group();
    rudderPivot.position.set(0, 0.96, -2.54);
    const rudderGeom = new THREE.BoxGeometry(0.07, 1.32, 0.34);
    const rudderMesh = new THREE.Mesh(rudderGeom, accentMat);
    rudderMesh.position.set(0, 0, -0.17);
    rudderMesh.castShadow = true;
    rudderPivot.add(rudderMesh);
    airplane.add(rudderPivot);

    // Estabilizadores Horizontais (Tail plane branco enflechado para trás, borda traseira reta)
    for (const side of [-1, 1]) {
        const hShape = new THREE.Shape();
        hShape.moveTo(side * 0.14, 0.34);   // Raiz frontal (+Z)
        hShape.lineTo(side * 1.62, -0.02);  // Ponta frontal (enflechada para trás!)
        hShape.lineTo(side * 1.62, -0.30);  // Ponta traseira (-Z)
        hShape.lineTo(side * 0.14, -0.30);  // Raiz traseira (-Z)
        hShape.closePath();

        const hGeom = new THREE.ExtrudeGeometry(hShape, {
            depth: 0.036,
            bevelEnabled: true,
            bevelThickness: 0.016,
            bevelSize: 0.018,
            bevelSegments: 2
        });
        hGeom.translate(0, 0, -0.018);
        hGeom.rotateX(Math.PI / 2);

        const hMesh = new THREE.Mesh(hGeom, wingMat);
        hMesh.position.set(0, 0.24, -2.02);
        hMesh.castShadow = true;
        airplane.add(hMesh);
    }

    // Profundor Móvel (Elevator colado exatamente na borda traseira em z = -2.02 - 0.30 = -2.32)
    const elevatorPivot = new THREE.Group();
    elevatorPivot.position.set(0, 0.24, -2.32);
    const elevatorGeom = new THREE.BoxGeometry(3.08, 0.044, 0.28);
    const elevatorMesh = new THREE.Mesh(elevatorGeom, controlSurfaceMat);
    elevatorMesh.position.set(0, 0, -0.14);
    elevatorMesh.castShadow = true;
    elevatorPivot.add(elevatorMesh);
    airplane.add(elevatorPivot);

    // --- 4. MOTORES TURBOFAN SOB AS ASAS COM FAN GIRATÓRIO E EXAUSTÃO ---
    const exhaustGlows = [];
    const fanRotors = [];

    const nacelleProfile = [
        new THREE.Vector2(0.21, -0.58),
        new THREE.Vector2(0.27, -0.40),
        new THREE.Vector2(0.32, -0.08),
        new THREE.Vector2(0.33, 0.26),
        new THREE.Vector2(0.31, 0.50),
        new THREE.Vector2(0.27, 0.58),
        new THREE.Vector2(0.24, 0.52)
    ];
    const nacelleGeom = new THREE.LatheGeometry(nacelleProfile, 28);
    nacelleGeom.rotateX(Math.PI / 2);

    for (const side of [-1, 1]) {
        const engineGroup = new THREE.Group();
        engineGroup.position.set(side * 1.75, -0.34, 0.26);

        // Carenagem azul vibrante da turbina (fiel ao original, agora esculpida)
        const nacelleMesh = new THREE.Mesh(nacelleGeom, engineHousingMat);
        nacelleMesh.castShadow = true;
        engineGroup.add(nacelleMesh);

        // Anel metálico cromado na entrada de ar
        const inletLip = new THREE.Mesh(new THREE.TorusGeometry(0.285, 0.036, 12, 24), chromeMat);
        inletLip.position.set(0, 0, 0.54);
        engineGroup.add(inletLip);

        // Fundo escuro do duto de admissão
        const intakeBack = new THREE.Mesh(new THREE.CircleGeometry(0.26, 20), engineIntakeMat);
        intakeBack.position.set(0, 0, 0.30);
        engineGroup.add(intakeBack);

        // Rotor do Fan (12 pás metálicas + spinner cone que giram com a potência)
        const fanRotor = new THREE.Group();
        fanRotor.position.set(0, 0, 0.40);

        const fanCone = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.22, 14), turbineFanMat);
        fanCone.rotateX(Math.PI / 2);
        fanCone.position.set(0, 0, 0.07);
        fanRotor.add(fanCone);

        const bladeGeom = new THREE.BoxGeometry(0.045, 0.22, 0.012);
        for (let b = 0; b < 12; b++) {
            const angle = (b / 12) * Math.PI * 2;
            const blade = new THREE.Mesh(bladeGeom, turbineFanMat);
            blade.position.set(Math.cos(angle) * 0.13, Math.sin(angle) * 0.13, 0);
            blade.rotation.z = angle + Math.PI / 2;
            blade.rotation.y = 0.42;
            fanRotor.add(blade);
        }
        engineGroup.add(fanRotor);
        fanRotors.push(fanRotor);

        // Bocal metálico interno de exaustão
        const coreNozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.20, 0.22, 18), exhaustMetalMat);
        coreNozzle.rotateX(Math.PI / 2);
        coreNozzle.position.set(0, 0, -0.64);
        engineGroup.add(coreNozzle);

        const exhaustPlug = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.22, 12), exhaustMetalMat);
        exhaustPlug.rotateX(-Math.PI / 2);
        exhaustPlug.position.set(0, 0, -0.78);
        engineGroup.add(exhaustPlug);

        // Pylon conectando firmemente a turbina à parte inferior da asa
        const pylonGeom = new THREE.BoxGeometry(0.08, 0.38, 0.78);
        const pylonMesh = new THREE.Mesh(pylonGeom, strutMat);
        pylonMesh.position.set(0, 0.24, -0.14);
        engineGroup.add(pylonMesh);

        // Combustão / Brilho de Exaustão proporcional à potência (N1)
        const exhaustGroup = new THREE.Group();
        exhaustGroup.position.set(0, 0, -0.72);

        const flameGeom = new THREE.ConeGeometry(0.18, 0.58, 12);
        flameGeom.rotateX(-Math.PI / 2);
        flameGeom.translate(0, 0, -0.29);
        const flameMat = new THREE.MeshBasicMaterial({
            color: 0xff8822,
            transparent: true,
            opacity: 0.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        exhaustGroup.add(new THREE.Mesh(flameGeom, flameMat));

        const coreGeom = new THREE.ConeGeometry(0.095, 0.32, 10);
        coreGeom.rotateX(-Math.PI / 2);
        coreGeom.translate(0, 0, -0.16);
        const coreMat = new THREE.MeshBasicMaterial({
            color: 0xfff0aa,
            transparent: true,
            opacity: 0.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        exhaustGroup.add(new THREE.Mesh(coreGeom, coreMat));

        exhaustGroup.visible = false;
        engineGroup.add(exhaustGroup);
        exhaustGlows.push({ group: exhaustGroup, flameMat, coreMat });

        airplane.add(engineGroup);
    }

    // --- 5. TREM DE POUSO DETALHADO COM SUPORTE A RECOLHIMENTO (TECLA G) ---
    const createDetailedWheel = (radius, width) => {
        const wheelGroup = new THREE.Group();
        const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 18), wheelMat);
        tire.rotation.z = Math.PI / 2;
        tire.castShadow = true;
        wheelGroup.add(tire);

        const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, width + 0.012, 14), hubMat);
        rim.rotation.z = Math.PI / 2;
        wheelGroup.add(rim);
        return wheelGroup;
    };

    // Pivô Trem Dianteiro (base dos pneus em y ≈ -1.00 local)
    const noseGearPivot = new THREE.Group();
    noseGearPivot.position.set(0, -0.275, 1.45);

    const noseUpperStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.036, 0.34, 12), strutMat);
    noseUpperStrut.position.set(0, -0.17, 0);
    noseGearPivot.add(noseUpperStrut);

    const noseOleo = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.24, 10), chromeMat);
    noseOleo.position.set(0, -0.43, 0);
    noseGearPivot.add(noseOleo);

    const noseBrace = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.36, 8), strutMat);
    noseBrace.position.set(0, -0.20, -0.11);
    noseBrace.rotation.x = 0.52;
    noseGearPivot.add(noseBrace);

    const landingLight = new THREE.Mesh(new THREE.SphereGeometry(0.034, 8, 8), lightWhiteMat);
    landingLight.position.set(0, -0.32, 0.052);
    noseGearPivot.add(landingLight);

    [-0.06, 0.06].forEach((wx) => {
        const w = createDetailedWheel(0.17, 0.085);
        w.position.set(wx, -0.55, 0);
        noseGearPivot.add(w);
    });
    airplane.add(noseGearPivot);

    // Pivôs Trem Principal Esquerdo e Direito (base dos pneus em y ≈ -1.03 local)
    const createMainGearPivot = (side) => {
        const pivot = new THREE.Group();
        pivot.position.set(side * 1.32, -0.275, -0.08);

        const upperStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.044, 0.34, 12), strutMat);
        upperStrut.position.set(0, -0.17, 0);
        pivot.add(upperStrut);

        const oleo = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.24, 10), chromeMat);
        oleo.position.set(0, -0.43, 0);
        pivot.add(oleo);

        const sideBrace = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.40, 8), strutMat);
        sideBrace.position.set(side * -0.13, -0.21, 0);
        sideBrace.rotation.z = side * -0.58;
        pivot.add(sideBrace);

        const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.24, 8), chromeMat);
        axle.rotation.z = Math.PI / 2;
        axle.position.set(0, -0.545, 0);
        pivot.add(axle);

        [-0.085, 0.085].forEach((wx) => {
            const w = createDetailedWheel(0.21, 0.105);
            w.position.set(wx, -0.545, 0);
            pivot.add(w);
        });

        return pivot;
    };

    const leftGearPivot = createMainGearPivot(-1);
    const rightGearPivot = createMainGearPivot(1);
    airplane.add(leftGearPivot);
    airplane.add(rightGearPivot);

    // --- ATUALIZAÇÃO DINÂMICA DAS SUPERFÍCIES DE CONTROLE, FANS, LUZES E TREM ---
    let currentGearFoldProgress = 0; // 0 = Baixado, 1 = Recolhido

    airplane.userData = {
        leftFlapPivot,
        rightFlapPivot,
        leftAileronPivot,
        rightAileronPivot,
        elevatorPivot,
        rudderPivot,
        leftGearPivot,
        rightGearPivot,
        noseGearPivot,
        updateControlSurfaces(state) {
            const lerpSpeed = 0.2;

            // 1. Trem de Pouso (gearRetracted: true = BAIXADO, false = RECOLHIDO)
            if (state.gearRetracted === undefined) state.gearRetracted = true;
            const targetGearProgress = state.gearRetracted ? 0 : 1;

            currentGearFoldProgress = THREE.MathUtils.lerp(currentGearFoldProgress, targetGearProgress, 0.03);
            state.gearFoldProgress = currentGearFoldProgress;

            const mainGearAngle = currentGearFoldProgress * (Math.PI / 2);
            leftGearPivot.rotation.z = -mainGearAngle;
            rightGearPivot.rotation.z = mainGearAngle;
            noseGearPivot.rotation.x = currentGearFoldProgress * (Math.PI / 2);
            landingLight.visible = currentGearFoldProgress < 0.35;

            // 2. Ailerons
            let targetLeftAileron = 0;
            let targetRightAileron = 0;
            const maxAileronDeflection = 0.45;
            if (state.isTurningLeft) {
                targetLeftAileron = maxAileronDeflection;
                targetRightAileron = -maxAileronDeflection;
            } else if (state.isTurningRight) {
                targetLeftAileron = -maxAileronDeflection;
                targetRightAileron = maxAileronDeflection;
            }

            // 3. Profundor / Elevator
            let targetElevator = 0;
            const maxElevatorDeflection = 0.42;
            if (state.isPitchingUp) targetElevator = maxElevatorDeflection;
            else if (state.isPitchingDown) targetElevator = -maxElevatorDeflection;

            // 4. Flaps
            if (state.flapAngle === undefined) state.flapAngle = 0;
            if (state.flapTarget === undefined) state.flapTarget = 0;
            state.flapAngle = THREE.MathUtils.lerp(state.flapAngle, state.flapTarget, 0.08);
            const currentFlapDeflection = state.flapAngle * -0.55;

            // 5. Leme / Rudder
            let targetRudder = 0;
            if (state.isTurningLeft) targetRudder = -0.35;
            else if (state.isTurningRight) targetRudder = 0.35;

            // 6. Rotação dos Fans + Brilho de Exaustão guiados pela Potência (N1)
            const power = state.enginePower !== undefined
                ? THREE.MathUtils.clamp(state.enginePower, 0, 1)
                : THREE.MathUtils.clamp((state.speed || 0) / 20, 0, 1);

            const fanSpinSpeed = 0.06 + power * 0.65;
            for (let i = 0; i < fanRotors.length; i++) {
                fanRotors[i].rotation.z += fanSpinSpeed;
            }

            if (exhaustGlows.length > 0) {
                if (power <= 0.12) {
                    exhaustGlows.forEach(item => { item.group.visible = false; });
                } else {
                    const pNorm = (power - 0.12) / 0.88;
                    const flicker = 0.94 + Math.random() * 0.12;
                    exhaustGlows.forEach(item => {
                        item.group.visible = true;
                        item.group.scale.set(
                            (0.65 + 0.45 * pNorm) * flicker,
                            (0.65 + 0.45 * pNorm) * flicker,
                            (0.25 + 1.05 * pNorm) * flicker
                        );
                        item.flameMat.opacity = (0.14 + 0.38 * pNorm) * flicker;
                        item.coreMat.opacity = (0.25 + 0.48 * pNorm) * flicker;
                    });
                }
            }

            // 7. Luzes piscantes (Beacons vermelhos + Strobes brancos)
            const tMs = performance.now();
            const beaconOn = (tMs % 1400) < 160;
            topBeacon.visible = beaconOn;
            bottomBeacon.visible = beaconOn;

            const strobeCycle = tMs % 1800;
            const strobeOn = (strobeCycle < 70) || (strobeCycle > 140 && strobeCycle < 210);
            for (let i = 0; i < strobeLights.length; i++) {
                strobeLights[i].visible = strobeOn;
            }

            // Aplicar rotações suaves nos pivôs
            leftAileronPivot.rotation.x = THREE.MathUtils.lerp(leftAileronPivot.rotation.x, targetLeftAileron, lerpSpeed);
            rightAileronPivot.rotation.x = THREE.MathUtils.lerp(rightAileronPivot.rotation.x, targetRightAileron, lerpSpeed);
            leftFlapPivot.rotation.x = THREE.MathUtils.lerp(leftFlapPivot.rotation.x, currentFlapDeflection, lerpSpeed);
            rightFlapPivot.rotation.x = THREE.MathUtils.lerp(rightFlapPivot.rotation.x, currentFlapDeflection, lerpSpeed);
            elevatorPivot.rotation.x = THREE.MathUtils.lerp(elevatorPivot.rotation.x, targetElevator, lerpSpeed);
            rudderPivot.rotation.y = THREE.MathUtils.lerp(rudderPivot.rotation.y, targetRudder, lerpSpeed);
        }
    };

    airplane.scale.setScalar(PLANE_SCALE);
    scene.add(airplane);
    return airplane;
}

export function createEnemyInstancedPlanes(scene, maxEnemies) {
    const parts = getPlanePartDefinitions(false);
    const instancedMeshes = {};
    const dummyRoot = new THREE.Object3D();
    dummyRoot.scale.setScalar(PLANE_SCALE * 2.6);

    parts.forEach((part) => {
        const material = part.material.clone();
        if (part.name === 'fuselage') {
            material.color.set('#cc0000');
        }

        const mesh = new THREE.InstancedMesh(part.geometry, material, maxEnemies);
        mesh.castShadow = part.castShadow;
        mesh.receiveShadow = false;
        mesh.frustumCulled = false;

        for (let i = 0; i < maxEnemies; i++) {
            mesh.setMatrixAt(i, _hideMatrix);
        }
        mesh.instanceMatrix.needsUpdate = true;

        scene.add(mesh);
        instancedMeshes[part.name] = { mesh, localMatrix: part.localMatrix };
    });

    return { instancedMeshes, dummyRoot };
}

export function updateEnemyInstance(instancedMeshes, dummyRoot, instanceIndex, position, rotation) {
    dummyRoot.position.copy(position);
    dummyRoot.rotation.order = 'YXZ';
    dummyRoot.rotation.copy(rotation);
    dummyRoot.updateMatrix();

    Object.values(instancedMeshes).forEach(({ mesh, localMatrix }) => {
        _tempMatrix.multiplyMatrices(dummyRoot.matrix, localMatrix);
        mesh.setMatrixAt(instanceIndex, _tempMatrix);
    });
}

export function hideEnemyInstance(instancedMeshes, instanceIndex) {
    Object.values(instancedMeshes).forEach(({ mesh }) => {
        mesh.setMatrixAt(instanceIndex, _hideMatrix);
    });
}

export function markEnemyInstancesDirty(instancedMeshes) {
    Object.values(instancedMeshes).forEach(({ mesh }) => {
        mesh.instanceMatrix.needsUpdate = true;
    });
}

export function getEnemyBoundingBox(position, target = new THREE.Box3()) {
    const halfSize = new THREE.Vector3(1.2, 0.6, 1.5).multiplyScalar(PLANE_SCALE);
    target.setFromCenterAndSize(position, halfSize.multiplyScalar(2));
    return target;
}
