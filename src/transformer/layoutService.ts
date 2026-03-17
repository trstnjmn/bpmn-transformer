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

const ELEMENT_COLORS: Record<string, { fill: string; stroke: string }> = {
  'bpmn:UserTask': { fill: '#fff9c4', stroke: '#fbc02d' },
  'bpmn:ServiceTask': { fill: '#e3f2fd', stroke: '#1e88e5' },
  'bpmn:BusinessRuleTask': { fill: '#e8f5e9', stroke: '#2e7d32' },
  'bpmn:Task': { fill: '#f5f5f5', stroke: '#757575' },
};

interface ElementSizeInfo {
  width: number;
  height: number;
  shapeWidth: number;
  shapeHeight: number;
  label?: { width: number; height: number };
}

/**
 * Hilfsfunktion: Berechnet den exakten Ankerpunkt am Rand eines Shapes.
 * Verhindert, dass Pfeile in Kreise (Events) oder Rauten (Gateways) hineinragen.
 */
function getAnchorPoint(nodeType: string, shape: DiagramLayout, isSource: boolean) {
  const x = shape.x || 0;
  const y = shape.y || 0;
  const w = shape.width || 0;

  const TASK_MID = 40;
  let yOffset = TASK_MID;

  if (nodeType.includes('Event')) {
    yOffset = 18; // Mitte von 36px
  } else if (nodeType.includes('Gateway')) {
    yOffset = 25; // Mitte von 50px
  } else {
    yOffset = (shape.height || 80) / 2;
  }

  return {
    x: isSource ? x + w : x,
    y: y + yOffset
  };
}

function getElementSize(type: string, name?: string): ElementSizeInfo {
  const baseSize = ELEMENT_SIZES[type] ?? { width: 100, height: 80 };
  const nameToUse = name || '';

  const isTask = type.includes('Task') || type === 'bpmn:Task';
  if (isTask) {
    const charWidth = 6.5;
    const lines = nameToUse.split('\n');
    const estimatedLines = Math.max(lines.length, 1);
    const longestLine = lines.reduce((max, line) => Math.max(max, line.length), 0);
    const totalTextWidth = longestLine * charWidth;

    let width = 100;
    if (totalTextWidth > 75) {
      width = Math.min(200, 100 + (totalTextWidth - 75));
    }

    const lineHeight = 17;
    const calculatedHeight = Math.max(baseSize.height, (estimatedLines * lineHeight) + 30);

    return {
      width: Math.round(width),
      height: Math.round(calculatedHeight),
      shapeWidth: Math.round(width),
      shapeHeight: Math.round(calculatedHeight),
    };
  }

  if (nameToUse && !isTask) {
    const charWidth = 7;
    const labelWidth = Math.min(150, Math.max(80, nameToUse.length * charWidth));
    const estimatedLines = Math.ceil((nameToUse.length * charWidth) / labelWidth);
    const labelHeight = estimatedLines * 15;

    return {
      width: Math.max(baseSize.width, labelWidth),
      height: baseSize.height + labelHeight + 10,
      shapeWidth: baseSize.width,
      shapeHeight: baseSize.height,
      label: { width: labelWidth, height: labelHeight }
    };
  }

  return {
    width: baseSize.width,
    height: baseSize.height,
    shapeWidth: baseSize.width,
    shapeHeight: baseSize.height,
  };
}

