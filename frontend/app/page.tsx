'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Upload, FileText, Trash2, Loader2, CheckCircle2, Circle, AlertCircle, X, Brain, Search, Pencil } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Document {
    id: string;
    name: string;
    size: string;
    enabled: boolean;
}

interface Message {
    role: 'user' | 'assistant' | 'error';
    content: string;
}

interface AgentStatus {
    planner: 'idle' | 'working' | 'complete';
    researcher: 'idle' | 'working' | 'complete';
    writer: 'idle' | 'working' | 'complete';
}

interface AgentResult {
    planner: string;
    researcher: string;
    writer: string;
}

export default function MultiAgentChat() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [documents, setDocuments] = useState<Document[]>([]);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [connectionError, setConnectionError] = useState<string | null>(null);
    const [currentStatus, setCurrentStatus] = useState<string>('');
    
    // Agent states
    const [agentStatus, setAgentStatus] = useState<AgentStatus>({
        planner: 'idle',
        researcher: 'idle',
        writer: 'idle',
    });
    const [agentResults, setAgentResults] = useState<AgentResult>({
        planner: '',
        researcher: '',
        writer: '',
    });
    const [showAgentPanel, setShowAgentPanel] = useState(true);
    
    const fileInputRef = useRef<HTMLInputElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTo({
                top: scrollRef.current.scrollHeight,
                behavior: 'smooth'
            });
        }
    }, [messages, isProcessing]);

    useEffect(() => {
        if (uploadError) {
            const timer = setTimeout(() => setUploadError(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [uploadError]);

    useEffect(() => {
        if (connectionError) {
            const timer = setTimeout(() => setConnectionError(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [connectionError]);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        if (file.size > 10 * 1024 * 1024) {
            setUploadError('File too large. Maximum size is 10MB.');
            return;
        }

        const validTypes = ['.pdf', '.docx', '.csv', '.txt', '.doc'];
        const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
        if (!validTypes.includes(fileExt)) {
            setUploadError('Invalid file type. Supported: PDF, DOCX, CSV, TXT');
            return;
        }
        
        setIsUploading(true);
        setUploadError(null);
        const formData = new FormData();
        formData.append('file', file);
        
        try {
            const res = await fetch('https://ai-document-system.vercel.app/api/upload', { 
                method: 'POST', 
                body: formData,
                signal: AbortSignal.timeout(30000)
            });
            
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({ detail: 'Upload failed' }));
                throw new Error(errorData.detail || `Upload failed with status ${res.status}`);
            }
            
            const data = await res.json();
            setDocuments(prev => [...prev, { 
                id: crypto.randomUUID(),
                name: data.filename, 
                size: data.size,
                enabled: true 
            }]);
            
            if (fileInputRef.current) fileInputRef.current.value = '';
            setUploadError(null);
            
        } catch (err) { 
            console.error("Upload error:", err);
            if (err instanceof Error) {
                if (err.name === 'AbortError') {
                    setUploadError('Upload timeout. File might be too large.');
                } else if (err.message.includes('fetch')) {
                    setUploadError('Cannot connect to server. Is it running on port 8000?');
                } else {
                    setUploadError(err.message);
                }
            } else {
                setUploadError('Failed to upload file. Please try again.');
            }
        } finally {
            setIsUploading(false);
        }
    };

    const sendMessage = async () => {
        if (!input.trim() || isProcessing) return;
        
        const userMessage = input.trim();
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setInput('');
        setIsProcessing(true);
        setShowAgentPanel(true);
        setConnectionError(null);
        setCurrentStatus('');
        
        // Reset agent states
        setAgentStatus({
            planner: 'idle',
            researcher: 'idle',
            writer: 'idle',
        });
        setAgentResults({
            planner: '',
            researcher: '',
            writer: '',
        });

        abortControllerRef.current = new AbortController();

        try {
            const response = await fetch('https://ai-document-system.vercel.app/api/agent-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    message: userMessage,
                    context: documents.filter(d => d.enabled).map(d => d.name).join(', ')
                }),
                signal: abortControllerRef.current.signal
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error('No response stream available');

            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));

                            if (data.type === 'status') {
                                setCurrentStatus(data.message);
                            }

                            if (data.type === 'agent') {
                                setAgentStatus(prev => ({
                                    ...prev,
                                    [data.agent]: data.status as 'working' | 'complete'
                                }));
                            }

                            if (data.type === 'result') {
                                setAgentResults(prev => ({
                                    ...prev,
                                    [data.agent]: data.content
                                }));
                            }

                            if (data.type === 'complete') {
                                const fullText = data.result;
                                
                                setMessages(prev => [...prev, { 
                                    role: 'assistant', 
                                    content: '' 
                                }]);

                                // Typing effect
                                for (let i = 0; i < fullText.length; i += 5) {
                                    const displayText = fullText.slice(0, Math.min(i + 5, fullText.length));
                                    
                                    setMessages(prev => {
                                        const newMessages = [...prev];
                                        if (newMessages[newMessages.length - 1].role === 'assistant') {
                                            newMessages[newMessages.length - 1].content = displayText;
                                        }
                                        return newMessages;
                                    });
                                    
                                    await new Promise(resolve => setTimeout(resolve, 5));
                                }

                                setMessages(prev => {
                                    const newMessages = [...prev];
                                    if (newMessages[newMessages.length - 1].role === 'assistant') {
                                        newMessages[newMessages.length - 1].content = fullText;
                                    }
                                    return newMessages;
                                });
                            }

                            if (data.type === 'error') {
                                setMessages(prev => [...prev, { 
                                    role: 'error', 
                                    content: data.message 
                                }]);
                            }
                        } catch (parseError) {
                            console.error('Error parsing SSE data:', parseError);
                        }
                    }
                }
            }
        } catch (err) {
            console.error("Chat error:", err);
            
            if (err instanceof Error) {
                if (err.name === 'AbortError') {
                    setMessages(prev => [...prev, { 
                        role: 'error', 
                        content: 'Request cancelled by user.' 
                    }]);
                } else if (err.message.includes('fetch') || err.message.includes('NetworkError')) {
                    setConnectionError('Cannot connect to server. Make sure backend is running on http://localhost:8000');
                    setMessages(prev => [...prev, { 
                        role: 'error', 
                        content: 'Connection failed. Please check if the backend server is running.' 
                    }]);
                } else {
                    setMessages(prev => [...prev, { 
                        role: 'error', 
                        content: `Error: ${err.message}` 
                    }]);
                }
            } else {
                setMessages(prev => [...prev, { 
                    role: 'error', 
                    content: 'An unexpected error occurred. Please try again.' 
                }]);
            }
        } finally {
            setIsProcessing(false);
            setCurrentStatus('');
            abortControllerRef.current = null;
        }
    };

    const cancelRequest = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            setIsProcessing(false);
        }
    };

    const AgentStatusIcon = ({ status }: { status: 'idle' | 'working' | 'complete' }) => {
        if (status === 'complete') return <CheckCircle2 size={16} className="text-emerald-400" />;
        if (status === 'working') return <Loader2 size={16} className="text-cyan-400 animate-spin" />;
        return <Circle size={16} className="text-gray-600" />;
    };

    const getAgentIcon = (agent: string) => {
        switch(agent) {
            case 'planner': return <Brain size={14} className="text-purple-400" />;
            case 'researcher': return <Search size={14} className="text-cyan-400" />;
            case 'writer': return <Pencil size={14} className="text-emerald-400" />;
            default: return <Circle size={14} />;
        }
    };

    return (
        <div className="flex h-screen w-full bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950 text-white overflow-hidden">
            
            {connectionError && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-red-500/90 backdrop-blur-xl border border-red-400 rounded-lg px-6 py-3 flex items-center gap-3 shadow-2xl animate-in slide-in-from-top">
                    <AlertCircle size={20} />
                    <span className="text-sm font-medium">{connectionError}</span>
                    <button onClick={() => setConnectionError(null)} className="ml-2">
                        <X size={16} />
                    </button>
                </div>
            )}

            {/* MAIN CHAT AREA */}
            <div className="flex-1 flex flex-col min-w-0">
                
                <header className="h-16 px-6 border-b border-white/10 bg-black/20 backdrop-blur-xl flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                        <span className="text-sm font-semibold tracking-wide text-cyan-400"> 🤖 AI Document Intelligence System</span>
                    </div>
                    <button
                        onClick={() => setShowAgentPanel(!showAgentPanel)}
                        className="px-4 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-xs font-medium transition-colors"
                    >
                        {showAgentPanel ? 'Hide' : 'Show'} Workflow
                    </button>
                </header>

                <div 
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto px-6 py-8 space-y-6 scrollbar-thin scrollbar-thumb-cyan-500/20"
                >
                    {messages.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                            <div className="w-16 h-16 rounded-full bg-cyan-500/10 flex items-center justify-center mb-4">
                                <Brain size={28} className="text-cyan-400" />
                            </div>
                            <p className="text-sm font-medium">AI Agent System Ready</p>
                            <p className="text-xs text-gray-500 mt-2">Upload documents and ask questions</p>
                        </div>
                    )}
                    
                    {messages.map((m, i) => (
                        <div key={i} className={`flex w-full ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] px-6 py-4 rounded-2xl shadow-2xl ${
                                m.role === 'user' 
                                    ? 'bg-gradient-to-br from-cyan-500 to-blue-600 rounded-tr-sm' 
                                    : m.role === 'error'
                                    ? 'bg-red-500/20 border border-red-500/50 rounded-tl-sm'
                                    : 'bg-white/5 border border-white/10 backdrop-blur-xl rounded-tl-sm'
                            }`}>
                                <div className="prose prose-invert prose-sm max-w-none overflow-hidden">
                                    <div className="break-words overflow-wrap-anywhere">
                                        <ReactMarkdown 
                                            remarkPlugins={[remarkGfm]}
                                            components={{
                                                code: ({node, inline, className, children, ...props}) => (
                                                    inline 
                                                        ? <code className="break-all bg-black/30 px-1 py-0.5 rounded text-cyan-300" {...props}>{children}</code>
                                                        : <code className="block overflow-x-auto bg-black/50 p-3 rounded-lg my-2 text-sm" {...props}>{children}</code>
                                                ),
                                                a: ({node, ...props}) => (
                                                    <a className="break-all text-cyan-400 hover:text-cyan-300 underline" {...props} />
                                                ),
                                                h1: ({node, ...props}) => <h1 className="text-lg font-bold mb-3 mt-4 text-cyan-400 break-words" {...props} />,
                                                h2: ({node, ...props}) => <h2 className="text-base font-bold mb-2 mt-3 text-cyan-400 break-words" {...props} />,
                                                h3: ({node, ...props}) => <h3 className="text-sm font-bold mb-2 mt-2 text-cyan-300 break-words" {...props} />,
                                                p: ({node, ...props}) => <p className="mb-3 break-words leading-relaxed" {...props} />,
                                                ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-3 space-y-1" {...props} />,
                                                ol: ({node, ...props}) => <ol className="list-decimal pl-5 mb-3 space-y-1" {...props} />,
                                                li: ({node, ...props}) => <li className="break-words" {...props} />,
                                            }}
                                        >
                                            {m.content}
                                        </ReactMarkdown>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}

                    {isProcessing && (
                        <div className="flex items-center gap-3 text-cyan-400">
                            <Loader2 size={16} className="animate-spin" />
                            <span className="text-sm">{currentStatus || 'Processing...'}</span>
                            <button 
                                onClick={cancelRequest}
                                className="ml-auto text-xs text-red-400 hover:text-red-300 underline"
                            >
                                Cancel
                            </button>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-white/10 bg-black/20 backdrop-blur-xl shrink-0">
                    <div className="relative max-w-4xl mx-auto">
                        <input 
                            value={input} 
                            onChange={(e) => setInput(e.target.value)} 
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    sendMessage();
                                }
                            }}
                            disabled={isProcessing}
                            className="w-full bg-white/5 border border-white/20 py-4 pl-6 pr-16 rounded-2xl outline-none focus:border-cyan-500 focus:bg-white/10 transition-all text-sm placeholder:text-gray-500 disabled:opacity-50" 
                            placeholder="Ask the AI agents to help you..." 
                        />
                        <button 
                            onClick={sendMessage} 
                            disabled={isProcessing || !input.trim()}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-3 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl shadow-lg shadow-cyan-500/30 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Send size={18} />
                        </button>
                    </div>
                </div>
            </div>

            {/* SIDEBAR */}
            <aside className="w-80 border-l border-white/10 bg-black/20 backdrop-blur-xl p-6 flex flex-col shrink-0 overflow-hidden">
                
                <div className="mb-6">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Documents</h3>
                    
                    {uploadError && (
                        <div className="mb-3 p-3 bg-red-500/20 border border-red-500/50 rounded-lg flex items-start gap-2 text-xs">
                            <AlertCircle size={14} className="shrink-0 mt-0.5" />
                            <span>{uploadError}</span>
                        </div>
                    )}

                    <button 
                        onClick={() => fileInputRef.current?.click()} 
                        disabled={isUploading}
                        className="w-full border-2 border-dashed border-white/20 hover:border-cyan-500/50 p-6 rounded-xl flex flex-col items-center gap-2 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isUploading ? (
                            <Loader2 size={20} className="text-cyan-400 animate-spin" />
                        ) : (
                            <Upload size={20} className="text-cyan-400 group-hover:scale-110 transition-transform" />
                        )}
                        <span className="text-xs font-medium text-gray-400">
                            {isUploading ? 'Uploading...' : 'Upload Document'}
                        </span>
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            onChange={handleUpload} 
                            className="hidden"
                            accept=".pdf,.docx,.csv,.txt,.doc"
                            disabled={isUploading}
                        />
                    </button>
                    
                    <div className="mt-4 space-y-2 max-h-40 overflow-y-auto scrollbar-thin scrollbar-thumb-cyan-500/20">
                        {documents.map(doc => (
                            <div key={doc.id} className="p-3 bg-white/5 border border-white/10 rounded-lg flex items-center justify-between gap-2 group hover:bg-white/10 transition-colors">
                                <div className="flex items-center gap-2 overflow-hidden flex-1">
                                    <FileText size={14} className="text-cyan-400 shrink-0" />
                                    <div className="overflow-hidden">
                                        <span className="text-xs truncate block">{doc.name}</span>
                                        <span className="text-[10px] text-gray-500">{doc.size}</span>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => setDocuments(docs => docs.filter(d => d.id !== doc.id))} 
                                    className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all shrink-0"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Agent Workflow Panel */}
                {showAgentPanel && (
                    <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">AI Workflow</h3>
                        
                        <div className="flex-1 overflow-y-auto space-y-3 scrollbar-thin scrollbar-thumb-cyan-500/20 pr-2">
                            {(['planner', 'researcher', 'writer'] as const).map((agent) => (
                                <div 
                                    key={agent} 
                                    className={`bg-white/5 border rounded-lg p-4 transition-all ${
                                        agentStatus[agent] === 'working' 
                                            ? 'border-cyan-500/50 bg-cyan-500/5' 
                                            : agentStatus[agent] === 'complete'
                                            ? 'border-emerald-500/50 bg-emerald-500/5'
                                            : 'border-white/10'
                                    }`}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            {getAgentIcon(agent)}
                                            <span className="text-xs font-semibold capitalize">{agent}</span>
                                        </div>
                                        <AgentStatusIcon status={agentStatus[agent]} />
                                    </div>
                                    
                                    {agentResults[agent] && (
                                        <div className="text-[10px] text-gray-400 mt-2 p-2 bg-black/30 rounded border border-white/5 max-h-32 overflow-y-auto scrollbar-thin scrollbar-thumb-cyan-500/20 break-words">
                                            {agentResults[agent].substring(0, 250)}
                                            {agentResults[agent].length > 250 && '...'}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </aside>
        </div>
    );
}
