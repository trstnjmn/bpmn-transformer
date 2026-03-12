import ELK from 'elkjs/lib/elk.bundled.js';
import type { ProcessElement, DiagramLayout, LaneDefinition } from './types';
import { getRoleRank } from './roleService';

const elk = new ELK();

const ELEMENT_SIZES: Record<string, { width: number; height: number }> = {
  'bpmn:StartEvent': { width: 36, height: 36 },
  'bpmn:EndEvent': { width: 36, height: 36 },
  'bpmn:IntermediateCatchEvent': { width: 36, height: 36 },
  'bpmn:UserTask': { width: 100, height: 80 },
  'bpmn:ServiceTask': { width: 100, height: 80 },
  'bpmn:BusinessRuleTask': { width: 100, height: 80 },
  'bpmn:Task': { width: 100, height: 80 },
  'bpmn:ExclusiveGateway': { width: 50, height: 50 },
};

/**
 * Recommended colors for BPMN elements.
 */
const ELEMENT_COLORS: Record<string, { fill: string; stroke: string }> = {
  'bpmn:UserTask': { fill: '#fff9c4', stroke: '#fbc02d' }, // Soft yellow
  'bpmn:ServiceTask': { fill: '#e3f2fd', stroke: '#1e88e5' }, // Soft blue
  'bpmn:BusinessRuleTask': { fill: '#e8f5e9', stroke: '#2e7d32' }, // Soft green
  'bpmn:Task': { fill: '#f5f5f5', stroke: '#757575' }, // Soft grey
};

/**
 * Detailed size info for an element, including child/label dimensions.
 */
interface ElementSizeInfo {
  width: number;       // Total layout width
  height: number;      // Total layout height
  shapeWidth: number;  // Direct BPMN element width
  shapeHeight: number; // Direct BPMN element height
  label?: {            // Optional external label info
    width: number;
    height: number;
  };
}

/**
 * Calculates the size of a BPMN element based on its type and label.
 * Handle internal text (Tasks) and external text (Events/Gateways).
 */
function getElementSize(type: string, name?: string): ElementSizeInfo {
  const baseSize = ELEMENT_SIZES[type] ?? { width: 100, height: 80 };
  const nameToUse = name || '';

  // 1. Task types (Internal labels)
  const isTask = type.includes('Task') || type === 'bpmn:Task';
  if (isTask) {
    const charWidth = 6.5;
    const totalTextWidth = nameToUse.length * charWidth;
    let width = 120;
    if (totalTextWidth > 80) {
      width = Math.min(240, 120 + (totalTextWidth - 80) * 0.25);
    }
    const usableWidth = width - 25;
    const estimatedLines = Math.max(1, Math.ceil(totalTextWidth / usableWidth));
    const lineHeight = 17;
    const calculatedHeight = Math.max(baseSize.height, (estimatedLines * lineHeight) + 35);

    return {
      width: Math.round(width),
      height: Math.round(calculatedHeight),
      shapeWidth: Math.round(width),
      shapeHeight: Math.round(calculatedHeight),
    };
  }

  // 2. Event/Gateway types (External labels)
  if (nameToUse) {
    const charWidth = 7;
    const labelWidth = Math.min(150, Math.max(80, nameToUse.length * charWidth));
    const estimatedLines = Math.ceil((nameToUse.length * charWidth) / labelWidth);
    const labelHeight = estimatedLines * 15;

    return {
      width: Math.max(baseSize.width, labelWidth),
      height: baseSize.height + labelHeight + 10, // gap of 10
      shapeWidth: baseSize.width,
      shapeHeight: baseSize.height,
      label: {
        width: labelWidth,
        height: labelHeight
      }
    };
  }

  // 3. Default
  return {
    width: baseSize.width,
    height: baseSize.height,
    shapeWidth: baseSize.width,
    shapeHeight: baseSize.height,
  };
}

/**
 * Takes a flat list of BPMN process elements and computes a clean,
 * automatic layout using the ELK layout engine.
 * Returns a new DiagramLayout[] with absolute x/y positions.
 */
