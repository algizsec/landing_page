import * as THREE from 'three';

import TouchTexture from './TouchTexture';

const glslify = require('glslify');

export default class Particles {
	
	constructor(webgl, opts) {
		this.webgl = webgl;
		this.container = new THREE.Object3D();

		// merge with defaults FIRST, then coerce to numbers safely
		const cfg = Object.assign({ depth: 5, random: 5, size: 1 }, opts || {});

		// force numbers; if NaN or missing, fall back to defaults
		const toNum = (v, d) => {
			const n = typeof v === 'string' ? parseFloat(v) : v;
			return Number.isFinite(n) ? n : d;
		};

		// use names that won't collide with anything else
		this.pDepth  = toNum(cfg.depth,  5);
		this.pRandom = toNum(cfg.random, 5);
		this.pSize   = toNum(cfg.size,   1);
		this.pTouchRadius = toNum(cfg.touchRadius, 1);

		// sanity log
		// (comment out later)
		console.log('[Particles ctor] cfg:', cfg, '→', {
			depth: this.pDepth, random: this.pRandom, size: this.pSize
		});
	}		

	init(src) {
		const loader = new THREE.TextureLoader();

		loader.load(src, (texture) => {
			this.texture = texture;
			this.texture.minFilter = THREE.LinearFilter;
			this.texture.magFilter = THREE.LinearFilter;
			this.texture.format = THREE.RGBFormat;

			this.width = texture.image.width;
			this.height = texture.image.height;

			this.initPoints(true);
			this.initHitArea();
			this.initTouch();
			this.resize();
			this.show();
		});
	}

	initPoints(discard) {
		this.numPoints = this.width * this.height;

		let numVisible = this.numPoints;
		let threshold = 0;
		let originalColors;

		if (discard) {
			// discard pixels darker than threshold #22
			numVisible = 0;
			threshold = 34;

			const img = this.texture.image;
			const canvas = document.createElement('canvas');
			const ctx = canvas.getContext('2d');

			canvas.width = this.width;
			canvas.height = this.height;
			ctx.scale(1, -1);
			ctx.drawImage(img, 0, 0, this.width, this.height * -1);

			const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
			originalColors = Float32Array.from(imgData.data);

			for (let i = 0; i < this.numPoints; i++) {
				if (originalColors[i * 4 + 0] > threshold) numVisible++;
			}

			// console.log('numVisible', numVisible, this.numPoints);
		}

		const uniforms = {
			uTime: { value: 0 },
			uRandom: { value: this.pRandom },
			uDepth:  { value: this.pDepth  },
			uSize:   { value: this.pSize   },
			uTextureSize: { value: new THREE.Vector2(this.width, this.height) },
			uTexture: { value: this.texture },
			uTouch: { value: null },
		};

		const material = new THREE.RawShaderMaterial({
			uniforms,
			vertexShader: glslify(require('../../../shaders/particle.vert')),
			fragmentShader: glslify(require('../../../shaders/particle.frag')),
			depthTest: false,
			transparent: true,
			// blending: THREE.AdditiveBlending
		});

		const geometry = new THREE.InstancedBufferGeometry();

		// positions
		const positions = new THREE.BufferAttribute(new Float32Array(4 * 3), 3);
		positions.setXYZ(0, -0.5,  0.5,  0.0);
		positions.setXYZ(1,  0.5,  0.5,  0.0);
		positions.setXYZ(2, -0.5, -0.5,  0.0);
		positions.setXYZ(3,  0.5, -0.5,  0.0);
		geometry.addAttribute('position', positions);

		// uvs
		const uvs = new THREE.BufferAttribute(new Float32Array(4 * 2), 2);
		uvs.setXYZ(0,  0.0,  0.0);
		uvs.setXYZ(1,  1.0,  0.0);
		uvs.setXYZ(2,  0.0,  1.0);
		uvs.setXYZ(3,  1.0,  1.0);
		geometry.addAttribute('uv', uvs);

		// index
		geometry.setIndex(new THREE.BufferAttribute(new Uint16Array([ 0, 2, 1, 2, 3, 1 ]), 1));

		const indices = new Uint16Array(numVisible);
		const offsets = new Float32Array(numVisible * 3);
		const angles = new Float32Array(numVisible);

		for (let i = 0, j = 0; i < this.numPoints; i++) {
			if (discard && originalColors[i * 4 + 0] <= threshold) continue;

			offsets[j * 3 + 0] = i % this.width;
			offsets[j * 3 + 1] = Math.floor(i / this.width);

			indices[j] = i;

			angles[j] = Math.random() * Math.PI;

			j++;
		}

		geometry.addAttribute('pindex', new THREE.InstancedBufferAttribute(indices, 1, false));
		geometry.addAttribute('offset', new THREE.InstancedBufferAttribute(offsets, 3, false));
		geometry.addAttribute('angle', new THREE.InstancedBufferAttribute(angles, 1, false));

		this.object3D = new THREE.Mesh(geometry, material);
		this.container.add(this.object3D);
	}

