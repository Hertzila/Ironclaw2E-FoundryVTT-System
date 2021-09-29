import { findTotalDice } from "../helpers.js";
import { addArrays } from "../helpers.js";
import { makeStatCompareReady } from "../helpers.js";
import { reformDiceString } from "../helpers.js";
import { convertCamelCase } from "../helpers.js";
import { getMacroSpeaker } from "../helpers.js";
import { findActorToken } from "../helpers.js";
import { findInItems } from "../helpers.js";
import { checkForPrechecked } from "../helpers.js";
import { nullCheckConcat } from "../helpers.js";
import { parseSingleDiceString } from "../helpers.js";
import { checkDiceArrayIndex } from "../helpers.js";
import { getDiceArrayMaxValue } from "../helpers.js";
import { CommonConditionInfo } from "../conditions.js";
import { checkApplicability } from "../helpers.js";
import { compareDiceArrays } from "../helpers.js";
// For condition management
import { hasConditionsIronclaw } from "../conditions.js";
import { getConditionNamesIronclaw } from "../conditions.js";
import { addConditionsIronclaw } from "../conditions.js";
import { removeConditionsIronclaw } from "../conditions.js";
// The rest are for the supermassive function
import { rollTargetNumber } from "../dicerollers.js";
import { rollHighest } from "../dicerollers.js";
import { enforceLimit } from "../helpers.js";
import { burdenedLimitedStat } from "../helpers.js";

/**
 * Extend the base Actor entity by defining a custom data necessary for the Ironclaw system
 * @extends {Actor}
 */
export class Ironclaw2EActor extends Actor {

    async _preCreate(data, options, user) {
        const autoPrototypeSetup = game.settings.get("ironclaw2e", "autoPrototypeSetup");
        if (!autoPrototypeSetup) // If not enabled, immediately return out of the function
            return;

        data.token = {};
        data.token.displayName = 20;

        if (data.type === 'character') {
            data.token.actorLink = true;
            data.token.vision = true;
        }

        this.data.update(data);
    }

    /** @override
     * Perform any last data modifications after super.prepareData has finished executing
     */
    prepareData() {
        // Performs the following, in order: data reset, prepareBaseData(), prepareEmbeddedEntities(), prepareDerivedData()
        super.prepareData();
        const actorData = this.data;

        // Automatic Encumbrance Management
        this._encumbranceAutoManagement(actorData);
    }

    /* -------------------------------------------- */
    /* Process Embedded                             */
    /* -------------------------------------------- */

    /** @override
     * Process the embedded entities data, mostly for lists
     */
    prepareEmbeddedEntities() {
        super.prepareEmbeddedEntities();
        const actorData = this.data;

        this._prepareExtraCareerData(actorData);
        this._prepareGiftData(actorData);
    }

    /**
     * Prepare Extra Career item data
     */
    _prepareExtraCareerData(actorData) {
        const data = actorData.data;

        // Extra Career additions
        const extraCareers = this.items.filter(element => element.data.type === 'extraCareer');
        if (extraCareers.length > 0) {
            data.hasExtraCareers = true;
            extraCareers.sort((a, b) => a.data.sort - b.data.sort);
            let ids = [];
            extraCareers.forEach(x => ids.push(x.id));
            data.extraCareerIds = ids;
        }
        else
            data.hasExtraCareers = false;
    }

    /**
     * Prepare Gift item data
     */
    _prepareGiftData(actorData) {
        const data = actorData.data;

        const specialGifts = this.items.filter(element => element.data.type === 'gift' && element.data.data.specialSettings?.length > 0);
        if (specialGifts.length > 0) {
            data.processingLists = {}; // If any of the actor's gifts have special settings, add the holding object for the lists

            for (let gift of specialGifts) {
                for (let setting of gift.data.data.specialSettings) {
                    if (!(setting.settingMode in data.processingLists)) {
                        // If the relevant array for a setting mode does not exist, add an empty one
                        data.processingLists[setting.settingMode] = [];
                    }
                    // If the gift has the replacement field set, attempt to find what it replaces and give that setting a link to this one
                    if (setting.replaceName) {
                        const replacement = specialGifts.find(x => makeStatCompareReady(x.data.name) === setting.replaceName)?.data.data.specialSettings.find(x => x.settingMode == setting.settingMode);
                        if (replacement) {
                            replacement.replacedBy = setting;
                        }
                        continue;
                    }

                    // Add the setting into the list
                    data.processingLists[setting.settingMode].push(setting);
                }
            }
        }
    }

    /* -------------------------------------------- */
    /* Process Derived                              */
    /* -------------------------------------------- */

    /** @override
     * Augment the basic actor data with additional dynamic data.
     */
    prepareDerivedData() {
        const actorData = this.data;

        // Make separate methods for each Actor type (character, npc, etc.) to keep
        // things organized.
        if (actorData.type === 'character') this._prepareCharacterData(actorData);
        if (actorData.type === 'mook') this._prepareMookData(actorData);
        if (actorData.type === 'beast') this._prepareBeastData(actorData);
    }

    /**
     * Prepare Character type specific data
     */
    _prepareCharacterData(actorData) {
        this._processTraits(actorData);
        this._processSkills(actorData);

        this._processCoinageData(actorData);
        this._processItemData(actorData);

        this._processBattleData(actorData);
    }

    /**
     * Prepare Mook type specific data
     */
    _prepareMookData(actorData) {
        this._processTraits(actorData);
        this._processSkills(actorData);

        this._processCoinageData(actorData);
        this._processItemData(actorData);

        this._processBattleData(actorData);
    }

    /**
     * Prepare Beast type specific data
     */
    _prepareBeastData(actorData) {
        this._processTraits(actorData);

        this._processItemData(actorData);

        this._processBattleData(actorData);
    }

    /**
     * Process baseTraits template data
     */
    _processTraits(actorData) {
        const data = actorData.data;

        for (let [key, trait] of Object.entries(data.traits)) {
            trait.diceArray = findTotalDice(trait.dice);

            // Make the name used for a trait more human-readable
            trait.usedTitle = convertCamelCase(key);
        }

        data.traits.species.skills = [makeStatCompareReady(data.traits.species.speciesSkill1), makeStatCompareReady(data.traits.species.speciesSkill2), makeStatCompareReady(data.traits.species.speciesSkill3)];
        data.traits.career.skills = [makeStatCompareReady(data.traits.career.careerSkill1), makeStatCompareReady(data.traits.career.careerSkill2), makeStatCompareReady(data.traits.career.careerSkill3)];
    }

