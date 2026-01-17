import React, { useState, useRef, useEffect } from 'react';
import api from '../../services/api.js';
import toast from 'react-hot-toast';
import Button from '../core/Button.jsx';
import { Send, FileText, ArrowLeft, Loader2, UploadCloud, Plus, MessageSquare, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function SocraticModePage() {
    const [sessions, setSessions] = useState([]);
    const [currentSession, setCurrentSession] = useState(null);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const messagesEndRef = useRef(null);

    // Load Sessions on Mount
    useEffect(() => {
        loadSessions();
    }, []);

    const loadSessions = async () => {
        try {
            const data = await api.getSocraticSessions();
            setSessions(data);
        } catch (error) {
            console.error("Failed to load sessions:", error);
        }
    };

    const loadSessionHistory = async (sessionId) => {
        const toastId = toast.loading("Loading chat history...");
        try {
            const session = await api.getSocraticHistory(sessionId);
            setCurrentSession(session);
            setMessages(session.messages || []);
            toast.success("Chat loaded", { id: toastId });
        } catch (error) {
            toast.error("Failed to load history", { id: toastId });
        }
    };

    const handleDeleteSession = async (e, sessionId) => {
        e.stopPropagation(); // Prevent opening the session when clicking delete
        if (!window.confirm("Are you sure you want to delete this session?")) return;

        const toastId = toast.loading("Deleting session...");
        try {
            await api.deleteSocraticSession(sessionId);
            toast.success("Session deleted", { id: toastId });

            // If deleting current session, clear view
            if (currentSession?._id === sessionId) {
                setCurrentSession(null);
                setMessages([]);
            }

            loadSessions(); // Refresh list
        } catch (error) {
            toast.error("Failed to delete", { id: toastId });
        }
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleFileUpload = async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        setIsUploading(true);
        const toastId = toast.loading("Uploading & Analyzing...");

        try {
            // Upload returns { sessionId, message, cached }
            const data = await api.socraticUpload(file, currentSession?._id);

            // Fetch the full new session to get the initial "Assistant" message
            const newSession = await api.getSocraticHistory(data.sessionId);

            setCurrentSession(newSession);
            setMessages(newSession.messages);

            if (data.cached) {
                toast.success("File recognized! Loaded instantly.", { id: toastId });
            } else {
                toast.success("File uploaded! Ready to learn.", { id: toastId });
            }

            loadSessions(); // Refresh list

        } catch (error) {
            console.error("Upload Error:", error);
            const msg = error.response?.data?.message || error.message || "Upload failed.";
            toast.error(`Error: ${msg}`, { id: toastId, duration: 5000 });
        } finally {
            setIsUploading(false);
        }
    };

    const handleSendMessage = async (e) => {
        e?.preventDefault();
        if (!input.trim() || !currentSession || isLoading) return;

        const userMsg = { role: 'user', content: input };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);

        try {
            const response = await api.socraticChat({
                message: userMsg.content,
                sessionId: currentSession._id
            });

            const assistantMsg = { role: 'assistant', content: response.response };
            setMessages(prev => [...prev, assistantMsg]);
        } catch (error) {
            const msg = error.response?.data?.message || "Failed to get response.";
            toast.error(msg);
            setMessages(prev => [...prev, { role: 'assistant', content: "⚠️ I encountered an error. Please try again." }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="h-full flex bg-background-light dark:bg-background-dark overflow-hidden">

            {/* Sidebar (Session List) */}
            <div className="w-64 border-r border-border-light dark:border-border-dark flex flex-col bg-surface-light dark:bg-surface-dark shrink-0">
                <div className="p-4 border-b border-border-light dark:border-border-dark">
                    <Button
                        variant="primary"
                        fullWidth
                        leftIcon={<Plus size={16} />}
                        onClick={() => { setCurrentSession(null); setMessages([]); }}
                    >
                        New Session
                    </Button>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                    {sessions.length === 0 && (
                        <div className="text-center p-4 text-xs text-text-muted-light dark:text-text-muted-dark opacity-70">
                            No past sessions
                        </div>
                    )}
                    {sessions.map(session => (
                        <div
                            key={session._id}
                            onClick={() => loadSessionHistory(session._id)}
                            className={`group relative p-3 rounded-lg cursor-pointer text-sm transition-colors flex items-center gap-3 pr-8
                                ${currentSession?._id === session._id
                                    ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 font-medium'
                                    : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-text-light dark:text-text-dark'
                                }`}
                        >
                            <MessageSquare size={16} className="shrink-0 opacity-70" />
                            <div className="truncate min-w-0 flex-1">
                                <div className="truncate">{session.filename}</div>
                                <div className="text-[10px] opacity-60 font-normal">
                                    {new Date(session.updatedAt || session.createdAt).toLocaleDateString()}
                                </div>
                            </div>
                            <button
                                onClick={(e) => handleDeleteSession(e, session._id)}
                                className="absolute right-2 p-1.5 text-red-500 opacity-0 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-all"
                                title="Delete Session"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Header */}
                <div className="shrink-0 p-4 border-b border-border-light dark:border-border-dark flex items-center justify-between bg-surface-light dark:bg-surface-dark shadow-sm z-10">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-500/10 rounded-lg">
                            <FileText className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h1 className="text-xl font-bold text-text-light dark:text-text-dark truncate">Socratic Tutor</h1>
                            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                                {!currentSession ? (
                                    <p className="text-xs text-text-muted-light dark:text-text-muted-dark">
                                        Start a new learning session
                                    </p>
                                ) : (
                                    <div className="flex gap-1">
                                        {currentSession.filenames?.map((fname, i) => (
                                            <span key={i} className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full border border-gray-200 dark:border-gray-700 whitespace-nowrap">
                                                {fname}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {currentSession && (
                        <label className="cursor-pointer flex items-center gap-2 px-3 py-1.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors text-sm font-medium">
                            {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                            <span>Add Doc</span>
                            <input type="file" className="hidden" accept=".pdf,.txt,.md" onChange={handleFileUpload} disabled={isUploading} />
                        </label>
                    )}
                </div>

                {/* Upload or Chat */}
                <div className="flex-1 overflow-hidden relative">
                    {!currentSession ? (
                        <div className="h-full flex flex-col items-center justify-center p-6 animate-fadeIn">
                            <div className="max-w-md w-full bg-surface-light dark:bg-surface-dark p-8 rounded-2xl shadow-xl border border-border-light dark:border-border-dark text-center">
                                <h2 className="text-2xl font-bold mb-2 text-text-light dark:text-text-dark">Start Learning</h2>
                                <p className="text-text-muted-light dark:text-text-muted-dark mb-8 text-sm">
                                    Upload a document to begin. <br />
                                    <span className="opacity-70 text-xs">You can add more files later to combine contexts!</span>
                                </p>

                                <label className="cursor-pointer flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border-light dark:border-border-dark rounded-xl hover:border-primary transition-colors bg-gray-50 dark:bg-gray-800">
                                    {isUploading ? (
                                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                    ) : (
                                        <>
                                            <UploadCloud className="w-10 h-10 text-primary mb-2" />
                                            <span className="text-sm font-medium text-text-muted-light dark:text-text-muted-dark">Click to Upload Document</span>
                                        </>
                                    )}
                                    <input type="file" className="hidden" accept=".pdf,.txt,.md" onChange={handleFileUpload} disabled={isUploading} />
                                </label>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col max-w-4xl mx-auto w-full">
                            {/* Chat Area */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
                                {messages.map((msg, index) => (
                                    <div
                                        key={index}
                                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-slideUp`}
                                    >
                                        <div
                                            className={`max-w-[85%] md:max-w-[75%] rounded-2xl px-5 py-3.5 shadow-sm text-sm leading-relaxed ${msg.role === 'user'
                                                ? 'bg-purple-600 text-white rounded-tr-none'
                                                : 'bg-surface-light dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-text-light dark:text-text-dark rounded-tl-none'
                                                }`}
                                        >
                                            <div className="markdown-content">
                                                <ReactMarkdown
                                                    components={{
                                                        p: ({ node, ...props }) => <p className={`mb-2 last:mb-0 ${msg.role === 'user' ? 'text-white' : ''}`} {...props} />,
                                                        ul: ({ node, ...props }) => <ul className="list-disc pl-4 mb-2" {...props} />,
                                                        ol: ({ node, ...props }) => <ol className="list-decimal pl-4 mb-2" {...props} />,
                                                        li: ({ node, ...props }) => <li className="mb-1" {...props} />,
                                                        code: ({ node, inline, className, children, ...props }) => (
                                                            <code className={`${inline ? 'bg-black/10 dark:bg-white/10 px-1 py-0.5 rounded' : 'block bg-gray-900 text-white p-2 rounded mb-2 overflow-x-auto'}`} {...props}>
                                                                {children}
                                                            </code>
                                                        )
                                                    }}
                                                >
                                                    {msg.content}
                                                </ReactMarkdown>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {isLoading && (
                                    <div className="flex justify-start animate-pulse">
                                        <div className="bg-surface-light dark:bg-gray-800 border border-border-light dark:border-border-dark rounded-2xl rounded-tl-none px-4 py-3 flex items-center gap-2">
                                            <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                                            <span className="text-xs text-text-muted-light dark:text-text-muted-dark">Reasoning...</span>
                                        </div>
                                    </div>
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Input Area */}
                            <div className="p-4 bg-surface-light dark:bg-surface-dark border-t border-border-light dark:border-border-dark shrink-0">
                                <form onSubmit={handleSendMessage} className="relative flex items-center gap-2 max-w-4xl mx-auto">
                                    <input
                                        type="text"
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        placeholder="Type your answer or question..."
                                        disabled={isLoading}
                                        className="flex-1 input-field py-3 pr-12 shadow-sm focus:ring-2 focus:ring-purple-500/20"
                                    />
                                    <button
                                        type="submit"
                                        disabled={!input.trim() || isLoading}
                                        className="absolute right-2 p-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                    >
                                        <Send size={18} />
                                    </button>
                                </form>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
