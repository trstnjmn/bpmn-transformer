declare module 'bpmn-js/lib/Modeler' {
  export default class BpmnModeler {
    constructor(options?: any);
    importXML(xml: string): Promise<any>;
    saveXML(options?: any): Promise<{ xml: string }>;
    saveSVG(options?: any): Promise<{ svg: string }>;
    destroy(): void;
    get(module: string): any;
    on(event: string, callback: (...args: any[]) => void): void;
  }
}
