import { findInItems, findTotalDice } from "../helpers.js";
import { parseSingleDiceString } from "../helpers.js";
import { makeStatCompareReady } from "../helpers.js";
import { reformDiceString } from "../helpers.js";
import { splitStatString } from "../helpers.js";
import { splitStatsAndBonus } from "../helpers.js";
import { getMacroSpeaker } from "../helpers.js";
import { checkDiceArrayEmpty } from "../helpers.js";

import { CommonSystemInfo } from "../systeminfo.js";
import { getSpecialOptionPrototype } from "../systeminfo.js";

import { rollTargetNumberOneLine } from "../dicerollers.js";
import { rollHighestOneLine } from "../dicerollers.js";
import { copyToRollTNDialog } from "../dicerollers.js"

/**
 * Extend the basic Item for Ironclaw's systems.
 * @extends {Item}
 */
export class Ironclaw2EItem extends Item {
    /** @override
     * Perform any last data modifications after super.prepareData has finished executing
     */
    prepareData() {
        super.prepareData();

    }

    /** @override
     * Augment the basic Item data model with additional dynamic data.
     */
    prepareDerivedData() {
        // Get the Item's data
        const itemData = this.data;
        const actorData = this.actor ? this.actor.data : {};
        const data = itemData.data;

        // Check if the item has the weight attribute, then calculate total weight from it and quantity
        if (data.hasOwnProperty("weight")) {
            data.totalWeight = data.weight * data.quantity;
        }

        if (itemData.type === 'gift') this._prepareGiftData(itemData, actorData);
        if (itemData.type === 'extraCareer') this._prepareCareerData(itemData, actorData);
        if (itemData.type === 'weapon') this._prepareWeaponData(itemData, actorData);
        if (itemData.type === 'armor') this._prepareArmorData(itemData, actorData);
        if (itemData.type === 'shield') this._prepareShieldData(itemData, actorData);
        if (itemData.type === 'illumination') this._prepareIlluminationData(itemData, actorData);
    }

    /**
     * Process Gift type specific data
     */
    _prepareGiftData(itemData, actorData) {
        const data = itemData.data;
        // Dice
        if (data.useDice.length > 0) {
            let firstsplit = splitStatsAndBonus(data.useDice);
            if (!firstsplit[1] && firstsplit[0].length > 0 && parseSingleDiceString(firstsplit[0][0])) {
                // If the would-be gift stat array only has "stats" with no explicit dice added after a semicolon and the first "stat" entry turns out to be parseable as dice, treat the entire field as just a one-line dice input
                data.giftStats = [];
                data.giftArray = findTotalDice(data.useDice);
            } else {
                data.giftStats = firstsplit[0];
                data.giftArray = (firstsplit[1].length > 0 ? findTotalDice(firstsplit[1]) : null);
            }
            data.canUse = true;
        }
        else if (data.exhaustWhenUsed) {
            data.giftStats = null;
            data.giftArray = null;
            data.canUse = true;
        }
        else {
            data.giftStats = null;
            data.giftArray = null;
            data.canUse = false;
        }
        // Tags
        if (data.giftTags.length > 0) {
            data.giftTagsSplit = splitStatString(data.giftTags);
        }
        // Special settings
        if (data.specialSettings?.length > 0) {
            for (let i = 0; i < data.specialSettings.length; ++i) {
                data.specialSettings[i].giftName = itemData.name;

                // Applicability settings
                if (data.specialSettings[i].typeField) {
                    data.specialSettings[i].typeArray = splitStatString(data.specialSettings[i].typeField);
                }
                if (data.specialSettings[i].nameField) {
                    data.specialSettings[i].nameArray = splitStatString(data.specialSettings[i].nameField, false);
                    data.specialSettings[i].nameArray.forEach((val, index) => data.specialSettings[i].nameArray[index] = val.toLowerCase());
                }
                if (data.specialSettings[i].tagField) {
                    data.specialSettings[i].tagArray = splitStatString(data.specialSettings[i].tagField);
                }
                if (data.specialSettings[i].descriptorField) {
                    data.specialSettings[i].descriptorArray = splitStatString(data.specialSettings[i].descriptorField);
                }
                if (data.specialSettings[i].effectField) {
                    data.specialSettings[i].effectArray = splitStatString(data.specialSettings[i].effectField);
                }
                if (data.specialSettings[i].statField) {
                    data.specialSettings[i].statArray = splitStatString(data.specialSettings[i].statField);
                }
                if (data.specialSettings[i].conditionField) {
                    data.specialSettings[i].conditionArray = splitStatString(data.specialSettings[i].conditionField);
                }
                if (data.specialSettings[i].equipField) {
                    data.specialSettings[i].equipArray = splitStatString(data.specialSettings[i].equipField);
                }
                if (data.specialSettings[i].rangeField) {
                    data.specialSettings[i].rangeArray = splitStatString(data.specialSettings[i].rangeField);
                }
                if (data.specialSettings[i].otherItemField) {
                    data.specialSettings[i].otherItemArray = splitStatString(data.specialSettings[i].otherItemField);
                }
                // Gift Exhaust check
                if (data.specialSettings[i].worksWhenExhausted === false) {
                    // If the gift does not exhaust when used, or it is _not_ exhausted, then the setting is considered working, otherwise it is not false
                    data.specialSettings[i].workingState = (data.exhaustWhenUsed === false || !data.exhausted);
                }

                // Effect settings
                if (data.specialSettings[i].bonusSourcesField) {
                    data.specialSettings[i].bonusSources = splitStatString(data.specialSettings[i].bonusSourcesField);
                }
                if (data.specialSettings[i].bonusStatsField) {
                    data.specialSettings[i].bonusStats = splitStatString(data.specialSettings[i].bonusStatsField);
                } else { // If the bonus field has stuff, use it, otherwise use the normal gift stuff
                    data.specialSettings[i].bonusStats = data.giftStats;
                }
                if (data.specialSettings[i].bonusDiceField) {
                    data.specialSettings[i].bonusDice = findTotalDice(data.specialSettings[i].bonusDiceField);
                } else { // If the bonus field has stuff, use it, otherwise use the normal gift stuff
                    data.specialSettings[i].bonusDice = data.giftArray;
                }
                if (data.specialSettings[i].replaceNameField) {
                    data.specialSettings[i].replaceName = makeStatCompareReady(data.specialSettings[i].replaceNameField);
                }

                if (data.specialSettings[i].changeFromField && data.specialSettings[i].changeToField) {
                    // Check that both from and to fields have stuff, and then ensure that both have the same length before assiging them
                    const foo = splitStatString(data.specialSettings[i].changeFromField, false);
                    const bar = splitStatString(data.specialSettings[i].changeToField, false);
                    if (foo.length === bar.length) {
                        data.specialSettings[i].changeFrom = foo;
                        data.specialSettings[i].changeTo = bar;
                    }
                }
            }
        }
    }

