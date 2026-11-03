import * as BABYLON from '@babylonjs/core';
import type { Ref } from 'vue';

export function createFactoryFloor(sc: BABYLON.Scene) {
  const ground = BABYLON.MeshBuilder.CreateGround('Ground', { width: 50, height: 50 }, sc);
  ground.position.y = 0;
  const groundMat = new BABYLON.StandardMaterial('GroundMat', sc);
  groundMat.diffuseColor = new BABYLON.Color3(0.06, 0.08, 0.14); // Dark slate blueprint floor
  groundMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
  ground.material = groundMat;
  ground.isPickable = true;
  ground.metadata = { type: 'floor' };

  // Industrial Engineering Subtle Grid Lines
  const gridLines: BABYLON.Vector3[][] = [];
  for (let x = -20; x <= 30; x += 2.5) {
    gridLines.push([new BABYLON.Vector3(x, 0.005, -20), new BABYLON.Vector3(x, 0.005, 30)]);
  }
  for (let z = -20; z <= 30; z += 2.5) {
    gridLines.push([new BABYLON.Vector3(-20, 0.005, z), new BABYLON.Vector3(30, 0.005, z)]);
  }
  const gridMesh = BABYLON.MeshBuilder.CreateLineSystem('GridLines', { lines: gridLines }, sc);
  gridMesh.color = new BABYLON.Color3(0.12, 0.16, 0.25);
  gridMesh.isPickable = false;
}

export function initBabylonEngine(canvas: HTMLCanvasElement): {
  engine: BABYLON.Engine;
  scene: BABYLON.Scene;
  camera: BABYLON.ArcRotateCamera;
  hemiLight: BABYLON.HemisphericLight;
  dirLight: BABYLON.DirectionalLight;
} {
  const engine = new BABYLON.Engine(canvas, true, {
    preserveDrawingBuffer: false,
    stencil: true,
    powerPreference: 'high-performance'
  });
  engine.enableOfflineSupport = false;
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.04, 0.06, 0.11, 1.0); // Slate OLED dark

  const camera = new BABYLON.ArcRotateCamera(
    'FactoryCamera',
    -Math.PI / 3,
    Math.PI / 3.2,
    28,
    new BABYLON.Vector3(5, 0, 5),
    scene
  );
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 6;
  camera.upperRadiusLimit = 55;
  camera.upperBetaLimit = Math.PI / 2 - 0.05;

  const hemiLight = new BABYLON.HemisphericLight('HemiLight', new BABYLON.Vector3(0, 1, 0), scene);
  hemiLight.intensity = 0.7;
  hemiLight.diffuse = new BABYLON.Color3(0.9, 0.95, 1.0);
  hemiLight.groundColor = new BABYLON.Color3(0.12, 0.15, 0.22);

  const dirLight = new BABYLON.DirectionalLight('DirLight', new BABYLON.Vector3(-1, -2, -1), scene);
  dirLight.position = new BABYLON.Vector3(20, 35, 20);
  dirLight.intensity = 0.9;
  dirLight.diffuse = new BABYLON.Color3(1, 0.98, 0.94);

  createFactoryFloor(scene);

  return { engine, scene, camera, hemiLight, dirLight };
}

export function setCameraView(
  camera: BABYLON.ArcRotateCamera | null,
  view: 'iso' | 'top' | 'follow',
  currentView: Ref<'iso' | 'top' | 'follow'>,
  targetMesh?: BABYLON.TransformNode | BABYLON.AbstractMesh | null
) {
  if (!camera) return;
  currentView.value = view;
  const ease = new BABYLON.CubicEase();
  ease.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEINOUT);

  if (view === 'iso') {
    BABYLON.Animation.CreateAndStartAnimation('camAlpha', camera, 'alpha', 30, 20, camera.alpha, -Math.PI / 3, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT, ease);
    BABYLON.Animation.CreateAndStartAnimation('camBeta', camera, 'beta', 30, 20, camera.beta, Math.PI / 3.2, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT, ease);
    BABYLON.Animation.CreateAndStartAnimation('camRadius', camera, 'radius', 30, 20, camera.radius, 28, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT, ease);
    BABYLON.Animation.CreateAndStartAnimation('camTarget', camera, 'target', 30, 20, camera.target, new BABYLON.Vector3(5, 0, 5), BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT, ease);
  } else if (view === 'top') {
    BABYLON.Animation.CreateAndStartAnimation('camAlpha', camera, 'alpha', 30, 20, camera.alpha, -Math.PI / 2, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT, ease);
    BABYLON.Animation.CreateAndStartAnimation('camBeta', camera, 'beta', 30, 20, camera.beta, 0.01, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT, ease);
    BABYLON.Animation.CreateAndStartAnimation('camRadius', camera, 'radius', 30, 20, camera.radius, 32, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT, ease);
    BABYLON.Animation.CreateAndStartAnimation('camTarget', camera, 'target', 30, 20, camera.target, new BABYLON.Vector3(5, 0, 5), BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT, ease);
  } else if (view === 'follow') {
    if (targetMesh) {
      BABYLON.Animation.CreateAndStartAnimation('camAlpha', camera, 'alpha', 30, 20, camera.alpha, -Math.PI / 3, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT, ease);
      BABYLON.Animation.CreateAndStartAnimation('camBeta', camera, 'beta', 30, 20, camera.beta, Math.PI / 3.5, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT, ease);
      BABYLON.Animation.CreateAndStartAnimation('camRadius', camera, 'radius', 30, 20, camera.radius, 14, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT, ease);
      BABYLON.Animation.CreateAndStartAnimation('camTarget', camera, 'target', 30, 20, camera.target, targetMesh.position, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT, ease);
    }
  }
}

export interface EngineKeyboardContext {
  is3DQuickDispatchActive: Ref<boolean>;
  closeQuickDispatch: () => void;
  cancelEdgeConnection: () => void;
  clearNodeSelection: () => void;
  attachGizmoToTarget: (mesh: null) => void;
  deleteNodeById: (id: string) => void;
  deletePropById: (id: string) => void;
  rotateSelectedElement: (deg: number) => void;
  setCameraView: (view: 'iso' | 'top' | 'follow') => void;
  selectedEditorNodeId: Ref<string | null>;
  selectedEditorPropId: Ref<string | null>;
}

export function handleKeyDown(e: KeyboardEvent, ctx: EngineKeyboardContext) {
  if (e.key === 'Escape') {
    if (ctx.is3DQuickDispatchActive.value) {
      ctx.closeQuickDispatch();
    }
    ctx.cancelEdgeConnection();
    ctx.clearNodeSelection();
    ctx.attachGizmoToTarget(null);
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    // Prevent accidental deletion if focused on an input
    const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    if (targetTag === 'input' || targetTag === 'textarea' || targetTag === 'select') return;
    if (ctx.selectedEditorNodeId.value) {
      ctx.deleteNodeById(ctx.selectedEditorNodeId.value);
    } else if (ctx.selectedEditorPropId.value) {
      ctx.deletePropById(ctx.selectedEditorPropId.value);
    }
  } else if (e.key === 'r' || e.key === 'R') {
    const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    if (targetTag === 'input' || targetTag === 'textarea' || targetTag === 'select') return;
    ctx.rotateSelectedElement(90);
  } else if (e.key === '1') {
    ctx.setCameraView('iso');
  } else if (e.key === '2') {
    ctx.setCameraView('top');
  } else if (e.key === '3') {
    ctx.setCameraView('follow');
  }
}
