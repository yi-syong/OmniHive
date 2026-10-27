<template>
  <div class="scene-container">
    <canvas ref="canvasRef" class="render-canvas"></canvas>

    <!-- Top Camera & Global Field View Selector -->
    <div :class="['camera-toolbar', { 'in-edit-mode': currentAppMode === 'edit' }]">
      <button 
        :class="['cam-btn', { active: currentView === 'iso' }]" 
        @click="setCameraView('iso')"
        title="全廠鳥瞰等角視角"
      >
        <Box :size="14" />
        <span>等角全景</span>
      </button>
      <button 
        :class="['cam-btn', { active: currentView === 'top' }]" 
        @click="setCameraView('top')"
        title="正上方全廠平面總覽"
      >
        <Compass :size="14" />
        <span>俯視平面</span>
      </button>
    </div>

    <!-- Edit Mode Floating Action Bar (Visible only in Edit Mode) -->
    <transition name="fade">
      <div v-if="currentAppMode === 'edit'" class="edit-toolbar">
        <div class="edit-tool-group">
          <button 
            :class="['tool-btn', { active: currentEditorTool === 'select' }]"
            @click="currentEditorTool = 'select'"
            title="選取並拖曳移動物件"
          >
            <Move :size="14" />
            <span>選取</span>
          </button>
          <button 
            :class="['tool-btn', { active: currentEditorTool === 'add_node' }]"
            @click="currentEditorTool = 'add_node'"
            title="點擊地面新增站點節點"
          >
            <PlusCircle :size="14" />
            <span>加節點</span>
          </button>
          
          <!-- Intuitive Edge Tool with Direction Selector -->
          <button 
            :class="['tool-btn', { active: currentEditorTool === 'add_edge' }]"
            @click="currentEditorTool = 'add_edge'"
            title="點選節點以動態橡皮筋拉線建立路徑"
          >
            <GitCommit :size="14" />
            <span>建路徑</span>
          </button>

          <!-- Edge Direction Quick Toggle -->
          <div v-if="currentEditorTool === 'add_edge'" class="edge-dir-selector">
            <button 
              :class="['dir-pill', { active: edgeDirectionMode === 'oneway' }]"
              @click="edgeDirectionMode = 'oneway'"
              title="單向通行 (起點 ➔ 終點)"
            >
              <ArrowRight :size="11" />
              <span>單向</span>
            </button>
            <button 
              :class="['dir-pill', { active: edgeDirectionMode === 'bidirectional' }]"
              @click="edgeDirectionMode = 'bidirectional'"
              title="雙向通行 (雙向互通 ⇄)"
            >
              <ArrowLeftRight :size="11" />
              <span>雙向</span>
            </button>
          </div>

          <button 
            :class="['tool-btn', { active: currentEditorTool === 'add_prop' }]"
            @click="currentEditorTool = 'add_prop'"
            title="點擊地面放置貨架/工作站"
          >
            <Layers :size="14" />
            <span>加貨架</span>
          </button>
          <button 
            :class="['tool-btn', 'tool-btn-danger', { active: currentEditorTool === 'delete' }]"
            @click="currentEditorTool = 'delete'"
            title="點擊物件以刪除"
          >
            <Trash2 :size="14" />
            <span>刪除</span>
          </button>
        </div>

        <div class="edit-actions">
          <button class="action-btn save-btn" @click="handleSaveLayout" title="儲存當前場域拓撲並自動切換回模擬派車模式">
            <Save :size="14" />
            <span>儲存並模擬</span>
          </button>
          <button class="action-btn reset-btn" @click="handleResetLayout" title="還原預設場域佈局">
            <RotateCcw :size="14" />
            <span>復原預設</span>
          </button>
        </div>
      </div>
    </transition>

    <!-- Problem 2: Rubber-band Connection Interactive Hint Banner -->
    <transition name="fade">
      <div v-if="currentAppMode === 'edit' && currentEditorTool === 'add_edge' && edgeFirstNodeId" class="edge-hint-banner">
        <div class="hint-pulse-dot"></div>
        <span class="hint-text">
          起點: <strong>{{ edgeFirstNodeId }}</strong> ➔ 
          <span v-if="hoveredNodeId" class="text-hover-node">終點: <strong>{{ hoveredNodeId }}</strong> (點擊完成連線)</span>
          <span v-else>拖曳游標並點擊目標節點 (按 Esc 取消)</span>
        </span>
        <span class="hint-mode-tag">{{ edgeDirectionMode === 'bidirectional' ? '雙向 (⇄)' : '單向 (➔)' }}</span>
        <button class="hint-cancel-btn" @click="cancelEdgeConnection">取消</button>
      </div>
    </transition>

    <!-- Problem 2: Edge Selection & Direction Quick Configuration Popover -->
    <transition name="slide-up">
      <div v-if="currentAppMode === 'edit' && selectedEdgeForEdit" class="edge-popover">
        <div class="popover-head">
          <div class="flex-align-center gap-6">
            <GitCommit :size="14" class="text-cyan" />
            <span class="popover-title">路徑設定 · {{ selectedEdgeForEdit.id }}</span>
          </div>
          <button class="popover-close" @click="selectedEdgeForEdit = null">
            <X :size="13" />
          </button>
        </div>
        <div class="popover-body">
          <div class="popover-route-line">
            <span class="route-node">{{ selectedEdgeForEdit.startNodeId }}</span>
            <span class="route-arrow">{{ selectedEdgeForEdit.bidirectional ? '⇄ 雙向互通' : '➔ 單向通行' }}</span>
            <span class="route-node">{{ selectedEdgeForEdit.endNodeId }}</span>
          </div>
          <div class="popover-btn-group">
            <button class="popover-act-btn" @click="toggleSelectedEdgeBidirectional">
              <ArrowLeftRight :size="13" />
              <span>{{ selectedEdgeForEdit.bidirectional ? '轉為單向 (➔)' : '轉為雙向 (⇄)' }}</span>
            </button>
            <button class="popover-act-btn" @click="reverseSelectedEdgeDirection">
              <RotateCw :size="13" />
              <span>反轉方向</span>
            </button>
            <button class="popover-act-btn btn-danger" @click="deleteSelectedEdge">
              <Trash2 :size="13" />
              <span>刪除路徑</span>
            </button>
          </div>
        </div>
      </div>
    </transition>



    <!-- Item 1: Non-blocking Left-side Floating Mission Dispatch Panel -->
    <transition name="slide-left">
      <div 
        v-if="currentAppMode === 'simulate' && is3DQuickDispatchActive" 
        class="mission-dispatch-panel"
      >
        <div class="mission-panel-header">
          <div class="mission-panel-title-wrap">
            <span class="mission-badge-dot"></span>
            <div class="mission-titles">
              <span class="mission-panel-title">{{ selectedVehicleId }} 任務派遣</span>
              <span class="mission-panel-sub">
                [{{ agvState.task_info.status }} · 電量 {{ agvState.battery.level.toFixed(0) }}%]
              </span>
            </div>
          </div>
          <button class="mission-panel-close" @click="closeQuickDispatch" title="關閉任務派遣">
            <X :size="15" />
          </button>
        </div>

        <div class="mission-panel-body custom-scrollbar">
          <!-- Starting Position Summary -->
          <div class="mission-start-badge">
            <div class="start-dot"></div>
            <div class="start-text">
              <span class="start-lbl">出發站點</span>
              <span class="start-val">{{ currentAgvStartNode }} ({{ getNodeNameOnly(currentAgvStartNode) }})</span>
            </div>
          </div>

          <!-- Multi-Step Waypoints List -->
          <div class="mission-steps-section">
            <div class="steps-section-header">
              <span class="steps-header-title">行駛與作業站點序列</span>
              <span class="steps-count-badge">{{ quickDispatchSteps.length }} 站</span>
            </div>
            
            <div class="mission-step-list">
              <div 
                v-for="(step, idx) in quickDispatchSteps" 
                :key="idx" 
                class="mission-step-card"
                :class="{ 'step-active': activeStepIndex === idx }"
                @click="activeStepIndex = idx"
              >
                <div class="step-card-top">
                  <div class="step-index-badge">第 {{ idx + 1 }} 站</div>
                  <div class="step-node-select-wrap">
                    <select 
                      v-model="step.node_id" 
                      class="step-node-select"
                      @change="onStepNodeChange(idx)"
                    >
                      <option 
                        v-for="n in factoryLayout.nodes" 
                        :key="n.id" 
                        :value="n.id"
                      >
                        {{ n.id }} - {{ n.name }} ({{ getNodeFunctionLabel(n.function) }})
                      </option>
                    </select>
                  </div>
                  <button 
                    v-if="quickDispatchSteps.length > 1" 
                    class="step-delete-btn" 
                    @click.stop="removeDispatchStep(idx)"
                    title="移除此站點"
                  >
                    <Trash2 :size="13" />
                  </button>
                </div>

                <!-- Action Selector for this Step -->
                <div class="step-actions-row">
                  <span class="step-action-lbl">抵達動作:</span>
                  <div class="step-action-buttons">
                    <button 
                      type="button"
                      :class="['step-act-btn', { active: step.action === 'none' }]"
                      @click.stop="setStepAction(idx, 'none')"
                      title="純移動 (抵達後不停留直接往下一站)"
                    >
                      <Navigation :size="12" />
                      <span>純移動</span>
                    </button>
                    <button 
                      type="button"
                      :class="['step-act-btn', 'act-wait', { active: step.action === 'wait' }]"
                      @click.stop="setStepAction(idx, 'wait')"
                      title="原地等待"
                    >
                      <Clock :size="12" />
                      <span>等待</span>
                    </button>
                    <button 
                      type="button"
                      :class="['step-act-btn', 'act-pick', { active: step.action === 'pick' }]"
                      @click.stop="setStepAction(idx, 'pick')"
                      title="取貨作業"
                    >
                      <PackagePlus :size="12" />
                      <span>取貨</span>
                    </button>
                    <button 
                      type="button"
                      :class="['step-act-btn', 'act-drop', { active: step.action === 'drop' }]"
                      @click.stop="setStepAction(idx, 'drop')"
                      title="卸貨作業"
                    >
                      <PackageMinus :size="12" />
                      <span>放貨</span>
                    </button>
                    <!-- Charge restricted to charging stations only! -->
                    <button 
                      type="button"
                      :class="['step-act-btn', 'act-charge', { active: step.action === 'charge' }]"
                      :disabled="!isChargingNode(step.node_id)"
                      @click.stop="setStepAction(idx, 'charge')"
                      :title="isChargingNode(step.node_id) ? '前往充電樁補充電量' : '此站非充電樁，無法設定充電'"
                    >
                      <Zap :size="12" />
                      <span>充電</span>
                    </button>
                  </div>
                </div>

                <div v-if="step.action === 'charge' && !isChargingNode(step.node_id)" class="step-warning-text">
                  ⚠️ 該站點非充電樁，請改選其他動作或變更站點
                </div>
              </div>
            </div>

            <!-- Add Step Button & Direct Click Hint -->
            <div class="steps-toolbar">
              <button class="btn-add-step" @click="addNewDispatchStep">
                <Plus :size="14" />
                <span>加入下一站點</span>
              </button>
              <button 
                class="btn-reset-steps" 
                v-if="quickDispatchSteps.length > 1" 
                @click="resetDispatchSteps"
                title="重設為單一目標"
              >
                重設
              </button>
            </div>
            <div class="steps-map-hint">
              <span>💡 提示：點擊 3D 地圖站點即可快速加入路徑；點擊站點亦會顯示其名稱與用途。</span>
            </div>
          </div>
        </div>

        <!-- Launch Footer -->
        <div class="mission-panel-footer">
          <button 
            class="btn-mission-launch"
            :disabled="quickDispatchSteps.length === 0 || agvState.task_info.status === 'DRIVING' || agvState.task_info.status === 'ACTING'"
            @click="handleQuickDispatchLaunch"
          >
            <Send :size="15" />
            <span>立即執行任務 ({{ quickDispatchSteps.length }} 站)</span>
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>