    /**
     * Process Extra Career type specific data
     */
    _prepareCareerData(itemData, actorData) {
        const data = itemData.data;

        if (data.dice.length > 0) {
            data.diceArray = findTotalDice(data.dice);
            data.valid = checkDiceArrayEmpty(data.diceArray);
            data.skills = [makeStatCompareReady(data.careerSkill1), makeStatCompareReady(data.careerSkill2), makeStatCompareReady(data.careerSkill3)];
        } else {
            data.valid = false;
        }
    }

    /**
     * Process Weapon type specific data
     */
    _prepareWeaponData(itemData, actorData) {
        const data = itemData.data;

        // Attack
        if (data.attackDice.length > 0) {
            let attacksplit = splitStatsAndBonus(data.attackDice);
            data.attackStats = attacksplit[0];
            data.attackArray = (attacksplit[1].length > 0 ? findTotalDice(attacksplit[1]) : null);
            data.canAttack = true;
        }
        else {
            data.attackStats = null;
            data.attackArray = null;
            data.canAttack = false;
        }
        // Defense
        if (data.defenseDice.length > 0) {
            let defensesplit = splitStatsAndBonus(data.defenseDice);
            data.defenseStats = defensesplit[0];
            data.defenseArray = (defensesplit[1].length > 0 ? findTotalDice(defensesplit[1]) : null);
            data.canDefend = true;
        }
        else {
            data.defenseStats = null;
            data.defenseArray = null;
            data.canDefend = false;
        }
        // Counter
        if (data.counterDice.length > 0) {
            let countersplit = splitStatsAndBonus(data.counterDice);
            data.counterStats = countersplit[0];
            data.counterArray = (countersplit[1].length > 0 ? findTotalDice(countersplit[1]) : null);
            data.canCounter = true;
        }
        else {
            data.counterStats = null;
            data.counterArray = null;
            data.canCounter = false;
        }
        // Spark
        if (data.useSpark && data.sparkDie.length > 0) {
            data.sparkArray = findTotalDice(data.sparkDie);
            data.canSpark = true;
        }
        else {
            data.sparkArray = null;
            data.canSpark = false;
        }
        // Effects
        if (data.effect.length > 0) {
            data.effectsSplit = splitStatString(data.effect);
            const foo = data.effectsSplit.findIndex(element => element.includes("damage"));
            if (foo >= 0) {
                const bar = data.effectsSplit.splice(foo, 1);
                if (bar.length > 0) {
                    const damage = parseInt(bar[0].slice(-1));
                    data.damageEffect = isNaN(damage) ? 0 : damage;
                }
            }
            if (data.hasResist) {
                data.resistStats = splitStatString(data.specialResist);
            }
        }
        // Descriptors
        if (data.descriptors.length > 0) {
            data.descriptorsSplit = splitStatString(data.descriptors);
        }
    }

    /**
     * Process Armor type specific data
     */
    _prepareArmorData(itemData, actorData) {
        const data = itemData.data;

        // Armor
        if (data.armorDice.length > 0) {
            data.armorArray = findTotalDice(data.armorDice);
        }
    }

    /**
     * Process Shield type specific data
     */
    _prepareShieldData(itemData, actorData) {
        const data = itemData.data;

        // Shield
        if (data.coverDie.length > 0) {
            data.coverArray = findTotalDice(data.coverDie);
        }
    }

    /**
     * Process Light Source type specific data
     */
    _prepareIlluminationData(itemData, actorData) {
        const data = itemData.data;
    }

    /* -------------------------------------------- */
    /* Item Data Modification Functions             */
    /* -------------------------------------------- */

    /**
     * Check whether a gift is usable, ie. not exhausted or does not exhaust at all
     * @param {boolean} countNonExhaust Whether to return true on gifts that are not exhaustible, or only return true for gifts that can be exhausted but aren't
     * @returns {boolean} Whether the gift is usable, ie. refreshed or doesn't exhaust
     */
    giftUsable(countNonExhaust = true) {
        const itemData = this.data;
        const data = itemData.data;
        if (!(itemData.type === 'gift')) {
            console.error("Gift exhaust check attempted on a non-gift item: " + itemData.name);
            return;
        }

        if (data.exhaustWhenUsed === false && countNonExhaust === false) {
            return false; // If the gift does not exhaust when used and the function is set to not count those, return false
        }

        const exhaustibletest = data.exhaustWhenUsed === false && countNonExhaust === true; // Set the test as true if the gift does not exhaust when used and the function is set to count non-exhaustible gifts
        return data.exhausted === false || exhaustibletest === true; // Return true if the gift is not exhausted, or if the countnonexhaust is set to true and the gift is not exhaustible
    }

    /**
     * Set or toggle exhaustion in a gift, if able
     * @param {string} mode If given a string of "true" or "false", force-set the exhausted state to that, otherwise toggle it
     * @param {boolean} sendToChat If true, send a message to chat about the new gift exhaust state
     */
    async giftSetExhaust(mode = "", sendToChat = false) {
        const itemData = this.data;
        const data = itemData.data;
        if (!(itemData.type === 'gift')) {
            console.error("Gift exhaust toggle attempted on a non-gift item: " + itemData.name);
            return;
        }

        // If the gift does not exhaust when used, return out
        if (data.exhaustWhenUsed === false) {
            return;
        }

        let foo = true;
        if (mode == "true") {
            foo = true;
        } else if (mode == "false") {
            foo = false;
        } else {
            foo = !data.exhausted;
        }

        const statechanging = (foo !== data.exhausted);

        await this.update({ "data.exhausted": foo });

        if (sendToChat && statechanging) {
            let speaker = getMacroSpeaker(this.actor);
            let contents = "";
            if (foo) {
                contents = `<div class="ironclaw2e"><header class="chat-item flexrow">
                <img class="item-image" src="${itemData.img}" title="${itemData.name}" width="20" height="20"/>
                <div class="chat-header-small">${game.i18n.format("ironclaw2e.dialog.exhaustGift.chatMessage", { "name": itemData.name })}</div>
                </header>
                </div>`;
            } else {
                contents = `<div class="ironclaw2e"><header class="chat-item flexrow">
                <img class="item-image" src="${itemData.img}" title="${itemData.name}" width="20" height="20"/>
                <div class="chat-header-small">${game.i18n.format("ironclaw2e.dialog.refreshGift.chatMessage", { "name": itemData.name })}</div>
                </header>
                </div>`;
            }
            let chatData = {
                "content": contents,
                "speaker": speaker
            };
            ChatMessage.applyRollMode(chatData, game.settings.get("core", "rollMode"));
            CONFIG.ChatMessage.documentClass.create(chatData);
        }
    }