    /**
     * Process baseSkills template data
     */
    _processSkills(actorData) {
        const data = actorData.data;

        let extracareers = [];
        if (data.hasExtraCareers) {
            data.extraCareerIds.forEach(x => extracareers.push(this.items.get(x)));
        }

        for (let [key, skill] of Object.entries(data.skills)) {
            skill.diceArray = [0, 0, 0, 0, 0];
            skill.diceString = "";
            skill.totalDiceString = "";

            // Marks
            if (skill.marks > 0) {
                let d12s = Math.floor(skill.marks / 5); // Get the number of d12's for the skill
                let remainder = skill.marks % 5; // Get whatever the mark count is minus full 5's (d12's)
                skill.diceArray[0] += d12s; // Add the d12's
                if (remainder > 0) {
                    skill.diceArray[5 - remainder] += 1; // Based on what the marks are minus full 5's, add a smaller die
                }
                skill.diceString = reformDiceString(skill.diceArray, true); // For showing in the sheet how many dice the marks give
            }

            // Species and Career dice
            const comparekey = makeStatCompareReady(key);
            if (data.traits.species.skills.includes(comparekey)) {
                skill.diceArray = addArrays(skill.diceArray, data.traits.species.diceArray);
            }
            if (data.traits.career.skills.includes(comparekey)) {
                skill.diceArray = addArrays(skill.diceArray, data.traits.career.diceArray);
            }
            if (data.hasExtraCareers) {
                extracareers.forEach(element => {
                    if (element.data.data.skills.includes(comparekey)) {
                        skill.diceArray = addArrays(skill.diceArray, element.data.data.diceArray);
                    }
                });
            }

            skill.totalDiceString = reformDiceString(skill.diceArray, true); // For showing in the sheet how many dice the skill has in total

            // Make the name used for a skill more human-readable, and add a symbol if the skill can suffer under Burdened condition
            skill.usedTitle = convertCamelCase(key);
            if (burdenedLimitedStat(key)) {
                skill.usedTitle = String.fromCodePoint([9949]) + " " + skill.usedTitle + " " + String.fromCodePoint([9949]);
            }
        }
    }

    /**
     * Process derived data for battle calculations
     */
    _processBattleData(actorData) {
        const data = actorData.data;

        // Base levels
        let stridebonus = 0;
        let dashbonus = 0;
        let runbonus = 0;
        const sprintarray = this.sprintRoll(-1);

        let speedint = getDiceArrayMaxValue(data.traits.speed.diceArray);
        let bodyint = getDiceArrayMaxValue(data.traits.body.diceArray);
        let sprintint = getDiceArrayMaxValue(sprintarray);

        if (speedint < 0 || bodyint < 0) {
            console.error("Battle data processing failed, unable to parse dice for " + actorData.name);
            ui.notifications.error(game.i18n.format("ironclaw2e.ui.battleProcessingFailure", { "name": actorData.name }));
            data.stride = 0;
            data.dash = 0;
            data.run = 0;
            return;
        }

        // Apply burdenend limit
        if (speedint > 8 && hasConditionsIronclaw("burdened", this)) speedint = 8;

        // Apply normal move bonuses
        if (data.processingLists?.moveBonus) { // Check if move bonuses even exist
            for (let setting of data.processingLists.moveBonus) { // Loop through them
                if (checkApplicability(setting, null, this)) { // Check initial applicability
                    let used = setting; // Store the setting in a temp variable
                    while (used.replacedBy && checkApplicability(used.replacedBy, null, this)) { // As long as the currently used one could be replaced by something applicable
                        used = used.replacedBy; // Move up to the next replacement
                    }
                    if (used) { // Sanity check that the used still exists
                        // Apply the used setting
                        stridebonus += used.bonusStrideNumber;
                        dashbonus += used.bonusDashNumber;
                        runbonus += used.bonusRunNumber;
                    } else { // If used somehow turns out unsuable, send an error
                        console.error("Somehow, the used setting came up unusable: " + used);
                    }
                }
            }
        }

        // Flying-related bonuses
        if (hasConditionsIronclaw("flying", this)) {
            data.isFlying = true;

            // Apply the flying move bonuses
            if (data.processingLists?.flyingBonus) {
                for (let setting of data.processingLists.flyingBonus) { // Loop through them
                    if (checkApplicability(setting, null, this)) { // Check initial applicability
                        let used = setting; // Store the setting in a temp variable
                        while (used.replacedBy && checkApplicability(used.replacedBy, null, this)) { // As long as the currently used one could be replaced by something applicable
                            used = used.replacedBy; // Move up to the next replacement
                        }
                        if (used) { // Sanity check that the used still exists
                            // Apply the used setting
                            stridebonus += used.bonusStrideNumber;
                            dashbonus += used.bonusDashNumber;
                            runbonus += used.bonusRunNumber;
                        } else { // If used somehow turns out unsuable, send an error
                            console.error("Somehow, the used setting came up unusable: " + used);
                        }
                    }
                }
            }
        } else {
            data.isFlying = false;
        }

        // Stride setup
        data.stride = 1 + stridebonus;
        if (hasConditionsIronclaw(["slowed", "immobilized", "half-buried", "cannotmove"], this)) {
            data.stride = 0;
        }
        // Dash setup
        data.dash = Math.round(speedint / 2) + (bodyint > speedint ? 1 : 0) + dashbonus;
        if (hasConditionsIronclaw(["burdened", "blinded", "slowed", "immobilized", "half-buried", "cannotmove"], this)) {
            data.dash = 0;
        }

        // Run setup
        data.run = bodyint + (data.isFlying ? sprintint : speedint) + data.dash + runbonus;
        if (hasConditionsIronclaw(["over-burdened", "immobilized", "half-buried", "cannotmove"], this)) {
            data.run = 0;
        }


        // Sprint visual for the sheet
        data.sprintString = reformDiceString(sprintarray, true);
        // Initiative visual for the sheet
        data.initiativeString = reformDiceString(this.initiativeRoll(-1), true);
    }

    /**
     * Process derived data for money related stuff
     */
    _processCoinageData(actorData) {
        const data = actorData.data;

        let allvalue = 0;
        let allweight = 0;
        for (let [key, currency] of Object.entries(data.coinage)) {
            if (currency.value.length == 0 || (isNaN(currency.value) && isNaN(currency.value.slice(1)))) {
                console.error("Unable to parse the currency value of: " + key);
                continue;
            }

            currency.totalValue = (currency.value.includes(";") ? currency.amount / parseInt(currency.value.slice(1)) : currency.amount * parseInt(currency.value));
            currency.totalWeight = (currency.weight * currency.amount) / 6350;
            currency.parsedSign = Number.isInteger(currency.sign) ? String.fromCodePoint([currency.sign]) : "";

            allvalue += currency.totalValue;
            allweight += currency.totalWeight;
        }
        data.coinageValue = Math.floor(allvalue).toString() + String.fromCodePoint([data.coinage.denar.sign]);
        data.coinageWeight = allweight;
    }

    /**
     * Process derived data from items 
     */
    _processItemData(actorData) {
        const data = actorData.data;
        const gear = this.items;

        let totalweight = 0;
        let totalarmors = 0;
        let giftbonus = 0;
        for (let item of gear) {

            if (item.data.data.totalWeight && !isNaN(item.data.data.totalWeight)) {
                totalweight += item.data.data.totalWeight; // Check that the value exists and is not a NaN, then add it to totaled weight
            }

            if (item.data.type === 'armor' && item.data.data.worn === true) {
                totalarmors++;
            }
        }

        // Apply encumbrance bonuses
        if (data.processingLists?.encumbranceBonus) { // Check if move bonuses even exist
            for (let setting of data.processingLists.encumbranceBonus) { // Loop through them
                if (checkApplicability(setting, null, this)) { // Check initial applicability
                    let used = setting; // Store the setting in a temp variable
                    while (used.replacedBy && checkApplicability(used.replacedBy, null, this)) { // As long as the currently used one could be replaced by something applicable
                        used = used.replacedBy; // Move up to the next replacement
                    }
                    if (used) { // Sanity check that the used still exists
                        // Apply the used setting
                        giftbonus += used.encumbranceBonusNumber;
                    } else { // If used somehow turns out unsuable, send an error
                        console.error("Somehow, the used setting came up unusable: " + used);
                    }
                }
            }
        }

        const bodyarr = parseSingleDiceString(data.traits.body.dice);
        if (!Array.isArray(bodyarr)) {
            console.error("Unable to parse body die for " + actorData.name);
            return;
        }

        data.encumbranceNone = Math.round(((bodyarr[1] / 2) - 1) * bodyarr[0] + giftbonus);
        data.encumbranceBurdened = Math.round((bodyarr[1] - 1) * bodyarr[0] + giftbonus * 2);
        data.encumbranceOverBurdened = Math.round(((bodyarr[1] / 2) * 3 - 1) * bodyarr[0] + giftbonus * 3);

        const coinshaveweight = game.settings.get("ironclaw2e", "coinsHaveWeight");
        if (coinshaveweight === true && data.coinageWeight) {
            totalweight += data.coinageWeight;
        }
        data.totalWeight = totalweight;
        data.totalArmors = totalarmors;
    }

