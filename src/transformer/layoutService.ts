import ELK from 'elkjs/lib/elk.bundled.js';
import type { ProcessElement, DiagramLayout } from './types';

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
 * Calculates the size of a BPMN element based on its type and label.
 * Aims for a 4:3 aspect ratio for larger tasks.
 */
function getElementSize(type: string, name?: string): { width: number; height: number } {
  const baseSize = ELEMENT_SIZES[type] ?? { width: 100, height: 80 };

  // Only scale task types which have text inside
  const isTask = type.includes('Task') || type === 'bpmn:Task';

  if (!isTask || !name) {
    return baseSize;
  }

  // Heuristic for single-line width: ~8 pixels per character (font-size 12-14px)
  const padding = 30;
  const singleLineTotalWidth = (name.length * 8) + padding;
  
  // If the text is short enough for the base size, just return base size
  if (singleLineTotalWidth <= baseSize.width) {
    return baseSize;
  }

  // To maintain a 4:3 aspect ratio while providing enough area for text
  // We estimate the required area based on the single-line width and standard height
  const targetArea = singleLineTotalWidth * baseSize.height;
  
  // Area = w * h, and w/h = 4/3 => w = 4/3 * h
  // Area = 4/3 * h^2 => h = sqrt(Area * 3 / 4)
  const calculatedHeight = Math.sqrt(targetArea * 3 / 4);
  const calculatedWidth = (calculatedHeight * 4) / 3;

  return {
    width: Math.max(baseSize.width, Math.round(calculatedWidth)),
    height: Math.max(baseSize.height, Math.round(calculatedHeight)),
  };
}

/**
 * Takes a flat list of BPMN process elements and computes a clean,
 * automatic layout using the ELK layout engine.
 * Returns a new DiagramLayout[] with absolute x/y positions.
 */
export async function computeElkLayout(elements: ProcessElement[]): Promise<{
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
      'elk.spacing.nodeNode': '60',
      'elk.layered.spacing.nodeNodeBetweenLayers': '80',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.edgeRouting': 'ORTHOGONAL',
    },
    children: nodes.map(node => {
      const size = getElementSize(node.type, node.name);
      return {
        id: node.id,
        width: size.width,
        height: size.height,
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
    const size = getElementSize(node?.type ?? '', node?.name);
    const colors = node ? ELEMENT_COLORS[node.type] : undefined;

    layout.push({
      id: child.id + '_di',
      type: 'shape',
      bpmnElement: child.id,
      x: Math.round(child.x ?? 0),
      y: Math.round(child.y ?? 0),
      width: size.width,
      height: size.height,
      fill: colors?.fill,
      stroke: colors?.stroke,
    });
  }

  // Map edge waypoints back to DiagramLayout
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const edge of (laidOut.edges ?? []) as any[]) {
    const sections = edge.sections ?? [];
    const waypoints: { x: number; y: number }[] = [];

    for (const section of sections) {
      if (section.startPoint) waypoints.push({ x: Math.round(section.startPoint.x), y: Math.round(section.startPoint.y) });
      for (const bp of section.bendPoints ?? []) {
        waypoints.push({ x: Math.round(bp.x), y: Math.round(bp.y) });
      }
      if (section.endPoint) waypoints.push({ x: Math.round(section.endPoint.x), y: Math.round(section.endPoint.y) });
    }

    layout.push({
      id: edge.id + '_di',
      type: 'edge',
      bpmnElement: edge.id,
      waypoints: waypoints.length > 0 ? waypoints : undefined,
    });
  }

  return { layout, validEdgeIds };
}