<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { 
  Box, 
  Compass, 
  Move, 
  PlusCircle, 
  Plus,
  GitCommit, 
  Layers, 
  Trash2, 
  Save, 
  RotateCcw, 
  X, 
  ArrowRight, 
  ArrowLeftRight, 
  RotateCw,
  Send,
  PackagePlus,
  PackageMinus,
  Zap,
  Navigation,
  Clock
} from 'lucide-vue-next';
import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { 
  agvState, 
  factoryLayout, 
  currentAppMode, 
  currentEditorTool, 
  fetchLayout, 
  saveLayout, 
  onVisualEvent, 
  markLayoutDirty, 
  clearLayoutDirty,
  is3DQuickDispatchActive,
  quickDispatchSteps,
  sendDispatchOrder,
  selectedVehicleId,
  dashboardActiveTab,
  cameraFollowTrigger
} from '../services/websocket';
import type { LayoutNode, LayoutProp, LayoutEdge, DispatchAction } from '../types';

const emit = defineEmits<{
  (e: 'notify', msg: string, type: 'success' | 'info' | 'warn'): void;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const currentView = ref<'iso' | 'top' | 'follow'>('iso');

// Babylon references
let engine: BABYLON.Engine | null = null;
let scene: BABYLON.Scene | null = null;
let camera: BABYLON.ArcRotateCamera | null = null;
let gizmoManager: BABYLON.GizmoManager | null = null;

// AGV Meshes & Nodes
let agvRoot: BABYLON.TransformNode | null = null;
let agvGlbRoot: BABYLON.AbstractMesh | null = null;
let cargoMesh: BABYLON.Mesh | null = null;
let beaconMaterial: BABYLON.StandardMaterial | null = null;
let agvHaloMesh: BABYLON.Mesh | null = null;
let quickDispatchPreviewLine: BABYLON.LinesMesh | null = null;

// Dynamic Path & Node meshes dictionary for fast updates
const nodeMeshesMap = new Map<string, BABYLON.Mesh>();
const nodeLabelsMap = new Map<string, BABYLON.Mesh>();
const currentlyActiveLabelNodeId = ref<string | null>(null);
const activeStepIndex = ref<number | null>(0);
const currentAgvStartNode = computed(() => agvState.task_info.current_node || 'Node-01');

const edgeMeshesMap = new Map<string, BABYLON.LinesMesh | BABYLON.Mesh>();
const edgeArrowMeshesMap = new Map<string, BABYLON.AbstractMesh[]>();
const propMeshesMap = new Map<string, BABYLON.AbstractMesh>();

// Dev Tool: GLB Node bindings
const agvNodesList = ref<string[]>([]);
const selectedLiftNodeName = ref<string>('');
const baseLiftPosY = ref<number>(0);

// Problem 2: Interactive Rubber-band connection state & Edge configuration
const edgeFirstNodeId = ref<string | null>(null);
const hoveredNodeId = ref<string | null>(null);
const edgeDirectionMode = ref<'oneway' | 'bidirectional'>('oneway');
const selectedEdgeForEdit = ref<LayoutEdge | null>(null);
let rubberBandLine: BABYLON.LinesMesh | null = null;
let nodeSelectionRing: BABYLON.Mesh | null = null;

// Kinematics Interpolation
const targetPos = new BABYLON.Vector3(0, 0.25, 0);
let currentPos = new BABYLON.Vector3(0, 0.25, 0);
let targetTheta = Math.PI / 2;
let currentTheta = Math.PI / 2;

onMounted(async () => {
  if (!canvasRef.value) return;

  // 1. Initialize Babylon Engine & Scene
  engine = new BABYLON.Engine(canvasRef.value, true, { preserveDrawingBuffer: true, stencil: true });
  scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.04, 0.06, 0.11, 1.0); // Slate OLED dark

  // 2. Setup Camera
  camera = new BABYLON.ArcRotateCamera(
    'FactoryCamera',
    -Math.PI / 3,
    Math.PI / 3.2,
    28,
    new BABYLON.Vector3(5, 0, 5),
    scene
  );
  camera.attachControl(canvasRef.value, true);
  camera.lowerRadiusLimit = 6;
  camera.upperRadiusLimit = 55;
  camera.upperBetaLimit = Math.PI / 2 - 0.05;

  // 3. Setup Lighting
  const hemiLight = new BABYLON.HemisphericLight('HemiLight', new BABYLON.Vector3(0, 1, 0), scene);
  hemiLight.intensity = 0.7;
  hemiLight.diffuse = new BABYLON.Color3(0.9, 0.95, 1.0);
  hemiLight.groundColor = new BABYLON.Color3(0.12, 0.15, 0.22);

  const dirLight = new BABYLON.DirectionalLight('DirLight', new BABYLON.Vector3(-1, -2, -1), scene);
  dirLight.position = new BABYLON.Vector3(20, 35, 20);
  dirLight.intensity = 0.9;
  dirLight.diffuse = new BABYLON.Color3(1, 0.98, 0.94);

  // 4. Setup Floor
  createFactoryFloor(scene);

  // 5. Setup GizmoManager for Edit Mode
  setupGizmoManager(scene);

  // 6. Setup Interactive Pointer Events (Rubber-band, Picking, Selection)
  setupInteractivePointerEvents(scene);

  // 7. Load AGV .glb Model (or fallback to procedural chassis)
  await loadAGVModel(scene);

  // 8. Load Layout from Backend (nodes, edges, static props)
  await loadAndRenderLayout(scene);

  // 9. Register Visual Events for Cargo
  onVisualEvent((event) => {
    if (event === 'pick_done') {
      performPickAnimation(scene!);
    } else if (event === 'drop_done') {
      performDropAnimation(scene!);
    }
  });

  // 10. Watch AGV Position
  watch(
    () => agvState.position,
    (newPos) => {
      targetPos.x = newPos.x;
      targetPos.z = newPos.z !== undefined ? newPos.z : newPos.y;
      targetTheta = newPos.theta;
    },
    { deep: true, immediate: true }
  );

  // 11. Watch VDA 5050 EdgeStates for Dynamic Path Material Rendering
  watch(
    () => [agvState.edge_states, agvState.passed_edges],
    () => {
      updateDynamicPathMaterials();
    },
    { deep: true }
  );

  watch(cameraFollowTrigger, () => {
    if (currentAppMode.value === 'simulate') {
      setCameraView('follow');
    }
  });

  function syncNodeDragBehaviors() {
    const canDrag = (currentAppMode.value === 'edit' && currentEditorTool.value === 'select');
    nodeMeshesMap.forEach((pad) => {
      const dragBehavior = pad.behaviors.find(b => b.name === 'PointerDrag') as BABYLON.PointerDragBehavior | undefined;
      if (dragBehavior) {
        dragBehavior.enabled = canDrag;
      }
    });
  }

  // 12. Watch App Mode & Editor Tool change
  watch(
    [() => currentAppMode.value, () => currentEditorTool.value],
    ([mode, tool]) => {
      syncNodeDragBehaviors();
      if (!gizmoManager) return;
      cancelEdgeConnection();
      selectedEdgeForEdit.value = null;

      if (mode === 'edit') {
        gizmoManager.attachToMesh(null);
        if (tool === 'select') {
          gizmoManager.positionGizmoEnabled = true;
          gizmoManager.rotationGizmoEnabled = true;
        } else {
          gizmoManager.positionGizmoEnabled = false;
          gizmoManager.rotationGizmoEnabled = false;
        }
      } else {
        gizmoManager.attachToMesh(null);
        gizmoManager.positionGizmoEnabled = false;
        gizmoManager.rotationGizmoEnabled = false;
      }
    }
  );

  // 13. Render Loop with 60FPS Lerp Interpolation
  engine.runRenderLoop(() => {
    if (!scene) return;

    if (agvRoot) {
      currentPos = BABYLON.Vector3.Lerp(currentPos, targetPos, 0.18);

      let diff = targetTheta - currentTheta;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      currentTheta += diff * 0.18;

      agvRoot.position.copyFrom(currentPos);
      agvRoot.rotation.y = currentTheta;

      if (currentView.value === 'follow' && camera) {
        camera.target = BABYLON.Vector3.Lerp(camera.target, agvRoot.position, 0.1);
      }
    }

    scene.render();
  });

  // Keyboard shortcut listener (Esc to cancel edge/selection, Del to delete)
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('resize', handleResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('resize', handleResize);
  if (engine) {
    engine.dispose();
    engine = null;
  }
});

function handleResize() {
  if (engine) engine.resize();
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    cancelEdgeConnection();
    selectedEdgeForEdit.value = null;
    gizmoManager?.attachToMesh(null);
  }
}

