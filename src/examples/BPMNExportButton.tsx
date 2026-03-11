import React, { useState } from 'react';
import { convertToBpmnXml } from '../transformer';
import type { ConversionInput } from '../transformer';

/**
 * Example React Component demonstrating how to use the BPMN converter.
 */
export const BPMNExportButton: React.FC = () => {
  const [xml, setXml] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    
    // Sample Input Data
    const input: ConversionInput = {
      process: {
        id: 'OrderProcess_1',
        name: 'Order Fulfillment Process',
        elements: [
          { id: 'start_1', type: 'bpmn:StartEvent', name: 'Order Received' },
          { id: 'task_1', type: 'bpmn:UserTask', name: 'Review Order' },
          { id: 'end_1', type: 'bpmn:EndEvent', name: 'Order Processed' },
          { id: 'flow_1', type: 'bpmn:SequenceFlow', sourceRef: 'start_1', targetRef: 'task_1' },
          { id: 'flow_2', type: 'bpmn:SequenceFlow', sourceRef: 'task_1', targetRef: 'end_1' }
        ]
      },
      layout: [
        { id: 'start_1_di', type: 'shape', bpmnElement: 'start_1', x: 156, y: 102, width: 36, height: 36 },
        { id: 'task_1_di', type: 'shape', bpmnElement: 'task_1', x: 250, y: 80, width: 100, height: 80 },
        { id: 'end_1_di', type: 'shape', bpmnElement: 'end_1', x: 410, y: 102, width: 36, height: 36 },
        { id: 'flow_1_di', type: 'edge', bpmnElement: 'flow_1', waypoints: [{ x: 192, y: 120 }, { x: 250, y: 120 }] },
        { id: 'flow_2_di', type: 'edge', bpmnElement: 'flow_2', waypoints: [{ x: 350, y: 120 }, { x: 410, y: 120 }] }
      ]
    };

    try {
      const generatedXml = await convertToBpmnXml(input);
      setXml(generatedXml);
      
      // For demonstration: trigger download
      const blob = new Blob([generatedXml], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'process.bpmn';
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to convert BPMN:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h3>BPMN 2.0 Exporter</h3>
      <button 
        onClick={handleExport}
        disabled={isExporting}
        style={{
          padding: '10px 20px',
          backgroundColor: '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: isExporting ? 'not-allowed' : 'pointer'
        }}
      >
        {isExporting ? 'Generating...' : 'Export to BPMN XML'}
      </button>

      {xml && (
        <div style={{ marginTop: '20px' }}>
          <h4>Preview (first 10 lines):</h4>
          <pre style={{ backgroundColor: '#f4f4f4', padding: '10px', overflow: 'auto', maxHeight: '200px' }}>
            {xml.split('\n').slice(0, 10).join('\n')}...
          </pre>
        </div>
      )}
    </div>
  );
};

export default BPMNExportButton;
