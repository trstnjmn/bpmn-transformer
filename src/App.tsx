import React, { useState } from 'react';
import './App.css';
import { convertToBpmnXml, convertFromBpmnXml, mapProophToConversionInput } from './transformer';
import type { ConversionInput } from './transformer';

const App: React.FC = () => {
  const [mode, setMode] = useState<'xml-to-bpmn' | 'json-to-xml' | 'xml-to-json'>('xml-to-bpmn');
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleTransform = async () => {
    setIsProcessing(true);
    setError('');
    try {
      if (mode === 'json-to-xml') {
        let parsedInput: any;
        try {
          parsedInput = JSON.parse(inputText);
        } catch (jsonErr) {
          throw new Error('Invalid JSON format. Please check for syntax errors.');
        }

        // AUTO-DETECT PROOPH BOARD FORMAT
        let finalInput: ConversionInput;
        if (parsedInput.mxGraphModel) {
          console.log('Detected Prooph Board Format - Adapting...');
          finalInput = mapProophToConversionInput(parsedInput);
        } else {
          finalInput = parsedInput as ConversionInput;
        }

        const xml = await convertToBpmnXml(finalInput);
        setOutputText(xml);
      } else if (mode === 'xml-to-bpmn') {
        // 1. Raw XML to Generic JSON
        const jsonObj = await convertFromBpmnXml(inputText);

        // 2. Map Prooph (mxGraph) JSON to our internal BPMN format
        // This will throw if the XML isn't a valid Prooph board XML
        const finalInput = mapProophToConversionInput(jsonObj);

        // 3. Convert our internal format to BPMN XML
        const finalXml = await convertToBpmnXml(finalInput);
        setOutputText(finalXml);
      } else {
        const json = await convertFromBpmnXml(inputText);
        setOutputText(JSON.stringify(json, null, 2));
      }
    } catch (err: any) {
      setError(err.message || 'Transformation failed');
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopy = async () => {
    if (!outputText) return;
    try {
      await navigator.clipboard.writeText(outputText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const handleDownload = () => {
    if (!outputText) return;
    const isXml = mode === 'json-to-xml' || mode === 'xml-to-bpmn';
    const blob = new Blob([outputText], { type: isXml ? 'application/xml' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = isXml ? 'process.bpmn' : 'process.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setInputText(event.target?.result as string);
    };
    reader.readAsText(file);
  };

  return (
    <div className="container">
      <div className="header-actions">
        <div>
          <h1>XML & BPMN Transformer</h1>
          <p className="subtitle" style={{ marginBottom: 0 }}>
            {mode === 'xml-to-json' && 'Convert any XML to a clean JSON structure.'}
            {mode === 'json-to-xml' && 'Convert JSON process definitions to standard BPMN 2.0 XML.'}
            {mode === 'xml-to-bpmn' && 'Directly convert Prooph Board XML to BPMN 2.0 XML.'}
          </p>
        </div>
        <div className="toggle-group">
          <button
            className={`toggle-btn ${mode === 'xml-to-bpmn' ? 'active' : ''}`}
            onClick={() => { setMode('xml-to-bpmn'); setInputText(''); setOutputText(''); setError(''); }}
            style={{ fontWeight: 'bold', color: '#60a5fa' }}
          >
            XML ➔ BPMN XML (Full)
          </button>
          <button
            className={`toggle-btn ${mode === 'xml-to-json' ? 'active' : ''}`}
            onClick={() => { setMode('xml-to-json'); setInputText(''); setOutputText(''); setError(''); }}
          >
            XML ➔ JSON
          </button>
          <button
            className={`toggle-btn ${mode === 'json-to-xml' ? 'active' : ''}`}
            onClick={() => { setMode('json-to-xml'); setInputText(''); setOutputText(''); setError(''); }}
          >
            JSON ➔ XML (BPMN)
          </button>

        </div>
      </div>

      <div className="grid">
        <div className="editor-section">
          <label htmlFor="input-text">Input {mode === 'xml-to-json' || mode === 'xml-to-bpmn' ? 'XML' : 'JSON'}</label>
          <textarea
            id="input-text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            spellCheck={false}
            placeholder={mode === 'xml-to-json' || mode === 'xml-to-bpmn' ? 'Paste XML here...' : 'Paste JSON process definition here...'}
          />
          <div className="actions">
            <button
              className="primary"
              onClick={handleTransform}
              disabled={isProcessing || !inputText}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z" /><path d="M17 21v-8H7v8" /><path d="M7 3v5h8" />
              </svg>
              {isProcessing ? 'Processing...' : 'Run Transformation'}
            </button>
            <label className="button upload-btn" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: 0, padding: '0.8rem 1.5rem', borderRadius: '12px' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Upload {mode === 'json-to-xml' ? '.json' : '.xml'}
              <input type="file" style={{ display: 'none' }} onChange={handleFileUpload} accept={mode === 'json-to-xml' ? '.json' : '.xml,.bpmn'} />
            </label>
            <button
              className="secondary reset-btn"
              onClick={() => { setInputText(''); setOutputText(''); setError(''); }}
              style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              Reset
            </button>
          </div>
        </div>

        <div className="output-section">
          <label htmlFor="output-text">Output {mode === 'xml-to-json' ? 'JSON' : 'XML'}</label>
          <div className="output-container">
            {error ? (
              <pre style={{ color: '#ef4444' }}>{error}</pre>
            ) : (
              <pre id="output-text">{outputText || 'Result will appear here...'}</pre>
            )}
            {outputText && !error && <div className="status">SUCCESS</div>}
          </div>
          <div className="actions">
            <button
              className="secondary"
              onClick={handleCopy}
              disabled={!outputText || !!error}
              style={{ background: copied ? '#10b981' : 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              {copied ? 'Copied!' : 'Copy to Clipboard'}
            </button>
            <button
              className="primary"
              onClick={handleDownload}
              disabled={!outputText || !!error}
              style={{ background: '#3b82f6' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download Result
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
