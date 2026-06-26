import * as THREE from 'three';

/**
 * Engine —— 渲染管线封装
 * 负责 renderer / scene / camera / 光照 / 天空 / 雾 / 阴影 / 自适应缩放
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
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    const sky = new THREE.Color(0x8fc7ff);
    this.scene.background = sky;
    this.scene.fog = new THREE.Fog(sky, 70, this.mobile ? 160 : 230);

    this.camera = new THREE.PerspectiveCamera(72, 1, 0.1, this.mobile ? 400 : 600);
    this.camera.position.set(0, 30, 30);

    this._setupLights();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  _setupLights() {
    // 半球光：天空蓝 + 地面暖反光，奠定体素色调
    const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x4a4030, 0.85);
    this.scene.add(hemi);

    // 主方向光（太阳）+ 阴影
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.45);
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

    const amb = new THREE.AmbientLight(0xffffff, 0.18);
    this.scene.add(amb);
  }

  /** 让阴影相机跟随目标点，保证主角周围阴影始终清晰 */
  followSun(targetVec3) {
    this.sun.target.position.copy(targetVec3);
    this.sun.position.set(
      targetVec3.x + 60,
      targetVec3.y + 110,
      targetVec3.z + 40,
    );
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
