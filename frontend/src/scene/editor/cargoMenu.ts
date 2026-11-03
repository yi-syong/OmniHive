import * as BABYLON from '@babylonjs/core';
import type { Ref } from 'vue';
import type { LayoutNode } from '../../types';
import { isCargoNode, getNodeFunctionLabel } from '../layout/nodeUtils';

export function triggerNodeTargetRipple(sc: BABYLON.Scene, nodeMesh: BABYLON.AbstractMesh) {
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

export function openCargoContextMenu(
  evt: MouseEvent,
  node: LayoutNode,
  cargoContextMenu: Ref<{ visible: boolean; x: number; y: number; node: LayoutNode | null }>
) {
  const menuWidth = 180;
  const menuHeight = 110;
  let x = evt.clientX;
  let y = evt.clientY;

  if (x + menuWidth > window.innerWidth) {
    x = window.innerWidth - menuWidth - 12;
  }
  if (y + menuHeight > window.innerHeight) {
    y = window.innerHeight - menuHeight - 12;
  }

  cargoContextMenu.value = {
    visible: true,
    x,
    y,
    node
  };
}

export function closeCargoContextMenu(
  cargoContextMenu: Ref<{ visible: boolean; x: number; y: number; node: LayoutNode | null }>
) {
  cargoContextMenu.value.visible = false;
  cargoContextMenu.value.node = null;
}

export async function setNodeCargoStatus(
  node: LayoutNode,
  hasCargo: boolean,
  toggleCargo: (node: LayoutNode, hasCargo: boolean) => Promise<void>,
  cargoContextMenu: Ref<{ visible: boolean; x: number; y: number; node: LayoutNode | null }>
) {
  await toggleCargo(node, hasCargo);
  closeCargoContextMenu(cargoContextMenu);
}

export function handleRightClick(
  sc: BABYLON.Scene,
  pointerInfo: BABYLON.PointerInfo,
  nodes: LayoutNode[],
  resolveNode: (sc: BABYLON.Scene, pick: any) => string | null,
  cargoContextMenu: Ref<{ visible: boolean; x: number; y: number; node: LayoutNode | null }>,
  notify: (msg: string, type?: 'info' | 'warn' | 'success') => void
) {
  const pick = pointerInfo.pickInfo;
  const evt = pointerInfo.event as MouseEvent;

  if (!pick || !pick.hit || !pick.pickedMesh) {
    closeCargoContextMenu(cargoContextMenu);
    return;
  }

  const pickedNodeId = resolveNode(sc, pick);
  if (pickedNodeId) {
    const node = nodes.find(n => n.id === pickedNodeId);
    if (node) {
      if (isCargoNode(node.id, nodes)) {
        openCargoContextMenu(evt, node, cargoContextMenu);
        return;
      } else {
        closeCargoContextMenu(cargoContextMenu);
        notify(`站點 ${node.id} (${getNodeFunctionLabel(node.function)}) 非貨物站，無法編輯貨物狀態`, 'info');
        return;
      }
    }
  }
  closeCargoContextMenu(cargoContextMenu);
}
