import { findActorToken, findInItems, findTotalDice, formDicePoolField, getSpeakerActor, getTokenFromSpeaker, parseFractionalNumber, popupConfirmationBox, reduceDiceStringSet } from "../helpers.js";
import { parseSingleDiceString } from "../helpers.js";
import { makeCompareReady } from "../helpers.js";
import { reformDiceString } from "../helpers.js";
import { splitStatString } from "../helpers.js";
import { splitStatsAndBonus } from "../helpers.js";
import { getMacroSpeaker } from "../helpers.js";
import { checkDiceArrayEmpty } from "../helpers.js";
import { checkQuickModifierKey } from "../helpers.js";

import { checkStandardDefense, CommonSystemInfo, getRangeDistanceFromBand } from "../systeminfo.js";
import { getGiftSpecialOptionPrototype } from "../systeminfo.js";

import { CommonConditionInfo } from "../conditions.js"

import { CardinalDiceRoller, rollTargetNumberOneLine, rollVariableOneLine } from "../dicerollers.js";
import { rollHighestOneLine } from "../dicerollers.js";
import { copyToRollTNDialog } from "../dicerollers.js";
import { Ironclaw2EActor } from "../actor/actor.js";

/**
 * Extend the basic Item for Ironclaw's systems.
 * @extends {Item}
 */
export class Ironclaw2EItem extends Item {

    /* -------------------------------------------- */
    /* Static Functions                             */
    /* -------------------------------------------- */

    /**
     * Transfer template flags from one object to another
     * @param {object} source
     * @param {object} target
     */
    static transferTemplateFlags(source, target) {
        const sourceFlags = source?.flags?.ironclaw2e;
        if ("weaponTemplatePos" in sourceFlags) {
            const flags = {
                "ironclaw2e.weaponTemplatePos": sourceFlags.weaponTemplatePos,
                "ironclaw2e.weaponTemplateId": sourceFlags.weaponTemplateId,
                "ironclaw2e.weaponTemplateSceneId": sourceFlags.weaponTemplateSceneId
            };
            target.update({ "_id": target.id, "flags": flags });
        }
    }

    /**
     * Simple helper that just sets the exhaust state of an entire array of gifts, helper to help combat against race conditions
     * @param {Ironclaw2EItem[]} gifts
     * @param {string} state "toggle" changes the state to the opposite, "true" or "false" set it to that state, otherwise errors out. "true" exhausts, "false" refreshes.
     * @returns {Promise<boolean>} Whether there were any gifts to exhaust
     */
    static async giftSetExhaustArray(gifts, state) {
        if (gifts?.length > 0) {
            const giftUseToChat = game.settings.get("ironclaw2e", "sendGiftUseExhaustMessage");
            for (let exhaust of gifts) { await exhaust.giftToggleExhaust(state, giftUseToChat); }
            return true;
        }
        return false;
    }

    /* -------------------------------------------- */
    /* Overrides                                    */
    /* -------------------------------------------- */

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
        const item = this;
        const actor = this.actor ? this.actor : {};
        const system = item.system;

        // Check if the item has the weight attribute, then use it and quantity to calculate total weight
        if (system.hasOwnProperty("weight")) {
            let usedWeight = parseFractionalNumber(system.weight, game.i18n.format("ironclaw2e.ui.itemWeightParseError", { "item": item.name, "weight": system.weight }));

            system.totalWeight = usedWeight * system.quantity;
        }