    /**
     * Add a new special setting to a gift
     */
    async giftAddSpecialSetting() {
        const itemData = this.data;
        const data = itemData.data;
        if (!(itemData.type === 'gift')) {
            console.error("Gift special setting adding attempted on a non-gift item: " + itemData.name);
            return;
        }

        // Panic escape in case the special settings ever get corrupted
        if (!Array.isArray(data.specialSettings)) {
            console.warn("Gift special options are not an array somehow, resetting...: " + data.specialSettings);
            await this.update({ "data.specialSettings": [] });
        }

        let specialSettings = data.specialSettings;
        let setting = getSpecialOptionPrototype("attackBonus");
        specialSettings.push(setting);

        await this.update({ "data.specialSettings": specialSettings });
        this.giftChangeSpecialSetting(specialSettings.length - 1, "attackBonus", true);
    }

    /**
     * Delete a certain special setting from a gift
     * @param {number} index Index of the setting
     */
    async giftDeleteSpecialSetting(index) {
        const itemData = this.data;
        const data = itemData.data;
        if (!(itemData.type === 'gift')) {
            console.error("Gift special setting deletion attempted on a non-gift item: " + itemData.name);
            return;
        }

        // Panic escape in case the special settings ever get corrupted
        if (!Array.isArray(data.specialSettings)) {
            console.warn("Gift special options are not an array somehow, resetting...: " + data.specialSettings);
            return await this.update({ "data.specialSettings": [] });
        }

        let specialSettings = data.specialSettings;
        specialSettings.splice(index, 1);

        await this.update({ "data.specialSettings": specialSettings });
    }

    /**
     * Change a special setting type in a gift
     * @param {number} index Index of the setting
     * @param {string} settingmode Setting type to change into
     * @param {boolean} force Whether to force a change even into the same type
     */
    async giftChangeSpecialSetting(index, settingmode, force = false) {
        const itemData = this.data;
        const data = itemData.data;
        if (!(itemData.type === 'gift')) {
            console.error("Gift special setting change attempted on a non-gift item: " + itemData.name);
            return null;
        }

        // Panic escape in case the special settings ever get corrupted
        if (!Array.isArray(data.specialSettings)) {
            console.warn("Gift special options are not an array somehow, resetting...: " + data.specialSettings);
            return await this.update({ "data.specialSettings": [] });
        }

        let specialSettings = data.specialSettings;
        let oldSetting = specialSettings[index];

        // If the setting mode in the setting is the same as the settingmode for the function, and force is not set, return out
        if (oldSetting.settingMode == settingmode && force === false) {
            return null;
        }

        let newSetting = getSpecialOptionPrototype(settingmode);
        // TODO: If the old and new settings have the same fields, insert the old values to the new setting

        specialSettings[index] = newSetting;
        return this.update({ "data.specialSettings": specialSettings });
    }

    /**
     * Change a field in a special setting
     * @param {number} index Index of the special setting
     * @param {string} name The field to change in the special setting
     * @param {any} value
     */
    async giftChangeSpecialField(index, name, value) {
        const itemData = this.data;
        const data = itemData.data;
        if (!(itemData.type === 'gift')) {
            console.error("Gift special setting change attempted on a non-gift item: " + itemData.name);
            return null;
        }

        let specialSettings = data.specialSettings;
        specialSettings[index][name] = value;
        return this.update({ "data.specialSettings": specialSettings });
    }

    /**
     * Get the gift this weapon is supposed to exhaust when used
     * @returns {Ironclaw2EItem} The gift to exhaust
     */
    weaponGetGiftToExhaust() {
        const itemData = this.data;
        const data = itemData.data;
        if (!(itemData.type === 'weapon')) {
            console.error("Weapon get exhaust gift attempted on a non-weapon item: " + itemData.name);
            return;
        }

        if (data.exhaustGift && data.exhaustGiftName.length > 0) {
            const giftToExhaust = findInItems(this.actor?.items, makeStatCompareReady(data.exhaustGiftName), "gift");
            if (!giftToExhaust) {
                ui.notifications.warn(game.i18n.format("ironclaw2e.ui.weaponGiftExhaustFailure", { "name": itemData.name, "gift": data.exhaustGiftName, "actor": actorData.name }));
                return null;
            }
            return giftToExhaust;
        }
        else {
            return null;
        }
    }


    /* -------------------------------------------- */
    /* Roll and Chat Functions                      */
    /* -------------------------------------------- */

    /**
     * Generic function to roll whatever is appropriate for the item
     */
    async roll() {
        // Basic template rendering data
        const token = this.actor.token;
        const item = this.data;
        const actorData = this.actor ? this.actor.data.data : {};
        const itemData = item.data;

        switch (item.type) {
            case 'gift':
                this.giftRoll();
                break;
            case 'weapon':
                let rolls = [];
                if (itemData.canAttack) rolls.push(0);
                if (itemData.canSpark) rolls.push(1);
                if (itemData.canDefend) rolls.push(2);
                if (itemData.canCounter) rolls.push(3);

                if (rolls.length == 1) {
                    this._itemRollSelection(rolls[0]);
                } else {
                    this.popupWeaponRollType();
                }
                break;
            case 'illumination':
                if (this.actor) {
                    this.actor.changeLightSource(this);
                }
                break;
            case 'armor':
                this.update({ "data.worn": !itemData.worn });
                break;
            case 'shield':
                this.update({ "data.held": !itemData.held });
                break;
            default:
                this.sendInfoToChat();
                break;
        }
    }