    /** 
     *  Automatic encumbrance management, performed if the setting is enabled
     */
    _encumbranceAutoManagement(actorData) {
        const manageburdened = game.settings.get("ironclaw2e", "manageEncumbranceAuto");
        const data = actorData.data;

        if (manageburdened) {
            if (data.totalWeight > data.encumbranceOverBurdened || data.totalArmors > 3) {
                this.addEffect(["burdened", "over-burdened", "cannotmove"]);
            }
            else if (data.totalWeight > data.encumbranceBurdened || data.totalArmors == 3) {
                this.deleteEffect(["cannotmove"], false);
                this.addEffect(["burdened", "over-burdened"]);
            }
            else if (data.totalWeight > data.encumbranceNone || data.totalArmors == 2) {
                this.deleteEffect(["over-burdened", "cannotmove"], false);
                this.addEffect(["burdened"]);
            }
            else {
                this.deleteEffect(["burdened", "over-burdened", "cannotmove"], false);
            }
        }
    }

    /* -------------------------------------------- */
    /* Private Internal Functions                   */
    /* -------------------------------------------- */

    /**
     * Update tokens associated with this actor with lighting data
     * @param {any} lightdata Data to use for update
     * @private
     */
    async _updateTokenLighting(lightdata) {
        let foundtoken = findActorToken(this);
        if (foundtoken) {
            await foundtoken.update(lightdata);
        }

        // Update prototype token, if applicable
        if (!this.isToken) {
            await this.update({
                "token": lightdata
            });
        }
    }

    /**
     * Get the total dice pools of the actor for the given traits and skills
     * @param {string[]} traitnames The array of trait names
     * @param {string[]} skillnames The array of skill names, just give the same array as traitnames to use with mixed name arrays
     * @param {boolean} isburdened Whether to apply the burdened limit to relevant skills
     * @param {boolean} addplus Whether to add the plus already on the first pool label
     * @private
     */
    _getDicePools(traitnames, skillnames, isburdened, addplus = false) {
        const data = this.data.data;
        let label = "";
        let labelgiven = addplus;
        let totaldice = [];

        if (data.traits && Array.isArray(traitnames) && traitnames.length > 0) {
            for (let [key, trait] of Object.entries(data.traits)) {
                if (traitnames.includes(makeStatCompareReady(key))) {
                    if (labelgiven)
                        label += " + ";
                    totaldice = addArrays(totaldice, (isburdened && burdenedLimitedStat(key) ? enforceLimit(trait.diceArray, 2) : trait.diceArray));
                    label += convertCamelCase(key);
                    labelgiven = true;
                }
            }
            if (data.hasExtraCareers) {
                let extracareers = [];
                data.extraCareerIds.forEach(x => extracareers.push(this.items.get(x)));
                for (let [index, extra] of extracareers.entries()) {
                    let key = makeStatCompareReady(extra.data.data.careerName);
                    if (traitnames.includes(key)) {
                        if (labelgiven)
                            label += " + ";
                        totaldice = addArrays(totaldice, (isburdened && burdenedLimitedStat(key) ? enforceLimit(extra.data.data.diceArray, 2) : extra.data.data.diceArray));
                        label += extra.data.data.careerName;
                        labelgiven = true;
                    }
                }
            }
        }
        if (data.skills && Array.isArray(skillnames) && skillnames.length > 0) {
            for (let [key, skill] of Object.entries(data.skills)) {
                if (skillnames.includes(makeStatCompareReady(key))) {
                    if (labelgiven)
                        label += " + ";
                    totaldice = addArrays(totaldice, (isburdened && burdenedLimitedStat(key) ? enforceLimit(skill.diceArray, 2) : skill.diceArray));
                    label += convertCamelCase(key);
                    labelgiven = true;
                }
            }
        }

        return { "totalDice": totaldice, "label": label, "labelGiven": labelgiven };
    }

    // Functions to construct the roll dialog properly

    /**
     * Apply a certain type of gift special bonus to roll dialog construction
     * @param {any} specialname
     * @param {any} prechecked
     * @param {any} otherinputs
     * @param {any} otherkeys
     * @param {any} otherdice
     * @param {any} item
     * @param {boolean} defensecheck Whether the check is done from a defense 
     * @param {boolean} isdodge
     * @returns {object} Returns a holder object which returns the inputs with the added bonuses
     * @private
     */
    _getGiftSpecialConstruction(specialname, prechecked, otherinputs, otherkeys, otherdice, item, defensecheck = false, isdodge = false) {
        const data = this.data.data;
        if (data.processingLists?.[specialname]) { // Check if they even exist
            for (let setting of data.processingLists[specialname]) { // Loop through them
                if (checkApplicability(setting, item, this, defensecheck, isdodge)) { // Check initial applicability
                    let used = setting; // Store the setting in a temp variable
                    while (used.replacedBy && checkApplicability(used.replacedBy, item, this, defensecheck, isdodge)) { // As long as the currently used one could be replaced by something applicable
                        used = used.replacedBy; // Move up to the next replacement
                    }
                    if (used) { // Sanity check that the used still exists
                        // Apply the used setting
                        // Apply bonus sources to the roll dialog contruction
                        if (used.bonusSources) {
                            for (let source of used.bonusSources) {
                                let foobar = null;
                                switch (source) {
                                    case ("armor"):
                                        foobar = this._getArmorConstruction(otherinputs, otherkeys, otherdice);
                                        break;
                                    case ("shield"):
                                        foobar = this._getShieldConstruction(otherinputs, otherkeys, otherdice);
                                        break;
                                    case ("guard"):
                                        foobar = this._getGuardingConstruction(otherinputs, otherkeys, otherdice, false);
                                        break;
                                    case ("guard-always"):
                                        foobar = this._getGuardingConstruction(otherinputs, otherkeys, otherdice, true);
                                        break;
                                }
                                if (foobar) {
                                    otherinputs = foobar.otherinputs;
                                    otherkeys = foobar.otherkeys;
                                    otherdice = foobar.otherdice;
                                }
                            }
                        }
                        // Apply the bonus stats to the prechecked stats
                        if (used.bonusStats) {
                            for (let stat of used.bonusStats) {
                                if (!prechecked.includes(stat)) {
                                    prechecked.push(stat);
                                }
                            }
                        }
                        // Apply the bonus dice to the roll dialog construction
                        if (used.bonusDice) {
                            otherkeys.push(used.giftName);
                            otherdice.push(used.bonusDice);
                            otherinputs += `<div class="form-group flexrow">
                                <label class="normal-label">${used.giftName}: ${reformDiceString(used.bonusDice, true)}</label>
	                            <input type="checkbox" id="${makeStatCompareReady(used.giftName)}" name="${makeStatCompareReady(used.giftName)}" checked></input>
                                </div>`+ "\n";
                        }
                    } else { // If used somehow turns out unsuable, send an error
                        console.error("Somehow, the used setting came up unusable: " + used);
                    }
                }
            }
        }

        return { "prechecked": prechecked, "otherinputs": otherinputs, "otherkeys": otherkeys, "otherdice": otherdice };
    }