export async function computeElkLayout(elements: ProcessElement[], lanes?: LaneDefinition[]): Promise<{
  layout: DiagramLayout[];
  validEdgeIds: Set<string>;
}> {
  const nodes = elements.filter(
    e => e.type !== 'bpmn:SequenceFlow'
  );

  // Build a set of all known node IDs so we can validate edge endpoints
  const nodeIds = new Set(nodes.map(n => n.id));

  const allEdges = elements.filter(
    e => e.type === 'bpmn:SequenceFlow' && e.sourceRef && e.targetRef
  );

  // Only include edges where BOTH source and target are known nodes
  const edges = allEdges.filter(
    e => nodeIds.has(e.sourceRef!) && nodeIds.has(e.targetRef!)
  );

  const skippedEdges = allEdges.length - edges.length;
  if (skippedEdges > 0) {
    console.warn(`[ELK] Skipped ${skippedEdges} edge(s) referencing unknown nodes.`);
  }

  const validEdgeIds = new Set(edges.map(e => e.id));

  // Build the ELK graph structure
  const elkGraph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '100',
      'elk.layered.spacing.nodeNodeBetweenLayers': '100',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.partitioning': 'true',
      'elk.partitioning.spacing': '100',
    },
    children: nodes.map(node => {
      const size = getElementSize(node.type, node.name);
      return {
        id: node.id,
        width: size.width,
        height: size.height,
        layoutOptions: {
          'elk.partition': String(getRoleRank(node.role)),
        }
      };
    }),
    edges: edges.map(edge => ({
      id: edge.id,
      sources: [edge.sourceRef!],
      targets: [edge.targetRef!],
    })),
  };

  const laidOut = await elk.layout(elkGraph);

  const layout: DiagramLayout[] = [];

  // Map node positions back to DiagramLayout
  for (const child of laidOut.children ?? []) {
    const node = nodes.find(n => n.id === child.id);
    const sizeInfo = getElementSize(node?.type ?? '', node?.name);
    const colors = node ? ELEMENT_COLORS[node.type] : undefined;

    const shapeX = Math.round((child.x ?? 0) + (child.width! - sizeInfo.shapeWidth) / 2) + 50; // Add 50 for lane headers
    const shapeY = Math.round(child.y ?? 0);

    const layoutItem: DiagramLayout = {
      id: child.id + '_di',
      type: 'shape',
      bpmnElement: child.id,
      x: shapeX,
      y: shapeY,
      width: sizeInfo.shapeWidth,
      height: sizeInfo.shapeHeight,
      fill: colors?.fill,
      stroke: colors?.stroke,
    };

    if (sizeInfo.label) {
      layoutItem.label = {
        x: Math.round((child.x ?? 0) + (child.width! - sizeInfo.label.width) / 2) + 50,
        y: Math.round(shapeY + sizeInfo.shapeHeight + 5),
        width: sizeInfo.label.width,
        height: sizeInfo.label.height,
      };
    }

    layout.push(layoutItem);
  }

  // Map edge waypoints back to DiagramLayout
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const edge of (laidOut.edges ?? []) as any[]) {
    const sections = edge.sections ?? [];
    const waypoints: { x: number; y: number }[] = [];

    for (const section of sections) {
      if (section.startPoint) waypoints.push({ x: Math.round(section.startPoint.x + 50), y: Math.round(section.startPoint.y) });
      for (const bp of section.bendPoints ?? []) {
        waypoints.push({ x: Math.round(bp.x + 50), y: Math.round(bp.y) });
      }
      if (section.endPoint) waypoints.push({ x: Math.round(section.endPoint.x + 50), y: Math.round(section.endPoint.y) });
    }

    layout.push({
      id: edge.id + '_di',
      type: 'edge',
      bpmnElement: edge.id,
      waypoints: waypoints.length > 0 ? waypoints : undefined,
    });
  }

  // Calculate Lane Layouts if provided
  if (lanes && lanes.length > 0) {
    const laneMap = new Map<string, LaneDefinition>();
    lanes.forEach(l => laneMap.set(l.id, l));

    // Find the total diagram width
    let maxEndX = 0;
    layout.forEach(item => {
      if (item.type === 'shape' && item.x !== undefined && item.width !== undefined) {
        maxEndX = Math.max(maxEndX, item.x + item.width);
      }
    });

    const diagramWidth = Math.max(800, maxEndX + 200);
    const lanePadding = 40;

    lanes.forEach(lane => {
      const laneElements = layout.filter(item => 
        item.type === 'shape' && lane.elementIds.includes(item.bpmnElement)
      );

      if (laneElements.length === 0) return;

      let minY = Infinity;
      let maxY = -Infinity;

      laneElements.forEach(item => {
        minY = Math.min(minY, item.y || 0);
        maxY = Math.max(maxY, (item.y || 0) + (item.height || 0));
      });

      const laneY = minY - lanePadding;
      const laneHeight = Math.max(120, (maxY - minY) + (lanePadding * 2));

      layout.push({
        id: lane.id + '_di',
        type: 'shape',
        bpmnElement: lane.id,
        x: 0, 
        y: Math.max(0, laneY),
        width: diagramWidth + 50,
        height: laneHeight
      });
    });
  }

  return { layout, validEdgeIds };
}
