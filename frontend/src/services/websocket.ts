import { ref, reactive, computed } from 'vue';
import type { 
  StateUpdateMessage, 
  DispatchOrderMessage, 
  DispatchOrderStep,
  DispatchAction,
  SetTimeScaleMessage, 
  FactoryLayout,
  AppMode,
  EditorTool
} from '../types';

export const isConnected = ref(false);
export const connectionError = ref<string | null>(null);
export const packetCount = ref(0);
export const lastReceivedTime = ref<number>(Date.now());
export const currentTimeScale = ref<number>(1.0);
export const currentAppMode = ref<AppMode>('simulate');
export const currentEditorTool = ref<EditorTool>('select');
export const hasUnsavedChanges = ref<boolean>(false);
export const selectedNodeForDispatch = ref<string>('Node-03');

// Multi-AGV Fleet Selection & Dashboard View State
export const selectedVehicleId = ref<string>('AGV-001');
export const dashboardActiveTab = ref<'fleet' | 'vehicle'>('fleet');
export const cameraFollowTrigger = ref<number>(0);
export function requestCameraFollowVehicle(vehId?: string) {
  if (vehId) selectedVehicleId.value = vehId;
  cameraFollowTrigger.value++;
}

// 3D Direct Interactive Vehicle Mission Dispatch State
export const is3DQuickDispatchActive = ref<boolean>(false);
export const quickDispatchStartNode = ref<string>('Node-01');
export const quickDispatchTargetNode = ref<string>('Node-03');
export const quickDispatchAction = ref<DispatchAction>('pick');
export const isSelectingStartNode = ref<boolean>(false);
export const quickDispatchSteps = ref<DispatchOrderStep[]>([
  { node_id: 'Node-03', action: 'pick' }
]);

export function markLayoutDirty() {
  hasUnsavedChanges.value = true;
}

export function clearLayoutDirty() {
  hasUnsavedChanges.value = false;
}

export const isTelemetryStale = computed(() => {
  return isConnected.value && Date.now() - lastReceivedTime.value > 1500;
});

export const agvState = reactive<StateUpdateMessage>({
  type: 'state_update',
  agv_id: 'AGV-001',
  position: { x: 0, y: 0, z: 0, theta: 1.571 },
  velocity: 0,
  battery: { level: 95, charging: false, mode: 'IDLE', drain_rate: 0.005 },
  task_info: {
    status: 'IDLE',
    target_node: 'Node-01',
    action: 'none',
    display_message: '[待命] 正在連線後端...',
    current_node: 'Node-01',
    previous_node: 'Node-01',
    has_cargo: false
  },
  visual_event: '',
  time_scale: 1.0,
  node_states: [],
  edge_states: [],
  passed_edges: []
});

export const factoryLayout = reactive<FactoryLayout>({
  version: '2.0.0',
  nodes: [],
  edges: [],
  props: []
});

type VisualEventListener = (event: 'pick_done' | 'drop_done') => void;
const visualEventListeners: VisualEventListener[] = [];

export function onVisualEvent(cb: VisualEventListener) {
  visualEventListeners.push(cb);
}

let socket: WebSocket | null = null;
let reconnectTimer: number | null = null;

const getHost = () => (typeof window !== 'undefined' && window.location.hostname) ? window.location.hostname : 'localhost';
export const getDefaultWsUrl = () => `ws://${getHost()}:8080/ws`;

export function connectWebSocket(url?: string) {
  const wsUrl = url || getDefaultWsUrl();
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      isConnected.value = true;
      connectionError.value = null;
      lastReceivedTime.value = Date.now();
      console.log('[WebSocket] Connected to Go Backend:', url);
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    socket.onmessage = (event) => {
      try {
        lastReceivedTime.value = Date.now();
        const lines = event.data.split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          const msg = JSON.parse(line);
          if (msg.type === 'state_update') {
            packetCount.value++;
            const update = msg as StateUpdateMessage;
            agvState.agv_id = update.agv_id;
            agvState.position = update.position;
            agvState.velocity = update.velocity;
            agvState.battery = update.battery;
            agvState.task_info = update.task_info;

            if (update.time_scale !== undefined) {
              agvState.time_scale = update.time_scale;
              currentTimeScale.value = update.time_scale;
            }

            agvState.node_states = update.node_states || [];
            agvState.edge_states = update.edge_states || [];
            agvState.passed_edges = update.passed_edges || [];

            if (update.visual_event && (update.visual_event === 'pick_done' || update.visual_event === 'drop_done')) {
              agvState.visual_event = update.visual_event;
              for (const cb of visualEventListeners) {
                cb(update.visual_event);
              }
            }
          }
        }
      } catch (err) {
        console.error('[WebSocket] Failed to parse message:', err);
      }
    };

    socket.onerror = (err) => {
      console.warn('[WebSocket] Error:', err);
      connectionError.value = '無法連線至後端 WebSocket 伺服器';
    };

    socket.onclose = () => {
      isConnected.value = false;
      console.warn('[WebSocket] Disconnected. Reconnecting in 2 seconds...');
      if (!reconnectTimer) {
        reconnectTimer = window.setTimeout(() => {
          connectWebSocket(url);
        }, 2000);
      }
    };
  } catch (err) {
    console.error('[WebSocket] Setup exception:', err);
    connectionError.value = String(err);
  }
}

export function sendDispatchOrder(
  targetOrSteps: string | DispatchOrderStep[], 
  action: DispatchAction = 'none', 
  agvId: string = 'AGV-001'
) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.error('[WebSocket] Cannot send order: WebSocket is not connected');
    return false;
  }

  let payload: DispatchOrderMessage;
  if (Array.isArray(targetOrSteps)) {
    payload = {
      type: 'dispatch_order',
      agv_id: agvId,
      steps: targetOrSteps
    };
  } else {
    payload = {
      type: 'dispatch_order',
      agv_id: agvId,
      target_node: targetOrSteps,
      action: action
    };
  }

  socket.send(JSON.stringify(payload));
  console.log('[WebSocket] Dispatched order:', payload);
  return true;
}

export function setTimeScale(scale: number) {
  currentTimeScale.value = scale;
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.warn('[WebSocket] Cannot send set_time_scale: socket not connected');
    return false;
  }

  const payload: SetTimeScaleMessage = {
    type: 'set_time_scale',
    time_scale: scale
  };

  socket.send(JSON.stringify(payload));
  console.log('[WebSocket] Set simulation time scale:', scale);
  return true;
}

// REST API for Layout Persistence
const getApiBase = () => `http://${getHost()}:8080/api`;

export async function fetchLayout(): Promise<FactoryLayout | null> {
  try {
    const res = await fetch(`${getApiBase()}/layout`);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data: FactoryLayout = await res.json();
    factoryLayout.version = data.version;
    factoryLayout.nodes = data.nodes || [];
    factoryLayout.edges = data.edges || [];
    factoryLayout.props = data.props || [];
    clearLayoutDirty();
    console.log('[Layout] Loaded layout from backend:', data);
    return data;
  } catch (err) {
    console.error('[Layout] Failed to fetch layout from backend:', err);
    return null;
  }
}

export async function saveLayout(layout: FactoryLayout): Promise<boolean> {
  try {
    const res = await fetch(`${getApiBase()}/layout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(layout)
    });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const result = await res.json();
    clearLayoutDirty();
    console.log('[Layout] Saved layout successfully:', result);
    return true;
  } catch (err) {
    console.error('[Layout] Failed to save layout:', err);
    return false;
  }
}
