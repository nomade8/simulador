import * as THREE from 'three';

export const PLANE_SCALE = 0.25;

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

export function createPlayerPlane(scene, fuselageColor = '#0e036b') {
    const airplane = new THREE.Group();

    // --- MATERIAIS DE ALTA QUALIDADE ---
    const fuselageMat = new THREE.MeshStandardMaterial({
        color: fuselageColor,
        roughness: 0.2,
        metalness: 0.5
    });

    const bellyMat = new THREE.MeshStandardMaterial({
        color: 0xf0f3f6,
        roughness: 0.3,
        metalness: 0.2
    });

    const cockpitMat = new THREE.MeshStandardMaterial({
        color: 0x0f2027,
        roughness: 0.1,
        metalness: 0.95
    });

    const wingMat = new THREE.MeshStandardMaterial({
        color: 0xfdfdfd,
        roughness: 0.3,
        metalness: 0.1
    });

    const controlSurfaceMat = new THREE.MeshStandardMaterial({
        color: 0xd9e1e8,
        roughness: 0.35,
        metalness: 0.3
    });

    const accentMat = new THREE.MeshStandardMaterial({
        color: 0xff5252,
        roughness: 0.3,
        metalness: 0.4
    });

    const engineHousingMat = new THREE.MeshStandardMaterial({
        color: 0x2c3e50,
        roughness: 0.4,
        metalness: 0.6
    });

    const engineIntakeMat = new THREE.MeshStandardMaterial({
        color: 0x111111,
        roughness: 0.8,
        metalness: 0.9
    });

    const turbineFanMat = new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        roughness: 0.2,
        metalness: 0.9
    });

    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
    const strutMat = new THREE.MeshStandardMaterial({ color: 0x7f8c8d, roughness: 0.2, metalness: 0.8 });
    const lightRedMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const lightGreenMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });

    // --- 1. FUSELAGEM ---
    const fuselageGroup = new THREE.Group();

    // Corpo principal (cilindro suave orientado ao longo de Z)
    const bodyGeom = new THREE.CylinderGeometry(0.55, 0.45, 3.2, 32);
    bodyGeom.rotateX(Math.PI / 2);
    const bodyMesh = new THREE.Mesh(bodyGeom, fuselageMat);
    bodyMesh.position.set(0, 0, -0.1);
    bodyMesh.castShadow = true;
    fuselageGroup.add(bodyMesh);

    // Barriga da fuselagem (accent branco inferior)
    const bellyGeom = new THREE.CylinderGeometry(0.56, 0.46, 3.0, 32, 1, false, Math.PI * 0.75, Math.PI * 0.5);
    bellyGeom.rotateX(Math.PI / 2);
    const bellyMesh = new THREE.Mesh(bellyGeom, bellyMat);
    bellyMesh.position.set(0, -0.01, -0.1);
    fuselageGroup.add(bellyMesh);

    // Bico aerodinâmico (Nose cone)
    const noseGeom = new THREE.ConeGeometry(0.55, 1.1, 32);
    noseGeom.rotateX(Math.PI / 2);
    const noseMesh = new THREE.Mesh(noseGeom, fuselageMat);
    noseMesh.position.set(0, 0, 2.05);
    noseMesh.castShadow = true;
    fuselageGroup.add(noseMesh);

    // Cone traseiro (Tail cone)
    const tailConeGeom = new THREE.ConeGeometry(0.45, 1.2, 32);
    tailConeGeom.rotateX(-Math.PI / 2);
    const tailConeMesh = new THREE.Mesh(tailConeGeom, fuselageMat);
    tailConeMesh.position.set(0, 0.05, -2.3);
    tailConeMesh.castShadow = true;
    fuselageGroup.add(tailConeMesh);

    // Cabine do Piloto / Windshield
    const cockpitGeom = new THREE.SphereGeometry(0.48, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.45);
    cockpitGeom.scale(0.85, 0.65, 1.6);
    const cockpitMesh = new THREE.Mesh(cockpitGeom, cockpitMat);
    cockpitMesh.position.set(0, 0.35, 0.9);
    cockpitMesh.rotation.x = -0.1;
    fuselageGroup.add(cockpitMesh);

    airplane.add(fuselageGroup);

    // --- 2. ASAS PRINCIPAIS ---
    const wingGroup = new THREE.Group();

    // Asas fixas principais (esquerda e direita)
    const mainWingGeom = new THREE.BoxGeometry(9.0, 0.08, 0.9);
    const mainWingMesh = new THREE.Mesh(mainWingGeom, wingMat);
    mainWingMesh.position.set(0, 0.02, 0.1);
    mainWingMesh.castShadow = true;
    wingGroup.add(mainWingMesh);

    // Pontas das asas / Winglets aerodinâmicos
    for (let side of [-1, 1]) {
        const wingletGeom = new THREE.BoxGeometry(0.08, 0.45, 0.5);
        const wingletMesh = new THREE.Mesh(wingletGeom, accentMat);
        wingletMesh.position.set(side * 4.5, 0.2, 0.1);
        wingletMesh.rotation.z = side * -0.2;
        wingletMesh.castShadow = true;
        wingGroup.add(wingletMesh);

        // Luzes de navegação nas pontas (Esquerda: Vermelha, Direita: Verde)
        const lightGeom = new THREE.SphereGeometry(0.06, 8, 8);
        const lightMesh = new THREE.Mesh(lightGeom, side === -1 ? lightRedMat : lightGreenMat);
        lightMesh.position.set(side * 4.52, 0.42, 0.1);
        wingGroup.add(lightMesh);
    }
    airplane.add(wingGroup);

    // --- 3. SUPERFÍCIES DE CONTROLE MÓVEIS (FLAPS E AILERONS) ---
    // Haste/Dobradiça do Flap Esquerdo
    const leftFlapPivot = new THREE.Group();
    leftFlapPivot.position.set(-1.4, 0.0, -0.35); // Eixo de rotação na borda de fuga interna
    const flapGeom = new THREE.BoxGeometry(1.7, 0.05, 0.35);
    const leftFlapMesh = new THREE.Mesh(flapGeom, controlSurfaceMat);
    leftFlapMesh.position.set(0, 0, -0.175); // Deslocado para que o pivô fique na frente
    leftFlapMesh.castShadow = true;
    leftFlapPivot.add(leftFlapMesh);
    airplane.add(leftFlapPivot);

    // Haste/Dobradiça do Flap Direito
    const rightFlapPivot = new THREE.Group();
    rightFlapPivot.position.set(1.4, 0.0, -0.35);
    const rightFlapMesh = new THREE.Mesh(flapGeom, controlSurfaceMat);
    rightFlapMesh.position.set(0, 0, -0.175);
    rightFlapMesh.castShadow = true;
    rightFlapPivot.add(rightFlapMesh);
    airplane.add(rightFlapPivot);

    // Haste/Dobradiça do Aileron Esquerdo
    const leftAileronPivot = new THREE.Group();
    leftAileronPivot.position.set(-3.25, 0.0, -0.35);
    const aileronGeom = new THREE.BoxGeometry(1.8, 0.05, 0.3);
    const leftAileronMesh = new THREE.Mesh(aileronGeom, controlSurfaceMat);
    leftAileronMesh.position.set(0, 0, -0.15);
    leftAileronMesh.castShadow = true;
    leftAileronPivot.add(leftAileronMesh);
    airplane.add(leftAileronPivot);

    // Haste/Dobradiça do Aileron Direito
    const rightAileronPivot = new THREE.Group();
    rightAileronPivot.position.set(3.25, 0.0, -0.35);
    const rightAileronMesh = new THREE.Mesh(aileronGeom, controlSurfaceMat);
    rightAileronMesh.position.set(0, 0, -0.15);
    rightAileronMesh.castShadow = true;
    rightAileronPivot.add(rightAileronMesh);
    airplane.add(rightAileronPivot);

    // --- 4. CAUDA E PROFUNDOR (ELEVATOR) MÓVEL ---
    // Deriva Vertical (Estabilizador Vertical)
    const tailFinGeom = new THREE.BoxGeometry(0.1, 1.3, 0.9);
    const tailFinMesh = new THREE.Mesh(tailFinGeom, fuselageMat);
    tailFinMesh.position.set(0, 1.1, -1.9);
    tailFinMesh.rotation.x = -0.3;
    tailFinMesh.castShadow = true;
    airplane.add(tailFinMesh);

    // Leme de Direção Móvel (Rudder)
    const rudderPivot = new THREE.Group();
    rudderPivot.position.set(0, 1.05, -2.3);
    const rudderGeom = new THREE.BoxGeometry(0.08, 1.1, 0.35);
    const rudderMesh = new THREE.Mesh(rudderGeom, accentMat);
    rudderMesh.position.set(0, 0, -0.175);
    rudderMesh.castShadow = true;
    rudderPivot.add(rudderMesh);
    airplane.add(rudderPivot);

    // Estabilizador Horizontal (Tail plane)
    const tailPlaneGeom = new THREE.BoxGeometry(3.0, 0.06, 0.6);
    const tailPlaneMesh = new THREE.Mesh(tailPlaneGeom, wingMat);
    tailPlaneMesh.position.set(0, 0.25, -2.0);
    tailPlaneMesh.castShadow = true;
    airplane.add(tailPlaneMesh);

    // Profundor Móvel (Elevator)
    const elevatorPivot = new THREE.Group();
    elevatorPivot.position.set(0, 0.25, -2.3);
    const elevatorGeom = new THREE.BoxGeometry(2.9, 0.05, 0.35);
    const elevatorMesh = new THREE.Mesh(elevatorGeom, controlSurfaceMat);
    elevatorMesh.position.set(0, 0, -0.175);
    elevatorMesh.castShadow = true;
    elevatorPivot.add(elevatorMesh);
    airplane.add(elevatorPivot);

    // --- 5. MOTORES TURBOFAN SOB AS ASAS COM COMBUSTÃO / BRILHO DE EXAUSTÃO ---
    const exhaustGlows = [];

    for (let side of [-1, 1]) {
        const engineGroup = new THREE.Group();
        engineGroup.position.set(side * 1.8, -0.38, 0.2);

        // Carenagem da turbina
        const nacelleGeom = new THREE.CylinderGeometry(0.3, 0.26, 1.1, 24);
        nacelleGeom.rotateX(Math.PI / 2);
        const nacelleMesh = new THREE.Mesh(nacelleGeom, engineHousingMat);
        nacelleMesh.castShadow = true;
        engineGroup.add(nacelleMesh);

        // Entrada de ar (Front Intake)
        const intakeGeom = new THREE.TorusGeometry(0.28, 0.04, 16, 24);
        const intakeMesh = new THREE.Mesh(intakeGeom, engineIntakeMat);
        intakeMesh.position.set(0, 0, 0.55);
        engineGroup.add(intakeMesh);

        // Fan interno / Cone da turbina
        const fanGeom = new THREE.ConeGeometry(0.12, 0.3, 16);
        fanGeom.rotateX(Math.PI / 2);
        const fanMesh = new THREE.Mesh(fanGeom, turbineFanMat);
        fanMesh.position.set(0, 0, 0.42);
        engineGroup.add(fanMesh);

        // Suporte de fixação da turbina na asa (Pylon)
        const pylonGeom = new THREE.BoxGeometry(0.06, 0.25, 0.7);
        const pylonMesh = new THREE.Mesh(pylonGeom, strutMat);
        pylonMesh.position.set(0, 0.2, 0);
        engineGroup.add(pylonMesh);

        // Combustão sutil na saída traseira da turbina (Exhaust Glow)
        const exhaustGroup = new THREE.Group();
        exhaustGroup.position.set(0, 0, -0.56);

        // Cone de chama externo (Laranja suave)
        const flameGeom = new THREE.ConeGeometry(0.2, 0.55, 12);
        flameGeom.rotateX(-Math.PI / 2);
        flameGeom.translate(0, 0, -0.275);
        const flameMat = new THREE.MeshBasicMaterial({
            color: 0xff8822,
            transparent: true,
            opacity: 0.4,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const flameMesh = new THREE.Mesh(flameGeom, flameMat);
        exhaustGroup.add(flameMesh);

        // Núcleo interno de combustão (Amarelo brilhante)
        const coreGeom = new THREE.ConeGeometry(0.11, 0.32, 10);
        coreGeom.rotateX(-Math.PI / 2);
        coreGeom.translate(0, 0, -0.16);
        const coreMat = new THREE.MeshBasicMaterial({
            color: 0xfff0aa,
            transparent: true,
            opacity: 0.7,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const coreMesh = new THREE.Mesh(coreGeom, coreMat);
        exhaustGroup.add(coreMesh);

        engineGroup.add(exhaustGroup);
        exhaustGlows.push({ group: exhaustGroup, flameMat, coreMat });

        airplane.add(engineGroup);
    }

    // --- 6. TREM DE POUSO COM SUPORTE A RECOLHIMENTO (TECLA G) ---
    // Pivô Trem Dianteiro
    const noseGearPivot = new THREE.Group();
    noseGearPivot.position.set(0, -0.275, 1.4); // Ponto de articulação no topo da haste
    const noseStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.55, 12), strutMat);
    noseStrut.position.set(0, -0.275, 0);
    noseGearPivot.add(noseStrut);

    const noseWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 16), wheelMat);
    noseWheel.rotation.z = Math.PI / 2;
    noseWheel.position.set(0, -0.545, 0);
    noseWheel.castShadow = true;
    noseGearPivot.add(noseWheel);
    airplane.add(noseGearPivot);

    // Pivô Trem Traseiro Esquerdo
    const leftGearPivot = new THREE.Group();
    leftGearPivot.position.set(-1.5, -0.275, -0.1);
    const leftMainStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.55, 12), strutMat);
    leftMainStrut.position.set(0, -0.275, 0);
    leftGearPivot.add(leftMainStrut);

    const leftWheel1 = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 16), wheelMat);
    leftWheel1.rotation.z = Math.PI / 2;
    leftWheel1.position.set(-0.08, -0.545, 0);
    leftWheel1.castShadow = true;
    leftGearPivot.add(leftWheel1);

    const leftWheel2 = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 16), wheelMat);
    leftWheel2.rotation.z = Math.PI / 2;
    leftWheel2.position.set(0.08, -0.545, 0);
    leftWheel2.castShadow = true;
    leftGearPivot.add(leftWheel2);
    airplane.add(leftGearPivot);

    // Pivô Trem Traseiro Direito
    const rightGearPivot = new THREE.Group();
    rightGearPivot.position.set(1.5, -0.275, -0.1);
    const rightMainStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.55, 12), strutMat);
    rightMainStrut.position.set(0, -0.275, 0);
    rightGearPivot.add(rightMainStrut);

    const rightWheel1 = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 16), wheelMat);
    rightWheel1.rotation.z = Math.PI / 2;
    rightWheel1.position.set(-0.08, -0.545, 0);
    rightWheel1.castShadow = true;
    rightGearPivot.add(rightWheel1);

    const rightWheel2 = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 16), wheelMat);
    rightWheel2.rotation.z = Math.PI / 2;
    rightWheel2.position.set(0.08, -0.545, 0);
    rightWheel2.castShadow = true;
    rightGearPivot.add(rightWheel2);
    airplane.add(rightGearPivot);

    // --- ATUALIZAÇÃO DINÂMICA DAS SUPERFÍCIES DE CONTROLE E TREM DE POUSO ---
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

            // Animação das Rodas / Trem de Pouso (Recolhimento para o centro com tecla G)
            if (state.gearRetracted === undefined) state.gearRetracted = false;
            if (state.gearFoldProgress === undefined) state.gearFoldProgress = 0; // 0 = Baixado, 1 = Recolhido

            const targetGearProgress = state.gearRetracted ? 1 : 0;
            state.gearFoldProgress = THREE.MathUtils.lerp(state.gearFoldProgress, targetGearProgress, 0.08);

            // Rodas principais dobram para o centro (roll em relação ao eixo Z da asa)
            const mainGearAngle = state.gearFoldProgress * (Math.PI / 2);
            leftGearPivot.rotation.z = -mainGearAngle;  // Dobra para a direita (centro da fuselagem)
            rightGearPivot.rotation.z = mainGearAngle;  // Dobra para a esquerda (centro da fuselagem)

            // Roda da frente recolhe para trás
            const noseGearAngle = state.gearFoldProgress * (Math.PI / 2);
            noseGearPivot.rotation.x = noseGearAngle;

            // 1. Ailerons (Rolagem / Curva)
            let targetLeftAileron = 0;
            let targetRightAileron = 0;
            const maxAileronDeflection = 0.45; // ~26 graus

            if (state.isTurningLeft) {
                targetLeftAileron = maxAileronDeflection; // Aileron Esquerdo SOBE
                targetRightAileron = -maxAileronDeflection;  // Aileron Direito DESCE
            } else if (state.isTurningRight) {
                targetLeftAileron = -maxAileronDeflection;   // Aileron Esquerdo DESCE
                targetRightAileron = maxAileronDeflection; // Aileron Direito SOBE
            }

            // 2. Profundor / Elevator (Arfagem / Cabrar / Bicar)
            let targetElevator = 0;
            const maxElevatorDeflection = 0.45; // ~26 graus
            if (state.isPitchingUp) {
                targetElevator = maxElevatorDeflection; // Puxar manche -> Profundor SOBE
            } else if (state.isPitchingDown) {
                targetElevator = -maxElevatorDeflection;  // Empurrar manche -> Profundor DESCE
            }

            // 3. Flaps (Sustentação)
            if (state.flapAngle === undefined) state.flapAngle = 0;
            if (state.flapTarget === undefined) state.flapTarget = 0;
            state.flapAngle = THREE.MathUtils.lerp(state.flapAngle, state.flapTarget, 0.08);

            const maxFlapDeflection = 0.55; // ~31 graus
            const currentFlapDeflection = state.flapAngle * -maxFlapDeflection;

            // 4. Leme de Direção / Rudder (Guinada)
            let targetRudder = 0;
            const maxRudderDeflection = 0.35; // ~20 graus
            if (state.isTurningLeft) targetRudder = -maxRudderDeflection;
            else if (state.isTurningRight) targetRudder = maxRudderDeflection;

            // 5. Combustão / Propulsão das Turbinas (Escala sutil proporcional à velocidade)
            if (exhaustGlows && exhaustGlows.length > 0) {
                const speed = state.speed || 0;
                if (speed <= 0.1) {
                    exhaustGlows.forEach(item => { item.group.visible = false; });
                } else {
                    const speedRatio = THREE.MathUtils.clamp(speed / 20, 0, 1.25);
                    const flicker = 0.95 + Math.random() * 0.1;

                    exhaustGlows.forEach(item => {
                        item.group.visible = true;
                        item.group.scale.set(
                            (0.7 + 0.4 * speedRatio) * flicker,
                            (0.7 + 0.4 * speedRatio) * flicker,
                            (0.3 + 0.9 * speedRatio) * flicker
                        );
                        item.flameMat.opacity = (0.2 + 0.35 * speedRatio) * flicker;
                        item.coreMat.opacity = (0.35 + 0.45 * speedRatio) * flicker;
                    });
                }
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
    dummyRoot.scale.setScalar(PLANE_SCALE);

    parts.forEach((part) => {
        const material = part.material.clone();
        if (part.name === 'fuselage') {
            material.color.set('#cc0000');
        }

        const mesh = new THREE.InstancedMesh(part.geometry, material, maxEnemies);
        mesh.castShadow = part.castShadow;
        mesh.receiveShadow = false; // Desativa receiveShadow para evitar artefatos nas asas
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
