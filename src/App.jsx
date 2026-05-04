import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Activity, Database, Plus, Trash2, LayoutGrid, Monitor, Eye, EyeOff, CheckSquare, Square, PanelLeftClose, PanelLeft, Columns, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMarketData } from './hooks/useMarketData';
import MonitorDashboard from './components/MonitorDashboard';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import logo from '/Doc1-removebg-preview.png';
import { useAuth, buildWsCredential } from './auth/AuthContext';
import LoginPage from './auth/LoginPage';

function cn(...inputs) {
    return twMerge(clsx(inputs));
}

const App = () => {
    const { user, logout } = useAuth();
    const wsCredential = useMemo(() => buildWsCredential(user), [user]);
    // --- Global State ---
    const [debugLogs, setDebugLogs] = useState([]);

    // Monitors Management
    const [monitors, setMonitors] = useState(() => {
        const saved = localStorage.getItem('mt_monitors_list');
        return saved ? JSON.parse(saved) : [{ id: 0 }];
    });
    const [activeMonitorId, setActiveMonitorId] = useState(() => {
        const saved = localStorage.getItem('mt_active_id');
        return saved ? JSON.parse(saved) : 0;
    });
    const [isWsEnabled, setIsWsEnabled] = useState(() => {
        const saved = localStorage.getItem('mt_ws_enabled');
        return saved !== null ? JSON.parse(saved) : true;
    });

    const [monitorSettings, setMonitorSettings] = useState(() => {
        const saved = localStorage.getItem('mt_monitor_settings');
        return saved ? JSON.parse(saved) : {
            0: { config: true, ceDepth: true, peDepth: true, logs: true }
        };
    });

    // Layout Modes per Monitor
    const [monitorLayouts, setMonitorLayouts] = useState(() => {
        const saved = localStorage.getItem('mt_monitor_layouts');
        return saved ? JSON.parse(saved) : { 0: 'original' };
    });

    // Sidebar Collapse State (only for Vertical mode)
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    // Autobot Terminal Visibility State
    const [isAutobotVisible, setIsAutobotVisible] = useState(false);

    useEffect(() => {
        localStorage.setItem('mt_monitors_list', JSON.stringify(monitors));
    }, [monitors]);

    useEffect(() => {
        localStorage.setItem('mt_active_id', JSON.stringify(activeMonitorId));
    }, [activeMonitorId]);

    useEffect(() => {
        localStorage.setItem('mt_ws_enabled', JSON.stringify(isWsEnabled));
    }, [isWsEnabled]);

    useEffect(() => {
        localStorage.setItem('mt_monitor_settings', JSON.stringify(monitorSettings));
    }, [monitorSettings]);

    useEffect(() => {
        localStorage.setItem('mt_monitor_layouts', JSON.stringify(monitorLayouts));
    }, [monitorLayouts]);

    const [activeNotifications, setActiveNotifications] = useState([]);

    // --- WebSocket Centralization ---
    const addDebug = useCallback((msg) => {
        setDebugLogs(prev => [msg, ...prev].slice(0, 8));
    }, []);

    const handleRawMessage = useCallback((type, data) => {
        // ONLY log management packets, skip high-frequency data to prevent "React Storms"
        const highFreqTypes = ['Depth', 'DepthData', 'IndexData'];
        if (type === 'Info' || (type === 'Login' && data?.Error === null)) {
            addDebug(`[WS] ${type} confirmed`);
        } else if (!highFreqTypes.includes(type)) {
            addDebug(`[WS] ${type} received`);
        }
    }, [addDebug]);

    // --- Event Bus for Low-Latency Alerts ---
    const depthEvents = React.useRef(new EventTarget());

    const handleDepthPacket = useCallback((packet) => {
        // Dispatch raw packet immediately to listeners
        depthEvents.current.dispatchEvent(new CustomEvent('depth-packet', { detail: packet }));
    }, []);

    const { status, depthData, subscribe } = useMarketData(isWsEnabled, wsCredential, handleRawMessage, handleDepthPacket);

    // --- Global Notification Logic ---
    const addGlobalNotification = useCallback((details) => {
        setActiveNotifications(prev => {
            if (prev.find(n => n.id === details.id)) return prev;
            return [...prev, { ...details, expires: Date.now() + 5000 }];
        });
        setTimeout(() => {
            setActiveNotifications(prev => prev.filter(n => n.id !== details.id));
        }, 5000);
    }, []);

    // --- Sync Autobot Tokens ---
    const [allMonitorTokens, setAllMonitorTokens] = useState({});

    const handleSyncTokens = useCallback((monitorId, tokensPayload) => {
        setAllMonitorTokens(prev => {
            if (JSON.stringify(prev[monitorId]) === JSON.stringify(tokensPayload)) return prev;
            return { ...prev, [monitorId]: tokensPayload };
        });
    }, []);

    // Broadcast aggregated tokens to the embedded Autobot whenever they change
    const syncToAutobot = useCallback(() => {
        const iframe = document.getElementById('autobot-iframe');
        if (iframe && iframe.contentWindow) {
            const flatTokens = Object.values(allMonitorTokens).flat();
            iframe.contentWindow.postMessage({ type: 'SYNC_STRATEGY_TOKENS', tokens: flatTokens, activeMonitorId }, '*');
        }
    }, [allMonitorTokens, activeMonitorId]);

    useEffect(() => {
        syncToAutobot();
    }, [syncToAutobot]);

    // Re-sync when autobot signals it's ready (catches tokens added before terminal was opened)
    useEffect(() => {
        const handleAutobotReady = (event) => {
            if (event.data?.type === 'AUTOBOT_READY') {
                syncToAutobot();
            }
        };
        window.addEventListener('message', handleAutobotReady);
        return () => window.removeEventListener('message', handleAutobotReady);
    }, [syncToAutobot]);

    // --- Forward depth data to Autobot iframe ---
    useEffect(() => {
        if (!isAutobotVisible) return;
        const iframe = document.getElementById('autobot-iframe');
        if (!iframe?.contentWindow) return;
        if (!depthData || Object.keys(depthData).length === 0) return;

        iframe.contentWindow.postMessage({
            type: 'DEPTH_DATA_UPDATE',
            depthData
        }, '*');
    }, [depthData, isAutobotVisible]);

    // --- Monitor Management ---
    const handleAddMonitor = () => {
        const newId = Math.max(...monitors.map(m => m.id), -1) + 1;
        setMonitors(prev => [...prev, { id: newId }]);
        setMonitorSettings(prev => ({
            ...prev,
            [newId]: { config: true, ceDepth: true, peDepth: true, logs: true }
        }));
        setMonitorLayouts(prev => ({
            ...prev,
            [newId]: 'original'
        }));
        setActiveMonitorId(newId);
    };

    const handleRemoveMonitor = (id) => {
        if (monitors.length <= 1) return;
        setMonitors(prev => prev.filter(m => m.id !== id));
        const newSettings = { ...monitorSettings };
        delete newSettings[id];
        setMonitorSettings(newSettings);

        const newLayouts = { ...monitorLayouts };
        delete newLayouts[id];
        setMonitorLayouts(newLayouts);

        if (activeMonitorId === id) setActiveMonitorId(monitors[0].id);
    };

    // Toggle Visibility
    const toggleElement = (element) => {
        setMonitorSettings(prev => ({
            ...prev,
            [activeMonitorId]: {
                ...prev[activeMonitorId],
                [element]: !prev[activeMonitorId][element]
            }
        }));
    };

    const currentSettings = monitorSettings[activeMonitorId] || { config: true, ceDepth: true, peDepth: true, logs: true };
    const currentLayout = monitorLayouts[activeMonitorId] || 'original';

    // Dynamic Sidebar Elements based on Layout
    const sidebarElements = currentLayout === 'vertical'
        ? [{ id: 'config', label: 'Configuration' }]
        : [
            { id: 'config', label: 'Configuration' },
            { id: 'ceDepth', label: 'CE Depth' },
            { id: 'peDepth', label: 'PE Depth' },
            { id: 'logs', label: 'Live Logs' }
        ];

    // Sidebar Visibility Logic
    // Controlled by sidebarCollapsed in both modes
    const isSidebarVisible = !sidebarCollapsed;

    // Auth gate — MUST be after all hooks
    if (!user) return <LoginPage />;

    return (
        <div className="min-h-screen bg-[#050505] text-white flex h-screen overflow-hidden font-sans selection:bg-blue-500/30">

            {/* Sidebar Toggle (Only when Sidebar is Hidden) */}
            {!isSidebarVisible && (
                <button
                    onClick={() => setSidebarCollapsed(false)}
                    className="fixed top-3 left-3 z-[60] p-2 bg-[#0a0a0e] border border-white/10 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all shadow-lg"
                    title="Show Sidebar"
                >
                    <PanelLeft size={16} />
                </button>
            )}

            {/* --- SIDEBAR --- */}
            <aside className={cn("bg-[#0a0a0e] border-r border-white/5 flex flex-col flex-shrink-0 transition-all duration-300",
                isSidebarVisible ? "w-56" : "w-0 overflow-hidden border-none"
            )}>
                {/* Header */}
                <div className="p-4 border-b border-white/5">
                    <div className="flex items-center justify-between">
                        <div className="flex-1 flex items-center justify-center py-1">
                            <img src={logo} alt="Logo" className="w-[150%] h-auto max-h-32 object-contain drop-shadow-[0_0_15px_rgba(251,191,36,0.5)] transition-transform hover:scale-105" />
                        </div>
                        {/* Collapse Button */}
                        <button
                            onClick={() => setSidebarCollapsed(true)}
                            className="p-1.5 rounded text-white/30 hover:text-white hover:bg-white/10 transition-all ml-1 flex-shrink-0"
                            title="Hide Sidebar"
                        >
                            <PanelLeftClose size={14} />
                        </button>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-[10px] text-white/40">
                            <div className={cn("w-1.5 h-1.5 rounded-full",
                                status === 'connected' ? 'bg-success animate-pulse' :
                                    status === 'connecting' ? 'bg-yellow-400 animate-pulse' : 'bg-danger')} />
                            <span>{status.toUpperCase()}</span>
                        </div>
                        <button
                            onClick={() => setIsWsEnabled(!isWsEnabled)}
                            className={cn(
                                "text-[9px] px-2 py-0.5 rounded-full border transition-all font-bold uppercase tracking-wider",
                                isWsEnabled
                                    ? "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20"
                                    : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                            )}
                        >
                            {isWsEnabled ? "Disconnect" : "Connect"}
                        </button>
                    </div>
                </div>

                {/* Section: Layout Mode */}
                <div className="p-3 border-b border-white/5">
                    <p className="text-[10px] uppercase text-white/20 font-bold tracking-wider mb-2 px-1">View</p>
                    <div className="flex bg-white/5 rounded p-0.5 border border-white/10">
                        <button
                            onClick={() => setMonitorLayouts(prev => ({ ...prev, [activeMonitorId]: 'original' }))}
                            className={cn("flex-1 py-1.5 rounded text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all",
                                currentLayout === 'original' ? "bg-blue-600 text-white shadow-md shadow-blue-500/20" : "text-white/40 hover:text-white hover:bg-white/5"
                            )}
                        >
                            <LayoutGrid size={12} /> Grid
                        </button>
                        <button
                            onClick={() => setMonitorLayouts(prev => ({ ...prev, [activeMonitorId]: 'vertical' }))}
                            className={cn("flex-1 py-1.5 rounded text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all",
                                currentLayout === 'vertical' ? "bg-blue-600 text-white shadow-md shadow-blue-500/20" : "text-white/40 hover:text-white hover:bg-white/5"
                            )}
                        >
                            <Columns size={12} /> Columns
                        </button>
                    </div>
                    <button
                        onClick={() => setIsAutobotVisible(!isAutobotVisible)}
                        className={cn("w-full mt-2 py-1.5 rounded text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all",
                            isAutobotVisible ? "bg-purple-600/30 text-purple-400 border border-purple-500/30 shadow-[0_0_10px_rgba(168,85,247,0.2)]" : "bg-white/5 text-white/50 border border-transparent hover:bg-white/10 hover:text-white"
                        )}
                    >
                        <Monitor size={12} />
                        {isAutobotVisible ? "Hide Autobot Terminal" : "Show Autobot Terminal"}
                    </button>
                </div>

                {/* Section 1: Watchlist */}
                <div className="p-3 overflow-y-auto max-h-[30vh] border-b border-white/5">
                    <p className="text-[10px] uppercase text-white/20 font-bold tracking-wider mb-2 px-1">Watchlist</p>
                    <div className="space-y-1">
                        <button
                            onClick={() => { setActiveMonitorId('global'); setIsAutobotVisible(true); }}
                            className={cn(
                                "w-full text-left px-3 py-2 rounded-lg transition-all text-xs flex items-center justify-between group mb-2 border",
                                activeMonitorId === 'global'
                                    ? "bg-purple-600/20 text-purple-400 border-purple-500/30 shadow-[0_0_10px_rgba(168,85,247,0.1)]"
                                    : "border-transparent text-white/50 hover:bg-white/5 hover:text-white"
                            )}
                        >
                            <span className="flex items-center gap-2 font-black uppercase tracking-widest text-[10px]">
                                <Activity size={12} /> Global View
                            </span>
                        </button>

                        {monitors.map((m, idx) => (
                            <button
                                key={m.id}
                                onClick={() => setActiveMonitorId(m.id)}
                                className={cn(
                                    "w-full text-left px-3 py-2 rounded-lg transition-all text-xs flex items-center justify-between group",
                                    activeMonitorId === m.id
                                        ? "bg-blue-600/10 text-blue-400 border border-blue-500/20"
                                        : "text-white/50 hover:bg-white/5 hover:text-white"
                                )}
                            >
                                <span className="flex items-center gap-2">
                                    Monitor {idx + 1}
                                </span>
                                {monitors.length > 1 && (
                                    <Trash2 size={12} className="opacity-0 group-hover:opacity-100 hover:text-red-400"
                                        onClick={(e) => { e.stopPropagation(); handleRemoveMonitor(m.id); }}
                                    />
                                )}
                            </button>
                        ))}
                        <button onClick={handleAddMonitor} className="w-full py-2 mt-2 border border-dashed border-white/10 rounded-lg text-white/30 text-[10px] hover:border-white/30 hover:text-white transition-colors flex items-center justify-center gap-1">
                            <Plus size={12} /> Add Tab
                        </button>
                    </div>
                </div>

                {/* Section 2: Recent Alerts Box */}
                <div className="flex-1 min-h-0 flex flex-col border-b border-white/5 bg-black/40">
                    <div className="p-3 border-b border-white/5 flex items-center justify-between">
                        <p className="text-[10px] uppercase text-yellow-400/60 font-bold tracking-wider px-1">Recent Alerts</p>
                        <span className="text-[8px] text-white/20 font-mono tracking-tighter">LIVE</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-none">
                        <AnimatePresence initial={false}>
                            {activeNotifications.map((n) => (
                                <motion.div
                                    key={n.id}
                                    initial={{ x: -20, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    exit={{ x: -20, opacity: 0 }}
                                    className={cn(
                                        "bg-white/[0.03] backdrop-blur-md p-2 rounded border shadow-lg relative overflow-hidden",
                                        n.type === 'CE' ? "border-emerald-500/30" : "border-purple-500/30"
                                    )}
                                >
                                    {/* Accent Glow */}
                                    <div className={cn("absolute inset-0 opacity-10",
                                        n.type === 'CE' ? "bg-emerald-500" : "bg-purple-500")}
                                    />

                                    <div className="flex gap-2 relative z-10">
                                        <div className={cn("mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 animate-pulse",
                                            n.type === 'CE' ? "bg-emerald-400" : "bg-purple-400")}
                                        />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-start mb-0.5">
                                                <h4 className={cn("font-bold text-[9px] uppercase tracking-tight",
                                                    n.type === 'CE' ? "text-emerald-400" : "text-purple-400")}>
                                                    Big Order
                                                </h4>
                                                <span className="text-[8px] text-white/30 font-mono">{n.time}</span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[9px]">
                                                <span className="text-white/40">Sym</span>
                                                <span className={cn("text-right font-bold truncate",
                                                    n.type === 'CE' ? "text-emerald-400" : "text-purple-400")}>
                                                    {n.strike} {n.type}
                                                </span>
                                                <span className="text-white/40">Prc</span>
                                                <span className="text-right font-mono text-white/60">{Number(n.price).toFixed(2)}</span>
                                                <span className="text-white/40">Qty</span>
                                                <span className="text-right text-yellow-500 font-bold">{n.observedQty}</span>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                        {activeNotifications.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center opacity-10 py-8">
                                <Database size={24} />
                                <span className="text-[9px] mt-2">No active alerts</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Section 3: Elements (Visibility Control) */}
                <div className="p-3 bg-black/20">
                    <p className="text-[10px] uppercase text-white/20 font-bold tracking-wider mb-2 px-1">Elements</p>
                    <div className="space-y-1">
                        {sidebarElements.map(item => (
                            <button
                                key={item.id}
                                onClick={() => toggleElement(item.id)}
                                className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/5 text-xs text-white/70 transition-colors"
                            >
                                <span>{item.label}</span>
                                {currentSettings[item.id] ? <Eye size={14} className="text-blue-400" /> : <EyeOff size={14} className="text-white/20" />}
                            </button>
                        ))}
                    </div>
                </div>

                {/* User + Logout */}
                {user && (
                    <div className="p-3 border-t border-white/5 mt-auto">
                        <div className="flex items-center gap-2 px-1">
                            <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-[9px] font-black text-emerald-300 flex-shrink-0">
                                {(user.name || user.email || '?').charAt(0).toUpperCase()}
                            </div>
                            <span className="text-[10px] font-bold text-white/50 truncate flex-1">{user.name || user.email}</span>
                            <button
                                onClick={logout}
                                title="Sign out"
                                className="p-1.5 rounded hover:bg-white/10 text-white/30 hover:text-red-400 transition-colors flex-shrink-0"
                            >
                                <LogOut size={12} />
                            </button>
                        </div>
                    </div>
                )}
            </aside>

            {/* --- MAIN CONTENT --- */}
            <main className="flex-1 relative overflow-hidden bg-[#050505] flex">
                <div className={cn("flex-1 h-full overflow-hidden transition-all p-3 relative flex flex-col", isAutobotVisible ? "w-1/2 pr-0 flex-none" : "w-full")}>
                    {activeMonitorId === 'global' ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-white/30 p-10 text-center glass-card rounded-2xl border border-white/5 bg-black/40">
                            <Database size={48} className="mb-6 opacity-80 text-purple-400 drop-shadow-[0_0_15px_rgba(168,85,247,0.4)]" />
                            <h2 className="text-xl font-black uppercase tracking-widest text-white/90 mb-3">Global Dashboard Active</h2>
                            <p className="max-w-md text-sm leading-relaxed text-white/50">
                                You are now viewing the consolidated state of all monitors within the Autobot Terminal.
                                <br /><br />
                                Please manage your live positions and global execution configurations directly in the Terminal on the right.
                            </p>
                            {!isAutobotVisible && (
                                <button
                                    onClick={() => setIsAutobotVisible(true)}
                                    className="mt-8 px-6 py-2 bg-purple-600/20 text-purple-400 border border-purple-500/30 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-purple-600 hover:text-white transition-all shadow-[0_0_15px_rgba(168,85,247,0.2)]"
                                >
                                    Open Terminal
                                </button>
                            )}
                        </div>
                    ) : (
                        monitors.map(m => (
                            <div key={m.id} className={cn("flex-1 h-full", activeMonitorId === m.id ? "block" : "hidden")}>
                                <MonitorDashboard
                                    id={m.id}
                                    isActive={activeMonitorId === m.id}
                                    depthData={depthData}
                                    status={status}
                                    subscribe={subscribe}
                                    addGlobalNotification={addGlobalNotification}
                                    visibleElements={monitorSettings[m.id]}
                                    onRemove={handleRemoveMonitor}
                                    layoutMode={monitorLayouts[m.id] || 'original'}
                                    onLayoutChange={(mode) => setMonitorLayouts(prev => ({ ...prev, [m.id]: mode }))}
                                    depthEvents={depthEvents.current}
                                    isSidebarVisible={isSidebarVisible}
                                    onToggleSidebar={setSidebarCollapsed}
                                    onSyncTokens={handleSyncTokens}
                                />
                            </div>
                        ))
                    )}
                </div>

                {isAutobotVisible && (
                    <div className="w-1/2 h-full border-l border-white/10 bg-black flex-none flex flex-col shadow-[-10px_0_30px_rgba(0,0,0,0.5)] z-20">
                        <div className="bg-[#0a0a0e] p-2 flex items-center justify-between border-b border-white/10">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                                <span className="text-xs font-black uppercase text-purple-400 tracking-widest">Autobot Terminal</span>
                            </div>
                            <button onClick={() => setIsAutobotVisible(false)} className="text-white/30 hover:text-rose-400 p-1 rounded-md transition-colors">
                                <Trash2 size={12} />
                            </button>
                        </div>
                        <iframe
                            id="autobot-iframe"
                            src={import.meta.env.DEV ? `http://${window.location.hostname}:5174` : '/autobot/'}
                            className="flex-1 w-full h-full border-0 bg-transparent"
                            title="Autobot Terminal"
                            onLoad={syncToAutobot}
                        />
                    </div>
                )}
            </main>
        </div>
    );
};

export default App;


