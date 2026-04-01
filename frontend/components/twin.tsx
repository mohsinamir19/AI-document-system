'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Upload, FileText, Trash2, Power, PowerOff, ShieldCheck } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

interface Document {
    id: string;
    name: string;
    size: string;
    content: string;
    enabled: boolean;
}

export default function DocumentHelper() {
    const [messages, setMessages] = useState<any[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [documents, setDocuments] = useState<Document[]>([]);
    
    const fileInputRef = useRef<HTMLInputElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Optimized scroll logic for internal containers
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTo({
                top: scrollRef.current.scrollHeight,
                behavior: 'smooth'
            });
        }
    }, [messages, isLoading]);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        
        try {
            const res = await fetch('http://localhost:8000/upload', { 
                method: 'POST', 
                body: formData 
            });
            
            if (!res.ok) {
                throw new Error(`Upload failed with status: ${res.status}`);
            }
            
            const data = await res.json();
            
            setDocuments(prev => [...prev, { 
                id: crypto.randomUUID(), // FIXED: Changed from Date.now() to avoid hydration issues
                name: data.filename, 
                size: data.size, 
                content: data.content, 
                enabled: true 
            }]);
            
            // Reset file input
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
            
        } catch (err) { 
            console.error("Upload error:", err);
            alert('Failed to upload file. Make sure the backend is running on http://localhost:8000');
        } finally {
            setIsUploading(false);
        }
    };

    const sendMessage = async () => {
        if (!input.trim() || isLoading) return;
        
        const userMessage = input;
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setInput('');
        setIsLoading(true);

        const activeContext = documents
            .filter(d => d.enabled)
            .map(d => d.content)
            .join('\n\n');

        try {
            const res = await fetch('http://localhost:8000/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    message: userMessage, 
                    context: activeContext 
                })
            });
            
            if (!res.ok) {
                throw new Error(`Chat request failed with status: ${res.status}`);
            }
            
            const data = await res.json();
            setMessages(prev => [...prev, { 
                role: 'assistant', 
                content: data.response 
            }]);
            
        } catch (err) {
            console.error("Chat error:", err);
            setMessages(prev => [...prev, { 
                role: 'assistant', 
                content: "**Error:** Failed to connect to the AI service. Please ensure the backend is running on http://localhost:8000" 
            }]);
        } finally { 
            setIsLoading(false); 
        }
    };

    return (
        <div className="flex h-full w-full bg-[#030712]/60 backdrop-blur-3xl text-white rounded-[2.5rem] border border-cyan-500/20 overflow-hidden shadow-2xl">
            
            {/* MAIN CHAT COLUMN */}
            <div className="flex-1 flex flex-col min-w-0 h-full border-r border-white/5">
                {/* Fixed Header */}
                <header className="p-6 border-b border-white/5 bg-blue-950/20 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
                        <span className="text-xs font-bold tracking-widest text-cyan-400">RESEARCH_AGENT_INTERFACE</span>
                    </div>
                </header>

                {/* SCROLLABLE MESSAGE AREA */}
                <div 
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto min-h-0 px-6 py-8 space-y-6 scrollbar-thin scrollbar-thumb-cyan-500/10 custom-scroll"
                >
                    {messages.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center opacity-20 text-center">
                            <Bot size={48} className="text-cyan-400 mb-4" />
                            <p className="text-[10px] uppercase tracking-[0.3em]">Neural System Ready</p>
                        </div>
                    )}
                    
                    {messages.map((m, i) => (
                        <div key={i} className={`flex w-full ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
                            <div className={`max-w-[85%] p-4 rounded-2xl shadow-lg ${
                                m.role === 'user' ? 'bg-cyan-600 rounded-tr-none' : 'bg-white/5 border border-white/10 rounded-tl-none'
                            }`}>
                                <div className="prose prose-invert prose-sm max-w-none prose-table:border prose-table:border-white/10">
                                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                                        {m.content}
                                    </ReactMarkdown>
                                </div>
                            </div>
                        </div>
                    ))}
                    {isLoading && <div className="text-cyan-500 text-[10px] animate-pulse font-mono">AGENT_PROCESSING_STREAM...</div>}
                </div>

                {/* Fixed Input Area */}
                <div className="p-6 bg-black/20 border-t border-white/5 shrink-0">
                    <div className="relative max-w-4xl mx-auto">
                        <input 
                            value={input} 
                            onChange={(e) => setInput(e.target.value)} 
                            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()} 
                            disabled={isLoading}
                            className="w-full bg-white/5 border border-white/10 py-4 pl-6 pr-16 rounded-full outline-none focus:border-cyan-500 transition-all text-sm disabled:opacity-50" 
                            placeholder="Analyze indexed documents..." 
                        />
                        <button 
                            onClick={sendMessage} 
                            disabled={isLoading || !input.trim()}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-3 bg-cyan-500 rounded-full shadow-lg shadow-cyan-500/30 active:scale-90 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Send size={18} />
                        </button>
                    </div>
                </div>
            </div>

            {/* ASSET SIDEBAR */}
            <aside className="w-80 lg:w-96 bg-blue-950/40 p-8 flex flex-col h-full shrink-0">
                <h3 className="text-[10px] font-black text-cyan-500 uppercase tracking-widest mb-6">Knowledge Base</h3>
                <button 
                    onClick={() => fileInputRef.current?.click()} 
                    disabled={isUploading}
                    className="w-full border border-dashed border-white/10 p-8 rounded-3xl flex flex-col items-center gap-3 hover:bg-white/5 transition-all group shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Upload size={24} className="text-cyan-400 group-hover:-translate-y-1 transition-transform" />
                    <span className="text-[9px] uppercase font-bold text-gray-500">
                        {isUploading ? 'Uploading...' : 'Index New Source'}
                    </span>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleUpload} 
                        className="hidden"
                        accept=".pdf,.docx,.csv,.txt"
                        disabled={isUploading}
                    />
                </button>
                
                <div className="flex-1 overflow-y-auto mt-6 space-y-4 no-scrollbar min-h-0">
                    {documents.map(doc => (
                        <div key={doc.id} className={`p-4 rounded-xl border transition-all ${doc.enabled ? 'border-cyan-500/30 bg-white/5' : 'border-white/5 opacity-40 bg-black/20'}`}>
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2 overflow-hidden">
                                    <FileText size={16} className="text-cyan-400 shrink-0" />
                                    <span className="text-xs truncate font-bold">{doc.name}</span>
                                </div>
                                <div className="flex gap-1 shrink-0">
                                    <button 
                                        onClick={() => setDocuments(docs => docs.map(d => d.id === doc.id ? {...d, enabled: !d.enabled} : d))}
                                        className="hover:opacity-70 transition-opacity"
                                        title={doc.enabled ? "Disable" : "Enable"}
                                    >
                                        {doc.enabled ? <Power size={14} className="text-cyan-400" /> : <PowerOff size={14} />}
                                    </button>
                                    <button 
                                        onClick={() => setDocuments(docs => docs.filter(d => d.id !== doc.id))} 
                                        className="hover:text-red-500 transition-colors"
                                        title="Delete"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                            <div className="text-[10px] text-gray-500 mt-2">{doc.size}</div>
                        </div>
                    ))}
                </div>
            </aside>
        </div>
    );
}