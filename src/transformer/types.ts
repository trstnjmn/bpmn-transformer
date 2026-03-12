export type BPMNElementType = 
  | 'bpmn:StartEvent' 
  | 'bpmn:EndEvent' 
  | 'bpmn:IntermediateCatchEvent'
  | 'bpmn:UserTask' 
  | 'bpmn:ServiceTask' 
  | 'bpmn:BusinessRuleTask'
  | 'bpmn:Task'
  | 'bpmn:ExclusiveGateway' 
  | 'bpmn:SequenceFlow';

export interface ProcessElement {
  id: string;
  type: BPMNElementType;
  name?: string;
  sourceRef?: string; // For sequence flows
  targetRef?: string; // For sequence flows
}

export interface ProcessDefinition {
  id: string;
  name?: string;
  elements: ProcessElement[];
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