	initTouch() {
		if (!this.touch) this.touch = new TouchTexture(this);
		this.touch.radius = this.pTouchRadius;
		this.object3D.material.uniforms.uTouch.value = this.touch.texture;
	}

	initHitArea() {
		const geometry = new THREE.PlaneGeometry(this.width, this.height, 1, 1);
		const material = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, wireframe: true, depthTest: false });
		material.visible = false;
		this.hitArea = new THREE.Mesh(geometry, material);
		this.container.add(this.hitArea);
	}

	addListeners() {
	this.handlerInteractiveMove = this.onInteractiveMove.bind(this);
	   this.webgl.interactive.addListener('interactive-move', this.handlerInteractiveMove);
	   this.webgl.interactive.objects.push(this.hitArea);
	   this.webgl.interactive.enable();
	}

	removeListeners() {
		if (!this.webgl || !this.webgl.interactive) return;
		this.webgl.interactive.removeListener('interactive-move', this.handlerInteractiveMove);
		const i = this.webgl.interactive.objects.findIndex(o => o === this.hitArea);
		if (i !== -1) this.webgl.interactive.objects.splice(i, 1);
		this.webgl.interactive.disable();
	}

	// ---------------------------------------------------------------------------------------------
	// PUBLIC
	// ---------------------------------------------------------------------------------------------

	update(delta) {
		if (!this.object3D) return;
		if (this.touch) this.touch.update();
		this.object3D.material.uniforms.uTime.value += delta;
	}

	show(time = 1.0) {
		const u = this.object3D.material.uniforms;

		const endSize   = this.pSize;
		const endRandom = this.pRandom;
		const endDepth  = this.pDepth;

		const startSize  = Math.max(0.05, endSize * 0.35);
		const startDepth = Math.max(40.0, endDepth * 6.0);

		u.uSize.value   = startSize;
		u.uRandom.value = Math.max(0.01, endRandom * 0.3);
		u.uDepth.value  = startDepth;

		TweenLite.fromTo(u.uSize,   time,       { value: startSize  }, { value: endSize   });
		TweenLite.to(    u.uRandom, time,                             { value: endRandom  });
		TweenLite.fromTo(u.uDepth,  time * 1.5, { value: startDepth }, { value: endDepth  });

		// debug snapshots (comment out later)
		setTimeout(() => console.log('[Particles show @0ms]', {
		random: u.uRandom.value, depth: u.uDepth.value, size: u.uSize.value
		}), 0);
		TweenLite.delayedCall(time * 1.6, () => {
		console.log('[Particles show @end]', {
			random: u.uRandom.value, depth: u.uDepth.value, size: u.uSize.value
		});
		});	
		this.addListeners();
	}

	hide(_destroy, time = 0.8) {
	return new Promise((resolve) => {
		const u = this.object3D.material.uniforms;
			TweenLite.to(u.uRandom, time,       { value: Math.max(0.01, this.pRandom * 2.0) });
			TweenLite.to(u.uDepth,  time,       { value: -Math.abs(this.pDepth), ease: Quad.easeIn });
			TweenLite.to(u.uSize,   time * 0.8, { value: 0.0, onComplete: () => { if (_destroy) this.destroy(); resolve(); }});
		});
	}

	destroy() {
		if (!this.object3D) return;

		this.object3D.parent.remove(this.object3D);
		this.object3D.geometry.dispose();
		this.object3D.material.dispose();
		this.object3D = null;

		if (!this.hitArea) return;

		this.hitArea.parent.remove(this.hitArea);
		this.hitArea.geometry.dispose();
		this.hitArea.material.dispose();
		this.hitArea = null;
	}

	// ---------------------------------------------------------------------------------------------
	// EVENT HANDLERS
	// ---------------------------------------------------------------------------------------------

	resize() {
		if (!this.object3D) return;

		const scale = this.webgl.fovHeight / this.height;
		this.object3D.scale.set(scale, scale, 1);
		this.hitArea.scale.set(scale, scale, 1);
	}

	onInteractiveMove(e) {
		const uv = e.intersectionData.uv;
		if (this.touch) this.touch.addTouch(uv);
	}
}
