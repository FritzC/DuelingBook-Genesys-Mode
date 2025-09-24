// ==UserScript==
// @name         Duelingbook Genesys Deck Toggle
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  Add toggle to switch between only Genesys and only non-Genesys deck lists in Duelingbook
// @author       You
// @match        https://www.duelingbook.com/*
// @match        https://duelingbook.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    let isInitialized = false;
    let monitoringCleanup = null;
    let popupWatcherCleanup = null;

    function waitForElement(selector, callback, maxAttempts = 50) {
        let attempts = 0;
        function check() {
            const element = document.querySelector(selector);
            if (element && element.options && element.options.length > 0) {
                callback(element);
                return true;
            }
            attempts++;
            if (attempts < maxAttempts) {
                setTimeout(check, 200);
            }
            return false;
        }
        check();
    }

    function toggleGenesysOptions(showOnlyGenesys) {
        const decklistSelect = document.getElementById('decklist_cb');
        if (!decklistSelect || !decklistSelect.options) {
            return;
        }

        let firstVisibleOption = null;
        const allOptions = Array.from(decklistSelect.options);

        allOptions.forEach(option => {
            const isGenesys = option.textContent.includes('[Genesys]');
            const shouldShow = showOnlyGenesys ? isGenesys : !isGenesys;

            if (shouldShow) {
                option.style.display = '';
                option.hidden = false;
                if (!firstVisibleOption) {
                    firstVisibleOption = option;
                }
            } else {
                option.style.display = 'none';
                option.hidden = true;
            }
        });

        if (firstVisibleOption) {
            decklistSelect.value = firstVisibleOption.value;
            updateProxyDisplay(firstVisibleOption.textContent);

            const changeEvent = new Event('change', { bubbles: true });
            decklistSelect.dispatchEvent(changeEvent);
        }
    }

    function updateProxyDisplay(text) {
        const decklistSelect = document.getElementById('decklist_cb');
        if (!decklistSelect) return;

        const deckConstructor = document.getElementById('deck_constructor');
        if (!deckConstructor) return;

        const proxyComboboxes = deckConstructor.querySelectorAll('.combobox.proxy');
        let targetProxy = null;
        proxyComboboxes.forEach(proxy => {
            const span = proxy.querySelector('span');
            if (span && (span.textContent.includes('default') || span.textContent.includes('['))) {
                targetProxy = proxy;
            }
        });

        if (targetProxy) {
            const proxySpan = targetProxy.querySelector('span');
            if (proxySpan) {
                proxySpan.textContent = text;
            }
        }
    }

    function togglePendulumCards(disableCards) {
        const searchCards = document.querySelectorAll('.search_card');

        searchCards.forEach(card => {
            let shouldDisable = false;

            const pendulumFront = card.querySelector('.pendulum_front');
            if (pendulumFront) {
                const pendulumStyle = pendulumFront.style.display;
                if (pendulumStyle === 'block') {
                    shouldDisable = true;
                }
            }

            const cardColorImg = card.querySelector('img.card_color');
            if (cardColorImg && cardColorImg.src.includes('link_front2.webp')) {
                shouldDisable = true;
            }

            if (shouldDisable && disableCards) {
                if (card.classList.contains('ui-draggable')) {
                    if (typeof $ !== 'undefined' && $(card).draggable) {
                        $(card).draggable('disable');
                    }
                }
                card.style.opacity = '0.5';
                card.style.filter = 'grayscale(100%)';
                card.style.cursor = 'not-allowed';
                card.style.pointerEvents = 'none';
                card.classList.add('card-disabled');
            } else {
                if (card.classList.contains('ui-draggable')) {
                    if (typeof $ !== 'undefined' && $(card).draggable) {
                        $(card).draggable('enable');
                    }
                }
                card.style.opacity = '';
                card.style.filter = '';
                card.style.cursor = '';
                card.style.pointerEvents = '';
                card.classList.remove('card-disabled');
            }
        });
    }

    function setupNewDeckPopupWatcher() {
        let popupWatchInterval = null;
        let inputMonitorInterval = null;
        let currentInputField = null;
        let currentProxyDiv = null;
        let isCurrentlyMonitoring = false;

        function monitorInputForPrefix() {
            if (!currentInputField || !currentProxyDiv) return;

            const checkbox = document.getElementById('genesys-toggle');
            const isGenesysMode = checkbox ? checkbox.checked : false;

            if (!isGenesysMode) return;

            const prefix = '[Genesys] ';
            const currentValue = currentInputField.value;

            if (!currentValue.startsWith(prefix)) {
                let userText = currentValue;
                if (currentValue.startsWith('[Genesys]') && !currentValue.startsWith(prefix)) {
                    userText = currentValue.substring(9);
                } else if (currentValue.startsWith('[Gen') || currentValue.startsWith('[G')) {
                    userText = '';
                }
                const correctedValue = prefix + userText;
                currentInputField.value = correctedValue;
                currentProxyDiv.textContent = correctedValue;
            }
        }

        function checkForNewDeckPopup() {
            const inputPopup = document.getElementById('input');
            if (inputPopup && inputPopup.style.display !== 'none') {
                if (isCurrentlyMonitoring) {
                    return;
                }
                const titleText = inputPopup.querySelector('.title_txt');
                if (titleText && titleText.textContent.trim() === 'New Deck') {
                    isCurrentlyMonitoring = true;
                    const checkbox = document.getElementById('genesys-toggle');
                    const isGenesysMode = checkbox ? checkbox.checked : false;
                    if (isGenesysMode) {
                        const inputField = inputPopup.querySelector('input.input_txt');
                        const proxyDiv = inputPopup.querySelector('.textinput.proxy');
                        if (inputField && proxyDiv) {
                            const prefix = '[Genesys] ';
                            inputField.value = prefix;
                            proxyDiv.textContent = prefix;
                            currentInputField = inputField;
                            currentProxyDiv = proxyDiv;
                            if (inputMonitorInterval) {
                                clearInterval(inputMonitorInterval);
                            }
                            inputMonitorInterval = setInterval(monitorInputForPrefix, 100);
                            setTimeout(() => {
                                inputField.focus();
                                inputField.setSelectionRange(prefix.length, prefix.length);
                            }, 50);
                        }
                    }
                }
            } else {
                if (isCurrentlyMonitoring) {
                    if (inputMonitorInterval) {
                        clearInterval(inputMonitorInterval);
                        inputMonitorInterval = null;
                    }
                    currentInputField = null;
                    currentProxyDiv = null;
                    isCurrentlyMonitoring = false;
                }
            }
        }

        popupWatchInterval = setInterval(checkForNewDeckPopup, 200);

        return function cleanup() {
            if (popupWatchInterval) {
                clearInterval(popupWatchInterval);
                popupWatchInterval = null;
            }
            if (inputMonitorInterval) {
                clearInterval(inputMonitorInterval);
                inputMonitorInterval = null;
            }
            currentInputField = null;
            currentProxyDiv = null;
            isCurrentlyMonitoring = false;
        };
    }

    function setupSearchMonitoring() {
        let lastCardState = '';
        let pollInterval = null;

        function getCurrentCardState() {
            const searchCards = document.querySelectorAll('.search_card');
            let stateString = '';
            searchCards.forEach(card => {
                const picImg = card.querySelector('img.pic');
                if (picImg && picImg.src) {
                    stateString += picImg.src + '|';
                }
            });
            return stateString;
        }

        function checkForChanges() {
            const currentState = getCurrentCardState();
            if (currentState !== lastCardState) {
                lastCardState = currentState;
                setTimeout(() => {
                    const checkbox = document.getElementById('genesys-toggle');
                    const currentGenesysState = checkbox ? checkbox.checked : false;
                    togglePendulumCards(currentGenesysState);
                }, 200);
            }
        }

        lastCardState = getCurrentCardState();

        setTimeout(() => {
            const checkbox = document.getElementById('genesys-toggle');
            const currentGenesysState = checkbox ? checkbox.checked : false;
            togglePendulumCards(currentGenesysState);
        }, 500);

        pollInterval = setInterval(checkForChanges, 200);

        return function cleanup() {
            if (pollInterval) {
                clearInterval(pollInterval);
                pollInterval = null;
            }
        };
    }

    function rearrangeBottomIcons() {
        const iconIds = ['online_btn', 'chat_btn', 'private_btn', 'private_btn_anim'];
        const iconsToMove = [];
        iconIds.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                iconsToMove.push({
                    id: id,
                    element: element
                });
            }
        });
        let firstFoundY = '590px';
        if (iconsToMove.length > 0) {
            iconsToMove.forEach((icon, index) => {
                const el = icon.element;
                el.style.transform = 'scale(0.5)';
                el.style.transformOrigin = 'top left';
                el.style.position = 'fixed';
                el.style.zIndex = '999';
                const newLeft = 15 + (index * 25);
                el.style.left = newLeft + 'px';
                el.style.bottom = '20px';
                el.style.top = firstFoundY;
            });
        }
    }

    function addToggleButton() {
        if (isInitialized) return;
        const deckConstructor = document.getElementById('deck_constructor');
        if (!deckConstructor) {
            return;
        }
        const toggleContainer = document.createElement('div');
        toggleContainer.id = 'genesys-toggle-container';
        toggleContainer.style.cssText = `
            position: absolute;
            left: 8px;
            top: 615px;
            background-color: rgba(174, 255, 0, 0.75);
            padding: 1px 3px;
            border-radius: 2px;
            font-size: 10px;
            z-index: 100;
            user-select: none;
            cursor: pointer;
            border: 1px solid rgba(0,0,0,0.3);
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.3);
            width: 80px;
            height: 17px;
            display: flex;
            align-items: center;
            justify-content: flex-start;
        `;
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = 'genesys-toggle';
        checkbox.style.cssText = 'margin-right: 4px; margin-left: 1px; cursor: pointer; transform: scale(0.7); flex-shrink: 0;';
        const label = document.createElement('label');
        label.htmlFor = 'genesys-toggle';
        label.style.cssText = 'cursor: pointer; font-size: 10px; font-weight: bold; color: rgb(0, 0, 0); margin-left: 20px;';
        label.textContent = 'Genesys';
        toggleContainer.appendChild(checkbox);
        toggleContainer.appendChild(label);

        checkbox.addEventListener('change', function () {
            toggleGenesysOptions(this.checked);
            setTimeout(() => {
                togglePendulumCards(this.checked);
            }, 200);
            setTimeout(() => {
                const pointsElement = document.querySelector('.points');
                if (pointsElement) {
                    // pointsElement.click();
                }
            }, 100);
            localStorage.setItem('duelingbook_genesys_filter', this.checked ? 'genesys' : 'regular');
        });

        const savedPreference = localStorage.getItem('duelingbook_genesys_filter');
        const showGenesys = savedPreference === 'genesys';
        checkbox.checked = showGenesys;
        deckConstructor.appendChild(toggleContainer);

        setTimeout(() => {
            toggleGenesysOptions(showGenesys);
            monitoringCleanup = setupSearchMonitoring();
            popupWatcherCleanup = setupNewDeckPopupWatcher();
            setTimeout(rearrangeBottomIcons, 500);
        }, 300);

        isInitialized = true;
    }

    function initialize() {
        waitForElement('#decklist_cb', function (decklistSelect) {
            setTimeout(() => {
                addToggleButton();
            }, 500);
        });
    }

    window.addEventListener('beforeunload', () => {
        if (monitoringCleanup) {
            monitoringCleanup();
        }
        if (popupWatcherCleanup) {
            popupWatcherCleanup();
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

    setTimeout(initialize, 2000);

})();

