import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useMarketData } from './hooks/useMarketData';
import { useAutomationEngine } from './engine/useAutomationEngine';
import { megaTraderAPI } from './utils/megaTraderAPI';
import contractsData from './contracts_nsefo.json';
import { Activity, Settings2, Play, Square, Plus, Trash2, Cpu, Zap, ChevronDown, Check, Search, RefreshCw, Wifi, ShieldCheck, Layers, Database } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// --- Custom Strike Selector Component ---
const StrikeSelector = ({ token, strikes, onUpdate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const containerRef = React.useRef(null);
  const inputRef = React.useRef(null);
  const listRef = React.useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearchTerm("");
      setTimeout(() => {
        if (inputRef.current) inputRef.current.focus();
        if (listRef.current) {
          const activeItem = listRef.current.querySelector('[data-active="true"]');
          if (activeItem) activeItem.scrollIntoView({ block: 'center', behavior: 'instant' });
        }
      }, 50);
    }
  }, [isOpen]);

  const filteredStrikes = strikes.filter(s => s.toString().includes(searchTerm));

  return (
    <div className="relative flex-1" ref={containerRef}>


      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "relative z-20 w-full flex items-center justify-between px-2 py-1 bg-black/60 border border-white/20 rounded-md group hover:border-white/40 transition-all shadow-inner",
          token.type === 'CE' ? "text-cyan-400" : "text-purple-400"
        )}
      >
        <span className="text-sm font-black tracking-tight leading-none">
          {parseFloat(token.strike)}
        </span>
        <ChevronDown size={14} className="text-white/60 group-hover:text-white/90 transition-colors ml-1 flex-shrink-0" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="absolute top-full left-0 right-0 mt-1 bg-[#1a1c21] border border-white/10 rounded-lg shadow-[0_10px_40px_rgba(0,0,0,0.8)] z-[200] overflow-hidden"
          >
            <div className="p-2 border-b border-white/10 bg-black/20 flex items-center gap-2">
              <Search size={14} className="text-white/40" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Find strike..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-transparent border-none text-sm text-white w-full focus:outline-none placeholder-white/20"
              />
            </div>
            <div ref={listRef} className="max-h-60 overflow-y-auto custom-scrollbar">
              {filteredStrikes.length === 0 ? (
                <div className="px-4 py-3 text-sm text-white/40 italic">No strikes found</div>
              ) : (
                filteredStrikes.map(s => (
                  <button
                    key={s}
                    data-active={parseFloat(s).toString() === parseFloat(token.strike).toString()}
                    onClick={() => {
                      onUpdate(s.toString());
                      setIsOpen(false);
                    }}
                    className={cn(
                      "w-full text-left px-4 py-3 text-sm flex items-center justify-between transition-colors",
                      parseFloat(s).toString() === parseFloat(token.strike).toString()
                        ? "bg-white/10 text-white font-bold"
                        : "text-white/60 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    <span>{parseFloat(s)}</span>
                    {parseFloat(s).toString() === parseFloat(token.strike).toString() && <Check size={12} className="text-blue-400" />}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// --- Monitored Token Card Component (Compact Rectangle) ---
const TokenCard = React.memo(({ token, onRemove, onUpdateType, onUpdateStrike, onUpdateSide, strikes, isGlobalView }) => {
  const typeIsCE = token.type === 'CE';
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.1 }}
      className={cn(
        "relative flex items-center gap-2 p-1.5 px-2 rounded-xl border bg-[#050608] group transition-all",
        typeIsCE
          ? "border-cyan-500/20 hover:border-cyan-500/40 shadow-[0_2px_10px_rgba(6,182,212,0.04)]"
          : "border-purple-500/20 hover:border-purple-500/40 shadow-[0_2px_10px_rgba(168,85,247,0.04)]"
      )}
    >
      {/* Index & Token Name */}
      <div className="flex flex-col min-w-[65px] leading-tight flex-shrink-0">
        <div className="text-[11px] font-black tracking-tighter uppercase text-white/100 truncate">{token.index}</div>
        <div className="text-[9px] text-white/30 font-mono font-bold">{token.tkn}</div>
      </div>

      {/* Strike Selector - Main Hero (Compact) */}
      <div className="w-[90px] flex-shrink-0">
        <StrikeSelector
          token={token}
          strikes={strikes}
          onUpdate={(val) => onUpdateStrike(token.id, val)}
        />
      </div>

      {/* CE/PE Toggle */}
      <button
        onClick={() => onUpdateType(token.id, typeIsCE ? 'PE' : 'CE')}
        className={cn(
          "w-8 h-6 flex items-center justify-center rounded text-[10px] font-black border transition-all flex-shrink-0",
          typeIsCE
            ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/25"
            : "bg-purple-500/10 text-purple-400 border-purple-500/30 hover:bg-purple-500/25"
        )}
      >
        {token.type}
      </button>

      {/* Side Switcher (Clearer) */}
      <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">

        {isGlobalView && (
          <div className="flex flex-col items-end mr-1 bg-black/40 px-1.5 py-0.5 rounded border border-white/5">
            <span className="text-[8px] font-black uppercase text-blue-400 tracking-tighter">Monitor {token.monitorId}</span>
            <span className="text-[8.5px] font-mono text-white/60 font-medium">Thr:{token.autoOrderThreshold} | Qty:{token.autoOrderExecutionQty}</span>
          </div>
        )}

        {/* Position Small Indicator - Moved to before Side Switcher with proper gap */}
        {token.position !== 0 && (
          <div className={cn(
            "flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-black border uppercase tracking-tighter",
            token.position > 0 ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-rose-400 bg-rose-500/10 border-rose-500/20"
          )}>
            {token.position > 0 ? '+' : ''}{token.position}
          </div>
        )}

        <div className="flex bg-black/80 rounded-md p-0.5 border border-white/10 gap-0.5">
          {['both', 'buy', 'sell'].map(s => (
            <button
              key={s}
              onClick={() => onUpdateSide(token.id, s)}
              className={cn(
                "px-2 py-1 text-[10px] font-black rounded transition-all tracking-tight uppercase",
                token.side === s
                  ? s === 'both' ? "bg-white/20 text-white shadow-lg"
                    : s === 'buy' ? "bg-emerald-500/30 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                      : "bg-rose-500/30 text-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.2)]"
                  : "text-white/20 hover:text-white/50"
              )}
            >{s === 'both' ? 'B' : s.toUpperCase()}</button>
          ))}
        </div>
      </div>

      {/* Remove Button */}
      <button
        onClick={() => onRemove(token.id)}
        className="text-white/50 hover:text-rose-400 transition-colors p-3   rounded-md hover:bg-rose-500/10 flex-shrink-0"
      >
        <Trash2 size={10} />
      </button>

      {/* Interaction overlay light */}
      <div className={cn(
        "absolute inset-0 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity",
        typeIsCE ? "bg-cyan-400/[0.02]" : "bg-purple-400/[0.02]"
      )} />
    </motion.div>
  );
});


// --- Order Book / History Component ---
// --- Order Book / History Component ---
const TERMINAL_STATUSES = new Set(['Executed', 'ERejected', 'Cancelled', 'Failed']);

const ExchangeStatusBadge = ({ exStatus }) => {
  if (!exStatus || exStatus === 'checking') {
    return <span className="text-white/20 text-[10px] font-mono tracking-wider">—</span>;
  }
  const color =
    exStatus === 'Executed' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25' :
      exStatus === 'EPending' ? 'text-amber-400 bg-amber-500/10 border-amber-500/25 animate-pulse' :
        exStatus === 'ERejected' ? 'text-rose-400 bg-rose-500/10 border-rose-500/25' :
          exStatus === 'Failed' ? 'text-rose-400 bg-rose-500/10 border-rose-500/25' :
            exStatus === 'Cancelled' ? 'text-white/40 bg-white/5 border-white/10' :
              'text-blue-400 bg-blue-500/10 border-blue-500/20';
  return (
    <span className={`px-2 py-0.5 rounded text-[9px] font-black border uppercase tracking-widest ${color}`}>
      {exStatus}
    </span>
  );
};

const OrderBook = React.memo(({ pendingOrders, executedOrders, onClearAll, onRemoveOne }) => {
  return (
    <motion.div
      initial={{ x: 30, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="glass-card rounded-2xl flex flex-col h-full shadow-2xl overflow-hidden"
    >
      {/* Executed Orders Section - Top Half */}
      <div className="flex-[5] flex flex-col min-h-0 border-b border-white/[0.05]">
        <div className="p-2 bg-white/[0.01] sticky top-0 z-20 backdrop-blur-xl flex items-center justify-between border-b border-white/[0.05]">
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-emerald-400" />
            <h2 className="text-xs font-black uppercase tracking-widest text-white/90">Executed History ({executedOrders.length})</h2>
          </div>
          <button
            onClick={onClearAll}
            className="text-[9px] font-black text-rose-400/60 hover:text-rose-400 uppercase tracking-widest transition-colors flex items-center gap-1 px-2 py-1 rounded-md hover:bg-rose-500/10"
          >
            <Trash2 size={10} /> Clear
          </button>
        </div>
        <div className="flex-1 overflow-auto custom-scrollbar bg-black/10">
          <table className="w-full text-left font-sans">
            <thead className="sticky top-0 bg-[#0f1115] border-b border-white/5 text-[9px] font-black text-white/20 uppercase tracking-widest z-10">
              <tr>
                <th className="py-2 px-4 pl-6 w-[80px]">Time</th>
                <th className="py-2 px-4">Contract</th>
                <th className="py-2 px-4 text-center w-[60px]">Side</th>
                <th className="py-2 px-4 text-right w-[70px]">Qty</th>
                <th className="py-2 px-4 pr-6 text-center w-[100px]">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.01]">
              {executedOrders.length === 0 ? (
                <tr><td colSpan="5" className="py-10 text-center text-white/10 text-[10px] uppercase font-bold">No history</td></tr>
              ) : (
                executedOrders.map((order) => (
                  <tr key={order.id} className="group hover:bg-white/[0.02] transition-colors">
                    <td className="py-2 px-3 pl-4 text-[10px] font-mono font-black text-white/40">{order.time}</td>
                    <td className="py-2 px-3 text-[12px] font-black text-white/80 uppercase tracking-tighter truncate max-w-[140px]">{order.token}</td>
                    <td className="py-2 px-3 text-center">
                      <span className={cn("px-1.5 py-0.5 rounded text-[8px] font-black border uppercase", order.side.toUpperCase() === 'BUY' ? "text-emerald-400 border-emerald-500/20" : "text-rose-400 border-rose-500/20")}>{order.side.substring(0, 3)}</span>
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-sm font-black text-yellow-500">{order.qty}</td>
                    <td className="py-2 px-3 pr-4 text-center"><ExchangeStatusBadge exStatus={order.exStatus} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pending Orders Section - Bottom Half */}
      <div className="flex-[5] flex flex-col min-h-0 bg-black/20">
        <div className="p-2 bg-white/[0.01] sticky top-0 z-20 backdrop-blur-xl border-b border-white/[0.05]">
          <div className="flex items-center gap-2">
            <Cpu size={18} className="text-amber-400" />
            <h2 className="text-xs font-black uppercase tracking-widest text-white/90">Pending Orders ({pendingOrders.length})</h2>
          </div>
        </div>
        <div className="flex-1 overflow-auto custom-scrollbar">
          <table className="w-full text-left font-sans">
            <tbody className="divide-y divide-white/[0.01]">
              {pendingOrders.length === 0 ? (
                <tr><td className="py-10 text-center text-white/10 text-[10px] uppercase font-bold italic">No pending orders</td></tr>
              ) : (
                pendingOrders.map((order) => (
                  <tr key={order.id} className="group hover:bg-white/[0.02] bg-amber-500/5 border-l-2 border-amber-500">
                    <td className="py-2 px-3 pl-4 text-[10px] font-mono font-black text-amber-500 uppercase">{order.time}</td>
                    <td className="py-2 px-3 flex flex-col">
                      <span className="text-[12px] font-black text-amber-200 uppercase tracking-tighter">{order.token}</span>
                      <span className="text-[8px] text-amber-500/40 font-mono tracking-tighter">{order.intOrdNo || 'AWAITING RESPONSE...'}</span>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-amber-500/10 text-amber-400 border border-amber-500/20">{order.side.substring(0, 3)}</span>
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-lg font-black text-amber-500">
                      {order.qty}
                    </td>
                    <td className="py-2 px-3 pr-4 text-right">
                      <span className="text-[9px] font-black uppercase tracking-widest text-amber-400 animate-pulse">Pending...</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
});
// ---  Resizable Column Layout Utilities ---
const MIN_COL_PCT = 12; // minimum width each column can shrink to (%)

const ResizeHandle = ({ onDrag }) => {
  const dragging = useRef(false);
  const startX = useRef(0);
  const [active, setActive] = useState(false);

  const onMouseDown = (e) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    setActive(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (e) => {
      if (!dragging.current) return;
      const dx = e.clientX - startX.current;
      startX.current = e.clientX;
      onDrag(dx);
    };

    const onMouseUp = () => {
      dragging.current = false;
      setActive(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    const onKeyDown = (e) => { if (e.key === 'Escape') onMouseUp(); };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keydown', onKeyDown, { once: true });
  };

  return (
    <div
      onMouseDown={onMouseDown}
      className={cn(
        "flex-shrink-0 w-3 flex items-center justify-center cursor-col-resize group relative z-10",
        "select-none"
      )}
    >
      <div className={cn(
        "w-0.5 h-full rounded-full transition-all duration-150",
        active
          ? "bg-cyan-400/70 shadow-[0_0_8px_rgba(34,211,238,0.5)]"
          : "bg-white/[0.06] group-hover:bg-cyan-400/40 group-hover:shadow-[0_0_6px_rgba(34,211,238,0.3)]"
      )} />
    </div>
  );
};

const VerticalResizeHandle = ({ onDrag }) => {
  const dragging = useRef(false);
  const startY = useRef(0);
  const [active, setActive] = useState(false);

  const onMouseDown = (e) => {
    e.preventDefault();
    dragging.current = true;
    startY.current = e.clientY;
    setActive(true);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (e) => {
      if (!dragging.current) return;
      const dy = e.clientY - startY.current;
      startY.current = e.clientY;
      onDrag(dy);
    };

    const onMouseUp = () => {
      dragging.current = false;
      setActive(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    const onKeyDown = (e) => { if (e.key === 'Escape') onMouseUp(); };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keydown', onKeyDown, { once: true });
  };

  return (
    <div
      onMouseDown={onMouseDown}
      className={cn(
        "flex-shrink-0 h-3 flex items-center justify-center cursor-row-resize group relative z-10",
        "select-none w-full"
      )}
    >
      <div className={cn(
        "h-0.5 w-full rounded-full transition-all duration-150",
        active
          ? "bg-cyan-400/70 shadow-[0_0_8px_rgba(34,211,238,0.5)]"
          : "bg-white/[0.06] group-hover:bg-cyan-400/40 group-hover:shadow-[0_0_6px_rgba(34,211,238,0.3)]"
      )} />
    </div>
  );
};

function App() {
  // --- Global State ---
  const [globalIndex, setGlobalIndex] = useState('NIFTY');
  const [globalExpiry, setGlobalExpiry] = useState('');

  // --- Column widths (%) ---
  const containerRef = useRef(null);
  const [colWidths, setColWidths] = useState([15, 55, 30]); // [left, mid, right]
  const [contractsHeightPct, setContractsHeightPct] = useState(30); // smaller contracts, larger positions depth

  const makeHandleDrag = (leftIdx, rightIdx) => (dx) => {
    if (!containerRef.current) return;
    const totalPx = containerRef.current.getBoundingClientRect().width;
    const dPct = (dx / totalPx) * 100;
    setColWidths(prev => {
      const next = [...prev];
      const newLeft = Math.max(MIN_COL_PCT, Math.min(prev[leftIdx] + dPct, 100 - MIN_COL_PCT * (prev.length - leftIdx)));
      const actualDelta = newLeft - prev[leftIdx];
      const newRight = Math.max(MIN_COL_PCT, prev[rightIdx] - actualDelta);
      next[leftIdx] = newLeft;
      next[rightIdx] = newRight;
      return next;
    });
  };

  const makeVerticalDrag = (dy) => {
    if (!containerRef.current) return;
    const totalPx = containerRef.current.getBoundingClientRect().height;
    const dPct = (dy / totalPx) * 100;
    setContractsHeightPct(prev => {
      const newVal = Math.max(15, Math.min(prev + dPct, 80));
      return newVal;
    });
  };

  // --- Monitored Tokens ---
  const [monitoredTokens, setMonitoredTokens] = useState(() => {
    const saved = localStorage.getItem('autobot_tokens');
    return saved ? JSON.parse(saved) : [];
  });

  // --- Funnel Sync Integration ---
  const [activeMonitorId, setActiveMonitorId] = useState(null);
  // Helper: treat null and 'global' as show-all
  const isGlobalView = (activeMonitorId === null || activeMonitorId === 'global');
  const filterByActiveMonitor = (arr, key = 'monitorId') =>
    isGlobalView ? arr : arr.filter(item => item[key] === activeMonitorId);

  // Parent depth data buffer (must be declared before the message listener)
  const parentDepthBuffer = useRef({});

  useEffect(() => {
    const handleSync = (event) => {
      // Receive depth data forwarded from main app
      if (event.data?.type === 'DEPTH_DATA_UPDATE' && event.data.depthData) {
        Object.assign(parentDepthBuffer.current, event.data.depthData);
        return;
      }

      if (event.data?.type === 'SYNC_STRATEGY_TOKENS') {
        const { tokens, activeMonitorId: incomingMonitorId } = event.data;
        if (Array.isArray(tokens)) {
          setMonitoredTokens(tokens);
          setActiveMonitorId(incomingMonitorId);

          // Auto-apply settings from the first token of the CORRECT monitor
          if (incomingMonitorId !== 'global' && tokens.length > 0) {
            const first = tokens.find(t => t.monitorId === incomingMonitorId);
            if (first) {
              setAppliedSettings(prev => ({
                ...prev,
                threshold: first.autoOrderThreshold ?? prev.threshold,
                slicePercent: first.slicePercentage ?? prev.slicePercent,
                slOffset: first.triggerPriceValue ?? prev.slOffset,
                sellVolThreshold: first.sellVolThreshold ?? prev.sellVolThreshold,
                sellSL: first.sellMaxSLPts ?? prev.sellSL,
                sellTrailing: first.sellTrailing ?? prev.sellTrailing
              }));
            }
          }
        }
      }
    };
    window.addEventListener('message', handleSync);
    return () => window.removeEventListener('message', handleSync);
  }, []);

  const [logs, setLogs] = useState([]);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [executedOrders, setExecutedOrders] = useState(() => {
    const saved = localStorage.getItem('autobot_orders');
    return saved ? JSON.parse(saved) : [];
  });
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [positions, setPositions] = useState(() => {
    const saved = localStorage.getItem('autobot_positions');
    return saved ? JSON.parse(saved) : {};
  });

  // --- Automation Settings (Staging) ---
  const [isAutomationEnabled, setIsAutomationEnabled] = useState(false);
  const [stagedThreshold, setStagedThreshold] = useState(15000);
  const [stagedSlicePercent, setStagedSlicePercent] = useState(10);
  const [stagedSLOffset, setStagedSLOffset] = useState(0);

  // --- Sell Settings ---
  const [stagedSellVolThreshold, setStagedSellVolThreshold] = useState(10); // Volume threshold for liquidation
  const [stagedSellSL, setStagedSellSL] = useState(5);  // Stop Loss pts
  const [stagedSellTrailing, setStagedSellTrailing] = useState(false);

  // --- Applied Settings (Source of truth for engine) ---
  const [appliedSettings, setAppliedSettings] = useState({
    threshold: 15000,
    slicePercent: 10,
    slOffset: 0,
    sellVolThreshold: 10,
    sellSL: 5,
    sellTrailing: false
  });

  const isSettingsDirty = useMemo(() => {
    return stagedThreshold !== appliedSettings.threshold ||
      stagedSlicePercent !== appliedSettings.slicePercent ||
      stagedSLOffset !== appliedSettings.slOffset ||
      stagedSellVolThreshold !== appliedSettings.sellVolThreshold ||
      stagedSellSL !== appliedSettings.sellSL ||
      stagedSellTrailing !== appliedSettings.sellTrailing;
  }, [stagedThreshold, stagedSlicePercent, stagedSLOffset, stagedSellVolThreshold, stagedSellSL, stagedSellTrailing, appliedSettings]);


  // --- Persistence ---
  useEffect(() => {
    localStorage.setItem('autobot_tokens', JSON.stringify(monitoredTokens));
  }, [monitoredTokens]);

  useEffect(() => {
    localStorage.setItem('autobot_orders', JSON.stringify(executedOrders));
  }, [executedOrders]);

  useEffect(() => {
    localStorage.setItem('autobot_positions', JSON.stringify(positions));
  }, [positions]);

  // --- Expiry Management ---
  const availableExpiries = useMemo(() => {
    let searchIndex = globalIndex === 'SENSEX' ? 'BSX' : globalIndex;
    const filtered = contractsData.filter(c => c.s === searchIndex);
    return [...new Set(filtered.map(c => c.e))].sort();
  }, [globalIndex]);

  useEffect(() => {
    if (availableExpiries.length > 0 && !availableExpiries.includes(globalExpiry)) {
      const today = new Date().toISOString().split('T')[0];
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGlobalExpiry(availableExpiries.find(e => e >= today) || availableExpiries[0]);
    }
  }, [availableExpiries, globalExpiry]);

  // --- Market Data Hook ---
  // eslint-disable-next-line no-unused-vars
  const handleMarketMessage = useCallback((_type, _data) => { }, []);

  const { status, depthData: wsDepthData, subscribe } = useMarketData(true, handleMarketMessage);

  // --- Parent Depth Data (forwarded from main app via postMessage) ---
  const [parentDepthData, setParentDepthData] = useState({});

  // Flush parent depth buffer every 100ms (matches engine poll interval)
  useEffect(() => {
    const interval = setInterval(() => {
      const buf = parentDepthBuffer.current;
      if (Object.keys(buf).length > 0) {
        parentDepthBuffer.current = {};
        setParentDepthData(prev => ({ ...prev, ...buf }));
      }
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // Merge: parent depth data as base, local WS data takes priority
  const depthData = useMemo(() => ({
    ...parentDepthData,
    ...wsDepthData
  }), [wsDepthData, parentDepthData]);

  useEffect(() => {
    const validTokens = monitoredTokens.filter(item => item.tkn);
    if (validTokens.length > 0) {
      const tokensToSub = validTokens.map(item => ({
        Xchg: item.index === 'SENSEX' ? 'BSEFO' : 'NSEFO',
        Tkn: item.tkn,
        Symbol: item.symbol
      }));
      subscribe(tokensToSub);
    }
  }, [subscribe, monitoredTokens]);

  // --- Automation Engine ---
  const addLogEvent = useCallback((message, type = 'info', parsed = null, overrideMonitorId = null) => {
    const monitorId = (parsed?.monitorId !== null && parsed?.monitorId !== undefined) ? parsed.monitorId : overrideMonitorId;
    setLogs(prev => [{ id: Date.now() + Math.random(), time: new Date().toLocaleTimeString(), message, type, parsed, timestamp: Date.now(), monitorId }, ...prev].slice(0, 100));

    // Handle Orders (Pending vs Executed)
    if (parsed) {
      const isExecuted = parsed.status && (parsed.status.includes('EXEC') || parsed.status.includes('MET') || parsed.status.includes('LIQUIDATED') || parsed.status.includes('SL HIT'));
      const isFailed = parsed.status && parsed.status.includes('FAILED');

      if (isExecuted) {
        // Move from pending to executed or add directly
        const orderId = parsed.id || (Date.now() + Math.random());
        setPendingOrders(prev => prev.filter(o => o.tokenId !== parsed.tokenId)); // simple cleanup

        setExecutedOrders(prev => [{
          id: orderId,
          time: new Date().toLocaleTimeString(),
          token: parsed.token,
          side: parsed.side || 'N/A',
          qty: parsed.qty,
          price: parsed.price,
          status: parsed.status,
          intOrdNo: parsed.intOrdNo || null,
          exStatus: 'Executed',
          monitorId
        }, ...prev].slice(0, 100));

        // Update positions with Avg Price
        if (parsed.tkn) {
          setPositions(prev => {
            const posKey = (monitorId !== null && monitorId !== undefined) ? `${parsed.tkn}_${monitorId}` : parsed.tkn;
            const current = prev[posKey] || { qty: 0, avgPrice: 0, strike: '', symbol: '', type: '', monitorId, tkn: parsed.tkn };
            const isBuy = parsed.side.toUpperCase() === 'BUY';
            const change = isBuy ? parsed.qty : -parsed.qty;
            const newQty = current.qty + change;

            // Improved avg price calculation:
            // 1. If direction same as before (Adding): weighted average.
            // 2. If direction opposite (Reducing): avg price stays same until position flips.
            // 3. If position flips: new avg price becomes the price of the flip-order.
            let newAvg = current.avgPrice;
            const isEntry = (current.qty === 0) || (current.qty > 0 && isBuy) || (current.qty < 0 && !isBuy);
            const isFlip = (current.qty > 0 && newQty < 0) || (current.qty < 0 && newQty > 0);

            if (current.qty === 0 || isFlip) {
              newAvg = parsed.price;
            } else if (isEntry) {
              // Adding to same direction: (Existing Total Cost + New Cost) / New Total Qty
              newAvg = ((current.avgPrice * Math.abs(current.qty)) + (parsed.price * parsed.qty)) / Math.abs(newQty);
            }
            // else: reducing position (isBuy while short, or sell while long) -> avgPrice doesn't change

            return {
              ...prev,
              [posKey]: {
                qty: newQty,
                avgPrice: parseFloat(newAvg.toFixed(2)),
                strike: parsed.token.split(' ')[1] || current.strike,
                symbol: parsed.token,
                type: parsed.token.split(' ')[2] || current.type,
                maxPnlPts: isFlip ? 0 : (current.maxPnlPts || 0),
                tkn: parsed.tkn,
                monitorId
              }
            };
          });
        }
      } else if (isFailed) {
        // Show failed orders in executed history so user can see what happened
        const orderId = parsed.id || (Date.now() + Math.random());
        setExecutedOrders(prev => [{
          id: orderId,
          time: new Date().toLocaleTimeString(),
          token: parsed.token,
          side: parsed.side || 'N/A',
          qty: parsed.qty,
          price: parsed.price,
          status: parsed.status,
          intOrdNo: parsed.intOrdNo || null,
          exStatus: 'Failed',
          monitorId
        }, ...prev].slice(0, 100));
      } else {
        // Assume pending
        setPendingOrders(prev => [{
          id: Date.now() + Math.random(),
          time: new Date().toLocaleTimeString(),
          token: parsed.token,
          side: parsed.side || 'N/A',
          qty: parsed.qty,
          price: parsed.price,
          status: 'Pending',
          tokenId: parsed.tokenId,
          monitorId
        }, ...prev].slice(0, 50));
      }
    }
  }, []);

  // --- Exchange Order Status Polling ---
  // Every 3 seconds, poll the status API for any order that has an intOrdNo
  // and hasn't reached a terminal status (Executed / ERejected / Cancelled) yet.
  useEffect(() => {
    const interval = setInterval(async () => {
      setExecutedOrders(prev => {
        // Poll all orders that have an intOrdNo and haven't reached a terminal status
        const pending = prev.filter(o => o.intOrdNo != null && !TERMINAL_STATUSES.has(o.exStatus));
        if (pending.length === 0) return prev;

        // Fire all status checks in parallel, then merge results
        Promise.all(
          pending.map(o =>
            megaTraderAPI.getOrderStatus(o.intOrdNo)
              .then(data => ({
                id: o.id,
                // API returns a plain string like "Executed", OR an object with a Status field
                status: typeof data === 'string' ? data : (data?.Status || data?.status || null)
              }))
              .catch(() => ({ id: o.id, status: null }))
          )
        ).then(results => {
          const updates = new Map(results.filter(r => r.status).map(r => [r.id, r.status]));
          if (updates.size === 0) return;
          setExecutedOrders(curr =>
            curr.map(o => updates.has(o.id) ? { ...o, exStatus: updates.get(o.id) } : o)
          );
        });

        return prev; // Return unmodified while async runs
      });
    }, 2000);  // 2s interval — fast enough to catch EPending → Executed transitions

    return () => clearInterval(interval);
  }, []);

  useAutomationEngine({
    isAutomationEnabled,
    depthData,
    monitoredTokens,
    positions,
    autoOrderThreshold: appliedSettings.threshold,
    autoOrderSlicePercentage: appliedSettings.slicePercent,
    triggerPriceValue: appliedSettings.slOffset,
    sellVolThreshold: appliedSettings.sellVolThreshold,
    sellMaxSLPts: appliedSettings.sellSL,
    onLogEvent: addLogEvent,
    status
  });

  // --- Handlers ---
  const handleAddToken = () => {
    let searchIndex = globalIndex === 'SENSEX' ? 'BSX' : globalIndex;
    const validContract = contractsData.find(c =>
      c.s === searchIndex && c.e === globalExpiry && c.p === 'CE'
    );

    if (validContract) {
      const tokenObj = {
        id: `${validContract.t}_${Date.now()}`,
        tkn: validContract.t,
        symbol: validContract.ns,
        strike: parseFloat(validContract.st).toString(),
        type: 'CE',
        side: 'both',
        expiry: globalExpiry,
        index: globalIndex
      };
      setMonitoredTokens(prev => [...prev, tokenObj]);
    }
  };

  const handleSquareOff = async (tokenObj) => {
    const posKey = (tokenObj.monitorId !== null && tokenObj.monitorId !== undefined) ? `${tokenObj.tkn}_${tokenObj.monitorId}` : tokenObj.tkn;
    const posData = positions[posKey];
    const netQty = posData?.qty || 0;
    if (netQty === 0) return;

    const side = netQty > 0 ? 'sell' : 'buy';
    const absQty = Math.abs(netQty);

    // Get current LTP from depthData
    const depth = depthData[tokenObj.tkn] || depthData[Number(tokenObj.tkn)];
    const price = side === 'sell' ? depth?.depths?.[0]?.BP : depth?.depths?.[0]?.SP;

    if (!price) {
      addLogEvent(`Cannot square off ${tokenObj.symbol} — No market price available`, "error");
      return;
    }

    addLogEvent(`Squaring off ${tokenObj.symbol} | Qty: ${absQty} @ ${price}`, "info");

    const details = {
      index: tokenObj.index, strike: tokenObj.strike, type: tokenObj.type,
      side, observedQty: absQty, price: parseFloat(price),
      time: new Date().toLocaleTimeString(), timestamp: Date.now(),
      tokenId: tokenObj.id, tkn: tokenObj.tkn,
      executionQty: absQty, triggerPrice: 0,
      monitorId: tokenObj.monitorId
    };

    const result = await megaTraderAPI.triggerOrder(details);
    if (result && result.Error === null) {
      addLogEvent(`Square off order placed for ${tokenObj.symbol}`, "success",
        {
          token: tokenObj.symbol || `${tokenObj.index} ${tokenObj.strike} ${tokenObj.type}`,
          side: side.toUpperCase(),
          qty: absQty,
          price: parseFloat(price),
          status: 'SQROFF EXEC',
          intOrdNo: result?.IntOrdNo || null,
          tkn: tokenObj.tkn,
          monitorId: tokenObj.monitorId
        });
    } else {
      addLogEvent(`Square off FAILED for ${tokenObj.symbol} | Error: ${result?.Error || 'Unknown'}`, "error", null, tokenObj.monitorId);
    }
  };

  const handleSquareAllOff = async () => {
    const activePositions = Object.keys(positions).filter(posKey => {
      const p = positions[posKey];
      return p.qty !== 0 && (activeMonitorId === 'global' || p.monitorId === activeMonitorId);
    });
    if (activePositions.length === 0) return;

    if (!window.confirm(`Square off ALL ${activePositions.length} active positions?`)) return;

    for (const posKey of activePositions) {
      const pos = positions[posKey];
      await handleSquareOff({
        tkn: pos.tkn || posKey.split('_')[0],
        monitorId: pos.monitorId,
        index: pos.symbol.split(' ')[0],
        strike: pos.strike,
        type: pos.type,
        symbol: pos.symbol
      });
    }
  };

  const removeToken = (id) => {
    setMonitoredTokens(prev => prev.filter(t => t.id !== id));
  };

  // --- Sell Automation logic ---
  useEffect(() => {
    if (!isAutomationEnabled) return;

    const interval = setInterval(() => {
      setPositions(prev => {
        const nextPositions = { ...prev };
        let hasChanges = false;

        Object.keys(nextPositions).forEach(posKey => {
          const pos = nextPositions[posKey];
          if (!pos || pos.qty === 0) return;

          const actualTkn = pos.tkn || posKey.split('_')[0];
          const depth = depthData[actualTkn] || depthData[Number(actualTkn)];
          if (!depth || !depth.depths || !depth.depths[0]) return;

          const ltp = pos.qty > 0 ? depth.depths[0].BP : depth.depths[0].SP;
          if (!ltp) return;

          const pnlPts = pos.qty > 0 ? (ltp - pos.avgPrice) : (pos.avgPrice - ltp);

          // Update high water mark
          if (pnlPts > (pos.maxPnlPts || 0)) {
            nextPositions[posKey] = { ...pos, maxPnlPts: pnlPts };
            hasChanges = true;
          }

          const currentPos = nextPositions[posKey];

          // Find settings for this monitor
          const mToken = monitoredTokens.find(t => t.monitorId === pos.monitorId);
          const mSellSL = mToken?.sellMaxSLPts ?? appliedSettings.sellSL;
          const mSellTrailing = mToken?.sellTrailing ?? appliedSettings.sellTrailing;

          // Check Stop Loss (with Trailing support)
          if (mSellSL > 0) {
            let threshold = -mSellSL;
            if (mSellTrailing && currentPos.maxPnlPts > 0) {
              // Trail: Exit if pnl drops below maxPnl - SL
              threshold = currentPos.maxPnlPts - mSellSL;
            }

            if (pnlPts <= threshold) {
              const reason = mSellTrailing ? `Trailing SL Hit` : `Stop Loss Hit`;
              addLogEvent(`${reason} for ${pos.symbol} (${pnlPts.toFixed(2)} pts)`, "error", {
                token: pos.symbol,
                side: pos.qty > 0 ? 'SELL' : 'BUY',
                qty: Math.abs(pos.qty),
                price: ltp,
                status: 'SL HIT',
                monitorId: pos.monitorId
              }, pos.monitorId);
              handleSquareOff({ tkn: actualTkn, monitorId: pos.monitorId, index: pos.symbol.split(' ')[0], strike: pos.strike, type: pos.type, symbol: pos.symbol });
            }
          }
        });

        return hasChanges ? nextPositions : prev;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isAutomationEnabled, depthData, appliedSettings, handleSquareOff]);

  const clearOrderHistory = () => setExecutedOrders([]);
  const clearLogs = () => setLogs([]);
  const clearPositions = () => setPositions({});
  const removeOneOrder = (id) => setExecutedOrders(prev => prev.filter(o => o.id !== id));
  const updateTokenSide = (id, newSide) => setMonitoredTokens(prev => prev.map(t => t.id === id ? { ...t, side: newSide } : t));

  const updateTokenType = (id, newType) => {
    setMonitoredTokens(prev => prev.map(t => {
      if (t.id === id) {
        let searchIndex = t.index === 'SENSEX' ? 'BSX' : t.index;
        const strikeVal = Number(t.strike).toFixed(5);
        const contract = contractsData.find(c => c.s === searchIndex && c.p === newType && c.e === t.expiry && Number(c.st).toFixed(5) === strikeVal);
        if (contract) return { ...t, type: newType, strike: parseFloat(t.strike).toString(), tkn: contract.t, symbol: contract.ns };
      }
      return t;
    }));
  };

  const updateTokenStrike = (id, newStrike) => {
    setMonitoredTokens(prev => prev.map(t => {
      if (t.id === id) {
        let searchIndex = t.index === 'SENSEX' ? 'BSX' : t.index;
        const strikeVal = Number(newStrike).toFixed(5);
        const contract = contractsData.find(c => c.s === searchIndex && c.p === t.type && c.e === t.expiry && Number(c.st).toFixed(5) === strikeVal);
        const sanitizedStrike = parseFloat(newStrike).toString();
        if (contract) return { ...t, strike: sanitizedStrike, tkn: contract.t, symbol: contract.ns };
      }
      return t;
    }));
  };

  // --- Data Pre-calculation ---
  const contractMap = useMemo(() => {
    const map = {};
    contractsData.forEach(c => {
      const key = `${c.s}_${c.e}`;
      if (!map[key]) map[key] = new Set();
      map[key].add(Number(c.st));
    });
    // Convert sets to sorted arrays
    Object.keys(map).forEach(key => {
      map[key] = Array.from(map[key]).sort((a, b) => a - b);
    });
    return map;
  }, []);

  const getStrikesForToken = useCallback((t) => {
    let searchIndex = t.index === 'SENSEX' ? 'BSX' : t.index;
    const key = `${searchIndex}_${t.expiry}`;
    return contractMap[key] || [];
  }, [contractMap]);

  // Sync staged with applied when applied changes (monitor switch or external sync)
  useEffect(() => {
    setStagedThreshold(appliedSettings.threshold);
    setStagedSlicePercent(appliedSettings.slicePercent);
    setStagedSLOffset(appliedSettings.slOffset);
    setStagedSellVolThreshold(appliedSettings.sellVolThreshold);
    setStagedSellSL(appliedSettings.sellSL);
    setStagedSellTrailing(appliedSettings.sellTrailing);
  }, [appliedSettings]);

  const applySettings = () => {
    const nextSettings = {
      threshold: stagedThreshold,
      slicePercent: stagedSlicePercent,
      slOffset: stagedSLOffset,
      sellVolThreshold: stagedSellVolThreshold,
      sellSL: stagedSellSL,
      sellTrailing: stagedSellTrailing
    };
    setAppliedSettings(nextSettings);

    // BIDIRECTIONAL SYNC: Tell parent (Funnel) to update these settings for the active monitor
    if (activeMonitorId !== null && activeMonitorId !== 'global') {
      window.parent.postMessage({
        type: 'UPDATE_MONITOR_SETTINGS',
        monitorId: activeMonitorId,
        settings: {
          autoOrderThreshold: nextSettings.threshold,
          slicePercentage: nextSettings.slicePercent,
          triggerPriceValue: nextSettings.slOffset,
          sellVolThreshold: nextSettings.sellVolThreshold,
          sellMaxSLPts: nextSettings.sellSL,
          sellTrailing: nextSettings.sellTrailing
        }
      }, '*');
    }

    addLogEvent("Automation parameters updated and applied.", "info");
  };

  const testConnection = async () => {
    addLogEvent("Testing API Connection...", "info");
    const success = await megaTraderAPI.login();
    if (success) {
      addLogEvent("API Connection Successful! Found UniqueID: " + megaTraderAPI.uniqueId, "success");
    } else {
      addLogEvent("API Connection Failed. Please check MegaTrader settings.", "error");
    }
  };

  const toggleEngine = async () => {
    if (!isAutomationEnabled) {
      // Start engine immediately — don't block on login
      setIsAutomationEnabled(true);
      addLogEvent("Engine Started. Connecting to API...", "success");

      // Attempt login in background (non-blocking)
      setIsLoggingIn(true);
      megaTraderAPI.login().then(success => {
        setIsLoggingIn(false);
        if (success) {
          addLogEvent("API Connected. UniqueID: " + megaTraderAPI.uniqueId, "success");
        } else {
          addLogEvent("API login failed — orders may not place until connection is restored. Engine is still running.", "error");
        }
      }).catch(() => {
        setIsLoggingIn(false);
        addLogEvent("API connection error — engine still running, will retry on first order.", "error");
      });
    } else {
      setIsAutomationEnabled(false);
      addLogEvent("Engine Stopped.", "info");
    }
  };

  return (
    <div className="h-screen flex flex-col pt-12 px-2 md:px-4 pb-4 gap-4 w-full max-w-[2560px] mx-auto overflow-hidden">

      {/* Top Navbar */}
      <motion.nav
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="fixed top-0 left-0 right-0 h-10 bg-[#0a0c10]/80 backdrop-blur-xl z-50 px-4 md:px-6 flex items-center justify-between border-b border-white/[0.05]"
      >
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 shadow-[0_0_20px_rgba(59,130,246,0.15)] relative overflow-hidden group">
            <div className="absolute inset-0 bg-blue-400/20 mix-blend-overlay opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <Cpu size={18} className="text-blue-400 relative z-10" />
          </div>
          <h1 className="text-lg font-bold tracking-tight text-white/95">
            Autobot <span className="text-blue-500 font-black">Engine</span>
          </h1>
        </div>

        <div className="flex items-center gap-6">
          <div className="max-sm:hidden flex items-center gap-2 text-[11px] font-mono font-bold tracking-widest">
            <span className="text-white/40 uppercase">Feed:</span>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-black/40 border border-white/5">
              <div className={cn(
                "w-1.5 h-1.5 rounded-full",
                status === 'connected' ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                  : "bg-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.5)]"
              )} />
              <span className={status === 'connected' ? 'text-emerald-400' : 'text-red-400'}>
                {status.toUpperCase()}
              </span>
            </div>
          </div>

          <button
            onClick={toggleEngine}
            disabled={isLoggingIn}
            className={cn(
              "flex items-center gap-2 px-4 py-1.5 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all duration-300 relative overflow-hidden group",
              isLoggingIn ? "bg-white/5 text-white/40 cursor-not-allowed border border-white/10" :
                isAutomationEnabled
                  ? "bg-red-500/10 text-red-500 border border-red-500/30 hover:bg-red-500/20 hover:border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.1)] hover:shadow-[0_0_30px_rgba(239,68,68,0.2)]"
                  : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 hover:border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.1)] hover:shadow-[0_0_30px_rgba(16,185,129,0.2)]"
            )}
          >
            {/* Gloss light effect */}
            <div className="absolute top-0 inset-x-0 h-px bg-white/20" />

            {isLoggingIn ? (
              <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin relative z-10" />
            ) : isAutomationEnabled ? (
              <Square size={14} className="fill-current relative z-10" />
            ) : (
              <Play size={14} className="fill-current relative z-10" />
            )}
            <span className="relative z-10">{isLoggingIn ? 'Connecting...' : isAutomationEnabled ? 'Stop Engine' : 'Start Engine'}</span>
          </button>
        </div>
      </motion.nav>

      {/* Main Flex Content - resizable columns */}
      <div ref={containerRef} className="flex flex-row flex-1 min-h-0 pt-4 gap-0">

        {/* Left Sidebar - Settings */}
        <motion.div
          initial={{ x: -30, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          style={{ width: `${colWidths[0]}%` }}
          className="flex flex-col gap-4 h-full min-h-0 flex-shrink-0 overflow-hidden"
        >
          {/* Window 1: Order Config (30%) */}
          <div className="h-[30%] glass-card rounded-xl flex flex-col border border-white/10 bg-black/40 shadow-2xl overflow-hidden">
            <div className="p-2 border-b border-white/10 bg-white/[0.03]">
              <div className="flex items-center gap-2">
                <Settings2 size={14} className="text-blue-400" />
                <h2 className="text-[10px] font-black uppercase tracking-widest text-white/90">Order Config</h2>
              </div>
            </div>
            <div className="flex-1 p-2 space-y-2 overflow-y-auto custom-scrollbar">
              <div className="space-y-0.5">
                <label className="text-[9px] uppercase font-black text-blue-400/80 tracking-widest">Threshold</label>
                <input type="number" value={stagedThreshold} onChange={e => setStagedThreshold(Number(e.target.value))}
                  className="w-full bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-xs font-mono text-white focus:border-blue-500/50 outline-none transition-all" />
              </div>
              <div className="space-y-0.5">
                <label className="text-[9px] uppercase font-black text-cyan-400/80 tracking-widest">Lot Size</label>
                <input type="number" value={stagedSlicePercent} onChange={e => setStagedSlicePercent(Number(e.target.value))}
                  className="w-full bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-xs font-mono text-cyan-400 focus:border-cyan-500/50 outline-none transition-all" placeholder="65" />
              </div>
              <div className="space-y-0.5">
                <label className="text-[9px] uppercase font-black text-rose-400/80 tracking-widest">S/L Offset</label>
                <input type="number" value={stagedSLOffset} onChange={e => setStagedSLOffset(Number(e.target.value))}
                  className="w-full bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-xs font-mono text-rose-400 focus:border-rose-500/50 outline-none transition-all" />
              </div>
            </div>
          </div>

          {/* Window 2: Sell Automation (30%) */}
          <div className="h-[30%] glass-card rounded-xl flex flex-col border border-white/10 bg-black/40 shadow-2xl overflow-hidden">
            <div className="p-2 border-b border-white/10 bg-white/[0.03]">
              <div className="flex items-center gap-2">
                <ShieldCheck size={14} className="text-emerald-400" />
                <h2 className="text-[10px] font-black uppercase tracking-widest text-white/90">Global Sell</h2>
              </div>
            </div>
            <div className="flex-1 p-2 space-y-2 overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 gap-2">
                <div className="space-y-0.5">
                  <label className="text-[9px] uppercase font-black text-emerald-400/80 tracking-widest">Sell Vol Threshold</label>
                  <input type="number" value={stagedSellVolThreshold} onChange={e => setStagedSellVolThreshold(Number(e.target.value))}
                    className="w-full bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-xs font-mono text-emerald-400 focus:outline-none focus:border-emerald-500/50 transition-all placeholder:opacity-20" placeholder="10000" />
                </div>
                <div className="space-y-0.5">
                  <label className="text-[9px] uppercase font-black text-rose-400/80 tracking-widest">Max SL (pts)</label>
                  <input type="number" value={stagedSellSL} onChange={e => setStagedSellSL(Number(e.target.value))}
                    className="w-full bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-xs font-mono text-rose-400 focus:outline-none focus:border-rose-500/50 transition-all" />
                </div>
              </div>
              {/* <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                <label className="text-[11px] uppercase font-black text-white/50 tracking-widest">Trailing Liquidation</label>
                <button
                  onClick={() => setStagedSellTrailing(!stagedSellTrailing)}
                  className={cn(
                    "w-12 h-6 rounded-full relative transition-all duration-300 shadow-inner",
                    stagedSellTrailing ? "bg-emerald-500" : "bg-white/10"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 w-4 h-4 bg-white rounded-full transition-all duration-300 shadow-md",
                    stagedSellTrailing ? "left-7" : "left-1"
                  )} />
                </button>
              </div> */}

              <div className="pt-2">
                <button
                  onClick={applySettings}
                  className={cn(
                    "w-full py-1 rounded-lg font-black text-[11px] uppercase tracking-[0.2em] transition-all border flex items-center justify-center gap-3 active:scale-95 mx-auto",
                    isSettingsDirty ? "bg-blue-600 border-blue-400 text-white shadow-[0_0_25px_rgba(37,99,235,0.3)]" : "bg-white/5 border-white/10 text-white/20"
                  )}
                >
                  <RefreshCw size={14} className={cn(isSettingsDirty && "animate-spin-slow")} />
                  Apply Config
                </button>
              </div>
            </div>
          </div>

          {/* Blank space (20%) */}
          <div className="flex-1 opacity-5 flex items-center justify-center grayscale">
            <Cpu size={48} className="text-white" />
          </div>


        </motion.div>

        {/* Resize handle: left | mid */}
        <ResizeHandle onDrag={makeHandleDrag(0, 1)} />

        {/* Center Area - Tokens, Positions & Logs */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          style={{ width: `${colWidths[1]}%` }}
          className="flex flex-col gap-0 h-full min-h-0 flex-shrink-0 overflow-hidden"
        >

          {/* Window: Automated Contracts (Top) */}
          <div
            style={{ height: `${contractsHeightPct}%` }}
            className="glass-card rounded-xl flex flex-col shadow-xl min-h-[100px] border border-white/10 bg-black/20 mb-2"
          >
            <div className="px-3 py-1.5 border-b border-white/[0.05] bg-white/[0.01] flex flex-wrap gap-2 items-center justify-between sticky top-0 z-10 backdrop-blur-md">
              <div className="flex items-center gap-2">
                <Activity size={14} className="text-blue-400" />
                <h2 className="text-[10px] font-black uppercase tracking-widest text-white/90">Automated Contracts</h2>
              </div>

              <div className="flex items-center gap-2">
                <select value={globalIndex} onChange={e => setGlobalIndex(e.target.value)}
                  className="bg-[#0f1115] border border-white/10 rounded-md px-2 py-1 text-[10px] font-bold focus:border-blue-500 focus:outline-none hover:border-white/20 transition-colors text-white/80 shadow-inner outline-none">
                  <option value="NIFTY">NIFTY</option>
                  <option value="BANKNIFTY">BNIFTY</option>
                  <option value="FINNIFTY">FNIFTY</option>
                  <option value="SENSEX">SENSEX</option>
                </select>

                <select value={globalExpiry} onChange={e => setGlobalExpiry(e.target.value)}
                  className="bg-[#0f1115] border border-white/10 rounded-md px-2 py-1 text-[10px] font-bold focus:border-blue-500 focus:outline-none hover:border-white/20 transition-colors text-white/80 shadow-inner outline-none min-w-[100px]">
                  {availableExpiries.map(e => <option key={e} value={e}>{e.split('T')[0]}</option>)}
                </select>

                <button onClick={handleAddToken}
                  className="bg-blue-600/90 hover:bg-blue-500 text-white px-3 py-1 rounded-md text-[10px] font-black flex items-center gap-1 transition-all hover:shadow-[0_0_10px_rgba(59,130,246,0.3)] tracking-wide">
                  <Plus size={12} /> Add Target
                </button>
              </div>
            </div>

            <div className="p-2 bg-transparent flex-1 overflow-y-auto w-full custom-scrollbar">
              {monitoredTokens.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-white/30 py-10">
                  <div className="w-16 h-16 rounded-full bg-blue-500/5 flex items-center justify-center mb-4 border border-blue-500/10">
                    <Zap size={24} className="opacity-40 text-blue-400" />
                  </div>
                  <p className="text-sm font-black text-white/50 tracking-wider uppercase">No targets monitored</p>
                  <p className="text-[11px] text-white/30 mt-2 font-medium">Click "Add Target" to begin tracking signals</p>
                </div>
              ) : (
                <AnimatePresence mode='popLayout'>
                  <div
                    className="grid gap-2"
                    style={{
                      gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))'
                    }}
                  >
                    {filterByActiveMonitor(monitoredTokens).map(t => (
                      <TokenCard
                        key={t.id + (t.monitorId !== undefined ? t.monitorId : '')}
                        token={{ ...t, position: positions[(t.monitorId !== null && t.monitorId !== undefined) ? `${t.tkn}_${t.monitorId}` : t.tkn]?.qty || 0, onSquareOff: handleSquareOff }}
                        strikes={getStrikesForToken(t)}
                        onRemove={removeToken}
                        onUpdateType={updateTokenType}
                        onUpdateStrike={updateTokenStrike}
                        onUpdateSide={updateTokenSide}
                        isGlobalView={activeMonitorId === 'global'}
                      />
                    ))}
                  </div>
                </AnimatePresence>
              )}
            </div>
          </div>

          <VerticalResizeHandle onDrag={makeVerticalDrag} />

          {/* Market Positions Tiles Section */}
          <div className="glass-card rounded-xl flex flex-col shadow-xl min-h-[100px] border border-white/10 bg-black/30 mb-2">
            <div className="px-3 py-1.5 border-b border-white/10 bg-white/[0.03] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers size={14} className="text-amber-400" />
                <span className="text-[10px] font-black uppercase tracking-widest text-white/80">Outstanding positions</span>
              </div>
              <div className="text-[8px] font-black px-1.5 py-0.5 bg-amber-500/10 text-amber-500 rounded border border-amber-500/20 uppercase tracking-tighter">
                {Object.values(positions).filter(p => p.qty !== 0 && (activeMonitorId === 'global' || p.monitorId === activeMonitorId)).length} Live
              </div>
            </div>

            <div className="p-2 overflow-y-auto custom-scrollbar">
              <div className="flex flex-wrap gap-2 items-center justify-center">
                {Object.entries(positions).filter(([, p]) => p.qty !== 0 && (activeMonitorId === 'global' || p.monitorId === activeMonitorId)).map(([posKey, pos], idx) => {
                  const actualTkn = pos.tkn || posKey.split('_')[0];
                  const currentDepth = depthData[actualTkn] || depthData[Number(actualTkn)] || { depths: [] };
                  const buyLevels = (currentDepth.depths || []).slice(0, 3).map(d => ({ qty: d.BQ, price: d.BP }));
                  const sellLevels = (currentDepth.depths || []).slice(0, 3).map(d => ({ qty: d.SQ, price: d.SP }));

                  // Fallback to empty if no depth
                  const buyDepth = buyLevels.length > 0 ? buyLevels : Array.from({ length: 3 }).map(() => ({ qty: '-', price: '-' }));
                  const sellDepth = sellLevels.length > 0 ? sellLevels : Array.from({ length: 3 }).map(() => ({ qty: '-', price: '-' }));

                  return (
                    <motion.div
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      key={idx}
                      className="flex-shrink-0 w-48 bg-[#0a0c10] border border-white/10 rounded-lg overflow-hidden shadow-2xl hover:border-white/30 transition-all"
                    >
                      {/* Card Header: Strike + CE/PE */}
                      <div className={cn("px-2 py-1 border-b border-white/5 flex items-center justify-between bg-white/[0.02]", pos.type === 'CE' ? "text-cyan-400" : "text-purple-400")}>
                        <div className="flex flex-col">
                          <span className="text-[12px] font-black uppercase tracking-tighter leading-none">{pos.symbol}</span>
                          <span className="text-[8px] font-black opacity-40 uppercase tracking-widest mt-0.5">{pos.type}</span>
                        </div>
                        <div className="text-right">
                          <span className={cn("text-lg font-black tracking-tighter", pos.qty > 0 ? "text-emerald-400" : "text-rose-400")}>
                            {pos.qty > 0 ? '+' : ''}{pos.qty}
                          </span>
                        </div>
                      </div>

                      {/* Depth Columns */}
                      <div className="grid grid-cols-2 text-[11px] font-black tracking-tighter uppercase p-2 gap-2 bg-[#0d0f14]">
                        <div className="space-y-1">
                          <div className="text-emerald-500/60 pb-1 border-b border-emerald-500/10 flex justify-between px-1">
                            <span>Price</span>
                            <span>Qty</span>
                          </div>
                          {buyDepth.map((d, i) => (
                            <div key={i} className="flex justify-between text-emerald-400/80 font-mono px-1">
                              <span>{d.price}</span>
                              <span className="opacity-60">{d.qty}</span>
                            </div>
                          ))}
                        </div>
                        <div className="space-y-1">
                          <div className="text-rose-500/60 pb-1 border-b border-rose-500/10 flex justify-between px-1">
                            <span>Price</span>
                            <span>Qty</span>
                          </div>
                          {sellDepth.map((d, i) => (
                            <div key={i} className="flex justify-between text-rose-400/80 font-mono px-1">
                              <span>{d.price}</span>
                              <span className="opacity-60">{d.qty}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Card Footer: Avg Entry */}
                      <div className="px-2 py-1 bg-black/40 border-t border-white/5 flex items-center justify-between">
                        <span className="text-[8px] font-black text-white/40 uppercase tracking-widest">Avg Entry</span>
                        <span className="text-[10px] font-mono font-black text-white/60">{pos.avgPrice}</span>
                      </div>
                    </motion.div>
                  );
                })}
                {Object.values(positions).filter(p => p.qty !== 0).length === 0 && (
                  <div className="text-center py-20 w-full opacity-10 flex flex-col items-center">
                    <Layers size={48} className="mb-4" />
                    <span className="text-xs font-black uppercase tracking-[0.2em]">Market Depth Idle</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <VerticalResizeHandle onDrag={makeVerticalDrag} />

          {/* Outstanding Positions Section */}
          <div className="glass-card rounded-xl flex flex-col shadow-xl min-h-[140px] border border-white/10 bg-black/40 mb-2 overflow-hidden">
            <div className="px-3 py-1.5 border-b border-white/10 bg-white/[0.03] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database size={14} className="text-blue-400" />
                <span className="text-[10px] font-black uppercase tracking-widest text-white/80">Open Positions</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={clearPositions}
                  className="px-3 py-1 bg-rose-600/20 text-rose-400 border border-rose-500/30 rounded-md text-[9px] font-black uppercase tracking-widest hover:bg-rose-600 hover:text-white transition-all active:scale-95 flex items-center gap-1.5"
                >
                  <Trash2 size={10} /> Clear
                </button>
                <button
                  onClick={handleSquareAllOff}
                  className="px-3 py-1 bg-rose-600/20 text-rose-400 border border-rose-500/30 rounded-md text-[9px] font-black uppercase tracking-widest hover:bg-rose-600 hover:text-white transition-all active:scale-95 flex items-center gap-1.5"
                >
                  <Square size={10} fill="currentColor" /> Square All Off
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto custom-scrollbar">
              <table className="w-full text-left font-sans">
                <thead className="sticky top-0 bg-[#0f1115] border-b border-white/5 text-[9px] font-black text-white/20 uppercase tracking-widest z-10">
                  <tr>
                    <th className="py-3 px-6">Strike</th>
                    <th className="py-3 px-6">Type</th>
                    <th className="py-3 px-6 text-right">Qty</th>
                    <th className="py-3 px-6 text-right">LTP</th>
                    <th className="py-3 px-8 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.02]">
                  {filterByActiveMonitor(Object.entries(positions).filter(([, pos]) => pos.qty !== 0).map(([k, v]) => ({ ...v, _key: k }))).length === 0 ? (
                    <tr>
                      <td colSpan="5" className="py-12 text-center text-white/10 text-[10px] font-black uppercase tracking-widest italic">
                        No active positions
                      </td>
                    </tr>
                  ) : (
                    filterByActiveMonitor(Object.entries(positions).filter(([, pos]) => pos.qty !== 0).map(([k, v]) => ({ ...v, _key: k }))).map((pos) => {
                      const actualTkn = pos.tkn || pos._key.split('_')[0];
                      const depth = depthData[actualTkn] || depthData[Number(actualTkn)];
                      const ltp = depth?.LP || depth?.depths?.[0]?.BP || pos.avgPrice;

                      return (
                        <tr key={pos._key} className="group hover:bg-white/[0.02] transition-colors">
                          <td className="py-1.5 px-3 text-[11px] font-black text-white uppercase tracking-tighter">
                            {pos.symbol.split(' ').slice(0, 2).join(' ')}
                          </td>
                          <td className="py-1.5 px-3">
                            <span className={cn(
                              "px-1.5 py-0.5 rounded text-[8px] font-black border uppercase",
                              pos.type === 'CE' ? "text-cyan-400 border-cyan-500/20 bg-cyan-500/5" : "text-purple-400 border-purple-500/20 bg-purple-500/5"
                            )}>
                              {pos.type}
                            </span>
                          </td>
                          <td className="py-1.5 px-3 text-right font-mono text-sm font-black text-yellow-500">
                            {pos.qty}
                          </td>
                          <td className="py-1.5 px-3 text-right font-mono text-sm font-black text-white/80">
                            {parseFloat(ltp).toFixed(2)}
                          </td>
                          <td className="py-1.5 px-4 text-right">
                            <button
                              onClick={() => handleSquareOff({ tkn: actualTkn, monitorId: pos.monitorId, index: pos.symbol.split(' ')[0], strike: pos.strike, type: pos.type, symbol: pos.symbol })}
                              className="px-2 py-0.5 rounded-md bg-orange-500/10 text-orange-400 border border-orange-500/20 text-[8px] font-black uppercase tracking-widest hover:bg-orange-500 hover:text-white transition-all active:scale-95"
                            >
                              Square Off
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <VerticalResizeHandle onDrag={makeVerticalDrag} />

          {/* Execution Logs Table */}
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="glass-card flex-1 rounded-xl flex flex-col min-h-[150px] shadow-2xl relative overflow-hidden"
          >
            <div className="px-3 py-1.5 border-b border-white/[0.05] bg-white/[0.01] sticky top-0 z-20 backdrop-blur-md flex items-center justify-between">
              <h2 className="text-[10px] font-black uppercase tracking-widest text-emerald-400 flex items-center gap-2">
                <Activity size={14} />
                Engine Output Logs (Live)
              </h2>
              <button
                onClick={clearLogs}
                className="text-[9px] font-black text-rose-400/60 hover:text-rose-400 uppercase tracking-widest transition-colors flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-rose-500/10"
              >
                <Trash2 size={10} /> Clear
              </button>
            </div>

            <div className="flex-1 overflow-auto bg-black/30 custom-scrollbar">
              <table className="w-full text-left whitespace-nowrap">
                <thead className="sticky top-0 bg-[#0f1115] text-[9px] font-black uppercase text-white/30 z-10 border-b border-white/5">
                  <tr>
                    <th className="py-2 px-3">Time</th>
                    <th className="py-2 px-3">Identifier</th>
                    <th className="py-2 px-3">Side</th>
                    <th className="py-2 px-3 text-right">Price</th>
                    <th className="py-2 px-3 text-right">Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.02] uppercase font-bold">
                  {filterByActiveMonitor(logs).length === 0 ? (
                    <tr><td colSpan="5" className="py-20 text-center text-white/10 italic text-sm font-black uppercase tracking-widest">Awaiting market signals...</td></tr>
                  ) : (
                    filterByActiveMonitor(logs).map(log => {
                      const parsed = log.parsed || {};
                      const isBuy = parsed.side ? (parsed.side.toUpperCase() === 'BUY') : (log.message || '').toLowerCase().includes('buy');
                      const strikeLabel = parsed.token || log.message.split('|')[0].replace('Squaring off', '').trim();
                      const elapsed = Math.floor((Date.now() - log.timestamp) / 1000);
                      const timerStr = `${Math.floor(elapsed / 60)}:${(elapsed % 60).toString().padStart(2, '0')}`;

                      return (
                        <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="py-1.5 px-3 font-mono text-[11px]">
                            <div className="flex items-center gap-2">
                              <span className="text-white/40">{log.time}</span>
                              <span className="text-blue-400/80 font-bold">({timerStr})</span>
                            </div>
                          </td>
                          <td className="py-1.5 px-3">
                            <div className={cn(
                              "text-sm font-black tracking-widest",
                              log.message.includes('CE') ? "text-cyan-400" : log.message.includes('PE') ? "text-purple-400" : "text-white/80"
                            )}>
                              {strikeLabel}
                            </div>
                          </td>
                          <td className="py-1.5 px-3">
                            {/* Only show side for trade messages (those with parsed data) */}
                            {log.parsed && (
                              <div className={cn("text-sm font-black tracking-widest", isBuy ? "text-emerald-400" : "text-rose-400")}>
                                {isBuy ? 'BUY' : 'SELL'}
                              </div>
                            )}
                          </td>
                          <td className="py-1.5 px-3 text-right font-mono font-black text-white/40 text-[14px]">
                            {parsed.price || '-'}
                          </td>
                          <td className="py-1.5 px-3 text-right font-black text-yellow-500 tracking-tighter text-[18px]">
                            {parsed.qty || '-'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        </motion.div>

        {/* Resize handle: mid | right */}
        < ResizeHandle onDrag={makeHandleDrag(1, 2)} />

        {/* Right Sidebar - Order Book */}
        < div
          style={{ width: `${colWidths[2]}%` }
          }
          className="h-full min-h-[300px] flex-shrink-0 overflow-hidden"
        >
          <OrderBook
            pendingOrders={filterByActiveMonitor(pendingOrders)}
            executedOrders={filterByActiveMonitor(executedOrders)}
            onClearAll={clearOrderHistory}
            onRemoveOne={removeOneOrder}
          />
        </div >

      </div >
    </div >
  );
}

export default App;
