import * as BABYLON from '@babylonjs/core';
import type { AppMode, FactoryLayout, LayoutEdge } from '../../types';
import { createNodeInScene, type NodeMeshContext } from './nodeMeshes';
import { createEdgeInScene, updateDynamicPathMaterials, type EdgeMeshContext } from './edgeMeshes';
import { createPropInScene } from './propMeshes';

export interface LayoutBuilderContext {
  factoryLayout: FactoryLayout;
  nodeMeshCtx: NodeMeshContext;
  edgeMeshCtx: EdgeMeshContext;
  propMeshesMap: Map<string, BABYLON.AbstractMesh>;
  fetchLayout: () => Promise<any>;
  currentAppMode?: { value: AppMode };
  hasUnsavedChanges?: { value: boolean };
}

export function rebuildLayoutInScene(sc: BABYLON.Scene, ctx: LayoutBuilderContext) {
  const { nodeMeshCtx, edgeMeshCtx, propMeshesMap, factoryLayout } = ctx;

  nodeMeshCtx.nodeMeshesMap.forEach(m => m.dispose());
  nodeMeshCtx.nodeMeshesMap.clear();

  nodeMeshCtx.stationPalletMap.forEach(m => m.dispose());
  nodeMeshCtx.stationPalletMap.clear();

  nodeMeshCtx.stationCargoMap.forEach(m => m.dispose());
  nodeMeshCtx.stationCargoMap.clear();

  nodeMeshCtx.nodeTextureMap.clear();

  edgeMeshCtx.edgeMeshesMap.forEach(m => m.dispose());
  edgeMeshCtx.edgeMeshesMap.clear();

  edgeMeshCtx.edgeArrowMeshesMap.forEach(arrows => arrows.forEach(a => a.dispose()));
  edgeMeshCtx.edgeArrowMeshesMap.clear();

  propMeshesMap.forEach(m => m.dispose());
  propMeshesMap.clear();

  factoryLayout.nodes.forEach(node => {
    createNodeInScene(sc, node, nodeMeshCtx);
  });

  // Ensure at most one edge exists between any two nodes (prevent duplicates/overlap)
  const edgePairMap = new Map<string, LayoutEdge>();
  for (const edge of factoryLayout.edges) {
    const pairKey = [edge.startNodeId, edge.endNodeId].sort().join('---');
    edgePairMap.set(pairKey, edge);
  }
  factoryLayout.edges = Array.from(edgePairMap.values());

  factoryLayout.edges.forEach(edge => {
    createEdgeInScene(sc, edge, edgeMeshCtx);
  });

  factoryLayout.props.forEach(prop => {
    createPropInScene(sc, prop, propMeshesMap);
  });

  updateDynamicPathMaterials(edgeMeshCtx);
}

export async function loadAndRenderLayout(sc: BABYLON.Scene, ctx: LayoutBuilderContext) {
  // If in edit mode with unsaved changes, preserve and restore user's in-progress edits from localStorage!
  if (ctx.currentAppMode?.value === 'edit' && ctx.hasUnsavedChanges?.value) {
    try {
      const draftStr = localStorage.getItem('omnihive_edit_draft');
      if (draftStr) {
        const draft = JSON.parse(draftStr);
        if (draft && draft.nodes && draft.nodes.length > 0) {
          ctx.factoryLayout.version = draft.version || '2.0.0';
          ctx.factoryLayout.nodes = draft.nodes;
          ctx.factoryLayout.edges = draft.edges || [];
          ctx.factoryLayout.props = draft.props || [];
          rebuildLayoutInScene(sc, ctx);
          console.log('[BabylonScene] Restored edit draft upon load');
          return;
        }
      }
    } catch (e) {
      console.warn('Failed to parse draft in BabylonScene:', e);
    }
  }

  await ctx.fetchLayout();
  rebuildLayoutInScene(sc, ctx);
}