export async function computeElkLayout(
    elements: ProcessElement[],
    lanes?: LaneDefinition[],
    fileName?: string
): Promise<{
  layout: DiagramLayout[];
  validEdgeIds: Set<string>;
}> {
  const laneIds = new Set(lanes?.map(l => l.id) || []);
  const nodes = elements.filter(e => e.type !== 'bpmn:SequenceFlow' && !laneIds.has(e.id));
  const nodeIds = new Set(nodes.map(n => n.id));
  const edges = elements.filter(e =>
      e.type === 'bpmn:SequenceFlow' && e.sourceRef && e.targetRef &&
      nodeIds.has(e.sourceRef) && nodeIds.has(e.targetRef)
  );
  const validEdgeIds = new Set(edges.map(e => e.id));

  const elkGraph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '80',
      'elk.layered.spacing.nodeNodeBetweenLayers': '100',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.partitioning': 'true',
      'elk.separateConnectedComponents': 'false',
      'elk.alignment': 'TOP',
    },
    children: nodes.map(node => {
      const size = getElementSize(node.type, node.name);
      return {
        id: node.id,
        width: size.width,
        height: size.height,
        layoutOptions: {
          'elk.partition': String(getRoleRank(node.role))
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
  const X_OFFSET = 120; // Puffer für Lane-Labels

  // 1. Shapes (Nodes) mappen
  for (const child of laidOut.children ?? []) {
    const node = nodes.find(n => n.id === child.id);
    const sizeInfo = getElementSize(node?.type ?? '', node?.name);
    const colors = node ? ELEMENT_COLORS[node.type] : undefined;

    let finalYPos = Math.round(child.y ?? 0);

    if (node?.type.includes('Event')) {
      finalYPos += 22;
    } else if (node?.type.includes('Gateway')) {
      finalYPos += 15;
    }

    layout.push({
      id: child.id + '_di',
      type: 'shape',
      bpmnElement: child.id,
      x: Math.round((child.x ?? 0)) + X_OFFSET,
      y: finalYPos, // Nutzt den korrigierten Wert
      width: sizeInfo.shapeWidth,
      height: sizeInfo.shapeHeight,
      fill: colors?.fill,
      stroke: colors?.stroke,
    });
  }

  // 2. Edges mappen (mit Snapping-Hilfsfunktion)
  for (const edge of (laidOut.edges ?? []) as any[]) {
    const sourceNode = nodes.find(n => n.id === edge.sources[0]);
    const targetNode = nodes.find(n => n.id === edge.targets[0]);

    const sourceShape = layout.find(l => l.bpmnElement === edge.sources[0]);
    const targetShape = layout.find(l => l.bpmnElement === edge.targets[0]);

    if (!sourceShape || !targetShape) continue;

    const sections = edge.sections ?? [];
    let waypoints = sections.flatMap((s: any) => [
      { x: Math.round(s.startPoint.x + X_OFFSET), y: Math.round(s.startPoint.y) },
      ...(s.bendPoints?.map((bp: any) => ({ x: Math.round(bp.x + X_OFFSET), y: Math.round(bp.y) })) || []),
      { x: Math.round(s.endPoint.x + X_OFFSET), y: Math.round(s.endPoint.y) }
    ]);

    if (waypoints.length >= 2) {
      waypoints[0] = getAnchorPoint(sourceNode!.type, sourceShape, true);
      waypoints[waypoints.length - 1] = getAnchorPoint(targetNode!.type, targetShape, false);
    }

    layout.push({ id: edge.id + '_di', type: 'edge', bpmnElement: edge.id, waypoints });
  }

  // 3. Titel-Offset
  const titleOffset = fileName ? 80 : 0;
  if (titleOffset > 0) {
    layout.forEach(item => {
      item.y = (item.y || 0) + titleOffset;
      if (item.type === 'edge' && item.waypoints) {
        item.waypoints.forEach(wp => wp.y += titleOffset);
      }
    });
  }

  // 4. LANES GENERIEREN (Um die positionierten Elemente herum)
  if (lanes && lanes.length > 0) {
    const maxDiagramWidth = Math.max(...layout.map(i => (i.x || 0) + (i.width || 0)), 1000);

    lanes.forEach(lane => {
      const laneContent = layout.filter(item =>
          item.type === 'shape' && lane.elementIds.includes(item.bpmnElement)
      );

      if (laneContent.length === 0) return;

      const minY = Math.min(...laneContent.map(i => i.y || 0));
      const maxY = Math.max(...laneContent.map(i => (i.y || 0) + (i.height || 0)));
      const padding = 20;

      layout.push({
        id: lane.id + '_di',
        type: 'shape',
        bpmnElement: lane.id,
        x: 10,
        y: minY - padding,
        width: maxDiagramWidth + padding - 10,
        height: (maxY - minY) + (padding * 2)
      });
    });
  }

  return { layout, validEdgeIds };
}