    /** 
     *  Send information about the item to the chat as a message
     */
    async sendInfoToChat() {
        const token = this.actor.token;
        const item = this.data;
        const actorData = this.actor ? this.actor.data.data : {};
        const itemData = item.data;
        const confirmSend = game.settings.get("ironclaw2e", "confirmItemInfo");

        let contents = `<div class="ironclaw2e"><header class="chat-item flexrow">
        <img class="item-image" src="${item.img}" title="${item.name}" width="30" height="30"/>
        <h3 class="chat-header">${item.name}</h3>
        </header>
        <div class="chat-content">`;
        if (itemData.description)
            contents += `<div class="chat-item">${itemData.description}</div>`;

        contents += `<div class="chat-item">`;
        switch (item.type) {
            case 'gift':
                contents += `<p><strong>${game.i18n.localize("ironclaw2e.chatInfo.itemInfo.tags")}:</strong> ${itemData.giftTags}</p>
                        <p><strong>${game.i18n.localize("ironclaw2e.chatInfo.itemInfo.refresh")}:</strong> ${itemData.refresh}, <strong>${game.i18n.localize("ironclaw2e.chatInfo.itemInfo.exhausted")}:</strong> 
                        ${itemData.exhaustWhenUsed ? (itemData.exhausted ? game.i18n.localize("ironclaw2e.yes") : game.i18n.localize("ironclaw2e.no")) : game.i18n.localize("ironclaw2e.never")}</p>`;
                if (itemData.useDice) contents += `<p><strong>${game.i18n.localize("ironclaw2e.chatInfo.itemInfo.giftDice")}:</strong> ${itemData.useDice},
                                                   <strong>${game.i18n.localize("ironclaw2e.chatInfo.itemInfo.defaultTN")}:</strong> ${itemData.defaultTN}</p>`;
                else contents += `<p><strong>${game.i18n.localize("ironclaw2e.chatInfo.itemInfo.giftDiceNothing")}</strong></p>`;
                break;
            case 'extraCareer':
                contents += `<p><strong>${game.i18n.localize("ironclaw2e.chatInfo.itemInfo.name")}:</strong> ${itemData.careerName}</p>
                        <p><strong>${game.i18n.localize("ironclaw2e.chatInfo.itemInfo.dice")}:</strong> ${itemData.dice}</p>
                        <p><strong>${game.i18n.localize("ironclaw2e.chatInfo.itemInfo.skills")}:</strong> ${itemData.careerSkill1}, ${itemData.careerSkill2}, ${itemData.careerSkill3}</p>`;
                break;
            case 'weapon':
                if (itemData.hasResist)
                    contents += `<p><strong>${game.i18n.localize("ironclaw2e.chatInfo.itemInfo.resistWith")}:</strong> ${itemData.specialResist} vs. 3</p>`;
                contents += `<p><strong>${game.i18n.localize("ironclaw2e.chatInfo.itemInfo.effect")}:</strong> ${itemData.effect}</p>
                        <p><strong>${game.i18n.localize("ironclaw2e.chatInfo.itemInfo.descriptors")}:</strong> ${itemData.descriptors}</p>
                        <p><strong>${game.i18n.localize("ironclaw2e.chatInfo.itemInfo.equip")}:</strong> ${CommonSystemInfo.equipHandedness[itemData.equip]},
                        <strong>${game.i18n.localize("ironclaw2e.chatInfo.itemInfo.range")}:</strong> ${CommonSystemInfo.rangeBands[itemData.range]}</p>`;
                if (itemData.exhaustGift && itemData.exhaustGiftName) contents += `<p><strong>${game.i18n.localize("ironclaw2e.chatInfo.itemInfo.exhaustGift")}:</strong> ${itemData.exhaustGiftName}</p>`;
                if (itemData.attackDice) contents += `<p><strong>${game.i18n.localize("ironclaw2e.chatInfo.itemInfo.attackDice")}:</strong> ${itemData.attackDice}</p>`;
                if (itemData.useSpark) contents += `<p><strong>${game.i18n.localize("ironclaw2e.chatInfo.itemInfo.sparkDice")}:</strong> ${itemData.sparkDie}</p>`;
                if (itemData.defenseDice) contents += `<p><strong>${game.i18n.localize("ironclaw2e.chatInfo.itemInfo.parryDice")}:</strong> ${itemData.defenseDice}</p>`;
                if (itemData.counterDice) contents += `<p><strong>${game.i18n.localize("ironclaw2e.chatInfo.itemInfo.counterDice")}:</strong> ${itemData.counterDice}</p>`;
                break;
            case 'illumination':
                contents += `<p><strong>${game.i18n.localize("ironclaw2e.chatInfo.itemInfo.dimLight")}:</strong> ${itemData.dimLight}, <strong>${game.i18n.localize("ironclaw2e.chatInfo.itemInfo.brightLight")}:</strong> ${itemData.brightLight},
                            <strong>${game.i18n.localize("ironclaw2e.chatInfo.itemInfo.angle")}:</strong> ${itemData.lightAngle}</p>`;
                break;
            case 'armor':
                contents += `<p><strong>${game.i18n.localize("ironclaw2e.chatInfo.itemInfo.armorDice")}:</strong> ${itemData.armorDice}, 
                            <strong>${game.i18n.localize("ironclaw2e.chatInfo.itemInfo.worn")}:</strong> ${itemData.worn ? game.i18n.localize("ironclaw2e.yes") : game.i18n.localize("ironclaw2e.no")}</p>`;
                break;
            case 'shield':
                contents += `<p><strong>${game.i18n.localize("ironclaw2e.chatInfo.itemInfo.coverDie")}:</strong> ${itemData.coverDie}, 
                            <strong>${game.i18n.localize("ironclaw2e.chatInfo.itemInfo.held")}:</strong> ${itemData.held ? game.i18n.localize("ironclaw2e.yes") : game.i18n.localize("ironclaw2e.no")}</p>`;
                break;
            default:
                break;
        }
        contents += `</div></div></div>`;

        let chatData = {
            content: contents,
            speaker: getMacroSpeaker(this.actor)
        };
        ChatMessage.applyRollMode(chatData, game.settings.get("core", "rollMode"));

        if (confirmSend) {
            let confirmed = false;
            let dlog = new Dialog({
                title: game.i18n.format("ironclaw2e.dialog.chatInfo.itemInfo.title", { "name": this.data.name }),
                content: `
     <form>
      <h1>${game.i18n.format("ironclaw2e.dialog.chatInfo.itemInfo.header", { "name": this.data.name })}</h1>
     </form>
     `,
                buttons: {
                    one: {
                        icon: '<i class="fas fa-check"></i>',
                        label: game.i18n.localize("ironclaw2e.dialog.send"),
                        callback: () => confirmed = true
                    },
                    two: {
                        icon: '<i class="fas fa-times"></i>',
                        label: game.i18n.localize("ironclaw2e.dialog.cancel"),
                        callback: () => confirmed = false
                    }
                },
                default: "one",
                render: html => { },
                close: html => {
                    if (confirmed) {
                        CONFIG.ChatMessage.documentClass.create(chatData);
                    }
                }
            });
            dlog.render(true);
        } else {
            CONFIG.ChatMessage.documentClass.create(chatData);
        }
    }