// ----------------------------------------------------
// Floor Construction
// ----------------------------------------------------
function createFactoryFloor(sc: BABYLON.Scene) {
  const ground = BABYLON.MeshBuilder.CreateGround('GroundFloor', { width: 44, height: 44, subdivisions: 2 }, sc);
  const groundMat = new BABYLON.StandardMaterial('GroundMat', sc);
  groundMat.diffuseColor = new BABYLON.Color3(0.06, 0.08, 0.13);
  groundMat.specularColor = new BABYLON.Color3(0.04, 0.04, 0.07);
  ground.material = groundMat;
  ground.position.y = -0.01;
  ground.isPickable = true;

  // Grid Lines
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

// ----------------------------------------------------
// 3.4 AGV .glb Model Loading & Procedural Mesh Animation
// ----------------------------------------------------
async function loadAGVModel(sc: BABYLON.Scene) {
  agvRoot = new BABYLON.TransformNode('AGV_Root', sc);
  agvRoot.position.set(0, 0.25, 0);

  try {
    const result = await BABYLON.SceneLoader.ImportMeshAsync('', '/models/', 'agv.glb', sc);
    agvGlbRoot = result.meshes[0];
    agvGlbRoot.parent = agvRoot;

    const hierarchy = agvGlbRoot.getHierarchyBoundingVectors();
    const size = hierarchy.max.subtract(hierarchy.min);
    const maxDim = Math.max(size.x, size.y, size.z);
    const scaleFactor = maxDim > 0 ? 1.6 / maxDim : 0.01;
    agvGlbRoot.scaling.setAll(scaleFactor);
    agvGlbRoot.position.set(0, 0.05, 0);

    const foundNames: string[] = [];
    result.transformNodes.forEach(tn => {
      if (tn.name) foundNames.push(tn.name);
    });
    result.meshes.forEach(m => {
      m.isPickable = true;
      m.metadata = { type: 'agv', id: 'AGV-001' };
      if (m.name && !foundNames.includes(m.name)) foundNames.push(m.name);
    });
    agvNodesList.value = foundNames;

    const agvHitbox = BABYLON.MeshBuilder.CreateBox('AGV_Hitbox', { width: 1.8, height: 1.2, depth: 2.2 }, sc);
    agvHitbox.parent = agvRoot;
    agvHitbox.position.y = 0.4;
    agvHitbox.isPickable = true;
    agvHitbox.visibility = 0; // Transparent but fully ray-pickable in Babylon.js
    agvHitbox.metadata = { type: 'agv', id: 'AGV-001' };

    const saved = localStorage.getItem('omnihive_agv_lift_node');
    if (saved && foundNames.includes(saved)) {
      selectedLiftNodeName.value = saved;
    } else {
      const defaultCandidate = foundNames.find(n => n.includes('001') || n.includes('Fork') || n.includes('Platform')) || foundNames[0] || '';
      selectedLiftNodeName.value = defaultCandidate;
    }

    recordBaseLiftPos();
    console.log('[Babylon] AGV .glb loaded successfully. Detected nodes:', foundNames.length);
  } catch (err) {
    console.warn('[Babylon] Failed to load agv.glb, using procedural fallback chassis:', err);
    createFallbackAGV(sc);
  }

  createAGVBeacon(sc);
  createAGVSelectionHalo(sc);
}

function recordBaseLiftPos() {
  if (!scene || !selectedLiftNodeName.value) return;
  const node = scene.getNodeByName(selectedLiftNodeName.value) as BABYLON.TransformNode | BABYLON.Mesh;
  if (node && 'position' in node) {
    baseLiftPosY.value = node.position.y;
  }
}

function createFallbackAGV(sc: BABYLON.Scene) {
  if (!agvRoot) return;
  const chassis = BABYLON.MeshBuilder.CreateBox('AGV_Chassis', { width: 1.2, height: 0.38, depth: 1.6 }, sc);
  chassis.parent = agvRoot;
  chassis.position.y = 0.15;
  chassis.isPickable = true;
  chassis.metadata = { type: 'agv', id: 'AGV-001' };
  const chassisMat = new BABYLON.StandardMaterial('AGV_ChassisMat', sc);
  chassisMat.diffuseColor = new BABYLON.Color3(0.15, 0.17, 0.22);
  chassis.material = chassisMat;

  const platform = BABYLON.MeshBuilder.CreateCylinder('AGV_Platform', { diameter: 1.05, height: 0.08, tessellation: 32 }, sc);
  platform.parent = agvRoot;
  platform.position.y = 0.38;
  platform.isPickable = true;
  platform.metadata = { type: 'agv', id: 'AGV-001' };
  const platMat = new BABYLON.StandardMaterial('PlatMat', sc);
  platMat.diffuseColor = new BABYLON.Color3(0.9, 0.65, 0.08);
  platform.material = platMat;

  agvNodesList.value = ['AGV_Platform', 'AGV_Chassis'];
  selectedLiftNodeName.value = 'AGV_Platform';
  baseLiftPosY.value = 0.38;
  createAGVSelectionHalo(sc);
}

function createAGVSelectionHalo(sc: BABYLON.Scene) {
  if (!agvRoot) return;
  if (agvHaloMesh) agvHaloMesh.dispose();
  agvHaloMesh = BABYLON.MeshBuilder.CreateTorus('AGV_Halo', {
    diameter: 2.2,
    thickness: 0.05,
    tessellation: 32
  }, sc);
  agvHaloMesh.parent = agvRoot;
  agvHaloMesh.position.y = 0.03;
  const mat = new BABYLON.StandardMaterial('AGV_HaloMat', sc);
  mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
  mat.emissiveColor = new BABYLON.Color3(0.06, 0.75, 1.0); // Bright Neon Cyan
  agvHaloMesh.material = mat;
  agvHaloMesh.isVisible = is3DQuickDispatchActive.value;
  agvHaloMesh.isPickable = false;
}

function createAGVBeacon(sc: BABYLON.Scene) {
  if (!agvRoot) return;
  const beacon = BABYLON.MeshBuilder.CreateSphere('AGV_Beacon', { diameter: 0.2, segments: 16 }, sc);
  beacon.parent = agvRoot;
  beacon.position.set(0, 0.52, -0.6);
  beaconMaterial = new BABYLON.StandardMaterial('BeaconMat', sc);
  beaconMaterial.emissiveColor = new BABYLON.Color3(0.1, 0.85, 0.4);
  beacon.material = beaconMaterial;

  watch(
    () => agvState.task_info.status,
    (st) => {
      if (!beaconMaterial) return;
      if (st === 'DRIVING') beaconMaterial.emissiveColor = new BABYLON.Color3(0.06, 0.75, 1.0);
      else if (st === 'ACTING') beaconMaterial.emissiveColor = new BABYLON.Color3(1.0, 0.55, 0.0);
      else beaconMaterial.emissiveColor = new BABYLON.Color3(0.1, 0.85, 0.4);
    },
    { immediate: true }
  );
}

// ----------------------------------------------------
// 3.4 Pick & Drop Procedural Animation
// ----------------------------------------------------
function performPickAnimation(sc: BABYLON.Scene) {
  if (!agvRoot) return;

  if (cargoMesh) cargoMesh.dispose();
  cargoMesh = BABYLON.MeshBuilder.CreateBox('CargoBox', { width: 0.72, height: 0.55, depth: 0.72 }, sc);
  const cargoMat = new BABYLON.StandardMaterial('CargoMat', sc);
  cargoMat.diffuseColor = new BABYLON.Color3(0.94, 0.52, 0.1);
  cargoMat.emissiveColor = new BABYLON.Color3(0.2, 0.1, 0.02);
  cargoMesh.material = cargoMat;

  const liftNode = (selectedLiftNodeName.value ? sc.getNodeByName(selectedLiftNodeName.value) : null) as BABYLON.TransformNode | BABYLON.Mesh;
  const attachParent = liftNode || agvRoot;

  cargoMesh.parent = attachParent;
  cargoMesh.position.set(0, 0.55, 0);

  if (liftNode && 'position' in liftNode) {
    const startY = baseLiftPosY.value;
    BABYLON.Animation.CreateAndStartAnimation(
      'liftPickAnim',
      liftNode,
      'position.y',
      30,
      20,
      startY,
      startY + 0.15,
      BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
    );
  }
}

function performDropAnimation(sc: BABYLON.Scene) {
  const liftNode = (selectedLiftNodeName.value ? sc.getNodeByName(selectedLiftNodeName.value) : null) as BABYLON.TransformNode | BABYLON.Mesh;

  if (liftNode && 'position' in liftNode) {
    const startY = liftNode.position.y;
    BABYLON.Animation.CreateAndStartAnimation(
      'liftDropAnim',
      liftNode,
      'position.y',
      30,
      20,
      startY,
      baseLiftPosY.value,
      BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
    );
  }

  if (!cargoMesh) return;
  const worldPos = cargoMesh.getAbsolutePosition().clone();
  cargoMesh.parent = null;
  cargoMesh.position.copyFrom(worldPos);

  const curY = cargoMesh.position.y;
  BABYLON.Animation.CreateAndStartAnimation(
    'cargoUnload',
    cargoMesh,
    'position.y',
    30,
    20,
    curY,
    0.35,
    BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
  );

  setTimeout(() => {
    if (cargoMesh) {
      cargoMesh.dispose();
      cargoMesh = null;
    }
  }, 1200);
}

// ----------------------------------------------------
// 3.1 & 3.5 Layout Rendering & Directional Arrows
// ----------------------------------------------------
async function loadAndRenderLayout(sc: BABYLON.Scene) {
  await fetchLayout();
  rebuildLayoutInScene(sc);
}

function rebuildLayoutInScene(sc: BABYLON.Scene) {
  nodeMeshesMap.forEach(m => m.dispose());
  nodeMeshesMap.clear();

  nodeLabelsMap.forEach(m => {
    if (m.material) m.material.dispose();
    m.dispose();
  });
  nodeLabelsMap.clear();
  currentlyActiveLabelNodeId.value = null;

  edgeMeshesMap.forEach(m => m.dispose());
  edgeMeshesMap.clear();

  edgeArrowMeshesMap.forEach(arrows => arrows.forEach(a => a.dispose()));
  edgeArrowMeshesMap.clear();

  propMeshesMap.forEach(m => m.dispose());
  propMeshesMap.clear();

  factoryLayout.nodes.forEach(node => {
    createNodeInScene(sc, node);
  });

  factoryLayout.edges.forEach(edge => {
    createEdgeInScene(sc, edge);
  });

  factoryLayout.props.forEach(prop => {
    createPropInScene(sc, prop);
  });

  updateDynamicPathMaterials();
}

function getNodeColor(func: string): BABYLON.Color3 {
  switch (func) {
    case 'Idle/Charge': return new BABYLON.Color3(0.06, 0.75, 1.0); // Cyan
    case 'Transit': return new BABYLON.Color3(0.39, 0.4, 0.95); // Indigo
    case 'Pick-up': return new BABYLON.Color3(0.96, 0.62, 0.04); // Amber
    case 'Drop-off': return new BABYLON.Color3(0.06, 0.73, 0.51); // Emerald
    default: return new BABYLON.Color3(0.5, 0.5, 0.6);
  }
}

function getNodeFunctionLabel(func: string): string {
  switch (func) {
    case 'Idle/Charge': return '充電待機站';
    case 'Transit': return '通行導引站';
    case 'Pick-up': return '取貨作業站';
    case 'Drop-off': return '卸貨作業站';
    default: return func || '一般站點';
  }
}

function isChargingNode(nodeId: string): boolean {
  if (!nodeId) return false;
  const node = factoryLayout.nodes.find(n => n.id === nodeId);
  if (!node) return false;
  return node.function === 'Idle/Charge' || node.name.includes('充電') || node.id.toLowerCase().includes('charge');
}

function getNodeNameOnly(id: string): string {
  if (!id) return '';
  const n = factoryLayout.nodes.find(node => node.id === id);
  return n ? n.name : id;
}

function showNodeLabel(nodeId: string) {
  nodeLabelsMap.forEach((mesh, id) => {
    mesh.isVisible = (id === nodeId);
  });
  currentlyActiveLabelNodeId.value = nodeId;
}

function hideAllNodeLabels() {
  nodeLabelsMap.forEach(mesh => {
    mesh.isVisible = false;
  });
  currentlyActiveLabelNodeId.value = null;
}

function createNodeInScene(sc: BABYLON.Scene, node: LayoutNode) {
  const color = getNodeColor(node.function);

  // Compact, high-precision station disc (diameter 0.55m, height 0.03m)
  const pad = BABYLON.MeshBuilder.CreateCylinder(`Pad_${node.id}`, {
    diameter: 0.55,
    height: 0.03,
    tessellation: 32
  }, sc);
  pad.position.set(node.x, 0.04, node.z);
  pad.metadata = { type: 'node', id: node.id };
  pad.isPickable = true;

  const padMat = new BABYLON.StandardMaterial(`PadMat_${node.id}`, sc);
  padMat.diffuseColor = color.scale(0.35);
  padMat.emissiveColor = color.scale(0.75);
  pad.material = padMat;

  // Thin outer highlight ring (diameter 0.65m)
  const ring = BABYLON.MeshBuilder.CreateTorus(`Ring_${node.id}`, {
    diameter: 0.65,
    thickness: 0.02,
    tessellation: 32
  }, sc);
  ring.parent = pad;
  ring.position.set(0, 0.005, 0);
  ring.material = padMat;
  ring.isPickable = false;

  createNodeLabel(sc, pad, node);

  // Direct 2D floor planar drag behavior without directional arrows
  const dragBehavior = new BABYLON.PointerDragBehavior({
    dragPlaneNormal: new BABYLON.Vector3(0, 1, 0)
  });
  dragBehavior.useObjectOrientationForDragging = false;
  dragBehavior.enabled = (currentAppMode.value === 'edit' && currentEditorTool.value === 'select');

  dragBehavior.onDragObservable.add(() => {
    pad.position.y = 0.04;
    const n = factoryLayout.nodes.find(item => item.id === node.id);
    if (n) {
      n.x = pad.position.x;
      n.z = pad.position.z;
      updateEdgesForNode(sc, node.id);
    }
  });

  dragBehavior.onDragEndObservable.add(() => {
    pad.position.y = 0.04;
    const n = factoryLayout.nodes.find(item => item.id === node.id);
    if (n) {
      n.x = Math.round(pad.position.x * 100) / 100;
      n.z = Math.round(pad.position.z * 100) / 100;
      pad.position.x = n.x;
      pad.position.z = n.z;
      updateEdgesForNode(sc, node.id);
    }
    markLayoutDirty();
  });

  pad.addBehavior(dragBehavior);
  nodeMeshesMap.set(node.id, pad);
}

function updateEdgesForNode(sc: BABYLON.Scene, nodeId: string) {
  const connectedEdges = factoryLayout.edges.filter(
    e => e.startNodeId === nodeId || e.endNodeId === nodeId
  );
  if (connectedEdges.length === 0) return;

  connectedEdges.forEach(edge => {
    const oldMesh = edgeMeshesMap.get(edge.id);
    if (oldMesh) {
      if (oldMesh.material) oldMesh.material.dispose();
      oldMesh.dispose();
      edgeMeshesMap.delete(edge.id);
    }
    const oldArrows = edgeArrowMeshesMap.get(edge.id);
    if (oldArrows) {
      oldArrows.forEach(a => {
        if (a.material) a.material.dispose();
        a.dispose();
      });
      edgeArrowMeshesMap.delete(edge.id);
    }
    createEdgeInScene(sc, edge);
  });

  updateDynamicPathMaterials();
}

function createNodeLabel(sc: BABYLON.Scene, parent: BABYLON.Mesh, node: LayoutNode) {
  // Item 4: Floating badge with Station ID, Name and Purpose (用途)
  const dynamicTexture = new BABYLON.DynamicTexture(`Text_${node.id}`, { width: 360, height: 120 }, sc, false);
  dynamicTexture.hasAlpha = true;
  const ctx = dynamicTexture.getContext() as any;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
  if (ctx.roundRect) ctx.roundRect(6, 6, 348, 108, 14);
  else ctx.rect(6, 6, 348, 108);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = `#${getNodeColor(node.function).toHexString().substring(1)}`;
  ctx.stroke();

  // Line 1: Station ID + Name
  dynamicTexture.drawText(`${node.id} · ${node.name}`, 20, 44, 'bold 24px -apple-system, sans-serif', '#ffffff', 'transparent', true);
  // Line 2: Purpose / Function
  const funcDesc = `用途: ${getNodeFunctionLabel(node.function)}`;
  dynamicTexture.drawText(funcDesc, 20, 86, '600 20px -apple-system, sans-serif', '#38bdf8', 'transparent', true);

  const plane = BABYLON.MeshBuilder.CreatePlane(`Label_${node.id}`, { width: 1.1, height: 0.38 }, sc);
  plane.parent = parent;
  plane.position.set(0, 0.62, 0);
  plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
  plane.isPickable = false;

  const mat = new BABYLON.StandardMaterial(`LabelMat_${node.id}`, sc);
  mat.diffuseTexture = dynamicTexture;
  mat.specularColor = new BABYLON.Color3(0, 0, 0);
  mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
  mat.backFaceCulling = false;
  plane.material = mat;

  // Item 4: Default hidden! Only shown when clicked in 3D map
  plane.isVisible = false;
  nodeLabelsMap.set(node.id, plane);
}

// Item 3: Golden Proportions for Path Tube & Directional Arrows
function createEdgeInScene(sc: BABYLON.Scene, edge: LayoutEdge) {
  const start = factoryLayout.nodes.find(n => n.id === edge.startNodeId);
  const end = factoryLayout.nodes.find(n => n.id === edge.endNodeId);
  if (!start || !end) return;

  const startPos = new BABYLON.Vector3(start.x, 0.02, start.z);
  const endPos = new BABYLON.Vector3(end.x, 0.02, end.z);
  const points = [startPos, endPos];

  // 1. Path Tube: Slim, elegant factory floor track (diameter 0.07m, radius 0.035)
  const tube = BABYLON.MeshBuilder.CreateTube(`Edge_${edge.id}`, {
    path: points,
    radius: 0.035,
    sideOrientation: BABYLON.Mesh.DOUBLESIDE
  }, sc);
  tube.metadata = { 
    type: 'edge', 
    id: edge.id, 
    startNodeId: edge.startNodeId, 
    endNodeId: edge.endNodeId,
    bidirectional: !!edge.bidirectional
  };
  tube.isPickable = true;

  const mat = new BABYLON.StandardMaterial(`EdgeMat_${edge.id}`, sc);
  tube.material = mat;
  edgeMeshesMap.set(edge.id, tube);

  // 2. 3D Directional Arrows along edge (compact, proportional)
  const arrows: BABYLON.AbstractMesh[] = [];
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const forwardTheta = Math.atan2(dx, dz);

  const arrowMat = new BABYLON.StandardMaterial(`ArrowMat_${edge.id}`, sc);
  arrowMat.diffuseColor = new BABYLON.Color3(0.1, 0.8, 0.9);
  arrowMat.emissiveColor = edge.bidirectional 
    ? new BABYLON.Color3(0.1, 0.9, 0.6) 
    : new BABYLON.Color3(0.1, 0.7, 0.9);

  if (edge.bidirectional) {
    // Dual Opposing Arrows for Two-Way Path
    const p1 = BABYLON.Vector3.Lerp(startPos, endPos, 0.38);
    const arrow1 = BABYLON.MeshBuilder.CreateCylinder(`Arr1_${edge.id}`, {
      diameterTop: 0,
      diameterBottom: 0.14,
      height: 0.20,
      tessellation: 3
    }, sc);
    arrow1.position.set(p1.x, 0.03, p1.z);
    arrow1.rotation.x = Math.PI / 2;
    arrow1.rotation.y = forwardTheta;
    arrow1.material = arrowMat;
    arrow1.isPickable = false;
    arrows.push(arrow1);

    const p2 = BABYLON.Vector3.Lerp(startPos, endPos, 0.62);
    const arrow2 = BABYLON.MeshBuilder.CreateCylinder(`Arr2_${edge.id}`, {
      diameterTop: 0,
      diameterBottom: 0.14,
      height: 0.20,
      tessellation: 3
    }, sc);
    arrow2.position.set(p2.x, 0.03, p2.z);
    arrow2.rotation.x = Math.PI / 2;
    arrow2.rotation.y = forwardTheta + Math.PI; // Reverse direction
    arrow2.material = arrowMat;
    arrow2.isPickable = false;
    arrows.push(arrow2);
  } else {
    // Single Arrowhead for One-Way Path
    const midPos = BABYLON.Vector3.Lerp(startPos, endPos, 0.5);
    const arrow = BABYLON.MeshBuilder.CreateCylinder(`Arr_${edge.id}`, {
      diameterTop: 0,
      diameterBottom: 0.16,
      height: 0.22,
      tessellation: 3
    }, sc);
    arrow.position.set(midPos.x, 0.03, midPos.z);
    arrow.rotation.x = Math.PI / 2;
    arrow.rotation.y = forwardTheta;
    arrow.material = arrowMat;
    arrow.isPickable = false;
    arrows.push(arrow);
  }

  edgeArrowMeshesMap.set(edge.id, arrows);
}

// 3.1 Dynamic Path Material Rendering: 3 states
function updateDynamicPathMaterials() {
  const activeEdges = agvState.edge_states || [];
  const passedEdges = agvState.passed_edges || [];

  edgeMeshesMap.forEach((mesh, edgeId) => {
    const mat = mesh.material as BABYLON.StandardMaterial;
    if (!mat) return;

    if (activeEdges.includes(edgeId)) {
      mat.emissiveColor = new BABYLON.Color3(0.08, 0.95, 0.85); // Neon Cyan
      mat.diffuseColor = new BABYLON.Color3(0.05, 0.7, 0.6);
      mat.alpha = 1.0;
    } else if (passedEdges.includes(edgeId)) {
      mat.emissiveColor = new BABYLON.Color3(0.12, 0.16, 0.22);
      mat.diffuseColor = new BABYLON.Color3(0.08, 0.1, 0.15);
      mat.alpha = 0.35;
    } else {
      mat.emissiveColor = new BABYLON.Color3(0.22, 0.26, 0.35);
      mat.diffuseColor = new BABYLON.Color3(0.15, 0.18, 0.25);
      mat.alpha = 0.55;
    }
  });
}

function createPropInScene(sc: BABYLON.Scene, prop: LayoutProp) {
  let mesh: BABYLON.AbstractMesh;

  if (prop.modelType === 'pillar') {
    mesh = BABYLON.MeshBuilder.CreateBox(`Prop_${prop.id}`, { width: 0.45, height: 1.6, depth: 0.45 }, sc);
    mesh.position.set(prop.x, 0.8, prop.z);
    const mat = new BABYLON.StandardMaterial(`PropMat_${prop.id}`, sc);
    mat.diffuseColor = new BABYLON.Color3(0.2, 0.25, 0.32);
    mat.emissiveColor = new BABYLON.Color3(0.02, 0.5, 0.7);
    mesh.material = mat;
  } else if (prop.modelType === 'rack' || prop.modelType === 'push_back') {
    mesh = BABYLON.MeshBuilder.CreateBox(`Prop_${prop.id}`, { width: 1.6, height: 1.1, depth: 1.0 }, sc);
    mesh.position.set(prop.x, 0.55, prop.z);
    const mat = new BABYLON.StandardMaterial(`PropMat_${prop.id}`, sc);
    mat.diffuseColor = new BABYLON.Color3(0.25, 0.28, 0.35);
    mat.emissiveColor = new BABYLON.Color3(0.65, 0.38, 0.05);
    mesh.material = mat;
  } else if (prop.modelType === 'pallet') {
    mesh = BABYLON.MeshBuilder.CreateBox(`Prop_${prop.id}`, { width: 1.2, height: 0.15, depth: 1.0 }, sc);
    mesh.position.set(prop.x, 0.075, prop.z);
    const mat = new BABYLON.StandardMaterial(`PropMat_${prop.id}`, sc);
    mat.diffuseColor = new BABYLON.Color3(0.15, 0.35, 0.65);
    mesh.material = mat;
  } else {
    mesh = BABYLON.MeshBuilder.CreateBox(`Prop_${prop.id}`, { width: 1.5, height: 0.4, depth: 1.5 }, sc);
    mesh.position.set(prop.x, 0.2, prop.z);
    const mat = new BABYLON.StandardMaterial(`PropMat_${prop.id}`, sc);
    mat.diffuseColor = new BABYLON.Color3(0.18, 0.35, 0.25);
    mat.emissiveColor = new BABYLON.Color3(0.05, 0.45, 0.25);
    mesh.material = mat;
  }

  mesh.rotation.y = prop.rotationY;
  mesh.scaling.setAll(prop.scale || 1.0);
  mesh.metadata = { type: 'prop', id: prop.id };
  mesh.isPickable = true;

  propMeshesMap.set(prop.id, mesh);
}

// ----------------------------------------------------
// Gizmo Setup & Layout Sync (Item 1: Strictly 2D Planar Ground Movement)
// ----------------------------------------------------
function setupGizmoManager(sc: BABYLON.Scene) {
  gizmoManager = new BABYLON.GizmoManager(sc);
  gizmoManager.positionGizmoEnabled = true;
  gizmoManager.rotationGizmoEnabled = true;

  if (gizmoManager.gizmos.positionGizmo) {
    const pos = gizmoManager.gizmos.positionGizmo;
    pos.planarGizmoEnabled = true;
    if (pos.yGizmo) pos.yGizmo.isEnabled = false; // Strictly forbid Y-axis vertical translation!
    if (pos.xPlaneGizmo) pos.xPlaneGizmo.isEnabled = false;
    if (pos.zPlaneGizmo) pos.zPlaneGizmo.isEnabled = false;
    if (pos.yPlaneGizmo) pos.yPlaneGizmo.isEnabled = true; // X-Z ground plane movement handle

    pos.onDragEndObservable.add(() => {
      syncGizmoTargetToLayout();
      markLayoutDirty();
    });
  }

  if (gizmoManager.gizmos.rotationGizmo) {
    const rot = gizmoManager.gizmos.rotationGizmo;
    if (rot.xGizmo) rot.xGizmo.isEnabled = false;
    if (rot.zGizmo) rot.zGizmo.isEnabled = false;
    if (rot.yGizmo) rot.yGizmo.isEnabled = true; // Allow Y rotation for props only

    rot.onDragEndObservable.add(() => {
      syncGizmoTargetToLayout();
      markLayoutDirty();
    });
  }

  // Detach initially
  gizmoManager.attachToMesh(null);
  gizmoManager.positionGizmoEnabled = false;
  gizmoManager.rotationGizmoEnabled = false;
}

function attachGizmoToTarget(mesh: BABYLON.AbstractMesh | null) {
  if (!gizmoManager) return;
  if (!mesh || !mesh.metadata) {
    gizmoManager.attachToMesh(null);
    clearNodeSelection();
    return;
  }

  const meta = mesh.metadata;
  if (meta.type === 'node') {
    // 1. Nodes: Station coordinates on floor (X/Z).
    // NO gizmo arrows! Direct dragging is handled by PointerDragBehavior on the mesh.
    gizmoManager.attachToMesh(null);
    highlightSelectedNode(scene!, mesh);
  } else if (meta.type === 'prop') {
    clearNodeSelection();
    // 2. Props (Racks): Can move on floor and rotate around Y axis
    gizmoManager.positionGizmoEnabled = true;
    gizmoManager.rotationGizmoEnabled = true;
    gizmoManager.attachToMesh(mesh);

    if (gizmoManager.gizmos.positionGizmo) {
      const pos = gizmoManager.gizmos.positionGizmo;
      if (pos.yGizmo) pos.yGizmo.isEnabled = false;
      pos.planarGizmoEnabled = true;
      if (pos.xPlaneGizmo) pos.xPlaneGizmo.isEnabled = false;
      if (pos.zPlaneGizmo) pos.zPlaneGizmo.isEnabled = false;
      if (pos.yPlaneGizmo) pos.yPlaneGizmo.isEnabled = true;
    }
    if (gizmoManager.gizmos.rotationGizmo) {
      const rot = gizmoManager.gizmos.rotationGizmo;
      if (rot.xGizmo) rot.xGizmo.isEnabled = false;
      if (rot.zGizmo) rot.zGizmo.isEnabled = false;
      if (rot.yGizmo) rot.yGizmo.isEnabled = true;
    }
  }
}

function syncGizmoTargetToLayout() {
  if (!gizmoManager || !gizmoManager.attachedMesh) return;
  const m = gizmoManager.attachedMesh;
  const meta = m.metadata;
  if (!meta) return;

  if (meta.type === 'node') {
    m.position.y = 0.04; // Strictly enforce ground altitude!
    const node = factoryLayout.nodes.find(n => n.id === meta.id);
    if (node) {
      node.x = Math.round(m.position.x * 100) / 100;
      node.z = Math.round(m.position.z * 100) / 100;
      node.y = 0;
      rebuildEdgesOnly(scene!);
    }
  } else if (meta.type === 'prop') {
    const prop = factoryLayout.props.find(p => p.id === meta.id);
    if (prop) {
      prop.x = Math.round(m.position.x * 100) / 100;
      prop.z = Math.round(m.position.z * 100) / 100;
      prop.rotationY = Math.round(m.rotation.y * 100) / 100;
    }
  }
}

function rebuildEdgesOnly(sc: BABYLON.Scene) {
  edgeMeshesMap.forEach(m => m.dispose());
  edgeMeshesMap.clear();

  edgeArrowMeshesMap.forEach(arrows => arrows.forEach(a => a.dispose()));
  edgeArrowMeshesMap.clear();

  factoryLayout.edges.forEach(edge => {
    createEdgeInScene(sc, edge);
  });
  updateDynamicPathMaterials();
}

// ----------------------------------------------------
// Problem 2: Rubber-band Connection & Pointer Events
// ----------------------------------------------------
function setupInteractivePointerEvents(sc: BABYLON.Scene) {
  sc.onPointerObservable.add((pointerInfo) => {
    // 1. Simulation Mode: Interactive 3D Vehicle & Node Dispatch
    if (currentAppMode.value === 'simulate') {
      if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERMOVE) {
        const pick = pointerInfo.pickInfo;
        if (pick && pick.hit && pick.pickedMesh) {
          const type = pick.pickedMesh.metadata?.type;
          if (type === 'agv' || type === 'node') {
            sc.defaultCursor = 'pointer';
            return;
          }
        }
        sc.defaultCursor = 'default';
        return;
      }

      if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERDOWN) {
        const pick = pointerInfo.pickInfo;
        if (!pick || !pick.hit || !pick.pickedMesh) {
          // Item 4: Clicked empty background floor -> hide all labels
          hideAllNodeLabels();
          return;
        }

        // A. Clicked AGV Vehicle directly in 3D!
        if (pick.pickedMesh.metadata?.type === 'agv') {
          selectedVehicleId.value = 'AGV-001';
          dashboardActiveTab.value = 'vehicle';
          is3DQuickDispatchActive.value = true;
          resetDispatchSteps();
          setCameraView('follow');
          if (agvHaloMesh) agvHaloMesh.isVisible = true;
          updateQuickDispatchPreviewLine(sc);
          hideAllNodeLabels();
          emit('notify', `已鎖定車輛 ${selectedVehicleId.value}，鏡頭自動平滑跟隨！`, 'info');
          return;
        }

        // B. Clicked Node directly in 3D!
        if (pick.pickedMesh.metadata?.type === 'node') {
          const nodeId = pick.pickedMesh.metadata.id;
          // Item 4: Show clicked node label with name & purpose
          showNodeLabel(nodeId);
          triggerNodeTargetRipple(sc, pick.pickedMesh);

          if (is3DQuickDispatchActive.value) {
            addOrSelectNodeFromMap(nodeId);
            updateQuickDispatchPreviewLine(sc);
            const nodeObj = factoryLayout.nodes.find(n => n.id === nodeId);
            emit('notify', `已加入站點: ${nodeId} (${nodeObj?.name || ''}) - ${getNodeFunctionLabel(nodeObj?.function || '')}`, 'info');
          } else {
            const nodeObj = factoryLayout.nodes.find(n => n.id === nodeId);
            emit('notify', `站點資訊: ${nodeId} (${nodeObj?.name || ''}) - ${getNodeFunctionLabel(nodeObj?.function || '')}`, 'info');
          }
          return;
        }

        // Clicked ground or prop -> hide node labels
        hideAllNodeLabels();
      }
      return;
    }

    // 2. Edit Mode: Tool interactions
    if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERMOVE) {
      handlePointerMoveInEditMode(sc, pointerInfo);
    } else if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERDOWN) {
      handlePointerDownInEditMode(sc, pointerInfo);
    }
  });
}

