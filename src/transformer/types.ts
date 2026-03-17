export type BPMNElementType =
  | 'bpmn:StartEvent'
  | 'bpmn:EndEvent'
  | 'bpmn:IntermediateCatchEvent'
  | 'bpmn:UserTask'
  | 'bpmn:ServiceTask'
  | 'bpmn:Process'
  | 'bpmn:BusinessRuleTask'
  | 'bpmn:Task'
  | 'bpmn:ExclusiveGateway'
  | 'bpmn:SequenceFlow';

export interface ProcessElement {
  id: string;
  type: BPMNElementType;
  name?: string;
  roles?: string[]; // For role-based sorting/lanes
  shared?: boolean; // Flag for elements belonging to multiple roles
  sourceRef?: string; // For sequence flows
  targetRef?: string; // For sequence flows
}

export interface LaneDefinition {
  id: string;
  name: string;
  elementIds: string[];
}

export interface ProcessDefinition {
  id: string;
  name?: string;
  elements: ProcessElement[];
  lanes?: LaneDefinition[];
}

export interface DiagramLayout {
  id: string;
  type: 'shape' | 'edge';
  bpmnElement: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  waypoints?: { x: number; y: number }[];
  fill?: string;
  stroke?: string;
  label?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface ConversionInput {
  process: ProcessDefinition;
  layout?: DiagramLayout[];
}
