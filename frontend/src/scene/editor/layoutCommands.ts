import * as BABYLON from '@babylonjs/core';
import type { Ref } from 'vue';
import type { AppMode, EditorTool, FactoryLayout } from '../../types';

export interface LayoutCommandsContext {
  factoryLayout: FactoryLayout;
  nodeMeshesMap: Map<string, BABYLON.Mesh>;
  nodeTextureMap: Map<string, { texture: BABYLON.DynamicTexture; plane: BABYLON.Mesh }>;
  stationPalletMap: Map<string, BABYLON.TransformNode>;
  stationCargoMap: Map<string, BABYLON.AbstractMesh>;
  edgeMeshesMap: Map<string, BABYLON.LinesMesh | BABYLON.Mesh>;
  edgeArrowMeshesMap: Map<string, BABYLON.AbstractMesh[]>;
  propMeshesMap: Map<string, BABYLON.AbstractMesh>;
  getGizmoManager: () => BABYLON.GizmoManager | null;
  rebuildEdgesOnly: (sc: BABYLON.Scene) => void;
  rebuildLayoutInScene: (sc: BABYLON.Scene) => void;
  clearNodeSelection: () => void;
  cancelEdgeConnection: () => void;
  closeCargoContextMenu?: () => void;
  attachGizmoToTarget: (mesh: BABYLON.AbstractMesh | null) => void;
  markLayoutDirty: () => void;
  clearLayoutDirty: () => void;
  saveLayout: (layout: FactoryLayout) => Promise<boolean>;
  fetchLayout: (force?: boolean) => Promise<any>;
  currentAppMode: Ref<AppMode>;
  currentEditorTool: Ref<EditorTool>;
  showResetModal?: Ref<boolean>;
  notify: (msg: string, type?: 'info' | 'warn' | 'success') => void;
}

export function deleteNodeById(nodeId: string, sc: BABYLON.Scene, ctx: LayoutCommandsContext) {
  const node = ctx.factoryLayout.nodes.find(n => n.id === nodeId);
  if (!node) return;

  ctx.factoryLayout.nodes = ctx.factoryLayout.nodes.filter(n => n.id !== nodeId);
  ctx.factoryLayout.edges = ctx.factoryLayout.edges.filter(e => e.startNodeId !== nodeId && e.endNodeId !== nodeId);

  const padMesh = ctx.nodeMeshesMap.get(nodeId);
  if (padMesh) {
    padMesh.dispose();
    ctx.nodeMeshesMap.delete(nodeId);
    ctx.nodeTextureMap.delete(nodeId);
  }
  const pallet = ctx.stationPalletMap.get(nodeId);
  if (pallet) {
    pallet.dispose();
    ctx.stationPalletMap.delete(nodeId);
  }
  const cargo = ctx.stationCargoMap.get(nodeId);
  if (cargo) {
    cargo.dispose();
    ctx.stationCargoMap.delete(nodeId);
  }

  ctx.rebuildEdgesOnly(sc);
  ctx.getGizmoManager()?.attachToMesh(null);
  ctx.clearNodeSelection();
  ctx.markLayoutDirty();
  ctx.notify(`已刪除節點: ${nodeId}`, 'info');
}

export function deleteEdgeById(edgeId: string, _sc: BABYLON.Scene, ctx: LayoutCommandsContext) {
  ctx.factoryLayout.edges = ctx.factoryLayout.edges.filter(e => e.id !== edgeId);
  const oldMesh = ctx.edgeMeshesMap.get(edgeId);
  if (oldMesh) {
    if (oldMesh.material) oldMesh.material.dispose();
    oldMesh.dispose();
    ctx.edgeMeshesMap.delete(edgeId);
  }
  const arrows = ctx.edgeArrowMeshesMap.get(edgeId);
  if (arrows) {
    arrows.forEach(a => a.dispose());
    ctx.edgeArrowMeshesMap.delete(edgeId);
  }
  ctx.markLayoutDirty();
  ctx.notify(`已刪除路徑: ${edgeId}`, 'info');
}

export function deletePropById(propId: string, ctx: LayoutCommandsContext) {
  ctx.factoryLayout.props = ctx.factoryLayout.props.filter(p => p.id !== propId);
  const pMesh = ctx.propMeshesMap.get(propId);
  if (pMesh) {
    pMesh.dispose();
    ctx.propMeshesMap.delete(propId);
  }
  ctx.getGizmoManager()?.attachToMesh(null);
  ctx.markLayoutDirty();
  ctx.notify(`已刪除物件: ${propId}`, 'info');
}

