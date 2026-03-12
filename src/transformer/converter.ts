import { BpmnModdle } from 'bpmn-moddle';
import { sanitizeId } from './utils';
import type { ConversionInput } from './types';

// Initialize Moddle
const moddle = new BpmnModdle();

/**
 * Converts a JSON process definition into BPMN 2.0 XML.
 * 
 * @param input - The process definition and optional layout information.
 * @returns A promise that resolves to the BPMN 2.0 XML string.
 */
export async function convertToBpmnXml(input: ConversionInput): Promise<string> {
  const { process: processDef, layout } = input;

  if (!processDef) {
    throw new Error('Input JSON requires a "process" property at the root.');
  }

  // 1. Create Definitions (Root Container)
  const definitions = moddle.create('bpmn:Definitions', {
    targetNamespace: 'http://bpmn.io/schema/bpmn',
    'xmlns:bioc': 'http://bpmn.io/schema/bpmn/biocolor/1.0',
    'xmlns:color': 'http://www.omg.org/spec/BPMN/non-normative/color/1.0',
    exporter: 'Antigravity BPMN Transformer',
    exporterVersion: '1.0'
  });

  // 2. Create Process
  const processId = sanitizeId(processDef.id);
  const process = moddle.create('bpmn:Process', {
    id: processId,
    isExecutable: true,
    name: processDef.name || processId
  });

  // Moddle structures are often arrays that need to be initialized or obtained
  definitions.rootElements = [process];

  const flowElementsMap = new Map<string, any>();
  const allElements: any[] = [];

  // 3. Create Flow Elements (Nodes)
  const taskElements = processDef.elements.filter(el => el.type !== 'bpmn:SequenceFlow');
  taskElements.forEach(el => {
    const sanitizedId = sanitizeId(el.id);
    const moddleEl = moddle.create(el.type, {
      id: sanitizedId,
      name: el.name
    });

    allElements.push(moddleEl);
    flowElementsMap.set(sanitizedId, moddleEl);
  });

  // 4. Create Sequence Flows
  const sequenceFlows = processDef.elements.filter(el => el.type === 'bpmn:SequenceFlow');
  sequenceFlows.forEach(el => {
    const sanitizedId = sanitizeId(el.id);
    const sourceSaneId = sanitizeId(el.sourceRef!);
    const targetSaneId = sanitizeId(el.targetRef!);

    const source = flowElementsMap.get(sourceSaneId);
    const target = flowElementsMap.get(targetSaneId);

    if (source && target) {
      const sequenceFlow = moddle.create('bpmn:SequenceFlow', {
        id: sanitizedId,
        name: el.name,
        sourceRef: source,
        targetRef: target
      });

      allElements.push(sequenceFlow);
      flowElementsMap.set(sanitizedId, sequenceFlow);

      // Link source and target
      source.outgoing = source.outgoing || [];
      source.outgoing.push(sequenceFlow);

      target.incoming = target.incoming || [];
      target.incoming.push(sequenceFlow);
    }
  });

  // Add all elements to the process
  process.flowElements = allElements;

  // 4a. Handle Lanes
  if (processDef.lanes && processDef.lanes.length > 0) {
    const laneElements = processDef.lanes.map(l => {
      const lane = moddle.create('bpmn:Lane', {
        id: sanitizeId(l.id),
        name: l.name,
        flowNodeRef: l.elementIds.map(id => flowElementsMap.get(sanitizeId(id))).filter(Boolean)
      });
      flowElementsMap.set(lane.id, lane);
      return lane;
    });

    const laneSet = moddle.create('bpmn:LaneSet', {
      id: 'LaneSet_1',
      lanes: laneElements
    });

    process.laneSets = [laneSet];
  }

  // 5. Handle BPMN Diagram Layout (BPMNDI)
  if (layout && layout.length > 0) {
    const planeElements: any[] = [];

    layout.forEach(l => {
      const sanitizedElementId = sanitizeId(l.bpmnElement);
      const targetElement = flowElementsMap.get(sanitizedElementId) || (sanitizedElementId === processId ? process : null);

      if (!targetElement) return;

      if (l.type === 'shape') {
        const bounds = moddle.create('dc:Bounds', {
          x: l.x || 0,
          y: l.y || 0,
          width: l.width || 100,
          height: l.height || 80
        });

        const shapeParams: any = {
          id: sanitizeId(l.id || sanitizedElementId + '_di'),
          bpmnElement: targetElement,
          bounds: bounds,
          'bioc:stroke': l.stroke,
          'bioc:fill': l.fill,
          'color:background-color': l.fill,
          'color:border-color': l.stroke
        };

        if (l.label) {
          const labelBounds = moddle.create('dc:Bounds', {
            x: l.label.x,
            y: l.label.y,
            width: l.label.width,
            height: l.label.height
          });
          shapeParams.label = moddle.create('bpmndi:BPMNLabel', {
            bounds: labelBounds
          });
        }

        const shape = moddle.create('bpmndi:BPMNShape', shapeParams);
        
        // If it's a lane, we can force isHorizontal if needed, though usually inherited from parent diagram
        if (targetElement.$type === 'bpmn:Lane') {
          shape.isHorizontal = true;
        }
        
        planeElements.push(shape);
      } else if (l.type === 'edge') {
        const waypoints = (l.waypoints || []).map(wp =>
          moddle.create('dc:Point', { x: wp.x, y: wp.y })
        );

        const edge = moddle.create('bpmndi:BPMNEdge', {
          id: sanitizeId(l.id || sanitizedElementId + '_di'),
          bpmnElement: targetElement,
          waypoint: waypoints
        });
        planeElements.push(edge);
      }
    });

    const plane = moddle.create('bpmndi:BPMNPlane', {
      id: 'BPMNPlane_1',
      bpmnElement: process,
      planeElement: planeElements
    });

    const diagram = moddle.create('bpmndi:BPMNDiagram', {
      id: 'BPMNDiagram_1',
      plane: plane
    });

    definitions.diagrams = [diagram];
  }

  // 6. Generate XML
  const { xml } = await moddle.toXML(definitions, { format: true });
  return xml;
}
