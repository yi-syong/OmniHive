export interface Position {
  x: number;
  y: number; // elevation
  z: number; // 3D depth
  theta: number; // heading angle in radians
}

export interface Battery {
  level: number;
  charging: boolean;
  mode?: string; // "IDLE", "MOVING", "ACTING", "CC_CHARGING", "CV_CHARGING", "CHARGED"
  drain_rate?: number; // %/s
}

export type AGVStatus = 'DRIVING' | 'ACTING' | 'IDLE';

export interface TaskInfo {
  status: AGVStatus;
  target_node: string;
  action: string;
  display_message: string;
  current_node?: string;
  previous_node?: string;
  has_cargo?: boolean;
  is_traffic_wait?: boolean;
  wait_seconds?: number;
}

export interface StateUpdateMessage {
  type: 'state_update';
  agv_id: string;
  position: Position;
  velocity: number;
  battery: Battery;
  task_info: TaskInfo;
  visual_event?: 'pick_done' | 'drop_done' | '';
  time_scale?: number;
  node_states?: string[];
  edge_states?: string[];
  passed_edges?: string[];
}

export type DispatchAction = 'none' | 'wait' | 'pick' | 'drop' | 'charge';

export interface DispatchOrderStep {
  node_id: string;
  action: DispatchAction;
}

export interface DispatchOrderMessage {
  type: 'dispatch_order';
  agv_id: string;
  target_node?: string;
  action?: DispatchAction;
  steps?: DispatchOrderStep[];
}

export interface SetTimeScaleMessage {
  type: 'set_time_scale';
  time_scale: number;
}

export interface LayoutNode {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  function: string;
  description: string;
  has_cargo?: boolean;
}

export interface LayoutEdge {
  id: string;
  startNodeId: string;
  endNodeId: string;
  bidirectional?: boolean;
}

export interface LayoutProp {
  id: string;
  modelType: string; // 'rack' | 'push_back' | 'pallet' | 'box' | 'workstation' | 'pillar'
  x: number;
  y: number;
  z: number;
  rotationY: number;
  scale: number;
}

export interface FactoryLayout {
  version: string;
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  props: LayoutProp[];
}

export type AppMode = 'simulate' | 'edit';
export type EditorTool = 'select' | 'add_node' | 'add_edge' | 'add_prop' | 'delete';

export type TrafficStrategy = 'wait' | 'reroute';

export interface TrafficMetricsMessage {
  type: 'traffic_metrics';
  strategy_name: TrafficStrategy;
  throughput: number;
  total_wait_time_sec: number;
  avg_extra_cost_pct: number;
  active_vehicles: number;
}