function triggerNodeTargetRipple(sc: BABYLON.Scene, nodeMesh: BABYLON.AbstractMesh) {
  const ripple = BABYLON.MeshBuilder.CreateTorus('Ripple', { diameter: 1.6, thickness: 0.05, tessellation: 32 }, sc);
  ripple.position.copyFrom(nodeMesh.position);
  ripple.position.y += 0.02;

  const mat = new BABYLON.StandardMaterial('RippleMat', sc);
  mat.emissiveColor = new BABYLON.Color3(0.2, 0.9, 1.0);
  mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
  ripple.material = mat;

  BABYLON.Animation.CreateAndStartAnimation(
    'rippleScale',
    ripple,
    'scaling',
    30,
    18,
    new BABYLON.Vector3(1, 1, 1),
    new BABYLON.Vector3(1.5, 1.5, 1.5),
    BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
  );

  setTimeout(() => {
    ripple.dispose();
  }, 600);
}

function handlePointerMoveInEditMode(sc: BABYLON.Scene, pointerInfo: BABYLON.PointerInfo) {
  if (currentEditorTool.value !== 'add_edge' || !edgeFirstNodeId.value) {
    if (rubberBandLine) {
      rubberBandLine.dispose();
      rubberBandLine = null;
    }
    hoveredNodeId.value = null;
    return;
  }

  const startNode = factoryLayout.nodes.find(n => n.id === edgeFirstNodeId.value);
  if (!startNode) return;

  const pickResult = pointerInfo.pickInfo;
  if (!pickResult || !pickResult.hit) return;

  const startPoint = new BABYLON.Vector3(startNode.x, 0.04, startNode.z);
  let endPoint = pickResult.pickedPoint || startPoint;

  // Check if hovering over another node
  if (pickResult.pickedMesh && pickResult.pickedMesh.metadata?.type === 'node') {
    const targetId = pickResult.pickedMesh.metadata.id;
    if (targetId !== edgeFirstNodeId.value) {
      const targetNode = factoryLayout.nodes.find(n => n.id === targetId);
      if (targetNode) {
        endPoint = new BABYLON.Vector3(targetNode.x, 0.04, targetNode.z);
        hoveredNodeId.value = targetId;
      }
    } else {
      hoveredNodeId.value = null;
    }
  } else {
    hoveredNodeId.value = null;
  }

  // Create or update dynamic rubber-band line
  if (rubberBandLine) {
    rubberBandLine.dispose();
  }
  rubberBandLine = BABYLON.MeshBuilder.CreateLines('RubberBandPreview', {
    points: [startPoint, endPoint]
  }, sc);
  rubberBandLine.color = new BABYLON.Color3(0.96, 0.62, 0.04); // Glowing Amber
  rubberBandLine.isPickable = false;
}

