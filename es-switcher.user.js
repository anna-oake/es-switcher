// ==UserScript==
// @name        EasyShip Session Switcher
// @include     https://*.easyship.com/*
// @run-at      document-start
// @grant       none
// @version     2.1
// @updateURL   https://raw.githubusercontent.com/anna-oake/es-switcher/refs/heads/main/es-switcher.user.js
// @downloadURL https://raw.githubusercontent.com/anna-oake/es-switcher/refs/heads/main/es-switcher.user.js
// @description Automatically switch EasyShip sessions based on the requested URL or user choice
// @noframes
// @inject-into page
// ==/UserScript==

(function () {
    var userSvc = null;
    var currentUser = null;
    var currentRegion = null;
    var supportedRegions = ["US", "NL", "GB", "HK"];

    async function validateToken(token) {
        const url = "https://api.easyship.com/api/v1/users/get_current_user";
        try {
            const response = await fetch(url, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });
            return response.status === 200;
        } catch (error) {
            return false;
        }
    }


    function getCurrentToken() {
        return userSvc.session_token;
    }

    function getSafeToken() {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; safeCredentials=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
    }

    function setCurrentToken(value) {
        if (userSvc) {
            userSvc.destroy();
        }
        document.cookie = "credentials=" + value + "; Secure; SameSite=None; Partitioned; domain=.easyship.com; path=/";
        document.cookie = "safeCredentials=" + value + "; Secure; expires=" + new Date(new Date().getTime() + 1000 * 60 * 60 * 24 * 365).toGMTString() + "; domain=.easyship.com; path=/";
    }

    function findToken(region) {
        let regions = JSON.parse(window.localStorage.getItem("region_sessions"));
        if (regions) {
            return regions[region];
        }
    }

    function storeToken(region, token) {
        let regions = JSON.parse(window.localStorage.getItem("region_sessions"));
        if (!regions) {
            regions = {};
        }
        regions[region] = token;
        window.localStorage.setItem("region_sessions", JSON.stringify(regions));
        document.cookie = "safeCredentials=" + token + "; Secure; expires=" + new Date(new Date().getTime() + 1000 * 60 * 60 * 24 * 365).toGMTString() + "; domain=.easyship.com; path=/";
    }

    function toast(kind, message) {
        // console.log("Toast", kind, message);
    }

    async function waitUntilGone(selector, limit) {
        let timeout = false
        setTimeout(() => { timeout = true }, limit)
        while (document.querySelector(selector) !== null || timeout) {
            await new Promise(resolve => {
                requestAnimationFrame(resolve)
            })
        }
        return
    }

    async function waitForElement(selector, limit) {
        let timeout = false
        setTimeout(() => { timeout = true }, limit)
        while (document.querySelector(selector) === null || timeout) {
            await new Promise(resolve => {
                requestAnimationFrame(resolve)
            })
        }
        return document.querySelector(selector)
    }

    async function waitForProperty(obj, p, limit) {
        let timeout = false
        setTimeout(() => { timeout = true }, limit)
        while (!obj[p] || timeout) {
            await new Promise(resolve => {
                requestAnimationFrame(resolve)
            })
        }
        if (obj[p]) {
            return obj[p];
        }
        return null;
    }

    async function injectMenu() {
        let sidebar = await waitForElement("es-sidebar-profile div", 5000);
        if (!sidebar) {
            return;
        }

        if (document.querySelector(".switch-region")) {
            return;
        }

        let menu = [];
        let i = 1;
        let active;
        for (let region of supportedRegions) {
            if (region == currentRegion) {
                active = i;
                menu.push(`<button aria-pressed="true" class="z-10 flex select-none items-center justify-center whitespace-nowrap rounded-xl px-3 text-base font-bold text-ink-900" disabled>${region}</button>`);
            } else {
                menu.push(`<button aria-pressed="false" class="z-10 flex select-none items-center justify-center whitespace-nowrap rounded-xl px-3 text-base font-bold text-ink-900 switch-region" data-region="${region}">${region}</button>`);
            }
            i++;
        }
        let tmpl = `
        <div class="inline-flex flex-col gap-1">
	        <div class="rounded-2xl relative grid h-[40px] w-full border-4 border-transparent bg-sky-300 grid-cols-${supportedRegions.length}">
		        <div class="absolute col-start-${active} col-end-${active + 1} h-full w-full self-center justify-self-center rounded-xl transition-all bg-sky-500" style="left: calc(0%);"></div>
                    ${menu.join("\n")}
	        </div>
        </div>
        `;
        let line = document.createElement('div');
        line.innerHTML = tmpl.trim();
        line = line.firstChild;
        sidebar.appendChild(line);

        const links = document.querySelectorAll(".switch-region");
        links.forEach(el => el.addEventListener("click", e => switchRegion(e.target.getAttribute("data-region"))));
    }

    function switchRegion(region) {
        const token = findToken(region);
        if (token) {
            window.stop();
            setCurrentToken(token);
            location.reload();
        } else {
            toast("error", `No session token found for ${region}. Please login...`);
            setCurrentToken("");
            userSvc.redirectToLogin();
        }
    }

    if (window.location.hostname.startsWith("auth") && window.location.pathname.endsWith("login")) {
        let token = getSafeToken();
        if (token) {
            validateToken(token)
                .then(isValid => {
                    if (isValid) {
                        setCurrentToken(token);
                        location.href = "https://app.easyship.com/dashboard";
                    } else {
                        setCurrentToken("");
                    }
                });
        }
    }

    if (!window.location.hostname.startsWith("app")) {
        return;
    }

    window.addEventListener("load", async function () {
        console.log("Injected");
        userSvc = window.angular.element(document.body).injector().get("UserSession");
        if (!userSvc) {
            alert("Unexpected error, report to Anna");
            return;
        }
        console.log("Got user service");
        currentUser = await waitForProperty(userSvc, "user", 60 * 1000);
        if (!currentUser) {
            return;
        }
        console.log("Got user object");
        currentRegion = currentUser.shipping_country.alpha2;
        if (!currentRegion || currentRegion.length != 2) {
            return;
        }
        console.log("Got region", currentRegion);
        storeToken(currentRegion, getCurrentToken());
        console.log("Stored the current token");

        let desiredRegion = currentRegion;
        for (let region of supportedRegions) {
            if (location.href.includes("ES" + region)) {
                desiredRegion = region;
            }
        }
        if (currentRegion !== desiredRegion) {
            console.log("Region change is needed from", currentRegion, "to", desiredRegion);
            switchRegion(desiredRegion);
            return;
        }

        await injectMenu();

        let scope = window.angular.element(document.body).injector().get("$rootScope");
        scope.$on('$stateChangeSuccess', async function (event, toState, toParams, fromState, fromParams) {
            console.log("State changed");
            await waitUntilGone(".switch-region", 5000);
            await injectMenu();
        });
    }, false);
})();
