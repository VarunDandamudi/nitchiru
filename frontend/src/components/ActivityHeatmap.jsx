import React, { useState, useEffect, useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
// import api from '../services/api'; // Temporarily commented out for Phase 2

const ActivityHeatmap = ({ userId }) => {
    const [year, setYear] = useState(new Date().getFullYear());
    const [apiData, setApiData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [isLoggedIn, setIsLoggedIn] = useState(false);

    // We assume data exists for recent years
    const yearsWithData = [2026, 2025, 2024, 2023, 2022];

    // Data Fetching
    useEffect(() => {
        const fetchActivity = async () => {
            setLoading(true);
            try {
                const token = localStorage.getItem('token');
                setIsLoggedIn(!!token);

                // Even if not logged in, we might want to fetch public data if API allows, 
                // but currently API requires token. Assuming this component might be used in a context 
                // where public view is allowed or we just handle the view state.
                // If API strictly requires token, then non-logged-in users just see empty grid (which is fine).

                const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

                // If we want to support public view of heatmap, backend needs to allow public access.
                // Assuming for now we just want the UI change even if data is empty or public.

                if (token) {
                    const res = await fetch(`/api/users/activity?year=${year}`, {
                        headers: headers
                    });

                    if (res.ok) {
                        const json = await res.json();
                        setApiData(json);
                    } else {
                        console.error("Failed to fetch activity heatmap data");
                    }
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        if (userId) fetchActivity();
    }, [userId, year]);

    // Grid Generation Logics: Month-Centric Linear List
    const { renderItems, monthLabels } = useMemo(() => {
        try {
            const CELL_SIZE = 12; // px
            const GAP = 3; // px 
            const SPACER_WIDTH = 14;

            // Helper: Format YYYY-MM-DD
            const formatDate = (date) => date.toISOString().split('T')[0];

            // 1. Prepare Data Map (Bloom Score centric)
            const daysMap = new Map();
            if (apiData && apiData.days) {
                apiData.days.forEach(d => {
                    // Use 'bloom' (Total Score) if available, otherwise fallback to count for legacy consistency
                    const val = d.bloom !== undefined ? d.bloom : d.count;
                    daysMap.set(d.date, val);
                });
            }

            const items = [];
            const labelPositions = [];
            let currentPx = 0;

            // 2. Iterate Months 0..11
            for (let m = 0; m < 12; m++) {
                const monthStart = new Date(Date.UTC(year, m, 1));
                const monthEnd = new Date(Date.UTC(year, m + 1, 0)); // Last day of month

                // Track start pixel for this month's label
                const monthLabelStartPx = currentPx;

                // 2a. Find Start of First Week (Monday)
                let current = new Date(monthStart);
                let dayOfWeek = current.getUTCDay(); // 0(Sun)..6(Sat)
                let mondayOffset = (dayOfWeek + 6) % 7;
                current.setUTCDate(current.getUTCDate() - mondayOffset); // Shift to Monday

                while (current <= monthEnd) {
                    const week = [];
                    let hasDataForMonth = false;

                    for (let d = 0; d < 7; d++) {
                        const dateStr = formatDate(current);
                        const isCurrentMonth = current.getUTCMonth() === m && current.getUTCFullYear() === year;

                        let score = null;
                        if (isCurrentMonth) {
                            score = daysMap.has(dateStr) ? daysMap.get(dateStr) : 0;
                            hasDataForMonth = true;
                        }

                        week.push({
                            date: dateStr,
                            count: score, // This is now bloom score
                            inMonth: isCurrentMonth
                        });
                        current.setUTCDate(current.getUTCDate() + 1);
                    }

                    items.push({
                        type: 'week',
                        days: week,
                        width: CELL_SIZE
                    });
                    currentPx += CELL_SIZE + GAP;
                }

                // 2c. Add Label
                labelPositions.push({
                    name: monthStart.toLocaleString('default', { month: 'short', timeZone: 'UTC' }),
                    left: monthLabelStartPx
                });

                // 2d. Add Spacer if not Dec
                if (m < 11) {
                    items.push({ type: 'spacer', width: SPACER_WIDTH });
                    currentPx += SPACER_WIDTH + GAP;
                }
            }

            return { renderItems: items, monthLabels: labelPositions };

        } catch (error) {
            console.error("Critical Error generating heatmap grid:", error);
            return { renderItems: [], monthLabels: [] };
        }
    }, [year, apiData]);

    // Colors - Based on Total Bloom Points
    // Scale: 1-6 (Single Basic), 7-20 (Few Basic / One Good), 20-50 (Strong), 50+ (Expert Day)
    const getCellColor = (score) => {
        if (score === null) return 'transparent';
        // Conditional empty color based on login status
        if (score === 0) return isLoggedIn ? '#2B3445' : '#1A2233';

        if (score <= 5) return '#0e4429';        // Level 1
        if (score <= 15) return '#006d32';       // Level 2
        if (score <= 30) return '#26a641';       // Level 3
        return '#39d353';                        // Level 4 (30+ points)
    };

    return (
        <div className="glass-panel p-6 rounded-2xl w-full relative z-10">
            <div className="flex justify-between items-center mb-4 relative z-10">
                <h3 className={`text-lg font-bold ${isLoggedIn ? 'text-text-light dark:text-text-dark' : 'text-text-muted-light dark:text-text-muted-dark'}`}>
                    {apiData ? `${apiData.totalBloom !== undefined ? apiData.totalBloom : (apiData.total || 0)} Bloom Points in ${year}` : `Activity in ${year}`}
                </h3>
                <div className="relative">
                    <select
                        value={year}
                        onChange={(e) => {
                            setApiData(null);
                            setYear(parseInt(e.target.value));
                        }}
                        className="appearance-none bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg px-4 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                    >
                        {yearsWithData.map(y => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none opacity-50" />
                </div>
            </div>

            {/* Scroll Container (Shared for labels and grid) */}
            <div className="overflow-x-auto pb-2 custom-scrollbar relative z-10">
                <div key={year} className="min-w-max relative">
                    {/* Month Labels */}
                    <div className="h-6 w-full relative">
                        {monthLabels.map((lbl) => (
                            <div
                                key={lbl.name}
                                className="absolute top-0 text-xs text-text-muted-light dark:text-text-muted-dark font-medium"
                                style={{ left: `${lbl.left}px` }}
                            >
                                {lbl.name}
                            </div>
                        ))}
                    </div>

                    {/* Grid Container */}
                    <div className="flex gap-[3px]" style={{ height: '110px' }}>
                        {renderItems.map((item, i) => {
                            if (item.type === 'spacer') {
                                return <div key={`spacer-${i}`} style={{ width: `${item.width}px`, flexShrink: 0 }} />;
                            }
                            // Week Column
                            return (
                                <div key={`week-${i}`} className="flex flex-col gap-[3px]" style={{ width: `${item.width}px` }}>
                                    {item.days.map((day, dIndex) => (
                                        <div
                                            key={`${i}-${dIndex}`}
                                            style={{
                                                width: '12px',
                                                height: '12px',
                                                borderRadius: '2px',
                                                backgroundColor: getCellColor(day.count),
                                            }}
                                            title={day.inMonth ? `${day.count} bloom points on ${day.date}` : ''}
                                        />
                                    ))}
                                </div>
                            );
                        })}
                    </div>

                    {/* Legend */}
                    <div className="flex items-center gap-2 mt-4 text-xs text-text-muted-light dark:text-text-muted-dark">
                        <span>Less</span>
                        <div className="flex gap-1">
                            <div style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: getCellColor(0) }}></div>
                            <div style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: getCellColor(3) }}></div>
                            <div style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: getCellColor(10) }}></div>
                            <div style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: getCellColor(25) }}></div>
                            <div style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: getCellColor(50) }}></div>
                        </div>
                        <span>More</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ActivityHeatmap;
