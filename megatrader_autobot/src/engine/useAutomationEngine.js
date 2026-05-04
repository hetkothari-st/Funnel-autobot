import { useEffect, useRef } from 'react';
import { megaTraderAPI } from '../utils/megaTraderAPI';

/**
 * useAutomationEngine - Runs the automated order execution loop.
 */
export const useAutomationEngine = ({
    isAutomationEnabled,
    depthData,
    monitoredTokens,
    positions,
    autoOrderThreshold,
    autoOrderSlicePercentage,
    triggerPriceValue,
    sellVolThreshold,
    sellMaxSLPts,
    allowNonZeroDecimals,
    onLogEvent,
    status
}) => {
    const latestDepthData = useRef(depthData);
    const priceLevels = useRef({});
    const lastProcessedTimes = useRef({});
    const engineStartTime = useRef(0);

    // Settings refs
    const settingsRef = useRef({});
    settingsRef.current = {
        autoOrderThreshold,
        autoOrderSlicePercentage,
        triggerPriceValue,
        sellVolThreshold,
        sellMaxSLPts,
        allowNonZeroDecimals,
        positions
    };

    const onLogEventRef = useRef(onLogEvent);
    onLogEventRef.current = onLogEvent;

    const statusRef = useRef(status);
    statusRef.current = status;

    useEffect(() => {
        latestDepthData.current = depthData;
    }, [depthData]);

    useEffect(() => {
        if (isAutomationEnabled) {
            engineStartTime.current = Date.now();
        }
    }, [isAutomationEnabled]);

    useEffect(() => {
        if (monitoredTokens.length === 0 && (!positions || Object.keys(positions).length === 0)) return;

        const pollInterval = setInterval(() => {
            if (!isAutomationEnabled) return;

            const st = statusRef.current;
            if (st?.toLowerCase() !== 'connected') return;

            const WARMUP_MS = 2000;
            if (Date.now() - engineStartTime.current < WARMUP_MS) return;

            const {
                autoOrderThreshold,
                autoOrderSlicePercentage,
                triggerPriceValue,
                sellVolThreshold,
                sellMaxSLPts,
                allowNonZeroDecimals: currentAllowNonZeroDecimals,
                positions: currentPositions
            } = settingsRef.current;

            const currentData = latestDepthData.current;

            // ---- PART A: Global Liquidation Logic (Positions) ----
            Object.entries(currentPositions || {}).forEach(([posKey, posData]) => {
                if (!posData || posData.qty === 0) return;

                const tkn = posData.tkn || posKey.split('_')[0];
                const depth = currentData[tkn] || currentData[Number(tkn)];
                if (!depth) return;

                const qty = posData.qty;
                const oppSide = qty > 0 ? 'bid' : 'ask';
                const depths = depth.depths || [];
                const bestOppDepth = depths.find(d => (oppSide === 'bid' ? d.BQ : d.SQ) > 0);

                if (bestOppDepth) {
                    const obsOppQty = oppSide === 'bid' ? bestOppDepth.BQ : bestOppDepth.SQ;
                    const exitPrice = parseFloat(oppSide === 'bid' ? bestOppDepth.BP : bestOppDepth.SP);
                    const cooldowKey = `exit_${posKey}`;

                    if (!priceLevels.current[cooldowKey]) {
                        priceLevels.current[cooldowKey] = { lastOrderTime: 0 };
                    }
                    const exitState = priceLevels.current[cooldowKey];
                    if (Date.now() - exitState.lastOrderTime < 5000) return;

                    // Find settings for this monitor
                    const mToken = monitoredTokens.find(t => t.monitorId === posData.monitorId);
                    const mVolThreshold = mToken?.sellVolThreshold !== undefined ? mToken.sellVolThreshold : sellVolThreshold;
                    const mMaxSLPts = mToken?.sellMaxSLPts !== undefined ? mToken.sellMaxSLPts : sellMaxSLPts;

                    // 1. Volume-Based Liquidation
                    if (mVolThreshold > 0 && obsOppQty >= mVolThreshold) {
                        // --- NO-LOSS CLAUSE ---
                        // For longs (qty > 0): We're selling — don't sell below avg buy price.
                        // For shorts (qty < 0): We're buying back — don't buy above avg sell price.
                        if (posData.avgPrice > 0) {
                            const isLossTrade = qty > 0
                                ? exitPrice < posData.avgPrice   // Long: selling cheaper than bought = loss
                                : exitPrice > posData.avgPrice;  // Short: buying back dearer than sold = loss

                            if (isLossTrade) {
                                console.log(`[Autobot] NO-LOSS CLAUSE: Skipping vol-liquidation for ${posData.symbol} | Exit:${exitPrice} vs Avg:${posData.avgPrice.toFixed(2)} | would be a LOSS`);
                                return;
                            }
                        }
                        (async () => {
                            try {
                                exitState.lastOrderTime = Date.now();
                                console.log(`[Autobot] LIQUIDATING | Vol:${obsOppQty} >= Thr:${mVolThreshold} | Exit ${posData.symbol}`);

                                const details = {
                                    index: posData.symbol.split(' ')[0],
                                    strike: posData.strike,
                                    type: posData.type,
                                    side: qty > 0 ? 'sell' : 'buy',
                                    observedQty: obsOppQty,
                                    price: exitPrice,
                                    time: new Date().toLocaleTimeString(),
                                    timestamp: Date.now(),
                                    tokenId: `exit_${posKey}`,
                                    tkn: tkn,
                                    executionQty: Math.abs(qty),
                                    triggerPrice: 0,
                                    monitorId: posData.monitorId
                                };

                                const result = await megaTraderAPI.triggerOrder(details);
                                if (onLogEventRef.current) {
                                    const success = result && result.Error === null;
                                    onLogEventRef.current(
                                        `[VOL SELL] ${success ? 'Executed' : 'Failed'} for ${posData.symbol} | Qty: ${Math.abs(qty)}@${exitPrice}`,
                                        success ? 'success' : 'error',
                                        {
                                            token: posData.symbol,
                                            side: details.side.toUpperCase(),
                                            qty: Math.abs(qty),
                                            price: exitPrice,
                                            status: success ? 'LIQUIDATED' : 'FAILED',
                                            intOrdNo: result?.IntOrdNo || null,
                                            tkn: tkn,
                                            monitorId: posData.monitorId
                                        }
                                    );
                                }
                            } catch (e) {
                                console.error('[Autobot] Exit error:', e);
                            }
                        })();
                    }

                    // 2. Stop Loss (pts)
                    if (mMaxSLPts > 0) {
                        const pnlPts = qty > 0 ? exitPrice - posData.avgPrice : posData.avgPrice - exitPrice;
                        if (pnlPts <= -mMaxSLPts) {
                            (async () => {
                                try {
                                    exitState.lastOrderTime = Date.now();
                                    console.log(`[Autobot] SL HIT | Pnl:${pnlPts.toFixed(2)} <= -${mMaxSLPts} | Exit ${posData.symbol}`);
                                    const details = {
                                        index: posData.symbol.split(' ')[0], strike: posData.strike, type: posData.type,
                                        side: qty > 0 ? 'sell' : 'buy', observedQty: obsOppQty, price: exitPrice,
                                        time: new Date().toLocaleTimeString(), timestamp: Date.now(), tkn: tkn,
                                        executionQty: Math.abs(qty), triggerPrice: 0,
                                        monitorId: posData.monitorId
                                    };
                                    const result = await megaTraderAPI.triggerOrder(details);
                                    if (onLogEventRef.current) {
                                        const success = result && result.Error === null;
                                        onLogEventRef.current(`[SL SELL] ${success ? 'Executed' : 'Failed'} for ${posData.symbol} | Pnl:${pnlPts.toFixed(2)}`, success ? 'error' : 'error', {
                                            token: posData.symbol,
                                            side: details.side.toUpperCase(),
                                            qty: Math.abs(qty),
                                            price: exitPrice,
                                            status: success ? 'LIQUIDATED' : 'FAILED',
                                            intOrdNo: result?.IntOrdNo || null,
                                            tkn: tkn,
                                            monitorId: posData.monitorId
                                        });
                                    }
                                } catch (e) { }
                            })();
                        }
                    }
                }
            });

            // ---- PART B: Automated Entry Logic (Monitored Tokens) ----
            monitoredTokens.forEach(item => {
                if (!item.tkn) return; // Ignore dummy base-settings tokens
                const tkn = item.tkn;
                const depth = currentData[tkn] || currentData[Number(tkn)];
                if (!depth) return;

                const lastTime = lastProcessedTimes.current[item.id] || 0;
                const pktTime = depth._receivedAt || 0;
                if (pktTime <= lastTime) return;
                lastProcessedTimes.current[item.id] = pktTime;

                const sides = item.side === 'both' ? ['buy', 'sell'] : [item.side];

                sides.forEach(side => {
                    const internalSide = side === 'buy' ? 'bid' : 'ask';
                    const depths = depth.depths || [];
                    const qualifyingDepths = depths.filter(d => (internalSide === 'bid' ? d.BQ : d.SQ) > 0);

                    qualifyingDepths.forEach(matchingDepth => {
                        (async () => {
                            try {
                                const observedQty = Number(internalSide === 'bid' ? matchingDepth.BQ : matchingDepth.SQ);
                                const price = internalSide === 'bid' ? matchingDepth.BP : matchingDepth.SP;
                                const priceVal = parseFloat(price);
                                const now = Date.now();

                                // Strict .00 mode: skip prices with non-zero decimal part
                                if (!currentAllowNonZeroDecimals && Math.round(priceVal * 100) % 100 !== 0) return;

                                const autoLevelKey = `${item.id}_${side}_auto`;
                                if (!priceLevels.current[autoLevelKey]) {
                                    priceLevels.current[autoLevelKey] = { lastOrderTime: 0 };
                                }
                                const autoState = priceLevels.current[autoLevelKey];
                                const autoTimeDiff = Date.now() - autoState.lastOrderTime;

                                if (autoTimeDiff <= 5000) return;

                                // 40s per-price cooldown — prevent duplicate orders at same price level
                                const priceCooldownKey = `${item.id}_${side}_p${priceVal}`;
                                if (Date.now() - (priceLevels.current[priceCooldownKey] || 0) < 40000) return;

                                // CORE TRIGGER CONDITION: Meets single threshold
                                const tokenThreshold = item.autoOrderThreshold || autoOrderThreshold;

                                if (observedQty >= tokenThreshold) {
                                    let lotBase = 65; // Default Nifty
                                    if (item.index === 'SENSEX' || item.index === 'BSX') lotBase = 20;
                                    if (item.index === 'BANKNIFTY') lotBase = 15;
                                    if (item.index === 'FINNIFTY') lotBase = 40;

                                    // --- POSITION CHECKS ---
                                const ePosKey = (item.monitorId !== null && item.monitorId !== undefined)
                                    ? `${item.tkn}_${item.monitorId}` : item.tkn;
                                const existingPos = (settingsRef.current.positions || {})[ePosKey];

                                // Block direct short selling — only sell what is already bought
                                if (side === 'sell' && (!existingPos || existingPos.qty <= 0)) {
                                    console.log(`[Autobot] SHORT SELL BLOCKED: No long position in ${item.index} ${item.strike} ${item.type}`);
                                    return;
                                }

                                // NO-LOSS CLAUSE: don't add to a losing position
                                if (existingPos && existingPos.qty !== 0 && existingPos.avgPrice > 0) {
                                    const addingToLoss =
                                        (side === 'buy'  && existingPos.qty > 0 && priceVal > existingPos.avgPrice) ||
                                        (side === 'sell' && existingPos.qty < 0 && priceVal < existingPos.avgPrice);
                                    if (addingToLoss) {
                                        console.log(`[Autobot] NO-LOSS CLAUSE: Skipping ${side.toUpperCase()} entry for ${item.index} ${item.strike} ${item.type} | Price:${priceVal} vs Avg:${existingPos.avgPrice.toFixed(2)}`);
                                        return;
                                    }
                                }

                                // Use lot size directly — no percentage calculation
                                    let actualExecutionQty;
                                    if (item.autoOrderExecutionQty) {
                                        actualExecutionQty = Number(item.autoOrderExecutionQty);
                                    } else {
                                        // autoOrderSlicePercentage is now a direct lot size value
                                        actualExecutionQty = Number(item.slicePercentage || autoOrderSlicePercentage || 65);
                                    }

                                    const crossHardLimit = observedQty >= 100000;
                                    let executionPrice = priceVal;
                                    if (crossHardLimit) {
                                        executionPrice = side === 'buy'
                                            ? parseFloat((priceVal + 0.20).toFixed(2))
                                            : parseFloat((priceVal - 0.20).toFixed(2));
                                    }

                                    autoState.lastOrderTime = Date.now();
                                    priceLevels.current[priceCooldownKey] = Date.now();
                                    console.log(`[Autobot] Firing | Observed:${observedQty} >= Threshold:${tokenThreshold} | Qty:${actualExecutionQty} Price:${executionPrice}`);

                                    const tokenTriggerValue = item.triggerPriceValue !== undefined ? item.triggerPriceValue : triggerPriceValue;

                                    const details = {
                                        index: item.index, strike: item.strike, type: item.type,
                                        side, observedQty, price: executionPrice,
                                        time: new Date().toLocaleTimeString(),
                                        timestamp: now, tokenId: item.id, tkn: item.tkn,
                                        executionQty: actualExecutionQty,
                                        triggerPrice: tokenTriggerValue > 0
                                            ? Number((side === 'buy' ? priceVal - tokenTriggerValue : priceVal + tokenTriggerValue).toFixed(2))
                                            : 0,
                                        monitorId: item.monitorId
                                    };

                                    const result = await megaTraderAPI.triggerOrder(details);
                                    if (onLogEventRef.current) {
                                        const finalStatus = result && result.Error === null
                                            ? (crossHardLimit ? '1 LAC EXEC' : 'INSTANT EXEC')
                                            : 'FAILED';
                                        const errorMsg = result && result.Error ? ` | Error: ${result.Error}` : '';
                                        onLogEventRef.current(
                                            `Order ${finalStatus === 'FAILED' ? 'FAILED' : 'Executed'} for ${item.index} ${item.strike} ${item.type} | Qty: ${actualExecutionQty}@${executionPrice}${errorMsg}`,
                                            finalStatus === 'FAILED' ? 'error' : 'success',
                                            {
                                                token: `${item.index} ${item.strike} ${item.type}`,
                                                side: side.toUpperCase(),
                                                qty: actualExecutionQty,
                                                price: executionPrice,
                                                status: finalStatus,
                                                intOrdNo: result?.IntOrdNo || null,
                                                tkn: item.tkn,
                                                tokenId: item.id,
                                                monitorId: item.monitorId
                                            }
                                        );
                                    }
                                }
                            } catch (err) {
                                console.error('[Autobot] Unhandled error in depth processing:', err);
                            }
                        })();
                    });
                });
            });
        }, 100);

        return () => {
            clearInterval(pollInterval);
            priceLevels.current = {};
        };
    }, [monitoredTokens, isAutomationEnabled, positions]); // restart if positions list changes

    return {};
};