    /**
     * Apply armors to roll dialog construction
     * @param {any} otherinputs
     * @param {any} otherkeys
     * @param {any} otherdice
     * @returns {object} Returns a holder object which returns the inputs with the added bonuses
     * @private
     */
    _getArmorConstruction(otherinputs, otherkeys, otherdice) {
        const data = this.data.data;
        let armors = this.items.filter(element => element.data.data.worn === true);
        for (let i = 0; i < armors.length && i < 3; ++i) {
            otherkeys.push(armors[i].data.name);
            otherdice.push(armors[i].data.data.armorArray);
            otherinputs += `<div class="form-group flexrow">
                <label class="normal-label">${armors[i].data.name}: ${reformDiceString(armors[i].data.data.armorArray, true)}</label>
	            <input type="checkbox" id="${makeStatCompareReady(armors[i].data.name)}" name="${makeStatCompareReady(armors[i].data.name)}" checked></input>
                </div>`+ "\n";
        }
        return { "otherinputs": otherinputs, "otherkeys": otherkeys, "otherdice": otherdice };
    }

    /**
     * Apply shield to roll dialog construction
     * @param {any} otherinputs
     * @param {any} otherkeys
     * @param {any} otherdice
     * @returns {object} Returns a holder object which returns the inputs with the added bonuses
     * @private
     */
    _getShieldConstruction(otherinputs, otherkeys, otherdice) {
        const data = this.data.data;
        let shield = this.items.find(element => element.data.data.held === true);
        if (shield) {
            otherkeys.push(shield.data.name);
            otherdice.push(shield.data.data.coverArray);
            otherinputs += `<div class="form-group flexrow">
                <label class="normal-label">${shield.data.name}: ${reformDiceString(shield.data.data.coverArray, true)}</label>
	            <input type="checkbox" id="${makeStatCompareReady(shield.data.name)}" name="${makeStatCompareReady(shield.data.name)}" checked></input>
                </div>`+ "\n";
        }
        return { "otherinputs": otherinputs, "otherkeys": otherkeys, "otherdice": otherdice };
    }

    /**
     * Apply guarding bonus to roll dialog construction
     * @param {any} otherinputs
     * @param {any} otherkeys
     * @param {any} otherdice
     * @param {object} item The item to use when checking setting applicability, or null if no item is relevant
     * @param {boolean} skipcheck Whether to skip the "Guarding" condition check
     * @returns {object} Returns a holder object which returns the inputs with the added bonuses
     * @private
     */
    _getGuardingConstruction(otherinputs, otherkeys, otherdice, skipcheck = false) {
        const data = this.data.data;
        let replaceSettings = []; // Guard bonuses that would replace the base bonus
        let guardSettings = []; // Guard bonuses that would add to the base bonus
        if (skipcheck || hasConditionsIronclaw("guarding", this)) { // If the check is skipped or the actor has a "Guarding" condition
            if (data.processingLists?.guardBonus) { // Check if move bonuses even exist
                for (let setting of data.processingLists.guardBonus) { // Loop through them
                    if (checkApplicability(setting, null, this)) { // Check initial applicability
                        let used = setting; // Store the setting in a temp variable
                        while (used.replacedBy && checkApplicability(used.replacedBy, null, this)) { // As long as the currently used one could be replaced by something applicable
                            used = used.replacedBy; // Move up to the next replacement
                        }
                        if (used) { // Sanity check that the used still exists
                            // Store the used setting to a temp array
                            if (used.replacesBaseBonus) {
                                replaceSettings.push(used);
                            } else {
                                guardSettings.push(used);
                            }
                        } else { // If used somehow turns out unsuable, send an error
                            console.error("Somehow, the used setting came up unusable: " + used);
                        }
                    }
                }
            }
        } else { // If the actor does not have "Guarding", just return the variables like they were
            return { "otherinputs": otherinputs, "otherkeys": otherkeys, "otherdice": otherdice };
        }

        let guardbonus = [0, 0, 1, 0, 0];
        let guardlabel = game.i18n.localize("ironclaw2e.dialog.dicePool.guarding");
        // Go through the potential guard bonus replacements
        if (Array.isArray(replaceSettings)) {
            for (let setting of replaceSettings) {
                if (setting.bonusDice) { // If the setting has bonus dice
                    if (compareDiceArrays(setting.bonusDice, guardbonus) < 0) { // Check if the bonus dice are bigger than the guard bonus
                        guardbonus = setting.bonusDice; // Set the guard bonus to be the setting bonus
                        guardlabel = setting.giftName + " " + game.i18n.localize("ironclaw2e.dialog.dicePool.guarding"); // Name the label after the bonus
                    }
                }
            }
        }
        // Go through the potential guard bonus additions
        if (Array.isArray(guardSettings)) {
            for (let setting of guardSettings) {
                if (setting.bonusDice) { // If the bonus dice exist
                    guardbonus = addArrays(guardbonus, setting.bonusDice); // Add them
                }
            }
        }

        otherkeys.push(guardlabel);
        otherdice.push(guardbonus);
        otherinputs += `<div class="form-group flexrow">
                 <label class="normal-label">${guardlabel}: ${reformDiceString(guardbonus, true)}</label>
	             <input type="checkbox" id="${makeStatCompareReady(guardlabel)}" name="${makeStatCompareReady(guardlabel)}" checked></input>
                </div>`+ "\n";

        return { "otherinputs": otherinputs, "otherkeys": otherkeys, "otherdice": otherdice };
    }

    /* -------------------------------------------- */
    /*  Actor Token Change Functions                */
    /* -------------------------------------------- */

    changeLightSource(lightsource) {
        if (!lightsource) {
            console.error("Attempted to change a light source without providing light source for actor: " + this);
            return;
        }
        let updatedlightdata = {
            "dimLight": 0, "brightLight": 0, "lightAngle": 360, "lightColor": "#ffffff", "lightAlpha": 0.25, "lightAnimation": {
                "type": "", "speed": 5, "intensity": 5
            }
        };

        let lightsources = this.items.filter(element => element.data.type == "illumination");

        if (!lightsource.data.data.lighted) { // Light the light source
            updatedlightdata = {
                "dimLight": lightsource.data.data.dimLight, "brightLight": lightsource.data.data.brightLight, "lightAngle": lightsource.data.data.lightAngle,
                "lightColor": lightsource.data.data.lightColor, "lightAlpha": lightsource.data.data.lightAlpha, "lightAnimation": {
                    "type": lightsource.data.data.lightAnimationType, "speed": lightsource.data.data.lightAnimationSpeed, "intensity": lightsource.data.data.lightAnimationIntensity
                }
            };
            const index = lightsources.findIndex(element => element.id == lightsource.id);
            if (index > -1)
                lightsources.splice(index, 1); // Exclude from dousing
            lightsource.update({ "_id": lightsource.id, "data.lighted": true });
        }

        let doused = [];
        for (let l of lightsources) { // Douse all other light sources, including the caller if it was previously lighted
            doused.push({ "_id": l.id, "data.lighted": false });
        }
        this.updateEmbeddedDocuments("Item", doused);

        this._updateTokenLighting(updatedlightdata);
    }