    /**
     * After attacking with a weapon, calculate damage from successes and attributes
     * @param {DiceReturn} info The roll information returned by the system dice rollers
     * @param {boolean} ignoreresist Whether to ignore the fact that the weapon has a resist roll, used when such a weapon is used in a counter-attack
     * @param {boolean} onlyupdate If true, only update the roll data, do not send anything to chat yet
     */
    automaticDamageCalculation(info, ignoreresist = false, onlyupdate = false) {
        if (!game.settings.get("ironclaw2e", "calculateAttackEffects")) {
            return; // If the system is turned off, return out
        }
        if (!info) { // Return out in case the info turns out blank
            return;
        }

        const item = this.data;
        const itemData = item.data;
        if (item.type !== 'weapon') {
            console.error("A non-weapon type attempted to send Attack Data: " + item.name);
            return;
        }
        if (itemData.effect.length == 0) {
            return; // If the weapon has no effects listed, return out
        }


        if (!info.tnData) { // If the roll info is in highest mode, assume the attack was a counter-attack, and set the flags accordingly
            let updatedata = {
                flags: { "ironclaw2e.hangingAttack": "counter", "ironclaw2e.hangingWeapon": this.id, "ironclaw2e.hangingActor": this.actor?.id, "ironclaw2e.hangingToken": this.actor?.token?.id }
            };
            info.message.update(updatedata);
            return; // Return out of a counter-attack
        }

        const successes = (isNaN(info.tnData.successes) ? 0 : info.tnData.successes);
        const ties = (isNaN(info.tnData.ties) ? 0 : info.tnData.ties);
        const success = successes > 0;
        const usedsuccesses = (success ? successes : ties);

        if (ignoreresist === false && itemData.hasResist) { // If the weapon's attack was a successful resist roll, set the flags accordingly and return out
            let updatedata = {
                flags: {
                    "ironclaw2e.hangingAttack": "resist", "ironclaw2e.hangingWeapon": this.id, "ironclaw2e.hangingActor": this.actor?.id, "ironclaw2e.hangingToken": this.actor?.token?.id,
                    "ironclaw2e.resistSuccess": success, "ironclaw2e.resistSuccessCount": usedsuccesses
                }
            };
            info.message.update(updatedata);
            return; // Return out of a resisted weapon
        }
        else { // Else, treat it as a normal attack and set the flags to store the information for future reference
            let updatedata = {
                flags: {
                    "ironclaw2e.hangingAttack": "attack", "ironclaw2e.hangingWeapon": this.id, "ironclaw2e.hangingActor": this.actor?.id, "ironclaw2e.hangingToken": this.actor?.token?.id,
                    "ironclaw2e.attackSuccess": success, "ironclaw2e.attackSuccessCount": usedsuccesses
                }
            };
            info.message.update(updatedata);
        }

        if (onlyupdate) {
            return; // Return out to not send anything in update mode
        }
        else if (usedsuccesses <= 0) { // Ignore a complete failure, only display something if the setting is on
            if (game.settings.get("ironclaw2e", "calculateDisplaysFailed")) {
                this.failedAttackToChat();
            }
        }
        else {
            this.successfulAttackToChat(success, usedsuccesses);
        }
    }

    /**
     * Resolve a counter-attack roll by giving it a TN from which to calculate damage
     */
    async resolveCounterAttack(message) {
        let info = await copyToRollTNDialog(message, "ironclaw2e.dialog.counterResolve.title");
        this.automaticDamageCalculation(info, true); // No separate return in case of null, the calculation function itself checks for null
    }

    /**
     * Resolve a resisted attack by giving it the opposition's resist successes, from which it can calculate damage
     */
    async resolveResistedAttack(message) {
        let confirmed = false;
        const success = message.getFlag("ironclaw2e", "resistSuccess");
        const successes = message.getFlag("ironclaw2e", "resistSuccessCount");

        let resolvedopfor = new Promise((resolve) => {
            let dlog = new Dialog({
                title: game.i18n.localize("ironclaw2e.dialog.resistResolve.title"),
                content: `
     <form class="ironclaw2e">
      <div class="form-group">
       <span class="small-label">${game.i18n.localize("ironclaw2e.dialog.resistResolve.successes")}: ${successes}</span>
      </div>
      <div class="form-group">
       <span class="small-text">${success ? "" : game.i18n.localize("ironclaw2e.dialog.resistResolve.tiedMessage")}</span>
      </div>
      <div class="form-group">
       <label class="normal-label" for="opfor">${game.i18n.localize("ironclaw2e.dialog.resistResolve.opposing")}:</label>
	   <input id="opfor" name="opfor" value="" onfocus="this.select();"></input>
      </div>
     </form>
     `,
                buttons: {
                    one: {
                        icon: '<i class="fas fa-check"></i>',
                        label: game.i18n.localize("ironclaw2e.dialog.resolve"),
                        callback: () => confirmed = true
                    },
                    two: {
                        icon: '<i class="fas fa-times"></i>',
                        label: game.i18n.localize("ironclaw2e.dialog.cancel"),
                        callback: () => confirmed = false
                    }
                },
                default: "one",
                render: html => { document.getElementById("opfor").focus(); },
                close: html => {
                    if (confirmed) {
                        let OPFOR = html.find('[name=opfor]')[0].value;
                        let opposing = 0; if (OPFOR.length > 0) opposing = parseInt(OPFOR);
                        resolve(opposing);
                    } else {
                        resolve(null);
                    }
                }
            });
            dlog.render(true);
        });
        let opposingsuccesses = await resolvedopfor;
        if (opposingsuccesses === null) return; // Return out if the user just cancels the prompt

        if (successes > opposingsuccesses) {
            this.successfulAttackToChat(true, successes - opposingsuccesses);
        }
        else {
            this.failedAttackToChat();
        }
    }

    /**
     * Resolve a resisted attack as if it were just an ordinary attack roll, in case it was countered and turned into one
     */
    resolveAsNormalAttack(message) {
        const success = message.getFlag("ironclaw2e", "resistSuccess");
        const successes = message.getFlag("ironclaw2e", "resistSuccessCount");

        if (successes > opposingsuccesses) {
            this.successfulAttackToChat(success, successes);
        }
        else {
            this.failedAttackToChat();
        }
    }

    /**
     * Resend a normal attack to chat
     */
    resendNormalAttack(message) {
        const success = message.getFlag("ironclaw2e", "attackSuccess");
        const successes = message.getFlag("ironclaw2e", "attackSuccessCount");

        if (successes > 0) {
            this.successfulAttackToChat(success, successes);
        }
        else {
            this.failedAttackToChat();
        }
    }

