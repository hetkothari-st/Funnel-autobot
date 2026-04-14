import { useState, useEffect, useCallback, useRef } from 'react';

const resolveWsUrl = () => {
    const envUrl = import.meta.env?.VITE_WS_URL;
    if (envUrl) {
        if (/^https?:\/\//i.test(envUrl)) {
            const u = new URL(envUrl);
            const scheme = u.protocol === 'https:' ? 'wss:' : 'ws:';
            const path = u.pathname && u.pathname !== '/' ? u.pathname : '/ws';
            return `${scheme}//${u.host}${path}`;
        }
        return envUrl;
    }
    if (typeof window !== 'undefined' && window.location) {
        // In production the autobot is served at /autobot/ on the same origin
        // WS endpoint is at /ws on the parent origin
        const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${scheme}//${window.location.host}/ws`;
    }
    return 'ws://115.242.15.134:19101';
};

const WS_URL = resolveWsUrl();

export const useMarketData = (enabled = true, onMessage = null, onDepthPacket = null) => {
    const [status, setStatus] = useState('disconnected');
    const [depthData, setDepthData] = useState({});

    const ws = useRef(null);
    const hbInterval = useRef(null);
    const reconnectTimeout = useRef(null);
    const syncInterval = useRef(null);
    const handshakeTimeout = useRef(null);
    const onMessageRef = useRef(onMessage);
    const onDepthPacketRef = useRef(onDepthPacket);
    const enabledRef = useRef(enabled);
    const isLoggedIn = useRef(false);
    const isReady = useRef(false);
    const pendingSubs = useRef([]);

    // Data Buffers to prevent "React Storms"
    const depthBuffer = useRef({});
    const packetRates = useRef({});
    const lastTelemetry = useRef(Date.now());

    // Watchdog State
    const activeSubscriptions = useRef(new Map());
    const lastPacketTimes = useRef(new Map());

    const msgCountRef = useRef(0);
    const msgTypesRef = useRef({});

    // Keep refs updated
    useEffect(() => {
        onMessageRef.current = onMessage;
        onDepthPacketRef.current = onDepthPacket;
        enabledRef.current = enabled;
    }, [onMessage, onDepthPacket, enabled]);

    const connect = useCallback(() => {
        if (ws.current) {
            ws.current.onclose = null;
            ws.current.close();
        }

        console.log('[WS-Bot] Connecting to:', WS_URL);
        setStatus('connecting');
        ws.current = new WebSocket(WS_URL);

        ws.current.onopen = () => {
            console.log('[WS-Bot] WebSocket OPEN — sending Login...');
            setStatus('connected');
            msgCountRef.current = 0;
            msgTypesRef.current = {};
            const cred = `autobot_bot_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
            const loginPayload = { Type: 'Login', Data: { LoginId: cred, Password: cred } };
            ws.current.send(JSON.stringify(loginPayload));
        };

        ws.current.onmessage = (event) => {
            try {
                msgCountRef.current++;
                const msg = JSON.parse(event.data);
                const { Type, Data } = msg;

                msgTypesRef.current[Type] = (msgTypesRef.current[Type] || 0) + 1;
                if (msgCountRef.current <= 5) {
                    console.log(`[WS-Bot] msg #${msgCountRef.current} type=${Type}`);
                }

                // Activate session on first usable message
                if (!isReady.current) {
                    if (Type === 'Login' && Data?.Error) {
                        console.error('[WS-Bot] LOGIN FAILED:', Data.Error);
                        return;
                    }
                    console.log('[WS-Bot] Session ACTIVE (triggered by msg type:', Type + ')');
                    isLoggedIn.current = true;
                    isReady.current = true;

                    const activeQuotes = Array.from(activeSubscriptions.current.values());
                    const freshQuotes = pendingSubs.current.flat().filter(
                        (q) => !activeSubscriptions.current.has(String(q.Tkn))
                    );

                    const allTokens = [...activeQuotes, ...freshQuotes];
                    const depthTokens = allTokens.filter(
                        (q) => q.Xchg === 'NSEFO' || q.Xchg === 'BSEFO'
                    );
                    const indexTokens = [
                        { Tkn: '26000', Xchg: 'NSE' },
                        { Tkn: '26009', Xchg: 'NSE' },
                        { Tkn: '1', Xchg: 'BSE' },
                        ...allTokens.filter((q) => ['NSE', 'BSE', 'NSECM', 'BSECM'].includes(q.Xchg)),
                    ].filter((v, i, a) => a.findIndex((t) => t.Tkn === v.Tkn && t.Xchg === v.Xchg) === i);

                    if (depthTokens.length > 0) {
                        ws.current.send(
                            JSON.stringify({
                                Type: 'TokenRequest',
                                Data: { SubType: true, FeedType: 2, quotes: depthTokens },
                            })
                        );
                        depthTokens.forEach((q) =>
                            activeSubscriptions.current.set(String(q.Tkn), q)
                        );
                    }

                    if (indexTokens.length > 0) {
                        ws.current.send(
                            JSON.stringify({
                                Type: 'TokenRequest',
                                Data: { SubType: true, FeedType: 1, quotes: indexTokens },
                            })
                        );
                        indexTokens.forEach((q) =>
                            activeSubscriptions.current.set(String(q.Tkn), q)
                        );
                    }

                    pendingSubs.current = [];

                    if (hbInterval.current) clearInterval(hbInterval.current);
                    hbInterval.current = setInterval(() => {
                        if (ws.current?.readyState === WebSocket.OPEN) {
                            ws.current.send(
                                JSON.stringify({
                                    Type: 'Info',
                                    Data: { InfoType: 'HB', InfoMsg: 'Heartbeat' },
                                })
                            );
                        }
                    }, 10000);

                    if (Type === 'Login') return;
                }

                // Buffer Depth & Index Data
                if ((Type === 'Depth' || Type === 'DepthData' || Type === 'IndexData') && Data) {
                    const packets = Array.isArray(Data) ? Data : [Data];
                    packets.forEach((packet) => {
                        let token = packet.Tkn || packet.Token;
                        if (!token && Type === 'IndexData' && packet.Symbol) {
                            const sym = packet.Symbol.toUpperCase();
                            if (sym === 'NIFTY50' || sym === 'NIFTY 50') token = '26000';
                            if (sym === 'NIFTYBANK' || sym === 'BANKNIFTY') token = '26009';
                            if (sym === 'SENSEX') token = '1';
                        }
                        if (token) {
                            const tknStr = String(token);
                            lastPacketTimes.current.set(tknStr, Date.now());
                            depthBuffer.current[tknStr] = {
                                ...packet,
                                _type: Type,
                                _receivedAt: Date.now(),
                            };
                            if ((Type === 'Depth' || Type === 'DepthData') && onDepthPacketRef.current) {
                                onDepthPacketRef.current(packet);
                            }
                            packetRates.current[tknStr] = (packetRates.current[tknStr] || 0) + 1;
                        }
                    });
                    return;
                }

                // Telemetry
                if (Date.now() - lastTelemetry.current > 5000) {
                    const stats = packetRates.current;
                    const total = Object.values(stats).reduce((a, b) => a + b, 0);
                    if (total > 0) {
                        console.log('[WS-Bot] 5s Traffic Report:', JSON.stringify(stats));
                    }
                    packetRates.current = {};
                    lastTelemetry.current = Date.now();
                }

                const ignoredTypes = ['Touchline', 'Quote'];
                if (ignoredTypes.includes(Type)) return;

                if (onMessageRef.current) onMessageRef.current(Type, Data);
            } catch (err) {
                console.error('WS-Bot Message Error:', err);
            }
        };

        ws.current.onclose = (event) => {
            console.warn(`[WS-Bot] Closed: ${event.code} - ${event.reason || 'None'}`);
            setStatus('disconnected');
            isLoggedIn.current = false;
            isReady.current = false;

            if (hbInterval.current) clearInterval(hbInterval.current);
            if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
            if (handshakeTimeout.current) clearTimeout(handshakeTimeout.current);

            if (enabledRef.current) {
                reconnectTimeout.current = setTimeout(connect, 5000);
            }
        };

        ws.current.onerror = () => setStatus('error');
    }, []);

    // Watchdog Interval
    useEffect(() => {
        if (!enabled) return;
        const interval = setInterval(() => {
            if (ws.current?.readyState !== WebSocket.OPEN) return;
            if (activeSubscriptions.current.size === 0) return;
            const now = Date.now();
            const staleQuotes = [];
            activeSubscriptions.current.forEach((quote, tkn) => {
                const lastTime = lastPacketTimes.current.get(String(tkn)) || 0;
                if (now - lastTime > 30000) {
                    staleQuotes.push(quote);
                    lastPacketTimes.current.set(String(tkn), now);
                }
            });
            if (staleQuotes.length > 0 && isReady.current) {
                ws.current.send(
                    JSON.stringify({
                        Type: 'TokenRequest',
                        Data: { SubType: true, FeedType: 2, quotes: staleQuotes },
                    })
                );
            }
        }, 5000);
        return () => clearInterval(interval);
    }, [enabled]);

    // Subscribe Function
    const subscribe = useCallback((quotes, feedType = 2) => {
        quotes.forEach((q) => {
            const tknStr = String(q.Tkn);
            activeSubscriptions.current.set(tknStr, q);
            lastPacketTimes.current.set(tknStr, Date.now());
        });
        if (ws.current?.readyState === WebSocket.OPEN && isReady.current) {
            ws.current.send(
                JSON.stringify({
                    Type: 'TokenRequest',
                    Data: { SubType: true, FeedType: feedType, quotes },
                })
            );
        } else {
            pendingSubs.current.push(quotes);
        }
    }, []);

    // Data Sync Loop
    useEffect(() => {
        if (!enabled) return;
        syncInterval.current = setInterval(() => {
            if (Object.keys(depthBuffer.current).length > 0) {
                const snapshot = { ...depthBuffer.current };
                depthBuffer.current = {};
                setDepthData((prev) => ({ ...prev, ...snapshot }));
            }
        }, 50);
        return () => clearInterval(syncInterval.current);
    }, [enabled]);

    // Init Effect
    useEffect(() => {
        if (enabled) {
            connect();
        } else {
            if (ws.current) {
                ws.current.close();
                ws.current = null;
            }
            if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
            setStatus('disconnected');
        }
        return () => {
            if (ws.current) ws.current.close();
            if (hbInterval.current) clearInterval(hbInterval.current);
            if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
            if (syncInterval.current) clearInterval(syncInterval.current);
            if (handshakeTimeout.current) clearTimeout(handshakeTimeout.current);
        };
    }, [enabled, connect]);

    return { status, depthData, subscribe };
};