function handlePointerDownInEditMode(sc: BABYLON.Scene, pointerInfo: BABYLON.PointerInfo) {
  const pickResult = pointerInfo.pickInfo;
  if (!pickResult || !pickResult.hit) return;

  const pickedMesh = pickResult.pickedMesh;
  const tool = currentEditorTool.value;

  if (tool === 'select') {
    if (pickedMesh && pickedMesh.metadata) {
      if (pickedMesh.metadata.type === 'edge') {
        const edgeId = pickedMesh.metadata.id;
        const edge = factoryLayout.edges.find(e => e.id === edgeId);
        if (edge) selectedEdgeForEdit.value = edge;
      } else {
        selectedEdgeForEdit.value = null;
        attachGizmoToTarget(pickedMesh);
      }
    } else {
      attachGizmoToTarget(null);
      selectedEdgeForEdit.value = null;
    }
  } else if (tool === 'add_node') {
    const point = pickResult.pickedPoint;
    if (point) {
      const nextIdx = factoryLayout.nodes.length + 1;
      const newId = `Node-${String(nextIdx).padStart(2, '0')}`;
      const newNode: LayoutNode = {
        id: newId,
        name: `自訂站點 ${newId}`,
        x: Math.round(point.x * 10) / 10,
        y: 0,
        z: Math.round(point.z * 10) / 10,
        function: 'Transit',
        description: '場域編輯器新增站點'
      };
      factoryLayout.nodes.push(newNode);
      createNodeInScene(sc, newNode);
      markLayoutDirty();
      emit('notify', `新增節點: ${newId} (${newNode.x}, ${newNode.z})`, 'success');
    }
  } else if (tool === 'add_edge') {
    // Problem 2 Rubber-band click-to-connect logic
    if (pickedMesh && pickedMesh.metadata?.type === 'node') {
      const nodeId = pickedMesh.metadata.id;

      if (!edgeFirstNodeId.value) {
        // Step 1: Select start node
        edgeFirstNodeId.value = nodeId;
        highlightStartNode(sc, pickedMesh);
        emit('notify', `已選取起點: ${nodeId}，請游標拉線點選目標節點`, 'info');
      } else if (edgeFirstNodeId.value === nodeId) {
        emit('notify', '起點與終點不能為同一節點', 'warn');
      } else {
        // Step 2: Connect to end node
        const startId = edgeFirstNodeId.value;
        const endId = nodeId;
        cancelEdgeConnection();

        const edgeId = `Edge-${startId.replace('Node-', '')}-${endId.replace('Node-', '')}`;
        const isBidir = (edgeDirectionMode.value === 'bidirectional');

        // Check if edge already exists
        const existingIdx = factoryLayout.edges.findIndex(e => 
          (e.startNodeId === startId && e.endNodeId === endId) ||
          (isBidir && e.startNodeId === endId && e.endNodeId === startId)
        );

        if (existingIdx >= 0) {
          emit('notify', `路徑 ${startId} 與 ${endId} 之間已存在連線`, 'warn');
        } else {
          const newEdge: LayoutEdge = {
            id: edgeId,
            startNodeId: startId,
            endNodeId: endId,
            bidirectional: isBidir
          };
          factoryLayout.edges.push(newEdge);
          createEdgeInScene(sc, newEdge);
          updateDynamicPathMaterials();
          markLayoutDirty();
          emit('notify', `已建立路徑: ${startId} ${isBidir ? '⇄' : '➔'} ${endId} (${isBidir ? '雙向' : '單向'})`, 'success');
        }
      }
    } else {
      cancelEdgeConnection();
    }
  } else if (tool === 'add_prop') {
    const point = pickResult.pickedPoint;
    if (point) {
      const nextId = `Rack-${String(factoryLayout.props.length + 1).padStart(2, '0')}`;
      const newProp: LayoutProp = {
        id: nextId,
        modelType: 'rack',
        x: Math.round(point.x * 10) / 10,
        y: 0,
        z: Math.round(point.z * 10) / 10,
        rotationY: 0,
        scale: 1.0
      };
      factoryLayout.props.push(newProp);
      createPropInScene(sc, newProp);
      markLayoutDirty();
      emit('notify', `已放置貨架: ${nextId}`, 'success');
    }
  } else if (tool === 'delete') {
    if (pickedMesh && pickedMesh.metadata) {
      const meta = pickedMesh.metadata;
      if (meta.type === 'node') {
        factoryLayout.nodes = factoryLayout.nodes.filter(n => n.id !== meta.id);
        factoryLayout.edges = factoryLayout.edges.filter(e => e.startNodeId !== meta.id && e.endNodeId !== meta.id);
        pickedMesh.dispose();
        rebuildEdgesOnly(sc);
        gizmoManager?.attachToMesh(null);
        markLayoutDirty();
        emit('notify', `已刪除節點: ${meta.id}`, 'info');
      } else if (meta.type === 'edge') {
        factoryLayout.edges = factoryLayout.edges.filter(e => e.id !== meta.id);
        pickedMesh.dispose();
        const arrows = edgeArrowMeshesMap.get(meta.id);
        if (arrows) arrows.forEach(a => a.dispose());
        edgeArrowMeshesMap.delete(meta.id);
        selectedEdgeForEdit.value = null;
        markLayoutDirty();
        emit('notify', `已刪除路徑: ${meta.id}`, 'info');
      } else if (meta.type === 'prop') {
        factoryLayout.props = factoryLayout.props.filter(p => p.id !== meta.id);
        pickedMesh.dispose();
        gizmoManager?.attachToMesh(null);
        markLayoutDirty();
        emit('notify', `已刪除物件: ${meta.id}`, 'info');
      }
    }
  }
}

