import 'three';
import { TweenLite } from 'gsap/TweenMax';

import Particles from './particles/Particles';
import InteractiveControls from './controls/InteractiveControls';

const glslify = require('glslify');

export default class WebGLView {

	constructor(app, containerEl) {
		this.app = app;
		this.containerEl = containerEl;

		this.samples = [
			'images/algiz_logo.png'
		];

		this.initThree();
		this.attachAndResize();
		this.initControls();
		this.initParticles();

		const rnd = ~~(Math.random() * this.samples.length);
		this.goto(rnd);

	}

	initThree() {
		// scene
		this.scene = new THREE.Scene();

		// camera
		this.camera = new THREE.PerspectiveCamera(50, 1, 1, 10000);
		this.camera.position.z = 300;

		// renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });

        // clock
		this.clock = new THREE.Clock(true);
	}

	initControls() {
		this.interactive = new InteractiveControls(this.camera, this.renderer.domElement);
		// optional: immediately size it to the current canvas
		if (this.interactive) this.interactive.resize();
	}

	getParticleOptions() {
		// No optional chaining — classic guard
		// const w = (this.containerEl && this.containerEl.clientWidth) || 1024;
		// const isMobile = w < 768;
	    // Measure container; if it's 0 (not laid out yet), fall back to the viewport
	    var rect = (this.containerEl && this.containerEl.getBoundingClientRect)
	      ? this.containerEl.getBoundingClientRect()
	      : null;
	    var w = (rect && rect.width > 0) ? rect.width
	            : (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth
	            : 1024;
	 
	    // Use the same breakpoint logic as CSS
	    var isMobile = (typeof window !== 'undefined' && window.matchMedia)
	      ? window.matchMedia('(max-width: 767px)').matches
	      : (w < 768);

		return {
			depth:  isMobile ? 10.0 : 10,
			random: isMobile ? 10 : 10,
			size:   isMobile ? 1.5 : 1.2,
			touchRadius: isMobile ? 0.12 : 0.12,
		};
	}

	initParticles() {
		const opts = this.getParticleOptions();
		this.particles = new Particles(this, opts);
		this.scene.add(this.particles.container);
	}

	attachAndResize() {
		if (!this.containerEl) return;
		if (!this.renderer.domElement.parentNode) {
			this.containerEl.appendChild(this.renderer.domElement);
		}
		const w = this.containerEl.clientWidth;
		const h = this.containerEl.clientHeight;
		this.renderer.setPixelRatio(window.devicePixelRatio);
		this.renderer.setSize(w, h, false); // false = keep CSS control
		this.camera.aspect = w / h;
		this.camera.updateProjectionMatrix();

		// optional: useful if you use fovHeight somewhere
		this.fovHeight = 2 * Math.tan((this.camera.fov * Math.PI) / 180 / 2) * this.camera.position.z;
	}

	// ---------------------------------------------------------------------------------------------
	// PUBLIC
	// ---------------------------------------------------------------------------------------------

	update() {
		const delta = this.clock.getDelta();
		const speed = 3.0;
		if (this.particles) this.particles.update(delta*speed);
	}

	draw() {
		this.renderer.render(this.scene, this.camera);
	}


	goto(index) {
		// init next
		if (this.currSample == null) this.particles.init(this.samples[index]);
		// hide curr then init next
		else {
			this.particles.hide(true).then(() => {
				this.particles.init(this.samples[index]);
			});
		}

		this.currSample = index;
	}

	next() {
		if (this.currSample < this.samples.length - 1) this.goto(this.currSample + 1);
		else this.goto(0);
	}


	// ---------------------------------------------------------------------------------------------
	// EVENT HANDLERS
	// ---------------------------------------------------------------------------------------------

	resize() {
		if (!this.renderer) return;
		this.attachAndResize();
		if (this.interactive) this.interactive.resize();
		if (this.particles) {
			const u = this.particles.object3D.material.uniforms;
			const opts = this.getParticleOptions();
			// animate to the new targets smoothly
			TweenLite.to(u.uRandom, 0.4, { value: opts.random });
			TweenLite.to(u.uDepth,  0.6, { value: opts.depth  });
			TweenLite.to(u.uSize,   0.4, { value: opts.size   });
			this.particles.resize();
		}
	}
}
