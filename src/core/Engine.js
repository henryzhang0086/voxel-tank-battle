import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/**
 * Engine —— 渲染管线封装
 * renderer / scene / 渐变天穹 / 光照 / 阴影 / 雾 / Bloom 后处理 / 自适应缩放
 */
export class Engine {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.mobile = !!opts.mobile;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !this.mobile,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.mobile ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.scene = new THREE.Scene();
    const horizon = new THREE.Color(0xf5b25a);
    this.scene.fog = new THREE.Fog(horizon, 70, this.mobile ? 170 : 250);

    this.baseFov = 74;
    this.camera = new THREE.PerspectiveCamera(this.baseFov, 1, 0.1, this.mobile ? 480 : 700);
    this.camera.position.set(0, 30, 30);

    this._setupSky();
    this._setupLights();
    this._setupComposer();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  _setupSky() {
    // 渐变天穹：天顶冷蓝 → 地平暖橙（夕阳氛围）
    const geo = new THREE.SphereGeometry(this.mobile ? 460 : 660, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x16224a) },
        mid: { value: new THREE.Color(0x7c4aa0) },
        bottom: { value: new THREE.Color(0xf7b15a) },
        offset: { value: 0.18 },
      },
      vertexShader: `varying vec3 vd; void main(){ vd = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `
        varying vec3 vd; uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; uniform float offset;
        void main(){
          float h = clamp(vd.y + offset, -1.0, 1.0);
          vec3 col = h > 0.0 ? mix(mid, top, pow(h, 0.7)) : mix(mid, bottom, pow(-h, 0.6));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.scene.add(new THREE.Mesh(geo, mat));

    // 发光太阳（供 Bloom 泛光）
    const sunGeo = new THREE.SphereGeometry(this.mobile ? 14 : 20, 24, 16);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xfff0c8, fog: false, toneMapped: false });
    this.sunMesh = new THREE.Mesh(sunGeo, sunMat);
    this.sunMesh.position.set(120, 150, -260);
    this.scene.add(this.sunMesh);
  }

  _setupLights() {
    const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x5a4e38, 0.98);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff1da, 1.5);
    sun.position.set(60, 110, 40);
    sun.castShadow = true;
    const sm = this.mobile ? 1024 : 2048;
    sun.shadow.mapSize.set(sm, sm);
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 320;
    const s = 90;
    sun.shadow.camera.left = -s;
    sun.shadow.camera.right = s;
    sun.shadow.camera.top = s;
    sun.shadow.camera.bottom = -s;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.4;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.22));
  }

  _setupComposer() {
    const w = window.innerWidth, h = window.innerHeight;
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(w, h),
      this.mobile ? 0.5 : 0.72, // strength
      0.5,                       // radius
      0.82,                      // threshold（只让高亮处泛光）
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  followSun(targetVec3) {
    this.sun.target.position.copy(targetVec3);
    this.sun.position.set(targetVec3.x + 60, targetVec3.y + 110, targetVec3.z + 40);
  }

  /** 相机视场角平滑设置（用于冲刺/开炮顿挫） */
  setFov(fov) {
    if (Math.abs(this.camera.fov - fov) < 0.01) return;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.composer.render();
  }
}