function highlightSelectedNode(sc: BABYLON.Scene, nodeMesh: BABYLON.AbstractMesh) {
  clearNodeSelection();
  nodeSelectionRing = BABYLON.MeshBuilder.CreateTorus('SelectedNodeTorus', { 
    diameter: 0.85, 
    thickness: 0.025, 
    tessellation: 32 
  }, sc);
  nodeSelectionRing.parent = nodeMesh;
  nodeSelectionRing.position.set(0, 0.01, 0);

  const mat = new BABYLON.StandardMaterial('SelMat', sc);
  mat.diffuseColor = new BABYLON.Color3(0.06, 0.75, 1.0);
  mat.emissiveColor = new BABYLON.Color3(0.2, 0.85, 1.0);
  nodeSelectionRing.material = mat;
  nodeSelectionRing.isPickable = false;
}

function highlightStartNode(sc: BABYLON.Scene, nodeMesh: BABYLON.AbstractMesh) {
  clearNodeSelection();
  nodeSelectionRing = BABYLON.MeshBuilder.CreateTorus('SelectedNodeTorus', { 
    diameter: 0.85, 
    thickness: 0.025, 
    tessellation: 32 
  }, sc);
  nodeSelectionRing.parent = nodeMesh;
  nodeSelectionRing.position.set(0, 0.01, 0);
  const mat = new BABYLON.StandardMaterial('StartNodeMat', sc);
  mat.emissiveColor = new BABYLON.Color3(0.96, 0.62, 0.04);
  nodeSelectionRing.material = mat;
  nodeSelectionRing.isPickable = false;
}

function clearNodeSelection() {
  if (nodeSelectionRing) {
    nodeSelectionRing.dispose();
    nodeSelectionRing = null;
  }
}

function cancelEdgeConnection() {
  edgeFirstNodeId.value = null;
  hoveredNodeId.value = null;
  if (rubberBandLine) {
    rubberBandLine.dispose();
    rubberBandLine = null;
  }
  clearNodeSelection();
}

// Problem 2: Edge Direction & Configuration Popover Handlers
function toggleSelectedEdgeBidirectional() {
  if (!selectedEdgeForEdit.value || !scene) return;
  selectedEdgeForEdit.value.bidirectional = !selectedEdgeForEdit.value.bidirectional;
  rebuildEdgesOnly(scene);
  markLayoutDirty();
  emit('notify', `已切換為 ${selectedEdgeForEdit.value.bidirectional ? '雙向通行 (⇄)' : '單向通行 (➔)'}`, 'success');
}

function reverseSelectedEdgeDirection() {
  if (!selectedEdgeForEdit.value || !scene) return;
  const temp = selectedEdgeForEdit.value.startNodeId;
  selectedEdgeForEdit.value.startNodeId = selectedEdgeForEdit.value.endNodeId;
  selectedEdgeForEdit.value.endNodeId = temp;
  rebuildEdgesOnly(scene);
  markLayoutDirty();
  emit('notify', `已反轉路徑方向: ${selectedEdgeForEdit.value.startNodeId} ➔ ${selectedEdgeForEdit.value.endNodeId}`, 'success');
}

function deleteSelectedEdge() {
  if (!selectedEdgeForEdit.value || !scene) return;
  const edgeId = selectedEdgeForEdit.value.id;
  factoryLayout.edges = factoryLayout.edges.filter(e => e.id !== edgeId);
  selectedEdgeForEdit.value = null;
  rebuildEdgesOnly(scene);
  markLayoutDirty();
  emit('notify', `已刪除路徑: ${edgeId}`, 'info');
}

// ----------------------------------------------------
// Save & Reset Layout Handlers
// ----------------------------------------------------
async function handleSaveLayout() {
  const ok = await saveLayout({
    version: '2.0.0',
    nodes: factoryLayout.nodes,
    edges: factoryLayout.edges,
    props: factoryLayout.props
  });
  if (ok) {
    clearLayoutDirty();
    currentAppMode.value = 'simulate';
    emit('notify', '場域配置已成功儲存至後端，已自動返回【模擬模式】！', 'success');
  } else {
    emit('notify', '儲存場域失敗，請確認後端連線', 'warn');
  }
}

async function handleResetLayout() {
  await fetchLayout();
  if (scene) rebuildLayoutInScene(scene);
  emit('notify', '已重新載入場域設定', 'info');
}

// ----------------------------------------------------
// Item 1: Multi-Step Vehicle Mission Dispatch Helpers
// ----------------------------------------------------

function getActionLabel(action: DispatchAction): string {
  switch (action) {
    case 'none': return '移動';
    case 'wait': return '等待';
    case 'pick': return '取貨';
    case 'drop': return '放貨';
    case 'charge': return '充電';
    default: return action;
  }
}

function addNewDispatchStep() {
  const currentCount = quickDispatchSteps.value.length;
  const lastNodeId = currentCount > 0 ? quickDispatchSteps.value[currentCount - 1].node_id : currentAgvStartNode.value;
  const candidate = factoryLayout.nodes.find(n => n.id !== lastNodeId) || factoryLayout.nodes[0];
  const nextNodeId = candidate ? candidate.id : 'Node-02';
  
  quickDispatchSteps.value.push({
    node_id: nextNodeId,
    action: 'none'
  });
  activeStepIndex.value = quickDispatchSteps.value.length - 1;
  if (scene) updateQuickDispatchPreviewLine(scene);
}

function removeDispatchStep(index: number) {
  if (quickDispatchSteps.value.length <= 1) return;
  quickDispatchSteps.value.splice(index, 1);
  if (activeStepIndex.value !== null) {
    if (activeStepIndex.value >= quickDispatchSteps.value.length) {
      activeStepIndex.value = quickDispatchSteps.value.length - 1;
    }
  }
  if (scene) updateQuickDispatchPreviewLine(scene);
}

