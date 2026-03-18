import type { ConversionInput, ProcessElement, DiagramLayout, LaneDefinition } from './types';
import { extractRoleAndCleanName, getRoleRank } from './roleService';
import { wordWrap, sanitizeId } from './utils';

function getAttrs(obj: any): any {
  if (!obj) return {};
  const attrs: any = {};
  if (obj['@attributes']) Object.assign(attrs, obj['@attributes']);
  Object.keys(obj).forEach(key => {
    if (key.startsWith('@_')) attrs[key.substring(2)] = obj[key];
    else if (['id', 'value', 'style', 'vertex', 'edge', 'source', 'target', 'parent', 'label'].includes(key)) {
      attrs[key] = obj[key];
    }
  });
  return attrs;
}

export function mapProophToConversionInput(proophData: any): ConversionInput {
  const root = proophData?.mxGraphModel?.root;
  if (!root) throw new Error('Invalid Prooph Board JSON: mxGraphModel.root is missing.');

  const elements: ProcessElement[] = [];
  const layout: DiagramLayout[] = [];
  const allCells: any[] = [];
  const metadataMap = new Map<string, any>();

  // 1. EXTRAKTION (rekursiv mit Label-Vererbung)
  const processObject = (obj: any, parentLabel?: string) => {
    if (!obj || typeof obj !== 'object') return;

    const attrs = getAttrs(obj);
    const id = attrs.id;

    if (id) {
      // Nutze parentLabel, falls das aktuelle Objekt kein eigenes hat
      if (!attrs.label && parentLabel) {
        attrs.label = parentLabel;
      }
      metadataMap.set(id, attrs);
    }

    if (obj.mxCell) {
      const cells = Array.isArray(obj.mxCell) ? obj.mxCell : [obj.mxCell];
      cells.forEach((cell: any) => {
        const cellAttrs = getAttrs(cell);
        if (!cellAttrs.id && id) cell['@_id'] = id;
        allCells.push(cell);
      });
    }

    // Rekursion durch Kinder-Elemente
    Object.keys(obj).forEach(key => {
      if (key !== 'mxCell' && !key.startsWith('@')) {
        const val = obj[key];
        // Reiche das aktuelle Label (oder das geerbte) nach unten weiter
        const currentLabel = attrs.label || parentLabel;
        if (Array.isArray(val)) val.forEach(item => processObject(item, currentLabel));
        else processObject(val, currentLabel);
      }
    });
  };

  processObject(root);

  // Hilfsfunktion für absolute Positionierung
  const cellMap = new Map<string, any>();
  allCells.forEach(c => { const a = getAttrs(c); if (a.id) cellMap.set(a.id, { attr: a, cell: c }); });

  const getAbsolutePos = (id: string): { x: number, y: number } => {
    const entry = cellMap.get(id);
    if (!entry) return { x: 0, y: 0 };
    const geo = entry.cell.mxGeometry ? getAttrs(entry.cell.mxGeometry) : {};
    let x = parseInt(geo.x || '0'), y = parseInt(geo.y || '0');
    if (entry.attr.parent && !['0', '1'].includes(entry.attr.parent)) {
      const pPos = getAbsolutePos(entry.attr.parent);
      x += pPos.x; y += pPos.y;
    }
    return { x, y };
  };

  // 2. MAPPING der Knoten
  allCells.forEach((cell: any) => {
    const attr = getAttrs(cell);
    const id = attr.id;
    if (!id || id === '0' || id === '1') return;

    if (attr.vertex === '1' || attr.vertex === 1) {
      const style = attr.style || '';
      const meta = metadataMap.get(id);

      // Label aufräumen
      let rawLabel = (meta?.label || attr.value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').trim();

      // Heuristik gegen IDs als Namen
      if (rawLabel.length > 20 && !rawLabel.includes(' ')) rawLabel = '';

      let type: any = 'bpmn:Task';
      if (style.includes('event')) type = 'bpmn:IntermediateCatchEvent';
      else if (style.includes('command')) type = 'bpmn:UserTask';
      else if (style.includes('policy')) type = 'bpmn:BusinessRuleTask';
      else if (['boundedContext', 'feature', 'freeText', 'icon'].some(s => style.includes(s))) return;

      const { role, cleanName } = extractRoleAndCleanName(rawLabel || 'Task');
      const { x, y } = getAbsolutePos(id);
      const geo = cell.mxGeometry ? getAttrs(cell.mxGeometry) : {};

      elements.push({ id, type, name: wordWrap(cleanName, 20), role });
      layout.push({
        id: id + '_di', type: 'shape', bpmnElement: id,
        x, y,
        width: parseInt(geo.width || '100'),
        height: parseInt(geo.height || '80')
      });
    }

    if ((attr.edge === '1' || attr.edge === 1) && attr.source && attr.target) {
      elements.push({ id, type: 'bpmn:SequenceFlow', sourceRef: attr.source, targetRef: attr.target });
      layout.push({ id: id + '_di', type: 'edge', bpmnElement: id });
    }
  });

// 3. START/END HEURISTIK
  const sourceIds = new Set(elements.filter(e => e.type === 'bpmn:SequenceFlow').map(e => e.sourceRef));
  const targetIds = new Set(elements.filter(e => e.type === 'bpmn:SequenceFlow').map(e => e.targetRef));

  const newEndEvents: ProcessElement[] = [];
  const newEndLayouts: DiagramLayout[] = [];
  const eventSize = 36; // Konstante für alle Kreise

  [...elements].forEach(el => {
    if (el.type === 'bpmn:SequenceFlow') return;

    const hasInbound = targetIds.has(el.id);
    const hasOutbound = sourceIds.has(el.id);

    // 1. Korrektur bestehender Events (Start/End/Intermediate)
    if (el.type === 'bpmn:IntermediateCatchEvent') {
      if (!hasInbound) el.type = 'bpmn:StartEvent';
      else if (!hasOutbound) el.type = 'bpmn:EndEvent';
    }

    // 2. Größen-Update für alle Kreise im bestehenden Layout
    if (['bpmn:StartEvent', 'bpmn:EndEvent', 'bpmn:IntermediateCatchEvent'].includes(el.type)) {
      const lItem = layout.find(l => l.bpmnElement === el.id);
      if (lItem) {
        // Wir zentrieren den Kreis nach der Größenänderung nach,
        // damit er nicht nach oben links "hüpft"
        const oldW = lItem.width ?? 100;
        const oldH = lItem.height ?? 80;
        lItem.x = (lItem.x ?? 0) + (oldW / 2) - (eventSize / 2);
        lItem.y = (lItem.y ?? 0) + (oldH / 2) - (eventSize / 2);
        lItem.width = eventSize;
        lItem.height = eventSize;
      }
    }

    // 3. Erstellung neuer Endpunkte für Tasks/ReadModels ohne Ausgang
    if (!hasOutbound && el.type !== 'bpmn:EndEvent' && el.type !== 'bpmn:StartEvent') {
      const endEventId = sanitizeId(`end_${el.id}`);
      const currentLayout = layout.find(l => l.bpmnElement === el.id);

      if (currentLayout) {
        const lx = currentLayout.x ?? 0;
        const ly = currentLayout.y ?? 0;
        const lw = currentLayout.width ?? 100;
        const lh = currentLayout.height ?? 80;

        // HIER IST DIE FEINJUSTIERUNG
        const xPos = lx + lw + 60; // Horizontaler Abstand
        const yPos = ly + (lh / 2) - (eventSize / 2); // Vertikale Mitte der Box

        newEndEvents.push({
          id: endEventId,
          type: 'bpmn:EndEvent',
          name: '',
          role: el.role
        });

        newEndLayouts.push({
          id: endEventId + '_di',
          type: 'shape',
          bpmnElement: endEventId,
          x: xPos,
          y: yPos,
          width: eventSize,
          height: eventSize
        });

        const flowId = sanitizeId(`flow_to_end_${el.id}`);
        newEndEvents.push({
          id: flowId,
          type: 'bpmn:SequenceFlow',
          sourceRef: el.id,
          targetRef: endEventId
        });

        newEndLayouts.push({
          id: flowId + '_di',
          type: 'edge',
          bpmnElement: flowId,
          waypoints: [
            { x: lx + lw, y: ly + (lh / 2) },
            { x: xPos, y: ly + (lh / 2) } // Punktlandung auf der Mittellinie
          ]
        });
      }
    }
  });

  elements.push(...newEndEvents);
  layout.push(...newEndLayouts);

  // 4. LANES
  const lanes: LaneDefinition[] = [];
  const elementsByRole = new Map<string, string[]>();
  elements.filter(e => e.type !== 'bpmn:SequenceFlow').forEach(el => {
    const r = el.role || 'Unassigned';
    if (!elementsByRole.has(r)) elementsByRole.set(r, []);
    elementsByRole.get(r)!.push(el.id);
  });

  Array.from(elementsByRole.keys())
      .sort((a, b) => getRoleRank(a) - getRoleRank(b))
      .forEach(roleName => {
        lanes.push({
          id: sanitizeId(`Lane_${roleName}`),
          name: roleName,
          elementIds: elementsByRole.get(roleName) || []
        });
      });

  return { process: { id: 'ProophProcess', name: 'Imported Process', elements, lanes }, layout };
}