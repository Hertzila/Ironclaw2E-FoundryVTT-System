import { checkDiceArrayEmpty, diceFieldUpgrade, enforceLimitArray, findInItems, findTotalDiceArrays, flattenDicePoolArray, getCombatAdvantageConstruction, getTemplatePosition, parseFractionalNumber, popupConfirmationBox } from "../helpers.js";
import { addArrays } from "../helpers.js";
import { makeCompareReady } from "../helpers.js";
import { reformDiceString } from "../helpers.js";
import { convertCamelCase } from "../helpers.js";
import { getMacroSpeaker } from "../helpers.js";
import { findActorToken } from "../helpers.js";
import { findTotalDice } from "../helpers.js";
import { splitStatString } from "../helpers.js";
import { nullCheckConcat } from "../helpers.js";
import { parseSingleDiceString } from "../helpers.js";
import { checkDiceIndex } from "../helpers.js";
import { getDiceArrayMaxValue } from "../helpers.js";
import { checkApplicability } from "../helpers.js";
import { compareDiceArrays } from "../helpers.js";
import { getSpeakerActor } from "../helpers.js";
import { getDistancePenaltyConstruction } from "../helpers.js";
import { checkQuickModifierKey } from "../helpers.js";
import { getDistanceBetweenPositions } from "../helpers.js";
import { formDicePoolField } from "../helpers.js";
import { checkConditionIronclaw, checkConditionQuota, CommonConditionInfo, getConditionSelectObject, getSingleConditionIronclaw, getTargetConditionQuota, setTargetConditionQuota } from "../conditions.js";
import { checkActorItemAllowedType, checkStandardDefense, CommonSystemInfo, getRangeDiceFromDistance } from "../systeminfo.js";
import { AoETemplateIronclaw } from "../aoe-template.js";
// For condition management
import { hasConditionsIronclaw } from "../conditions.js";
import { getConditionNamesIronclaw } from "../conditions.js";
import { addConditionsIronclaw } from "../conditions.js";
import { removeConditionsIronclaw } from "../conditions.js";
// The rest are for the supermassive function
import { CardinalDiceRoller, rollHighestOneLine } from "../dicerollers.js";
import { enforceLimit } from "../helpers.js";
import { burdenedLimitedStat } from "../helpers.js";
import { Ironclaw2EItem } from "../item/item.js";

/**
 * Extend the base Actor entity by defining a custom data necessary for the Ironclaw system
 * @extends {Actor}
 */
export class Ironclaw2EActor extends Actor {

    /* -------------------------------------------- */
    /* Static Functions                             */
    /* -------------------------------------------- */
    /* eslint-disable */

    /* -------------------------------------------- */
    /* Static Hook Functions                        */
    /* -------------------------------------------- */

    /**
     * Function to hook on item pre-create, checks for template items to stop them from being added to actors
     * @param {Ironclaw2EItem} item
     * @param {object} data
     * @param {object} options
     * @param {string} user
     */
    static onActorPreCreateItem(item, data, options, user) {
        const actor = item.actor;
        if (!actor) {
            // If the item has no actor assigned, meaning it's not created as part of an actor, just return out with "true"
            return true;
        }

        // If the item type is not found within the list of allowed item types for the actor type, disallow the creation
        if (!checkActorItemAllowedType(actor.type, item.type)) {
            console.log(`${game.ironclaw2e.ironclawLogHeader}Item of type "${item.type}" not allowed for actors of type "${actor.type}", cancelling creation.`);
            return false;
        }

        // The hook is only really relevant for template items
        // If the item is a template item, grab the data from it and update the actor with it, then prevent the item's creation by returning false
        if (item.type === "speciesTemplate" || item.type === "careerTemplate") {
            // Only applies if the actor actually exists
            actor.applyTemplate(data, { "confirm": options?.confirmCreation ?? false });
            return false;
        }
    }

    /**
     * Function to hook on active effect creation, for automatic checks on condition adding
     * @param {ActiveEffect} effect
     * @param {object} data
     * @param {object} options
     * @param {string} user
     */
    static async onActorCreateActiveEffect(effect, options, user) {
        if (game.user.id === user) {
            /** @type {Ironclaw2EActor} */
            const actor = effect.parent;
            if (actor) { // Make sure only the calling user executes the function and that the effect actually had an actor assigned

                // On Fire, add light source effect
                const onFireLight = game.settings.get("ironclaw2e", "autoAddOnFireLight");
                if (onFireLight) {
                    if (checkConditionIronclaw(effect, "onfire")) {
                        const activeSource = actor.items.find(element => element.type === "illumination" && element.system.lighted === true);
                        if (!activeSource) // If no active source is found, auto-add the On Fire light
                            await actor.activateFireSource();
                    }
                }
            }
        }
    }

    /**
     * Function to hook on active effect deletion, for automatic checks on condition removal
     * @param {ActiveEffect} effect
     * @param {object} options
     * @param {string} user
     */
    static async onActorDeleteActiveEffect(effect, options, user) {
        if (game.user.id === user) {
            /** @type {Ironclaw2EActor} */
            const actor = effect.parent;
            if (actor) { // Make sure only the calling user executes the function and that the effect actually had an actor assigned

                // On Fire, remove light source effect
                const onFireCheck = actor.getFlag("ironclaw2e", "fireLightSet") ?? false;
                if (onFireCheck) {
                    if (checkConditionIronclaw(effect, "onfire")) {
                        await actor.refreshLightSource();
                    }
                }
            }
        }
    }

    /**
     * Function to hook on item deletion, for automatic checks on condition removal
     * @param {Ironclaw2EItem} item
     * @param {object} options
     * @param {string} user
     */
    static async onActorDeleteItem(item, options, user) {
        if (game.user.id === user) {
            /** @type {Ironclaw2EActor} */
            const actor = item.parent;
            if (actor) { // Make sure only the calling user executes the function and that the item actually had an actor assigned

                // Call to remove any extra senses the Gift offered
                if (item.type === "gift" && item.system.extraSense) {
                    let detectionUpdate = new Map();
                    let visionUpdate = null;
                    // Handle passives if they exist
                    if (item.system.hasPassiveDetection) {
                        const passives = CommonSystemInfo.extraSenses[item.system.extraSenseName].detectionPassives;
                        for (let mode of passives) { // Remove the passive detections
                            detectionUpdate.set(mode.id, { "remove": true, "range": mode.range ?? 0, "priority": false });
                        }
                    }
                    // Handle actives if on
                    if (item.system.extraSenseEnabled > 0) {
                        const actives = CommonSystemInfo.extraSenses[item.system.extraSenseName].detectionModes;
                        for (let mode of actives) { // Remove the active detections
                            detectionUpdate.set(mode.id, { "remove": true, "range": mode.range ?? 0, "priority": false });
                        }
                        if (item.system.extraSenseEnabled === 2) { // Also change the visuals back to defaults if active
                            visionUpdate = actor.getFlag("ironclaw2e", "defaultVisionSettings") ?? CommonSystemInfo.defaultVision;
                        }
                    }

                    await actor._updateTokenVision(visionUpdate, detectionUpdate, false);
                }
            }
        }
    }

    /* -------------------------------------------- */
    /* Static Click Functions                       */
    /* -------------------------------------------- */

    /**
     * Handle the chat button event for clicking attack
     * @param {any} event
     */
    static async onChatAttackClick(event) {
        event.preventDefault();
        const element = event.currentTarget;
        const dataset = element.dataset;
        const message = game.messages.get($(event.currentTarget).closest('.chat-message')[0]?.dataset?.messageId);

        const directroll = checkQuickModifierKey();

        // Trigger the attack roll
        Ironclaw2EActor.triggerAttackerRoll(message, "attack", directroll, dataset?.skipresist == "true");
    }

    /**
     * Handle the chat button event for clicking spark
     * @param {any} event
     */
    static async onChatSparkClick(event) {
        event.preventDefault();
        const element = event.currentTarget;
        const message = game.messages.get($(event.currentTarget).closest('.chat-message')[0]?.dataset?.messageId);

        const directroll = checkQuickModifierKey();

        // Trigger the spark roll
        Ironclaw2EActor.triggerAttackerRoll(message, "spark", directroll);
    }

    /**
     * Handle the chat button event for clicking defense
     * @param {any} event
     */
    static async onChatDefenseClick(event) {
        event.preventDefault();
        const element = event.currentTarget;
        const dataset = element.dataset;
        const defenseset = $(event.currentTarget).closest('.defense-buttons')[0]?.dataset;
        const message = game.messages.get($(event.currentTarget).closest('.chat-message')[0]?.dataset?.messageId);

        if (!defenseset || !message) {
            return console.warn("onChatDefenseClick somehow failed to get proper data.")
        }

        // Get the actor based on the current speaker
        let defenseActor = getSpeakerActor();
        let validDefenses = {};
        let defenseOptions = [];

        let otheritem = {};
        const messageId = message.id;
        const messageFlags = message?.flags?.ironclaw2e;
        if (messageFlags) {
            otheritem = Ironclaw2EActor.getOtherItemFlags(messageFlags, messageId);
        }

        const directroll = checkQuickModifierKey();
        const addMessageId = (x => { Ironclaw2EActor.addCallbackToAttackMessage(x?.message, messageId); });

        // Check what defense type was called and either directly roll that defense or compile the list of weapons that fit the type for the next step
        if (defenseActor && dataset?.defensetype) {
            switch (dataset.defensetype) {
                case "dodge":
                    return defenseActor.popupDefenseRoll({ "prechecked": CommonSystemInfo.dodgingBaseStats }, { directroll, otheritem }, null, addMessageId);
                    break;
                case "special":
                    return defenseActor.popupDefenseRoll({ "prechecked": splitStatString(defenseset.defense) }, { directroll, "isspecial": true, otheritem }, null, addMessageId);
                    break;
                case "resist":
                    return defenseActor.popupResistRoll({ "prechecked": splitStatString(defenseset.defense) }, { directroll, otheritem }, null, addMessageId);
                    break;
                case "parry":
                    const parries = defenseActor.items.filter(element => element.type === 'weapon' && element.system.canDefend);
                    defenseOptions = parries;
                    validDefenses.parryvalid = true;
                    break;
                case "counter":
                    const counters = defenseActor.items.filter(element => element.type === 'weapon' && element.system.canCounter);
                    defenseOptions = counters;
                    validDefenses.countervalid = true;
                    break;
                default:
                    console.error("Somehow, onChatDefenseClick defaulted on the defensetype switch: " + dataset.defensetype);
                    break;
            }
        }

        // Call the actual popup dialog to choose with what weapon to defend with
        if (defenseActor) {
            Ironclaw2EActor.weaponDefenseDialog(defenseActor, defenseOptions, defenseset?.weaponname, validDefenses, otheritem);
        } else {
            ui.notifications.warn("ironclaw2e.ui.actorNotFoundForMacro", { localize: true });
        }
    }

    /**
     * Handle the chat button event for clicking soak
     * @param {any} event
     */
    static async onChatSoakClick(event) {
        event.preventDefault();
        const element = event.currentTarget;
        const dataset = element.dataset;
        const holderset = $(event.currentTarget).closest('.button-holder')[0]?.dataset;
        const message = game.messages.get($(event.currentTarget).closest('.chat-message')[0]?.dataset?.messageId);

        if (!holderset || !dataset) {
            return console.warn("onChatSoakClick somehow failed to get proper data.");
        }

        // Get the actor, either through the sceneid if synthetic, or actorid if a full one
        let soakActor = getSpeakerActor();

        let autoHits = false;
        let defenseStats = null;
        let otheritem = {};
        const messageId = message.id;
        const messageFlags = message?.flags?.ironclaw2e;
        if (messageFlags) {
            autoHits = messageFlags.attackDamageAutoHits;
            defenseStats = messageFlags.attackDamageDefense;
            otheritem = Ironclaw2EActor.getOtherItemFlags(messageFlags, messageId);
        }

        const directroll = checkQuickModifierKey();
        const usedDamage = Number.parseInt(dataset.damage);
        let resistSoak = 0;

        // If the soak actor is found and the data necessary for it exists, roll the soak
        if (soakActor && dataset.soaktype) {
            let wait = function (x) {
                if (x?.tnData) {
                    const verybad = (x.highest === 1 ? 1 : 0); // In case of botch, increase damage by one
                    const soaks = x.tnData.successes + resistSoak;
                    if (!directroll)
                        soakActor.popupDamage(usedDamage + verybad, soaks, holderset.conditions);
                    else soakActor.silentDamage(usedDamage + verybad, soaks, holderset.conditions);
                } else {
                    if (!directroll)
                        soakActor.popupDamage(usedDamage, resistSoak, holderset.conditions);
                    else soakActor.silentDamage(usedDamage, resistSoak, holderset.conditions);
                }
            };
            if (dataset.soaktype !== "conditional") {
                if (autoHits && defenseStats) { // For when resistance roll is added to the soak directly
                    const resist = await soakActor.popupResistRoll({ "prechecked": defenseStats, "otherlabel": game.i18n.format("ironclaw2e.dialog.dicePool.explosionResist", { "name": otheritem.name }) },
                        { directroll, otheritem });
                    resistSoak = resist?.tnData?.successes; // Only successes count
                }
                soakActor.popupSoakRoll({
                    "prechecked": soakActor.getActorScaleType() === "vehicle" ? CommonSystemInfo.soakVehicleStats : CommonSystemInfo.soakBaseStats,
                    "otherlabel": game.i18n.format("ironclaw2e.dialog.dicePool.soakAgainst", { "name": otheritem.name })
                },
                    { directroll, "checkweak": (holderset.weak == "true"), "checkarmor": (holderset.penetrating == "false") }, wait);
            } else {
                if (!directroll)
                    soakActor.popupDamage(-4, 0, holderset.conditions);
                else soakActor.silentDamage(-4, 0, holderset.conditions);
            }
        } else {
            ui.notifications.warn("ironclaw2e.ui.actorNotFoundForMacro", { localize: true });
        }
    }

    /**
     * The function to trigger when a user presses the "Place Template" button
     * @param {any} event
     */
    static async onPlaceExplosionTemplate(event) {
        event.preventDefault();
        const dataset = event.currentTarget.dataset;
        const message = game.messages.get($(event.currentTarget).closest('.chat-message')[0]?.dataset?.messageId);

        if (!dataset || !message) {
            console.error("Placing a template didn't get the correct data: " + dataset + " " + message);
            return;
        }

        const messageFlags = message?.flags?.ironclaw2e;
        const usedItem = Ironclaw2EActor.getItemActorFlags(messageFlags);
        const attackToken = Ironclaw2EActor.getItemToken(usedItem);
        if (!attackToken) {
            return;
        }

        // Function to execute on success, setting the proper flags to the item data message
        const onSuccess = async (x) => {
            const flags = {
                "ironclaw2e.weaponTemplatePos": { "x": x.x, "y": x.y, "elevation": attackToken.elevation },
                "ironclaw2e.weaponTemplateId": x.id,
                "ironclaw2e.weaponTemplateSceneId": x.parent?.id
            };
            message.update({ "_id": message.id, "flags": flags });
        };

        const template = AoETemplateIronclaw.fromRange(dataset.arearange, { "elevation": attackToken.elevation, "successfunc": onSuccess });
        if (template) template.drawPreview();
    }

    static async onChangeTacticsUse(event) {
        event.preventDefault();
        const message = game.messages.get($(event.currentTarget).closest('.chat-message')[0]?.dataset?.messageId);
        const value = event.currentTarget.checked;

        const flags = {
            "ironclaw2e.attackUsingTactics": value
        };
        message.update({ "_id": message.id, "flags": flags });
    }

    /**
     * Handle the chat button event for using a gift
     * @param {any} event
     */
    static async onChatGiftUseClick(event) {
        event.preventDefault();
        const element = event.currentTarget;
        const message = game.messages.get($(event.currentTarget).closest('.chat-message')[0]?.dataset?.messageId);
        const messageFlags = message?.flags?.ironclaw2e;

        const usedItem = Ironclaw2EActor.getItemActorFlags(messageFlags);
        if (!usedItem) {
            console.error("Attacker chat roll failed to get the proper information from message flags: " + message);
            return;
        }

        const directroll = checkQuickModifierKey();
        const itemActor = Ironclaw2EActor.getItemActor(usedItem);

        if (itemActor) {
            itemActor.items.get(usedItem.itemId).giftRoll(directroll);
        } else {
            ui.notifications.warn("ironclaw2e.ui.actorNotFoundForMacro", { localize: true });
        }
    }

    /* -------------------------------------------- */
    /* Static Utility Functions                     */
    /* -------------------------------------------- */

    /**
     * Construct and pop up a dialog to pick the defending weapon
     * @param {Ironclaw2EActor} actor The actor in question
     * @param {[Ironclaw2EItem]} optionsource What options are available
     * @param {string} weaponname The name of the attacking weapon
     * @param {boolean} [parryvalid] Whether parries are a valid option
     * @param {boolean} [countervalid] Whether counters are a valid option
     * @param {object} otheritem The opposing item for this roll
     */
    static async weaponDefenseDialog(actor, optionsource, weaponname, { parryvalid = false, countervalid = false } = {}, otheritem = null) {
        const heading = game.i18n.format("ironclaw2e.dialog.defense.heading", { "weapon": weaponname });
        const rollLabel = game.i18n.format("ironclaw2e.dialog.defense.label", { "weapon": weaponname });
        let options = "";

        if (actor) {
            if (parryvalid) {
                for (let foo of optionsource) {
                    if (foo.system.canDefend)
                        options += `<option value="${foo.id}" data-type="parry">${game.i18n.format("ironclaw2e.dialog.defense.parryRoll", { "name": foo.name })}</option >`;
                }
            }
            if (countervalid) {
                for (let foo of optionsource) {
                    if (foo.system.canCounter)
                        options += `<option value="${foo.id}" data-type="counter">${game.i18n.format("ironclaw2e.dialog.defense.counterRoll", { "name": foo.name })}</option >`;
                }
            }
        }
        options += `<option value="" data-type="extra">${game.i18n.localize("ironclaw2e.dialog.defense.extraOnly")}</option >`;

        let confirmed = false;
        let speaker = getMacroSpeaker(actor);
        let dlog = new Dialog({
            title: heading,
            content: `
        <form class="ironclaw2e">
        <div class="flexcol">
         <span class="small-text">${game.i18n.format("ironclaw2e.dialog.dicePool.showUp", { "alias": speaker.alias })}</span>
         <select name="defensepick" id="defensepick">
         ${options}
         </select>
        </div>
        <div class="form-group">
         <label class="normal-label">${game.i18n.localize("ironclaw2e.dialog.defense.extraField")}:</label>
	     <input id="extra" name="extra" value="" onfocus="this.select();"></input>
        </div>
        </form>`,
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
            render: html => { document.getElementById("defensepick").focus(); },
            close: async html => {
                if (confirmed) {
                    const directroll = checkQuickModifierKey();

                    const DEFENSE = html.find('[name=defensepick]')[0];
                    const defensetype = DEFENSE.selectedOptions[0].dataset.type;
                    const defensevalue = DEFENSE.selectedOptions[0].value;
                    const EXTRA = html.find('[name=extra]')[0]?.value;

                    if (defensetype === "counter" || defensetype === "parry") {
                        const weapon = actor?.items.get(defensevalue);
                        if (defensetype === "counter") weapon?.counterRoll(directroll, otheritem, EXTRA);
                        if (defensetype === "parry") weapon?.defenseRoll(directroll, otheritem, EXTRA);
                    } else if (defensetype === "extra") {
                        const extra = findTotalDice(EXTRA);
                        const rollresult = await CardinalDiceRoller.rollHighestArray(extra, rollLabel, actor);
                        if (rollresult.message) Ironclaw2EActor.addCallbackToAttackMessage(rollresult.message, otheritem?.messageId);
                    }
                }
            }
        }, { focus: false });
        dlog.render(true);
    }

