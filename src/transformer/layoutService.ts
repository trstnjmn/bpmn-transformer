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
    
    // Check for explicit line breaks introduced by wordWrap
    const lines = nameToUse.split('\n');
    const estimatedLines = Math.max(lines.length, 1);
    
    // Find the longest line to determine width
    const longestLine = lines.reduce((max, line) => Math.max(max, line.length), 0);
    const totalTextWidth = longestLine * charWidth;
    
    let width = 100;
    if (totalTextWidth > 75) {
      width = Math.min(200, 100 + (totalTextWidth - 75));
    }
    
    const lineHeight = 17;
    // Base height 80, add space for more than 2 lines
    const calculatedHeight = Math.max(baseSize.height, (estimatedLines * lineHeight) + 30);
    
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
export async function computeElkLayout(
    elements: ProcessElement[],
    lanes?: LaneDefinition[],
    fileName?: string
): Promise<{
  layout: DiagramLayout[];
  validEdgeIds: Set<string>;
}> {
  const nodes = elements.filter(e => e.type !== 'bpmn:SequenceFlow');
  const nodeIds = new Set(nodes.map(n => n.id));
  const allEdges = elements.filter(e => e.type === 'bpmn:SequenceFlow' && e.sourceRef && e.targetRef);
  const edges = allEdges.filter(e => nodeIds.has(e.sourceRef!) && nodeIds.has(e.targetRef!));
  const validEdgeIds = new Set(edges.map(e => e.id));

  const elkGraph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '100',
      'elk.layered.spacing.nodeNodeBetweenLayers': '100',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
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
        layoutOptions: { 'elk.partition': String(getRoleRank(node.role)) }
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

  // 1. Nodes mappen
  for (const child of laidOut.children ?? []) {
    const node = nodes.find(n => n.id === child.id);
    const sizeInfo = getElementSize(node?.type ?? '', node?.name);
    const colors = node ? ELEMENT_COLORS[node.type] : undefined;

    layout.push({
      id: child.id + '_di',
      type: 'shape',
      bpmnElement: child.id,
      x: Math.round((child.x ?? 0) + (child.width! - sizeInfo.shapeWidth) / 2) + 50,
      y: Math.round(child.y ?? 0),
      width: sizeInfo.shapeWidth,
      height: sizeInfo.shapeHeight,
      fill: colors?.fill,
      stroke: colors?.stroke,
    });
  }

  // 2. Edges mappen
  for (const edge of (laidOut.edges ?? []) as any[]) {
    const sections = edge.sections ?? [];
    const waypoints = sections.flatMap((s: any) => [
      { x: Math.round(s.startPoint.x + 50), y: Math.round(s.startPoint.y) },
      ...(s.bendPoints?.map((bp: any) => ({ x: Math.round(bp.x + 50), y: Math.round(bp.y) })) || []),
      { x: Math.round(s.endPoint.x + 50), y: Math.round(s.endPoint.y) }
    ]);
    layout.push({ id: edge.id + '_di', type: 'edge', bpmnElement: edge.id, waypoints });
  }

  // 3. Titel und Header-Logik
  if (fileName) {
    const titleOffset = 80;

    // Verschiebe das gesamte Diagramm um 80px nach unten
    layout.forEach(item => {
      item.y = (item.y || 0) + titleOffset;
      if (item.type === 'edge' && item.waypoints) {
        item.waypoints.forEach(wp => wp.y += titleOffset);
      }
    });

  }

  // 4. Lanes berechnen
  if (lanes && lanes.length > 0) {
    // Collect all shapes and find the maximum width of the diagram
    const shapes = layout.filter(item => item.type === 'shape');
    
    // Use ELK's calculated width if available, otherwise fallback to elements
    const elkWidth = (laidOut as any).width || 0;
    const maxX = Math.max(...shapes.map(s => (s.x || 0) + (s.width || 0)), elkWidth + 50, 800);
    
    // Also consider edges in width calculation
    const edgesWidth = (laidOut.edges ?? []).reduce((max, edge: any) => {
      const edgeMaxX = (edge.sections ?? []).reduce((sMax: number, s: any) => {
        const points = [s.startPoint, ...(s.bendPoints || []), s.endPoint];
        return Math.max(sMax, ...points.map((p: any) => p.x + 50));
      }, 0);
      return Math.max(max, edgeMaxX);
    }, 0);

    const diagramWidth = Math.max(maxX, edgesWidth) + 150; // Increased padding

    // Map lanes to their element boundaries
    const laneBounds = lanes
      .map(lane => {
        const laneElements = layout.filter(item => item.type === 'shape' && lane.elementIds.includes(item.bpmnElement));
        if (laneElements.length === 0) return null;

        const minY = Math.min(...laneElements.map(i => i.y || 0));
        const maxY = Math.max(...laneElements.map(i => (i.y || 0) + (i.height || 0)));
        const rank = getRoleRank(lane.name);

        return { lane, minY, maxY, rank };
      })
      .filter((b): b is NonNullable<typeof b> => b !== null)
      .sort((a, b) => a.rank - b.rank);

    // Calculate contiguous boundaries
    for (let i = 0; i < laneBounds.length; i++) {
      const current = laneBounds[i];
      const next = laneBounds[i + 1];

      let laneY: number;
      let laneHeight: number;

      if (i === 0) {
        // First lane: start above elements
        laneY = current.minY - 50;
      } else {
        // Subsequent lanes: start where previous ended
        const prevLaneDI = layout[layout.length - 1];
        laneY = (prevLaneDI.y || 0) + (prevLaneDI.height || 0);
      }

      if (next) {
        // Boundary between current and next
        const currentBottom = current.maxY + 40;
        const nextTop = next.minY - 40;
        const boundary = Math.round(Math.max(currentBottom, (currentBottom + nextTop) / 2));
        laneHeight = boundary - laneY;
      } else {
        // Last lane
        laneHeight = (current.maxY - laneY) + 60;
      }

      layout.push({
        id: current.lane.id + '_di',
        type: 'shape',
        bpmnElement: current.lane.id,
        x: 0,
        y: laneY,
        width: diagramWidth,
        height: Math.max(laneHeight, 100)
      });
    }
  }

  return { layout, validEdgeIds };
}