    refreshLightSource() {
        let updatedlightdata = {
            "dimLight": 0, "brightLight": 0, "lightAngle": 360, "lightColor": "#ffffff", "lightAlpha": 0.25, "lightAnimation": {
                "type": "", "speed": 5, "intensity": 5
            }
        };

        let lightsources = this.items.filter(element => element.data.type == "illumination");
        let activesource = lightsources.find(element => element.data.data.lighted == true);
        if (activesource) {
            updatedlightdata = {
                "dimLight": activesource.data.data.dimLight, "brightLight": activesource.data.data.brightLight, "lightAngle": activesource.data.data.lightAngle,
                "lightColor": activesource.data.data.lightColor, "lightAlpha": activesource.data.data.lightAlpha, "lightAnimation": {
                    "type": activesource.data.data.lightAnimationType, "speed": activesource.data.data.lightAnimationSpeed, "intensity": activesource.data.data.lightAnimationIntensity
                }
            };
        }

        this._updateTokenLighting(updatedlightdata);
    }

    applyDamage(damage, knockout, nonlethal = false) {
        let adding = ["reeling"];
        if (damage >= 1) {
            adding.push("hurt");
            if (knockout) adding.push("asleep");
        }
        if (damage >= 2) {
            adding.push("afraid");
            if (knockout) adding.push("unconscious");
        }
        if (damage >= 3) adding.push("injured");
        if (damage >= 4) adding.push("dying");
        if (damage >= 5 && !nonlethal) adding.push("dead");
        if (damage >= 6 && !nonlethal) adding.push("overkilled");
        this.addEffect(adding);
        return adding;
    }

    async addEffect(condition) {
        addConditionsIronclaw(condition, this);
    }

    async deleteEffect(condition, isid = false) {
        if (isid) {
            this.deleteEmbeddedDocuments("ActiveEffect", [condition]);
        }
        else {
            removeConditionsIronclaw(condition, this);
        }
    }

    async resetEffects() {
        for (let effect of this.effects) {
            await effect.delete();
        }
    }

    /* -------------------------------------------- */
    /*  Non-popup Roll Functions                    */
    /* -------------------------------------------- */

    /**
     * Function to call initiative for an actor
     * @param {number} returntype The type of return to use: -1 to simply return the total initiative dice array, 0 for nothing as it launches a popup, 1 for a traditional initiative roll, 2 for the initiative check on combat start for side-based initiative
     * @param {number} tntouse The target number to use in case the mode uses target numbers
     * @returns {any} Exact return type depends on the returntype parameter, null if no normal return path
     */
    initiativeRoll(returntype, tntouse = 2) {
        const data = this.data.data;
        let formconstruction = ``;
        let constructionkeys = [];
        let constructionarray = [];
        let prechecked = ["speed", "mind"];
        const burdened = hasConditionsIronclaw("burdened", this);

        const bonuses = this._getGiftSpecialConstruction("initiativeBonus", prechecked, formconstruction, constructionkeys, constructionarray, null);
        prechecked = bonuses.prechecked;
        formconstruction = bonuses.otherinputs;
        constructionkeys = bonuses.otherkeys;
        constructionarray = bonuses.otherdice;

        let foo, bar;
        switch (returntype) { // Yes, yes, the breaks are unnecessary
            case -1:
                foo = this._getDicePools(prechecked, prechecked, burdened);
                bar = foo.totalDice;
                if (constructionarray?.length > 0) {
                    for (let dice of constructionarray) {
                        bar = addArrays(bar, dice);
                    }
                }
                return bar;
                break;
            case 0:
                this.popupSelectRolled(prechecked, true, tntouse, "", formconstruction, constructionkeys, constructionarray, game.i18n.localize("ironclaw2e.chat.rollingInitiative"));
                return;
                break;
            case 1:
                foo = this._getDicePools(prechecked, prechecked, burdened);
                bar = foo.totalDice;
                if (constructionarray?.length > 0) {
                    for (let dice of constructionarray) {
                        bar = addArrays(bar, dice);
                    }
                }
                return rollHighest(bar[0], bar[1], bar[2], bar[3], bar[4], game.i18n.localize("ironclaw2e.chat.rollingInitiative") + ": " + foo.label + (dangersense ? " + " + dangersense.data.name : ""), this, false);
                break;
            case 2:
                foo = this._getDicePools(prechecked, prechecked, burdened);
                bar = foo.totalDice;
                if (constructionarray?.length > 0) {
                    for (let dice of constructionarray) {
                        bar = addArrays(bar, dice);
                    }
                }
                return rollTargetNumber(tntouse, bar[0], bar[1], bar[2], bar[3], bar[4], game.i18n.localize("ironclaw2e.chat.rollingInitiativeCheck") + ": " + foo.label + (dangersense ? " + " + dangersense.data.name : ""), this, false);
                break;
        }

        console.error("Initiative roll return type defaulted for actor: " + this.data.name);
        return null;
    }

    /**
     * Function to call Sprint on an actor
     * @param {number} returntype The type of return to use: -1 to simply return the total Sprint dice array, 0 for nothing as it launches a popup
     * @returns {any} Exact return type depends on the returntype parameter, null if no normal return path
     */
    sprintRoll(returntype) {
        const data = this.data.data;
        let formconstruction = ``;
        let constructionkeys = [];
        let constructionarray = [];
        let prechecked = ["speed"];
        const burdened = hasConditionsIronclaw("burdened", this);

        const bonuses = this._getGiftSpecialConstruction("sprintBonus", prechecked, formconstruction, constructionkeys, constructionarray, null);
        prechecked = bonuses.prechecked;
        formconstruction = bonuses.otherinputs;
        constructionkeys = bonuses.otherkeys;
        constructionarray = bonuses.otherdice;

        let foo, bar;
        switch (returntype) { // Yes, yes, the breaks are unnecessary
            case -1:
                foo = this._getDicePools(prechecked, prechecked, burdened);
                bar = foo.totalDice;
                if (constructionarray?.length > 0) {
                    for (let dice of constructionarray) {
                        bar = addArrays(bar, dice);
                    }
                }
                return bar;
                break;
            case 0:
                this.popupSelectRolled(prechecked, false, 3, "", formconstruction, constructionkeys, constructionarray, game.i18n.localize("ironclaw2e.chat.rollingSprint"));
                return;
                break;
        }

        console.error("Sprint roll return type defaulted for actor: " + this.data.name);
        return null;
    }

    /* -------------------------------------------- */
    /*  Special Popup Macro Puukko Functions        */
    /* -------------------------------------------- */

