import type { ConversionInput, ProcessElement, DiagramLayout, LaneDefinition } from './types';
import { extractRolesAndCleanName, getRoleRank } from './roleService';
import { wordWrap } from './utils';

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

    if (obj.mxCell) {
      const cells = Array.isArray(obj.mxCell) ? obj.mxCell : [obj.mxCell];
      cells.forEach((cell: any) => {
        const cellAttrs = getAttrs(cell);
        if (!cellAttrs.id && id) {
          cell['@_id'] = id; 
        }
        allCells.push(cell);
      });
    }

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

  // 2. Pre-calculate absolute positions
  const cellMap = new Map<string, { attr: any, geometry: any, cell: any }>();
  allCells.forEach(cell => {
    const attr = getAttrs(cell);
    if (attr.id) {
      cellMap.set(attr.id, {
        attr,
        geometry: cell.mxGeometry ? getAttrs(cell.mxGeometry) : null,
        cell
      });
    }
  });

  const getAbsolutePos = (id: string): { x: number, y: number } => {
    const entry = cellMap.get(id);
    if (!entry || !entry.geometry) return { x: 0, y: 0 };
    
    let x = parseInt(entry.geometry.x || '0');
    let y = parseInt(entry.geometry.y || '0');
    
    // Offset for labels/points if it's an edge, skip for now to avoid confusion
    if (entry.attr.edge === '1') return { x: 0, y: 0 };

    if (entry.attr.parent && entry.attr.parent !== '0' && entry.attr.parent !== '1') {
      const parentPos = getAbsolutePos(entry.attr.parent);
      x += parentPos.x;
      y += parentPos.y;
    }
    
    return { x, y };
  };

  // 3. Map Cells to BPMN
  const usedPositions = new Set<string>();

  allCells.forEach((cell: any) => {
    const attr = getAttrs(cell);
    const id = attr.id;
    const style = attr.style || '';
    const geometry = cell.mxGeometry ? getAttrs(cell.mxGeometry) : null;
    const meta = metadataMap.get(id);

    if (!id || id === '0' || id === '1') return;

    if (attr.vertex === '1' || attr.vertex === 1) {
      let type: any = 'bpmn:Task'; 
      let rawLabel = meta?.label || attr.value || '';
      // Strip HTML tags and normalize spacing
      rawLabel = rawLabel.replace(/<br\s*\/?>/gi, '\n'); 
      rawLabel = rawLabel.replace(/<[^>]*>/g, ' '); 
      rawLabel = rawLabel.replace(/&nbsp;/g, ' ');
      rawLabel = rawLabel.replace(/[ \t]+/g, ' ').trim();

      let { roles, cleanName } = extractRolesAndCleanName(rawLabel);

      if (style.includes('event')) {
        type = 'bpmn:IntermediateCatchEvent';
      } else if (style.includes('command')) {
        type = 'bpmn:UserTask';
      } else if (style.includes('policy')) {
        type = 'bpmn:BusinessRuleTask';
      } else if (style.includes('boundedContext') || style.includes('feature') || style.includes('freeText') || style.includes('icon') || style.includes('image')) {
        return; 
      }

      let { x, y } = getAbsolutePos(id);
      let width = parseInt(geometry?.width || '100');
      let height = parseInt(geometry?.height || '80');

      // Adjust sizes for BPMN standards if they seem generic
      if (type === 'bpmn:IntermediateCatchEvent') {
        width = 36;
        height = 36;
      }

      // Simple overlap prevention: if exact position used, shift it
      let posKey = `${x},${y}`;
      let safetyCounter = 0;
      while (usedPositions.has(posKey) && safetyCounter < 10) {
        x += 20;
        y += 20;
        posKey = `${x},${y}`;
        safetyCounter++;
      }
      usedPositions.add(posKey);

      // Visual cue for shared roles
      const displayName = roles.length > 1 ? `* ${cleanName}` : cleanName;

      elements.push({ 
        id, 
        type, 
        name: wordWrap(displayName || id, 18), 
        roles 
      });

      layout.push({
        id: id + '_di',
        type: 'shape',
        bpmnElement: id,
        x, y, width, height
      });
    }

    if ((attr.edge === '1' || attr.edge === 1) && attr.source && attr.target) {
      elements.push({
        id: id,
        type: 'bpmn:SequenceFlow',
        sourceRef: attr.source,
        targetRef: attr.target
      });

      const waypoints: { x: number, y: number }[] = [];
      const parentPos = attr.parent ? getAbsolutePos(attr.parent) : { x: 0, y: 0 };
      
      const geoArray = cell.mxGeometry?.Array || cell.mxGeometry?.points;
      if (geoArray?.mxPoint) {
        const points = Array.isArray(geoArray.mxPoint) ? geoArray.mxPoint : [geoArray.mxPoint];
        points.forEach((p: any) => {
          const pAttr = getAttrs(p);
          if (pAttr.x !== undefined && pAttr.y !== undefined) {
            waypoints.push({
              x: parseInt(pAttr.x) + parentPos.x,
              y: parseInt(pAttr.y) + parentPos.y
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

  // 4. Group into Lanes
  const lanes: LaneDefinition[] = [];
  const elementsByRole = new Map<string, string[]>();

  elements.forEach(el => {
    if (el.type !== 'bpmn:SequenceFlow') {
      const primaryRole = el.roles?.[0] || 'Unassigned';
      const list = elementsByRole.get(primaryRole) || [];
      list.push(el.id);
      elementsByRole.set(primaryRole, list);
    }
  });

  // Create lanes ordered by role rank
  const sortedRoles = Array.from(elementsByRole.keys()).sort((a, b) => {
    if (a === 'Unassigned') return 1;
    if (b === 'Unassigned') return -1;
    return getRoleRank(a, Array.from(elementsByRole.keys())) - getRoleRank(b, Array.from(elementsByRole.keys()));
  });

  sortedRoles.forEach(roleName => {
    lanes.push({
      id: `Lane_${roleName.replace(/\s+/g, '_')}`,
      name: roleName,
      elementIds: elementsByRole.get(roleName) || []
    });
  });

  return {
    process: {
      id: 'ProophProcess',
      name: 'Imported from Prooph Board',
      elements: elements,
      lanes: lanes
    },
    layout: layout
  };
}
