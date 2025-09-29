// ==UserScript==
// @name         Safebooru Auto Downloader
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Adds styled download buttons below thumbnails on safebooru.org and reliably auto-downloads full image only when opened via the button.
// @match        https://safebooru.org/*
// @run-at       document-start
// @grant        GM_download
// @author       Kyura
// ==/UserScript==

(function () {
    "use strict";

    // helper to build autodl url
    function makeAutodlUrl(href) {
        return href.includes("?") ? href + "&autodl=1" : href + "?autodl=1";
    }

    // Add buttons under thumbnails (keeps style + flex layout)
    function addButtons() {
        document.querySelectorAll(".image-list span.thumb").forEach(span => {
            let link = span.querySelector("a");
            if (!link || link.querySelector(".tm-download-btn")) return;

            // Make the <a> act like a column (image on top, button below)
            link.style.display = "flex";
            link.style.flexDirection = "column";
            link.style.alignItems = "stretch";
            span.style.marginBottom = "28px"; // prevent overlap

            let btn = document.createElement("button");
            btn.innerText = "Download";
            btn.className = "tm-download-btn";
            btn.style.width = "100%";
            btn.style.height = "22px";
            btn.style.marginTop = "6px";
            btn.style.background = "#e0e0e0";
            btn.style.border = "1px solid #aaa";
            btn.style.borderRadius = "4px";
            btn.style.cursor = "pointer";
            btn.style.fontSize = "12px";
            btn.style.transition = "background 0.2s";
            btn.style.position = "relative";
            btn.style.zIndex = "10";

            btn.addEventListener("mouseenter", () => btn.style.background = "#d0d0d0");
            btn.addEventListener("mouseleave", () => btn.style.background = "#e0e0e0");

            btn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                window.open(makeAutodlUrl(link.href), "_blank", "noopener,noreferrer");
            });

            link.appendChild(btn);
        });
    }

    // observe page for .image-list (handles pages that load thumbnails later)
    const rootObserver = new MutationObserver(() => {
        if (document.querySelector(".image-list")) {
            addButtons();
            // also observe the image-list itself for dynamic loads
            const list = document.querySelector(".image-list");
            if (list) {
                const innerObserver = new MutationObserver(addButtons);
                innerObserver.observe(list, { childList: true, subtree: true });
            }
            rootObserver.disconnect();
        }
    });
    rootObserver.observe(document.documentElement || document, { childList: true, subtree: true });

    // also try to add immediately if DOM is already ready
    if (document.readyState !== "loading") addButtons();

    // ---------- post page auto-download (only when autodl=1) ----------
    const params = new URLSearchParams(window.location.search);
    if (params.get("autodl") === "1") {
        let downloaded = false;

        function cleanFilenameFromUrl(u) {
            try {
                // strip query and trailing slashes, then take last path component
                let noQuery = u.split("?")[0];
                // collapse double slashes after protocol (so //images -> /images)
                // (but preserve the 'https://' prefix)
                noQuery = noQuery.replace(/^([a-z]+:\/)\/+/, "$1/");
                let parts = noQuery.split("/");
                return decodeURIComponent(parts[parts.length - 1]) || "image.jpg";
            } catch (err) {
                return "image.jpg";
            }
        }

        function doDownloadIfReady(imgSrc) {
            if (downloaded || !imgSrc) return;
            downloaded = true;
            const filename = cleanFilenameFromUrl(imgSrc);
            console.log("[TM] Safebooru auto-download:", imgSrc, "→", filename);
            try {
                GM_download(imgSrc, filename);
            } catch (err) {
                console.error("[TM] GM_download failed:", err);
            }
            // close tab a moment after starting download
            setTimeout(() => {
                try { window.close(); } catch (e) { /* ignore */ }
            }, 2000);
        }

        // check immediate presence
        function checkImageAndMaybeDownload() {
            const img = document.querySelector("#image");
            if (img && img.src) {
                doDownloadIfReady(img.src);
                return true;
            }
            return false;
        }

        // If DOM already interactive/complete, try immediately; else set a capturing listener to intercept page scripts
        if (document.readyState === "interactive" || document.readyState === "complete") {
            if (!checkImageAndMaybeDownload()) {
                // watch for the image to be inserted later
                const obs = new MutationObserver((mutations, o) => {
                    if (checkImageAndMaybeDownload()) o.disconnect();
                });
                obs.observe(document.documentElement || document.body, { childList: true, subtree: true });
            }
        } else {
            // capture DOMContentLoaded early and prevent other handlers from running duplicate behavior
            window.addEventListener("DOMContentLoaded", (ev) => {
                try { ev.stopImmediatePropagation(); } catch (e) { /* ignore */ }
                if (!checkImageAndMaybeDownload()) {
                    const obs = new MutationObserver((mutations, o) => {
                        if (checkImageAndMaybeDownload()) o.disconnect();
                    });
                    obs.observe(document.documentElement || document.body, { childList: true, subtree: true });
                }
            }, true); // capture phase
        }
    }
})();
