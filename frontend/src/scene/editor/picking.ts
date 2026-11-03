import * as BABYLON from '@babylonjs/core';
import type { LayoutNode } from '../../types';
import type { VehicleVisual } from '../types';

/**
 * 深入解析選取的 Mesh 所屬的站點 ID (無論點擊圓盤、外框、棧板、貨物或標示，皆能精確對應到該站點)
 */
export function resolvePickedNodeId(mesh: BABYLON.AbstractMesh | null | undefined): string | null {
  if (!mesh) return null;
  let curr: BABYLON.Node | null = mesh;
  while (curr) {
    const meta = (curr as any).metadata;
    if (meta) {
      if (meta.type === 'node' && meta.id) return meta.id;
      if (meta.nodeId) return meta.nodeId;
    }
    const name = curr.name || '';
    const match = name.match(/(?:Pad|StationPallet|StationCargo|Ring|ZapIcon|ZapPlane|ForkEntry)_([a-zA-Z0-9_-]+)/);
    if (match) return match[1];
    curr = curr.parent;
  }
  return null;
}

/**
 * 全方位解析游標點選或懸停的站點 ID：
 * 1. 直接比對 PickedMesh 及其階層 (resolvePickedNodeId)
 * 2. 多重射線貫穿檢查 (Multi-pick ray penetration)，穿透重疊的 3D 車輛或配件
 * 3. 車輛停靠位置關聯檢查 (若點擊到 AGV，直接對應其停靠或最靠近之站點)
 * 4. 地面近距離吸附 (距離站點中心 <= 0.95m 自動解析，大幅提升點擊手感)
 */
export function resolvePickedNodeFromPointer(
  sc: BABYLON.Scene,
  pickResult?: BABYLON.Nullable<BABYLON.PickingInfo>,
  nodes: LayoutNode[] = [],
  fleetVehicles: Record<string, any> = {},
  vehicleVisuals?: Map<string, VehicleVisual>
): string | null {
  if (!pickResult) return null;

  // 1. Direct mesh & hierarchy resolution
  if (pickResult.hit && pickResult.pickedMesh) {
    const directId = resolvePickedNodeId(pickResult.pickedMesh);
    if (directId) return directId;
  }

  // 2. Multi-pick penetration check with ray (penetrates vehicles to find station pads underneath)
  if (pickResult.ray) {
    const hits = sc.multiPickWithRay(pickResult.ray, (mesh) => {
      return mesh.metadata?.type === 'node' || !!resolvePickedNodeId(mesh);
    });
    if (hits && hits.length > 0) {
      for (const h of hits) {
        if (h.hit && h.pickedMesh) {
          const nId = resolvePickedNodeId(h.pickedMesh);
          if (nId) return nId;
        }
      }
    }
  }

  // 3. Vehicle proximity fallback (if ray hit an AGV vehicle or hitbox)
  if (pickResult.hit && pickResult.pickedMesh) {
    const meta = pickResult.pickedMesh.metadata;
    if (meta && meta.type === 'agv') {
      const vId = meta.id;
      if (vId && fleetVehicles[vId]?.task_info?.current_node) {
        const cNodeId = fleetVehicles[vId].task_info.current_node;
        if (nodes.some(n => n.id === cNodeId)) {
          return cNodeId;
        }
      }
      const vVisual = vId && vehicleVisuals ? vehicleVisuals.get(vId) : null;
      if (vVisual) {
        let bestDist = 1.8;
        let bestNodeId: string | null = null;
        for (const n of nodes) {
          const d = Math.hypot(n.x - vVisual.root.position.x, n.z - vVisual.root.position.z);
          if (d < bestDist) {
            bestDist = d;
            bestNodeId = n.id;
          }
        }
        if (bestNodeId) return bestNodeId;
      }
    }
  }

  // 4. Ground proximity snap (within 0.95m of node center)
  if (pickResult.hit && pickResult.pickedPoint) {
    const px = pickResult.pickedPoint.x;
    const pz = pickResult.pickedPoint.z;
    let closestDist = 0.95;
    let closestNodeId: string | null = null;
    for (const n of nodes) {
      const d = Math.hypot(n.x - px, n.z - pz);
      if (d < closestDist) {
        closestDist = d;
        closestNodeId = n.id;
      }
    }
    if (closestNodeId) return closestNodeId;
  }

  return null;
}