function setStepAction(index: number, action: DispatchAction) {
  const step = quickDispatchSteps.value[index];
  if (!step) return;
  
  // Restriction: Only charging station can charge!
  if (action === 'charge' && !isChargingNode(step.node_id)) {
    emit('notify', `站點 ${step.node_id} 非充電樁，無法指派充電任務`, 'warn');
    return;
  }
  
  step.action = action;
}

function onStepNodeChange(index: number) {
  const step = quickDispatchSteps.value[index];
  if (!step) return;
  
  // Restriction: if previous action was charge but new node cannot charge, revert to none
  if (step.action === 'charge' && !isChargingNode(step.node_id)) {
    step.action = 'none';
    emit('notify', `站點 ${step.node_id} 非充電樁，已自動變更為純移動`, 'info');
  }
  
  if (scene) updateQuickDispatchPreviewLine(scene);
}

function resetDispatchSteps() {
  const defaultTarget = factoryLayout.nodes.find(n => n.id !== currentAgvStartNode.value)?.id || 'Node-03';
  quickDispatchSteps.value = [
    { node_id: defaultTarget, action: 'none' }
  ];
  activeStepIndex.value = 0;
  if (scene) updateQuickDispatchPreviewLine(scene);
}

function addOrSelectNodeFromMap(nodeId: string) {
  if (quickDispatchSteps.value.length === 0) {
    quickDispatchSteps.value.push({ node_id: nodeId, action: 'none' });
    activeStepIndex.value = 0;
  } else if (activeStepIndex.value !== null && quickDispatchSteps.value[activeStepIndex.value]) {
    const step = quickDispatchSteps.value[activeStepIndex.value];
    step.node_id = nodeId;
    if (step.action === 'charge' && !isChargingNode(nodeId)) {
      step.action = 'none';
    }
  } else {
    const lastStep = quickDispatchSteps.value[quickDispatchSteps.value.length - 1];
    if (lastStep.node_id !== nodeId) {
      quickDispatchSteps.value.push({ node_id: nodeId, action: 'none' });
      activeStepIndex.value = quickDispatchSteps.value.length - 1;
    }
  }
  if (scene) updateQuickDispatchPreviewLine(scene);
}

function closeQuickDispatch() {
  is3DQuickDispatchActive.value = false;
  quickDispatchSteps.value = [];
  if (agvHaloMesh) agvHaloMesh.isVisible = false;
  if (quickDispatchPreviewLine) {
    quickDispatchPreviewLine.dispose();
    quickDispatchPreviewLine = null;
  }
}

function updateQuickDispatchPreviewLine(sc: BABYLON.Scene) {
  if (quickDispatchPreviewLine) {
    quickDispatchPreviewLine.dispose();
    quickDispatchPreviewLine = null;
  }
  if (!is3DQuickDispatchActive.value || currentAppMode.value !== 'simulate') return;

  const startNode = factoryLayout.nodes.find(n => n.id === currentAgvStartNode.value);
  if (!startNode) return;

  const points: BABYLON.Vector3[] = [
    new BABYLON.Vector3(startNode.x, 0.06, startNode.z)
  ];

  for (const step of quickDispatchSteps.value) {
    const n = factoryLayout.nodes.find(node => node.id === step.node_id);
    if (n) {
      points.push(new BABYLON.Vector3(n.x, 0.06, n.z));
    }
  }

  if (points.length < 2) return;

  quickDispatchPreviewLine = BABYLON.MeshBuilder.CreateDashedLines('QuickDispatchNavPreview', {
    points: points,
    dashSize: 2.0,
    gapSize: 1.2,
    dashNb: 80
  }, sc);
  quickDispatchPreviewLine.color = new BABYLON.Color3(0.06, 0.75, 1.0); // Bright Cyan
  quickDispatchPreviewLine.isPickable = false;
}

function handleQuickDispatchLaunch() {
  if (quickDispatchSteps.value.length === 0) {
    emit('notify', '請至少加入一個目標站點！', 'warn');
    return;
  }

  // Validate charging stations
  for (let i = 0; i < quickDispatchSteps.value.length; i++) {
    const s = quickDispatchSteps.value[i];
    if (s.action === 'charge' && !isChargingNode(s.node_id)) {
      emit('notify', `第 ${i + 1} 站 (${s.node_id}) 非充電樁，無法指派充電任務！`, 'warn');
      return;
    }
  }

  const ok = sendDispatchOrder(quickDispatchSteps.value, 'none', selectedVehicleId.value);
  if (ok) {
    const summary = quickDispatchSteps.value.map(s => `${s.node_id}(${getActionLabel(s.action)})`).join(' ➔ ');
    emit('notify', `已成功派遣任務！動線: ${summary}`, 'success');
    closeQuickDispatch();
  } else {
    emit('notify', '派發任務失敗，請檢查 WebSocket 後端連線', 'warn');
  }
}

