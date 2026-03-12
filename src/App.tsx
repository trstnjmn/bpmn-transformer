import React, { useState } from 'react';
import {
  convertToBpmnXml,
  convertFromBpmnXml,
  mapProophToConversionInput,
  computeElkLayout,
  beautifyXml
} from './transformer';
import type { ConversionInput } from './transformer';

import { Button } from "./components/ui/button";
import { Textarea } from "./components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import {
  FileCode,
  Download,
  Copy,
  RotateCcw,
  Upload,
  Play,
  AlertCircle,
  CheckCircle2,
  Settings2
} from "lucide-react";

const App: React.FC = () => {
  const [mode, setMode] = useState<'xml-to-bpmn' | 'json-to-xml' | 'xml-to-json'>('xml-to-bpmn');
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState('');

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
        // 1. Raw XML → Generic JSON
        const jsonObj = await convertFromBpmnXml(inputText);

        // 2. Map Prooph mxGraph JSON → internal BPMN format
        const proophResult = mapProophToConversionInput(jsonObj);

        // 3. Auto-layout with ELK — also returns which edges are valid
        const { layout: elkLayout, validEdgeIds } = await computeElkLayout(proophResult.process.elements, proophResult.process.lanes);

        // 4. Remove SequenceFlows that ELK rejected (dangling refs to filtered nodes)
        const cleanedElements = proophResult.process.elements.filter(e =>
          e.type !== 'bpmn:SequenceFlow' || validEdgeIds.has(e.id)
        );

        // 5. Build final input with clean elements + ELK layout
        const finalInput: ConversionInput = {
          process: { ...proophResult.process, elements: cleanedElements },
          layout: elkLayout,
        };

        // 6. Convert to BPMN XML
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

    // Use the original filename if available, otherwise fallback to default
    let fileName = isXml ? 'process.bpmn' : 'process.json';
    if (uploadedFileName) {
      const baseName = uploadedFileName.substring(0, uploadedFileName.lastIndexOf('.')) || uploadedFileName;
      fileName = `${baseName}.${isXml ? 'bpmn' : 'json'}`;
    }

    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (mode === 'xml-to-bpmn' || mode === 'xml-to-json') {
        setInputText(beautifyXml(content));
      } else {
        setInputText(content);
      }
    };
    reader.readAsText(file);
  };

  const handleReset = () => {
    setInputText('');
    setOutputText('');
    setError('');
    setUploadedFileName('');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">

        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 flex items-center gap-2">
              <FileCode className="h-8 w-8 text-blue-600" />
              BPMN Transformer
            </h1>
            <p className="text-slate-500 dark:text-slate-400">
              Convert between Prooph Board XML, standard BPMN 2.0 and JSON.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleReset} className="flex gap-2">
              <RotateCcw className="h-4 w-4" /> Reset
            </Button>
            <div className="relative">
              <input
                type="file"
                id="file-upload"
                className="hidden"
                onChange={handleFileUpload}
                accept={mode === 'json-to-xml' ? '.json' : '.xml,.bpmn'}
              />
              <Button
                onClick={() => document.getElementById('file-upload')?.click()}
                className="flex gap-2 bg-blue-600 hover:bg-blue-700"
              >
                <Upload className="h-4 w-4" /> Upload File
              </Button>
            </div>
          </div>
        </header>

        {/* Main Interface */}
        <main className="space-y-6">
          <Tabs
            defaultValue="xml-to-bpmn"
            value={mode}
            onValueChange={(v) => {
              setMode(v as any);
              handleReset();
            }}
            className="w-full"
          >
            <div className="flex items-center justify-between mb-4">
              <TabsList className="grid grid-cols-3 w-full max-w-md">
                <TabsTrigger value="xml-to-bpmn">XML ➔ BPMN</TabsTrigger>
                <TabsTrigger value="xml-to-json">XML ➔ JSON</TabsTrigger>
                <TabsTrigger value="json-to-xml">JSON ➔ XML</TabsTrigger>
              </TabsList>

              <div className="hidden md:flex items-center gap-2 text-sm text-slate-500 italic">
                <Settings2 className="h-4 w-4" />
                {mode === 'xml-to-bpmn' && "Auto-layout with ELK engine enabled"}
                {mode === 'xml-to-json' && "Direct structure mapping"}
                {mode === 'json-to-xml' && "BPMN 2.0 schema validation"}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Input Section */}
              <Card className="shadow-md border-slate-200 dark:border-slate-800">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center justify-between">
                    Input {mode === 'json-to-xml' ? 'JSON' : 'XML'}
                    {uploadedFileName && (
                      <span className="text-xs font-normal text-slate-400 bg-slate-100 dark:bg-slate-900 px-2 py-1 rounded">
                        {uploadedFileName}
                      </span>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {mode === 'xml-to-bpmn' && "Paste your Prooph Board XML here."}
                    {mode === 'xml-to-json' && "Paste any XML to see its JSON representation."}
                    {mode === 'json-to-xml' && "Paste a JSON process definition."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <Textarea
                      placeholder={mode === 'json-to-xml' ? '{\n  "process": { ... }\n}' : '<mxGraphModel>...</mxGraphModel>'}
                      className="min-h-[400px] font-mono text-sm resize-none focus-visible:ring-blue-500"
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      spellCheck={false}
                    />
                    <Button
                      className="w-full flex gap-2 h-12 text-md transition-all active:scale-[0.98]"
                      disabled={isProcessing || !inputText}
                      onClick={handleTransform}
                    >
                      {isProcessing ? (
                        <>
                          <div className="h-4 w-4 border-2 border-slate-300 border-t-white rounded-full animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 fill-current" /> Run Transformation
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Output Section */}
              <Card className="shadow-md border-slate-200 dark:border-slate-800 flex flex-col">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">
                    Output {mode === 'xml-to-json' ? 'JSON' : 'XML'}
                  </CardTitle>
                  <CardDescription>
                    Generated result will appear below.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-grow">
                  <div className="relative h-[400px] border rounded-md overflow-hidden bg-slate-50 dark:bg-slate-900/50">
                    {error ? (
                      <div className="p-4 h-full flex items-center justify-center">
                        <Alert variant="destructive" className="max-w-sm">
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>Error</AlertTitle>
                          <AlertDescription className="text-xs break-all">
                            {error}
                          </AlertDescription>
                        </Alert>
                      </div>
                    ) : outputText ? (
                      <pre className="p-4 text-sm font-mono whitespace-pre overflow-auto h-full text-slate-800 dark:text-slate-200">
                        {outputText}
                      </pre>
                    ) : (
                      <div className="h-full flex items-center justify-center text-slate-400 italic text-sm">
                        Waiting for transformation...
                      </div>
                    )}

                    {outputText && !error && (
                      <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold rounded-full border border-emerald-200 dark:border-emerald-800">
                        <CheckCircle2 className="h-3 w-3" /> SUCCESS
                      </div>
                    )}
                  </div>
                </CardContent>
                <CardFooter className="pt-3 border-t flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 flex gap-2"
                    onClick={handleCopy}
                    disabled={!outputText || !!error}
                  >
                    {copied ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" /> Copy
                      </>
                    )}
                  </Button>
                  <Button
                    variant="default"
                    className="flex-1 flex gap-2 bg-slate-800 dark:bg-slate-200 dark:text-slate-900"
                    onClick={handleDownload}
                    disabled={!outputText || !!error}
                  >
                    <Download className="h-4 w-4" /> Download
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </Tabs>
        </main>

        <footer className="text-center text-slate-400 text-xs py-10 border-t">
          <p>© 2026 BPMN Transformer Tool. Built with React & Tailwind CSS.</p>
        </footer>
      </div>
    </div>
  );
};

export default App;