    /**
     * Separate function to trigger the actual attacker roll from chat
     * @param {object} message
     * @param {string} rolltype
     * @param {boolean} directroll
     * @param {boolean} skipresist
     * @param {number} presettn
     * @param {number} resists
     */
    static triggerAttackerRoll(message, rolltype, directroll = false, skipresist = false, defenders = null, presettn = 3, resists = -1) {
        const messageFlags = message?.flags?.ironclaw2e;
        const usedItem = Ironclaw2EActor.getItemActorFlags(messageFlags);
        if (!usedItem) {
            console.error("Attacker chat roll failed to get the proper information from message flags: " + message);
            return;
        }

        const attackActor = Ironclaw2EActor.getItemActor(usedItem);
        const skipActor = (!usedItem.actorId && !usedItem.sceneId && !usedItem.tokenId);

        // Trigger the actual roll if the attacker is found and the weapon id is listed
        if (attackActor && usedItem.itemId) {
            if (rolltype === "attack")
                attackActor.items.get(usedItem.itemId).attackRoll(directroll, skipresist, presettn, resists,
                    { "sourcemessage": message, "defendermessage": defenders, "addtactics": messageFlags?.attackUsingTactics ?? false });
            else if (rolltype === "spark")
                attackActor.items.get(usedItem.itemId).sparkRoll(directroll);
        } else if (!attackActor) {
            if (skipActor && game.user.isGM) { // If the item has no flags for where it is, instead try and get it from the directory and launch a roll from there
                if (rolltype === "attack")
                    game.items.get(usedItem.itemId)?.attackRoll(directroll, skipresist, presettn, resists,
                        { "sourcemessage": message, "defendermessage": defenders, "addtactics": messageFlags?.attackUsingTactics ?? false });
                else if (rolltype === "spark")
                    game.items.get(usedItem.itemId)?.sparkRoll(directroll);
            } else {
                ui.notifications.warn("ironclaw2e.ui.actorNotFoundForMacro", { localize: true });
            }
        }
    }

    /**
     * Function to add the attacker's message id to a defending roll to allow the attacker to auto-use the correct TN through the context menu
     * @param {string} messageid
     */
    static async addCallbackToAttackMessage(message, messageid) {
        if (!message || !messageid) {
            // If either input is falsey, return out 
            return null;
        }

        let updateData = {
            flags: { "ironclaw2e.defenseForAttack": messageid }
        };
        return await message.update(updateData);
    }

    /**
     * Get the item flags from a message
     * @param {object} flags
     * @param {string} messageId
     */
    static getOtherItemFlags(flags, messageId = "") {
        if (!flags) {
            return null;
        }
        let otheritem = {};
        // Grab the message flags
        otheritem.messageId = messageId;
        otheritem.name = flags.weaponName;
        otheritem.descriptors = flags.weaponDescriptors;
        otheritem.effects = flags.weaponEffects;
        otheritem.stats = [...flags.weaponAttackStats];
        otheritem.equip = flags.weaponEquip;
        otheritem.range = flags.weaponRange;
        otheritem.multiAttack = flags.weaponMultiAttack;
        otheritem.multiRange = flags.weaponMultiRange;
        otheritem.attackerPos = flags.itemUserPos;
        otheritem.templatePos = getTemplatePosition(flags);
        otheritem.attackerRangeReduction = flags.itemUserRangeReduction;
        otheritem.attackerRangeAutocheck = !(flags.itemUserRangeAutocheck === false); // If and only if the the value is false, will the value be false; if it is true, undefined or something else, value will be true
        if (flags.attackUsingTactics) otheritem.stats.push("tactics"); // Add Tactics to the used stat pool for the attack

        return otheritem;
    }

    /**
     * Get the using actor flags from a message
     * @param {object} flags
     */
    static getItemActorFlags(flags) {
        if (!flags) {
            return null;
        }
        let usedItem = {};
        if (flags) {
            // Grab the message flags
            usedItem.itemId = flags.itemId;
            usedItem.actorId = flags.itemActorId;
            usedItem.tokenId = flags.itemTokenId;
            usedItem.sceneId = flags.itemSceneId;
        } else {
            console.error("Attacker flag get failed to get the proper information from message flags: " + flags);
            return null;
        }
        return usedItem;
    }

    /**
     * Get the using actor from the item data
     * @param {object} item
     */
    static getItemActor(item) {
        if (!item) {
            return null;
        }

        // Get the actor, either through the sceneid if synthetic, or actorid if a full one
        let itemActor = null;
        if (item.sceneId && item.tokenId) {
            const foo = game.scenes.get(item.sceneId)?.tokens.get(item.tokenId);
            itemActor = foo?.actor;
        } else if (item.actorId) {
            itemActor = game.actors.get(item.actorId);
        }

        // Make sure the current user actually has a permission for the actor
        if (itemActor) {
            if (game.user.isGM || itemActor.isOwner) {
                return itemActor;
            } else {
                ui.notifications.warn("ironclaw2e.ui.ownershipInsufficient", { localize: true, thing: "actor" });
            }
        }
        return null;
    }

    /**
     * Get the using token from the item data
     * @param {object} item
     */
    static getItemToken(item) {
        if (!item) {
            return null;
        }

        // Get the token, either through the sceneid if possible, or actorid if not
        let itemToken = null;
        if (item.sceneId && item.tokenId) {
            itemToken = game.scenes.get(item.sceneId)?.tokens.get(item.tokenId);
        } else if (item.actorId) {
            const foo = game.actors.get(item.actorId);
            itemToken = findActorToken(foo);
        }

        // Make sure the current user actually has a permission for the actor
        if (itemToken) {
            if (game.user.isGM || itemToken.isOwner) {
                return itemToken;
            } else {
                ui.notifications.warn("ironclaw2e.ui.ownershipInsufficient", { localize: true, thing: "token" });
            }
        }
        return null;
    }

    /**
     * Send the returned damage status to chat
     * @param {DamageReturn} returnedstatus
     * @param {Object} speaker
     */
    static async sendDamageToChat(returnedstatus, speaker) {
        const reportedStatus = returnedstatus.conditionArray.length > 0 ? returnedstatus.conditionArray[returnedstatus.conditionArray.length - 1] : null;
        const chatTemplateData = {
            "speaker": speaker.alias,
            "hideCondition": returnedstatus.hideCondition,
            "hasVehicleDamage": returnedstatus.vehicleDamage != undefined,
            "reportedCondition": reportedStatus
                ? game.i18n.localize(CommonConditionInfo.getConditionTransId(reportedStatus))
                : game.i18n.localize("ironclaw2e.chatInfo.damageEffect.chatNothing"),
            "vehicleText": `ironclaw2e.chatInfo.damageEffectVehicle.${returnedstatus.vehicleDamage}`,
            "wardChanged": returnedstatus.wardDamage > 0,
            "wardDamage": returnedstatus.wardDamage,
            "wardDestroyed": returnedstatus.wardDestroyed
        };
        const chatContents = await renderTemplate("systems/ironclaw2e/templates/chat/damage-effect.html", chatTemplateData);

        let chatData = {
            "content": chatContents,
            "speaker": speaker
        };
        ChatMessage.applyRollMode(chatData, game.settings.get("core", "rollMode"));
        CONFIG.ChatMessage.documentClass.create(chatData);
    }

    /* eslint-enable */
    /* -------------------------------------------- */
    /* Normal Functions                             */
    /* -------------------------------------------- */

    /* -------------------------------------------- */
    /* Overrides                                    */
    /* -------------------------------------------- */


    /** @override
     * Tweak the actor creation data before the actual creation
     */
    async _preCreate(data, options, user) {
        await super._preCreate(data, options, user);

        const autoPrototypeSetup = game.settings.get("ironclaw2e", "autoPrototypeSetup");
        if (!autoPrototypeSetup) // If not enabled, immediately return out of the function
            return;

        let prototypeToken = data.prototypeToken ?? {};
        prototypeToken.displayName = CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER;

        if (data.type === 'character') {
            prototypeToken.actorLink = true;
            prototypeToken.displayName = CONST.TOKEN_DISPLAY_MODES.OWNER;
            if (!prototypeToken.sight) prototypeToken.sight = {};
            prototypeToken.sight.enabled = true;
        }

        return this.updateSource({ prototypeToken });
    }

    /** @override
     * Perform any last data modifications after super.prepareData has finished executing
     */
    prepareData() {
        // Performs the following, in order: data reset, prepareBaseData(), prepareEmbeddedDocuments(), prepareDerivedData()
        super.prepareData();
        const actor = this;

        // If the actor is a creature of some sort, do the appropriate post-processing
        if (actor.type === "character" || actor.type === "mook" || actor.type === "beast") {
            // Battle Stat roll dice pool visuals
            this._battleDataRollVisuals(actor);
            // The asynchronously updating parts
            this._actorUpdateAsyncCalls(actor);
        }
        // Whereas if the actor is a vehicle, do the necessary async processing here
        else if (actor.type === "vehicle") {

        }
    }

    /* -------------------------------------------- */
    /* Process Basic                                */
    /* -------------------------------------------- */

    /** @override
     * Process the base data before anything else is
     */
    prepareBaseData() {
        super.prepareBaseData();
        const actor = this;

        if (actor.type === 'vehicle') {
            this._prepareVehicleActor(actor);
        }
    }

    /**
     * Prepare the default actor for vehicles
     */
    _prepareVehicleActor(actor) {
        const system = actor.system;

        let resolvedDefaultCrew = null;
        if (system.defaultCrewMember) {
            try {
                resolvedDefaultCrew = fromUuidSync(system.defaultCrewMember);
            } catch (err) {
                console.warn(err);
            }
        }
        system.resolvedDefaultCrew = resolvedDefaultCrew;
    }

    /* -------------------------------------------- */
    /* Process Embedded                             */
    /* -------------------------------------------- */

    /** @override
     * Process the embedded documents data, mostly for lists
     */
    prepareEmbeddedDocuments() {
        super.prepareEmbeddedDocuments();
        const actor = this;

        // Only do special embedded processing for actor types it matters
        if (actor.type === 'character' || actor.type === 'mook' || actor.type === 'beast') {
            this._prepareExtraCareerData(actor);
            this._prepareGiftData(actor);
            this._prepareWeaponData(actor);
        }
    }

    /**
     * Prepare Extra Career item data
     */
    _prepareExtraCareerData(actor) {
        const system = actor.system;

        // Extra Career additions
        const extraCareers = this.items.filter(element => element.type === 'extraCareer');
        if (extraCareers.length > 0) {
            system.hasExtraCareers = true;
            extraCareers.sort((a, b) => a.sort - b.sort);
            let ids = [];
            extraCareers.forEach(x => { if (x.system.valid) ids.push(x.id); });
            system.extraCareerIds = ids;
        }
        else
            system.hasExtraCareers = false;
    }

    /**
     * Prepare Gift item data
     */
    _prepareGiftData(actor) {
        const system = actor.system;

        // Gift Skill marks
        const markGifts = this.items.filter(element => element.type === 'gift' && element.system.grantsMark);
        let markMap = new Map();
        for (let gift of markGifts) {
            const giftSys = gift.system;
            markMap.set(giftSys.skillName, 1 + (markMap.get(giftSys.skillName) ?? 0));
        }
        system.tempMarks = markMap;

        // Special settings
        const specialGifts = this.items.filter(element => element.type === 'gift' && element.system.usedSpecialSettings?.length > 0);
        if (specialGifts.length > 0) {
            system.processingLists = {}; // If any of the actor's gifts have special settings, add the holding object for the lists
            system.replacementLists = new Map(); // To store any gifts that get replaced by others, stored with the actor as derived data to avoid contaminating the actual gifts

            for (let gift of specialGifts) {
                for (let setting of gift.system.usedSpecialSettings) {
                    if (!(setting.settingMode in system.processingLists)) {
                        // If the relevant array for a setting mode does not exist, add an empty one
                        system.processingLists[setting.settingMode] = [];
                    }
                    // If the gift has the replacement field set, attempt to find what it replaces
                    if (setting.replaceName) {
                        const replacement = specialGifts.find(x => makeCompareReady(x.name) === setting.replaceName)?.system.usedSpecialSettings.find(x => x.settingMode === setting.settingMode);
                        if (replacement) { // If the original gift this one replaces is found, add it to the map of replacements stored with the actor
                            if (replacement.giftId === setting.giftId) { // Check for an infinite loop
                                console.warn("Potential infinite loop detected, bonus attempted to replace something with the same id as it: " + setting.giftName);
                                continue;
                            }

                            // Grab the replacement map for the given gift, if it exists
                            let stored = (system.replacementLists.has(replacement.giftId) ? system.replacementLists.get(replacement.giftId) : new Map());
                            // Set which of the gift's special bonuses this one replaces 
                            stored.set(replacement.settingIndex, setting);
                            // Set the map to the replacement list
                            system.replacementLists.set(replacement.giftId, stored);
                        }
                        // Skip adding a replacing gift to the normal setting list
                        continue;
                    }

                    // Add the setting into the list
                    system.processingLists[setting.settingMode].push(setting);
                }
            }
        }
    }

    /**
     * Prepare Weapon item data
     */
    _prepareWeaponData(actor) {
        const system = actor.system;

        const readiedWeapons = this.items.filter(element => element.type === 'weapon' && element.system.readied && element.system.threatens);
        let threatRangeBand; let threatDistance = -1; let threatens = false;
        for (let item of readiedWeapons) {
            if (item.system.threatDistance > threatDistance) {
                threatDistance = item.system.threatDistance;
                threatRangeBand = item.system.threatRangeBand;
                threatens = true;
            }
        }

        if (threatens) {
            system.actorThreatens = true;
            system.threatDistance = threatDistance;
            system.threatRangeBand = threatRangeBand;
        } else {
            system.actorThreatens = false;
        }
    }

    /* -------------------------------------------- */
    /* Process Derived                              */
    /* -------------------------------------------- */

    /** @override
     * Augment the basic actor data with additional dynamic data.
     */
    prepareDerivedData() {
        const actor = this;

        // Separate function bunches for each actor type
        if (actor.type === 'character') this._prepareCharacterData(actor);
        if (actor.type === 'mook') this._prepareMookData(actor);
        if (actor.type === 'beast') this._prepareBeastData(actor);
        if (actor.type === 'vehicle') this._prepareVehicleData(actor);
    }

    /**
     * Prepare Character type specific data
     */
    _prepareCharacterData(actor) {
        this._processTraits(actor);
        this._processSkills(actor);

        this._processCoinageData(actor);
        this._processItemData(actor);

        this._processBattleData(actor);
    }

    /**
     * Prepare Mook type specific data
     */
    _prepareMookData(actor) {
        this._processTraits(actor);
        this._processSkills(actor);

        this._processCoinageData(actor);
        this._processItemData(actor);

        this._processBattleData(actor);
    }

    /**
     * Prepare Beast type specific data
     */
    _prepareBeastData(actor) {
        this._processTraits(actor);
        this._processSkillsMinor(actor);

        this._processItemData(actor);

        this._processBattleData(actor);
    }

    /**
     * Prepare Vehicle type specific data
     */
    _prepareVehicleData(actor) {
        this._processVehicleStats(actor);
        this._processCoinageData(actor);
        this._processItemDataVehicle(actor);
    }



    /**
     * Process baseTraits template data
     */
    _processTraits(actor) {
        const system = actor.system;

        for (let [key, trait] of Object.entries(system.traits)) {
            trait.diceArray = findTotalDice(trait.dice);

            // Make the name used for a trait more human-readable
            trait.usedTitle = convertCamelCase(key);
        }

        system.traits.species.skills = [makeCompareReady(system.traits.species.speciesSkill1), makeCompareReady(system.traits.species.speciesSkill2), makeCompareReady(system.traits.species.speciesSkill3)];
        system.traits.career.skills = [makeCompareReady(system.traits.career.careerSkill1), makeCompareReady(system.traits.career.careerSkill2), makeCompareReady(system.traits.career.careerSkill3)];

        if (!system.skills) {
            system.traits.species.skillNames = [system.traits.species.speciesSkill1, system.traits.species.speciesSkill2, system.traits.species.speciesSkill3];
            system.traits.career.skillNames = [system.traits.career.careerSkill1, system.traits.career.careerSkill2, system.traits.career.careerSkill3];
        }
    }

    /**
     * Process baseTraits template data
     */
    _processVehicleStats(actor) {
        const system = actor.system;

        system.traits = {};

        system.traits.maneuver = {
            dice: system.vehicleTraits.maneuver.dice
        }
        system.traits.soak = {
            dice: system.vehicleTraits.soak.dice
        }

        for (let [key, trait] of Object.entries(system.traits)) {
            trait.diceArray = findTotalDice(trait.dice);

            // Make the name used for a trait more human-readable
            trait.usedTitle = convertCamelCase(key);
        }
    }

