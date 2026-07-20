const UPDATE_INTERVAL = 30000; 
let maxReportedDistKm = 0;
let maxReportedDistMi = 0;
let modeTracker = {};

const statusDisplay = document.getElementById('monitor-status');
const spotsDisplay = document.getElementById('total-spots');
const distanceDisplay = document.getElementById('max-distance');
const modeDisplay = document.getElementById('top-mode');
const tableContainer = document.getElementById('data-table-body');

function gridToLatLon(grid) {
    if (!grid || grid.length < 4) return { lat: 0, lon: 0 };
    const cleanGrid = grid.toUpperCase();
    const lonField = cleanGrid.charCodeAt(0) - 65;
    const latField = cleanGrid.charCodeAt(1) - 65;
    const lonSquare = parseInt(cleanGrid.charAt(2));
    const latSquare = parseInt(cleanGrid.charAt(3));
    
    const lon = (lonField * 20) - 180 + (lonSquare * 2) + 1;
    const lat = (latField * 10) - 90 + latSquare + 0.5;
    return { lat: lat, lon: lon };
}

function calculateDistance(grid1, grid2) {
    if (!grid1 || !grid2) return { km: 0, mi: 0 };
    const coord1 = gridToLatLon(grid1);
    const coord2 = gridToLatLon(grid2);
    const R_km = 6371;
    const R_mi = 3959;
    const dLat = (coord2.lat - coord1.lat) * Math.PI / 180;
    const dLon = (coord2.lon - coord1.lon) * Math.PI / 180;
    const lat1Rad = coord1.lat * Math.PI / 180;
    const lat2Rad = coord2.lat * Math.PI / 180;
    
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + 
              Math.sin(dLon/2) * Math.sin(dLon/2) * Math.cos(lat1Rad) * Math.cos(lat2Rad);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return { km: Math.round(R_km * c), mi: Math.round(R_mi * c) };
}

function getDistanceClass(miles) {
    if (miles <= 200) return 'dist-short';
    if (miles <= 500) return 'dist-medium';
    if (miles <= 1200) return 'dist-long';
    return 'dist-extreme'; 
}

function processAndRenderSpots(spots) {
    if (!spots || spots.length === 0) {
        tableContainer.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">Monitoring 2m spectrum... No active openings logged in the last 30 minutes.</td></tr>`;
        spotsDisplay.innerText = "0";
        statusDisplay.innerText = "ONLINE";
        statusDisplay.className = "status-badge status-online";
        return;
    }

    let htmlRows = "";
    let validSpotsCount = 0;

    spots.slice(0, 25).forEach(spot => {
        // Safe parameter extractor mapping to standard raw cluster logs natively
        const txCall = spot.spotter || spot.de || 'Unknown';
        const rxCall = spot.dx || spot.call || 'Unknown';
        const txGrid = spot.spotter_grid || spot.de_grid || '';
        const rxGrid = spot.dx_grid || spot.my_grid || '';
        
        if (!txGrid || !rxGrid) return;

        const freq = spot.frequency || spot.freq ? parseFloat(spot.frequency || spot.freq).toFixed(4) : '144.1740';
        const mode = spot.mode || (freq.includes('174') ? 'FT8' : 'VHF');
        const snr = spot.db || spot.snr ? `${spot.db || spot.snr} dB` : 'Log';
        
        let displayTime = "Recent";
        if (spot.time) displayTime = spot.time.toString().slice(0, 5);

        const dist = calculateDistance(txGrid, rxGrid);
        const colorClass = getDistanceClass(dist.mi);

        if (dist.km > maxReportedDistKm && dist.km < 20000) {
            maxReportedDistKm = dist.km;
            maxReportedDistMi = dist.mi;
        }

        modeTracker[mode] = (modeTracker[mode] || 0) + 1;
        validSpotsCount++;

        htmlRows += `
            <tr>
                <td>${displayTime} UTC</td>
                <td><strong>${txCall}</strong></td>
                <td>${rxCall}</td>
                <td><span class="badge">${txGrid}</span> → <span class="badge">${rxGrid}</span></td>
                <td>${freq} MHz</td>
                <td>
                    <span class="${colorClass}">${dist.mi} mi</span> 
                    <span style="color: #71717a; font-size: 0.8rem;">(${dist.km} km)</span>
                </td>
                <td style="color: #10b981;">${snr} (${mode.toUpperCase()})</td>
            </tr>
        `;
    });

    if (validSpotsCount === 0) {
        tableContainer.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">Waiting for active 2m grid data locators...</td></tr>`;
        return;
    }

    const primaryMode = Object.keys(modeTracker).length > 0 
        ? Object.keys(modeTracker).reduce((x, y) => modeTracker[x] > modeTracker[y] ? x : y).toUpperCase()
        : 'VHF';

    tableContainer.innerHTML = htmlRows;
    spotsDisplay.innerText = validSpotsCount;
    distanceDisplay.innerText = maxReportedDistKm > 0 ? `${maxReportedDistMi} mi / ${maxReportedDistKm} km` : 'Calculating...';
    modeDisplay.innerText = primaryMode;
    
    statusDisplay.innerText = "ONLINE";
    statusDisplay.className = "status-badge status-online";
}

async function fetchRealSpots() {
    statusDisplay.innerText = "UPDATING";
    statusDisplay.className = "status-badge status-updating";
    
    try {
        // Direct download from an open data mirror that natively permits browser cross-origin requests
        const response = await fetch('https://githubusercontent.com');
        if (!response.ok) throw new Error(`HTTP Error Status: ${response.status}`);
        
        const spots = await response.json();
        processAndRenderSpots(spots);
    } catch (error) {
        console.error("Propagation feed connection error:", error);
        statusDisplay.innerText = "CONN ERROR";
        statusDisplay.className = "status-badge status-error";
    }
}

fetchRealSpots();
setInterval(fetchRealSpots, UPDATE_INTERVAL);
