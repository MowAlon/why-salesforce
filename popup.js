"use strict";

const SUCCESS_MESSAGE    = "Your changes were saved successfully";
const tabTemplate        = "tr_template";
const settingsSelector   = "#settings-container div.settings";
const tabAppendElement   = "tbody.tabs";
const storageKeySettings = "sfmWhySF_settings";
const storageKeyTabs     = "sfmWhySF_tabs";
const settingsInfo       = {collapsed:        {type: 'hidden',   default: true},
                            showInFront:      {type: 'checkbox', default: false,             label: 'Display in Front End'},
                            showInSetup:      {type: 'checkbox', default: true,              label: 'Display in Setup'},
                            tabsOnTopInSetup: {type: 'checkbox', default: false,             label: 'Tabs on Top in Setup (vs beside Object Manager tab)'},
                            refreshAfterSave: {type: 'checkbox', default: true,              label: 'Refresh After Saving'},
                            backgroundColor:  {type: 'text',     default: 'white',           label: 'Background Color',                    placeholder: 'CSS-compatible colors'},
                            fontColor:        {type: 'text',     default: 'rgb(24, 24, 24)', label: 'Font Color',                          placeholder: 'CSS-compatible colors'},
                            extraUlStyles:    {type: 'text',     secret: true,               label: 'Extra Styles For Tab Container (ul)', placeholder: 'border:none;font-weight:bold'}
                        };

loadSettings();
loadTabs();

function loadSettings() {
    const settingsElement = document.querySelector(settingsSelector);

    addSettingsElementsToPage(settingsElement);

    applySettingsValues(settingsElement);
}
    function addSettingsElementsToPage(settingsElement) {
        let settingsHTML = '';

        Object.keys(settingsInfo).forEach(settingName => {
            let settingContent = settingsTemplate(settingName);
            if (settingContent) {settingsHTML += settingContent;}
        });

        settingsElement.innerHTML = settingsHTML;
    }
        function settingsTemplate(settingName) {
            let settingHTML;
            const settingInfo = settingsInfo[settingName];

            if (settingInfo.type != 'hidden') {
                settingHTML = `<div class="setting row ${settingName} ${settingInfo.secret ? 'secret' : ''}">
                                   <label>${settingInfo.label}</label>
                                   <input type="${settingInfo.type}" name="${settingName}" class="slds-input ${settingInfo.type == 'checkbox' ? 'slds-checkbox' : ''}" ${settingInfo.placeholder ? 'placeholder="' + settingInfo.placeholder + '"' : ''}>
                               </div>`;
            }

            return settingHTML;
        }
    function applySettingsValues(settingsElement) {
        chrome.storage.sync.get([storageKeySettings], function (items) {
            const storedSettings = items[storageKeySettings];

            if (storedSettings?.collapsed ?? settingsInfo.collapsed.default) {toggleSettingsCollapse();}

            Object.keys(settingsInfo).forEach(settingName => {
                let settingInfo = settingsInfo[settingName];

                switch(settingInfo.type) {
                    case 'checkbox':
                        settingsElement.querySelector(`.setting.${settingName} input`).checked = storedSettings?.[settingName] ?? settingInfo.default;
                        break;
                    case 'text':
                        settingsElement.querySelector(`.setting.${settingName} input`).value = storedSettings?.[settingName] || settingInfo.default || '';
                        break;
                }
            });
        });
    }

function loadTabs() {
    const template = document.getElementById(tabTemplate);
    const elements = new Set();

    chrome.storage.sync.get([storageKeyTabs], function (items) {
        const tabsData = items[storageKeyTabs] || [];

        tabsData.forEach(tab => {
            const element = template.content.firstElementChild.cloneNode(true);
            element.querySelector(".tabTitle").value       = tab.tabTitle;
            element.querySelector(".url").value            = tab.url;
            element.querySelector(".openInNewTab").checked = tab.openInNewTab || false;
            element.querySelector(".order").value          = tab.order;

            element.querySelector(".delete").addEventListener("click", deleteTab);

            elements.add(element);
        });

        document.querySelector(tabAppendElement).append(...elements);
        updateSaveButtonState();
    });
}

