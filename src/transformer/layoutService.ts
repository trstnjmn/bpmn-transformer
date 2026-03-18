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
  'bpmn:StartEvent': { fill: '#ffffff', stroke: '#000000' },
  'bpmn:EndEvent': { fill: '#ffffff', stroke: '#000000' },
  'bpmn:IntermediateCatchEvent': { fill: '#ffffff', stroke: '#000000' },
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

  const elkGraph: any = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.orthogonality': 'true',
      'elk.spacing.nodeNode': '80',
      'elk.layered.spacing.nodeNodeBetweenLayers': '100',
      'org.eclipse.elk.portConstraints': 'FIXED_POS', // Wichtig für die Ports
    },
    children: nodes.map(node => {
      const size = getElementSize(node.type, node.name);

      // Bei Events (36x36) ist die Mitte 18. Bei Tasks (z.B. Höhe 80) ist sie 40.
      const halfHeight = size.shapeHeight / 2;

      return {
        id: node.id,
        width: size.shapeWidth,
        height: size.shapeHeight,
        ports: [
          {
            id: `${node.id}_in`,
            x: 0,
            y: halfHeight,
            layoutOptions: { 'elk.port.side': 'WEST' }
          },
          {
            id: `${node.id}_out`,
            x: size.shapeWidth,
            y: halfHeight,
            layoutOptions: { 'elk.port.side': 'EAST' }
          }
        ],
        layoutOptions: {
          'elk.partition': String(getRoleRank(node.role)),
          'org.eclipse.elk.portConstraints': 'FIXED_POS',
        }
      };
    }),
    edges: edges.map(edge => ({
      id: edge.id,
      sources: [`${edge.sourceRef}_out`],
      targets: [`${edge.targetRef}_in`],
    })),
  };

  const laidOut = await elk.layout(elkGraph);
  const layout: DiagramLayout[] = [];
  const X_OFFSET = 150; // Genug Platz für Lane-Labels links
  const titleOffset = fileName ? 80 : 20;

  // 1. Shapes mappen
  for (const child of laidOut.children ?? []) {
    const node = nodes.find(n => n.id === child.id);
    const colors = node ? ELEMENT_COLORS[node.type] : undefined;

    layout.push({
      id: child.id + '_di',
      type: 'shape',
      bpmnElement: child.id,
      x: Math.round(child.x ?? 0) + X_OFFSET,
      y: Math.round(child.y ?? 0) + titleOffset,
      width: child.width,
      height: child.height,
      fill: colors?.fill,
      stroke: colors?.stroke,
    });
  }

  // 2. Edges mappen
  for (const edge of (laidOut.edges ?? []) as any[]) {
    const sections = edge.sections ?? [];

    // ELK liefert durch die Ports bereits sehr saubere Start- und Endpunkte
    const waypoints = sections.flatMap((s: any) => [
      {
        x: Math.round(s.startPoint.x + X_OFFSET),
        y: Math.round(s.startPoint.y + titleOffset)
      },
      ...(s.bendPoints?.map((bp: any) => ({
        x: Math.round(bp.x + X_OFFSET),
        y: Math.round(bp.y + titleOffset)
      })) || []),
      {
        x: Math.round(s.endPoint.x + X_OFFSET),
        y: Math.round(s.endPoint.y + titleOffset)
      }
    ]);

    layout.push({
      id: edge.id + '_di',
      type: 'edge',
      bpmnElement: edge.id,
      waypoints
    });
  }

  // 3. Lanes (Berechnung bleibt ähnlich, aber nutzt die neuen Offsets)
  if (lanes && lanes.length > 0) {
    const maxDiagramWidth = Math.max(...layout.map(i => (i.x || 0) + (i.width || 0)), 1000);

    lanes.forEach(lane => {
      const laneContent = layout.filter(item =>
          item.type === 'shape' && lane.elementIds.includes(item.bpmnElement)
      );

      if (laneContent.length === 0) return;

      const minY = Math.min(...laneContent.map(i => i.y || 0));
      const maxY = Math.max(...laneContent.map(i => (i.y || 0) + (i.height || 0)));
      const padding = 30;

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