    popupSoakRoll(prechecked = [], tnyes = false, tnnum = 3, extradice = "", otherinputs = "", otherkeys = [], otherdice = [], otherlabel = "", successfunc = null) {
        const data = this.data.data;
        let checkedstats = [...prechecked];
        let formconstruction = otherinputs;
        let constructionkeys = [...otherkeys];
        let constructionarray = [...otherdice];

        // Armor dice
        const armor = this._getArmorConstruction(formconstruction, constructionkeys, constructionarray);
        formconstruction = armor.otherinputs;
        constructionkeys = armor.otherkeys;
        constructionarray = armor.otherdice;

        // Soak bonuses
        const bonuses = this._getGiftSpecialConstruction("soakBonus", checkedstats, formconstruction, constructionkeys, constructionarray, null);
        checkedstats = bonuses.prechecked;
        formconstruction = bonuses.otherinputs;
        constructionkeys = bonuses.otherkeys;
        constructionarray = bonuses.otherdice;

        this.popupSelectRolled(checkedstats, tnyes, tnnum, extradice, formconstruction, constructionkeys, constructionarray, otherlabel, successfunc);
    }

    popupDefenseRoll(prechecked = [], tnyes = false, tnnum = 3, extradice = "", otherinputs = "", otherkeys = [], otherdice = [], otherlabel = "", item = null, isparry = false, successfunc = null) {
        const data = this.data.data;
        let checkedstats = [...prechecked];
        let formconstruction = otherinputs;
        let constructionkeys = [...otherkeys];
        let constructionarray = [...otherdice];

        // Shield cover die
        const shield = this._getShieldConstruction(formconstruction, constructionkeys, constructionarray);
        formconstruction = shield.otherinputs;
        constructionkeys = shield.otherkeys;
        constructionarray = shield.otherdice;

        // Guarding bonus
        const guard = this._getGuardingConstruction(formconstruction, constructionkeys, constructionarray);
        formconstruction = guard.otherinputs;
        constructionkeys = guard.otherkeys;
        constructionarray = guard.otherdice;

        // Defense bonuses
        const bonuses = this._getGiftSpecialConstruction("defenseBonus", checkedstats, formconstruction, constructionkeys, constructionarray, item, true, !isparry);
        checkedstats = bonuses.prechecked;
        formconstruction = bonuses.otherinputs;
        constructionkeys = bonuses.otherkeys;
        constructionarray = bonuses.otherdice;

        this.popupSelectRolled(checkedstats, tnyes, tnnum, extradice, formconstruction, constructionkeys, constructionarray, otherlabel, successfunc);
    }

    popupAttackRoll(prechecked = [], tnyes = false, tnnum = 3, extradice = "", otherinputs = "", otherkeys = [], otherdice = [], otherlabel = "", item = null, successfunc = null) {
        const data = this.data.data;
        let checkedstats = [...prechecked];
        let formconstruction = otherinputs;
        let constructionkeys = [...otherkeys];
        let constructionarray = [...otherdice];

        // Attack bonuses
        const bonuses = this._getGiftSpecialConstruction("attackBonus", checkedstats, formconstruction, constructionkeys, constructionarray, item);
        checkedstats = bonuses.prechecked;
        formconstruction = bonuses.otherinputs;
        constructionkeys = bonuses.otherkeys;
        constructionarray = bonuses.otherdice;

        this.popupSelectRolled(checkedstats, tnyes, tnnum, extradice, formconstruction, constructionkeys, constructionarray, otherlabel, successfunc);
    }

    popupCounterRoll(prechecked = [], tnyes = false, tnnum = 3, extradice = "", otherinputs = "", otherkeys = [], otherdice = [], otherlabel = "", item = null, successfunc = null) {
        const data = this.data.data;
        let checkedstats = [...prechecked];
        let formconstruction = otherinputs;
        let constructionkeys = [...otherkeys];
        let constructionarray = [...otherdice];

        // Guarding bonus
        const guard = this._getGuardingConstruction(formconstruction, constructionkeys, constructionarray);
        formconstruction = guard.otherinputs;
        constructionkeys = guard.otherkeys;
        constructionarray = guard.otherdice;

        // Counter bonuses
        const bonuses = this._getGiftSpecialConstruction("counterBonus", checkedstats, formconstruction, constructionkeys, constructionarray, item);
        checkedstats = bonuses.prechecked;
        formconstruction = bonuses.otherinputs;
        constructionkeys = bonuses.otherkeys;
        constructionarray = bonuses.otherdice;

        this.popupSelectRolled(checkedstats, tnyes, tnnum, extradice, formconstruction, constructionkeys, constructionarray, otherlabel, successfunc);
    }

    /* -------------------------------------------- */
    /*  Actual Popup Functions                      */
    /* -------------------------------------------- */

    /** Damage calculation popup */
    popupDamage(readydamage = "", readysoak = "") {
        let confirmed = false;
        let speaker = getMacroSpeaker(this);
        let addeddamage = 0;
        let addedconditions = "";

        if (hasConditionsIronclaw("hurt", this)) {
            addeddamage++;
            addedconditions = game.i18n.localize(CommonConditionInfo.getConditionLabel("hurt"));
        }
        if (hasConditionsIronclaw("injured", this)) {
            addeddamage++;
            addedconditions += (addedconditions ? ", " : "") + game.i18n.localize(CommonConditionInfo.getConditionLabel("injured"));
        }
        const confirmSend = game.settings.get("ironclaw2e", "defaultSendDamage");

        let dlog = new Dialog({
            title: game.i18n.format("ironclaw2e.dialog.damageCalc.title", { "name": speaker.alias }),
            content: `
     <form class="ironclaw2e">
      <h1>${game.i18n.format("ironclaw2e.dialog.damageCalc.header", { "name": this.data.name })}</h1>
      <div class="form-group">
       <label class="normal-label">${game.i18n.localize("ironclaw2e.dialog.damageCalc.received")}:</label>
	   <input id="damage" name="damage" value="${readydamage}" onfocus="this.select();"></input>
      </div>
      <div class="form-group">
       <label class="normal-label">${game.i18n.localize("ironclaw2e.dialog.damageCalc.soaked")}:</label>
	   <input id="soak" name="soak" value="${readysoak}" onfocus="this.select();"></input>
      </div>
      <div class="form-group">
       <span class="normal-label" title="${addeddamage ? game.i18n.format("ironclaw2e.dialog.damageCalc.conditionDamageAdded", { "conditions": addedconditions }) : game.i18n.localize("ironclaw2e.dialog.damageCalc.conditionDamageNothing")}">
        ${game.i18n.localize("ironclaw2e.dialog.damageCalc.conditionDamage")}: ${addeddamage}</span>
       <input type="checkbox" id="added" name="added" value="1" checked></input>
      </div>
      <div class="form-group">
       <label>${game.i18n.localize("ironclaw2e.dialog.damageCalc.knockoutStrike")}</label>
       <input type="checkbox" id="knockout" name="knockout" value="1"></input>
      </div>
      <div class="form-group">
       <label>${game.i18n.localize("ironclaw2e.dialog.damageCalc.nonLethal")}</label>
       <input type="checkbox" id="nonlethal" name="nonlethal" value="1"></input>
      </div>
      <div class="form-group">
       <label>${game.i18n.localize("ironclaw2e.dialog.sendToChat")}</label>
       <input type="checkbox" id="send" name="send" value="1" ${confirmSend ? "checked" : ""}></input>
      </div>
     </form>
     `,
            buttons: {
                one: {
                    icon: '<i class="fas fa-check"></i>',
                    label: game.i18n.localize("ironclaw2e.dialog.add"),
                    callback: () => confirmed = true
                },
                two: {
                    icon: '<i class="fas fa-times"></i>',
                    label: game.i18n.localize("ironclaw2e.dialog.cancel"),
                    callback: () => confirmed = false
                }
            },
            default: "one",
            render: html => { document.getElementById("damage").focus(); },
            close: html => {
                if (confirmed) {
                    let DAMAGE = html.find('[name=damage]')[0].value;
                    let damage = 0; if (DAMAGE.length > 0) damage = parseInt(DAMAGE);
                    let SOAK = html.find('[name=soak]')[0].value;
                    let soak = 0; if (SOAK.length > 0) soak = parseInt(SOAK);
                    let ADDED = html.find('[name=added]')[0];
                    let added = ADDED.checked;
                    let KNOCKOUT = html.find('[name=knockout]')[0];
                    let knockout = KNOCKOUT.checked;
                    let ALLOW = html.find('[name=nonlethal]')[0];
                    let allow = ALLOW.checked;
                    let SEND = html.find('[name=send]')[0];
                    let send = SEND.checked;

                    let statuses = this.applyDamage(damage + (added ? addeddamage : 0) - soak, knockout, allow);

                    if (send) {
                        const reportedStatus = statuses[statuses.length - 1];
                        let chatData = {
                            "content": game.i18n.format("ironclaw2e.dialog.damageCalc.chatMessage", { "name": speaker.alias, "condition": game.i18n.localize(CommonConditionInfo.getConditionLabel(reportedStatus)) }),
                            "speaker": speaker
                        };
                        ChatMessage.applyRollMode(chatData, game.settings.get("core", "rollMode"));
                        CONFIG.ChatMessage.documentClass.create(chatData);
                    }
                }
            }
        });
        dlog.render(true);
    }

