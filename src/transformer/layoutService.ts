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
      'elk.spacing.nodeNode': '150',
      'elk.layered.spacing.nodeNodeBetweenLayers': '150',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.partitioning': 'true',
      'elk.partitioning.spacing': '300',
    },
    children: nodes.map(node => {
      const size = getElementSize(node.type, node.name);
      const allRoleNames = lanes?.map(l => l.name) || [];
      return {
        id: node.id,
        width: size.width,
        height: size.height,
        layoutOptions: { 'elk.partition': String(getRoleRank(node.roles?.[0], allRoleNames)) }
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
    
    // Default colors from map
    let colors = node ? ELEMENT_COLORS[node.type] : undefined;
    
    // Override for shared elements
    if (node?.shared) {
      colors = { fill: '#f3e5f5', stroke: '#7b1fa2' }; // Soft purple for shared roles
    }

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
    const allRoleNames = lanes.map(l => l.name);

    // Filter out lanes with no elements and sort by role rank
    const activeLanes = lanes
      .filter(lane => layout.some(item => item.type === 'shape' && lane.elementIds.includes(item.bpmnElement)))
      .sort((a, b) => getRoleRank(a.name, allRoleNames) - getRoleRank(b.name, allRoleNames));

    if (activeLanes.length > 0) {
      const diagramWidth = Math.max(2000, ...layout.filter(i => i.type === 'shape').map(i => (i.x || 0) + (i.width || 0) + 100));
      
      let currentY = activeLanes[0] ? 
        Math.min(...layout.filter(item => item.type === 'shape' && activeLanes[0].elementIds.includes(item.bpmnElement)).map(i => i.y || 0)) - 100 
        : 0;

      activeLanes.forEach((lane, index) => {
        const laneElements = layout.filter(item => item.type === 'shape' && lane.elementIds.includes(item.bpmnElement));
        const minY = Math.min(...laneElements.map(i => i.y || 0));
        const maxY = Math.max(...laneElements.map(i => (i.y || 0) + (i.height || 0)));

        let height = (maxY - minY) + 100;
        
        // Ensure lane starts where previous lane ended
        const laneY = currentY;

        // If there's a next lane, we might want to split the gap
        if (index < activeLanes.length - 1) {
          const nextLane = activeLanes[index + 1];
          const nextLaneElements = layout.filter(item => item.type === 'shape' && nextLane.elementIds.includes(item.bpmnElement));
          const nextMinY = Math.min(...nextLaneElements.map(i => i.y || 0));
          
          const rawBoundaryY = (maxY + nextMinY) / 2;
          
          // STRICT separation: If partitions overlap, we MUST force the line 
          // to be at least 60px away from the bottom of the current and top of next.
          // If the gap is too small, we center it.
          let boundaryY;
          if (nextMinY - maxY >= 120) {
            boundaryY = rawBoundaryY; // Healthy gap
          } else {
            // Gap is tight or overlapping - force the line between them
            // but prioritize the 60px margin from the top lane if possible
            boundaryY = maxY + 60;
            // But don't cut the next lane's elements
            if (boundaryY > nextMinY - 40) {
              boundaryY = (maxY + nextMinY) / 2;
            }
          }
          
          height = boundaryY - laneY;
        } else {
          // Last lane gets some extra padding
          height = (maxY - laneY) + 100;
        }

        layout.push({
          id: lane.id + '_di',
          type: 'shape',
          bpmnElement: lane.id,
          x: 0,
          y: Math.round(laneY),
          width: Math.round(diagramWidth),
          height: Math.round(height)
        });

        currentY = laneY + height;
      });
    }
  }

  return { layout, validEdgeIds };
}