    /**
     * Send the attack damage to chat, calculating damage based on the given successes
     * @param {boolean} success Whether the attack was a success, or a tie
     * @param {number} usedsuccesses The number of successes, or ties in case the attack was a tie
     */
    successfulAttackToChat(success, usedsuccesses) {
        if (!game.settings.get("ironclaw2e", "calculateAttackEffects")) {
            return; // If the system is turned off, return out
        }
        const item = this.data;
        const itemData = item.data;

        let contents = `<div class="ironclaw2e"><header class="chat-item flexrow">
        <img class="item-image" src="${item.img}" title="${item.name}" width="25" height="25"/>
        <h3 class="chat-header-lesser">${game.i18n.format("ironclaw2e.chatInfo.damageCalcInfo.header", { "name": item.name })}</h3>
        </header>
        <div class="chat-content"><div class="chat-item">`;

        if (success) {
            contents += `<p style="color:${CommonSystemInfo.resultColors.success}">${game.i18n.localize("ironclaw2e.chatInfo.damageCalcInfo.attackSuccess")}:</p>`;
        } else {
            contents += `<p style="color:${CommonSystemInfo.resultColors.tie}">${game.i18n.localize("ironclaw2e.chatInfo.damageCalcInfo.attackTied")}:</p>`;
        }

        if (itemData.effectsSplit.includes("slaying")) {
            contents += `<p>${game.i18n.localize("ironclaw2e.chatInfo.damageCalcInfo.slayingDamage")}: <strong>${itemData.damageEffect + (usedsuccesses * 2)}</strong></p>`;
        } else if (itemData.effectsSplit.includes("critical")) {
            contents += `<p>${game.i18n.localize("ironclaw2e.chatInfo.damageCalcInfo.criticalDamage")}: <strong>${itemData.damageEffect + Math.floor(usedsuccesses * 1.5)}</strong></p>`;
        } else {
            contents += `<p>${game.i18n.localize("ironclaw2e.chatInfo.damageCalcInfo.normalDamage")}: <strong>${itemData.damageEffect + usedsuccesses}</strong></p>`;
        }
        if (itemData.effectsSplit.includes("impaling")) {
            contents += `<p>${game.i18n.localize("ironclaw2e.chatInfo.damageCalcInfo.impalingDamage")}: <strong>${itemData.damageEffect + (usedsuccesses * 2)}</strong>, ${game.i18n.localize("ironclaw2e.chatInfo.damageCalcInfo.impalingNote")}</p>`;
        }

        if (itemData.effectsSplit.includes("penetrating")) {
            contents += `<p>${game.i18n.localize("ironclaw2e.chatInfo.damageCalcInfo.penetratingAttack")}</p>`;
        }
        if (itemData.effectsSplit.includes("weak")) {
            contents += `<p>${game.i18n.localize("ironclaw2e.chatInfo.damageCalcInfo.weakAttack")}</p>`;
        }
        contents += `<p class="small-text">${game.i18n.localize("ironclaw2e.chatInfo.damageCalcInfo.allEffects")}: ${itemData.effect}</p>`;

        contents += `</div></div></div>`;
        let chatData = {
            content: contents,
            speaker: getMacroSpeaker(this.actor)
        };
        ChatMessage.applyRollMode(chatData, game.settings.get("core", "rollMode"));
        CONFIG.ChatMessage.documentClass.create(chatData);
    }

    /**
     * Send a message to chat simply to report that the attack failed
     */
    failedAttackToChat() { // This function is mostly used for resist rolls to specifically note if the resistance check failed for the attacker
        if (!game.settings.get("ironclaw2e", "calculateAttackEffects")) {
            return; // If the system is turned off, return out
        }
        const item = this.data;
        const itemData = item.data;

        let contents = `<div class="ironclaw2e"><header class="chat-item flexrow">
        <img class="item-image" src="${item.img}" title="${item.name}" width="25" height="25"/>
        <h3 class="chat-header-lesser">${game.i18n.format("ironclaw2e.chatInfo.damageCalcInfo.header", { "name": item.name })}</h3>
        </header>
        <div class="chat-content"><div class="chat-item">`;

        if (itemData.hasResist) {
            contents += `<p style="color:${CommonSystemInfo.resultColors.failure}">${game.i18n.localize("ironclaw2e.chatInfo.damageCalcInfo.attackResisted")}</p>`;
        } else {
            contents += `<p style="color:${CommonSystemInfo.resultColors.failure}">${game.i18n.localize("ironclaw2e.chatInfo.damageCalcInfo.attackFailed")}</p>`;
        }

        contents += `</div></div></div>`;
        let chatData = {
            content: contents,
            speaker: getMacroSpeaker(this.actor)
        };
        ChatMessage.applyRollMode(chatData, game.settings.get("core", "rollMode"));
        CONFIG.ChatMessage.documentClass.create(chatData);
    }

    /* -------------------------------------------- */
    /*  Item Type Specific Rolls                    */
    /* -------------------------------------------- */

    // Gift Rolls

    giftRoll() {
        const theitem = this;
        const itemData = this.data;
        const data = itemData.data;

        if (!(itemData.type === 'gift')) {
            console.error("Gift roll attempted on a non-gift item: " + itemData.name);
            return;
        }

        if (data.canUse == false) {
            return;
        }
        if (data.exhaustWhenUsed == false || data.exhausted == false) {
            if (data.giftStats || data.giftArray)
                this.genericItemRoll(data.giftStats, data.defaultTN, itemData.name, data.giftArray, 0, (data.exhaustWhenUsed ? (x => { this.giftSetExhaust("true"); }) : null));
            else if (data.exhaustWhenUsed) // Check just in case, even though there should never be a situation where canUse is set, but neither rollable stats / dice nor exhaustWhenUsed aren't
                this.popupExhaustGift();
        }
        else if (data.exhaustWhenUsed == true && data.exhausted == true) {
            this.popupRefreshGift();
        }
    }

    // Weapon Rolls

    /**
     * Select the correct weapon roll funtion to call based on the received integer
     * @param {number} selection
     * @private
     */
    _itemRollSelection(selection) {
        switch (selection) {
            case 0:
                this.attackRoll();
                break;
            case 1:
                this.sparkRoll();
                break;
            case 2:
                this.defenseRoll();
                break;
            case 3:
                this.counterRoll();
                break;
            default:
                console.error("Defaulted weapon roll type: " + this);
                break;
        }
    }

    attackRoll() {
        const itemData = this.data;
        const actorData = this.actor ? this.actor.data : {};
        const data = itemData.data;

        if (!(itemData.type === 'weapon')) {
            console.error("Attack roll attempted on a non-weapon item: " + itemData.name);
            return;
        }

        if (data.canAttack == false) {
            return;
        }

        const donotdisplay = game.settings.get("ironclaw2e", "calculateDoesNotDisplay");
        const exhaust = this.weaponGetGiftToExhaust();
        const sendToChat = game.settings.get("ironclaw2e", "sendWeaponExhaustMessage");
        if (data.exhaustGiftNeedsRefresh && exhaust?.giftUsable() === false) { // If the weapon needs a refreshed gift to use and the gift is not refreshed, immediately pop up a refresh request on that gift
            exhaust?.popupRefreshGift();
        } else {
            this.genericItemRoll(data.attackStats, 3, itemData.name, data.attackArray, 2, (x => { if (exhaust) exhaust.giftSetExhaust("true", sendToChat); this.automaticDamageCalculation(x, false, donotdisplay); }));
        }
    }