// Camera View Helpers: Macro Factory Overview vs Micro Vehicle Follow
function setCameraView(view: 'iso' | 'top' | 'follow') {
  currentView.value = view;
  if (!camera) return;

  if (view === 'follow') {
    // Smoothly zoom in to closer radius and transition target to vehicle
    BABYLON.Animation.CreateAndStartAnimation(
      'camFollowRadius',
      camera,
      'radius',
      30,
      18,
      camera.radius,
      15,
      BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
    );
    if (agvRoot) {
      BABYLON.Animation.CreateAndStartAnimation(
        'camTargetX',
        camera.target,
        'x',
        30,
        18,
        camera.target.x,
        agvRoot.position.x,
        BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
      );
      BABYLON.Animation.CreateAndStartAnimation(
        'camTargetY',
        camera.target,
        'y',
        30,
        18,
        camera.target.y,
        agvRoot.position.y,
        BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
      );
      BABYLON.Animation.CreateAndStartAnimation(
        'camTargetZ',
        camera.target,
        'z',
        30,
        18,
        camera.target.z,
        agvRoot.position.z,
        BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
      );
    }
  } else {
    // Return to macro global factory view
    BABYLON.Animation.CreateAndStartAnimation(
      'camReset',
      camera,
      'radius',
      30,
      18,
      camera.radius,
      view === 'top' ? 26 : 28,
      BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
    );

    if (view === 'iso') {
      BABYLON.Animation.CreateAndStartAnimation('camA', camera, 'alpha', 30, 20, camera.alpha, -Math.PI / 3, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
      BABYLON.Animation.CreateAndStartAnimation('camB', camera, 'beta', 30, 20, camera.beta, Math.PI / 3.2, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
      camera.target = new BABYLON.Vector3(5, 0, 5);
    } else if (view === 'top') {
      BABYLON.Animation.CreateAndStartAnimation('camA', camera, 'alpha', 30, 20, camera.alpha, -Math.PI / 2, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
      BABYLON.Animation.CreateAndStartAnimation('camB', camera, 'beta', 30, 20, camera.beta, 0.05, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
      camera.target = new BABYLON.Vector3(5, 0, 5);
    }
  }
}

defineExpose({
  handleSaveLayout,
  handleResetLayout
});
</script>

<style scoped>
.scene-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.render-canvas {
  width: 100%;
  height: 100%;
  display: block;
  outline: none;
}

/* Camera Toolbar */
.camera-toolbar {
  position: absolute;
  top: 72px;
  left: 20px;
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(15, 23, 42, 0.88);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  padding: 5px 12px;
  border-radius: 30px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  z-index: 50;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  white-space: nowrap;
}

/* In Edit Mode, relocate camera toolbar to bottom-left to avoid colliding with top edit toolbar */
.camera-toolbar.in-edit-mode {
  top: auto;
  bottom: 24px;
  left: 20px;
  border-color: rgba(245, 158, 11, 0.3);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
}

.cam-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 12px;
  font-weight: 500;
  padding: 5px 12px;
  border-radius: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.cam-btn:hover {
  color: #f1f5f9;
  background: rgba(255, 255, 255, 0.08);
}

.cam-btn.active {
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.15);
  font-weight: 600;
  box-shadow: 0 0 12px rgba(56, 189, 248, 0.2);
}

/* Edit Mode Toolbar */
.edit-toolbar {
  position: absolute;
  top: 72px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(15, 23, 42, 0.94);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(245, 158, 11, 0.4);
  padding: 6px 14px;
  border-radius: 20px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.6), 0 0 16px rgba(245, 158, 11, 0.15);
  z-index: 25;
  white-space: nowrap;
  max-width: 95vw;
}

.edit-tool-group {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}

.tool-btn {
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #cbd5e1;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 11px;
  border-radius: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.tool-btn:hover {
  background: rgba(51, 65, 85, 0.8);
  color: #f8fafc;
}

.tool-btn.active {
  background: rgba(245, 158, 11, 0.18);
  border-color: #f59e0b;
  color: #fbbf24;
  box-shadow: 0 0 10px rgba(245, 158, 11, 0.25);
}

.tool-btn-danger.active {
  background: rgba(239, 68, 68, 0.2);
  border-color: #ef4444;
  color: #f87171;
}

.edge-dir-selector {
  display: flex;
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 2px;
  gap: 2px;
  flex-shrink: 0;
}

.dir-pill {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  flex-shrink: 0;
}

.dir-pill.active {
  background: rgba(14, 165, 233, 0.25);
  color: #38bdf8;
  box-shadow: 0 0 8px rgba(56, 189, 248, 0.3);
}

.edit-actions {
  display: flex;
  gap: 8px;
  border-left: 1px solid rgba(255, 255, 255, 0.15);
  padding-left: 10px;
  flex-shrink: 0;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  padding: 6px 13px;
  border-radius: 12px;
  border: none;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.save-btn {
  background: linear-gradient(135deg, #10b981, #059669);
  color: #ffffff;
  box-shadow: 0 2px 10px rgba(16, 185, 129, 0.35);
}

.save-btn:hover {
  background: linear-gradient(135deg, #34d399, #10b981);
  transform: translateY(-1px);
}

.reset-btn {
  background: rgba(51, 65, 85, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #cbd5e1;
}

.reset-btn:hover {
  background: rgba(71, 85, 105, 0.8);
  color: #ffffff;
}

/* Rubber-band Connection Hint Banner */
.edge-hint-banner {
  position: absolute;
  top: 130px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(245, 158, 11, 0.6);
  backdrop-filter: blur(16px);
  color: #f8fafc;
  font-size: 12px;
  font-weight: 500;
  padding: 8px 18px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6), 0 0 16px rgba(245, 158, 11, 0.2);
  z-index: 15;
}

.hint-pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f59e0b;
  box-shadow: 0 0 10px #f59e0b;
  animation: pulse 1.2s infinite;
}

.text-hover-node {
  color: #38bdf8;
  font-weight: 700;
}

.hint-mode-tag {
  background: rgba(14, 165, 233, 0.18);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.3);
  padding: 2px 7px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 700;
}

.hint-cancel-btn {
  background: rgba(239, 68, 68, 0.2);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #f87171;
  border-radius: 8px;
  padding: 3px 10px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}

.hint-cancel-btn:hover {
  background: #ef4444;
  color: #ffffff;
}

/* Edge Popover Configuration Widget */
.edge-popover {
  position: absolute;
  top: 130px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(56, 189, 248, 0.4);
  backdrop-filter: blur(20px);
  border-radius: 16px;
  padding: 12px 16px;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.7), 0 0 20px rgba(56, 189, 248, 0.2);
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.popover-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.popover-title {
  font-size: 12.5px;
  font-weight: 700;
  color: #f8fafc;
}

.popover-close {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
}

.popover-route-line {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11.5px;
  background: rgba(3, 7, 18, 0.6);
  padding: 6px 10px;
  border-radius: 8px;
}

.route-node {
  font-weight: 700;
  color: #38bdf8;
  font-family: monospace;
}

.route-arrow {
  color: #f59e0b;
  font-weight: 600;
}

.popover-btn-group {
  display: flex;
  gap: 6px;
}

.popover-act-btn {
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #cbd5e1;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;
  transition: all 0.15s ease;
}

.popover-act-btn:hover {
  background: rgba(51, 65, 85, 0.9);
  color: #ffffff;
}

.popover-act-btn.btn-danger {
  color: #f87171;
  border-color: rgba(239, 68, 68, 0.3);
}

.popover-act-btn.btn-danger:hover {
  background: rgba(239, 68, 68, 0.2);
}

/* Developer Tool UI */
.dev-tool-panel {
  position: absolute;
  bottom: 24px;
  left: 24px;
  width: 360px;
  background: rgba(15, 23, 42, 0.94);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(245, 158, 11, 0.4);
  border-radius: 18px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6), 0 0 20px rgba(245, 158, 11, 0.15);
  z-index: 30;
  overflow: hidden;
}

.dev-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.dev-title {
  font-size: 14px;
  font-weight: 700;
  color: #f8fafc;
  margin: 0;
}

.dev-close-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  display: flex;
  align-items: center;
}

.dev-close-btn:hover {
  color: #ffffff;
}

.dev-panel-body {
  padding: 16px 18px;
}

.dev-desc {
  font-size: 11px;
  color: #94a3b8;
  line-height: 1.5;
  margin-bottom: 12px;
}

.dev-field {
  margin-bottom: 12px;
}

.dev-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: #cbd5e1;
  margin-bottom: 6px;
}

.dev-select {
  width: 100%;
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 8px 10px;
  color: #f8fafc;
  font-size: 12px;
  outline: none;
}

.dev-select:focus {
  border-color: #38bdf8;
}

.dev-stats-box {
  background: rgba(3, 7, 18, 0.6);
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
}

.stat-k {
  color: #64748b;
}

.stat-v {
  color: #e2e8f0;
}

.dev-actions {
  display: flex;
}

.dev-test-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: linear-gradient(135deg, #0284c7, #0369a1);
  color: #ffffff;
  border: none;
  border-radius: 10px;
  padding: 10px;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.dev-test-btn:hover {
  background: linear-gradient(135deg, #0ea5e9, #0284c7);
  box-shadow: 0 4px 14px rgba(14, 165, 233, 0.4);
}

.text-cyan { color: #38bdf8; }
.text-emerald { color: #10b981; }
.font-mono { font-family: monospace; }
.flex-align-center { display: flex; align-items: center; }
.gap-6 { gap: 6px; }
.gap-8 { gap: 8px; }

@keyframes pulse {
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.4); opacity: 0.6; }
  100% { transform: scale(1); opacity: 1; }
}

/* Item 1: Non-blocking Left-side Floating Mission Dispatch Panel */
.mission-dispatch-panel {
  position: absolute;
  top: 128px;
  left: 20px;
  width: 340px;
  max-height: calc(100vh - 150px);
  background: rgba(15, 23, 42, 0.94);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(56, 189, 248, 0.35);
  border-radius: 16px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.65), 0 0 20px rgba(56, 189, 248, 0.15);
  z-index: 40;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.mission-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: rgba(30, 41, 59, 0.5);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.mission-panel-title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mission-badge-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #38bdf8;
  box-shadow: 0 0 10px #38bdf8;
  flex-shrink: 0;
}

.mission-titles {
  display: flex;
  flex-direction: column;
}

.mission-panel-title {
  font-size: 13.5px;
  font-weight: 700;
  color: #f8fafc;
  letter-spacing: -0.2px;
}

.mission-panel-sub {
  font-size: 11px;
  color: #94a3b8;
  font-family: monospace;
}

.mission-panel-close {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.mission-panel-close:hover {
  color: #f8fafc;
  background: rgba(255, 255, 255, 0.1);
}

.mission-panel-body {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  max-height: calc(100vh - 220px);
}

.mission-start-badge {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  padding: 8px 12px;
}

.start-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 8px #10b981;
  flex-shrink: 0;
}

.start-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.start-lbl {
  font-size: 10px;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.start-val {
  font-size: 12px;
  font-weight: 600;
  color: #e2e8f0;
}

.mission-steps-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.steps-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.steps-header-title {
  font-size: 11.5px;
  font-weight: 600;
  color: #94a3b8;
}

.steps-count-badge {
  font-size: 10.5px;
  font-weight: 600;
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.12);
  padding: 2px 8px;
  border-radius: 10px;
}

.mission-step-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mission-step-card {
  background: rgba(30, 41, 59, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: all 0.2s ease;
  cursor: pointer;
}

.mission-step-card:hover {
  background: rgba(51, 65, 85, 0.7);
  border-color: rgba(56, 189, 248, 0.3);
}

.mission-step-card.step-active {
  border-color: rgba(56, 189, 248, 0.7);
  box-shadow: 0 0 12px rgba(56, 189, 248, 0.2);
  background: rgba(15, 23, 42, 0.95);
}

.step-card-top {
  display: flex;
  align-items: center;
  gap: 6px;
}

.step-index-badge {
  font-size: 11px;
  font-weight: 700;
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.15);
  padding: 2px 6px;
  border-radius: 6px;
  white-space: nowrap;
}

.step-node-select-wrap {
  flex: 1;
}

.step-node-select {
  width: 100%;
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  color: #f1f5f9;
  font-size: 11.5px;
  padding: 4px 6px;
  outline: none;
  cursor: pointer;
}

.step-node-select:focus {
  border-color: #38bdf8;
}

.step-delete-btn {
  background: transparent;
  border: none;
  color: #ef4444;
  opacity: 0.7;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.step-delete-btn:hover {
  opacity: 1;
  background: rgba(239, 68, 68, 0.15);
}

.step-actions-row {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.step-action-lbl {
  font-size: 10px;
  color: #94a3b8;
}

.step-action-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.step-act-btn {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #94a3b8;
  font-size: 11px;
  padding: 3px 7px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.15s ease;
}

.step-act-btn:hover:not(:disabled) {
  background: rgba(51, 65, 85, 0.8);
  color: #ffffff;
}

.step-act-btn.active {
  background: rgba(56, 189, 248, 0.2);
  border-color: #38bdf8;
  color: #38bdf8;
  font-weight: 600;
}

.step-act-btn.act-wait.active {
  background: rgba(251, 191, 36, 0.2);
  border-color: #fbbf24;
  color: #fbbf24;
}

.step-act-btn.act-pick.active {
  background: rgba(245, 158, 11, 0.2);
  border-color: #f59e0b;
  color: #fbbf24;
}

.step-act-btn.act-drop.active {
  background: rgba(16, 185, 129, 0.2);
  border-color: #10b981;
  color: #34d399;
}

.step-act-btn.act-charge.active {
  background: rgba(168, 85, 247, 0.2);
  border-color: #a855f7;
  color: #c084fc;
}

.step-act-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
  border-style: dashed;
}

.step-warning-text {
  font-size: 10px;
  color: #f59e0b;
  margin-top: 1px;
}

.steps-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
}

.btn-add-step {
  flex: 1;
  background: rgba(30, 41, 59, 0.8);
  border: 1px dashed rgba(56, 189, 248, 0.4);
  color: #38bdf8;
  font-size: 11px;
  font-weight: 600;
  padding: 5px 10px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.2s ease;
}

.btn-add-step:hover {
  background: rgba(56, 189, 248, 0.15);
  border-color: #38bdf8;
}

.btn-reset-steps {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #94a3b8;
  font-size: 11px;
  padding: 5px 8px;
  border-radius: 8px;
  cursor: pointer;
}

.btn-reset-steps:hover {
  color: #e2e8f0;
  background: rgba(255, 255, 255, 0.05);
}

.steps-map-hint {
  font-size: 10px;
  color: #64748b;
  line-height: 1.4;
  margin-top: 2px;
}

.mission-panel-footer {
  padding: 10px 14px;
  background: rgba(30, 41, 59, 0.5);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.btn-mission-launch {
  width: 100%;
  background: linear-gradient(135deg, #0284c7, #0ea5e9);
  color: #ffffff;
  border: none;
  font-size: 12.5px;
  font-weight: 700;
  padding: 8px 14px;
  border-radius: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-shadow: 0 4px 14px rgba(14, 165, 233, 0.4);
  transition: all 0.2s ease;
}

.btn-mission-launch:hover:not(:disabled) {
  background: linear-gradient(135deg, #0369a1, #0284c7);
  box-shadow: 0 6px 20px rgba(14, 165, 233, 0.5);
}

.btn-mission-launch:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
}

/* Transitions */
.slide-left-enter-active,
.slide-left-leave-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.slide-left-enter-from,
.slide-left-leave-to {
  opacity: 0;
  transform: translateX(-24px);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* ---------------------------------------------------- */
/* RWD Responsive Design */
/* ---------------------------------------------------- */
@media (max-width: 1024px) {
  .camera-toolbar {
    top: 66px;
    left: 12px;
    padding: 4px 8px;
    gap: 4px;
  }
  .camera-toolbar.in-edit-mode {
    top: auto;
    bottom: 24px;
    left: 12px;
  }
  .cam-btn {
    padding: 5px 10px;
    font-size: 11.5px;
  }
  .edit-toolbar {
    top: 66px;
    padding: 6px 10px;
    gap: 8px;
    max-width: calc(100vw - 24px);
  }
  .tool-btn {
    padding: 5px 9px;
    font-size: 11px;
  }
  .action-btn {
    padding: 5px 10px;
    font-size: 11px;
  }
  .mission-dispatch-panel {
    top: 118px;
    left: 12px;
    width: 320px;
    max-height: calc(100vh - 140px);
  }
}

@media (max-width: 768px) {
  .camera-toolbar {
    top: auto;
    bottom: 20px;
    left: 12px;
    transform: none;
    padding: 4px;
    gap: 2px;
    border-radius: 16px;
  }
  .cam-btn span {
    display: none;
  }
  .cam-btn {
    padding: 7px;
    border-radius: 12px;
  }

  .edit-toolbar {
    top: 62px;
    width: calc(100vw - 16px);
    max-width: calc(100vw - 16px);
    border-radius: 14px;
    padding: 6px 8px;
    gap: 6px;
    flex-direction: column;
    align-items: stretch;
  }
  .edit-tool-group {
    flex-wrap: wrap;
    justify-content: center;
    gap: 4px;
  }
  .edit-actions {
    border-left: none;
    padding-left: 0;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    padding-top: 6px;
    justify-content: center;
  }
  .edge-hint-banner {
    top: 170px;
    padding: 6px 12px;
    font-size: 11px;
    gap: 8px;
    max-width: calc(100vw - 24px);
  }
  .edge-popover {
    top: 170px;
    max-width: calc(100vw - 24px);
  }

  .mission-dispatch-panel {
    top: 104px;
    left: 8px;
    width: calc(100vw - 16px);
    max-width: calc(100vw - 16px);
    max-height: calc(100vh - 116px);
  }
}
</style>
