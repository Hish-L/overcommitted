// The two suits striking a pose on top of the main menu card: a small separate
// renderer drawing into a transparent canvas that pokes out above the card.
import * as THREE from 'three';
import { makeSuitPerson, crossArms } from './models.js';

export class MenuHeroes {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 1.6));
    const key = new THREE.DirectionalLight(0xffe9c8, 2.4);
    key.position.set(2, 4, 5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fc2ff, 1.4);
    rim.position.set(-3, 2, -4);
    this.scene.add(rim);
    this.camera = new THREE.PerspectiveCamera(26, 2, 0.1, 50);
    this.camera.position.set(0, 0.9, 3.8);
    this.camera.lookAt(0, 0.72, 0);

    // back to back, angled out, leaning back with their chins up
    this.guys = [
      { suit: 0x23293a, tie: 0xc0392b, skin: 0xe0ac69, hair: 0x111111, x: -0.3, rot: -0.5 },
      { suit: 0x3a3f47, skin: 0xf1c27d, hair: 0x2b1b0e, woman: true, x: 0.3, rot: 0.5 },
    ].map((o) => {
      const p = crossArms(makeSuitPerson(o));
      p.position.x = o.x;
      p.rotation.y = o.rot;
      p.userData.body.rotation.x = -0.06;
      p.userData.head.rotation.x = -0.15;
      this.scene.add(p);
      return p;
    });
  }

  render(t) {
    const { canvas, renderer, camera } = this;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    this.guys.forEach((p, i) => {
      const { body, head } = p.userData;
      body.position.y = Math.sin(t * 1.6 + i * 1.3) * 0.008; // breathing
      head.rotation.y = Math.sin(t * 0.5 + i * 2) * 0.12;
    });
    renderer.render(this.scene, camera);
  }
}