    defenseRoll() {
        const itemData = this.data;
        const actorData = this.actor ? this.actor.data : {};
        const data = itemData.data;

        if (!(itemData.type === 'weapon')) {
            console.error("Defense roll attempted on a non-weapon item: " + itemData.name);
            return;
        }

        if (data.canDefend == false) {
            return;
        }

        this.genericItemRoll(data.defenseStats, -1, itemData.name, data.defenseArray, 1);
    }

    counterRoll() {
        const itemData = this.data;
        const actorData = this.actor ? this.actor.data : {};
        const data = itemData.data;

        if (!(itemData.type === 'weapon')) {
            console.error("Counter roll attempted on a non-weapon item: " + itemData.name);
            return;
        }

        if (data.canCounter == false) {
            return;
        }

        const exhaust = this.weaponGetGiftToExhaust();
        const sendToChat = game.settings.get("ironclaw2e", "sendWeaponExhaustMessage");
        if (data.exhaustGiftNeedsRefresh && exhaust?.giftUsable() === false) { // If the weapon needs a refreshed gift to use and the gift is not refreshed, immediately pop up a refresh request on that gift
            exhaust?.popupRefreshGift();
        } else {
            this.genericItemRoll(data.counterStats, -1, itemData.name, data.counterArray, 3, (x => { if (exhaust) exhaust.giftSetExhaust("true", sendToChat); this.automaticDamageCalculation(x); }));
        }
    }

    sparkRoll() {
        const itemData = this.data;
        const actorData = this.actor ? this.actor.data : {};
        const data = itemData.data;

        if (!(itemData.type === 'weapon')) {
            console.error("Spark roll attempted on a non-weapon item: " + itemData.name);
            return;
        }

        if (data.canSpark == false) {
            return;
        }

        rollHighestOneLine(data.sparkDie, game.i18n.localize("ironclaw2e.dialog.sparkRoll.label"), "ironclaw2e.dialog.sparkRoll.title", this.actor);
    }

    /**
     * Common massive function to process roll data and send it to the actor's popup roll function
     * @param {string[]} stats Skills to autocheck on the dialog
     * @param {number} tn Target number of the roll, -1 if highest
     * @param {string} diceid What to name the item dice
     * @param {number[]} dicearray The dice array of the item being rolled
     * @param {number} rolltype What type of popup function to use for the roll, mostly to allow automatic use gifts through special case hacks
     * @param {Function} callback The function to execute after the dice are rolled
     */
    genericItemRoll(stats, tn, diceid, dicearray, rolltype = 0, callback = null) {
        let tnyes = (tn > 0);
        let usedtn = (tn > 0 ? tn : 3);
        if (this.actor) {
            let formconstruction = ``;
            let usesmoredice = false;
            if (Array.isArray(dicearray)) {
                formconstruction += `<div class="form-group flexrow">
                 <label class="normal-label">${diceid}: ${reformDiceString(dicearray, true)}</label>
	             <input type="checkbox" id="${makeStatCompareReady(diceid)}" name="${makeStatCompareReady(diceid)}" value="${makeStatCompareReady(diceid)}" checked></input>
                </div>`+ "\n";
                usesmoredice = true;
            }

            let label = "";

            switch (rolltype) {
                case 0: // Generic gift roll
                    label = this.data.name + " " + game.i18n.localize("ironclaw2e.chatInfo.itemInfo.giftRoll") + (this.data.data.exhaustWhenUsed ? ", " + game.i18n.localize("ironclaw2e.chatInfo.itemInfo.gift") + " <strong>" + game.i18n.localize("ironclaw2e.chatInfo.itemInfo.exhausted") + "</strong>" : ": ");
                    this.actor.popupSelectRolled(stats, tnyes, usedtn, "", formconstruction, (usesmoredice ? [diceid] : []), (usesmoredice ? [dicearray] : []), label, callback);
                    break;
                case 1: // Parry roll
                    label = this.data.name + " " + game.i18n.localize("ironclaw2e.chatInfo.itemInfo.parryRoll") + ": ";
                    this.actor.popupDefenseRoll(stats, tnyes, usedtn, "", formconstruction, (usesmoredice ? [diceid] : []), (usesmoredice ? [dicearray] : []), label, this, true, callback);
                    break;
                case 2: // Attack roll
                    label = this.data.name + " " + game.i18n.localize("ironclaw2e.chatInfo.itemInfo.attackRoll") + (this.data.data.effect ? ", " + game.i18n.localize("ironclaw2e.chatInfo.itemInfo.effect") + ": " + this.data.data.effect + (this.data.data.hasResist ? ", " + game.i18n.localize("ironclaw2e.chatInfo.itemInfo.resistWith") + " " + this.data.data.specialResist + " vs. 3 " : "") : ": ");
                    if (this.weaponGetGiftToExhaust()?.giftUsable() === false) formconstruction += `<strong>${game.i18n.localize("ironclaw2e.dialog.dicePool.giftExhausted")}</strong>` + "\n";
                    this.actor.popupAttackRoll(stats, tnyes, usedtn, "", formconstruction, (usesmoredice ? [diceid] : []), (usesmoredice ? [dicearray] : []), label, this, callback);
                    break;
                case 3: // Counter roll
                    label = this.data.name + " " + game.i18n.localize("ironclaw2e.chatInfo.itemInfo.counterRoll") + (this.data.data.effect ? ", " + game.i18n.localize("ironclaw2e.chatInfo.itemInfo.effect") + ": " + this.data.data.effect : ": ");
                    if (this.weaponGetGiftToExhaust()?.giftUsable() === false) formconstruction += `<strong>${game.i18n.localize("ironclaw2e.dialog.dicePool.giftExhausted")}</strong>` + "\n";
                    this.actor.popupCounterRoll(stats, tnyes, usedtn, "", formconstruction, (usesmoredice ? [diceid] : []), (usesmoredice ? [dicearray] : []), label, this, callback);
                    break;
                default:
                    console.warn("genericItemRoll defaulted when selecting a roll: " + rolltype);
                    this.actor.popupSelectRolled(stats, tnyes, usedtn, "", formconstruction, (usesmoredice ? [diceid] : []), (usesmoredice ? [dicearray] : []), label, callback);
                    break;
            }

        }
        else {
            // For GM tests on items without actors
            if (tnyes)
                rollTargetNumberOneLine(usedtn, reformDiceString(dicearray));
            else
                rollHighestOneLine(reformDiceString(dicearray));
        }
    }

