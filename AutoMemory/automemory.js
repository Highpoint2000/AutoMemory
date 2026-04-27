////////////////////////////////////////////////////////////
///                                                      ///
///  AUTOMEMORY SCRIPT FOR FM-DX-WEBSERVER      (V1.0)   ///
///                                                      /// 
///                                                      ///
///  by Highpoint                last update: 27.04.25   ///
///                                                      ///
///  https://github.com/Highpoint2000/RetroDesign        ///
///                                                      ///
////////////////////////////////////////////////////////////

(function() {
    "use strict";

    // --- Plugin Metadata & Update Configuration ---
    var pluginVersion     = "0.9";
    var pluginName        = "AutoMemory";
    var pluginHomepageUrl = "https://github.com/Highpoint2000/AutoMemory/releases";
    var pluginUpdateUrl   = "https://raw.githubusercontent.com/Highpoint2000/AutoMemory/refs/heads/main/AutoMemory/automemory.js";
    var CHECK_FOR_UPDATES = true;

    // --- Update Logic ---
    function _checkUpdate() {
        fetch(pluginUpdateUrl + "?t=" + Date.now(), { cache: "no-store" })
            .then(function (r) { return r.ok ? r.text() : null; })
            .then(function (txt) {
                if (!txt) return;
                var m = txt.match(/var\s+pluginVersion\s*=\s*["']([^"']+)["']/);
                if (!m) return;
                var remote = m[1];
                if (remote === pluginVersion) return;
                console.log("[" + pluginName + "] Update available: " + pluginVersion + " → " + remote);

                var settings = document.getElementById("plugin-settings");
                if (settings && settings.innerHTML.indexOf(pluginHomepageUrl) === -1) {
                    if (settings.textContent.trim() === "No plugin settings are available.") settings.textContent = "";
                    settings.innerHTML +=
                        "<br><a href='" + pluginHomepageUrl + "' target='_blank'>[" +
                        pluginName + "] Update: " + pluginVersion + " → " + remote + "</a>";
                }

                var icon = document.querySelector(".fa-puzzle-piece")?.parentElement;
                if (icon && !icon.querySelector("." + pluginName + "-update-dot")) {
                    var dot = document.createElement("span");
                    dot.className = pluginName + "-update-dot";
                    dot.style.cssText = "display:block;width:12px;height:12px;border-radius:50%;background-color:#FE0830;position:absolute;right:0;top:0;";
                    icon.appendChild(dot);
                }
            })
            .catch(function (e) { console.warn("[" + pluginName + "] Update check failed:", e); });
    }
    if (CHECK_FOR_UPDATES) _checkUpdate();

    // --- Configuration ---
    const serverpath = 'https://tef.noobish.eu/logos/';
    const defaultServerPath = serverpath + 'default-logo.png';
    const CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; 
    let sessionRemoteDirCache = {};

    // --- Database & State ---
    let stationGalleryDB = {};
    let editMode = false;
    let isGalleryHidden = localStorage.getItem('station_gallery_hidden') === 'true';
    let currentTunedFreq = null; 
    let dragState = { active: false, clone: null, orig: null, offsetX: 0, offsetY: 0 };

    window._hoveredGalleryPi = null;

    // --- 1. Database Load & Save Logic ---
    function loadDB() {
        const savedDB = localStorage.getItem('station_gallery_db');
        if (savedDB) {
            try {
                stationGalleryDB = JSON.parse(savedDB);
                for (let pi in stationGalleryDB) {
                    stationGalleryDB[pi].timerId = null;
                    stationGalleryDB[pi].fading = false; 
                }
            } catch (e) { stationGalleryDB = {}; }
        }
    }

    function saveDB() {
        const dbToSave = {};
        for (let pi in stationGalleryDB) {
            dbToSave[pi] = Object.assign({}, stationGalleryDB[pi]);
            delete dbToSave[pi].timerId;
        }
        localStorage.setItem('station_gallery_db', JSON.stringify(dbToSave));
    }

    // --- 2. UI Setup & Settings Integration ---
    function initGalleryUI() {
        if (document.getElementById("station-gallery-outer")) return;

        const mainWrapper = document.getElementById("wrapper") || document.querySelector('.canvas-container.hide-phone')?.parentElement;
        if (!mainWrapper) {
            setTimeout(initGalleryUI, 500);
            return;
        }

        // Apply size globally so dragging clones don't lose the variable scope
        let savedHeight = parseFloat(localStorage.getItem('station_gallery_logo_height')) || 28;
        document.documentElement.style.setProperty('--gallery-logo-height', savedHeight + 'px');

        const galleryHtml = `
        <div class="flex-container" id="station-gallery-outer" style="margin-top: 0px; margin-bottom: 20px; display: ${isGalleryHidden ? 'none' : 'flex'};">
            <div id="station-gallery-wrapper" class="panel-100" style="
                position: relative;
                padding: 10px 15px 0 15px; 
                box-sizing: border-box; 
                user-select: none;
                -webkit-touch-callout: none;
                touch-action: pan-y; 
            ">
                <div id="delete-all-btn" class="delete-all-btn" title="Delete all stored stations">✖</div>

                <div id="station-gallery-scroll" style="
                    display: flex; 
                    flex-wrap: wrap; 
                    align-items: center;
                    min-height: calc(var(--gallery-logo-height) + 25px); 
                    padding: 5px 0 0 0; 
                ">
                </div>
            </div>
        </div>
        <style>
            .gallery-item {
                position: relative; flex: 0 0 auto; display: flex; flex-direction: column; 
                align-items: center; justify-content: center;
                background: rgba(0, 0, 0, 0.15); border: 1px solid rgba(255, 255, 255, 0.10); 
                box-shadow: inset 0 2px 4px rgba(0,0,0,0.1); 
                padding: 5px 10px; border-radius: 8px;
                min-width: calc(var(--gallery-logo-height) + 20px);
                height: calc(var(--gallery-logo-height) + 15px); 
                box-sizing: border-box; margin: 0 12px 12px 0; 
                transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), background 0.2s ease, border-color 0.2s ease, filter 0.5s ease, opacity 0.5s ease;
                cursor: pointer;
                z-index: 1;
            }
            
            /* Ghost slot: maintains DOM position for lost/deleted stations but stays invisible */
            .gallery-item.hidden-memory {
                display: none !important;
            }

            /* Scale up the ENTIRE box on hover */
            .gallery-item:hover:not(.edit-mode):not(.drag-placeholder) {
                transform: scale(1.15); 
                background: rgba(255, 255, 255, 0.08); 
                border-color: rgba(255, 255, 255, 0.25);
                z-index: 10; 
            }

            .gallery-item.fading { background: rgba(0, 0, 0, 0.3) !important; border-color: rgba(255, 255, 255, 0.02) !important; }
            .gallery-item.fading img { filter: grayscale(100%); opacity: 0.35; }
            .gallery-item.fading .ps-text { color: #666; opacity: 0.6; }
            
            .gallery-item img { 
                height: var(--gallery-logo-height); width: auto; max-width: 120px; object-fit: contain; pointer-events: none; display: block; 
                transition: filter 0.5s ease, opacity 0.5s ease; 
            }
            .gallery-item img.is-default { height: calc(var(--gallery-logo-height) * 0.55); margin-bottom: 2px; opacity: 0.8; }
            
            .gallery-item .ps-text { font-size: calc(var(--gallery-logo-height) * 0.35); color: #eee; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80px; font-family: Arial, sans-serif; pointer-events: none; transition: color 0.5s ease, opacity 0.5s ease; }
            
            /* Individual Delete Button */
            .delete-btn { display: none; position: absolute; top: -6px; right: -6px; background: rgba(200, 50, 50, 0.95); color: #fff; border-radius: 50%; width: 18px; height: 18px; font-size: 10px; font-weight: bold; line-height: 16px; text-align: center; cursor: pointer; z-index: 100; box-shadow: 0 2px 4px rgba(0,0,0,0.6); border: 1px solid rgba(255, 255, 255, 0.3); }
            .delete-btn:hover { background: #f00; transform: scale(1.1); }
            .gallery-item.edit-mode .delete-btn { display: block; }
            
            /* Global Delete All Button */
            .delete-all-btn { display: none; position: absolute; top: 10px; right: 10px; background: rgba(200, 50, 50, 0.95); color: #fff; border-radius: 50%; width: 22px; height: 22px; font-size: 12px; font-weight: bold; line-height: 20px; text-align: center; cursor: pointer; z-index: 100; box-shadow: 0 2px 4px rgba(0,0,0,0.6); border: 1px solid rgba(255, 255, 255, 0.3); }
            .delete-all-btn:hover { background: #f00; transform: scale(1.1); }
            #station-gallery-wrapper.edit-mode .delete-all-btn { display: block; }

            /* Keyframes for standard wiggle */
            @keyframes wiggle { 
                0% { transform: rotate(0deg); } 
                25% { transform: rotate(-2deg); } 
                50% { transform: rotate(0deg); } 
                75% { transform: rotate(2deg); } 
                100% { transform: rotate(0deg); } 
            }

            /* Keyframes for hovered wiggle (incorporates scale to prevent override) */
            @keyframes wiggleHover { 
                0% { transform: scale(1.15) rotate(0deg); } 
                25% { transform: scale(1.15) rotate(-2deg); } 
                50% { transform: scale(1.15) rotate(0deg); } 
                75% { transform: scale(1.15) rotate(2deg); } 
                100% { transform: scale(1.15) rotate(0deg); } 
            }

            /* Edit Mode Base State */
            .gallery-item.edit-mode:not(.drag-placeholder) { 
                animation: wiggle 0.3s ease-in-out infinite; 
                background: rgba(255,255,255,0.08); 
                border-color: rgba(255,255,255,0.2); 
            }

            /* Edit Mode Hover State */
            .gallery-item.edit-mode:hover:not(.drag-placeholder) {
                animation: wiggleHover 0.3s ease-in-out infinite; 
                background: rgba(255, 255, 255, 0.08); 
                border-color: rgba(255, 255, 255, 0.25);
                z-index: 10;
            }

            .dragging-clone { 
                position: fixed !important; 
                z-index: 999999 !important; 
                pointer-events: none !important; 
                transform: scale(1.15) !important; 
                opacity: 0.95 !important; 
                background: rgba(10, 30, 45, 0.95) !important; 
                border: 1px solid rgba(255,255,255,0.3) !important; 
                box-shadow: 0 10px 25px rgba(0,0,0,0.6) !important; 
                margin: 0 !important; 
                animation: none !important; 
                transition: none; 
            }
            .drag-placeholder { 
                opacity: 0.2 !important; 
                border: 2px dashed rgba(255,255,255,0.4) !important; 
                background: transparent !important; 
                transform: scale(0.95) !important; 
                animation: none !important; 
            }
            .drag-placeholder > * { visibility: hidden !important; }
            
            #gallery-station-tooltip { 
                position: fixed; background: rgba(15, 25, 30, 0.95); color: #eee; padding: 10px 14px; border-radius: 6px; border: 1px solid rgba(80, 160, 180, 0.3); font-family: Arial, sans-serif; font-size: 13px; z-index: 999999; pointer-events: none; display: none; box-shadow: 0 4px 12px rgba(0,0,0,0.5); backdrop-filter: blur(4px); min-width: 150px; text-align: left; 
            }
        </style>
        `;

        mainWrapper.insertAdjacentHTML('beforeend', galleryHtml);
        const tooltip = document.createElement('div');
        tooltip.id = 'gallery-station-tooltip';
        document.body.appendChild(tooltip);
        
        // Attach Delete All Event
        const delAllBtn = document.getElementById('delete-all-btn');
        if (delAllBtn) {
            delAllBtn.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (confirm("Delete ALL saved memory stations?")) {
                    stationGalleryDB = {};
                    saveDB();
                    localStorage.removeItem('station_gallery_order'); // Clears position history
                    renderGallery();
                    toggleEditMode(false);
                }
            });
        }

        loadDB(); 
        renderGallery(); 
        initCustomDragAndDrop();
        initBackgroundWatchers();
        initZoomHandler();
        setTimeout(injectSettingsUI, 1000); 
    }

    // --- SETTINGS MENU INTEGRATION ---
    function injectSettingsUI() {
        if (document.getElementById('hide-automemory-wrapper')) return;

        const imperialInput = document.getElementById('imperial-units');
        if (!imperialInput) {
            setTimeout(injectSettingsUI, 1000);
            return;
        }

        // Climb up to the wrapper div to clone the whole setting row safely
        let baseWrapper = imperialInput.parentElement;
        while (baseWrapper && baseWrapper.tagName !== 'DIV') {
            baseWrapper = baseWrapper.parentElement;
        }
        if (!baseWrapper) return;

        const clone = baseWrapper.cloneNode(true);
        clone.id = 'hide-automemory-wrapper';
		clone.style.marginTop = "10px"; 
        clone.style.marginBottom = "10px";
        
        const input = clone.querySelector('input');
        if (input) {
            input.id = 'hide-automemory-toggle';
            input.checked = isGalleryHidden;
        }
        
        // Safely replace text without destroying the DOM structure
        function replaceText(node) {
            if (node.nodeType === 3 && /imperial/i.test(node.nodeValue)) {
                node.nodeValue = " Hide Auto Memory";
            } else {
                if (node.tagName === 'LABEL' && node.getAttribute('for') === 'imperial-units') {
                    node.setAttribute('for', 'hide-automemory-toggle');
                }
                node.childNodes.forEach(replaceText);
            }
        }
        replaceText(clone);

        // Attach event listener
        clone.querySelector('input').addEventListener('change', (e) => {
            isGalleryHidden = e.target.checked;
            localStorage.setItem('station_gallery_hidden', isGalleryHidden);
            document.getElementById('station-gallery-outer').style.display = isGalleryHidden ? 'none' : 'flex';
        });

        baseWrapper.parentNode.insertBefore(clone, baseWrapper.nextSibling);
    }

    // --- ZOOM HANDLER ---
    function initZoomHandler() {
        const outerContainer = document.getElementById("station-gallery-outer");
        if (!outerContainer) return;
        outerContainer.addEventListener('wheel', (e) => {
            if (e.ctrlKey) {
                e.preventDefault(); 
                let currentHeight = parseFloat(localStorage.getItem('station_gallery_logo_height')) || 28;
                e.deltaY < 0 ? currentHeight += 2 : currentHeight -= 2;
                currentHeight = Math.max(16, Math.min(currentHeight, 100)); 
                localStorage.setItem('station_gallery_logo_height', currentHeight);
                // Apply globally to document root
                document.documentElement.style.setProperty('--gallery-logo-height', currentHeight + 'px');
            }
        }, { passive: false });
    }

    function updateTooltipContent(pi) {
        const tooltip = document.getElementById('gallery-station-tooltip');
        if (!tooltip || !stationGalleryDB[pi]) return;
        const d = stationGalleryDB[pi];
        let ituStr = d.itu || '-';
        let html = `<div style="font-size: 16px; font-weight: bold; color: #fff; margin-bottom: 4px;">${d.name || d.program || 'Unknown'} <span style="color: #3abf9a; font-size: 14px; margin-left: 6px;">${parseFloat(d.freq).toFixed(1)} MHz</span></div>`;
        html += `<div style="font-size: 11px; color: #aaa; margin-bottom: 4px;">PI: <span style="color: #eee;">${pi}</span></div>`;
        if (d.city) html += `<div style="margin-bottom: 4px;">${d.city} <span style="opacity:0.7">[${ituStr}]</span></div>`;
        if (d.erp || d.dist) {
            let infos = [];
            if (d.erp) infos.push(`${d.erp} kW [${d.pol || '-'}]`);
            if (d.dist) infos.push(d.dist);
            if (d.azi) infos.push(d.azi);
            html += `<div style="font-size: 11px; color: #aaa; margin-top: 6px;">${infos.join(' &bull; ')}</div>`;
        }
        tooltip.innerHTML = html;
    }

    // --- 3. Custom Fluid Drag & Drop ---
    function initCustomDragAndDrop() {
        const container = document.getElementById('station-gallery-scroll');
        if (!container) return;
        document.addEventListener('pointerdown', (e) => {
            if (editMode && !e.target.closest('.gallery-item') && !e.target.closest('.delete-btn') && !e.target.closest('.delete-all-btn')) {
                toggleEditMode(false);
            }
        });
        container.addEventListener('pointerdown', (e) => {
            if ((e.button !== 0 && e.button !== undefined) || e.target.closest('.delete-btn') || e.target.closest('.delete-all-btn')) return; 
            const item = e.target.closest('.gallery-item');
            if (!item) return;
            const tooltip = document.getElementById('gallery-station-tooltip');
            if (tooltip) tooltip.style.display = 'none';
            const startX = e.clientX, startY = e.clientY;
            let holdTimer;
            const cancelHold = () => { clearTimeout(holdTimer); window.removeEventListener('pointermove', checkMove); window.removeEventListener('pointerup', cancelHold); };
            const checkMove = (moveEvt) => { if (Math.abs(moveEvt.clientX - startX) > 5 || Math.abs(moveEvt.clientY - startY) > 5) cancelHold(); };
            window.addEventListener('pointermove', checkMove); window.addEventListener('pointerup', cancelHold);
            if (editMode) { cancelHold(); startDrag(item, e); } 
            else { holdTimer = setTimeout(() => { cancelHold(); startDrag(item, e); }, 1000); }
        });
    }

    function startDrag(item, e) {
        if (navigator.vibrate) navigator.vibrate(50);
        toggleEditMode(true); 
        dragState.active = true; dragState.orig = item;
        
        // Strip transforms temporarily to get accurate baseline rect bounds
        const oldTransform = item.style.transform;
        const oldAnimation = item.style.animation;
        item.style.transform = 'none';
        item.style.animation = 'none';
        const rect = item.getBoundingClientRect();
        item.style.transform = oldTransform;
        item.style.animation = oldAnimation;

        dragState.offsetX = e.clientX - rect.left; dragState.offsetY = e.clientY - rect.top;
        dragState.clone = item.cloneNode(true);
        dragState.clone.classList.remove('edit-mode'); dragState.clone.classList.add('dragging-clone');
        
        const cloneDelBtn = dragState.clone.querySelector('.delete-btn');
        if (cloneDelBtn) cloneDelBtn.remove();
        
        dragState.clone.style.width = rect.width + 'px'; dragState.clone.style.height = rect.height + 'px';
        dragState.clone.style.left = (e.clientX - dragState.offsetX) + 'px'; dragState.clone.style.top = (e.clientY - dragState.offsetY) + 'px';
        
        document.body.appendChild(dragState.clone);
        item.classList.add('drag-placeholder');
        window.addEventListener('pointermove', performDrag, {passive: false});
        window.addEventListener('pointerup', endDrag);
        window.addEventListener('touchmove', preventScroll, {passive: false}); 
    }

    function preventScroll(e) { if (dragState.active) e.preventDefault(); }

    function performDrag(e) {
        if (!dragState.active) return;
        dragState.clone.style.left = (e.clientX - dragState.offsetX) + 'px';
        dragState.clone.style.top = (e.clientY - dragState.offsetY) + 'px';
        dragState.clone.style.display = 'none';
        const elUnder = document.elementFromPoint(e.clientX, e.clientY);
        dragState.clone.style.display = 'flex';
        if (!elUnder) return;
        const targetItem = elUnder.closest('.gallery-item');
        if (targetItem && targetItem !== dragState.orig) {
            const container = targetItem.parentNode;
            const targetRect = targetItem.getBoundingClientRect();
            e.clientX < targetRect.left + targetRect.width / 2 ? container.insertBefore(dragState.orig, targetItem) : container.insertBefore(dragState.orig, targetItem.nextSibling);
        }
    }

    function endDrag(e) {
        if (!dragState.active) return;
        window.removeEventListener('pointermove', performDrag); window.removeEventListener('pointerup', endDrag); window.removeEventListener('touchmove', preventScroll);
        const finalRect = dragState.orig.getBoundingClientRect();
        dragState.clone.style.transition = 'all 0.2s ease-out';
        dragState.clone.style.left = finalRect.left + 'px'; dragState.clone.style.top = finalRect.top + 'px'; dragState.clone.style.transform = 'scale(1)';
        setTimeout(() => {
            if (dragState.clone && dragState.clone.parentNode) dragState.clone.parentNode.removeChild(dragState.clone);
            dragState.orig.classList.remove('drag-placeholder'); dragState.active = false; saveOrder();
        }, 200);
    }

    function toggleEditMode(forceState = null) {
        editMode = (forceState !== null) ? forceState : !editMode;
        const items = document.querySelectorAll('.gallery-item');
        const wrapper = document.getElementById('station-gallery-wrapper');
        
        if (editMode) {
            items.forEach(item => item.classList.add('edit-mode'));
            if (wrapper) wrapper.classList.add('edit-mode');
        } else {
            items.forEach(item => item.classList.remove('edit-mode'));
            if (wrapper) wrapper.classList.remove('edit-mode');
            saveOrder();
        }
    }

    function saveOrder() {
        const order = [];
        document.querySelectorAll('.gallery-item').forEach(item => {
            if (item.hasAttribute('data-pi')) order.push(item.getAttribute('data-pi'));
        });
        localStorage.setItem('station_gallery_order', JSON.stringify(order));
    }

    // --- 4. Render Logic with Position Memory ---
    function renderGallery() {
        const container = document.getElementById("station-gallery-scroll");
        const tooltip = document.getElementById('gallery-station-tooltip');
        if (!container) return;

        let piKeys = Object.keys(stationGalleryDB);
        let order = JSON.parse(localStorage.getItem('station_gallery_order') || '[]');

        piKeys.forEach(pi => { if (!order.includes(pi)) order.push(pi); });
        localStorage.setItem('station_gallery_order', JSON.stringify(order));

        container.innerHTML = ''; 
        order.forEach(pi => {
            const data = stationGalleryDB[pi];
            
            // --- GHOST SLOT IMPLEMENTATION ---
            if (!data) {
                // Renders an invisible element to preserve historical position for deleted/lost stations
                const ghostDiv = document.createElement("div");
                ghostDiv.className = "gallery-item hidden-memory";
                ghostDiv.setAttribute("data-pi", pi);
                container.appendChild(ghostDiv);
                return;
            }

            // Strict Validation (No Artifacts)
            const isDefault = !data.logoUrl || data.logoUrl.includes('default-logo');
            const isPsValid = data.program && data.program.trim().length >= 3 && !data.program.includes('?');
            if (isDefault && !isPsValid) {
                const ghostDiv = document.createElement("div");
                ghostDiv.className = "gallery-item hidden-memory";
                ghostDiv.setAttribute("data-pi", pi);
                container.appendChild(ghostDiv);
                return; 
            }

            const freqNum = parseFloat(data.freq);
            const div = document.createElement("div");
            div.className = `gallery-item${editMode ? " edit-mode" : ""}${data.fading ? " fading" : ""}`;
            div.setAttribute("data-pi", pi); 
            
            div.addEventListener('mouseenter', () => { if (!editMode && !dragState.active && tooltip) { window._hoveredGalleryPi = pi; updateTooltipContent(pi); tooltip.style.display = 'block'; } });
            div.addEventListener('mousemove', (e) => {
                if (editMode || dragState.active || !tooltip) return;
                let tX = e.clientX + 15, tY = e.clientY + 15;
                if (tX + tooltip.offsetWidth > window.innerWidth) tX = e.clientX - tooltip.offsetWidth - 15;
                if (tY + tooltip.offsetHeight > window.innerHeight) tY = e.clientY - tooltip.offsetHeight - 15;
                tooltip.style.left = tX + 'px'; tooltip.style.top = tY + 'px';
            });
            div.addEventListener('mouseleave', () => { if (tooltip) tooltip.style.display = 'none'; window._hoveredGalleryPi = null; });
            
            div.onclick = (e) => { 
                if (e.target.closest('.delete-btn') || editMode) return;
                const currentDomFreq = parseFloat(document.getElementById("data-frequency")?.textContent || "0");
                
                // Using the frequency currently saved in the DB
                if (Math.abs(currentDomFreq - freqNum) < 0.02) return; 
                tuneTo(freqNum); 
            };
            
            div.innerHTML = isDefault ? `<img src="${defaultServerPath}" class="is-default"><span class="ps-text">${data.program || freqNum.toFixed(1) + ' MHz'}</span>` : `<img src="${data.logoUrl}" onerror="this.src='${defaultServerPath}'">`;

            const delBtn = document.createElement("div");
            delBtn.className = "delete-btn"; delBtn.innerHTML = "✖";
            delBtn.addEventListener('pointerdown', (e) => {
                e.preventDefault(); e.stopPropagation(); if (tooltip) tooltip.style.display = 'none'; 
                delete stationGalleryDB[pi]; saveDB(); renderGallery(); 
            });
            div.appendChild(delBtn);
            container.appendChild(div);
        });
    }

    // --- 5. Background Watchers ---
    function initBackgroundWatchers() {
        setInterval(() => {
            const mainLogoImg = document.getElementById('station-logo') || document.getElementById('station-logo-phone');
            if (!mainLogoImg) return;
            const currentPi = mainLogoImg.getAttribute('data-picode'), currentSrc = mainLogoImg.getAttribute('src');
            if (currentPi && currentSrc && !currentSrc.includes('default-logo') && !currentSrc.includes('base64')) {
                if (stationGalleryDB[currentPi] && (!stationGalleryDB[currentPi].logoUrl || stationGalleryDB[currentPi].logoUrl.includes('default-logo'))) updateEntryUrl(currentPi, currentSrc);
            }
        }, 1500); 

        setInterval(() => {
            const domPi = document.getElementById("data-pi")?.textContent.trim().toUpperCase();
            if (domPi && domPi !== '?' && stationGalleryDB[domPi]) {
                const getTxt = (id) => document.getElementById(id) ? document.getElementById(id).textContent.trim() : "";
                let updated = false;
                const checkAndUpdate = (key, val) => { if (val && val !== '?' && val !== '-' && stationGalleryDB[domPi][key] !== val) { stationGalleryDB[domPi][key] = val; updated = true; } };
                checkAndUpdate('name', getTxt("data-station-name")); checkAndUpdate('city', getTxt("data-station-city"));
                checkAndUpdate('itu', getTxt("data-station-itu")); checkAndUpdate('erp', getTxt("data-station-erp"));
                checkAndUpdate('pol', getTxt("data-station-pol")); checkAndUpdate('dist', getTxt("data-station-distance"));
                checkAndUpdate('azi', getTxt("data-station-azimuth"));
                if (updated) { saveDB(); if (window._hoveredGalleryPi === domPi) updateTooltipContent(domPi); renderGallery(); }
            }
        }, 500); 
    }

    function connectWebSocket() {
        if (!window.socket || window.socket.readyState !== WebSocket.OPEN) { setTimeout(connectWebSocket, 1000); return; }
        window.socket.addEventListener('message', handleSocketMessage);
    }

    function handleSocketMessage(event) {
        try {
            const data = JSON.parse(event.data);
            const rawFreq = data.freq.toString();
            if (currentTunedFreq !== rawFreq) {
                currentTunedFreq = rawFreq;
                for (let key in stationGalleryDB) { if (stationGalleryDB[key].timerId) { clearTimeout(stationGalleryDB[key].timerId); stationGalleryDB[key].timerId = null; } }
            }
            
            // Delay to ensure DOM signal is fully updated before checking
            setTimeout(() => {
                const freq = rawFreq, pi = data.pi?.toUpperCase(), itu = data.txInfo?.itu?.toUpperCase(), program = (data.txInfo?.tx || data.ps || "").trim();
                const signal = parseFloat(document.getElementById("data-signal")?.textContent || "0");
                
                // Strict validation
                const hasValidRDS = (pi && !pi.includes('?') && pi.length > 0 && program.length >= 3 && !program.includes('?'));

                if (hasValidRDS) {
                    // Prevent multiple PIs from occupying the same frequency physically
                    const otherPiOnFreq = Object.keys(stationGalleryDB).find(k => stationGalleryDB[k].freq === freq && k !== pi);
                    if (otherPiOnFreq) { delete stationGalleryDB[otherPiOnFreq]; }

                    if (!stationGalleryDB[pi]) {
                        stationGalleryDB[pi] = { freq, pi, itu, program, maxSignal: signal, logoUrl: null, timerId: null, fading: false };
                        saveDB(); renderGallery(); 
                        setTimeout(() => { if(stationGalleryDB[pi] && stationGalleryDB[pi].freq === freq) resolveLogo(pi, freq, itu, program); }, 1500);
                    } else {
                        let updated = false;
                        if (stationGalleryDB[pi].timerId) { clearTimeout(stationGalleryDB[pi].timerId); stationGalleryDB[pi].timerId = null; }
                        if (stationGalleryDB[pi].fading) { stationGalleryDB[pi].fading = false; updated = true; }
                        
                        // --- ENHANCED FREQUENCY PRIORITY LOGIC ---
                        // If signal is strictly better, update freq and maxSignal
                        if (signal > stationGalleryDB[pi].maxSignal) {
                            stationGalleryDB[pi].maxSignal = signal;
                            if (stationGalleryDB[pi].freq !== freq) {
                                stationGalleryDB[pi].freq = freq; 
                                updated = true;
                            }
                        } else if (stationGalleryDB[pi].freq !== freq && signal > 35) {
                            // Even if it's not higher than a historical peak, if we tune to a NEW frequency 
                            // and the signal is very strong (>35 dBf), we assume the user prefers the active strong frequency.
                            stationGalleryDB[pi].freq = freq;
                            stationGalleryDB[pi].maxSignal = signal;
                            updated = true;
                        }
                        
                        if (stationGalleryDB[pi].program !== program && program !== "") {
                            stationGalleryDB[pi].program = program;
                            updated = true;
                            setTimeout(() => resolveLogo(pi, stationGalleryDB[pi].freq, itu, program), 1500);
                        }
                        if (itu && itu !== '?' && stationGalleryDB[pi].itu !== itu) { stationGalleryDB[pi].itu = itu; updated = true; }
                        if (updated) { saveDB(); renderGallery(); if (window._hoveredGalleryPi === pi) updateTooltipContent(pi); }
                    }
                } else {
                    // 2-Stage Fade & Delete Timer
                    const affectedPi = Object.keys(stationGalleryDB).find(k => stationGalleryDB[k].freq === freq);
                    if (affectedPi && !stationGalleryDB[affectedPi].timerId) {
                        stationGalleryDB[affectedPi].timerId = setTimeout(() => {
                            const verifyFreq = document.getElementById("data-frequency")?.textContent || "0";
                            if (Math.abs(parseFloat(verifyFreq) - parseFloat(freq)) < 0.02) {
                                if (stationGalleryDB[affectedPi].fading) {
                                    delete stationGalleryDB[affectedPi]; saveDB(); renderGallery();
                                } else {
                                    stationGalleryDB[affectedPi].fading = true; saveDB(); renderGallery();
                                    stationGalleryDB[affectedPi].timerId = setTimeout(() => {
                                        const verify2 = document.getElementById("data-frequency")?.textContent || "0";
                                        if (Math.abs(parseFloat(verify2) - parseFloat(freq)) < 0.02) { delete stationGalleryDB[affectedPi]; saveDB(); renderGallery(); }
                                    }, 10000);
                                }
                            }
                        }, 10000);
                    }
                }
            }, 250); 
        } catch (e) {}
    }

    function tuneTo(freq) {
        const input = document.getElementById("commandinput");
        if (!input) return;
        input.value = freq.toFixed(2);
        input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
    }

    async function resolveLogo(piCode, freq, ituCode, Program) {
        if (stationGalleryDB[piCode] && stationGalleryDB[piCode].logoUrl && !stationGalleryDB[piCode].logoUrl.includes('default-logo')) return;
        let cleanPiCode = piCode.toUpperCase().trim(), formattedProgram = Program.toUpperCase().replace(/[\/\-\*\+\:\.\,\§\%\&\"!\?\|\>\<\=\)\(\[\]´`'~#\s]/g, '');
        ituCode = (ituCode || '?').includes("USA") ? 'USA' : ituCode;
        const mainLogoImg = document.getElementById('station-logo') || document.getElementById('station-logo-phone');
        if (mainLogoImg && mainLogoImg.getAttribute('data-picode') === cleanPiCode) {
            const currentSrc = mainLogoImg.getAttribute('src');
            if (currentSrc && !currentSrc.includes('default-logo') && !currentSrc.includes('base64')) { updateEntryUrl(cleanPiCode, currentSrc); return; }
        }
        const cacheKey = `remote_logo_url_v2_${ituCode}_${cleanPiCode}_${formattedProgram}`, cached = localStorage.getItem(cacheKey);
        if (cached) {
            try { const parsed = JSON.parse(cached); if (Date.now() - parsed.timestamp < CACHE_EXPIRY_MS && parsed.url && parsed.url !== "DEFAULT") { updateEntryUrl(cleanPiCode, parsed.url); return; } } catch(e) {}
        }
        let finalUrl = defaultServerPath;
        if (ituCode && ituCode !== '?') {
            try {
                if (!sessionRemoteDirCache[ituCode]) {
                    const response = await fetch(`${serverpath}${ituCode}/`);
                    if (response.ok) {
                        const html = await response.text(), doc = new DOMParser().parseFromString(html, 'text/html');
                        sessionRemoteDirCache[ituCode] = Array.from(doc.querySelectorAll('a')).map(a => a.getAttribute('href')).filter(href => href && (href.toLowerCase().endsWith('.svg') || href.toLowerCase().endsWith('.png'))).map(link => decodeURIComponent(link.split('?')[0].split('/').pop()).trim());
                    } else sessionRemoteDirCache[ituCode] = [];
                }
                const priorityFiles = [`${cleanPiCode}_${formattedProgram}.svg`, `${cleanPiCode}_${formattedProgram}.png`, `${cleanPiCode}.svg`, `${cleanPiCode}.png`];
                const dirFiles = sessionRemoteDirCache[ituCode];
                for (const fileName of priorityFiles) { if (dirFiles.find(f => f.toLowerCase() === fileName.toLowerCase())) { finalUrl = `${serverpath}${ituCode}/${fileName}`; break; } }
            } catch (e) {}
        }
        updateEntryUrl(cleanPiCode, finalUrl);
    }

    function updateEntryUrl(pi, url) { if (stationGalleryDB[pi]) { stationGalleryDB[pi].logoUrl = url; saveDB(); renderGallery(); } }

    if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", () => { setTimeout(() => { loadDB(); initGalleryUI(); connectWebSocket(); }, 1500); }); } 
    else { setTimeout(() => { loadDB(); initGalleryUI(); connectWebSocket(); }, 1500); }
})();