function toggleSettingsCollapse() {
    const settingsContainer = document.getElementById('settings-container');
    settingsContainer.classList.toggle('collapsed');
}

function toggleSecretSettings() {
    const settingsContainer = document.querySelector('#settings-container .settings');
    settingsContainer.classList.toggle('show-secrets');
}

function addTab() {
    const template = document.getElementById(tabTemplate);
    const element = template.content.firstElementChild.cloneNode(true);
    element.querySelector(".delete").addEventListener("click", deleteTab);
    document.querySelector(tabAppendElement).append(element);
    updateSaveButtonState();
    clearMessage();
}

function saveTab() {
    let settings  = processSettings();
    let validTabs = processTabs();
    setBrowserStorage(settings, validTabs);
}

function processSettings() {
    let settings = {};

    const settingsContainer = document.getElementById('settings-container');
    settings.collapsed = settingsContainer.classList.contains('collapsed');

    Object.keys(settingsInfo).forEach(settingName => {
        switch(settingsInfo[settingName].type) {
            case 'checkbox':
                settings[settingName] = document.querySelector(`.setting.${settingName} input`).checked;
                break;
            case 'text':
                settings[settingName] = document.querySelector(`.setting.${settingName} input`).value;
                break;
        }
    });

    return settings;
}

function processTabs() {
    let tabs = [];
    const tabElements = document.getElementsByClassName("tab");

    Array.from(tabElements).forEach(tab => {
        let tabTitle     = tab.querySelector(".tabTitle").value;
        let url          = tab.querySelector(".url").value;
        let openInNewTab = tab.querySelector(".openInNewTab").checked;
        let order        = Number(tab.querySelector(".order").value);
        if (order == 0) {order = null;}

        if (tabTitle && url) {
            tabs.push({ tabTitle, url, openInNewTab, order });
        }
    });

    // Sorts tabs by order with nulls at the end
    tabs.sort((a, b) => (a.order === null) - (b.order === null) || +(a.order > b.order) || -(a.order < b.order));

    return tabs;
}

function deleteTab() {
    this.closest(".tab").remove();
    saveTab();
    updateSaveButtonState();
}

function setBrowserStorage(settings, tabs) {
    // Save it using the Chrome extension storage API.
    chrome.storage.sync.set({ sfmWhySF_settings: settings, sfmWhySF_tabs: tabs }, function () {
        setMessage("success", SUCCESS_MESSAGE);

        // Salesforce page refresh: only if Refresh setting is enabled
        if (settings.refreshAfterSave) {
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                chrome.tabs.reload(tabs[0].id);
              });
        }

        // "Why Salesforce" popup page refresh: not subject to Refresh setting, waits one second so user can see success message
        setTimeout(function () {location.reload();}, 1000);
    });
}

function setMessage(type, message) {
    const messageDiv = document.querySelector("#message");
    messageDiv.classList.remove("hidden");

    const messageType = document.querySelector("#message-type");
    messageType.classList.add(`slds-theme_${type}`);

    const messageBody = document.querySelector("#message-body");
    messageBody.innerText = message;

    setTimeout(function () {clearMessage();}, 3000);
}

function clearMessage() {
    const messageDiv = document.querySelector("#message");
    messageDiv.classList.add("hidden");
}

function updateSaveButtonState() {
    const saveButton = document.querySelector(".save");
    const tabElements = document.getElementsByClassName("tab");
    saveButton.disabled = tabElements.length === 0;
}

const settingsHeader = document.querySelector("#settings-container .subheader");
settingsHeader.addEventListener("click", toggleSettingsCollapse);

const saveButton = document.querySelector(".save");
saveButton.addEventListener("click", saveTab);

const addButton = document.querySelector(".add");
addButton.addEventListener("click", addTab);

const brandImage = document.querySelector("header img");
brandImage.addEventListener("dblclick", toggleSecretSettings);

// Initial check to set the state of the save button
updateSaveButtonState();
