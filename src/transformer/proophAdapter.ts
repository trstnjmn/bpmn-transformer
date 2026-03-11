import type { ConversionInput, ProcessElement, DiagramLayout } from './types';

/**
 * Helper to get attributes from an object, handling both '@_prefix' and '@attributes' nesting.
 */
function getAttrs(obj: any): any {
  if (!obj) return {};
  const attrs: any = {};
  
  // 1. Check for nested @attributes
  if (obj['@attributes']) {
    Object.assign(attrs, obj['@attributes']);
  }

  // 2. Check for @_ prefixed properties and merge them
  Object.keys(obj).forEach(key => {
    if (key.startsWith('@_')) {
      attrs[key.substring(2)] = obj[key];
    } else if (key === 'id' || key === 'value' || key === 'style' || key === 'vertex' || key === 'edge' || key === 'source' || key === 'target' || key === 'parent') {
      // Also accept direct properties if they are standard mxGraph attributes
      attrs[key] = obj[key];
    }
  });

  return attrs;
}

/**
 * Maps Prooph Board mxGraph JSON to our internal ConversionInput format.
 */
export function mapProophToConversionInput(proophData: any): ConversionInput {
  const root = proophData?.mxGraphModel?.root;
  if (!root) throw new Error('Invalid Prooph Board JSON: mxGraphModel.root is missing.');

  const elements: ProcessElement[] = [];
  const layout: DiagramLayout[] = [];

  // 1. Collect ALL cells and metadata
  const allCells: any[] = [];
  const metadataMap = new Map<string, any>();
  
  const processObject = (obj: any) => {
    if (!obj || typeof obj !== 'object') return;

    const attrs = getAttrs(obj);
    const id = attrs.id;

    if (id) {
      metadataMap.set(id, attrs);
    }

    // Handle mxCell
    if (obj.mxCell) {
      const cells = Array.isArray(obj.mxCell) ? obj.mxCell : [obj.mxCell];
      cells.forEach((cell: any) => {
        // If the cell doesn't have an ID but the parent object does, inherit it
        const cellAttrs = getAttrs(cell);
        if (!cellAttrs.id && id) {
          cell['@_id'] = id; // Inject ID into cell for later processing
        }
        allCells.push(cell);
      });
    }

    // Recursive search
    Object.keys(obj).forEach(key => {
      if (key !== 'mxCell' && !key.startsWith('@')) {
        const val = obj[key];
        if (Array.isArray(val)) {
          val.forEach(item => processObject(item));
        } else {
          processObject(val);
        }
      }
    });
  };

  processObject(root);

  // 2. Map Cells to BPMN
  allCells.forEach((cell: any) => {
    const attr = getAttrs(cell);
    const id = attr.id;
    const style = attr.style || '';
    const geometry = cell.mxGeometry ? getAttrs(cell.mxGeometry) : null;
    const meta = metadataMap.get(id);

    if (!id || id === '0' || id === '1') return;

    // Handle Vertices (Nodes)
    if (attr.vertex === '1' || attr.vertex === 1) {
      let type: any = 'bpmn:Task'; 
      let name = meta?.label || attr.value || '';

      name = name.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').trim();

      if (style.includes('event')) {
        type = 'bpmn:IntermediateCatchEvent';
      } else if (style.includes('command')) {
        type = 'bpmn:UserTask';
      } else if (style.includes('policy')) {
        type = 'bpmn:BusinessRuleTask';
      } else if (style.includes('boundedContext') || style.includes('feature') || style.includes('freeText') || style.includes('icon')) {
        return; 
      }

      elements.push({
        id: id,
        type: type,
        name: name || id
      });

      if (geometry) {
        layout.push({
          id: id + '_di',
          type: 'shape',
          bpmnElement: id,
          x: parseInt(geometry.x || '0'),
          y: parseInt(geometry.y || '0'),
          width: parseInt(geometry.width || '100'),
          height: parseInt(geometry.height || '80')
        });
      }
    }

    // Handle Edges (Flows)
    if ((attr.edge === '1' || attr.edge === 1) && attr.source && attr.target) {
      elements.push({
        id: id,
        type: 'bpmn:SequenceFlow',
        sourceRef: attr.source,
        targetRef: attr.target
      });

      const waypoints: { x: number, y: number }[] = [];
      const geoArray = cell.mxGeometry?.Array || cell.mxGeometry?.points; // Handle different point structures
      
      if (geoArray?.mxPoint) {
        const points = Array.isArray(geoArray.mxPoint) ? geoArray.mxPoint : [geoArray.mxPoint];
        points.forEach((p: any) => {
          const pAttr = getAttrs(p);
          if (pAttr.x !== undefined && pAttr.y !== undefined) {
            waypoints.push({
              x: parseInt(pAttr.x),
              y: parseInt(pAttr.y)
            });
          }
        });
      }

      layout.push({
        id: id + '_di',
        type: 'edge',
        bpmnElement: id,
        waypoints: waypoints.length > 0 ? waypoints : undefined
      });
    }
  });

  return {
    process: {
      id: 'ProophProcess',
      name: 'Imported from Prooph Board',
      elements: elements
    },
    layout: layout
  };
}
