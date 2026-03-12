import React, { useEffect, useRef, useState } from 'react';
import BpmnModeler from 'bpmn-js/lib/Modeler';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';
import { Button } from './ui/button';
import { Download, Image as ImageIcon, Maximize, Minimize } from 'lucide-react';

interface BpmnViewerProps {
  xml: string;
  onChange?: (xml: string) => void;
  onClose?: () => void;
  fileName?: string;
}

export const BpmnViewer: React.FC<BpmnViewerProps> = ({ xml, onChange, onClose, fileName = 'diagram' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const modelerRef = useRef<BpmnModeler | null>(null);
  const [error, setError] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState(true);
  const isInternalChangeRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;

    modelerRef.current = new BpmnModeler({
      container: containerRef.current,
      keyboard: {
        bindTo: window
      }
    });

    if (onChange) {
      modelerRef.current.on('commandStack.changed', async () => {
        try {
          const { xml: newXml } = await modelerRef.current!.saveXML({ format: true });
          if (newXml !== xml) {
            isInternalChangeRef.current = true;
            onChange(newXml);
          }
        } catch (err) {
          console.error('Error saving XML on change', err);
        }
      });
    }

    return () => {
      modelerRef.current?.destroy();
    };
  }, [onChange]);

  useEffect(() => {
    const renderDiagram = async () => {
      if (!modelerRef.current || !xml) return;
      if (isInternalChangeRef.current) {
        isInternalChangeRef.current = false;
        return;
      }

      try {
        await modelerRef.current.importXML(xml);
        setError('');
        
        // Zoom to fit
        const canvas = modelerRef.current.get('canvas') as any;
        canvas.zoom('fit-viewport', 'auto');
      } catch (err: any) {
        // Ignore "no diagram to display" if xml is empty
        if (xml && xml.trim() !== '') {
          console.error('BPMN Import Error:', err);
          setError(err.message || 'Failed to render BPMN diagram');
        }
      }
    };

    renderDiagram();
  }, [xml]);

  const exportSvg = async () => {
    if (!modelerRef.current) return;
    try {
      const { svg } = await modelerRef.current.saveSVG();
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${fileName}.svg`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error exporting SVG', err);
    }
  };

  const exportPng = async () => {
    if (!modelerRef.current) return;
    try {
      const { svg } = await modelerRef.current.saveSVG();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const img = new Image();
      const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        
        const pngUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = pngUrl;
        link.download = `${fileName}.png`;
        link.click();
        
        URL.revokeObjectURL(url);
      };
      
      img.src = url;
    } catch (err) {
      console.error('Error exporting PNG', err);
    }
  };

  return (
    <div className={isFullscreen 
      ? "fixed inset-0 z-[100] bg-slate-50 dark:bg-slate-950 p-4 flex flex-col" 
      : "flex flex-col h-full w-full"
    }>
      {error && (
        <div className="bg-red-100 text-red-700 p-2 text-sm rounded-md mb-2">
          {error}
        </div>
      )}
      <div className={`flex-grow border border-slate-300 rounded-md relative bg-white ${!isFullscreen && 'min-h-[500px]'}`}>
        <div ref={containerRef} className="w-full h-full absolute inset-0" />
      </div>
      <div className="flex gap-2 mt-4 justify-between items-center">
        <div>
          <Button 
            onClick={() => {
              if (isFullscreen && onClose) {
                onClose();
              } else {
                setIsFullscreen(!isFullscreen);
              }
            }} 
            variant="secondary" 
            className="flex items-center gap-2"
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />} 
            {isFullscreen ? "Close Fullscreen" : "Fullscreen"}
          </Button>
        </div>
        <div className="flex gap-2">
          <Button onClick={exportSvg} variant="outline" className="flex items-center gap-2">
            <Download className="w-4 h-4" /> Download SVG
          </Button>
          <Button onClick={exportPng} variant="default" className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4" /> Download PNG
          </Button>
        </div>
      </div>
    </div>
  );
};