export async function handleSaveLayout(ctx: LayoutCommandsContext): Promise<boolean> {
  const ok = await ctx.saveLayout({
    version: '2.0.0',
    nodes: ctx.factoryLayout.nodes,
    edges: ctx.factoryLayout.edges,
    props: ctx.factoryLayout.props
  });
  if (ok) {
    ctx.clearLayoutDirty();
    ctx.currentAppMode.value = 'simulate';
    ctx.notify('場域配置已成功儲存至後端，已自動返回【模擬模式】！', 'success');
    return true;
  } else {
    ctx.notify('儲存場域失敗，請確認後端連線', 'warn');
    return false;
  }
}

export async function handleResetLayout(sc: BABYLON.Scene, ctx: LayoutCommandsContext) {
  await ctx.fetchLayout();
  if (sc) ctx.rebuildLayoutInScene(sc);
  ctx.clearLayoutDirty();
  ctx.notify('已重新載入場域設定', 'info');
}

export function resetToStandardTemplate(sc: BABYLON.Scene, ctx: LayoutCommandsContext) {
  if (ctx.showResetModal) ctx.showResetModal.value = false;
  ctx.factoryLayout.nodes = [
    {
      id: 'Node-01',
      name: '充電站 Node-01',
      x: 0.0,
      y: 0.0,
      z: 0.0,
      function: 'Idle/Charge',
      description: 'AGV 待命與自動充電站',
      has_cargo: false
    },
    {
      id: 'Node-02',
      name: '通道點 Node-02',
      x: 6.0,
      y: 0.0,
      z: 0.0,
      function: 'Transit',
      description: '中央導航通道點',
      has_cargo: false
    },
    {
      id: 'Node-03',
      name: '貨物站 Node-03',
      x: 12.0,
      y: 0.0,
      z: 0.0,
      function: 'Cargo',
      description: '智慧貨物取貨站點（有貨）',
      has_cargo: true
    },
    {
      id: 'Node-04',
      name: '貨物站 Node-04',
      x: 6.0,
      y: 0.0,
      z: 6.0,
      function: 'Cargo',
      description: '智慧貨物卸貨站點（無貨）',
      has_cargo: false
    }
  ];

  ctx.factoryLayout.edges = [
    { id: 'Edge-01-02', startNodeId: 'Node-01', endNodeId: 'Node-02', bidirectional: true },
    { id: 'Edge-02-03', startNodeId: 'Node-02', endNodeId: 'Node-03', bidirectional: true },
    { id: 'Edge-03-04', startNodeId: 'Node-03', endNodeId: 'Node-04', bidirectional: true },
    { id: 'Edge-02-04', startNodeId: 'Node-02', endNodeId: 'Node-04', bidirectional: true }
  ];

  ctx.factoryLayout.props = [];

  if (sc) ctx.rebuildLayoutInScene(sc);
  ctx.markLayoutDirty();
  ctx.notify('已載入標準測試拓撲 (4 站點：充電站⚡ + 通道 + 取貨站[有貨] + 放貨站[無貨])，請點擊「儲存並模擬」！', 'success');
}

export function clearCanvasEntirely(sc: BABYLON.Scene, ctx: LayoutCommandsContext) {
  if (ctx.showResetModal) ctx.showResetModal.value = false;
  ctx.factoryLayout.nodes = [];
  ctx.factoryLayout.edges = [];
  ctx.factoryLayout.props = [];
  if (sc) ctx.rebuildLayoutInScene(sc);
  ctx.markLayoutDirty();
  ctx.notify('已清空地圖所有節點與路徑 (空白畫布)，您可以開始從零建立！', 'info');
}

export async function handleCancelEdit(sc: BABYLON.Scene, ctx: LayoutCommandsContext) {
  ctx.clearLayoutDirty();
  await ctx.fetchLayout(true);
  if (sc) ctx.rebuildLayoutInScene(sc);
  ctx.currentAppMode.value = 'simulate';
  ctx.currentEditorTool.value = 'select';
  ctx.attachGizmoToTarget(null);
  ctx.clearNodeSelection();
  ctx.cancelEdgeConnection();
  ctx.closeCargoContextMenu?.();
  ctx.notify('已取消編輯，未儲存的場域變更已捨棄並返回模擬模式', 'info');
}