        if (item.type === 'gift') {
            this._prepareGiftData(item, actor);
            this._prepareGiftSpecialSettings(item);
        }
        if (item.type === 'extraCareer') this._prepareCareerData(item, actor);
        if (item.type === 'weapon') this._prepareWeaponData(item, actor);
        if (item.type === 'armor') this._prepareArmorData(item, actor);
        if (item.type === 'shield') this._prepareShieldData(item, actor);
        if (item.type === 'illumination') this._prepareIlluminationData(item, actor);
        if (item.type === 'vehicleStation') this._prepareVehicleStationData(item, actor);
    }

    /**
     * Process Gift type specific data
     */
    _prepareGiftData(item, actor) {
        const system = item.system;
        // Dice
        if (system.useDice.length > 0) {
            let firstsplit = splitStatsAndBonus(system.useDice);
            system.giftStats = firstsplit[0];
            system.giftArray = (firstsplit[1].length > 0 ? findTotalDice(firstsplit[1]) : null);
            system.canUse = true;
        }
        else if (system.exhaustWhenUsed || system.extraSense) {
            system.giftStats = null;
            system.giftArray = null;
            system.canUse = true;
        }
        else {
            system.giftStats = null;
            system.giftArray = null;
            system.canUse = false;
        }
        // Tags
        if (system.giftTags.length > 0) {
            system.giftTagsSplit = splitStatString(system.giftTags);
        }
        // Skill Mark
        if (system.grantsMark) {
            system.skillName = makeCompareReady(system.giftSkill);
        }
        // Usability
        // If the gift does not exhaust when used, or it is _not_ exhausted, set the stored giftUsable as true, otherwise it is false
        system.giftUsable = (system.exhaustWhenUsed === false || !system.exhausted);
        // Whether the gift grants an extra sense that is passive in nature
        system.hasPassiveDetection = system.extraSense && system.extraSenseName ? CommonSystemInfo.extraSenses[system.extraSenseName].detectionPassives?.length > 0 : false;
    }

    /**
     * Prepare the gift special settings in a separate function
     */
    _prepareGiftSpecialSettings(item) {
        const system = item.system;

        // Special settings
        if (system.specialSettings?.length > 0) {
            // If special settings exist, make a new array where the actual processed version of the special settings exist
            // This helps prevent data corruption and leakage
            system.usedSpecialSettings = [];

            for (let i = 0; i < system.specialSettings.length; ++i) {
                // Clone the object in the stored array into the actually used array
                system.usedSpecialSettings.push({ ...system.specialSettings[i] });

                system.usedSpecialSettings[i].giftName = item.name;
                system.usedSpecialSettings[i].giftId = item._id;
                system.usedSpecialSettings[i].settingIndex = i;
                system.usedSpecialSettings[i].refreshedState = system.giftUsable;
                // If the special is of a type that does not use items but preset data, set the itemless boolean to "true"
                system.usedSpecialSettings[i].itemless = CommonSystemInfo.giftItemlessOptions.has(system.usedSpecialSettings[i].settingMode);

                // Applicability settings
                // Self settings
                if (system.usedSpecialSettings[i].typeField) {
                    system.usedSpecialSettings[i].typeArray = splitStatString(system.usedSpecialSettings[i].typeField);
                }

                if (system.usedSpecialSettings[i].nameField) {
                    system.usedSpecialSettings[i].nameArray = splitStatString(system.usedSpecialSettings[i].nameField, false);
                    system.usedSpecialSettings[i].nameArray.forEach((val, index) => system.usedSpecialSettings[i].nameArray[index] = val.toLowerCase());
                }

                if (system.usedSpecialSettings[i].tagField) {
                    system.usedSpecialSettings[i].tagArray = splitStatString(system.usedSpecialSettings[i].tagField);
                }

                if (system.usedSpecialSettings[i].descriptorField) {
                    system.usedSpecialSettings[i].descriptorArray = splitStatString(system.usedSpecialSettings[i].descriptorField);
                }

                if (system.usedSpecialSettings[i].effectField) {
                    system.usedSpecialSettings[i].effectArray = splitStatString(system.usedSpecialSettings[i].effectField);
                }

                // Special case for gifts that can be generically tied to skills
                if (system.usedSpecialSettings[i].statField === "-" && CommonSystemInfo.giftGenericSkillOptions.has(system.usedSpecialSettings[i].settingMode)) {
                    system.specialSkillUse = true;
                    if (system.giftSkill) system.usedSpecialSettings[i].statArray = splitStatString(system.giftSkill);
                }
                else if (system.usedSpecialSettings[i].statField) {
                    system.usedSpecialSettings[i].statArray = splitStatString(system.usedSpecialSettings[i].statField);
                }

                if (system.usedSpecialSettings[i].conditionField) {
                    system.usedSpecialSettings[i].conditionArray = splitStatString(system.usedSpecialSettings[i].conditionField);
                }

                if (system.usedSpecialSettings[i].equipField) {
                    system.usedSpecialSettings[i].equipArray = splitStatString(system.usedSpecialSettings[i].equipField);
                }

                if (system.usedSpecialSettings[i].rangeField) {
                    system.usedSpecialSettings[i].rangeArray = splitStatString(system.usedSpecialSettings[i].rangeField);
                }

                if (system.usedSpecialSettings[i].otherOwnedItemField) {
                    system.usedSpecialSettings[i].otherOwnedItemArray = splitStatString(system.usedSpecialSettings[i].otherOwnedItemField);
                }

                // Other settings
                if (system.usedSpecialSettings[i].nameOtherField) {
                    system.usedSpecialSettings[i].nameOtherArray = splitStatString(system.usedSpecialSettings[i].nameOtherField, false);
                    system.usedSpecialSettings[i].nameOtherArray.forEach((val, index) => system.usedSpecialSettings[i].nameOtherArray[index] = val.toLowerCase());
                }

                if (system.usedSpecialSettings[i].descriptorOtherField) {
                    system.usedSpecialSettings[i].descriptorOtherArray = splitStatString(system.usedSpecialSettings[i].descriptorOtherField);
                }

                if (system.usedSpecialSettings[i].effectOtherField) {
                    system.usedSpecialSettings[i].effectOtherArray = splitStatString(system.usedSpecialSettings[i].effectOtherField);
                }

                if (system.usedSpecialSettings[i].statOtherField) {
                    system.usedSpecialSettings[i].statOtherArray = splitStatString(system.usedSpecialSettings[i].statOtherField);
                }

                if (system.usedSpecialSettings[i].equipOtherField) {
                    system.usedSpecialSettings[i].equipOtherArray = splitStatString(system.usedSpecialSettings[i].equipOtherField);
                }

                if (system.usedSpecialSettings[i].rangeOtherField) {
                    system.usedSpecialSettings[i].rangeOtherArray = splitStatString(system.usedSpecialSettings[i].rangeOtherField);
                }

                // Effect settings
                if (system.usedSpecialSettings[i].bonusSourcesField) {
                    system.usedSpecialSettings[i].bonusSources = splitStatString(system.usedSpecialSettings[i].bonusSourcesField);
                }

                if (!system.usedSpecialSettings[i].hasOwnProperty("bonusStatsField") || system.usedSpecialSettings[i].bonusStatsField === "-") {
                    // If the stat field doesn't exist or is just a dash, interpret that as skipping the field
                } else if (system.usedSpecialSettings[i].bonusStatsField) {
                    system.usedSpecialSettings[i].bonusStats = splitStatString(system.usedSpecialSettings[i].bonusStatsField);
                } else { // If the bonus field has stuff, use it, otherwise use the normal gift stuff
                    system.usedSpecialSettings[i].bonusStats = system.giftStats;
                }

                if (!system.usedSpecialSettings[i].hasOwnProperty("bonusDiceField") || system.usedSpecialSettings[i].bonusDiceField === "-") {
                    // If the dice field doesn't exist or is just a dash, interpret that as skipping the field
                } else if (system.usedSpecialSettings[i].bonusDiceField) {
                    system.usedSpecialSettings[i].bonusDice = findTotalDice(system.usedSpecialSettings[i].bonusDiceField);
                } else { // If the bonus field has stuff, use it, otherwise use the normal gift stuff
                    system.usedSpecialSettings[i].bonusDice = system.giftArray;
                }

                if (system.usedSpecialSettings[i].replaceNameField) {
                    system.usedSpecialSettings[i].replaceName = makeCompareReady(system.usedSpecialSettings[i].replaceNameField);
                }

                if (system.usedSpecialSettings[i].changeFromField && system.usedSpecialSettings[i].changeToField) {
                    // Check that both from and to fields have stuff, and then ensure that both have the same length before assiging them
                    const foo = splitStatString(system.usedSpecialSettings[i].changeFromField, false);
                    const bar = splitStatString(system.usedSpecialSettings[i].changeToField, false);
                    if (foo.length === bar.length) {
                        system.usedSpecialSettings[i].changeFrom = foo;
                        system.usedSpecialSettings[i].changeTo = bar;
                    } else {
                        system.usedSpecialSettings[i].changeFrom = null;
                        system.usedSpecialSettings[i].changeTo = null;
                    }
                }
            }
        }
        else {
            system.usedSpecialSettings = null;
        }
    }

    /**
     * Process Extra Career type specific data
     */
    _prepareCareerData(item, actor) {
        const system = item.system;

        system.careerName = (system.forcedCareerName?.length > 0 ? system.forcedCareerName : item.name);
        if (system.dice.length > 0) {
            system.diceArray = findTotalDice(system.dice);
            system.valid = checkDiceArrayEmpty(system.diceArray);
            system.skills = [makeCompareReady(system.careerSkill1), makeCompareReady(system.careerSkill2), makeCompareReady(system.careerSkill3)];
            system.skillNames = [system.careerSkill1, system.careerSkill2, system.careerSkill3];
        } else {
            system.valid = false;
        }
    }

    /**
     * Process Weapon type specific data
     */
    _prepareWeaponData(item, actor) {
        const system = item.system;

        // Attack
        if (system.attackDice.length > 0) {
            let attacksplit = splitStatsAndBonus(system.attackDice);
            system.attackStats = attacksplit[0];
            system.attackArray = (attacksplit[1].length > 0 ? findTotalDice(attacksplit[1]) : null);
            system.canAttack = true;
        }
        else {
            system.attackStats = null;
            system.attackArray = null;
            system.canAttack = false;
        }
        // Defense
        if (system.defenseDice.length > 0) {
            let defensesplit = splitStatsAndBonus(system.defenseDice);
            system.defenseStats = defensesplit[0];
            system.defenseArray = (defensesplit[1].length > 0 ? findTotalDice(defensesplit[1]) : null);
            system.canDefend = true;
        }
        else {
            system.defenseStats = null;
            system.defenseArray = null;
            system.canDefend = false;
        }
        // Counter
        if (system.counterDice.length > 0) {
            let countersplit = splitStatsAndBonus(system.counterDice);
            system.counterStats = countersplit[0];
            system.counterArray = (countersplit[1].length > 0 ? findTotalDice(countersplit[1]) : null);
            system.canCounter = true;
        }
        else {
            system.counterStats = null;
            system.counterArray = null;
            system.canCounter = false;
        }
        // Spark
        if (system.useSpark && system.sparkDie.length > 0) {
            system.sparkArray = findTotalDice(system.sparkDie);
            system.canSpark = true;
        }
        else {
            system.sparkArray = null;
            system.canSpark = false;
        }
        // Effects
        if (system.effect.length > 0) {
            system.effectsSplit = splitStatString(system.effect);
            // Damage
            const foo = system.effectsSplit.findIndex(element => element.includes("damage"));
            if (foo >= 0) {
                let bar = system.effectsSplit[foo];
                let flat = false;
                if (bar.includes("flat")) {
                    bar = bar.replaceAll("flat", "");
                    flat = true;
                }
                if (bar.length > 0) {
                    const damage = parseInt(bar.match(/([0-9])+/i)?.[0]); // Grabs the first number group of the damage, which should always return the correct damage number
                    system.damageEffect = isNaN(damage) ? -1 : damage;
                    system.damageFlat = flat && system.damageEffect >= 0;
                } else { system.damageEffect = -1; }
            } else { system.damageEffect = -1; }
            //Multi-attack
            let multiType = "";
            const multi = system.effectsSplit.findIndex(element => {
                if (element.includes("group")) {
                    multiType = "group";
                    return true;
                } else if (element.includes("sweep")) {
                    multiType = "sweep";
                    return true;
                } else if (element.includes("explosion")) {
                    multiType = "explosion";
                    return true;
                } else if (element.includes("crowd")) {
                    multiType = "crowd";
                    return true;
                } else if (element.includes("landscape")) {
                    multiType = "landscape";
                    return true;
                }
                return false;
            });
            if (multi > 0) {
                system.multiAttackType = multiType;
                if (multiType === "sweep" || multiType === "explosion") {
                    const multiString = system.effectsSplit[multi].replaceAll(/([:;])/g, "");
                    const distString = multiString.substring(multiType.length);
                    if (CommonSystemInfo.rangeBandsArray.includes(distString)) {
                        system.multiAttackRange = distString;
                        system.multiAttackRangeShown = CommonSystemInfo.rangeBands[distString];
                    }
                }
                system.attackAutoHits = (multiType === "explosion") && system.hasResist;
                system.attackHasTemplate = system.attackAutoHits && system.multiAttackRange;
            } else { system.multiAttackType = ""; }
            // Condition effects
            const conds = CommonConditionInfo.getMatchedConditions(system.effectsSplit);
            system.effectConditions = "";
            system.effectConditionsLabel = "";
            if (conds.length > 0) {
                conds.forEach(element => {
                    system.effectConditions += element.id + ",";
                    system.effectConditionsLabel += game.i18n.localize(element.label) + ",";
                });
                system.effectConditions = system.effectConditions.slice(0, -1);
                system.effectConditionsLabel = system.effectConditionsLabel.slice(0, -1);
            }
        } else {
            system.effectsSplit = null;
        }
        // Defense
        if (system.defendWith.length > 0) {
            system.opposingDefenseStats = splitStatString(system.defendWith);
        } else {
            system.opposingDefenseStats = null;
        }
        // Descriptors
        if (system.descriptors.length > 0) {
            system.descriptorsSplit = splitStatString(system.descriptors);
            // Special check to make sure wands have "wand" as a descriptor as far as the system is concerned
            if (!system.descriptorsSplit.includes("wand") && item.name.toLowerCase().includes("wand")) {
                system.descriptorsSplit.push("wand");
            }
        } else {
            system.descriptorsSplit = null;
        }
        // Range
        system.rangeDistance = system.range in CommonSystemInfo.rangeBands ? CommonSystemInfo.rangePaces[system.range] : -1;
        if (system.threatens) {
            if (system.threatRangeField === "same") {
                system.threatRangeBand = system.range;
                system.threatDistance = system.rangeDistance;
            } else {
                system.threatRangeBand = system.threatRangeField;
                system.threatDistance = system.threatRangeBand in CommonSystemInfo.rangeBands ? CommonSystemInfo.rangePaces[system.threatRangeBand] : -1;
            }
        }
    }

    /**
     * Process Armor type specific data
     */
    _prepareArmorData(item, actor) {
        const system = item.system;

        // Armor
        if (system.armorDice.length > 0) {
            system.armorArray = findTotalDice(system.armorDice);
        } else {
            system.armorArray = [0, 0, 0, 0, 0];
        }
    }

    /**
     * Process Shield type specific data
     */
    _prepareShieldData(item, actor) {
        const system = item.system;

        // Shield
        if (system.coverDie.length > 0) {
            system.coverArray = findTotalDice(system.coverDie);
        } else {
            system.coverArray = [0, 0, 0, 0, 0];
        }
    }

    /**
     * Process Light Source type specific data
     */
    _prepareIlluminationData(item, actor) {

    }

    /**
     * Process Vehicle Station type specific data
     */
    _prepareVehicleStationData(item, actor) {
        const system = item.system;

        let resolvedCaptain = null;
        if (system.stationCaptain) {
            try {
                resolvedCaptain = fromUuidSync(system.stationCaptain);
            } catch (err) {
                console.warn(err);
            }
        }
        system.resolvedCaptain = resolvedCaptain;

        system.canUse = false;

        if (system.stationDicePool.length > 0) {
            let firstsplit = splitStatsAndBonus(system.stationDicePool);
            system.poolStats = firstsplit[0];
            system.poolArray = (firstsplit[1].length > 0 ? findTotalDice(firstsplit[1]) : null);
            system.canUse = true;
        } else {
            system.poolStats = [];
            system.poolArray = null;
        }
        if (system.stationDiceGifts.length > 0) {
            let giftsplit = splitStatString(system.stationDiceGifts);
            system.stationGifts = giftsplit;
            system.canUse = true;
        } else {
            system.stationGifts = [];
        }
    }

    /* -------------------------------------------- */
    /* Item Data Modification Functions             */
    /* -------------------------------------------- */

    /**
     * Set or toggle exhaustion in a gift, if able
     * @param {string} toggle "toggle" changes the state to the opposite, "true" or "false" set it to that state, otherwise errors out. "true" exhausts, "false" refreshes.
     * @param {boolean} sendToChat If true, send a message to chat about the new gift exhaust state
     * @returns {Promise<boolean | null>} Returns either whether gift is exhausted or not, or null in case of an error
     */
    async giftToggleExhaust(toggle = "toggle", sendToChat = false) {
        const item = this;
        const system = this.system;
        if (!(item.type === 'gift')) {
            console.error("Gift exhaust toggle attempted on a non-gift item: " + item.name);
            return null;
        }

        // If the gift does not exhaust when used, return out
        if (system.exhaustWhenUsed === false) {
            return null;
        }

        let endState = null;
        switch (toggle) {
            case "toggle":
                endState = !system.readied;
                break;
            case "true": // Exhausted
                endState = true;
                break;
            case "false": // Refreshed
                endState = false;
                break;
            default:
                console.error("Gift exhaust toggle defaulted! " + toggle);
                break;
        }

        if (endState === null) {
            return null;
        }

        const statechanging = (endState !== system.exhausted);
        if (statechanging) {
            await this.update({ "_id": this.id, "system.exhausted": endState });

            if (sendToChat) {
                let speaker = getMacroSpeaker(this.actor);
                let contents = "";
                if (endState) {
                    contents = `<div class="ironclaw2e"><header class="chat-item flexrow">
                <img class="item-image" src="${item.img}" title="${item.name}" width="20" height="20"/>
                <div class="chat-header-small">${game.i18n.format("ironclaw2e.dialog.exhaustGift.chatMessage", { "item": item.name })}</div>
                </header>
                </div>`;
                } else {
                    contents = `<div class="ironclaw2e"><header class="chat-item flexrow">
                <img class="item-image" src="${item.img}" title="${item.name}" width="20" height="20"/>
                <div class="chat-header-small">${game.i18n.format("ironclaw2e.dialog.refreshGift.chatMessage", { "item": item.name })}</div>
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

        return endState;
    }

    /**
     * Add a new special setting to a gift
     * @param {string} bonusType What kind of bonus to add
     */
    async giftAddSpecialSetting(bonusType = "attackBonus") {
        const item = this;
        const system = item.system;
        if (!(item.type === 'gift')) {
            console.error("Gift special setting adding attempted on a non-gift item: " + item.name);
            return;
        }

        if (typeof bonusType !== "string") {
            console.error("Gift special setting adding given a non-string: " + bonusType);
            return;
        }

        // Panic escape in case the special settings ever get corrupted
        if (!Array.isArray(system.specialSettings)) {
            console.warn("Gift special options are not an array somehow, resetting...: " + system.specialSettings);
            await this.update({ "system.specialSettings": [] });
        }

        let specialSettings = system.specialSettings;
        let setting = getGiftSpecialOptionPrototype(bonusType);
        if (setting === null) {
            console.error("Gift special setting adding had a null result with given bonus type: " + bonusType);
            return;
        }
        specialSettings.push(setting);

        return await this.update({ "system.specialSettings": specialSettings });
    }

    /**
     * Delete a certain special setting from a gift
     * @param {number} index Index of the setting
     */
    async giftDeleteSpecialSetting(index) {
        const item = this;
        const system = item.system;
        if (!(item.type === 'gift')) {
            console.error("Gift special setting deletion attempted on a non-gift item: " + item.name);
            return;
        }

        // Panic escape in case the special settings ever get corrupted
        if (!Array.isArray(system.specialSettings)) {
            console.warn("Gift special options are not an array somehow, resetting...: " + system.specialSettings);
            return await this.update({ "system.specialSettings": [] });
        }

        let specialSettings = system.specialSettings;
        specialSettings.splice(index, 1);

        return await this.update({ "system.specialSettings": specialSettings });
    }

    /**
     * Change a special setting type in a gift
     * @param {number} index Index of the setting
     * @param {string} settingmode Setting type to change into
     * @param {boolean} force Whether to force a change even into the same type
     */
    async giftChangeSpecialSetting(index, settingmode, force = false) {
        const item = this;
        const system = item.system;
        if (!(item.type === 'gift')) {
            console.error("Gift special setting change attempted on a non-gift item: " + item.name);
            return null;
        }

        // Panic escape in case the special settings ever get corrupted
        if (!Array.isArray(system.specialSettings)) {
            console.warn("Gift special options are not an array somehow, resetting...: " + system.specialSettings);
            return await this.update({ "system.specialSettings": [] });
        }

        let specialSettings = system.specialSettings;
        let oldSetting = specialSettings[index];

        // If the setting mode in the setting is the same as the settingmode for the function, and force is not set, return out
        if (oldSetting.settingMode === settingmode && force === false) {
            return null;
        }

        let newSetting = getGiftSpecialOptionPrototype(settingmode);

        // Go through the field names of the new setting and check whether the old setting has any same ones, for any that do, copy the data over
        for (let [key, field] of Object.entries(newSetting)) {
            if (key === "settingMode") continue; // Special skip to not accidentally copy over the setting type, just in case

            if (oldSetting.hasOwnProperty(key)) {
                newSetting[key] = oldSetting[key];
            }
        }

        specialSettings[index] = newSetting;
        return await this.update({ "system.specialSettings": specialSettings });
    }

    /**
     * Make sure the special settings array of the gift has no extra data haunting the system
     */
    async giftValidateSpecialSetting() {
        const item = this;
        const system = item.system;
        if (!(item.type === 'gift')) {
            console.error("Gift special setting validation attempted on a non-gift item: " + item.name);
            return null;
        }

        // Panic escape in case the special settings ever get corrupted
        if (!Array.isArray(system.specialSettings)) {
            console.warn("Gift special options are not an array somehow, resetting...: " + system.specialSettings);
            return await this.update({ "system.specialSettings": [] });
        }

        let specialSettings = [];

        // The actual data validation
        for (let i = 0; i < system.specialSettings.length; ++i) {
            let oldSetting = system.specialSettings[i];
            if (!oldSetting.settingMode) {
                console.error("A special bonus setting lacked a settingMode: " + this.name);
                return null;
            }

            let newSetting = getGiftSpecialOptionPrototype(oldSetting.settingMode);

            // Go through the field names of the new setting and check whether the old setting has any same ones, for any that do, copy the data over
            for (let [key, field] of Object.entries(newSetting)) {
                if (key === "settingMode") continue; // Special skip to not accidentally copy over the setting type, just in case

                if (oldSetting.hasOwnProperty(key)) {
                    newSetting[key] = oldSetting[key];
                }
            }

            specialSettings.push(newSetting);
        }

        if (specialSettings.length === 0) // Special exception to return the item in case the function was successful, but there was nothing to validate
            return this;
        return this.update({ "system.specialSettings": specialSettings });
    }

    /**
     * Change a field in a special setting
     * @param {number} index Index of the special setting
     * @param {string} name The field to change in the special setting
     * @param {any} value
     */
    async giftChangeSpecialField(index, name, value) {
        const item = this;
        const system = item.system;
        if (!(item.type === 'gift')) {
            console.error("Gift special setting change attempted on a non-gift item: " + item.name);
            return null;
        }

        let specialSettings = system.specialSettings;
        specialSettings[index][name] = value;
        return this.update({ "system.specialSettings": specialSettings });
    }

    /**
     * Get the gift this weapon is supposed to exhaust when used
     * @param {boolean} notifications Set to false to disable the missing gift warning
     * @returns {Ironclaw2EItem} The gift to exhaust
     */
    weaponGetGiftToExhaust(notifications = true) {
        const item = this;
        const system = item.system;
        if (!(item.type === 'weapon')) {
            console.error("Weapon get exhaust gift attempted on a non-weapon item: " + item.name);
            return;
        }

        if (!this.actor) {
            // If the item has no actor, skip this and simply return null
            return null;
        }

        if (system.exhaustGift && system.exhaustGiftName.length > 0) {
            // Could use a simple .getName(), but the function below is more typo-resistant
            const giftToExhaust = findInItems(this.actor?.items, system.exhaustGiftName, "gift");
            if (!giftToExhaust) {
                if (notifications) ui.notifications.warn(game.i18n.format("ironclaw2e.ui.weaponGiftExhaustFailure", { "name": item.name, "gift": system.exhaustGiftName, "actor": this.actor.name }));
                return null;
            }
            return giftToExhaust;
        }
        else {
            return null;
        }
    }

    /**
     * Get the weapon this weapon is supposed to be upgraded from, essentially stowing it while readying this weapon
     * @param {boolean} notifications Set to false to disable the missing weapon warning
     * @returns {Ironclaw2EItem} The weapon to upgrade from
     */
    weaponGetWeaponToUpgrade(notifications = true) {
        const item = this;
        const system = item.system;
        if (!(item.type === 'weapon')) {
            console.error("Weapon get weapon upgrade attempted on a non-weapon item: " + item.name);
            return;
        }

        if (!this.actor) {
            // If the item has no actor, skip this and simply return null
            return null;
        }

        if (system.upgradeWeapon && system.upgradeWeaponName.length > 0) {
            // Could use a simple .getName(), but the function below is more typo-resistant
            const weaponToUpgrade = findInItems(this.actor?.items, system.upgradeWeaponName, "weapon");
            if (!weaponToUpgrade) {
                if (notifications) ui.notifications.warn(game.i18n.format("ironclaw2e.ui.weaponUpgradeFindFailure", { "name": item.name, "weapon": system.upgradeWeaponName, "actor": this.actor.name }));
                return null;
            }
            return weaponToUpgrade;
        }
        else {
            return null;
        }
    }

    /**
     * Toggle the readiness of the weapon
     * @param {string} toggle The state to toggle to
     * @returns {Promise<boolean | null>} Returns either the state the weapon was set to, or null in case of an error
     */
    async weaponToggleReady(toggle = "toggle") {
        const item = this;
        const system = item.system;
        if (!(item.type === 'weapon')) {
            console.error("Weapon ready toggle attempted on a non-weapon item: " + item.name);
            return null;
        }

        let endState = null;
        switch (toggle) {
            case "toggle":
                endState = !system.readied;
                break;
            case "true":
                endState = true;
                break;
            case "false":
                endState = false;
                break;
            default:
                console.error("Weapon ready toggle defaulted! " + toggle);
                break;
        }

        if (endState !== null) {

            if (endState === true) {
                // Weapon gift exhausting
                if (system.exhaustGift && system.exhaustGiftWhenReadied) {
                    const sendToChat = game.settings.get("ironclaw2e", "sendWeaponReadyExhaustMessage");
                    const needsRefreshed = game.settings.get("ironclaw2e", "weaponExhaustNeedsRefreshed");
                    const exhaust = this.weaponGetGiftToExhaust();

                    // If the weapon has a gift to exhaust that can't be found or is exhausted, warn about it or pop a refresh request about it respectively
                    if (!exhaust) {
                        ui.notifications.warn(game.i18n.format("ironclaw2e.ui.weaponGiftExhaustAbort", { "name": item.name }));
                        return null;
                    } else if (needsRefreshed && exhaust?.system.giftUsable === false) { // If the weapon needs a refreshed gift to use and the gift is not refreshed, immediately pop up a refresh request on that gift
                        const confirmation = await exhaust?.popupGiftExhaustToggle(false);
                        if (confirmation !== false) {
                            return null;
                        }
                    }

                    const worked = await exhaust.giftToggleExhaust("true", sendToChat);
                    if (worked !== true) {
                        return null;
                    }
                }

                // Weapon upgrading from another
                if (system.upgradeWeapon && system.upgradeWeaponName) {
                    const upgrade = this.weaponGetWeaponToUpgrade();

                    // If the weapon has a weapon to upgrade from that can't be found or is stowed, warn about it or pop a ready request about it respectively
                    if (!upgrade) {
                        ui.notifications.warn(game.i18n.format("ironclaw2e.ui.weaponUpgradeFindAbort", { "name": item.name }));
                        return null;
                    } else if (upgrade?.system.readied === false) { // If the weapon needs a readied weapon to upgrade from and the weapon is not readied, immediately pop up a ready request on that weapon
                        const confirmation = await popupConfirmationBox("ironclaw2e.dialog.readyWeapon.upgradeTitle", "ironclaw2e.dialog.readyWeapon.upgradeHeader",
                            "ironclaw2e.dialog.ready", { "itemname": upgrade.name, "actorname": this.actor.name, "targetname": item.name });
                        if (confirmation.confirmed === true) {
                            if (await upgrade.weaponToggleReady("true") !== true) {
                                return null;
                            }
                        } else {
                            return null;
                        }
                    }

                    // Confirm taking the required action to upgrade the weapon
                    const upgrading = await popupConfirmationBox("ironclaw2e.dialog.upgradeWeapon.title", "ironclaw2e.dialog.upgradeWeapon.header",
                        "ironclaw2e.dialog.upgrade", { "itemname": item.name, "actorname": this.actor.name, "targetname": system.upgradeWeaponAction });

                    // If confirmed, actually stow the weapon this one is upgraded from, and add the given upgrade condition to the actor, if a condition is selected
                    if (upgrading.confirmed) {
                        const worked = await upgrade.weaponToggleReady("false");
                        if (worked === false) {
                            if (system.upgradeWeaponCondition) {
                                await this.actor.addEffect(system.upgradeWeaponCondition);
                            }
                        } else {
                            return null;
                        }
                    } else {
                        return null;
                    }
                }
            }

            // Actually update
            await this.update({ "_id": this.id, "system.readied": endState });
        }

        return endState;
    }

    /**
     * Weapon auto-stow
     */
    async weaponAutoStow() {
        const item = this;
        const system = item.system;
        if (!(item.type === 'weapon')) {
            console.error("Weapon ready toggle attempted on a non-weapon item: " + item.name);
            return;
        }

        if (!this.actor) {
            // Skip this function for items without actors
            return;
        }

        if (system.autoStow) {
            await this.weaponToggleReady("false");
        }
    }

    /**
     * Ready the weapon when it is used
     * @returns {Promise<boolean>} Returns whether the weapon is ready to use
     */
    async weaponReadyWhenUsed() {
        const item = this;
        const system = item.system;
        if (!(item.type === 'weapon')) {
            console.error("Weapon ready toggle attempted on a non-weapon item: " + item.name);
            return false;
        }

        // If the weapon is already readied, return true
        if (system.readied) {
            return true;
        }

        // If the weapon doesn't need to be readied, return true
        if (!system.readyWhenUsed) {
            return true;
        }

        const confirm = game.settings.get("ironclaw2e", "askReadyWhenUsed");
        if (confirm) {
            const confirmation = await popupConfirmationBox("ironclaw2e.dialog.readyWeapon.title", "ironclaw2e.dialog.readyWeapon.header", "ironclaw2e.dialog.ready", { "itemname": item.name, "actorname": this.actor.name });
            if (!confirmation.confirmed) {
                return false;
            }
        }

        const state = (await this.weaponToggleReady("true")) === true;
        return state;
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
        const item = this;
        const actorSys = this.actor ? this.actor.system : {};
        const itemSys = item.system;
        const directroll = checkQuickModifierKey();

        switch (item.type) {
            case 'gift':
                this.giftRoll();
                break;
            case 'weapon':
                let rolls = [];
                if (itemSys.canAttack) rolls.push(0);
                if (itemSys.canSpark) rolls.push(1);
                if (itemSys.canDefend) rolls.push(2);
                if (itemSys.canCounter) rolls.push(3);

                if (rolls.length === 1) {
                    this._itemRollSelection(rolls[0], directroll);
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
                this.update({ "system.worn": !itemSys.worn });
                break;
            case 'shield':
                this.update({ "system.held": !itemSys.held });
                break;
            default:
                this.sendInfoToChat();
                break;
        }
    }

    /**
     * Get the chat message flags for this item
     */
    getItemFlags({ useTactics = false } = {}) {
        const item = this;
        const itemSys = item.system;
        const actor = this.actor;

        let flags = { "ironclaw2e.itemId": this.id, "ironclaw2e.itemActorId": actor?.id, "ironclaw2e.itemTokenId": actor?.token?.id, "ironclaw2e.itemSceneId": actor?.token?.parent?.id };
        if (item.type === "weapon") {
            flags = mergeObject(flags, {
                "ironclaw2e.weaponName": item.name, "ironclaw2e.weaponDescriptors": itemSys.descriptorsSplit, "ironclaw2e.weaponEffects": itemSys.effectsSplit,
                "ironclaw2e.weaponAttackStats": itemSys.attackStats, "ironclaw2e.weaponEquip": itemSys.equip, "ironclaw2e.weaponRange": itemSys.range,
                "ironclaw2e.attackUsingTactics": useTactics
            });
            if (itemSys.multiAttackType) {
                flags = mergeObject(flags, {
                    "ironclaw2e.weaponMultiAttack": itemSys.multiAttackType, "ironclaw2e.weaponMultiRange": itemSys.multiAttackRange ?? null,
                });
            }
        }
        const foundToken = findActorToken(actor);
        if (foundToken) {
            const rangePenalty = actor.getRangePenaltyReduction(this);
            let userPos = { "x": foundToken.x, "y": foundToken.y };
            if (foundToken.elevation) userPos.elevation = foundToken.elevation;
            flags = mergeObject(flags, {
                "ironclaw2e.itemUserPos": userPos,
                "ironclaw2e.itemUserRangeReduction": rangePenalty.reduction, "ironclaw2e.itemUserRangeAutocheck": rangePenalty.autocheck
            });
        }

        return flags;
    }

    /** 
     *  Send information about the item to the chat as a message
     */
    async sendInfoToChat() {
        const item = this;
        const itemSys = item.system;
        const actor = this.actor;
        const confirmSend = game.settings.get("ironclaw2e", "confirmItemInfo");

        // Check whether the character even has Tactics to use, if not, set hasTactics to false to remove the Tactics checkbox from the chat message
        let hasTactics = actor?.system.skills?.tactics?.diceArray ? checkDiceArrayEmpty(actor.system.skills.tactics.diceArray) : false;
        if (itemSys.attackStats?.includes("tactics")) {
            hasTactics = false; // If the weapon has manually set Tactics in the attack stats, remove the checkbox
        }

        const foundCombatant = findActorToken(actor)?.combatant;
        // If a combatant for the current actor is found, check whether the current user's target is threatened through the combatant, and use the result for Tactics auto-check
        let useTactics = (foundCombatant ? foundCombatant.checkTacticsForTarget?.() : false) ?? false;
        const richDescription = itemSys.description ? await TextEditor.enrichHTML(itemSys.description, { async: true, secrets: false }) : "";

        const templateData = {
            "item": item,
            "itemSys": itemSys,
            "hasButtons": item.type === "weapon" || (item.type === "gift" && itemSys.canUse),
            "richDescription": richDescription,
            "standardDefense": checkStandardDefense(itemSys.defendWith),
            "hasActor": !!(actor),
            "actorId": actor?.id ?? null,
            "tokenId": actor?.token?.id ?? null,
            "sceneId": actor?.token?.parent?.id ?? null,
            "equipHandedness": (item.type === 'weapon' || item.type === 'shield' ? CommonSystemInfo.equipHandedness[itemSys.equip] : ""),
            "equipRange": (item.type === 'weapon' ? CommonSystemInfo.rangeBands[itemSys.range] : ""),
            "hasTactics": hasTactics,
            "useTactics": useTactics
        };

        const contents = await renderTemplate("systems/ironclaw2e/templates/chat/item-info.html", templateData);

        let flags = { "ironclaw2e.itemInfo": true };
        flags = mergeObject(flags, this.getItemFlags({ useTactics }));

        let chatData = {
            content: contents,
            speaker: getMacroSpeaker(actor),
            flags
        };
        ChatMessage.applyRollMode(chatData, game.settings.get("core", "rollMode"));

        if (confirmSend) {
            let confirmed = false;
            let dlog = new Dialog({
                title: game.i18n.format("ironclaw2e.dialog.chatInfo.itemInfo.title", { "name": item.name }),
                content: `
     <form>
      <h1>${game.i18n.format("ironclaw2e.dialog.chatInfo.itemInfo.header", { "name": item.name })}</h1>
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
     * @param {number} opposingsuccesses The already-rolled resisting successes, -1 means they haven't been rolled yet
     */
    automaticDamageCalculation(info, ignoreresist = false, onlyupdate = false, opposingsuccesses = -1) {
        if (!game.settings.get("ironclaw2e", "calculateAttackEffects")) {
            return null; // If the system is turned off, return out
        }
        if (!info) { // Return out in case the info turns out blank
            return null;
        }

        const item = this;
        const itemSys = item.system;
        if (item.type !== 'weapon') {
            console.error("A non-weapon type attempted to send Attack Data: " + item.name);
            return null;
        }
        if (itemSys.effect.length === 0) {
            return null; // If the weapon has no effects listed, return out
        }


        if (!info.tnData) { // If the roll info is in highest mode, assume the attack was a counter-attack, and set the flags accordingly
            let updatedata = {
                flags: {
                    "ironclaw2e.hangingAttack": "counter", "ironclaw2e.hangingWeapon": this.id, "ironclaw2e.hangingActor": this.actor?.id, "ironclaw2e.hangingToken": this.actor?.token?.id,
                    "ironclaw2e.hangingScene": this.actor?.token?.parent?.id, "ironclaw2e.hangingSlaying": itemSys.effectsSplit?.includes("slaying") ?? false
                }
            };
            info.message?.update(updatedata);
            return null; // Return out of a counter-attack
        }

        const successes = (isNaN(info.tnData.successes) ? 0 : info.tnData.successes);
        const ties = (isNaN(info.tnData.ties) ? 0 : info.tnData.ties);
        const success = successes > 0;
        let usedsuccesses = (success || itemSys.hasResist ? successes : ties); // Ties don't count for resisted weapons

        if (ignoreresist === false && itemSys.hasResist) { // If the weapon's attack is a resisted one, set the flags accordingly
            let updatedata = {
                flags: {
                    "ironclaw2e.hangingAttack": "resist", "ironclaw2e.hangingWeapon": this.id, "ironclaw2e.hangingActor": this.actor?.id, "ironclaw2e.hangingToken": this.actor?.token?.id,
                    "ironclaw2e.hangingScene": this.actor?.token?.parent?.id, "ironclaw2e.hangingSlaying": itemSys.effectsSplit?.includes("slaying") ?? false, "ironclaw2e.resistSuccess": success, "ironclaw2e.resistSuccessCount": usedsuccesses
                }
            };
            info.message?.update(updatedata);
            // If the resist has not yet been rolled, return out after setting the resist flags
            if (opposingsuccesses < 0 && !itemSys.attackAutoHits)
                return null;
        }
        else { // Else, treat it as a normal attack and set the flags to store the information for future reference
            let updatedata = {
                flags: {
                    "ironclaw2e.hangingAttack": "attack", "ironclaw2e.hangingWeapon": this.id, "ironclaw2e.hangingActor": this.actor?.id, "ironclaw2e.hangingToken": this.actor?.token?.id,
                    "ironclaw2e.hangingScene": this.actor?.token?.parent?.id, "ironclaw2e.hangingSlaying": itemSys.effectsSplit?.includes("slaying") ?? false, "ironclaw2e.attackSuccess": success, "ironclaw2e.attackSuccessCount": usedsuccesses
                }
            };
            info.message?.update(updatedata);
        }

        // Send to chat if there are successes, failures are displayed as well, or the attack is an explosion
        const toChat = usedsuccesses > 0 || game.settings.get("ironclaw2e", "calculateDisplaysFailed") || itemSys.attackAutoHits;
        if (onlyupdate) {
            return null; // Return out to not send anything in update mode
        } else if (toChat) {
            return this.attackToChat({ success, "rawsuccesses": usedsuccesses, "opposingrolled": opposingsuccesses >= 0, "opposingsuccesses": opposingsuccesses });
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
        let forceSlaying = false;
        const success = message.getFlag("ironclaw2e", "resistSuccess");
        const successes = message.getFlag("ironclaw2e", "resistSuccessCount");
        const isSlaying = this.system.effectsSplit?.includes("slaying") ?? false;

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
      ${!isSlaying /* A bit confusing-looking, but simply, only add this part if the weapon isn't already a slaying weapon*/ ? `
      <div class="form-group">
        <label class="normal-label">${game.i18n.localize("ironclaw2e.dialog.resistResolve.slaying")}</label>
        <input type="checkbox" id="slaying" name="slaying" value="1"></input>
      </div>
      ` : ""}
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
                        let SLAYING = html.find('[name=slaying]')[0];
                        forceSlaying = SLAYING?.checked ?? false;
                        resolve(opposing);
                    } else {
                        resolve(null);
                    }
                }
            }, { focus: false });
            dlog.render(true);
        });
        let opposingsuccesses = await resolvedopfor;
        if (opposingsuccesses === null) return; // Return out if the user just cancels the prompt

        this.attackToChat({ "success": successes > opposingsuccesses, "rawsuccesses": successes, "opposingrolled": true, "opposingsuccesses": opposingsuccesses, "forceslaying": forceSlaying });
    }

    /**
     * Resolve a resisted attack as if it were just an ordinary attack roll, in case it was countered and turned into one
     */
    resolveAsNormalAttack(message, forceslaying = false) {
        const success = message.getFlag("ironclaw2e", "resistSuccess");
        const successes = message.getFlag("ironclaw2e", "resistSuccessCount");

        this.attackToChat({ "success": success, "rawsuccesses": successes, forceslaying });
    }

    /**
     * Resend a normal attack to chat
     */
    resendNormalAttack(message, forceslaying = false) {
        const success = message.getFlag("ironclaw2e", "attackSuccess");
        const successes = message.getFlag("ironclaw2e", "attackSuccessCount");

        this.attackToChat({ "success": success, "rawsuccesses": successes, forceslaying });
    }

    /**
     * Send the attack damage to chat, calculating damage based on the given successes
     * @param {boolean} success Whether the attack was a success, or a tie
     * @param {number} rawsuccesses The number of successes, or ties in case the attack was a tie
     * @param {boolean} opposingrolled Whether the opposing successes have been rolled
     * @param {number} opposingsuccesses The opposing successes
     * @param {boolean} forceslaying Whether to force the attack to have the slaying trait, for resolving attacks against vulnerabilities
     */
    async attackToChat({ success = false, rawsuccesses = 0, opposingrolled = false, opposingsuccesses = 0, forceslaying = false } = {}) {
        if (!game.settings.get("ironclaw2e", "calculateAttackEffects")) {
            return null; // If the system is turned off, return out
        }
        const item = this;
        const itemSys = item.system;

        const usedsuccesses = opposingrolled ? rawsuccesses - opposingsuccesses : rawsuccesses;
        const successfulAttack = usedsuccesses > 0 || itemSys.attackAutoHits;
        const negativeSuccesses = usedsuccesses <= 0; // More like non-positive, but I prefer two-word variable names

        const flat = itemSys.damageFlat ?? false;
        const slaying = forceslaying || (itemSys.effectsSplit?.includes("slaying") ?? false);
        const impaling = itemSys.effectsSplit?.includes("impaling") ?? false;
        const critical = itemSys.effectsSplit?.includes("critical") ?? false;
        const penetrating = itemSys.effectsSplit?.includes("penetrating") ?? false;
        const weak = itemSys.effectsSplit?.includes("weak") ?? false;

        // Account for multiple damage-multiplying effects
        const effectCount = (slaying ? 1 : 0) + (impaling ? 1 : 0) + (critical ? 1 : 0);
        let hasMultipleBaseEffects = false;
        let combinedDamage = 0;
        let combinedImpalingDamage = 0;
        if (effectCount >= 2) {
            // The damage calculcations might look a little off, it's to avoid calculating the default damage increase from successes more than once
            if (slaying && critical) {
                hasMultipleBaseEffects = true;
                combinedDamage = itemSys.damageEffect + (usedsuccesses * 2) + Math.floor(usedsuccesses * 0.5);
            }
            if (impaling) {
                combinedImpalingDamage = itemSys.damageEffect + (usedsuccesses * 2) + (slaying ? (usedsuccesses) : 0) + (critical ? Math.floor(usedsuccesses * 0.5) : 0);
            }
        }

        const templateData = {
            "item": item,
            "itemSys": itemSys,
            "successfulAttack": successfulAttack,
            "hasResist": itemSys.hasResist,
            "success": success,
            "negativeSuccesses": negativeSuccesses,
            "resultStyle": "color:" + (successfulAttack ? (success || itemSys.attackAutoHits ? CommonSystemInfo.resultColors.success : CommonSystemInfo.resultColors.tie) : CommonSystemInfo.resultColors.failure),

            "isFlat": flat,
            "isSlaying": slaying,
            "isImpaling": impaling,
            "isCritical": critical,
            "isNormal": itemSys.damageEffect >= 0,
            "isConditional": itemSys.damageEffect < 0,
            "isPenetrating": penetrating,
            "isWeak": weak,
            "doubleDamage": itemSys.damageEffect + (usedsuccesses * 2),
            "criticalDamage": itemSys.damageEffect + Math.floor(usedsuccesses * 1.5),
            "normalDamage": itemSys.damageEffect + usedsuccesses,
            "flatDamage": itemSys.damageEffect,

            "hasMultipleMultipliers": effectCount >= 2,
            hasMultipleBaseEffects,
            combinedDamage,
            combinedImpalingDamage
        };

        const contents = await renderTemplate("systems/ironclaw2e/templates/chat/damage-info.html", templateData);

        let flags = { "ironclaw2e.attackDamageInfo": true, "ironclaw2e.attackDamageAutoHits": itemSys.attackAutoHits, "ironclaw2e.attackDamageDefense": itemSys.opposingDefenseStats, "ironclaw2e.attackDamageSlaying": slaying };
        flags = mergeObject(flags, this.getItemFlags());

        let chatData = {
            content: contents,
            speaker: getMacroSpeaker(this.actor),
            flags
        };
        ChatMessage.applyRollMode(chatData, game.settings.get("core", "rollMode"));
        return CONFIG.ChatMessage.documentClass.create(chatData);
    }

    /* -------------------------------------------- */
    /*  Item Type Specific Rolls                    */
    /* -------------------------------------------- */

    // Gift Rolls

    giftRoll(directroll = false) {
        const item = this;
        const system = item.system;

        if (!(item.type === 'gift')) {
            console.error("Gift roll attempted on a non-gift item: " + item.name);
            return;
        }

        if (system.canUse === false) {
            return;
        }
        if (system.exhaustWhenUsed === false || system.exhausted === false) {
            if (system.giftStats || system.giftArray) // Roll the gift
                this.genericItemRoll(system.giftStats, system.defaultTN, item.name, system.giftArray, 0, { directroll }, (system.exhaustWhenUsed ? (x => { this.giftToggleExhaust("true"); }) : null));
            else if (system.exhaustWhenUsed) // Popup an exhaust request
                this.popupExhaustGift();
            else if (system.extraSense === true && CommonSystemInfo.extraSenses[system.extraSenseName]?.visionName) { // Toggle vision
                if (this.actor)
                    this.actor.changeVisionMode(this, 2);
            }
        }
        else if (system.exhaustWhenUsed === true && system.exhausted === true) {
            this.popupRefreshGift();
        }
    }

    // Weapon Rolls

    /**
     * Select the correct weapon roll funtion to call based on the received integer
     * @param {number} selection
     * @param {boolean} directroll Whether to skip the popup dialog
     * @private
     */
    _itemRollSelection(selection, directroll = false) {
        switch (selection) {
            case 0:
                this.attackRoll(directroll);
                break;
            case 1:
                this.sparkRoll(directroll);
                break;
            case 2:
                this.defenseRoll(directroll);
                break;
            case 3:
                this.counterRoll(directroll);
                break;
            default:
                console.error("Defaulted weapon roll type: " + this);
                break;
        }
    }

    /**
     * Weapon attack roll function
     * @param {boolean} directroll Whether to attempt to roll without a dialog
     * @param {boolean} ignoreresist Ignore the resisted aspect of the attack
     * @param {number} presettn The TN to use
     * @param {number} opposingsuccesses The number of opposing successes for resisted attacks
     */
    async attackRoll(directroll = false, ignoreresist = false, presettn = 3, opposingsuccesses = -1, { sourcemessage = null, defendermessage = null, addtactics = false } = {}) {
        const item = this;
        const actor = this.actor ? this.actor : {};
        const itemSys = item.system;

        if (!(item.type === 'weapon')) {
            console.error("Attack roll attempted on a non-weapon item: " + item.name);
            return;
        }

        // Make sure this weapon can actually attack
        if (itemSys.canAttack === false) {
            return;
        }

        // If the weapon isn't readied and auto-ready is toggled on
        if (this.actor && !itemSys.readied && itemSys.readyWhenUsed) {
            const usable = await this.weaponReadyWhenUsed();
            if (!usable) {
                return; // If the weapon is not usable, return out
            }
        }

        // Grab the user's target
        /*let target = null;
        if (defendermessage) {
            target = getTokenFromSpeaker(defendermessage.speaker);
        } else if (game.user.targets?.size > 0) {
            [target] = game.user.targets;
        }*/
		
		// TODO : Set a custom flag so that I can switch the system between RAW and my custom rolling
		let target = 3;

        // If the attack should roll tactics too, put them in the used stats
        const usedStats = [...itemSys.attackStats];
        if (addtactics) {
            usedStats.push("tactics");
        }

        // Prepare the relevant data
        const exhaust = this.weaponGetGiftToExhaust();
        const canQuickroll = itemSys.hasResist && !ignoreresist;
        const sendToChat = game.settings.get("ironclaw2e", "sendWeaponExhaustMessage");
        const donotdisplay = game.settings.get("ironclaw2e", "calculateDoesNotDisplay");
        const needsRefreshed = game.settings.get("ironclaw2e", "weaponExhaustNeedsRefreshed");
        const callback = (async x => {
            if (exhaust) exhaust.giftToggleExhaust("true", sendToChat);
            await item.weaponAutoStow();
            const foo = await item.automaticDamageCalculation(x, ignoreresist, donotdisplay, opposingsuccesses);
            if (sourcemessage && foo) Ironclaw2EItem.transferTemplateFlags(sourcemessage, foo);
        });

        // If the weapon has a gift to exhaust that can't be found or is exhausted, warn about it or pop a refresh request about it respectively instead of the roll
        if (itemSys.exhaustGift && !itemSys.exhaustGiftWhenReadied && !exhaust) {
            ui.notifications.warn(game.i18n.format("ironclaw2e.ui.weaponGiftExhaustAbort", { "name": item.name }));
        } else if (itemSys.exhaustGift && !itemSys.exhaustGiftWhenReadied && needsRefreshed && exhaust?.system.giftUsable === false) {
            // If the weapon needs a refreshed gift to use and the gift is not refreshed, immediately pop up a refresh request on that gift
            exhaust.popupRefreshGift();
        } else {
            // Actually roll
            this.genericItemRoll(usedStats, presettn, item.name, itemSys.attackArray, 2, { "directroll": canQuickroll && directroll, target }, callback);
        }
    }

    /**
     * Weapon defense roll function
     * @param {boolean} directroll Whether to attempt to roll without a dialog
     * @param {object} otheritem The other side's data
     * @param {string} extradice Extra dice
     */
    async defenseRoll(directroll = false, otheritem = null, extradice = "") {
        const item = this;
        const actor = this.actor ? this.actor : {};
        const itemSys = item.system;

        if (!(item.type === 'weapon')) {
            console.error("Defense roll attempted on a non-weapon item: " + item.name);
            return;
        }

        // Make sure the weapon can actually defend
        if (itemSys.canDefend === false) {
            return;
        }

        // If the weapon isn't readied and auto-ready is toggled on
        if (this.actor && !itemSys.readied && itemSys.readyWhenUsed) {
            const usable = await this.weaponReadyWhenUsed();
            if (!usable) {
                return; // If the weapon is not usable, return out
            }
        }

        // Pop the roll
        this.genericItemRoll(itemSys.defenseStats, -1, item.name, itemSys.defenseArray, 1, { directroll, otheritem, extradice },
            (x => { Ironclaw2EActor.addCallbackToAttackMessage(x?.message, otheritem?.messageId); }));
    }

    /**
     * Weapon counter roll function
     * @param {boolean} directroll Whether to attempt to roll without a dialog
     * @param {object} otheritem The other side's data
     * @param {string} extradice Extra dice
     */
    async counterRoll(directroll = false, otheritem = null, extradice = "") {
        const item = this;
        const actor = this.actor ? this.actor : {};
        const itemSys = item.system;

        if (!(item.type === 'weapon')) {
            console.error("Counter roll attempted on a non-weapon item: " + item.name);
            return;
        }

        // Make sure the weapon can actually counter
        if (itemSys.canCounter === false) {
            return;
        }

        // If the weapon isn't readied and auto-ready is toggled on
        if (this.actor && !itemSys.readied && itemSys.readyWhenUsed) {
            const usable = await this.weaponReadyWhenUsed();
            if (!usable) {
                return; // If the weapon is not usable, return out
            }
        }

        // Prepare the relevant data
        const exhaust = this.weaponGetGiftToExhaust();
        const sendToChat = game.settings.get("ironclaw2e", "sendWeaponExhaustMessage");
        const needsRefreshed = game.settings.get("ironclaw2e", "weaponExhaustNeedsRefreshed");
        const callback = (async x => {
            if (exhaust) exhaust.giftToggleExhaust("true", sendToChat);
            await item.weaponAutoStow();
            await item.automaticDamageCalculation(x);
            Ironclaw2EActor.addCallbackToAttackMessage(x?.message, otheritem?.messageId);
        });

        // If the weapon has a gift to exhaust that can't be found or is exhausted, warn about it or pop a refresh request about it respectively instead of the roll
        if (itemSys.exhaustGift && !itemSys.exhaustGiftWhenReadied && !exhaust) {
            ui.notifications.warn(game.i18n.format("ironclaw2e.ui.weaponGiftExhaustAbort", { "name": item.name }));
        } else if (itemSys.exhaustGift && !itemSys.exhaustGiftWhenReadied && needsRefreshed && exhaust?.system.giftUsable === false) {
            // If the weapon needs a refreshed gift to use and the gift is not refreshed, immediately pop up a refresh request on that gift
            exhaust.popupRefreshGift();
        } else {
            // Actually roll
            this.genericItemRoll(itemSys.counterStats, -1, item.name, itemSys.counterArray, 3, { directroll, otheritem, extradice }, callback);
        }
    }

    /**
     * Weapon spark roll function
     * @param {boolean} directroll Whether to attempt to roll without a dialog
     */
    async sparkRoll(directroll = false) {
        const item = this;
        const actor = this.actor ? this.actor : {};
        const system = item.system;

        if (!(item.type === 'weapon')) {
            console.error("Spark roll attempted on a non-weapon item: " + item.name);
            return;
        }

        // Make sure the weapon has a spark roll
        if (system.canSpark === false) {
            return;
        }

        // If the weapon isn't readied and auto-ready is toggled on
        if (this.actor && !system.readied && system.readyWhenUsed) {
            const usable = await this.weaponReadyWhenUsed();
            if (!usable) {
                return; // If the weapon is not usable, return out
            }
        }

        let roll = null;
        // Depending on the directroll setting, either show the simple dialog or do the roll automatically
        if (!directroll) {
            roll = await rollHighestOneLine(system.sparkDie, game.i18n.localize("ironclaw2e.dialog.sparkRoll.label"), "ironclaw2e.dialog.sparkRoll.title", this.actor);
        } else {
            const foo = findTotalDice(system.sparkDie);
            roll = await CardinalDiceRoller.rollHighestArray(foo, game.i18n.localize("ironclaw2e.dialog.sparkRoll.label"), this.actor);
        }
        // In case the spark botches, check the settings and if set, automatically reduce it by one level
        if (roll && roll.highest === 1) {
            const autoDwindle = game.settings.get("ironclaw2e", "sparkDieAutoDwindle");
            if (autoDwindle) {
                const newDie = reduceDiceStringSet(system.sparkArray, 1, true);
                await this.update({ "_id": this.id, "system.sparkDie": newDie });
            }
        }
    }

    /**
     * Common massive function to process roll data and send it to the actor's popup roll function
     * @param {string[]} stats Skills to autocheck on the dialog
     * @param {number} tn Target number of the roll, -1 if highest
     * @param {string} diceid What to name the item dice
     * @param {number[]} dicearray The dice array of the item being rolled
     * @param {boolean} directroll Whether the roll is a direct one without a popup
     * @param {number} rolltype What type of popup function to use for the roll, mostly to allow automatic use gifts through special case hacks
     * @param {Object} otheritem The opposing item for this roll
     * @param {Function} callback The function to execute after the dice are rolled
     */
    genericItemRoll(stats, tn, diceid, dicearray, rolltype = 0, { directroll = false, otheritem = null, target = null, extradice = "" } = {}, callback = null) {
        const system = this.system;

        let tnyes = (tn > 0);
        let usedtn = (tn > 0 ? tn : 3);
        if (this.actor) {
            // If the weapon has separate dice, add a new dice field to the popup dialog construction
            let formconstruction = ``;
            let moredice = null;
            if (Array.isArray(dicearray)) {
                moredice = formDicePoolField(dicearray, diceid, `${diceid}: ${reformDiceString(dicearray, true)}`, true, { "itemid": this.id });
            }

            // Prepare the actual dice input object separately from the roll types
            formconstruction = (moredice ? moredice.otherinputs : "");
            const diceinput = {
                "prechecked": stats, "tnyes": tnyes, "tnnum": usedtn, "otherkeys": (moredice ? moredice.otherkeys : new Map()), "otherdice": (moredice ? moredice.otherdice : new Map()),
                "othernames": (moredice ? moredice.othernames : new Map()), "otherinputs": formconstruction, "otherbools": (moredice ? moredice.otherbools : new Map()), "otherlabel": "", "extradice": extradice
            };

            switch (rolltype) {
                case 0: // Generic gift roll
                    diceinput.otherlabel = this.name + " " + game.i18n.localize("ironclaw2e.chatInfo.itemInfo.giftRoll") + (system.exhaustWhenUsed ? ", " + game.i18n.localize("ironclaw2e.chatInfo.itemInfo.gift") + " <strong>" + game.i18n.localize("ironclaw2e.chatInfo.itemInfo.exhausted") + "</strong>" : ": ");
                    this.actor.basicRollSelector(diceinput, { directroll }, callback);
                    break;
                case 1: // Parry roll
                    diceinput.otherlabel = this.name + " " + game.i18n.localize("ironclaw2e.chatInfo.itemInfo.parryRoll") + ": ";
                    this.actor.popupDefenseRoll(diceinput, { directroll, "isparry": true, otheritem }, this, callback);
                    break;
                case 2: // Attack roll
                    diceinput.otherlabel = this.name + " " + game.i18n.localize("ironclaw2e.chatInfo.itemInfo.attackRoll") + (system.effect ? ", " + game.i18n.localize("ironclaw2e.chatInfo.itemInfo.effect") + ": " + system.effect +
                        (system.opposingDefenseStats?.length > 0 ? ", " + (system.hasResist ? game.i18n.localize("ironclaw2e.chatInfo.itemInfo.resistWith") + " " + system.defendWith + " vs. 3 " : game.i18n.localize("ironclaw2e.chatInfo.itemInfo.opposingDefense") + ": " + game.i18n.localize("ironclaw2e.chatInfo.itemInfo.attack") + " vs. " + system.defendWith) : "") : ": ");
                    if (this.weaponGetGiftToExhaust()?.system.giftUsable === false) formconstruction += `<strong>${game.i18n.localize("ironclaw2e.dialog.dicePool.giftExhausted")}</strong>` + "\n";
                    this.actor.popupAttackRoll(diceinput, { directroll, target }, this, callback);
                    break;
                case 3: // Counter roll
                    diceinput.otherlabel = this.name + " " + game.i18n.localize("ironclaw2e.chatInfo.itemInfo.counterRoll") + (system.effect ? ", " + game.i18n.localize("ironclaw2e.chatInfo.itemInfo.effect") + ": " + system.effect : ": ");
                    if (this.weaponGetGiftToExhaust()?.system.giftUsable === false) formconstruction += `<strong>${game.i18n.localize("ironclaw2e.dialog.dicePool.giftExhausted")}</strong>` + "\n";
                    this.actor.popupCounterRoll(diceinput, { directroll, otheritem }, this, callback);
                    break;
                default:
                    console.warn("genericItemRoll defaulted when selecting a roll: " + rolltype);
                    this.actor.basicRollSelector(diceinput, { directroll }, callback);
                    break;
            }

        }
        else if (game.user.isGM) {
            // For rolls on items without actors
            const results = rollVariableOneLine(tnyes, usedtn, dicearray ? reformDiceString(dicearray) : "");
            // Anonymous async function to handle the callback
            (async function () {
                const foo = await results;
                if (foo && callback) callback(foo);
            })();
        }
    }

    /**
     * Roll a vehicle's station roll with either the selected actor or the default actor of the vehicle
     * @param {boolean} directroll
     * @param {string} extradice
     */
    vehicleStationRoll(directroll = false, extradice = "") {
        const item = this;
        const actor = this.actor ? this.actor : {};
        const itemSys = item.system;
        const preferCaptain = game.settings.get("ironclaw2e", "vehicleStationCaptainOverride");

        if (!(item.type === 'vehicleStation')) {
            console.error("Station roll attempted on a non-station item: " + item.name);
            return;
        }

        // Make sure the station can actually be used
        if (itemSys.canUse === false) {
            return;
        }

        let requestActor = null;
        if (preferCaptain) {
            // Check if the station has a captain explicitly set and successfully resolved
            // Then check if the current selected actor exists and is able to roll the station's pool
            requestActor = itemSys.resolvedCaptain ?? null;
            if (!requestActor || !(requestActor?.type === 'character' || requestActor?.type === 'mook' || requestActor?.type === 'beast')) {
                requestActor = getSpeakerActor();
            }
        } else {
            // Check if the current selected actor exists and is able to roll the station's pool
            // Then check if the station has a captain explicitly set and successfully resolved
            requestActor = getSpeakerActor();
            if (!requestActor || !(requestActor?.type === 'character' || requestActor?.type === 'mook' || requestActor?.type === 'beast')) {
                requestActor = itemSys.resolvedCaptain ?? null;
            }
        }
        // If not, check if the vehicle has a default crew selected and successfully resolved
        if (!requestActor || !(requestActor?.type === 'character' || requestActor?.type === 'mook' || requestActor?.type === 'beast')) {
            requestActor = actor.system.resolvedDefaultCrew ?? null;
        }
        // If the actor still doesn't exist, cancel and pop a warning message
        if (!requestActor || !(requestActor?.type === 'character' || requestActor?.type === 'mook' || requestActor?.type === 'beast')) {
            ui.notifications.warn("ironclaw2e.ui.actorNotFoundForMacro", { localize: true });
            return null;
        }

        // Currently just hardcode the vehicle skill limit
        let usedLimit = "Vehicles";

        const giftSetup = requestActor.requestedGiftDialogConstruction(itemSys.stationGifts);
        const finalSetup = Array.isArray(itemSys.poolArray) ?
            formDicePoolField(itemSys.poolArray, item.name, `${item.name}: ${reformDiceString(itemSys.poolArray, true)}`, true, { "itemid": this.id }, giftSetup) :
            giftSetup;
        requestActor.basicRollSelector({
            "tnyes": true, "tnnum": 3, "prechecked": itemSys.poolStats, "otherkeys": finalSetup.otherkeys,
            "otherdice": finalSetup.otherdice, "othernames": finalSetup.othernames, "otherbools": finalSetup.otherbools, "otherinputs": finalSetup.otherinputs, "limitvalue": usedLimit,
            "extradice": extradice, "otherlabel": game.i18n.format("ironclaw2e.chatInfo.vehicleStation.rollLabel", { "station": item.name, "user": getMacroSpeaker(requestActor).alias })
        }, { "directroll": directroll });

        // TODO: Add the post-roll function to process successes and post a chat message where the player can select which station roll result to use
    }

    /* -------------------------------------------- */
    /*  Item Popup Functions                        */
    /* -------------------------------------------- */

    /**
     * Pop up a dialog box to confirm changing the exhaustion state of the gift
     * @param {boolean} mode What state to change to, true for Exhausted and false for Refreshed
     */
    async popupGiftExhaustToggle(mode) {
        if (this.type !== "gift") {
            console.error("Tried to set exhaust on a non-gift item: " + this);
            return null;
        }

        const item = this;
        const speaker = getMacroSpeaker(this.actor);

        const sendToChat = game.settings.get("ironclaw2e", "defaultSendGiftExhaust");
        const title = mode ? "ironclaw2e.dialog.exhaustGift.title" : "ironclaw2e.dialog.refreshGift.title";
        const message = mode ? "ironclaw2e.dialog.exhaustGift.header" : "ironclaw2e.dialog.refreshGift.header";
        const button = mode ? "ironclaw2e.dialog.exhaust" : "ironclaw2e.dialog.refresh";

        const confirmation = await popupConfirmationBox(title, message, button, { "includesend": true, "senddefault": sendToChat, "itemname": item.name, "actorname": speaker.alias });

        if (confirmation.confirmed) {
            return await this.giftToggleExhaust(mode.toString(), confirmation.chatSent);
        }
        return null;
    }

    /**
     * Pop up a dialog box to confirm refreshing a gift
     */
    popupRefreshGift() {
        return this.popupGiftExhaustToggle(false);
    }

    /**
     * Pop up a dialog box to confirm exhausting a gift
     */
    popupExhaustGift() {
        return this.popupGiftExhaustToggle(true);
    }

    /**
     * Pop up a dialog box to pick what way to use a weapon
     */
    popupWeaponRollType() {
        if (this.type !== "weapon")
            return console.error("Tried to popup a weapon roll question a non-weapon item: " + this);

        const item = this;
        const itemSys = item.system;
        const exhaust = this.weaponGetGiftToExhaust();

        // If the weapon has been marked to exhaust a gift, but no such gift is found, pop a warning
        if (itemSys.exhaustGift && !exhaust) {
            ui.notifications.warn(game.i18n.format("ironclaw2e.ui.weaponGiftExhaustFailure", { "name": item.name, "gift": system.exhaustGiftName, "actor": this.actor.name }));
        }

        // Check if the weapon has an auto-exhaust gift and whether all possible uses would exhaust the gift
        if (exhaust && !itemSys.canDefend && !itemSys.canSpark) {
            const needsRefreshed = game.settings.get("ironclaw2e", "weaponExhaustNeedsRefreshed");
            // If the weapon needs a refreshed gift to use and the gift is not refreshed, immediately pop up a refresh request on that gift
            if (needsRefreshed && exhaust?.system.giftUsable === false) {
                exhaust?.popupRefreshGift();
                return;
            }
        }

        let first = null;
        let constructionstring = `<div class="form-group">
	   <div class="form-group">`;

        if (itemSys.canAttack) {
            constructionstring += `<label>${game.i18n.localize("ironclaw2e.attack")}:</label>
	    <input type="radio" id="attack" name="weapon" value="0" ${first ? "" : "checked"}></input>`;
            first = first || "attack";
        }
        if (itemSys.canSpark) {
            constructionstring += `<label>${game.i18n.localize("ironclaw2e.spark")}:</label>
	    <input type="radio" id="spark" name="weapon" value="1" ${first ? "" : "checked"}></input>`;
            first = first || "spark";
        }
        if (itemSys.canDefend) {
            constructionstring += `<label>${game.i18n.localize("ironclaw2e.parry")}:</label>
	    <input type="radio" id="defend" name="weapon" value="2" ${first ? "" : "checked"}></input>`;
            first = first || "defend";
        }
        if (itemSys.canCounter) {
            constructionstring += `<label>${game.i18n.localize("ironclaw2e.counter")}:</label>
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
      <h1>${game.i18n.format("ironclaw2e.dialog.weaponRoll.header", { "item": this.name, "actor": this.actor?.name })}</h1>
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
                    const directroll = checkQuickModifierKey();
                    let typestring = html.find('input[name=weapon]:checked')[0].value;
                    let rolltype = 0; if (typestring.length !== 0) rolltype = parseInt(typestring);
                    if (Number.isInteger(rolltype)) {
                        this._itemRollSelection(rolltype, directroll);
                    }
                }
            }
        }, { focus: false });
        dlog.render(true);
    }
}