    /** Special condition adding popup */
    popupAddCondition(readyname = "") {
        let confirmed = false;
        let speaker = getMacroSpeaker(this);
        let dlog = new Dialog({
            title: game.i18n.format("ironclaw2e.dialog.addCondition.title", { "name": speaker.alias }),
            content: `
     <form>
      <h1>${game.i18n.format("ironclaw2e.dialog.addCondition.header", { "name": this.data.name })}</h1>
      <div class="form-group">
       <label>${game.i18n.localize("ironclaw2e.dialog.addCondition.toAdd")}:</label>
      </div>
	  <div class="form-group">
	   <input id="cond" name="cond" value="${readyname}" onfocus="this.select();"></input>
      </div>
     </form>
     `,
            buttons: {
                one: {
                    icon: '<i class="fas fa-check"></i>',
                    label: game.i18n.localize("ironclaw2e.dialog.add"),
                    callback: () => confirmed = true
                },
                two: {
                    icon: '<i class="fas fa-times"></i>',
                    label: game.i18n.localize("ironclaw2e.dialog.cancel"),
                    callback: () => confirmed = false
                }
            },
            default: "one",
            render: html => { document.getElementById("cond").focus(); },
            close: html => {
                if (confirmed) {
                    let COND = html.find('[name=cond]')[0].value;
                    if (COND.length > 0) this.addEffect(makeStatCompareReady(COND));
                }
            }
        });
        dlog.render(true);
    }

    /* -------------------------------------------- */
    /* Supermassive Generic Dice Pool Roll Popup    */
    /* -------------------------------------------- */

