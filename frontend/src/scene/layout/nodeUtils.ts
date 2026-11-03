import * as BABYLON from '@babylonjs/core';
import type { LayoutNode, DispatchAction } from '../../types';

export function getNodeColor(func: string): BABYLON.Color3 {
  switch (func) {
    case 'Idle/Charge':
    case 'Charge':
      return new BABYLON.Color3(0.06, 0.75, 1.0); // Electric Cyan #00f0ff
    case 'Transit':
      return new BABYLON.Color3(0.24, 0.55, 0.98); // Deep Sky Blue #3b82f6
    case 'Wait':
      return new BABYLON.Color3(0.66, 0.33, 0.97); // Vivid Royal Purple #a855f7
    case 'Cargo':
    case 'Pick-up':
    case 'Drop-off':
      return new BABYLON.Color3(0.98, 0.45, 0.09); // Vibrant Logistics Orange #f97316
    default:
      return new BABYLON.Color3(0.5, 0.5, 0.6);
  }
}

export function getNodeFunctionLabel(func: string): string {
  switch (func) {
    case 'Idle/Charge':
    case 'Charge':
      return '充電站';
    case 'Transit':
      return '交會點';
    case 'Wait':
      return '等待點';
    case 'Cargo':
    case 'Pick-up':
    case 'Drop-off':
      return '貨物站';
    default:
      return func || '一般站點';
  }
}

export function getNodeTypeDefaultDesc(func: string): string {
  switch (func) {
    case 'Idle/Charge':
    case 'Charge':
      return 'AGV 自動充電樁';
    case 'Transit':
      return '路網交會點（導航移動通道）';
    case 'Wait':
      return '原地等待避車點（停留待命）';
    case 'Cargo':
    case 'Pick-up':
    case 'Drop-off':
      return '棧板取放貨物站點';
    default:
      return '場域編輯自訂站點';
  }
}

export function isChargingNode(nodeId: string, nodes: LayoutNode[]): boolean {
  if (!nodeId) return false;
  const node = nodes.find(n => n.id === nodeId);
  if (!node) return false;
  return node.function === 'Idle/Charge' || node.name.includes('充電') || node.id.toLowerCase().includes('charge');
}

export function isCargoNode(nodeId: string, nodes: LayoutNode[]): boolean {
  if (!nodeId) return false;
  const n = nodes.find(item => item.id === nodeId);
  return !!n && (n.function === 'Cargo' || n.function === 'Pick-up' || n.function === 'Drop-off');
}

export function getNodeObj(nodeId: string, nodes: LayoutNode[]): LayoutNode | undefined {
  return nodes.find(n => n.id === nodeId);
}

export function getNodeNameOnly(id: string, nodes: LayoutNode[]): string {
  if (!id) return '';
  const n = nodes.find(node => node.id === id);
  return n ? n.name : id;
}

export function isNodeOccupiedByOther(
  nodeId: string,
  fleetVehicles: Record<string, any>,
  selectedVehicleId?: string | null
): boolean {
  for (const [vId, veh] of Object.entries(fleetVehicles)) {
    if (vId !== selectedVehicleId && veh.task_info?.current_node === nodeId) {
      return true;
    }
  }
  return false;
}

export function getOtherOccupantId(
  nodeId: string,
  fleetVehicles: Record<string, any>,
  selectedVehicleId?: string | null
): string {
  for (const [vId, veh] of Object.entries(fleetVehicles)) {
    if (vId !== selectedVehicleId && veh.task_info?.current_node === nodeId) {
      return vId;
    }
  }
  return '';
}

export function getNodeOccupantLabel(
  nodeId: string,
  fleetVehicles: Record<string, any>,
  selectedVehicleId?: string | null
): string {
  const occupant = getOtherOccupantId(nodeId, fleetVehicles, selectedVehicleId);
  return occupant ? ` [${occupant} 佔用中 ⚠️]` : '';
}

export function getStepActionDesc(action?: string): string {
  switch (action) {
    case 'pick': return '取貨';
    case 'drop': return '放貨';
    case 'wait': return '停等';
    case 'charge': return '充電';
    case 'none':
    default:
      return '通過';
  }
}

export function getActionLabel(action: DispatchAction): string {
  switch (action) {
    case 'pick': return '取貨';
    case 'drop': return '放貨';
    case 'charge': return '充電';
    case 'wait': return '等待';
    case 'none': return '純移動';
    default: return action;
  }
}
