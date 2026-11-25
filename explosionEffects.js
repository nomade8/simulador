import * as THREE from 'three';

export default class ExplosionEffects {
    constructor(scene) {
        this.scene = scene;
        this.active = [];
        this.lastTime = performance.now();
        this.fireTexture = this.createTexture(false);
        this.smokeTexture = this.createTexture(true);
        this.debrisGeometry = new THREE.IcosahedronGeometry(1, 0);
    }

    // Gera partículas suaves com bordas transparentes e nuvens irregulares.
    createTexture(smoke) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 128;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        gradient.addColorStop(0, smoke ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,1)');
        gradient.addColorStop(0.25, 'rgba(255,255,255,0.85)');
        gradient.addColorStop(0.55, 'rgba(255,255,255,0.35)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 128, 128);
        if (smoke) {
            for (let i = 0; i < 24; i++) {
                const x = 30 + Math.random() * 68;
                const y = 30 + Math.random() * 68;
                const radius = 12 + Math.random() * 24;
                const puff = ctx.createRadialGradient(x, y, 0, x, y, radius);
                puff.addColorStop(0, 'rgba(255,255,255,0.3)');
                puff.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = puff;
                ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
            }
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    }

    spawn(position, scale = 1, lowQuality = false) {
        const limit = lowQuality ? 2 : 3;
        while (this.active.length >= limit) this.remove(this.active[0]);
        scale = THREE.MathUtils.clamp(scale, 0.2, 5);
        const group = new THREE.Group();
        group.position.copy(position);
        this.scene.add(group);
        const effect = { group, scale, age: 0, particles: [], materials: [] };
        this.active.push(effect);

        const sprite = (type, size, delay, duration) => {
            const smoke = type === 'smoke';
            const material = new THREE.SpriteMaterial({
                map: smoke ? this.smokeTexture : this.fireTexture,
                color: smoke ? 0x494746 : 0xffe4a0,
                blending: smoke ? THREE.NormalBlending : THREE.AdditiveBlending,
                transparent: true, depthWrite: false, opacity: 0,
                rotation: Math.random() * Math.PI * 2
            });
            const mesh = new THREE.Sprite(material);
            mesh.scale.setScalar(size * scale);
            mesh.visible = false;
            group.add(mesh);
            effect.materials.push(material);
            const direction = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize();
            const speed = (smoke ? 1.2 + Math.random() * 1.8 : 4 + Math.random() * 8) * scale;
            const particle = { mesh, type, size: size * scale, delay, duration, velocity: direction.multiplyScalar(speed) };
            mesh.position.copy(direction).multiplyScalar(smoke ? 0.25 : 0.04);
            effect.particles.push(particle);
            return particle;
        };

        // Mantém fogo e fumaça com menos camadas transparentes sobrepostas.
        for (let i = 0; i < (lowQuality ? 6 : 10); i++) {
            sprite('fire', 2.2 + Math.random() * 2.5, Math.random() * 0.13, 0.65 + Math.random() * 0.7);
        }
        for (let i = 0; i < (lowQuality ? 5 : 8); i++) {
            sprite('smoke', 2.6 + Math.random() * 2.8, 0.12 + Math.random() * 0.4, 2 + Math.random() * 0.8);
        }

        const count = lowQuality ? 16 : 32;
        const positions = new Float32Array(count * 3);
        effect.sparkVelocities = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            const direction = new THREE.Vector3(Math.random() - 0.5, Math.random() * 1.3 - 0.25, Math.random() - 0.5)
                .normalize().multiplyScalar((8 + Math.random() * 20) * scale);
            direction.toArray(effect.sparkVelocities, i * 3);
        }
        effect.sparkGeometry = new THREE.BufferGeometry();
        effect.sparkGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const sparkMaterial = new THREE.PointsMaterial({
            color: 0xffbc55, size: 0.22 * scale, map: this.fireTexture,
            transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
        });
        effect.sparks = new THREE.Points(effect.sparkGeometry, sparkMaterial);
        effect.sparks.frustumCulled = false;
        group.add(effect.sparks);
        effect.materials.push(sparkMaterial);

        // Projeta fragmentos incandescentes com gravidade e rotação própria.
        for (let i = 0; i < (lowQuality ? 2 : 4); i++) {
            const material = new THREE.MeshBasicMaterial({
                color: 0xff6015, transparent: true, depthWrite: false
            });
            const mesh = new THREE.Mesh(this.debrisGeometry, material);
            const size = (0.08 + Math.random() * 0.18) * scale;
            mesh.scale.set(size, size * 0.6, size * 1.8);
            group.add(mesh);
            effect.materials.push(material);
            effect.particles.push({
                mesh, type: 'debris', delay: 0, duration: 2.1,
                velocity: new THREE.Vector3((Math.random() - 0.5) * 16, 6 + Math.random() * 12, (Math.random() - 0.5) * 16).multiplyScalar(scale),
                spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8)
            });
        }
    }

    update() {
        const now = performance.now();
        const dt = Math.min((now - this.lastTime) / 1000, 0.1);
        this.lastTime = now;
        for (let effectIndex = this.active.length - 1; effectIndex >= 0; effectIndex--) {
            const effect = this.active[effectIndex];
            effect.age += dt;
            const age = effect.age;
            for (const particle of effect.particles) {
                const t = (age - particle.delay) / particle.duration;
                const mesh = particle.mesh;
                mesh.visible = t >= 0 && t < 1;
                if (!mesh.visible) continue;
                const step = Math.min(dt, age - particle.delay);
                mesh.position.addScaledVector(particle.velocity, step);
                if (particle.type === 'debris') {
                    particle.velocity.y -= 9.8 * step;
                    mesh.rotation.x += particle.spin.x * step;
                    mesh.rotation.y += particle.spin.y * step;
                    mesh.rotation.z += particle.spin.z * step;
                    mesh.material.color.setHSL(0.04, 0.8 * (1 - t), 0.12 + 0.4 * (1 - t));
                    mesh.material.opacity = Math.min(1, (1 - t) * 4);
                    mesh.scale.multiplyScalar(Math.exp(-step * 0.6));
                } else if (particle.type === 'smoke') {
                    particle.velocity.x *= Math.exp(-step * 0.7);
                    particle.velocity.z *= Math.exp(-step * 0.7);
                    particle.velocity.y += step * effect.scale * 0.5;
                    mesh.scale.setScalar(particle.size * (1 + t * 1.5));
                    mesh.material.opacity = Math.min(1, t * 8) * Math.pow(1 - t, 0.8) * 0.65;
                    mesh.material.color.setHSL(0.07, 0.06, 0.19 + t * 0.2);
                    mesh.material.rotation += step * 0.12;
                } else {
                    particle.velocity.multiplyScalar(Math.exp(-step * 2.4));
                    mesh.scale.setScalar(particle.size * (1 + t * 1.9));
                    mesh.material.opacity = Math.pow(1 - t, 1.4);
                    mesh.material.color.setHSL(0.13 * (1 - t), 1, 0.55 + 0.4 * (1 - t));
                }
            }
            if (age < 1.6) {
                const positions = effect.sparkGeometry.attributes.position;
                for (let i = 0; i < positions.count; i++) {
                    const k = i * 3;
                    effect.sparkVelocities[k + 1] -= 9.8 * dt;
                    positions.array[k] += effect.sparkVelocities[k] * dt;
                    positions.array[k + 1] += effect.sparkVelocities[k + 1] * dt;
                    positions.array[k + 2] += effect.sparkVelocities[k + 2] * dt;
                }
                positions.needsUpdate = true;
            }
            effect.sparks.visible = age < 1.6;
            effect.sparks.material.opacity = Math.max(0, 1 - age / 1.6);
            if (age > 3.4) this.remove(effect);
        }
    }

    // Libera somente recursos locais e mantém as texturas e geometrias compartilhadas.
    remove(effect) {
        this.scene.remove(effect.group);
        effect.sparkGeometry.dispose();
        effect.materials.forEach(material => material.dispose());
        this.active.splice(this.active.indexOf(effect), 1);
    }
}