    /** Supermassive function to make a dynamic popup window asking about which exact dice pools should be included
     * @param {string[]} prechecked Skills to autocheck on the dialog
     * @param {boolean} tnyes Whether to use a TN, true for yes
     * @param {number} tnnum TN to use
     * @param {string} extradice Default extra dice to use for the bottom one-line slot
     * @param {string} otherinputs HTML string to add to the dialog
     * @param {[string]} otherkeys An array of keys, to be used for UI information and with the added HTML for checkboxes in case the other dice can be switched off
     * @param {[number[]]} otherdice An array of dice arrays, the items should match exactly with their counterparts at otherkeys
     * @param {string} otherlabel Text to postpend to the label
     * @param successfunc Callback to execute after going through with the macro, will not execute if cancelled out
     */
    popupSelectRolled(prechecked = [], tnyes = false, tnnum = 3, extradice = "", otherinputs = "", otherkeys = [], otherdice = [], otherlabel = "", successfunc = null) {
        const data = this.data.data;
        let formconstruction = ``;
        let firstelement = "";
        let hastraits = data.hasOwnProperty("traits");
        let hasskills = data.hasOwnProperty("skills");
        let hashtml = otherinputs.length > 0;

        if (prechecked === null || typeof (prechecked) === "undefined") {
            console.warn("Prechecked stat array turned up null or undefined! This should not happen, correcting: " + prechecked);
            prechecked = [];
        }

        let extracareers = [];
        if (data.hasExtraCareers) { // Check if the actor has any extra careers to show
            data.extraCareerIds.forEach(x => extracareers.push(this.items.get(x)));
        }

        let statuseffectnotes = "";
        const burdened = hasConditionsIronclaw("burdened", this);
        if (burdened) {
            statuseffectnotes = `
     <div class="form-group">
       <label class="normal-label">${game.i18n.localize("ironclaw2e.dialog.dicePool.applyBurdened")}:</label>
       <input type="checkbox" id="burdened" name="burdened" value="1" checked></input>
     </div>`;
        }
        if (hasConditionsIronclaw("hiding", this)) {
            statuseffectnotes = `
     <div class="form-group">
       <span class="normal-text"><strong>${game.i18n.localize("ironclaw2e.effect.status.hiding")}:</strong> ${game.i18n.localize("ironclaw2e.dialog.dicePool.hidingExplanation")}:</span>
     </div>`;
        }

        if (hastraits) {
            formconstruction += `<h2>${game.i18n.localize("ironclaw2e.actor.traits")}:</h2>
       <div class="grid-2row grid-minimal">` + "\n";;
            for (let [key, trait] of Object.entries(data.traits)) {
                let lowerkey = makeStatCompareReady(key);
                if (firstelement == "")
                    firstelement = lowerkey;
                formconstruction += `<div class="form-group flex-group-center flex-tight">
       <label class="normal-label">${(data.hasExtraCareers && key === "career" ? trait.name : convertCamelCase(key))}: ${reformDiceString(trait.diceArray)}</label>
	   <input type="checkbox" id="${lowerkey}" name="trait" value="${lowerkey}" ${prechecked.includes(lowerkey) ? "checked" : ""}></input>
      </div>`+ "\n";
            }
            // Extra Career additional boxes
            if (extracareers.length > 0) {
                for (let [index, extra] of extracareers.entries()) {
                    if (index >= 2)
                        break; // For UI reasons, only show up to two extra careers on dice pool selection, these should select themselves from the top of the list in the sheet
                    let lowerkey = makeStatCompareReady(extra.data.data.careerName);
                    if (firstelement == "")
                        firstelement = lowerkey;
                    formconstruction += `<div class="form-group flex-group-center flex-tight">
       <label class="normal-label">${extra.data.data.careerName}: ${reformDiceString(extra.data.data.diceArray)}</label>
	   <input type="checkbox" id="${lowerkey}" name="trait" value="${lowerkey}" ${prechecked.includes(lowerkey) ? "checked" : ""}></input>
      </div>`+ "\n";
                }
            }
            formconstruction += `</div>` + "\n";
        }
        if (hasskills) {
            formconstruction += `<h2>${game.i18n.localize("ironclaw2e.actor.skills")}:</h2>
       <div class="grid grid-3col grid-minimal">` + "\n";
            for (let [key, skill] of Object.entries(data.skills)) {
                let lowerkey = makeStatCompareReady(key);
                if (firstelement == "")
                    firstelement = lowerkey;
                let usedname = (burdenedLimitedStat(lowerkey) ? String.fromCodePoint([9949]) : "") + " " + convertCamelCase(key) + ": " + reformDiceString(skill.diceArray);
                formconstruction += `<div class="form-group flex-group-center flex-tight">
       <label class="${usedname.length > 26 ? "tiny-label" : (usedname.length > 18 ? "small-label" : "normal-label")}">${usedname}</label>
	   <input type="checkbox" id="${lowerkey}" name="skill" value="${lowerkey}" ${prechecked.includes(lowerkey) ? "checked" : ""}></input>
      </div>`+ "\n";
            }
            formconstruction += `</div>` + "\n";
        }

        if (firstelement == "") {
            console.warn("Somehow, an empty actor sheet was received! " + this.data.name);
            return null;
        }

        let confirmed = false;
        let dlog = new Dialog({
            title: game.i18n.localize("ironclaw2e.dialog.dicePool.title"),
            content: `
     <form class="ironclaw2e">
     <h1>${game.i18n.format("ironclaw2e.dialog.dicePool.header", { "name": this.data.name })}</h1>
     <span class="small-text">${game.i18n.format("ironclaw2e.dialog.dicePool.showUp", { "alias": getMacroSpeaker(this).alias })}</span>
     <div class="form-group">
       <label class="normal-label">${game.i18n.localize("ironclaw2e.dialog.dicePool.useTN")}:</label>
       <input type="checkbox" id="iftn" name="iftn" value="1" ${tnyes ? "checked" : ""}></input>
	   <input id="tn" name="tn" value="${tnnum}" onfocus="this.select();"></input>
     </div>
      ${statuseffectnotes}
      ${formconstruction}
      ${otherinputs}
	  <div class="form-group">
       <label class="normal-label">${game.i18n.localize("ironclaw2e.dialog.dicePool.extraDice")}:</label>
	   <input id="dices" name="dices" value="${extradice}" onfocus="this.select();"></input>
      </div>
     <div class="form-group">
       <label class="normal-label">${game.i18n.localize("ironclaw2e.dialog.dicePool.limitAllLabel")}:</label>
       <input type="checkbox" id="iflimit" name="iflimit" value="1"></input>
	   <input id="limit" name="limit" value="" placeholder="${game.i18n.localize("ironclaw2e.dialog.dicePool.limitAllPlaceholder")}" onfocus="this.select();"></input>
     </div>
     </form>
     `,
            buttons: {
                one: {
                    icon: '<i class="fas fa-check"></i>',
                    label: game.i18n.localize("ironclaw2e.dialog.roll"),
                    callback: () => confirmed = true
                },
                two: {
                    icon: '<i class="fas fa-times"></i>',
                    label: game.i18n.localize("ironclaw2e.dialog.cancel"),
                    callback: () => confirmed = false
                }
            },
            default: "one",
            render: html => { document.getElementById("iftn").focus(); },
            close: async html => {
                if (confirmed) {
                    let traitchecks = html.find('input:checkbox[name=trait]:checked');
                    let skillchecks = html.find('input:checkbox[name=skill]:checked');
                    let traitvalues = [];
                    let skillvalues = [];
                    let totaldice = [0, 0, 0, 0, 0];

                    for (let i = 0; i < traitchecks.length; ++i) {
                        traitvalues.push(traitchecks[i].value);
                    }
                    for (let i = 0; i < skillchecks.length; ++i) {
                        skillvalues.push(skillchecks[i].value);
                    }

                    let IFBURDENED = html.find('[name=burdened]');
                    let isburdened = IFBURDENED.length > 0 ? IFBURDENED[0].checked : false;

                    let IFLIMIT = html.find('[name=iflimit]')[0];
                    let uselimit = IFLIMIT.checked;
                    let LIMIT = html.find('[name=limit]')[0].value;
                    let limit = 0;
                    let limitparsed = parseSingleDiceString(LIMIT.trim()); // Check if the limit field is a die, in which case, parse what value it's meant to limit to
                    if (Array.isArray(limitparsed)) limit = checkDiceArrayIndex(limitparsed[1]);
                    else if (LIMIT.length > 0) limit = parseInt(LIMIT);

                    let IFTNSS = html.find('[name=iftn]')[0];
                    let IFTN = IFTNSS.checked;
                    let TNSS = html.find('[name=tn]')[0].value;
                    let TN = 0; if (TNSS.length > 0) TN = parseInt(TNSS);
                    let DICES = html.find('[name=dices]')[0].value;
                    let DICE = findTotalDice(DICES);

                    let labelgiven = false;
                    let label = "";
                    if (IFTN)
                        label = game.i18n.localize("ironclaw2e.chat.rollingTN") + ": ";
                    else
                        label = game.i18n.localize("ironclaw2e.chat.rollingHighest") + ": ";

                    if (hastraits || hasskills) {
                        let statfoobar = this._getDicePools(traitvalues, skillvalues, isburdened, labelgiven);
                        totaldice = statfoobar.totalDice;
                        label += statfoobar.label;
                        labelgiven = statfoobar.labelGiven;
                    }
                    if (Array.isArray(otherdice) && Array.isArray(otherkeys) && otherdice.length > 0 && otherdice.length == otherkeys.length) {
                        for (let i = 0; i < otherdice.length; i++) {
                            let OTHER = html.find(`[name=${makeStatCompareReady(otherkeys[i])}]`);
                            let otherchecked = (hashtml && OTHER.length > 0 ? OTHER[0].checked : true);
                            if (otherchecked) {
                                if (labelgiven)
                                    label += " + ";
                                totaldice = addArrays(totaldice, otherdice[i]);
                                label += otherkeys[i];
                                labelgiven = true;
                            }
                        }
                    }
                    if (DICE.some(element => element != 0)) {
                        label += " + extra";
                        totaldice = addArrays(totaldice, DICE);
                    }
                    label += ".";
                    if (typeof (otherlabel) === 'string' && otherlabel.length > 0)
                        label += `<p style="color:black">${otherlabel}</p>`;

                    if (uselimit) {
                        totaldice = enforceLimit(totaldice, limit);
                    }

                    let rollreturn;
                    if (IFTN)
                        rollreturn = await rollTargetNumber(TN, totaldice[0], totaldice[1], totaldice[2], totaldice[3], totaldice[4], label, this);
                    else
                        rollreturn = await rollHighest(totaldice[0], totaldice[1], totaldice[2], totaldice[3], totaldice[4], label, this);

                    if (successfunc && typeof (successfunc) == "function") {
                        successfunc(rollreturn);
                    }
                }
            }
        }, { width: 600 });
        dlog.render(true);
    }
}