    /**
     * Process baseSkills template data
     */
    _processSkills(actor) {
        const system = actor.system;

        let extracareers = [];
        if (system.hasExtraCareers) {
            system.extraCareerIds.forEach(x => extracareers.push(this.items.get(x)));
        }

        for (let [key, skill] of Object.entries(system.skills)) {
            skill.diceArray = [0, 0, 0, 0, 0];
            skill.diceString = "";
            skill.totalDiceString = "";
            const comparekey = makeCompareReady(key);

            // Include the marks from Gifts to the calculation
            skill.giftMarks = (system.tempMarks.has(comparekey) ? system.tempMarks.get(comparekey) : 0);
            const marks = skill.marks + skill.giftMarks;
            // Marks
            if (marks > 0) {
                let d12s = Math.floor(marks / 5); // Get the number of d12's for the skill
                let remainder = marks % 5; // Get whatever the mark count is minus full 5's (d12's)
                skill.diceArray[0] += d12s; // Add the d12's
                if (remainder > 0) {
                    skill.diceArray[5 - remainder] += 1; // Based on what the marks are minus full 5's, add a smaller die
                }
                skill.diceString = reformDiceString(skill.diceArray, true); // For showing in the sheet how many dice the marks give
            }

            // Species and Career dice
            for (let foo of system.traits.species.skills) {
                if (foo === comparekey)
                    skill.diceArray = addArrays(skill.diceArray, system.traits.species.diceArray);
            }
            for (let foo of system.traits.career.skills) {
                if (foo === comparekey)
                    skill.diceArray = addArrays(skill.diceArray, system.traits.career.diceArray);
            }
            if (system.hasExtraCareers) {
                extracareers.forEach(element => {
                    for (let foo of element.system.skills) {
                        if (foo === comparekey)
                            skill.diceArray = addArrays(skill.diceArray, element.system.diceArray);
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
     * Process skills data for actor types that lack baseSkills data
     */
    _processSkillsMinor(actor) {
        const system = actor.system;

        // Check whether the species and career traits either have no dice in them or have their first skill field be empty
        if ((!checkDiceArrayEmpty(system.traits.species.diceArray) || !system.traits.species.speciesSkill1) && (!checkDiceArrayEmpty(system.traits.career.diceArray) || !system.traits.career.careerSkill1)) {
            return; // If the check passes, abort processing
        }
        if (system.skills) {
            // If an actor with preset skills somehow ends up in this function, return out immediately.
            return console.warn("An actor that has skills by default ended up in the function for actors without skills: " + actor.name);
        }

        // Add the missing skill field
        system.skills = {};

        let extracareers = [];
        if (system.hasExtraCareers) {
            system.extraCareerIds.forEach(x => extracareers.push(this.items.get(x)));
        }

        // Process trait skills
        if (system.traits.species?.skillNames && checkDiceArrayEmpty(system.traits.species.diceArray)) { // Make sure there's actually something in the trait
            for (let skill of system.traits.species.skillNames) { // Go through the skills
                if (!skill) // If the skill is empty, skip it
                    continue;
                const foo = makeCompareReady(skill); // Prepare the skill name
                system.skills[foo] = system.skills[foo] ?? {}; // If the data object does not exist, make it
                system.skills[foo].diceArray = addArrays(system.skills[foo].diceArray, system.traits.species.diceArray); // Add the trait dice array to the one present
                system.skills[foo].totalDiceString = system.skills[foo].diceString = reformDiceString(system.skills[foo].diceArray, true); // Record the reformed dice string for UI presentation
                system.skills[foo].usedTitle = skill; // Record the name used
                if (burdenedLimitedStat(foo)) { // If the name is limited, add the special icon
                    system.skills[foo].usedTitle = String.fromCodePoint([9949]) + " " + system.skills[foo].usedTitle + " " + String.fromCodePoint([9949]);
                }
            }
        }
        if (system.traits.career?.skillNames && checkDiceArrayEmpty(system.traits.career.diceArray)) {
            for (let skill of system.traits.career.skillNames) {
                if (!skill)
                    continue;
                const foo = makeCompareReady(skill);
                system.skills[foo] = system.skills[foo] ?? {};
                system.skills[foo].diceArray = addArrays(system.skills[foo].diceArray, system.traits.career.diceArray);
                system.skills[foo].totalDiceString = system.skills[foo].diceString = reformDiceString(system.skills[foo].diceArray, true);
                system.skills[foo].usedTitle = skill;
                if (burdenedLimitedStat(foo)) {
                    system.skills[foo].usedTitle = String.fromCodePoint([9949]) + " " + system.skills[foo].usedTitle + " " + String.fromCodePoint([9949]);
                }
            }
        }

        // Process extra careers
        if (system.hasExtraCareers) {
            for (let extra of extracareers) {
                if (!checkDiceArrayEmpty(extra.system.diceArray))
                    continue;
                for (let skill of extra.system.skillNames) {
                    if (!skill)
                        continue;
                    const foo = makeCompareReady(skill);
                    system.skills[foo] = system.skills[foo] ?? {};
                    system.skills[foo].diceArray = addArrays(system.skills[foo].diceArray, extra.system.diceArray);
                    system.skills[foo].totalDiceString = system.skills[foo].diceString = reformDiceString(system.skills[foo].diceArray, true);
                    system.skills[foo].usedTitle = skill;
                    if (burdenedLimitedStat(foo)) {
                        system.skills[foo].usedTitle = String.fromCodePoint([9949]) + " " + system.skills[foo].usedTitle + " " + String.fromCodePoint([9949]);
                    }
                }
            }
        }
    }



    /**
     * Process derived data for battle calculations
     */
    _processBattleData(actor) {
        const system = actor.system;

        // Base levels
        let stridebonus = 0;
        let dashbonus = 0;
        let runbonus = 0;
        const sprintarray = this.sprintRoll(-1);

        let speedint = getDiceArrayMaxValue(system.traits.speed.diceArray);
        let bodyint = getDiceArrayMaxValue(system.traits.body.diceArray);
        let sprintint = getDiceArrayMaxValue(sprintarray);

        if (speedint < 0 || bodyint < 0) {
            console.error("Battle data processing failed, unable to parse dice for " + actor.name);
            ui.notifications.error(game.i18n.format("ironclaw2e.ui.battleProcessingFailure", { "name": actor.name }));
            system.stride = 0;
            system.dash = 0;
            system.run = 0;
            return;
        }

        // Apply burdenend limit
        if (speedint > 8 && hasConditionsIronclaw("burdened", this)) speedint = 8;

        // Apply normal move bonuses
        let badFooting = false; // Ignore bad footing check
        if (system.processingLists?.moveBonus) { // Check if move bonuses even exist
            for (let setting of system.processingLists.moveBonus) { // Loop through them
                if (checkApplicability(setting, null, this)) { // Check initial applicability
                    let used = setting; // Store the setting in a temp variable
                    let replacement = this._checkForReplacement(used); // Store the potential replacement if any in a temp variable
                    while (replacement && checkApplicability(replacement, null, this)) { // As long as the currently used one could be replaced by something applicable
                        used = replacement; // Store the replacement as the one to be used
                        replacement = this._checkForReplacement(used); // Check for a new replacement
                    }
                    if (used) { // Sanity check that the used still exists
                        // Apply the used setting
                        stridebonus += used.bonusStrideNumber;
                        dashbonus += used.bonusDashNumber;
                        runbonus += used.bonusRunNumber;

                        if (used.ignoreBadFooting)
                            badFooting = true;
                    } else { // If used somehow turns out unsuable, send an error
                        console.error("Somehow, the used setting came up unusable: " + used);
                    }
                }
            }
        }
        system.ignoreBadFooting = badFooting;

        // Flying-related bonuses
        if (hasConditionsIronclaw("flying", this)) {
            system.isFlying = true;

            // Apply the flying move bonuses
            if (system.processingLists?.flyingBonus) {
                for (let setting of system.processingLists.flyingBonus) { // Loop through them
                    if (checkApplicability(setting, null, this)) { // Check initial applicability
                        let used = setting; // Store the setting in a temp variable
                        let replacement = this._checkForReplacement(used); // Store the potential replacement if any in a temp variable
                        while (replacement && checkApplicability(replacement, null, this)) { // As long as the currently used one could be replaced by something applicable
                            used = replacement; // Store the replacement as the one to be used
                            replacement = this._checkForReplacement(used); // Check for a new replacement
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
            system.isFlying = false;
        }

        // Stride setup
        system.stride = 1 + stridebonus;
        if (hasConditionsIronclaw(["slowed", "immobilized", "half-buried", "cannotmove"], this)) {
            system.stride = 0;
        }
        // Dash setup
        system.dash = Math.round(speedint / 2) + (bodyint > speedint ? 1 : 0) + dashbonus;
        if (hasConditionsIronclaw(["burdened", "blinded", "slowed", "immobilized", "half-buried", "cannotmove"], this)) {
            system.dash = 0;
        }

        // Run setup
        system.run = bodyint + (system.isFlying ? sprintint : speedint) + system.dash + runbonus;
        if (hasConditionsIronclaw(["over-burdened", "immobilized", "half-buried", "cannotmove"], this)) {
            system.run = 0;
        }


        // Sprint visual for the sheet
        system.sprintString = reformDiceString(sprintarray, true);
        // Initiative visual for the sheet
        system.initiativeString = reformDiceString(this.initiativeRoll(-1), true);
    }

    /**
     * Process derived data for money related stuff
     */
    _processCoinageData(actor) {
        const system = actor.system;

        let allvalue = 0;
        let allweight = 0;
        const currencySettings = game.settings.get("ironclaw2e", "currencySettings");
        let currencyValueChanges = {};

        // Get currency value changes
        if (system.processingLists?.currencyValueChange) { // Check if currency value changes even exist
            for (let setting of system.processingLists.currencyValueChange) { // Loop through them
                if (checkApplicability(setting, null, this)) { // Check initial applicability
                    let used = setting; // Store the setting in a temp variable
                    let replacement = this._checkForReplacement(used); // Store the potential replacement if any in a temp variable
                    while (replacement && checkApplicability(replacement, null, this)) { // As long as the currently used one could be replaced by something applicable
                        used = replacement; // Store the replacement as the one to be used
                        replacement = this._checkForReplacement(used); // Check for a new replacement
                    }
                    if (used && CommonSystemInfo.currencyNames.includes(used.currencyName) && typeof used.currencyValue === "string") { // Sanity check that the used still exists and the currency name is valid
                        // Store the used setting for the coin processing
                        currencyValueChanges[used.currencyName] = used.currencyValue;
                    } else { // If used somehow turns out unsuable, send an error
                        console.error("Somehow, the used setting came up unusable: " + used);
                    }
                }
            }
        }

        for (let [key, setting] of Object.entries(currencySettings)) {
            if (!system.coinage.hasOwnProperty(key)) {
                // Check to make sure every currency that is kept track of actually exists in the settings
                continue;
            }
            if (setting?.used === false) {
                // If the currency is not set as used, skip it
                continue;
            }

            let currency = system.coinage[key];
            const valueString = (currencyValueChanges.hasOwnProperty(key) ? currencyValueChanges[key] : setting.value);
            currency.used = true;
            currency.name = setting.name;
            currency.plural = setting.plural;
            currency.shownValue = valueString;
            const usedValue = (valueString?.includes("/")
                ? parseInt(valueString.slice(0, valueString.indexOf("/"))) / parseInt(valueString.slice(valueString.indexOf("/") + 1))
                : parseInt(valueString));
            currency.totalValue = currency.amount * usedValue;
            currency.totalWeight = (setting.weight * currency.amount) / 6350; // Translate the weight from grams to Ironclaw's stones
            currency.parsedSign = Number.isInteger(setting.sign) ? String.fromCodePoint([setting.sign]) : "";

            allvalue += currency.totalValue;
            allweight += currency.totalWeight;
        }
        system.coinageValue = Math.floor(allvalue).toString() + String.fromCodePoint([system.coinage.baseCurrency.sign]);
        system.coinageWeight = allweight;
    }

    /**
     * Process derived data from items 
     */
    _processItemData(actor) {
        const system = actor.system;
        const gear = this.items;

        let totalweight = 0;
        let totalarmors = 0;
        let giftbonus = 0;
        for (let item of gear) {

            if (item.system.totalWeight && !isNaN(item.system.totalWeight)) {
                totalweight += item.system.totalWeight; // Check that the value exists and is not a NaN, then add it to totaled weight
            }

            if (item.type === 'armor' && item.system.worn === true) {
                totalarmors++;
            }
        }

        // Apply encumbrance bonuses
        if (system.processingLists?.encumbranceBonus) { // Check if move bonuses even exist
            for (let setting of system.processingLists.encumbranceBonus) { // Loop through them
                if (checkApplicability(setting, null, this)) { // Check initial applicability
                    let used = setting; // Store the setting in a temp variable
                    let replacement = this._checkForReplacement(used); // Store the potential replacement if any in a temp variable
                    while (replacement && checkApplicability(replacement, null, this)) { // As long as the currently used one could be replaced by something applicable
                        used = replacement; // Store the replacement as the one to be used
                        replacement = this._checkForReplacement(used); // Check for a new replacement
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

        const bodyarr = parseSingleDiceString(system.traits.body.dice);
        if (!Array.isArray(bodyarr)) {
            console.error("Unable to parse body die for " + actor.name);
            return;
        }

        system.encumbranceNone = Math.round(((bodyarr[1] / 2) - 1) * bodyarr[0] + giftbonus);
        system.encumbranceBurdened = Math.round((bodyarr[1] - 1) * bodyarr[0] + giftbonus * 2);
        system.encumbranceOverBurdened = Math.round(((bodyarr[1] / 2) * 3 - 1) * bodyarr[0] + giftbonus * 3);

        const coinshaveweight = game.settings.get("ironclaw2e", "coinsHaveWeight");
        if (coinshaveweight === true && system.coinageWeight) {
            totalweight += system.coinageWeight;
        }
        system.totalWeight = totalweight;
        system.totalWeightTons = totalweight / 160;
        system.totalArmors = totalarmors;
    }

    /**
     * Process derived data from items for vehicles
     */
    _processItemDataVehicle(actor) {
        const system = actor.system;
        const gear = this.items;

        let totalweight = 0;
        let totalappointments = 0;
        let totalcrewneeded = 0;
        let stationsWithAppointmentCosts = false;
        for (let item of gear) {
            if (item.system.totalWeight && !isNaN(item.system.totalWeight)) {
                totalweight += item.system.totalWeight; // Check that the value exists and is not a NaN, then add it to totaled weight
            }
            if (item.system.minCrew && !isNaN(item.system.minCrew)) {
                totalcrewneeded += item.system.minCrew; // Check that the value exists and is not a NaN, then add it to needed crew
            }
            if (item.system.hasCosts !== false && item.system.costs?.appointmentCost && !isNaN(item.system.costs.appointmentCost)) {
                totalappointments += item.system.costs.appointmentCost; // Check that the value exists and is not a NaN, then add it to used appointments
                if (item.type === 'vehicleStation' && item.system.costs.appointmentCost > 0) stationsWithAppointmentCosts = true;
            }
        }

        system.maxWeightTons = parseFractionalNumber(system.vehicleTraits.maxCargo, game.i18n.format("ironclaw2e.ui.maxCargoParseError", { "actor": actor.name, "weight": system.vehicleTraits.maxCargo }));

        const coinshaveweight = game.settings.get("ironclaw2e", "coinsHaveWeight");
        if (coinshaveweight === true && system.coinageWeight) {
            totalweight += system.coinageWeight;
        }
        system.totalWeight = totalweight;
        system.totalWeightTons = totalweight / 160;
        system.maxCrewUsed = totalcrewneeded;
        system.totalAppointments = totalappointments;
        system.stationsWithAppointmentCosts = stationsWithAppointmentCosts;
    }


    /* -------------------------------------------- */
    /* Process Finals                               */
    /* -------------------------------------------- */

    /**
     * Derive battle statistical roll dice pools for sheet visuals, mostly for title-texts
     * @param {Ironclaw2EActor} actor
     */
    _battleDataRollVisuals(actor) {
        const system = actor.system;
        const burdened = hasConditionsIronclaw("burdened", this);
        const visualData = {};

        // The preset buttons
        // Soak
        const soakArmor = this._getArmorConstruction();
        const soakBonuses = this._getGiftSpecialConstruction("soakBonus", [...CommonSystemInfo.soakBaseStats], soakArmor.otherkeys, soakArmor.otherdice, soakArmor.othernames, soakArmor.otherbools, soakArmor.otherinputs);
        visualData.soak = reformDiceString(this._getAllDicePools(soakBonuses.prechecked, burdened, soakBonuses.otherkeys, soakBonuses.otherdice, soakBonuses.othernames, soakBonuses.otherbools).totalDice, true);
        visualData.soakPool = soakBonuses.prechecked.join(", ") + (soakBonuses.othernames.size > 0 ? " + " + Array.from(soakBonuses.othernames.values()).join(", ") : "");
        // Dodge
        const dodgeShield = this._getShieldConstruction();
        const dodgeGuard = this._getStatusBonusConstruction("guard", false, dodgeShield.otherkeys, dodgeShield.otherdice, dodgeShield.othernames, dodgeShield.otherbools, dodgeShield.otherinputs);
        const dodgeBonuses = this._getGiftSpecialConstruction("defenseBonus", [...CommonSystemInfo.dodgingBaseStats],
            dodgeGuard.otherkeys, dodgeGuard.otherdice, dodgeGuard.othernames, dodgeGuard.otherbools, dodgeGuard.otherinputs, null, null, true, "dodge");
        visualData.dodge = reformDiceString(this._getAllDicePools(dodgeBonuses.prechecked, burdened, dodgeBonuses.otherkeys, dodgeBonuses.otherdice, dodgeBonuses.othernames, dodgeBonuses.otherbools).totalDice, true);
        visualData.dodgePool = dodgeBonuses.prechecked.join(", ") + (dodgeBonuses.othernames.size > 0 ? " + " + Array.from(dodgeBonuses.othernames.values()).join(", ") : "");
        // Rally
        visualData.rally = reformDiceString(this._getAllDicePools([...CommonSystemInfo.rallyBaseStats], burdened).totalDice, true);
        visualData.rallyPool = [...CommonSystemInfo.rallyBaseStats].join(", ");

        system.visualData = visualData;
    }

    /**
     * Set the passive senses to tokens and auto-encumbrance to actors if needed
     * @param {Ironclaw2EActor} actor
     * @param {number} sleeptime Milliseconds the function waits before execution, to help against race conditions
     */
    async _actorUpdateAsyncCalls(actor, sleeptime = 100) {
        // To combat race conditions
        if (sleeptime > 0) await game.ironclaw2e.sleep(sleeptime);

        // The passive detection senses
        await this._tokenPassiveSenseDeploy(actor, 50);
        // Automatic Encumbrance Management
        await this._encumbranceAutoManagement(actor, 50);
    }

    /**
     * Set the passive senses to tokens if needed
     * @param {Ironclaw2EActor} actor
     * @param {number} sleeptime Milliseconds the function waits before execution, to help against race conditions
     */
    async _tokenPassiveSenseDeploy(actor, sleeptime = 100) {
        // To combat race conditions
        if (sleeptime > 0) await game.ironclaw2e.sleep(sleeptime);

        const system = actor.system;

        const senseGifts = this.items.filter(element => element.type === 'gift' && element.system.extraSense && CommonSystemInfo.extraSenses[element.system.extraSenseName]?.detectionPassives?.length > 0);
        if (senseGifts.length > 0) {
            let updateData = new Map();
            for (let sense of senseGifts) {
                const passives = CommonSystemInfo.extraSenses[sense.system.extraSenseName].detectionPassives;
                for (let mode of passives) {
                    updateData.set(mode.id, { "remove": false, "range": mode.range ?? 0, "priority": false });
                }
            }

            await this._updateTokenVision(null, updateData, false);
        }
    }

    /** 
     *  Automatic encumbrance management, performed if the setting is enabled
     * @param {Ironclaw2EActor} actor
     * @param {number} sleeptime Milliseconds the function waits before execution, to help against race conditions
     */
    async _encumbranceAutoManagement(actor, sleeptime = 100) {
        // To combat race conditions
        if (sleeptime > 0) await game.ironclaw2e.sleep(sleeptime);

        const manageburdened = game.settings.get("ironclaw2e", "manageEncumbranceAuto");
        const system = actor.system;

        if (manageburdened) {
            if (system.totalWeight > system.encumbranceOverBurdened || system.totalArmors > 3) {
                await this.addEffect(["burdened", "over-burdened", "cannotmove"]);
            }
            else if (system.totalWeight > system.encumbranceBurdened || system.totalArmors === 3) {
                await this.deleteEffect(["cannotmove"], false);
                await this.addEffect(["burdened", "over-burdened"]);
            }
            else if (system.totalWeight > system.encumbranceNone || system.totalArmors === 2) {
                await this.deleteEffect(["over-burdened", "cannotmove"], false);
                await this.addEffect(["burdened"]);
            }
            else {
                await this.deleteEffect(["burdened", "over-burdened", "cannotmove"], false);
            }
        }
    }

    /* -------------------------------------------- */
    /* Private & Protected Internal Functions       */
    /* -------------------------------------------- */

    /**
     * Update tokens associated with this actor with lighting data
     * @param {any} lightdata Data to use for update
     * @private
     */
    async _updateTokenLighting(lightdata) {
        // Update prototype token, if applicable
        if (!this.isToken) {
            await this.update({
                "prototypeToken.light": lightdata
            });
        }

        let foundtoken = findActorToken(this);
        if (foundtoken) {
            await foundtoken.update({ "light": lightdata });
        }
    }

    /**
     * Update tokens associated with this actor with vision data
     * @param {any} visiondata Data to use for update
     * @param {Map<string,object>} detectionmap Data to use for update
     * @param {boolean} record Whether to grab the existing values and record them as defaults
     * @private
     */
    async _updateTokenVision(visiondata, detectionmap, record) {
        let foundtoken = findActorToken(this);
        let updateData = visiondata ? { "sight": visiondata } : {};
        let anythingChanged = ("sight" in updateData); // Variable to make sure there's no constant needless updating

        if (detectionmap?.size > 0) {
            /** Copy the array's values to a new one
             * @type {Array<>} */
            const existingModes = [...(this.isToken ? foundtoken.toObject().detectionModes : this.prototypeToken.toObject().detectionModes)];

            // Priority value to add primary detection modes first, in the order they are in system info
            // Helps to make sure that the detection modes are checked in the correct order
            let priorityIndex = 0;
            for (let [key, value] of detectionmap.entries()) {
                const foo = existingModes.findIndex(x => x.id === key);
                if (value.remove) {
                    if (foo > -1) { // If the mode is tagged for removal and is found, just splice it out
                        existingModes.splice(foo, 1);
                        anythingChanged = true;
                    }
                } else {
                    if (foo > -1) { // If the mode is tagged for addition and is found, update the range and force-enable it
                        if (existingModes[foo].range !== value.range || existingModes[foo].enabled === false)
                            anythingChanged = true; // Only tag it as changed if the values actually differ
                        existingModes[foo].range = value.range;
                        existingModes[foo].enabled = true;
                    } else { // If the mode is tagged for addition and is not found, add it to the array
                        if (value.priority === true) {
                            existingModes.splice(priorityIndex, 0, { "id": key, "range": value.range, "enabled": true });
                            priorityIndex++;
                        }
                        else {
                            existingModes.push({ "id": key, "range": value.range, "enabled": true });
                        }
                        anythingChanged = true;
                    }
                }
            }

            updateData.detectionModes = existingModes;
        }

        if (anythingChanged) {
            // Update prototype token, if applicable
            if (!this.isToken) {
                if (record) {
                    await this.setFlag("ironclaw2e", "defaultVisionSettings", { "range": this.prototypeToken.sight.range, "visionMode": this.prototypeToken.sight.visionMode });
                }
                await this.update({
                    "prototypeToken": updateData
                });
            } else if (record && foundtoken) { // Update a token's default vision from the found token
                await this.setFlag("ironclaw2e", "defaultVisionSettings", { "range": foundtoken.sight.range, "visionMode": foundtoken.sight.visionMode });
            }

            if (foundtoken) {
                await foundtoken.update(updateData);
            }

            canvas.perception.update({ refreshVision: true }, true);
        }
    }

    /**
     * Get the total dice pools of the actor for the given traits and skills
     * @param {string[]} traitnames The array of trait names
     * @param {string[]} skillnames The array of skill names, just give the same array as traitnames to use with mixed name arrays
     * @param {boolean} isburdened Whether to apply the burdened limit to relevant skills
     * @param {boolean} addplus Whether to add the plus already on the first pool label
     * @protected
     */
    _getDicePools(traitnames, skillnames, isburdened, addplus = false) {
        const system = this.system;
        let label = "";
        let labelgiven = addplus;
        let totaldice = [];

        if (system.traits && Array.isArray(traitnames) && traitnames.length > 0) { // If the actor has traits and the list of traits to use is given
            for (let [key, trait] of Object.entries(system.traits)) { // Loop through the traits
                if (traitnames.includes(makeCompareReady(key)) || (trait.name && traitnames.includes(makeCompareReady(trait.name)))) { // If the traitnames include either the key or the name of the trait (career / species name)
                    totaldice.push((isburdened && burdenedLimitedStat(key) ? enforceLimit(trait.diceArray, CommonSystemInfo.burdenedLimit) : trait.diceArray)); // Add the trait to the total dice pool, limited by burdened if applicable
                    if (labelgiven) // Check if the label has been given to add something in between names
                        label += " + ";
                    label += (system.hasExtraCareers && key === "career" ? trait.name : convertCamelCase(key)); // Add the name to the label, either a de-camelcased trait name or the career name if extra careers are a thing
                    labelgiven = true; // Mark the label as given
                }
            }
            if (system.hasExtraCareers) { // Check if extra careers are a thing
                let extracareers = [];
                system.extraCareerIds.forEach(x => extracareers.push(this.items.get(x))); // Grab each extra career from the ids
                for (let [index, extra] of extracareers.entries()) { // Loop through the careers
                    let key = makeCompareReady(extra.system.careerName); // Make a comparable key out of the career name
                    if (traitnames.includes(key)) {
                        // Even if extra careers can't be part of the standard burdened lists, check it just in case of a custom burdened list, though usually the extra career die is just added to the total dice pool
                        totaldice.push((isburdened && burdenedLimitedStat(key) ? enforceLimit(extra.system.diceArray, CommonSystemInfo.burdenedLimit) : extra.system.diceArray));
                        if (labelgiven)
                            label += " + ";
                        label += extra.system.careerName; // Add the career name as a label
                        labelgiven = true;
                    }
                }
            }
        }
        if (system.skills && Array.isArray(skillnames) && skillnames.length > 0) { // If the actor has skills and the lists of skills to use is given
            for (let [key, skill] of Object.entries(system.skills)) { // Loop through the skills
                if (skillnames.includes(makeCompareReady(key))) {
                    totaldice.push((isburdened && burdenedLimitedStat(key) ? enforceLimit(skill.diceArray, CommonSystemInfo.burdenedLimit) : skill.diceArray)); // Add the skill to the total dice pool, limited by burdened if applicable
                    if (labelgiven)
                        label += " + ";
                    label += convertCamelCase(key); // Add the skill name as a label after being de-camelcased
                    labelgiven = true;
                }
            }
        }

        return { "totalDice": totaldice, "label": label, "labelGiven": labelgiven };
    }

    /**
     * Get the dice pools from the other dice fields and extra dice
     * @param {string} extradice Extra dice to add
     * @param {Map<string,object>} otherkeys A map of dice pool field id's and the item information
     * @param {Map<string,number[]>} otherdice A map of dice arrays, the id's should match exactly with their counterparts at otherkeys
     * @param {Map<string,string>} [othernames] An array of names for the fields, to be used for UI information, the id's should match exactly with their counterparts at otherkeys
     * @param {Map<string,boolean>} otherbools A map of booleans that determine which modifiers should actually be used for quick rolls by default, the id's should match exactly with their counterparts at otherkeys
     * @protected
     */
    _getOtherDicePools(otherkeys = new Map(), otherdice = new Map(), othernames = new Map(), otherbools = new Map(), extradice = "", addplus = false) {
        let label = "";
        let labelgiven = addplus;
        let totaldice = [];
        const extraOrdered = game.settings.get("ironclaw2e", "oneLineDicesOrdered");
        /** @type Array<Ironclaw2EItem> */
        let giftsToExhaust = [];

        // Get the bonus dice pools
        if (otherkeys?.size > 0) {
            for (let [key, info] of otherkeys.entries()) {
                // Make sure otherbools has a positive match with the key
                if (otherbools.get(key) === true) {
                    totaldice.push(otherdice.get(key));
                    if (othernames.has(key)) { // Only try to add a label if the array has a key to use as a label
                        if (labelgiven)
                            label += " + ";
                        label += othernames.get(key);
                    }
                    labelgiven = true;
                }
                // Check whether the item is a gift that should be exhausted
                if (info.itemId && info.exhaustOnUse) {
                    const item = this.items.get(info.itemId);
                    if (item?.type === 'gift') {
                        giftsToExhaust.push(item);
                    }
                }
            }
        }

        // Get the extra dice
        if (extradice?.length > 0) {
            const extra = extraOrdered ? findTotalDiceArrays(extradice) : findTotalDice(extradice);
            if (checkDiceArrayEmpty(extraOrdered ? flattenDicePoolArray(extra) : extra)) {
                if (labelgiven)
                    label += " + ";
                label += game.i18n.localize("ironclaw2e.chat.extraDice");
                totaldice.push(extra);
            }
        }

        return { "totalDice": totaldice, "label": label, "labelGiven": labelgiven, "giftsToExhaust": giftsToExhaust };
    }

    /**
     * Get the total added dice pool from the checked traits, skills, extra dice and bonus dice
     * @param {string[]} prechecked Traits and skills to add the dice from
     * @param {boolean} isburdened Whether to apply the burdened limit to relevant skills
     * @param {string} extradice Extra dice to add
     * @param {Map<string,object>} otherkeys A map of dice pool field id's and the item information
     * @param {Map<string,number[]>} otherdice A map of dice arrays, the id's should match exactly with their counterparts at otherkeys
     * @param {Map<string,string>} [othernames] An array of names for the fields, to be used for UI information, the id's should match exactly with their counterparts at otherkeys
     * @param {Map<string,boolean>} otherbools A map of booleans that determine which modifiers should actually be used for quick rolls by default, the id's should match exactly with their counterparts at otherkeys
     * @protected
     */
    _getAllDicePools(prechecked, isburdened, otherkeys = new Map(), otherdice = new Map(), othernames = new Map(), otherbools = new Map(), extradice = "") {
        let label = "";
        let labelgiven = false;
        let totaldice = [];
        let giftsToExhaust = [];

        // Get the trait and skill pools
        const dicePools = this._getDicePools(prechecked, prechecked, isburdened);
        label = dicePools.label;
        labelgiven = dicePools.labelGiven;
        totaldice = dicePools.totalDice;

        // Get the other and extra dice pools
        const otherPools = this._getOtherDicePools(otherkeys, otherdice, othernames, otherbools, extradice, labelgiven);
        label += otherPools.label;
        labelgiven = otherPools.labelGiven;
        totaldice = totaldice.concat(otherPools.totalDice);
        giftsToExhaust = otherPools.giftsToExhaust;

        return { "totalDice": totaldice, "label": label, "labelGiven": labelgiven, "giftsToExhaust": giftsToExhaust };
    }

    /**
     * Check for a replacement gift for the given setting
     * @param {any} setting
     * @returns {any} The replacement setting if it exists
     */
    _checkForReplacement(setting) {
        const system = this.system;
        if (!system.processingLists || !system.replacementLists) {
            console.warn("Attempted to check for replacements despite the fact that no special settings are present for the actor: " + this.name);
            return null;
        }

        if (system.replacementLists.has(setting.giftId)) { // Check for and get the list of replacements for a given gift
            const foo = system.replacementLists.get(setting.giftId);
            if (foo.has(setting.settingIndex)) { // Check for and get the actual replacement based on the index of the setting
                const bar = foo.get(setting.settingIndex)
                if (setting.settingMode === bar.settingMode) {
                    return bar; // If a to-be-replaced setting with the correct gift id, setting index and setting mode is found, return the corresponding setting
                }
            }
        }

        return null; // Otherwise return null
    }

    /**
     * Get the limit for a dice pool from the input
     * @param {string} limitinput
     */
    _getDicePoolLimit(limitinput, isburdened) {
        if (typeof limitinput !== "string") {
            console.error("Dice pool limit get given a non-string: " + limitinput);
            return 0;
        }

        // If there's something in the limit
        if (limitinput?.length > 0) {
            const limitskill = makeCompareReady(limitinput);
            const limitdicepool = flattenDicePoolArray(this._getDicePools([limitskill], [limitskill], isburdened).totalDice, false); // See if the actor can get any dice pools from the limit
            const limitparsed = parseSingleDiceString(limitinput); // Check if the limit field is a die, in which case, parse what value it's meant to limit to
            const limitnumber = parseInt(limitinput); // Just parse the limit as a number
            // If the dice pool has stuff, use it as the limit, else use the parsed dice side, else try and use the parsed limit
            if (Array.isArray(limitdicepool) && checkDiceArrayEmpty(limitdicepool)) return checkDiceIndex(getDiceArrayMaxValue(limitdicepool));
            else if (Array.isArray(limitdicepool) && !checkDiceArrayEmpty(limitdicepool)) return checkDiceIndex(4); // Special case for empty skill arrays limiting things to a d4
            else if (Array.isArray(limitparsed)) return checkDiceIndex(limitparsed[1]);
            else if (!isNaN(limitnumber)) return limitnumber;
        }

        return 0;
    }

    /* -------------------------------------------- */
    /* Roll Construction Functions                  */
    /* -------------------------------------------- */

    /**
     * @typedef {{
     *   prechecked: string[],
     *   otherkeys: Map<string,object>,
     *   otherdice: Map<string,number[]>,
     *   othernames: Map<string,string>,
     *   otherbools: Map<string,boolean>,
     *   otherinputs: string
     * }} SpecialReturn
     */

    /**
     * Apply a certain type of gift special bonus to roll dialog construction
     * @param {any} specialname
     * @param {any} prechecked
     * @param {any} otherinputs
     * @param {any} otherbools
     * @param {any} otherkeys
     * @param {any} otherdice
     * @param {any} item
     * @param {any} otheritem
     * @param {boolean} defensecheck Whether the check is done from a defense 
     * @param {string} defensetype
     * @returns {SpecialReturn} Returns a holder object which returns the inputs with the added bonuses
     * @private
     */
    _getGiftSpecialConstruction(specialname, prechecked = [], otherkeys = new Map(), otherdice = new Map(), othernames = new Map(), otherbools = new Map(), otherinputs = "", item = null, otheritem = null, defensecheck = false, defensetype = "") {
        const system = this.system;
        if (system.processingLists?.[specialname]) { // Check if they even exist
            for (let setting of system.processingLists[specialname]) { // Loop through them
                if (checkApplicability(setting, item, this, { otheritem, defensecheck, defensetype })) { // Check initial applicability
                    let used = setting; // Store the setting in a temp variable
                    let replacement = this._checkForReplacement(used); // Store the potential replacement if any in a temp variable
                    while (replacement && checkApplicability(replacement, item, this, { otheritem, defensecheck, defensetype })) { // As long as the currently used one could be replaced by something applicable
                        used = replacement; // Store the replacement as the one to be used
                        replacement = this._checkForReplacement(used); // Check for a new replacement
                    }
                    if (used) { // Sanity check that the used still exists
                        // Apply the used setting
                        // Apply bonus sources to the roll dialog contruction
                        if (used.bonusSources) {
                            for (let source of used.bonusSources) {
                                let foobar = null;
                                switch (source) {
                                    case ("armor"):
                                        foobar = this._getArmorConstruction(otherkeys, otherdice, othernames, otherbools, otherinputs);
                                        break;
                                    case ("shield"):
                                        foobar = this._getShieldConstruction(otherkeys, otherdice, othernames, otherbools, otherinputs);
                                        break;
                                    case ("guard"):
                                        foobar = this._getStatusBonusConstruction("guard", false, otherkeys, otherdice, othernames, otherbools, otherinputs);
                                        break;
                                    case ("guard-always"):
                                        foobar = this._getStatusBonusConstruction("guard", true, otherkeys, otherdice, othernames, otherbools, otherinputs);
                                        break;
                                    case ("aim"):
                                        foobar = this._getStatusBonusConstruction("aim", false, otherkeys, otherdice, othernames, otherbools, otherinputs);
                                        break;
                                    case ("aim-always"):
                                        foobar = this._getStatusBonusConstruction("aim", true, otherkeys, otherdice, othernames, otherbools, otherinputs);
                                        break;
                                }
                                if (foobar) {
                                    otherinputs = foobar.otherinputs;
                                    otherbools = foobar.otherbools;
                                    otherkeys = foobar.otherkeys;
                                    otherdice = foobar.otherdice;
                                    othernames = foobar.othernames;
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
                            // Check whether the bonus uses the applicability for autocheck, or is always or never checked
                            const autocheck = used.bonusAutoUsed === "applied" ? checkApplicability(setting, item, this, { otheritem, defensecheck, defensetype, "usecheck": true }) : (used.bonusAutoUsed === "always" ? true : false);
                            const foo = formDicePoolField(used.bonusDice, used.giftName, `${used.giftName}: ${reformDiceString(used.bonusDice, true)}`, autocheck, { "itemid": used.giftId, "exhaustonuse": used.bonusExhaustsOnUse },
                                { otherkeys, otherdice, othernames, otherbools, otherinputs });
                            otherinputs = foo.otherinputs;
                            otherbools = foo.otherbools;
                            otherkeys = foo.otherkeys;
                            otherdice = foo.otherdice;
                            othernames = foo.othernames;
                        }
                    } else { // If used somehow turns out unsuable, send an error
                        console.error("Somehow, the used setting came up unusable: " + used);
                    }
                }
            }
        }

        return { "prechecked": prechecked, "otherinputs": otherinputs, "otherbools": otherbools, "otherkeys": otherkeys, "otherdice": otherdice, "othernames": othernames };
    }

    /**
     * Apply armors to roll dialog construction
     * @param {any} otherinputs
     * @param {any} otherkeys
     * @param {any} otherdice
     * @param {any} othernames
     * @param {any} otherbools
     * @param {boolean} autocheck
     * @returns {object} Returns a holder object which returns the inputs with the added bonuses
     * @private
     */
    _getArmorConstruction(otherkeys = new Map(), otherdice = new Map(), othernames = new Map(), otherbools = new Map(), otherinputs = "", autocheck = true) {
        let armors = this.items.filter(element => element.system.worn === true);
        for (let i = 0; i < armors.length && i < 3; ++i) {
            const foo = formDicePoolField(armors[i].system.armorArray, armors[i].name, `${armors[i].name}: ${reformDiceString(armors[i].system.armorArray, true)}`, autocheck, { "itemid": armors[i].id },
                { otherkeys, otherdice, othernames, otherbools, otherinputs });
            otherkeys = foo.otherkeys;
            otherdice = foo.otherdice;
            othernames = foo.othernames;
            otherbools = foo.otherbools;
            otherinputs = foo.otherinputs;
        }
        return { "otherkeys": otherkeys, "otherdice": otherdice, "othernames": othernames, "otherbools": otherbools, "otherinputs": otherinputs };
    }

    /**
     * Apply shield to roll dialog construction
     * @param {any} otherinputs
     * @param {any} otherkeys
     * @param {any} otherdice
     * @param {any} othernames
     * @param {any} otherbools
     * @param {boolean} autocheck
     * @returns {object} Returns a holder object which returns the inputs with the added bonuses
     * @private
     */
    _getShieldConstruction(otherkeys = new Map(), otherdice = new Map(), othernames = new Map(), otherbools = new Map(), otherinputs = "", autocheck = true) {
        let shield = this.items.find(element => element.system.held === true);
        if (shield) {
            const foo = formDicePoolField(shield.system.coverArray, shield.name, `${shield.name}: ${reformDiceString(shield.system.coverArray, true)}`, autocheck, { "itemid": shield.id },
                { otherkeys, otherdice, othernames, otherbools, otherinputs });
            otherkeys = foo.otherkeys;
            otherdice = foo.otherdice;
            othernames = foo.othernames;
            otherbools = foo.otherbools;
            otherinputs = foo.otherinputs;
        }
        return { "otherkeys": otherkeys, "otherdice": otherdice, "othernames": othernames, "otherbools": otherbools, "otherinputs": otherinputs };
    }

    /**
     * Apply guarding or aiming bonus to roll dialog construction
     * @param {any} otherinputs
     * @param {any} otherkeys
     * @param {any} otherdice
     * @param {any} otherbools
     * @param {object} bonustype Whether the bonus is of "aim" or "guard" type
     * @param {boolean} skipcheck Whether to skip the condition check
     * @returns {object} Returns a holder object which returns the inputs with the added bonuses
     * @private
     */
    _getStatusBonusConstruction(bonustype, skipcheck, otherkeys = new Map(), otherdice = new Map(), othernames = new Map(), otherbools = new Map(), otherinputs = "") {
        const system = this.system;
        let replaceSettings = []; // Bonuses that would replace the base bonus
        let addSettings = []; // Bonuses that would add to the base bonus

        let bonusName = "", bonusList = "";
        switch (bonustype) { // Depending on the given type, look for the corresponding bonus type
            case "aim":
                bonusName = "aiming";
                bonusList = "aimBonus";
                break;
            case "guard":
                bonusName = "guarding";
                bonusList = "guardBonus";
                break;
            default:
                console.error("Status bonus construction somehow defaulted on bonus type lookup: " + bonustype);
                return { "otherkeys": otherkeys, "otherdice": otherdice, "othernames": othernames, "otherbools": otherbools, "otherinputs": otherinputs };
                break;
        }

        if (skipcheck || hasConditionsIronclaw(bonusName, this)) { // If the check is skipped or the actor has a "Guarding" condition
            if (system.processingLists?.[bonusList]) { // Check if move bonuses even exist
                for (let setting of system.processingLists[bonusList]) { // Loop through them
                    if (checkApplicability(setting, null, this)) { // Check initial applicability
                        let used = setting; // Store the setting in a temp variable
                        let replacement = this._checkForReplacement(used); // Store the potential replacement if any in a temp variable
                        while (replacement && checkApplicability(replacement, null, this)) { // As long as the currently used one could be replaced by something applicable
                            used = replacement; // Store the replacement as the one to be used
                            replacement = this._checkForReplacement(used); // Check for a new replacement
                        }
                        if (used) { // Sanity check that the used still exists
                            // Store the used setting to a temp array
                            if (used.replacesBaseBonus) {
                                replaceSettings.push(used);
                            } else {
                                addSettings.push(used);
                            }
                        } else { // If used somehow turns out unsuable, send an error
                            console.error("Somehow, the used setting came up unusable: " + used);
                        }
                    }
                }
            }
        } else { // If the actor does not have the proper status condition, just return the variables like they were
            return { "otherkeys": otherkeys, "otherdice": otherdice, "othernames": othernames, "otherbools": otherbools, "otherinputs": otherinputs };
        }

        let bonusArray = [0, 0, 1, 0, 0];
        let bonusLabel = game.i18n.localize("ironclaw2e.dialog.dicePool." + bonusName);
        // Go through the potential status bonus replacements
        if (Array.isArray(replaceSettings)) {
            for (let setting of replaceSettings) {
                if (setting.bonusDice) { // If the setting has bonus dice
                    if (compareDiceArrays(setting.bonusDice, bonusArray) < 0) { // Check if the bonus dice are bigger than the normal bonus
                        bonusArray = setting.bonusDice; // Set the bonus to be the setting bonus
                        bonusLabel = setting.giftName + " " + game.i18n.localize("ironclaw2e.dialog.dicePool." + bonusName); // Name the label after the bonus
                    }
                }
            }
        }
        // Go through the potential status bonus additions
        if (Array.isArray(addSettings)) {
            for (let setting of addSettings) {
                if (setting.bonusDice) { // If the bonus dice exist
                    bonusArray = addArrays(bonusArray, setting.bonusDice); // Add them
                }
            }
        }

        const foo = formDicePoolField(bonusArray, bonusLabel, `${bonusLabel}: ${reformDiceString(bonusArray, true)}`, true, {},
            { otherkeys, otherdice, othernames, otherbools, otherinputs });
        otherkeys = foo.otherkeys;
        otherdice = foo.otherdice;
        othernames = foo.othernames;
        otherbools = foo.otherbools;
        otherinputs = foo.otherinputs;

        return (foo ? foo : { "otherkeys": otherkeys, "otherdice": otherdice, "othernames": othernames, "otherbools": otherbools, "otherinputs": otherinputs });
    }

    /* -------------------------------------------- */
    /*  Actor Change Functions                      */
    /* -------------------------------------------- */

    /**
     * Change which illumination item the actor is using, or turn them all off
     * @param {Ironclaw2EItem} lightsource
     */
    async changeLightSource(lightsource) {
        if (!lightsource) {
            console.error("Attempted to change a light source without providing light source for actor: " + this);
            return;
        }
        let updatedlightdata = {
            "dim": 0, "bright": 0, "angle": 360, "color": "#ffffff", "alpha": 0.25, "animation": {
                "type": "", "speed": 5, "intensity": 5
            }
        };

        let lightsources = this.items.filter(element => element.type === "illumination");

        if (!lightsource.system.lighted) { // Light the light source
            updatedlightdata = {
                "dim": lightsource.system.dimLight, "bright": lightsource.system.brightLight, "angle": lightsource.system.lightAngle,
                "color": lightsource.system.lightColor, "alpha": lightsource.system.lightAlpha, "animation": {
                    "type": lightsource.system.lightAnimationType, "speed": lightsource.system.lightAnimationSpeed, "intensity": lightsource.system.lightAnimationIntensity
                }
            };
            const index = lightsources.findIndex(element => element.id === lightsource.id);
            if (index > -1)
                lightsources.splice(index, 1); // Exclude from dousing
            await lightsource.update({ "_id": lightsource.id, "system.lighted": true });
        }

        let doused = [];
        for (let l of lightsources) { // Douse all other light sources, including the caller if it was previously lighted
            doused.push({ "_id": l.id, "system.lighted": false });
        }

        if (this.getFlag("ironclaw2e", "fireLightSet") !== undefined)
            await this.unsetFlag("ironclaw2e", "fireLightSet");
        await this.updateEmbeddedDocuments("Item", doused);
        return this._updateTokenLighting(updatedlightdata);
    }

    /**
     * Activate the default On Fire light statistics on the actor
     */
    async activateFireSource() {
        let updatedlightdata = { ...CommonSystemInfo.fireConditionLightSource };

        let lightsources = this.items.filter(element => element.type === "illumination");

        let doused = [];
        for (let l of lightsources) { // Douse all the normal light sources
            doused.push({ "_id": l.id, "system.lighted": false });
        }

        await this.setFlag("ironclaw2e", "fireLightSet", true);
        await this.updateEmbeddedDocuments("Item", doused);
        return this._updateTokenLighting(updatedlightdata);
    }

    /**
     * Refresh the token light source based on which illumination item is active, if any
     */
    async refreshLightSource() {
        let updatedlightdata = {
            "dim": 0, "bright": 0, "angle": 360, "color": "#ffffff", "alpha": 0.25, "animation": {
                "type": "", "speed": 5, "intensity": 5
            }
        };

        // If something ever happens that a light might be active while the token's light source does not match
        let lightsources = this.items.filter(element => element.type === "illumination");
        let activesource = lightsources.find(element => element.system.lighted === true);
        if (activesource) {
            updatedlightdata = {
                "dim": lightsource.system.dimLight, "bright": lightsource.system.brightLight, "angle": lightsource.system.lightAngle,
                "color": lightsource.system.lightColor, "alpha": lightsource.system.lightAlpha, "animation": {
                    "type": lightsource.system.lightAnimationType, "speed": lightsource.system.lightAnimationSpeed, "intensity": lightsource.system.lightAnimationIntensity
                }
            };
        }

        if (this.getFlag("ironclaw2e", "fireLightSet") !== undefined)
            await this.unsetFlag("ironclaw2e", "fireLightSet");
        return this._updateTokenLighting(updatedlightdata);
    }

    /**
     * Change which vision item the actor is using, or turn them all off and restore the saved defaults
     * The tostate parameter is the level of vision this sense is being called for, if the visionsource's enable matches tostate, it will be disabled instead
     * @param {Ironclaw2EItem} visionsource
     * @param {number} tostate 0: Force back to default, 1: Detection mode only, 2: Fully on
     */
    async changeVisionMode(visionsource, tostate) {
        if (!visionsource) {
            console.error("Attempted to change the vision mode without providing a vision source for actor: " + this);
            return;
        }
        if (isNaN(tostate)) {
            console.error("Invalid state given for actor vision change: " + tostate);
            return;
        }

        let updatedVisionData = this.getFlag("ironclaw2e", "defaultVisionSettings") ?? CommonSystemInfo.defaultVision;
        let detectionModeUpdates = new Map();

        // Grab the data
        const nextSenseData = CommonSystemInfo.extraSenses[visionsource.system.extraSenseName];
        const previousVisionSource = this.items.find(element => element.type === "gift" && element.system.extraSense && element.system.extraSenseEnabled === 2);
        const previousSenseData = previousVisionSource ? CommonSystemInfo.extraSenses[previousVisionSource.system.extraSenseName] : null;
        const visionSources = this.items.filter(element => element.type === "gift" && element.system.extraSense);
        const recordDefault = visionSources.some(element => element.system.extraSenseEnabled === 2) === false;

        // Set up the modifying variables
        let setNext = -1;
        const nextRange = CommonSystemInfo.rangePaces[visionsource.system.extraSenseRangeBand] ?? 0;
        let resetPrev = false;
        const prevRange = previousVisionSource ? CommonSystemInfo.rangePaces[visionsource.system.extraSenseRangeBand] ?? 0 : 0;

        if (tostate > 0) {
            if (tostate === 2) {
                // Full-on vision
                if (visionsource.system.extraSenseEnabled < 2) { // Enable the vision source if it wasn't previously
                    updatedVisionData = {
                        "range": nextRange,
                        "visionMode": nextSenseData.visionName || "basic"
                    };
                    // Vision mode has "basic" as a backup setting in case a sense ever gets here despite not having an associated vision
                    if (!nextSenseData.visionName) console.warn("Something got into a vision mode setting despite not having one associated: " + visionsource.system.extraSenseName);
                }
                // Disable the previous vision source, including the caller if it was previously enabled
                if (previousVisionSource) resetPrev = true;
            }
            // Detection sets
            // Add the removal updates first if needed
            if (resetPrev && previousSenseData) {
                for (let mode of previousSenseData.detectionModes) {
                    detectionModeUpdates.set(mode.id, { "remove": true, "range": mode.range ?? prevRange, "priority": false });
                }
            }

            // Add the potential additions next, in case they override the removals
            for (let mode of nextSenseData.detectionModes) {
                detectionModeUpdates.set(mode.id, { "remove": visionsource.system.extraSenseEnabled === tostate, "range": mode.range ?? nextRange, "priority": true });
            }
            // Set the activating vision source to the state if it was not previously set there, or to zero if it was and this is a call to reset
            setNext = visionsource.system.extraSenseEnabled === tostate ? 0 : tostate;

            // Set the calling vision source to the state if set as such
            if (setNext >= 0 && visionsource)
                await visionsource.update({ "_id": visionsource.id, "system.extraSenseEnabled": setNext });
            // Disable the previous vision source, including the caller if it was previously enabled
            if (resetPrev && previousVisionSource)
                await previousVisionSource.update({ "_id": previousVisionSource.id, "system.extraSenseEnabled": 0 });
        } else {
            // In the case of zero, remove all the active extra senses
            let doused = [];
            for (let l of visionSources) { // Douse all other light sources, including the caller if it was previously lighted
                doused.push({ "_id": l.id, "system.extraSenseEnabled": 0 });
            }
            await this.updateEmbeddedDocuments("Item", doused);
        }

        // Merge the default vision settings to the update
        if (updatedVisionData.visionMode) {
            const visionDefaults = CONFIG.Canvas.visionModes[updatedVisionData.visionMode]?.vision?.defaults || {};
            updatedVisionData = mergeObject(updatedVisionData, visionDefaults);
        }

        return this._updateTokenVision(updatedVisionData, detectionModeUpdates, recordDefault);
    }

    /**
     * @typedef {{
     *   conditionArray: string[],
     *   wardDamage: number,
     *   wardDestroyed: boolean
     * }} DamageReturn
     */

    /**
     * Apply damage conditions to the actor
     * @param {number} damage
     * @param {boolean} knockout
     * @param {boolean} nonlethal
     * @returns {Promise<DamageReturn>}
     */
    async applyDamage(damage, { attack = true, knockout = false, nonlethal = false, applyWard = true, extraBurning = 0 } = {}) {
        const conditionRemoval = game.settings.get("ironclaw2e", "autoConditionRemoval");
        let wardDamage = -1;
        let wardDestroyed = false;
        if (applyWard && damage > 0) {
            const cond = getSingleConditionIronclaw("temporaryward", this);
            if (cond) {
                let ward = getTargetConditionQuota(cond, this);
                if (ward > 0) {
                    if (ward > damage) {
                        // If there is more ward than damage, reduce the damage from ward, set damage to zero and update the ward with the reduced value
                        ward -= damage;
                        wardDamage = damage;
                        damage = 0;
                        await this.updateEffectQuota(cond, ward);
                    } else {
                        // Else, reduce the damage by the ward and either remove the ward condition or reduce it to zero
                        damage -= ward;
                        wardDamage = ward;
                        ward = 0;
                        if (conditionRemoval)
                            await this.deleteEffect(cond.id, true);
                        else
                            await this.updateEffectQuota(cond, ward);
                        wardDestroyed = true;
                    }
                }
            }
        }

        const actorScale = this.getActorScaleType();

        if (actorScale === "personal") {
            // Only an attack gives Reeling
            let adding = (attack ? ["reeling"] : []);
            // Actual damage and knockout effects
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
            // If the attack is marked as non-lethal, prevent outright immediate death
            if (damage >= 5 && !nonlethal) adding.push("dead");
            if (damage >= 6 && !nonlethal) adding.push("overkilled");
            
            await this.addEffect(adding);
            return { actor: this, "conditionArray": adding, wardDamage, wardDestroyed };
        }
        else if (actorScale === "vehicle") {
            // Vehicles have a very different damage progression
            let adding = [];
            let hideCondition = true;
            let vehicleDamage = "";
            let burnCount = extraBurning;

            if (damage >= 10) {
                adding.push("dead");
                hideCondition = false;
                vehicleDamage = "smithereens";
            } else if (damage <= 0) {
                vehicleDamage = "nothing";

            } else {
                const existingBurn = getTargetConditionQuota("burning", this);
                switch (damage) {
                    case 1:
                        vehicleDamage = "standardFear";
                        break;
                    case 2:
                        vehicleDamage = "standardDamage";
                        break;
                    case 3:
                        burnCount += 3;
                        hideCondition = false;
                        vehicleDamage = "standardFire";
                        break;
                    case 4:
                        vehicleDamage = "superiorFear";
                        break;
                    case 5:
                        vehicleDamage = "superiorDamage";
                        break;
                    case 6:
                        burnCount += 6;
                        hideCondition = false;
                        vehicleDamage = "superiorFire";
                        break;
                    case 7:
                        adding.push("holed");
                        hideCondition = false;
                        vehicleDamage = "holed";
                        break;
                    case 8:
                        vehicleDamage = "incredibleDamage";
                        break;
                    case 9:
                        adding.push("holed");
                        hideCondition = false;
                        vehicleDamage = "holedDamage";
                        break;
                }

                if (burnCount > 0) adding.push("burning");

                await this.addEffect(adding);
                if (!attack && burnCount > 0 && existingBurn > 0) {
                    await this.updateEffectQuota("burning", existingBurn + burnCount);
                } else if (burnCount > 0 && adding.includes("burning") && existingBurn < burnCount) {
                    await this.updateEffectQuota("burning", burnCount);
                }
            }

            return { actor: this, "conditionArray": adding, hideCondition, vehicleDamage };
        }
        return { actor: this, "conditionArray": [] };
    }

    /**
     * Add a given condition to the actor
     * @param {string | [string]} condition 
     */
    async addEffect(condition) {
        return await addConditionsIronclaw(condition, this);
    }

    /**
     * Update the quota of the condition
     * @param {ActiveEffect | string} condition
     * @param {number} value
     */
    async updateEffectQuota(condition, value) {
        const usedcond = (typeof (condition) === "string" ? getSingleConditionIronclaw(condition, this) : condition);
        return await setTargetConditionQuota(usedcond, value);
    }

    /**
     * Remove given conditions from the actor, either by name or id
     * @param {string | [string]} condition
     * @param {boolean} isid
     */
    async deleteEffect(condition, isid = false) {
        condition = Array.isArray(condition) ? condition : [condition];

        if (isid) {
            await this.deleteEmbeddedDocuments("ActiveEffect", condition);
        }
        else {
            await removeConditionsIronclaw(condition, this);
        }
    }

    /**
     * Remove all conditions from the actor
     */
    async resetEffects() {
        const reset = [];
        for (let effect of this.effects) {
            reset.push(effect.id);
        }
        await this.deleteEffect(reset, true);
    }

    /** Start of turn maintenance for the actor
     */
    async startOfTurn() {
        // Condition auto-removal system, performed only if the system is active and the no-turn-maintenance mode is not
        const conditionRemoval = game.settings.get("ironclaw2e", "autoConditionRemoval") && !game.settings.get("ironclaw2e", "autoConditionRemovalNoTurns");
        if (conditionRemoval) {
            await this.deleteEffect("guarding");
        }
    }

    /** End of turn maintenance for the actor
     */
    async endOfTurn() {
        // Condition auto-removal system, performed only if the system is active and the no-turn-maintenance mode is not
        const conditionRemoval = game.settings.get("ironclaw2e", "autoConditionRemoval") && !game.settings.get("ironclaw2e", "autoConditionRemovalNoTurns");
        if (conditionRemoval) {
            await this.deleteEffect("aiming");
        }
    }

    /**
     * Apply a template item to this actor
     * @param {object | Ironclaw2EItem} item
     */
    async applyTemplate(item, { wait = -1, confirm = true } = {}) {
        const actor = this;
        const system = this.system;
        let updateData = {};

        // Optional sleep to help avert race conditions
        if (wait > 0) await game.ironclaw2e.sleep(wait);

        // Simple stat updates
        const usedName = (item.system.forcedName ? item.system.forcedName : item.name);
        if (item.type === "speciesTemplate") {
            if (confirm && system.traits.species.name) {
                // Confirmation on whether to replace the existing data
                const confirmation = await popupConfirmationBox("ironclaw2e.dialog.templateReplacementSpecies.title", "ironclaw2e.dialog.templateReplacementSpecies.note", "ironclaw2e.dialog.replace",
                    { "actorname": actor.name, "itemname": usedName });
                if (confirmation.confirmed === false) return;
            }
            updateData = {
                "system.traits.species.name": usedName,
                "system.traits.species.speciesSkill1": item.system.skill1,
                "system.traits.species.speciesSkill2": item.system.skill2,
                "system.traits.species.speciesSkill3": item.system.skill3,

                "system.attributes.habitat": item.system.attributes.habitat,
                "system.attributes.diet": item.system.attributes.diet,
                "system.attributes.cycle": item.system.attributes.cycle,
                "system.attributes.senses": item.system.attributes.senses,
            };
            // Increased Trait handling
            if (item.system.traitIncreases.increase1) {
                const trait = makeCompareReady(item.system.traitIncreases.increase1);
                if (system.traits[trait]?.dice) {
                    const betterDice = reformDiceString(diceFieldUpgrade(findTotalDice(system.traits[trait].dice), 1));
                    const fieldName = "system.traits." + trait + ".dice";
                    updateData[fieldName] = betterDice;
                }
            }
            if (item.system.traitIncreases.increase2) {
                const trait = makeCompareReady(item.system.traitIncreases.increase2);
                if (system.traits[trait]?.dice) {
                    const betterDice = reformDiceString(diceFieldUpgrade(findTotalDice(system.traits[trait].dice), 1));
                    const fieldName = "system.traits." + trait + ".dice";
                    updateData[fieldName] = betterDice;
                }
            }
            if (item.system.traitIncreases.increase3) {
                const trait = makeCompareReady(item.system.traitIncreases.increase3);
                if (system.traits[trait]?.dice) {
                    const betterDice = reformDiceString(diceFieldUpgrade(findTotalDice(system.traits[trait].dice), 1));
                    const fieldName = "system.traits." + trait + ".dice";
                    updateData[fieldName] = betterDice;
                }
            }
        } else if (item.type === "careerTemplate") {
            if (confirm && system.traits.career.name) {
                // Confirmation on whether to replace the existing data
                const confirmation = await popupConfirmationBox("ironclaw2e.dialog.templateReplacementCareer.title", "ironclaw2e.dialog.templateReplacementCareer.note", "ironclaw2e.dialog.replace",
                    { "actorname": actor.name, "itemname": usedName });
                if (confirmation.confirmed === false) return;
            }
            updateData = {
                "system.traits.career.name": usedName,
                "system.traits.career.careerSkill1": item.system.skill1,
                "system.traits.career.careerSkill2": item.system.skill2,
                "system.traits.career.careerSkill3": item.system.skill3
            };
        }

        // Actual update
        await this.update(updateData);

        // Getting and making the embedded documents, if the actor doesn't yet have them
        let itemIds = [];
        if (item.system.gifts.gift1) itemIds.push(item.system.gifts.gift1);
        if (item.system.gifts.gift2) itemIds.push(item.system.gifts.gift2);
        if (item.system.gifts.gift3) itemIds.push(item.system.gifts.gift3);
        if (item.type === "speciesTemplate") {
            if (item.system.weapons?.weapon1) itemIds.push(item.system.weapons.weapon1);
            if (item.system.weapons?.weapon2) itemIds.push(item.system.weapons.weapon2);
            if (item.system.weapons?.weapon3) itemIds.push(item.system.weapons.weapon3);
        }

        let itemCreateData = [];
        for (let foo of itemIds) {
            // Find if anything matches, either by id or name
            let bar = null;
            if (game.items.has(foo)) {
                bar = game.items.get(foo);
            } else {
                bar = game.items.getName(foo);
            }
            // If something was found, make sure the actor does not already have it, then add it to the list to make
            if (bar && bar.system) {
                if (!this.items.getName(bar.name))
                    itemCreateData.push(bar);
            } else {
                console.warn("Template item creation failed for id: " + foo);
            }
        }

        // Actually create them
        if (itemCreateData.length > 0)
            await this.createEmbeddedDocuments("Item", itemCreateData);
    }

    /* -------------------------------------------- */
    /*  Actor Information Getters                   */
    /* -------------------------------------------- */

    /**
     * Get whether this actor counts as a personal-scale type (characters, mooks, beasts) or vehicle-scale type (vehicles), or neither (marker)
     * @returns {string} Actor scale type
     */
    getActorScaleType() {
        switch (this.type) {
            case "character":
            case "mook":
            case "beast":
                return "personal";
            case "vehicle":
                return "vehicle";
            case "marker":
                return "marker";
            default:
                console.warn("Actor scale type getter defaulted somehow: " + actor.name);
                return "none";
        }
    }

    /**
     * Get the degree of range penalty reduction this actor has for the given item
     * @param {Ironclaw2EItem} item
     * @returns {{reduction: number, autocheck: boolean}}
     */
    getRangePenaltyReduction(item = null, rallycheck = false) {
        const system = this.system;
        const itemData = item?.system;
        let reduction = 0;
        let autocheck = true;
        // Grab the penalty reduction degree from the special settings
        if (system.processingLists?.rangePenaltyReduction) { // Check if range penalty reduction bonuses even exist
            for (let setting of system.processingLists.rangePenaltyReduction) { // Loop through them
                if (checkApplicability(setting, item, this, { rallycheck })) { // Check initial applicability
                    let used = setting; // Store the setting in a temp variable
                    let replacement = this._checkForReplacement(used); // Store the potential replacement if any in a temp variable
                    while (replacement && checkApplicability(replacement, item, this, { rallycheck })) { // As long as the currently used one could be replaced by something applicable
                        used = replacement; // Store the replacement as the one to be used
                        replacement = this._checkForReplacement(used); // Check for a new replacement
                    }
                    if (used) { // Sanity check that the used still exists
                        // Apply the used setting
                        if (reduction < used.penaltyReductionNumber) reduction = used.penaltyReductionNumber;
                    } else { // If used somehow turns out unsuable, send an error
                        console.error("Somehow, the used setting came up unusable: " + used);
                    }
                }
            }
        }

        // Check whether the attack 'item' is representing is magical, and whether the character has a wand readied, in which case, toggle the auto-check off
        if (itemData?.descriptorsSplit?.includes("magic") && this.items.some(element => element.system.readied === true && element.system.descriptorsSplit?.includes("wand"))) {
            autocheck = false;
        }

        return { reduction, autocheck };
    }

    /**
     * Get the reroll types this actor has access to
     * @param {boolean} hasone Whether the roll to check on has a one
     * @param {string[]} stats The stats for the roll to check
     * @param {boolean} addbasicreroll Whether to add the normal "Reroll Ones" option to the returned Map
     * @param {boolean} isauthor Whether the current user owns the roll being rerolled
     * @returns {Map<string,object>} Every reroll type that is allowed, plus special setting data for each
     */
    getGiftRerollTypes(stats = [], hasone = false, isauthor = false, addbasicreroll = true) {
        const system = this.system;
        let rerollTypes = new Map();
        let itemlessdata = { "statArray": stats };
        // Check if any of the reroll types the actor has applies, then grab those
        if (system.processingLists?.rerollBonus) { // Check if reroll bonuses even exist
            for (let setting of system.processingLists.rerollBonus) { // Loop through them
                if (checkApplicability(setting, null, this, { itemlessdata, "hasoneinroll": hasone, isauthor })) { // Check initial applicability
                    let used = setting; // Store the setting in a temp variable
                    let replacement = this._checkForReplacement(used); // Store the potential replacement if any in a temp variable
                    while (replacement && checkApplicability(replacement, null, this, { itemlessdata, "hasoneinroll": hasone, isauthor })) { // As long as the currently used one could be replaced by something applicable
                        used = replacement; // Store the replacement as the one to be used
                        replacement = this._checkForReplacement(used); // Check for a new replacement
                    }
                    if (used) { // Sanity check that the used still exists
                        // Apply the used setting
                        rerollTypes.set(used.rerollType, { "giftId": used.giftId, "bonusExhaustsOnUse": used.bonusExhaustsOnUse, "identifierOverride": used.identifierOverride });
                    } else { // If used somehow turns out unsuable, send an error
                        console.error("Somehow, the used setting came up unusable: " + used);
                    }
                }
            }
        }
        // Add the basic "Reroll One" option if the input matches
        if (hasone && addbasicreroll) rerollTypes.set("ONE", null);
        return rerollTypes;
    }

    /**
     * Get a dice pool construction set from the given gifts
     * @param {string[]} giftnames
     */
    requestedGiftDialogConstruction(giftnames) {
        let otherkeys = new Map();
        let otherdice = new Map();
        let othernames = new Map();
        let otherbools = new Map();
        let otherinputs = "";
        // Go through each gift name given
        for (let name of giftnames) {
            const gift = findInItems(this.items, name, "gift");
            // If a gift with the name was found, it is usable and it has a dice array
            if (gift && gift.system.giftUsable && gift.system.giftArray) {
                // Add a dialog dice pool construction of the gift
                const foo = formDicePoolField(gift.system.giftArray, gift.name, `${gift.name}: ${reformDiceString(gift.system.giftArray, true)}`, true, { "itemid": gift.id, "exhaustonuse": gift.system.exhaustWhenUsed },
                    { otherkeys, otherdice, othernames, otherbools, otherinputs });
                otherkeys = foo.otherkeys;
                otherdice = foo.otherdice;
                othernames = foo.othernames;
                otherbools = foo.otherbools;
                otherinputs = foo.otherinputs;
            }
        }

        return { otherkeys, otherdice, othernames, otherbools, otherinputs };
    }

    /* -------------------------------------------- */
    /*  Non-popup Roll Functions                    */
    /* -------------------------------------------- */

    /**
     * Function to call initiative for an actor
     * @param {number} returntype The type of return to use: -1 to simply return the total initiative dice array, 0 for nothing as it launches a popup, 1 for a traditional initiative roll, 2 for the initiative check on combat start for side-based initiative
     * @param {number} tntouse The target number to use in case the mode uses target numbers
     * @param {boolean} directroll Whether to skip the popup dialog
     * @returns {any} Exact return type depends on the returntype parameter, null if no normal return path
     */
    initiativeRoll(returntype, tntouse = 2, directroll = false) {
        let formconstruction = ``;
        let constructionkeys = new Map();
        let constructionarray = new Map();
        let constructionnames = new Map();
        let constructionbools = new Map();
        let prechecked = CommonSystemInfo.initiativeBaseStats;
        const burdened = hasConditionsIronclaw("burdened", this);

        if (returntype === 0) {// Special case to roll initiative in an encounter through the sheet
            const activeCombatant = game.combat?.getCombatantByActor(this.id);
            if (activeCombatant?.isOwner && !activeCombatant?.initiative) { // If the actor is an active combatant in an encounter and has _not_ yet rolled initiative, roll initiative for it
                return this.rollInitiative();
            }
        }

        const bonuses = this._getGiftSpecialConstruction("initiativeBonus", prechecked, constructionkeys, constructionarray, constructionnames, constructionbools, formconstruction, null);
        prechecked = bonuses.prechecked;
        formconstruction = bonuses.otherinputs;
        constructionkeys = bonuses.otherkeys;
        constructionarray = bonuses.otherdice;
        constructionnames = bonuses.othernames;
        constructionbools = bonuses.otherbools;

        let foo, bar;
        switch (returntype) { // Yes, yes, the breaks are unnecessary
            case -1:
                foo = this._getAllDicePools(prechecked, burdened, constructionkeys, constructionarray, constructionnames, constructionbools);
                bar = foo.totalDice;
                // Flatten it, as it's never really necessary for the total to be in any other order than size-based
                return flattenDicePoolArray(bar);
                break;
            case 0:
                this.basicRollSelector({
                    "prechecked": prechecked, "tnyes": true, "tnnum": tntouse, "otherkeys": constructionkeys, "otherdice": constructionarray, "otherinputs": formconstruction, "otherbools": constructionbools, "othernames": constructionnames,
                    "otherlabel": game.i18n.localize("ironclaw2e.chat.rollingInitiative")
                }, { directroll });
                return null;
                break;
            case 1:
                foo = this._getAllDicePools(prechecked, burdened, constructionkeys, constructionarray, constructionnames, constructionbools);
                bar = foo.totalDice;
                Ironclaw2EItem.giftSetExhaustArray(foo.giftsToExhaust, "true");
                return CardinalDiceRoller.rollHighestArray(bar, game.i18n.localize("ironclaw2e.chat.rollingInitiative") + ": " + foo.label, this, false);
                break;
            case 2:
                foo = this._getAllDicePools(prechecked, burdened, constructionkeys, constructionarray, constructionnames, constructionbools);
                bar = foo.totalDice;
                Ironclaw2EItem.giftSetExhaustArray(foo.giftsToExhaust, "true");
                return CardinalDiceRoller.rollTargetNumberArray(tntouse, bar, game.i18n.localize("ironclaw2e.chat.rollingInitiativeCheck") + ": " + foo.label, this, false);
                break;
        }

        console.error("Initiative roll return type defaulted for actor: " + this.name);
        return null;
    }

    /**
     * Function to call Sprint on an actor
     * @param {number} returntype The type of return to use: -1 to simply return the total Sprint dice array, 0 for nothing as it launches a popup
     * @param {boolean} directroll Whether to skip the popup dialog
     * @returns {any} Exact return type depends on the returntype parameter, null if no normal return path
     */
    sprintRoll(returntype, directroll = false) {
        const system = this.system;
        let formconstruction = ``;
        let constructionkeys = new Map();
        let constructionarray = new Map();
        let constructionnames = new Map();
        let constructionbools = new Map();
        let prechecked = CommonSystemInfo.sprintBaseStats;
        const burdened = hasConditionsIronclaw("burdened", this);

        const bonuses = this._getGiftSpecialConstruction("sprintBonus", prechecked, constructionkeys, constructionarray, constructionnames, constructionbools, formconstruction, null);
        prechecked = bonuses.prechecked;
        formconstruction = bonuses.otherinputs;
        constructionkeys = bonuses.otherkeys;
        constructionarray = bonuses.otherdice;
        constructionnames = bonuses.othernames;
        constructionbools = bonuses.otherbools;

        let foo, bar;
        switch (returntype) { // Yes, yes, the breaks are unnecessary
            case -1:
                foo = this._getAllDicePools(prechecked, burdened, constructionkeys, constructionarray, constructionnames, constructionbools);
                bar = foo.totalDice;
                // Flatten it, as it's never really necessary for the total to be in any other order than size-based
                return flattenDicePoolArray(bar);
                break;
            case 0:
                this.basicRollSelector({
                    "prechecked": prechecked, "tnyes": false, "tnnum": 3, "otherkeys": constructionkeys, "otherdice": constructionarray, "otherinputs": formconstruction, "otherbools": constructionbools, "othernames": constructionnames,
                    "otherlabel": game.i18n.localize("ironclaw2e.chat.rollingSprint") + ", " + game.i18n.format("ironclaw2e.chat.rollingSprintExtra", { "stride": `+-${system.stride}` })
                }, { directroll });
                return;
                break;
        }

        console.error("Sprint roll return type defaulted for actor: " + this.name);
        return null;
    }

    /* -------------------------------------------- */
    /*  Special Popup Macro Puukko Functions        */
    /* -------------------------------------------- */

    /** 
     * A selector to pick the correct roll function based whether directroll is set to true and to check ownership for the function.
     * Use this as the endpoint for any actor rolls, instead of the popupSelectRolled and silentSelectRolled functions.
     * @param {boolean} [holder.tnyes] Whether to use a TN, true for yes
     * @param {number} [holder.tnnum] TN to use
     * @param {string[]} [holder.prechecked] Traits and skills to roll
     * @param {Map<string,object>} [holder.otherkeys] An array of keys, used to identify what gift each 'other dice' field came from, and whether the gift should be exhausted
     * @param {Map<string,number[]>} [holder.otherdice] An array of dice arrays, with matching id's with the otherkeys iteration
     * @param {Map<string,string>} [holder.othernames] An array of names for the fields, to be used for UI information
     * @param {Map<string,boolean>} [holder.otherbools] An array of booleans that determine which modifiers should actually be used for quick rolls by default
     * @param {string} [holder.otherinputs] HTML string to add to the dialog
     * @param {string} [holder.extradice] Extra dice to roll
     * @param {string} [holder.otherlabel] Text to postpend to the label
     * @param {string} [holder.limitvalue] The pre-given value for the limit field
     * @param {boolean} [holder.doubledice] Whether to roll the dice pool twice
     * @returns {Promise<DiceReturn> | Promise<null>}
     */
    basicRollSelector(holder = {}, { directroll = false } = {}, successfunc = null, autocondition = null) {
        // Make sure the current user is actually allowed to roll as the actor
        if (!(game.user.isGM || this.isOwner)) {
            ui.notifications.warn("ironclaw2e.ui.ownershipInsufficient", { localize: true, thing: "actor" });
            return null;
        }

        if (directroll) {
            return this.silentSelectRolled(holder, successfunc, autocondition);
        } else {
            return this.popupSelectRolled(holder, successfunc, autocondition);
        }
    }

    async popupRallyRoll({ prechecked = [], tnyes = true, tnnum = 3, extradice = "", otherkeys = new Map(), otherdice = new Map(), othernames = new Map(), otherbools = new Map(), otherinputs = "", otherlabel = "", limitvalue = "" } = {}, { directroll = false, targetpos = null } = {},
        successfunc = null) {
        let checkedstats = [...prechecked];
        let constructionkeys = new Map(otherkeys);
        let constructionarray = new Map(otherdice);
        let constructionnames = new Map(othernames);
        let constructionbools = new Map(otherbools);
        let formconstruction = otherinputs;

        let usedTn = tnnum;
        // Distance penalty as the TN
        if (targetpos) {
            const foundToken = findActorToken(this);
            if (foundToken) {
                const dist = getDistanceBetweenPositions(foundToken, targetpos);
                const reduction = this.getRangePenaltyReduction(null, true).reduction;
                const penalty = getRangeDiceFromDistance(dist, reduction, false, true);
                // Check if the penalty even exists before popping up the roll field
                if (penalty?.rangeDice) {
                    const foundDice = findTotalDice(penalty.rangeDice);
                    const rangeLabel = game.i18n.format("ironclaw2e.dialog.dicePool.rangePenaltyDistance", { "range": penalty.rangeBandOriginal, "penalty": penalty.rangeDice });
                    const rangeTitle = game.i18n.format("ironclaw2e.dialog.dicePool.rangeRollTitle", { "range": penalty.rangeBandOriginal });
                    const rolled = await (directroll ? CardinalDiceRoller.rollHighestArray(foundDice, rangeLabel, this) : rollHighestOneLine(penalty.rangeDice, rangeLabel, rangeTitle, this));
                    if (rolled && usedTn < rolled.highest) usedTn = rolled.highest;
                }
            }
        }

        return this.basicRollSelector({
            "prechecked": checkedstats, tnyes, "tnnum": usedTn, extradice, "otherkeys": constructionkeys, "otherdice": constructionarray, "othernames": constructionnames, "otherbools": constructionbools, "otherinputs": formconstruction,
            otherlabel, limitvalue
        }, { directroll }, successfunc);
    }

    popupSoakRoll({ prechecked = [], tnyes = true, tnnum = 3, extradice = "", otherkeys = new Map(), otherdice = new Map(), othernames = new Map(), otherbools = new Map(), otherinputs = "", otherlabel = "", limitvalue = "" } = {}, { directroll = false, checkweak = false, checkarmor = true } = {}, successfunc = null) {
        let checkedstats = [...prechecked];
        let constructionkeys = new Map(otherkeys);
        let constructionarray = new Map(otherdice);
        let constructionnames = new Map(othernames);
        let constructionbools = new Map(otherbools);
        let formconstruction = otherinputs;

        // Armor dice
        const armor = this._getArmorConstruction(constructionkeys, constructionarray, constructionnames, constructionbools, formconstruction, checkarmor);
        formconstruction = armor.otherinputs;
        constructionkeys = armor.otherkeys;
        constructionarray = armor.otherdice;
        constructionnames = armor.othernames;
        constructionbools = armor.otherbools;

        // Soak bonuses
        const bonuses = this._getGiftSpecialConstruction("soakBonus", checkedstats, constructionkeys, constructionarray, constructionnames, constructionbools, formconstruction, null);
        checkedstats = bonuses.prechecked;
        formconstruction = bonuses.otherinputs;
        constructionkeys = bonuses.otherkeys;
        constructionarray = bonuses.otherdice;
        constructionnames = bonuses.othernames;
        constructionbools = bonuses.otherbools;

        // Weak damage toggle
        formconstruction += `
      <div class="form-group">
       <label class="normal-label">${game.i18n.localize("ironclaw2e.dialog.dicePool.soakWeak")}</label>
       <input type="checkbox" id="doubledice" name="doubledice" value="1" ${(checkweak ? "checked" : "")}></input>
      </div>`;

        return this.basicRollSelector({
            "prechecked": checkedstats, tnyes, tnnum, extradice, "otherkeys": constructionkeys, "otherdice": constructionarray, "othernames": constructionnames, "otherbools": constructionbools, "otherinputs": formconstruction,
            "doubledice": checkweak, otherlabel, limitvalue
        }, { directroll }, successfunc);
    }

    popupDefenseRoll({ prechecked = [], tnyes = false, tnnum = 3, extradice = "", otherkeys = new Map(), otherdice = new Map(), othernames = new Map(), otherbools = new Map(), otherinputs = "", otherlabel = "", limitvalue = "" } = {}, { directroll = false, isparry = false, isspecial = false, otheritem = null } = {},
        item = null, successfunc = null) {
        let checkedstats = [...prechecked];
        let constructionkeys = new Map(otherkeys);
        let constructionarray = new Map(otherdice);
        let constructionnames = new Map(othernames);
        let constructionbools = new Map(otherbools);
        let formconstruction = otherinputs;

        // Shield cover die
        const shield = this._getShieldConstruction(constructionkeys, constructionarray, constructionnames, constructionbools, formconstruction);
        formconstruction = shield.otherinputs;
        constructionkeys = shield.otherkeys;
        constructionarray = shield.otherdice;
        constructionnames = shield.othernames;
        constructionbools = shield.otherbools;

        // Guarding bonus
        const guard = this._getStatusBonusConstruction("guard", false, constructionkeys, constructionarray, constructionnames, constructionbools, formconstruction);
        formconstruction = guard.otherinputs;
        constructionkeys = guard.otherkeys;
        constructionarray = guard.otherdice;
        constructionnames = guard.othernames;
        constructionbools = guard.otherbools;

        // Attacker range penalty
        if (otheritem) {
            const foundToken = findActorToken(this);
            if (foundToken && otheritem.attackerPos) {
                const dist = getDistanceBetweenPositions(otheritem.attackerPos, foundToken, { usecombatrules: true });
                const range = getDistancePenaltyConstruction(constructionkeys, constructionarray, constructionnames, constructionbools, formconstruction, dist, { "reduction": otheritem.attackerRangeReduction, "autocheck": otheritem.attackerRangeAutocheck });
                formconstruction = range.otherinputs;
                constructionkeys = range.otherkeys;
                constructionarray = range.otherdice;
                constructionnames = range.othernames;
                constructionbools = range.otherbools;
            }
        }

        // Defense bonuses
        const defensetype = (isparry ? "parry" : (isspecial ? "special" : "dodge"));
        const bonuses = this._getGiftSpecialConstruction("defenseBonus", checkedstats, constructionkeys, constructionarray, constructionnames, constructionbools, formconstruction, item, otheritem, true, defensetype);
        checkedstats = bonuses.prechecked;
        formconstruction = bonuses.otherinputs;
        constructionkeys = bonuses.otherkeys;
        constructionarray = bonuses.otherdice;
        constructionnames = bonuses.othernames;
        constructionbools = bonuses.otherbools;

        return this.basicRollSelector({
            "prechecked": checkedstats, tnyes, tnnum, extradice, "otherkeys": constructionkeys, "otherdice": constructionarray, "othernames": constructionnames, "otherbools": constructionbools, "otherinputs": formconstruction,
            otherlabel, limitvalue
        }, { directroll }, successfunc);
    }

    popupAttackRoll({ prechecked = [], tnyes = true, tnnum = 3, extradice = "", otherkeys = new Map(), otherdice = new Map(), othernames = new Map(), otherbools = new Map(), otherinputs = "", otherlabel = "", limitvalue = "" } = {}, { directroll = false, target = null } = {}, item = null, successfunc = null) {
        let checkedstats = [...prechecked];
        let constructionkeys = new Map(otherkeys);
        let constructionarray = new Map(otherdice);
        let constructionnames = new Map(othernames);
        let constructionbools = new Map(otherbools);
        let formconstruction = otherinputs;

        // Aiming bonus
        const aim = this._getStatusBonusConstruction("aim", false, constructionkeys, constructionarray, constructionnames, constructionbools, formconstruction);
        formconstruction = aim.otherinputs;
        constructionkeys = aim.otherkeys;
        constructionarray = aim.otherdice;
        constructionnames = aim.othernames;
        constructionbools = aim.otherbools;

        // Attack bonuses
        const bonuses = this._getGiftSpecialConstruction("attackBonus", checkedstats, constructionkeys, constructionarray, constructionnames, constructionbools, formconstruction, item);
        checkedstats = bonuses.prechecked;
        formconstruction = bonuses.otherinputs;
        constructionkeys = bonuses.otherkeys;
        constructionarray = bonuses.otherdice;
        constructionnames = bonuses.othernames;
        constructionbools = bonuses.otherbools;

        // Combat Advantage
        if (target) {
            const advantage = getCombatAdvantageConstruction(constructionkeys, constructionarray, constructionnames, constructionbools, formconstruction, target);
            formconstruction = advantage.otherinputs;
            constructionkeys = advantage.otherkeys;
            constructionarray = advantage.otherdice;
            constructionnames = advantage.othernames;
            constructionbools = advantage.otherbools;
        }

        // Aiming auto-remove
        const actor = this;
        const autoremove = (x => { actor.deleteEffect("aiming"); });

        return this.basicRollSelector({
            "prechecked": checkedstats, tnyes, tnnum, extradice, "otherkeys": constructionkeys, "otherdice": constructionarray, "othernames": constructionnames, "otherbools": constructionbools, "otherinputs": formconstruction,
            otherlabel, limitvalue
        }, { directroll }, successfunc, autoremove);
    }

    popupCounterRoll({ prechecked = [], tnyes = false, tnnum = 3, extradice = "", otherkeys = new Map(), otherdice = new Map(), othernames = new Map(), otherbools = new Map(), otherinputs = "", otherlabel = "", limitvalue = "" } = {}, { directroll = false, otheritem = null } = {}, item = null, successfunc = null) {
        let checkedstats = [...prechecked];
        let constructionkeys = new Map(otherkeys);
        let constructionarray = new Map(otherdice);
        let constructionnames = new Map(othernames);
        let constructionbools = new Map(otherbools);
        let formconstruction = otherinputs;

        // Guarding bonus
        const guard = this._getStatusBonusConstruction("guard", false, constructionkeys, constructionarray, constructionnames, constructionbools, formconstruction);
        formconstruction = guard.otherinputs;
        constructionkeys = guard.otherkeys;
        constructionarray = guard.otherdice;
        constructionnames = guard.othernames;
        constructionbools = guard.otherbools;

        // Counter bonuses
        const bonuses = this._getGiftSpecialConstruction("counterBonus", checkedstats, constructionkeys, constructionarray, constructionnames, constructionbools, formconstruction, item, otheritem);
        checkedstats = bonuses.prechecked;
        formconstruction = bonuses.otherinputs;
        constructionkeys = bonuses.otherkeys;
        constructionarray = bonuses.otherdice;
        constructionnames = bonuses.othernames;
        constructionbools = bonuses.otherbools;

        return this.basicRollSelector({
            "prechecked": checkedstats, tnyes, tnnum, extradice, "otherkeys": constructionkeys, "otherdice": constructionarray, "othernames": constructionnames, "otherbools": constructionbools, "otherinputs": formconstruction,
            otherlabel, limitvalue
        }, { directroll }, successfunc);
    }

    popupResistRoll({ prechecked = [], tnyes = true, tnnum = 3, extradice = "", otherkeys = new Map(), otherdice = new Map(), othernames = new Map(), otherbools = new Map(), otherinputs = "", otherlabel = "", limitvalue = "" } = {}, { directroll = false, otheritem = null } = {}, item = null, successfunc = null) {
        let checkedstats = [...prechecked];
        let constructionkeys = new Map(otherkeys);
        let constructionarray = new Map(otherdice);
        let constructionnames = new Map(othernames);
        let constructionbools = new Map(otherbools);
        let formconstruction = otherinputs;

        if (otheritem) {
            // Explosion shield cover
            if (otheritem.multiAttack === "explosion") {
                const shield = this._getShieldConstruction(constructionkeys, constructionarray, constructionnames, constructionbools, formconstruction);
                formconstruction = shield.otherinputs;
                constructionkeys = shield.otherkeys;
                constructionarray = shield.otherdice;
                constructionnames = shield.othernames;
                constructionbools = shield.otherbools;
            }

            // Attacker range penalty
            const foundToken = findActorToken(this);
            if (foundToken && otheritem.attackerPos) {
                // Use either the template if it exists, or the token data if the attack explosion spot is not indicated, or the attack is direct
                const dist = getDistanceBetweenPositions(otheritem.attackerPos, otheritem.templatePos || foundToken, { usecombatrules: true });
                const range = getDistancePenaltyConstruction(constructionkeys, constructionarray, constructionnames, constructionbools, formconstruction, dist, { "reduction": otheritem.attackerRangeReduction, "autocheck": otheritem.attackerRangeAutocheck });
                formconstruction = range.otherinputs;
                constructionkeys = range.otherkeys;
                constructionarray = range.otherdice;
                constructionnames = range.othernames;
                constructionbools = range.otherbools;

                // Potential extra range penalty from explosion
                if (otheritem.templatePos) {
                    const exploDist = getDistanceBetweenPositions(otheritem.templatePos, foundToken, { usecombatrules: true });
                    const exploRange = getDistancePenaltyConstruction(constructionkeys, constructionarray, constructionnames, constructionbools, formconstruction, exploDist, { "autocheck": otheritem.attackerRangeAutocheck, "explosionpenalty": true });
                    formconstruction = exploRange.otherinputs;
                    constructionkeys = exploRange.otherkeys;
                    constructionarray = exploRange.otherdice;
                    constructionnames = exploRange.othernames;
                    constructionbools = exploRange.otherbools;

                }
            }
        }

        // Resist bonuses
        const bonuses = this._getGiftSpecialConstruction("resistBonus", checkedstats, constructionkeys, constructionarray, constructionnames, constructionbools, formconstruction, item, otheritem);
        checkedstats = bonuses.prechecked;
        formconstruction = bonuses.otherinputs;
        constructionkeys = bonuses.otherkeys;
        constructionarray = bonuses.otherdice;
        constructionnames = bonuses.othernames;
        constructionbools = bonuses.otherbools;

        return this.basicRollSelector({
            "prechecked": checkedstats, tnyes, tnnum, extradice, "otherkeys": constructionkeys, "otherdice": constructionarray, "othernames": constructionnames, "otherbools": constructionbools, "otherinputs": formconstruction,
            otherlabel, limitvalue
        }, { directroll }, successfunc);
    }

    /* -------------------------------------------- */
    /*  Actual Popup Functions                      */
    /* -------------------------------------------- */

    /**
     * Damage calculation popup
     * @param {number} readydamage
     * @param {number} readysoak
     * @param {string} damageconditions
     */
    async popupDamage(readydamage = 0, readysoak = 0, damageconditions = "") {
        let confirmed = false;
        let speaker = getMacroSpeaker(this);
        let addeddamage = 0;
        let addedconditions = "";

        if (hasConditionsIronclaw("hurt", this)) {
            addeddamage++;
            addedconditions = game.i18n.localize(CommonConditionInfo.getConditionTransId("hurt"));
        }
        if (hasConditionsIronclaw("injured", this)) {
            addeddamage++;
            addedconditions += (addedconditions ? ", " : "") + game.i18n.localize(CommonConditionInfo.getConditionTransId("injured"));
        }
        const confirmSend = game.settings.get("ironclaw2e", "defaultSendDamage");
        const ward = getTargetConditionQuota("temporaryward", this);

        const templateData = {
            "actor": this,
            "addeddamage": addeddamage,
            "addedconditions": addedconditions,
            "confirmSend": confirmSend,
            "readydamage": readydamage,
            "readysoak": readysoak,
            "damageconditions": damageconditions,
            "temporaryWard": ward,
            "hasWard": ward >= 0,
            "actorScaleType": this.getActorScaleType()
        };

        const contents = await renderTemplate("systems/ironclaw2e/templates/popup/damage-popup.html", templateData);

        let dlog = new Dialog({
            title: game.i18n.format("ironclaw2e.dialog.damageCalc.title", { "name": speaker.alias }),
            content: contents,
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
            close: async html => {
                if (confirmed) {
                    let DAMAGE = html.find('[name=damage]')[0].value;
                    let damage = 0; if (DAMAGE.length > 0) damage = parseInt(DAMAGE);
                    let SOAK = html.find('[name=soak]')[0].value;
                    let soak = 0; if (SOAK.length > 0) soak = parseInt(SOAK);
                    let HURT = html.find('[name=hurt]')[0];
                    let hurt = HURT.checked;
                    let ATTACK = html.find('[name=attack]')[0];
                    let attack = ATTACK.checked;
                    let KNOCKOUT = html.find('[name=knockout]')[0];
                    let knockout = KNOCKOUT?.checked;
                    let ALLOW = html.find('[name=nonlethal]')[0];
                    let allow = ALLOW?.checked;
                    let WARD = html.find('[name=reduceward]')[0];
                    let ward = WARD?.checked ?? false;
                    let COND = html.find('[name=cond]')[0].value;
                    let conds = ""; if (COND.length > 0) conds = COND;
                    let SEND = html.find('[name=send]')[0];
                    let send = SEND.checked;

                    let statuses = await this.applyDamage(damage + (hurt ? addeddamage : 0) - soak, { attack, knockout, "nonlethal": allow, "applyWard": ward });
                    let conditions = splitStatString(conds);
                    if (conditions.length > 0) await this.addEffect(conditions);

                    if (send) {
                        Ironclaw2EActor.sendDamageToChat(statuses, speaker);
                    }
                }
            }
        }, { focus: false });
        dlog.render(true);
    }

    /**
     * Damage calculation done silently
     * @param {number} readydamage
     * @param {number} readysoak
     * @param {string} damageconditions
     */
    async silentDamage(readydamage = 0, readysoak = 0, damageconditions = "") {
        let speaker = getMacroSpeaker(this);
        let addeddamage = 0;
        const confirmSend = game.settings.get("ironclaw2e", "defaultSendDamage");

        if (hasConditionsIronclaw("hurt", this)) {
            addeddamage++;
        }
        if (hasConditionsIronclaw("injured", this)) {
            addeddamage++;
        }

        let statuses = await this.applyDamage(readydamage + addeddamage - readysoak);
        let conditions = splitStatString(damageconditions);
        if (conditions.length > 0) await this.addEffect(conditions);

        if (confirmSend) {
            Ironclaw2EActor.sendDamageToChat(statuses, speaker);
        }
    }

    /** Special condition adding popup */
    async popupAddCondition(readyname = "", readyquota = "") {
        let confirmed = false;
        let speaker = getMacroSpeaker(this);

        const templateData = {
            "actor": this,
            "readySelected": readyname || "focused",
            "readyQuota": readyquota || "",
            "systemConditions": getConditionSelectObject(),
            "translateLabel": game.ironclaw2e.useCUBConditions
        };
        const contents = await renderTemplate("systems/ironclaw2e/templates/popup/condition-popup.html", templateData);

        let dlog = new Dialog({
            title: game.i18n.format("ironclaw2e.dialog.addCondition.title", { "name": speaker.alias }),
            content: contents,
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
            render: html => { document.getElementById("condition").focus(); },
            close: async html => {
                if (confirmed) {
                    let QUOTA = html.find('[name=quota]')[0].value;
                    let quota = 0; if (QUOTA.length > 0) quota = parseInt(QUOTA);
                    let COND = html.find('[name=condition]')[0]?.value;
                    if (COND?.length > 0) {
                        await this.addEffect(COND);
                        if (quota > 0 && checkConditionQuota(COND)) await this.updateEffectQuota(COND, quota);
                    }
                }
            }
        }, { focus: false });
        dlog.render(true);
    }

    /* -------------------------------------------- */
    /* Supermassive Generic Dice Pool Roll Popup    */
    /* -------------------------------------------- */

    /** Supermassive mega-function to make a dynamic popup window asking about which exact dice pools should be included
     * @param {boolean} [tnyes] Whether to use a TN, true for yes
     * @param {number} [tnnum] TN to use
     * @param {string[]} [prechecked] Traits and skills to autocheck on the dialog
     * @param {Map<string,object>} [otherkeys] An array of keys, used to identify what gift each 'other dice' field came from, and whether the gift should be exhausted
     * @param {Map<string,number[]>} [otherdice] An array of dice arrays, with matching id's with the otherkeys iteration
     * @param {Map<string,string>} [othernames] An array of names for the fields, to be used for UI information
     * @param {string} [otherinputs] HTML string to add to the dialog
     * @param {string} [extradice] Default extra dice to use for the bottom one-line slot
     * @param {string} [otherlabel] Text to postpend to the label
     * @param {string} [limitvalue] The pre-given value for the limit field
     * @param successfunc Callback to execute after going through with the macro, will not execute if cancelled out
     * @param autocondition Callback to a condition auto-removal function, executed if the setting is on, will not execute if cancelled out
     * @returns {Promise<DiceReturn> | Promise<null>}
     * @protected
     */
    popupSelectRolled({ tnyes = false, tnnum = 3, prechecked = [], otherkeys = new Map(), otherdice = new Map(), othernames = new Map(), otherinputs = "", extradice = "", otherlabel = "", limitvalue = "" } = {}, successfunc = null, autocondition = null) {
        const system = this.system;
        let formconstruction = ``;
        let firstelement = "";
        const hastraits = system.hasOwnProperty("traits");
        const hasskills = system.hasOwnProperty("skills");
        const conditionRemoval = game.settings.get("ironclaw2e", "autoConditionRemoval");
        const giftUseToChat = game.settings.get("ironclaw2e", "sendGiftUseExhaustMessage");

        if (prechecked === null || typeof (prechecked) === "undefined") {
            console.warn("Prechecked stat array turned up null or undefined! This should not happen, correcting: " + prechecked);
            prechecked = [];
        }

        let extracareers = [];
        if (system.hasExtraCareers) { // Check if the actor has any extra careers to show
            system.extraCareerIds.forEach(x => extracareers.push(this.items.get(x)));
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
        let labelNotice = "";
        if (otherlabel) {
            labelNotice = `<span class="normal-text">${game.i18n.format("ironclaw2e.dialog.labelNotice", { "label": otherlabel })}</span><br>`;
        }

        if (hastraits) {
            formconstruction += `<h2>${game.i18n.localize("ironclaw2e.actor.traits")}:</h2>
       <div class="grid-2row grid-minimal">` + "\n";;
            for (let [key, trait] of Object.entries(system.traits)) {
                const lowerkey = makeCompareReady(key); // Separate variable for prechecked in traits to account for using the species or career name in the pre-checked
                const isPrechecked = prechecked.includes(lowerkey) || (trait.name && prechecked.includes(makeCompareReady(trait.name)));
                if (firstelement === "")
                    firstelement = lowerkey;
                formconstruction += `<div class="form-group flex-group-center flex-tight">
       <label class="normal-label">${(system.hasExtraCareers && key === "career" ? trait.name : convertCamelCase(key))}: ${reformDiceString(trait.diceArray)}</label>
	   <input type="checkbox" id="${lowerkey}" name="trait" value="${lowerkey}" ${isPrechecked ? "checked" : ""}></input>
      </div>`+ "\n";
            }
            // Extra Career additional boxes
            if (extracareers.length > 0) {
                for (let [index, extra] of extracareers.entries()) {
                    if (index >= 2)
                        break; // For UI reasons, only show up to two extra careers on dice pool selection, these should select themselves from the top of the list in the sheet
                    const lowerkey = makeCompareReady(extra.system.careerName);
                    if (firstelement === "")
                        firstelement = lowerkey;
                    formconstruction += `<div class="form-group flex-group-center flex-tight">
       <label class="normal-label">${extra.system.careerName}: ${reformDiceString(extra.system.diceArray)}</label>
	   <input type="checkbox" id="${lowerkey}" name="trait" value="${lowerkey}" ${prechecked.includes(lowerkey) ? "checked" : ""}></input>
      </div>`+ "\n";
                }
            }
            formconstruction += `</div>` + "\n";
        }
        if (hasskills) {
            formconstruction += `<h2>${game.i18n.localize("ironclaw2e.actor.skills")}:</h2>
       <div class="grid grid-3col grid-minimal">` + "\n";
            for (let [key, skill] of Object.entries(system.skills)) {
                const lowerkey = makeCompareReady(key);
                if (firstelement === "")
                    firstelement = lowerkey;
                let usedname = (burdenedLimitedStat(lowerkey) ? String.fromCodePoint([9949]) : "") + " " + convertCamelCase(key) + ": " + reformDiceString(skill.diceArray);
                formconstruction += `<div class="form-group flex-group-center flex-tight">
       <label class="${usedname.length > 26 ? "tiny-label" : (usedname.length > 18 ? "small-label" : "normal-label")}">${usedname}</label>
	   <input type="checkbox" id="${lowerkey}" name="skill" value="${lowerkey}" ${prechecked.includes(lowerkey) ? "checked" : ""}></input>
      </div>`+ "\n";
            }
            formconstruction += `</div>` + "\n";
        }

        if (firstelement === "") {
            console.warn("Somehow, an empty actor sheet was received! " + this.name);
            return null;
        }

        // Actual dialog handling
        let confirmed = false;
        let resolvedroll = new Promise((resolve) => {
            let rollreturn = null;
            let dlog = new Dialog({
                title: game.i18n.localize("ironclaw2e.dialog.dicePool.title"),
                content: `
     <form class="ironclaw2e">
     <h1>${game.i18n.format("ironclaw2e.dialog.dicePool.header", { "name": this.name })}</h1>
     ${labelNotice}
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
       <input type="checkbox" id="iflimit" name="iflimit" ${limitvalue ? "checked" : ""}></input>
	   <input id="limit" name="limit" value="${limitvalue}" placeholder="${game.i18n.localize("ironclaw2e.dialog.dicePool.limitAllPlaceholder")}" onfocus="this.select();"></input>
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
                render: html => {
                    if (tnyes)
                        document.getElementById("tn").focus();
                    else
                        document.getElementById("iftn").focus();
                },
                close: async html => {
                    if (confirmed) {
                        let traitchecks = html.find('input:checkbox[name=trait]:checked');
                        let skillchecks = html.find('input:checkbox[name=skill]:checked');
                        let traitvalues = [];
                        let skillvalues = [];
                        let totaldice = [0, 0, 0, 0, 0];

                        for (let i = 0; i < traitchecks.length; ++i) { // Go through all the traits and skills, see which ones are checked and grab those
                            traitvalues.push(traitchecks[i].value);
                        }
                        for (let i = 0; i < skillchecks.length; ++i) {
                            skillvalues.push(skillchecks[i].value);
                        }

                        let IFBURDENED = html.find('[name=burdened]');
                        let isburdened = IFBURDENED.length > 0 ? IFBURDENED[0].checked : false;

                        let IFLIMIT = html.find('[name=iflimit]')[0];
                        let uselimit = IFLIMIT.checked;
                        let LIMIT = html.find('[name=limit]')[0].value?.trim();
                        let limit = this._getDicePoolLimit(LIMIT, isburdened);

                        let IFTNSS = html.find('[name=iftn]')[0];
                        let IFTN = IFTNSS.checked;
                        let TNSS = html.find('[name=tn]')[0].value;
                        let TN = 0; if (TNSS.length > 0) TN = parseInt(TNSS);
                        let DICES = html.find('[name=dices]')[0].value;

                        let DOUBLE = html.find('[name=doubledice]')?.[0];
                        let doubleDice = (DOUBLE ? DOUBLE.checked : false);

                        let labelgiven = false;
                        let label = "<p>";

                        if (hastraits || hasskills) { // Get the dice pools from the checked traits and skills and add them to the roll
                            const statfoobar = this._getDicePools(traitvalues, skillvalues, isburdened, labelgiven);
                            totaldice = statfoobar.totalDice;
                            label += statfoobar.label;
                            labelgiven = statfoobar.labelGiven;
                        }
                        let checkmarks = new Map();
                        if (otherkeys?.size > 0) {
                            for (let [key, info] of otherkeys.entries()) { // Go through the other dice fields and put their checkmarks to a map
                                let OTHER = html.find(`[name=${key}]`);
                                let otherchecked = (OTHER.length > 0 ? OTHER[0].checked : false);
                                checkmarks.set(key, otherchecked);
                            }
                        }
                        if (checkmarks.size > 0 || DICES.length > 0) {
                            // Add the other and extra fields to the pools
                            const otherfoobar = this._getOtherDicePools(otherkeys, otherdice, othernames, checkmarks, DICES, labelgiven);
                            totaldice = totaldice.concat(otherfoobar.totalDice);
                            label += otherfoobar.label;
                            labelgiven = otherfoobar.labelGiven;
                            // Exhaust the gifts returned from the dice pools
                            await Ironclaw2EItem.giftSetExhaustArray(otherfoobar.giftsToExhaust, "true");
                        }


                        if (doubleDice) {
                            label += ", " + game.i18n.localize("ironclaw2e.chat.doubleDice");
                        } // Set the labels
                        label += ".</p>";
                        if (typeof (otherlabel) === 'string' && otherlabel.length > 0)
                            label += `<p style="color:black">${otherlabel}</p>`;

                        if (doubleDice) { // See if the dicepool will be rolled twice (doubled dicepool), like in case of a Weak Soak
                            totaldice = totaldice.concat(totaldice);
                        }
                        if (uselimit) { // See if a special limit has been set to all dice
                            totaldice = enforceLimitArray(totaldice, limit);
                        }

                        if (IFTN) // Do and get the actual roll
                            rollreturn = await CardinalDiceRoller.rollTargetNumberArray(TN, totaldice, label, this);
                        else
                            rollreturn = await CardinalDiceRoller.rollHighestArray(totaldice, label, this);

                        // Add the statistics used for the roll into a flag
                        if (rollreturn?.message)
                            await rollreturn.message?.setFlag("ironclaw2e", "usedActorStats", traitvalues.concat(skillvalues));

                        if (successfunc && typeof (successfunc) === "function") {
                            successfunc(rollreturn); // Then do the special callback function of the roll if it is set
                        }

                        // The automated condition removal callback
                        if (conditionRemoval && autocondition && typeof (autocondition) === "function") {
                            autocondition(); // Automatic condition removal after a successful roll
                        }
                    }
                    resolve(rollreturn);
                }
            }, { width: 620, focus: false });
            dlog.render(true);
        });
        return resolvedroll;
    }

    /** Function to silently roll the given prechecked dice pools and extra dice, instead of popping a dialog for it
     * @param {boolean} [tnyes] Whether to use a TN, true for yes
     * @param {number} [tnnum] TN to use
     * @param {string[]} [prechecked] Traits and skills to roll
     * @param {Map<string,object>} [otherkeys] An array of keys, used to identify what gift each 'other dice' field came from, and whether the gift should be exhausted
     * @param {Map<string,number[]>} [otherdice] An array of dice arrays, with matching id's with the otherkeys iteration
     * @param {Map<string,string>} [othernames] An array of names for the fields, to be used for UI information
     * @param {Map<string,boolean>} [otherbools] An array of booleans that determine which modifiers should actually be used for quick rolls by default
     * @param {string} [extradice] Extra dice to roll
     * @param {string} [otherlabel] Text to postpend to the label
     * @param {string} [limitvalue] The pre-given value for the limit field
     * @param {boolean} [doubledice] Whether to roll the dice pool twice
     * @param successfunc Callback to execute after going through with the macro, executed unless an error happens
     * @param autocondition Callback to a condition auto-removal function, executed if the setting is on, executed unless an error happens
     * @returns {Promise<DiceReturn> | Promise<null>}
     * @protected
     */
    async silentSelectRolled({ tnyes = false, tnnum = 3, prechecked = [], otherkeys = new Map(), otherdice = new Map(), otherbools = new Map(), othernames = new Map(), extradice = "", otherlabel = "", doubledice = false, limitvalue = "" } = {}, successfunc = null, autocondition = null) {
        const burdened = hasConditionsIronclaw("burdened", this);
        const conditionRemoval = game.settings.get("ironclaw2e", "autoConditionRemoval");
        // Get the total of all the dice pools
        const all = this._getAllDicePools(prechecked, burdened, otherkeys, otherdice, othernames, otherbools, extradice);
        for (let item of all.giftsToExhaust) {
            // Go though and exhaust the relevant gifts
            await item.giftToggleExhaust("true", giftUseToChat);
        }

        // Determine limit if it exists
        let limit = this._getDicePoolLimit(limitvalue, burdened);

        // Set the label
        let label = "<p>" + all.label + (doubledice ? ", " + game.i18n.localize("ironclaw2e.chat.doubleDice") : "") + ".</p>";
        // If it exists, set the separate label
        if (typeof (otherlabel) === 'string' && otherlabel.length > 0)
            label += `<p style="color:black">${otherlabel}</p>`;

        if (doubledice) { // See if the dicepool will be rolled twice (doubled dicepool), like in case of a Weak Soak
            all.totalDice = all.totalDice.concat(all.totalDice);
        }
        if (limit > 0) { // See if a special limit has been set to all dice
            all.totalDice = enforceLimitArray(all.totalDice, limit);
        }

        // Exhaust the gifts returned from the dice pools
        await Ironclaw2EItem.giftSetExhaustArray(all.giftsToExhaust, "true");

        let rollreturn = null;
        if (tnyes) // Do the actual roll, either TN or Highest based on tnyes
            rollreturn = await CardinalDiceRoller.rollTargetNumberArray(tnnum, all.totalDice, label, this);
        else
            rollreturn = await CardinalDiceRoller.rollHighestArray(all.totalDice, label, this);

        // Add the statistics used for the roll into a flag
        if (rollreturn?.message)
            await rollreturn.message.setFlag("ironclaw2e", "usedActorStats", prechecked);

        // The success callback function
        if (successfunc && typeof (successfunc) === "function") {
            successfunc(rollreturn);
        }

        // The condition callback function
        if (conditionRemoval && autocondition && typeof (autocondition) === "function") {
            autocondition();
        }

        return rollreturn;
    }
}

// Actual Hooks
Hooks.on("preCreateItem", Ironclaw2EActor.onActorPreCreateItem);
Hooks.on("createActiveEffect", Ironclaw2EActor.onActorCreateActiveEffect);
Hooks.on("deleteActiveEffect", Ironclaw2EActor.onActorDeleteActiveEffect);
Hooks.on("deleteItem", Ironclaw2EActor.onActorDeleteItem);