    /* -------------------------------------------- */
    /*  Item Popup Functions                        */
    /* -------------------------------------------- */

    /**
     * Pop up a dialog box to confirm refreshing a gift
     */
    popupRefreshGift() {
        if (this.data.type != "gift")
            return console.error("Tried to refresh a non-gift item: " + this);

        const item = this.data;
        const itemData = item.data;

        let confirmed = false;
        let speaker = getMacroSpeaker(this.actor);
        let dlog = new Dialog({
            title: game.i18n.format("ironclaw2e.dialog.refreshGift.title", { "name": speaker.alias }),
            content: `
     <form>
      <h1>${game.i18n.format("ironclaw2e.dialog.refreshGift.header", { "item": this.data.name, "actor": this.actor?.data.name })}</h1>
     <div class="form-group">
       <label class="normal-label">Send to chat?</label>
       <input type="checkbox" id="send" name="send" value="1" checked></input>
     </div>
     </form>
     `,
            buttons: {
                one: {
                    icon: '<i class="fas fa-check"></i>',
                    label: game.i18n.localize("ironclaw2e.dialog.refresh"),
                    callback: () => confirmed = true
                },
                two: {
                    icon: '<i class="fas fa-times"></i>',
                    label: game.i18n.localize("ironclaw2e.dialog.cancel"),
                    callback: () => confirmed = false
                }
            },
            default: "one",
            render: html => { },
            close: html => {
                if (confirmed) {
                    let SEND = html.find('[name=send]');
                    let sent = SEND.length > 0 ? SEND[0].checked : false;

                    this.giftSetExhaust("false", sent);
                }
            }
        });
        dlog.render(true);
    }

    /**
     * Pop up a dialog box to confirm exhausting a gift
     */
    popupExhaustGift() {
        if (this.data.type != "gift")
            return console.error("Tried to exhaust a non-gift item: " + this);

        const item = this.data;
        const itemData = item.data;

        let confirmed = false;
        let speaker = getMacroSpeaker(this.actor);
        let dlog = new Dialog({
            title: game.i18n.format("ironclaw2e.dialog.exhaustGift.title", { "name": speaker.alias }),
            content: `
     <form>
      <h1>${game.i18n.format("ironclaw2e.dialog.exhaustGift.header", { "item": this.data.name, "actor": this.actor?.data.name })}</h1>
     <div class="form-group">
       <label class="normal-label">Send to chat?</label>
       <input type="checkbox" id="send" name="send" value="1" checked></input>
     </div>
     </form>
     `,
            buttons: {
                one: {
                    icon: '<i class="fas fa-check"></i>',
                    label: game.i18n.localize("ironclaw2e.dialog.exhaust"),
                    callback: () => confirmed = true
                },
                two: {
                    icon: '<i class="fas fa-times"></i>',
                    label: game.i18n.localize("ironclaw2e.dialog.cancel"),
                    callback: () => confirmed = false
                }
            },
            default: "one",
            render: html => { },
            close: html => {
                if (confirmed) {
                    let SEND = html.find('[name=send]');
                    let sent = SEND.length > 0 ? SEND[0].checked : false;

                    this.giftSetExhaust("true", sent);
                }
            }
        });
        dlog.render(true);
    }

    /**
     * Pop up a dialog box to pick what way to use a weapon
     */
    popupWeaponRollType() {
        if (this.data.type != "weapon")
            return console.error("Tried to popup a weapon roll question a non-weapon item: " + this);

        const item = this.data;
        const itemData = item.data;
        const exhaust = this.weaponGetGiftToExhaust();

        // Check if the weapon has an auto-exhaust gift and whether all possible uses would exhaust the gift
        if (exhaust && !itemData.canDefend && !itemData.canSpark) {
            // If the weapon needs a refreshed gift to use and the gift is not refreshed, immediately pop up a refresh request on that gift
            if (itemData.exhaustGiftNeedsRefresh && exhaust?.giftUsable() === false) {
                exhaust?.popupRefreshGift();
                return;
            }
        }

        let first = null;
        let constructionstring = `<div class="form-group">
	   <div class="form-group">`;

        if (itemData.canAttack) {
            constructionstring += `<label>${game.i18n.localize("ironclaw2e.dialog.weaponRoll.attack")}:</label>
	    <input type="radio" id="attack" name="weapon" value="0" ${first ? "" : "checked"}></input>`;
            first = first || "attack";
        }
        if (itemData.canSpark) {
            constructionstring += `<label>${game.i18n.localize("ironclaw2e.dialog.weaponRoll.spark")}:</label>
	    <input type="radio" id="spark" name="weapon" value="1" ${first ? "" : "checked"}></input>`;
            first = first || "spark";
        }
        if (itemData.canDefend) {
            constructionstring += `<label>${game.i18n.localize("ironclaw2e.dialog.weaponRoll.parry")}:</label>
	    <input type="radio" id="defend" name="weapon" value="2" ${first ? "" : "checked"}></input>`;
            first = first || "defend";
        }
        if (itemData.canCounter) {
            constructionstring += `<label>${game.i18n.localize("ironclaw2e.dialog.weaponRoll.counter")}:</label>
	    <input type="radio" id="counter" name="weapon" value="3" ${first ? "" : "checked"}></input>`;
            first = first || "counter";
        }

        constructionstring += `
	   </div>
      </div>`;

        let confirmed = false;
        let speaker = getMacroSpeaker(this.actor);
        let dlog = new Dialog({
            title: game.i18n.format("ironclaw2e.dialog.weaponRoll.title", { "name": speaker.alias }),
            content: `
     <form>
      <h1>${game.i18n.format("ironclaw2e.dialog.weaponRoll.header", { "item": this.data.name, "actor": this.actor?.data.name })}</h1>
      ${constructionstring}
     </form>
     `,
            buttons: {
                one: {
                    icon: '<i class="fas fa-check"></i>',
                    label: game.i18n.localize("ironclaw2e.dialog.pick"),
                    callback: () => confirmed = true
                },
                two: {
                    icon: '<i class="fas fa-times"></i>',
                    label: game.i18n.localize("ironclaw2e.dialog.cancel"),
                    callback: () => confirmed = false
                }
            },
            default: "one",
            render: html => { document.getElementById(first).focus(); },
            close: html => {
                if (confirmed) {
                    let typestring = html.find('input[name=weapon]:checked')[0].value;
                    let rolltype = 0; if (typestring.length != 0) rolltype = parseInt(typestring);
                    if (Number.isInteger(rolltype)) {
                        this._itemRollSelection(rolltype);
                    }
                }
            }
        });
        dlog.render(true);
    }
}
