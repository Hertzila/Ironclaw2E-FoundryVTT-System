// Utilities and Macros
// Random non-helper stuff that are substantial, relatively self-contained, and I couldn't really think of another place to dump into
import { checkQuickModifierKey, findActorToken, getActorFromSpeaker, getDistanceBetweenPositions, getMacroSpeaker, getSpeakerActor, splitStatsAndBonus, splitStatString } from "./helpers.js";
import { Ironclaw2EActor } from "./actor/actor.js";
import { Ironclaw2EItem } from "./item/item.js";
import { getRangeBandFromDistance } from "./systeminfo.js";
import { hasConditionsIronclaw } from "./conditions.js";
import { CardinalDiceRoller, copyToRollTNDialog, rerollDialog } from "./dicerollers.js";

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

// Chat Message Button Handler
Hooks.on("renderChatMessage", function (message, html, data) {
    // 'Who to show stuff to' system settings
    const noButtons = game.settings.get("ironclaw2e", "chatButtons") === false;
    const showOthersToAll = game.settings.get("ironclaw2e", "showDefenseButtons");
    const showDescription = game.settings.get("ironclaw2e", "npcItemHasDescription");
    const showTactics = game.settings.get("ironclaw2e", "showOthersTacticsUse");
    const buttons = html.find('.button-holder');

    // Chat message button system
    if (noButtons) {
        // If buttons are disabled, remove the buttons from the visible messages
        buttons.remove();
    } else {
        const showAuthor = game.user.isGM || message.isAuthor; // Check to show buttons meant to the author
        const showOthers = game.user.isGM || !message.isAuthor || showOthersToAll; // Check to show buttons meant for others

        // Get the flags of the message that determine what type of message it is
        const itemInfo = message.getFlag("ironclaw2e", "itemInfo");
        const attackInfo = message.getFlag("ironclaw2e", "attackDamageInfo");
        const requestRoll = message.getFlag("ironclaw2e", "requestRoll");

        if (itemInfo) {
            const tacticsButtons = buttons.find('.tactics-buttons');
            const tacticsBox = tacticsButtons.find('.tactics-checkbox');
            if (tacticsBox[0]) tacticsBox[0].checked = message.getFlag("ironclaw2e", "attackUsingTactics") ?? false; // Set the checkbox to its supposed state

            if (showAuthor) {
                const attackButtons = buttons.find('.attack-buttons');
                attackButtons.find('.default-attack').click(Ironclaw2EActor.onChatAttackClick.bind(this));
                attackButtons.find('.skip-attack').click(Ironclaw2EActor.onChatAttackClick.bind(this));
                attackButtons.find('.spark-attack').click(Ironclaw2EActor.onChatSparkClick.bind(this));

                buttons.find('.gift-buttons').find('.default-gift-use').click(Ironclaw2EActor.onChatGiftUseClick.bind(this));

                const templateButtons = buttons.find('.template-buttons');
                templateButtons.find('.place-template').click(Ironclaw2EActor.onPlaceExplosionTemplate.bind(this));

                // Only bind the tactics change here to ensure only the author and GM can do it
                tacticsBox.change(Ironclaw2EActor.onChangeTacticsUse.bind(this));
                if (tacticsBox[0]) tacticsBox[0].disabled = false;
            } else {
                buttons.find('.attack-holder').remove();
                buttons.find('.gift-holder').remove();
                if (!showTactics) {
                    // Remove the tactics checkbox from being visible
                    tacticsButtons.remove();
                }
            }

            if (showOthers) {
                const defenseButtons = buttons.find('.defense-buttons');
                defenseButtons.find('.dodge-defense').click(Ironclaw2EActor.onChatDefenseClick.bind(this));
                defenseButtons.find('.parry-defense').click(Ironclaw2EActor.onChatDefenseClick.bind(this));
                defenseButtons.find('.special-defense').click(Ironclaw2EActor.onChatDefenseClick.bind(this));
                defenseButtons.find('.resist-defense').click(Ironclaw2EActor.onChatDefenseClick.bind(this));
                defenseButtons.find('.counter-defense').click(Ironclaw2EActor.onChatDefenseClick.bind(this));
            } else {
                buttons.find('.defense-buttons').remove();
            }
        }
        if (attackInfo) {
            if (showOthers) {
                buttons.find('.soak-button').click(Ironclaw2EActor.onChatSoakClick.bind(this));
            } else {
                buttons.remove();
            }
        }
        if (requestRoll) {
            if (showOthers) {
                buttons.find('.asked-roll-button').click(onRequestRollTrigger.bind(this));
            } else {
                buttons.remove();
            }
        }
    }

    // Description hiding system, only go here if some descriptions should be hidden
    if (showDescription === false && !game.user.isGM) {
        const actor = getActorFromSpeaker(message.speaker);
        // If the actor exists and has no player owner
        const hideDescription = (actor && actor?.hasPlayerOwner === false);
        if (hideDescription) {
            // If description should be hidden, remove it
            html.find('.item-description').remove();
            html.find('.item-statistics').remove();
        }
    }
});

// Distance Text Handlers
Hooks.on("targetToken", function (user, token, targeted) {
    const showRange = game.settings.get("ironclaw2e", "showRangeWhenTargeting");
    if (!(showRange && user.id === game.userId)) {
        // Unless the option is on and the user this triggered to is the current one, return out
        return;
    }
    // Only show the text when the token is targeted, not un-targeted
    if (targeted) {
        const foundToken = findActorToken(getSpeakerActor());
        showScrollingDistanceText(foundToken, token.document ? token.document : token);
    }
});

Hooks.on("updateToken", function (token, data, options, userid) {
    const showRange = game.settings.get("ironclaw2e", "showRangeWhenTargeting");
    if (!showRange || game.user.targets.size === 0) {
        // If the option is turned off or the current user does not have any targets, return out
        return;
    }
    if (!data.hasOwnProperty("x") && !data.hasOwnProperty("y") && !data.hasOwnProperty("elevation")) {
        // If the update has nothing to do with position, return out
        return;
    }
    const isTargeted = game.user.targets.ids.includes(token.id);
    const foundToken = findActorToken(getSpeakerActor());
    if (isTargeted || token.id === foundToken.id) {
        if (isTargeted) {
            showScrollingDistanceText(foundToken, token.document ? token.document : token);
        } else {
            for (let target of game.user.targets) {
                showScrollingDistanceText(foundToken, target.document ? target.document : target);
            }
        }
    }
});

/* -------------------------------------------- */
/*  Request Roll Functions                      */
/* -------------------------------------------- */

/**
 * Trigger a popup to specify what roll to request
 * @param {string} readydice
 * @param {number} tnnum
 * @param {string} whispername
 */
export async function requestRollPopup(readydice = "", readygifts = "", tnnum = -1, whispername = "") {
    const allowNonGM = game.settings.get("ironclaw2e", "allowNonGMRequestRolls");
    if (!game.user.isGM && !allowNonGM) {
        // If the user is not a GM and the world settings do not allow non-GM's to ask rolls
        ui.notifications.warn("ironclaw2e.ui.requestRollNotAllowed", { localize: true });
        return;
    }

    let confirmed = false;
    const macroSpeaker = getMacroSpeaker(this.actor);
    const userSpeaker = { alias: game.user.name };

    const templateData = {
        "userAlias": userSpeaker.alias,
        "macroAlias": macroSpeaker.alias,
        "whispername": whispername,
        "readydice": readydice,
        "readygifts": readygifts,
        "tnnum": tnnum
    };

    let dialogContent = await renderTemplate("systems/ironclaw2e/templates/popup/request-popup.html", templateData);

    let dlog = new Dialog({
        title: game.i18n.localize("ironclaw2e.dialog.requestRoll.requestRollHeader"),
        content: dialogContent,
        buttons: {
            one: {
                icon: '<i class="fas fa-check"></i>',
                label: game.i18n.localize("ironclaw2e.dialog.request"),
                callback: () => confirmed = true
            },
            two: {
                icon: '<i class="fas fa-times"></i>',
                label: game.i18n.localize("ironclaw2e.dialog.cancel"),
                callback: () => confirmed = false
            }
        },
        default: "one",
        render: html => { document.getElementById("dices").focus(); },
        close: html => {
            if (confirmed) {
                let USER = html.find('[name=selectuser]')[0].value;
                let usernumber = 0; if (USER.length > 0) usernumber = parseInt(USER);
                let WHISPER = html.find('[name=whisper]')[0].value;
                let whisper = ""; if (WHISPER.length > 0) whisper = WHISPER;
                let TNNUM = html.find('[name=tn]')[0].value;
                let tn = -1; if (TNNUM.length > 0) tn = parseInt(TNNUM);
                let DICES = html.find('[name=dices]')[0].value;
                let dices = ""; if (DICES.length > 0) dices = DICES;
                let GIFTS = html.find('[name=gifts]')[0].value;
                let gifts = ""; if (GIFTS.length > 0) gifts = GIFTS;

                requestRollToMessage(dices, tn, { "speaker": (usernumber === 1 ? macroSpeaker : userSpeaker), "whisper": whisper, "requestedgifts": gifts });
            }
        }
    }, { focus: false });
    dlog.render(true);
}

/**
 * Actual sending of the chat message that requests the roll
 * @param {string} dicepool
 * @param {number} tn
 * @param {any} param2
 */
export async function requestRollToMessage(dicepool, tn, { whisper = "", speaker = null, requestedgifts = "" } = {}) {
    const allowNonGM = game.settings.get("ironclaw2e", "allowNonGMRequestRolls");
    if (!game.user.isGM && !allowNonGM) {
        // If the user is not a GM and the world settings do not allow non-GM's to request rolls
        ui.notifications.warn("ironclaw2e.ui.requestRollNotAllowed", { localize: true });
        return;
    }
    if (!dicepool) {
        // Stop the request roll sending if there is nothing requested
        ui.notifications.info("ironclaw2e.ui.requestRollEmpty", { localize: true });
        return;
    }

    speaker = speaker ?? ChatMessage.getSpeaker();
    const tnyes = tn > 0;
    const tnnum = tn > 0 ? tn : 3;

    const templateData = {
        "speaker": speaker.alias,
        "stats": dicepool,
        "requestedGifts": requestedgifts,
        "tnyes": tnyes,
        "tnnum": tnnum
    };

    const contents = await renderTemplate("systems/ironclaw2e/templates/chat/request-roll.html", templateData);

    let flags = {
        "ironclaw2e.requestRoll": true, "ironclaw2e.requestDicePool": dicepool, "ironclaw2e.requestedGifts": requestedgifts,
        "ironclaw2e.requestTNYes": tnyes, "ironclaw2e.requestTNNum": tnnum, "ironclaw2e.requestSpeaker": speaker.alias
    };

    let chatData = {
        content: contents,
        speaker,
        flags
    };
    // Check whether the whisper field even contains anything, then whether there are multiple users there split with commas
    if (typeof whisper === "string" && whisper?.length > 0) {
        let whisperIds = [];
        const whisperSplit = whisper.split(",");
        if (whisperSplit.length > 1) {
            for (let foo of whisperSplit) {
                whisperIds = whisperIds.concat(ChatMessage.getWhisperRecipients(foo));
            }
        } else {
            whisperIds = whisperIds.concat(ChatMessage.getWhisperRecipients(whisper));
        }
        chatData.whisper = whisperIds;
    } else {
        ChatMessage.applyRollMode(chatData, "publicroll");
    }
    CONFIG.ChatMessage.documentClass.create(chatData);
}

/**
 * The function to trigger when a user presses the "Roll dice pool" button
 * @param {any} event
 */
async function onRequestRollTrigger(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const dataset = element.dataset;
    const message = game.messages.get($(event.currentTarget).closest('.chat-message')[0]?.dataset?.messageId);
    const requestActor = getSpeakerActor();

    if (!requestActor) {
        ui.notifications.warn("ironclaw2e.ui.actorNotFoundForMacro", { localize: true });
        return null;
    }
    const direct = checkQuickModifierKey();
    const messageFlags = message?.flags?.ironclaw2e;

    // Check to make sure the flags actually exist
    if (messageFlags) {
        const splitStats = splitStatsAndBonus(messageFlags.requestDicePool);
        const splitGifts = splitStatString(messageFlags.requestedGifts ?? []);
        const giftSetup = requestActor.requestedGiftDialogConstruction(splitGifts);
        requestActor.basicRollSelector({
            "tnyes": messageFlags.requestTNYes, "tnnum": messageFlags.requestTNNum, "prechecked": splitStats[0], "otherkeys": giftSetup.otherkeys,
            "otherdice": giftSetup.otherdice, "othernames": giftSetup.othernames, "otherbools": giftSetup.otherbools, "otherinputs": giftSetup.otherinputs,
            "extradice": splitStats[1], "otherlabel": game.i18n.format("ironclaw2e.chatInfo.requestRoll.rollLabel", { "user": messageFlags.requestSpeaker })
        }, { "directroll": direct });
    }
}

/* -------------------------------------------- */
/*  Distance Showing Functions                  */
/* -------------------------------------------- */

/**
 * Function that pops up a text showing the distance band to the targettoken from the origintoken
 * @param {TokenDocument} origintoken
 * @param {TokenDocument} targettoken
 */
export function showScrollingDistanceText(origintoken, targettoken) {
    // Only show the text if the origin and target exist, and are not the same token
    if (origintoken && targettoken && origintoken.id !== targettoken.id) {
        const combatRule = game.settings.get("ironclaw2e", "showRangeCombatRules");
        const duration = game.settings.get("ironclaw2e", "showRangeDuration") ?? 3000;
        let usecombatrules = combatRule === 2;
        if (combatRule === 1) {
            if (game.combat?.getCombatantByToken(origintoken.id))
                usecombatrules = true;
        }
        // Double-check that everything that should exist does
        if (targettoken && origintoken) {
            const center = targettoken.object.center;
            const distance = getDistanceBetweenPositions(origintoken, targettoken, { usecombatrules });
            const range = getRangeBandFromDistance(distance, true);
            const text = game.i18n.format("ironclaw2e.ui.rangeScrolling", { "range": range });
            canvas.interface.createScrollingText(center, text, { anchor: CONST.TEXT_ANCHOR_POINTS.BOTTOM, direction: CONST.TEXT_ANCHOR_POINTS.TOP, duration, jitter: 0.1, fontSize: 28, stroke: 0x000000, strokeThickness: 4 });
        }
    }
}


/* -------------------------------------------- */
/*  Drag Ruler Integration                      */
/* -------------------------------------------- */

/**
 * Drag Ruler integration for the Ironclaw system
 * @param {SpeedProvider} SpeedProvider
 */
export function ironclawDragRulerIntegration(SpeedProvider) {
    class Ironclaw2ESpeedProvider extends SpeedProvider {
        get colors() {
            return [
                { id: "stride", default: 0x0000FF, name: "ironclaw2e.speeds.stride" },
                { id: "dash", default: 0x00DE00, name: "ironclaw2e.speeds.dash" },
                { id: "run", default: 0xFFFF00, name: "ironclaw2e.speeds.run" }
            ];
        }

        getRanges(token) {
            const stridespeed = token.actor?.system.stride || 0;
            const dashspeed = token.actor?.system.dash || 0;
            const runspeed = token.actor?.system.run || 0;

            const ranges = [
                { range: stridespeed, color: "stride" },
                { range: dashspeed + stridespeed, color: "dash" },
                { range: runspeed, color: "run" }
            ];

            return ranges;
        }

        getCostForStep(token, area, options = {}) {
            // Lookup the cost for each square occupied by the token
            options.token = token;
            const costs = area.map(space => terrainRuler.getCost(space.x, space.y, options));
            // If the token has flying or the actor ignores bad footing, it ignores all difficult terrain
            const ignored = hasConditionsIronclaw("flying", token) || token?.actor?.system.ignoreBadFooting;
            if (ignored) {
                return 1;
            }
            // Return the maximum of the costs
            return costs.reduce((max, current) => Math.max(max, current));
        }
    }

    dragRuler.registerSystem("ironclaw2e", Ironclaw2ESpeedProvider);
}

/* -------------------------------------------- */
/*  Context Menus                               */
/* -------------------------------------------- */
/* eslint-disable */

/**
 * Small function to get the hanging actor from a message
 * @param {any} message
 * @private
 */
function getHangingActor(message) {
    const actorid = message.getFlag("ironclaw2e", "hangingActor");
    const tokenid = message.getFlag("ironclaw2e", "hangingToken");
    const sceneid = message.getFlag("ironclaw2e", "hangingScene");
    return game.scenes.get(sceneid)?.tokens.get(tokenid)?.actor || game.actors.get(actorid);
}

/**
 * Adds the Ironclaw context menu options to the chat log
 * @param {any} html
 * @param {any} entryOptions The menu
 */
function addIronclawChatLogContext(html, entryOptions) {
    entryOptions.push( // General roll context options
        {
            name: "ironclaw2e.context.chatLog.copyToTN",
            icon: '<i class="fas fa-bullseye"></i>',
            condition: li => {
                const message = game.messages.get(li.data("messageId"));
                const type = message.getFlag("ironclaw2e", "rollType");
                // Check that the message has a roll, and is not of TN type
                const allowed = message.isRoll && type && type === "HIGH";			
                return allowed && (game.user.isGM || message.isAuthor) && message.isContentVisible;				
            },
            callback: li => {
				
				//console.log("Message ID : " + game.messages.get(li.data("messageId"));
                const message = game.messages.get(li.data("messageId"));
                copyToRollTNDialog(message);
            }
        },
        {
            name: "ironclaw2e.context.chatLog.changeTN",
            icon: '<i class="fas fa-bullseye"></i>',
            condition: li => {
                const message = game.messages.get(li.data("messageId"));
                const type = message.getFlag("ironclaw2e", "rollType");
                // Check that the message has a roll, and is of TN type
                const allowed = message.isRoll && type && type === "TN";
                return allowed && (game.user.isGM || message.isAuthor) && message.isContentVisible;
            },
            callback: li => {
                const message = game.messages.get(li.data("messageId"));
                copyToRollTNDialog(message);
            }
        },
        {
            name: "ironclaw2e.context.chatLog.copyToHighest",
            icon: '<i class="fas fa-dice-d6"></i>',
            condition: li => {
                const message = game.messages.get(li.data("messageId"));
                const type = message.getFlag("ironclaw2e", "rollType");
                // Check that the message has a roll, and is not of Highest type
                const allowed = message.isRoll && type && type === "TN";
                return allowed && (game.user.isGM || message.isAuthor) && message.isContentVisible;
            },
            callback: li => {
                const message = game.messages.get(li.data("messageId"));
                CardinalDiceRoller.copyToRollHighest(message);
            }
        },
        {
            name: "ironclaw2e.context.chatLog.rerollOne",
            icon: '<i class="fas fa-redo"></i>',
            condition: li => {
                const message = game.messages.get(li.data("messageId"));
                const rerollable = message.getFlag("ironclaw2e", "rollIntermediary") || message.getFlag("ironclaw2e", "originalRoll");
                const hasOne = message.getFlag("ironclaw2e", "hasOne");
                const type = message.getFlag("ironclaw2e", "rollType");
                // Check that the message has a roll, is rerollable either because it has the new intermediary array stored or because it is the original and has a one
                const allowed = message.isRoll && rerollable && hasOne && type !== "MINI";
                return allowed && (game.user.isGM || message.isAuthor) && message.isContentVisible;
            },
            callback: li => {
                const message = game.messages.get(li.data("messageId"));
                const type = message.getFlag("ironclaw2e", "rollType");
                const targetNumber = message.getFlag("ironclaw2e", "targetNumber");
                if (type === "TN") {
                    CardinalDiceRoller.copyToRollTN(targetNumber, message, true, "ONE");
                } else {
                    CardinalDiceRoller.copyToRollHighest(message, true, "ONE");
                }
            }
        },
        {
            name: "ironclaw2e.context.chatLog.rerollDialog",
            icon: '<i class="fas fa-redo"></i>',
            condition: li => {
                const message = game.messages.get(li.data("messageId"));
                const rerollable = message.getFlag("ironclaw2e", "rollIntermediary");
                const hasOne = message.getFlag("ironclaw2e", "hasOne");
                const statsUsed = message.getFlag("ironclaw2e", "usedActorStats");
                const actor = getSpeakerActor();
                const usableRerolls = actor ? actor.getGiftRerollTypes?.(statsUsed, hasOne, message.isAuthor, false)?.size > 0 : game.user.isGM;
                const type = message.getFlag("ironclaw2e", "rollType");
                // Check that the message has a roll, is rerollable because it has the new intermediary array stored, and either that the current selected actor has rerolls or the user is a GM
                const allowed = message.isRoll && rerollable && usableRerolls && type !== "MINI";
                return allowed && message.isContentVisible;
            },
            callback: li => {
                const message = game.messages.get(li.data("messageId"));
                const actor = getSpeakerActor();
                rerollDialog(message, actor);
            }
        }, // Combat roll context options
        {
            name: "ironclaw2e.context.chatLog.showAttack",
            icon: '<i class="fas fa-fist-raised"></i>',
            condition: li => {
                const message = game.messages.get(li.data("messageId"));
                const active = game.settings.get("ironclaw2e", "calculateAttackEffects");
                const type = message.getFlag("ironclaw2e", "hangingAttack");
                const weaponid = message.getFlag("ironclaw2e", "hangingWeapon");
                const successes = message.getFlag("ironclaw2e", "attackSuccessCount");
                const actor = getHangingActor(message);
                // Check whether the attack effect calculation is active, the message has a roll, has a weapon id and a positive number of successes set and has explicitly been set to have a hanging normal attack
                const allowed = active && message.isRoll && weaponid && successes > 0 && type === "attack";
                return allowed && (game.user.isGM || (message.isAuthor && actor.isOwner)) && message.isContentVisible;
            },
            callback: li => {
                const message = game.messages.get(li.data("messageId"));
                const weaponid = message.getFlag("ironclaw2e", "hangingWeapon");
                const actor = getHangingActor(message);
                const weapon = actor?.items.get(weaponid) || game.items.get(weaponid);
                weapon?.resendNormalAttack?.(message);
            }
        },
        {
            name: "ironclaw2e.context.chatLog.showAttackSlaying",
            icon: '<i class="fas fa-fist-raised"></i>',
            condition: li => {
                const message = game.messages.get(li.data("messageId"));
                const active = game.settings.get("ironclaw2e", "calculateAttackEffects");
                const type = message.getFlag("ironclaw2e", "hangingAttack");
                const weaponid = message.getFlag("ironclaw2e", "hangingWeapon");
                const isslaying = message.getFlag("ironclaw2e", "hangingSlaying");
                const successes = message.getFlag("ironclaw2e", "attackSuccessCount");
                const actor = getHangingActor(message);
                // Check whether the attack effect calculation is active, the message has a roll, doesn't already have slaying, has a weapon id and a positive number of successes set and has explicitly been set to have a hanging normal attack
                const allowed = active && message.isRoll && !isslaying && weaponid && successes > 0 && type === "attack";
                return allowed && (message.isAuthor && actor.isOwner) && message.isContentVisible;
            },
            callback: li => {
                const message = game.messages.get(li.data("messageId"));
                const weaponid = message.getFlag("ironclaw2e", "hangingWeapon");
                const actor = getHangingActor(message);
                const weapon = actor?.items.get(weaponid) || game.items.get(weaponid);
                weapon?.resendNormalAttack?.(message, true);
            }
        },
        {
            name: "ironclaw2e.context.chatLog.resolveCounter",
            icon: '<i class="fas fa-fist-raised"></i>',
            condition: li => {
                const message = game.messages.get(li.data("messageId"));
                const active = game.settings.get("ironclaw2e", "calculateAttackEffects");
                const type = message.getFlag("ironclaw2e", "hangingAttack");
                const weaponid = message.getFlag("ironclaw2e", "hangingWeapon");
                const actor = getHangingActor(message);
                // Check whether the attack effect calculation is active, the message has a roll, has a weapon id set and has explicitly been set to have a hanging counter-attack
                const allowed = active && message.isRoll && weaponid && type === "counter";
                return allowed && (message.isAuthor && actor.isOwner) && message.isContentVisible;
            },
            callback: li => {
                const message = game.messages.get(li.data("messageId"));
                const weaponid = message.getFlag("ironclaw2e", "hangingWeapon");
                const actor = getHangingActor(message);
                const weapon = actor?.items.get(weaponid) || game.items.get(weaponid);
                weapon?.resolveCounterAttack?.(message);
            }
        },
        {
            name: "ironclaw2e.context.chatLog.resolveResist",
            icon: '<i class="fas fa-bolt"></i>',
            condition: li => {
                const message = game.messages.get(li.data("messageId"));
                const active = game.settings.get("ironclaw2e", "calculateAttackEffects");
                const type = message.getFlag("ironclaw2e", "hangingAttack");
                const weaponid = message.getFlag("ironclaw2e", "hangingWeapon");
                const successes = message.getFlag("ironclaw2e", "resistSuccessCount");
                const actor = getHangingActor(message);
                // Check whether the attack effect calculation is active, the message has a roll, has a weapon id and a positive number of successes set and has explicitly been set to have a hanging resist attack
                const allowed = active && message.isRoll && weaponid && successes > 0 && type === "resist";
                return allowed && (message.isAuthor && actor.isOwner) && message.isContentVisible;
            },
            callback: li => {
                const message = game.messages.get(li.data("messageId"));
                const weaponid = message.getFlag("ironclaw2e", "hangingWeapon");
                const actor = getHangingActor(message);
                const weapon = actor?.items.get(weaponid) || game.items.get(weaponid);
                weapon?.resolveResistedAttack?.(message);
            }
        },
        {
            name: "ironclaw2e.context.chatLog.resolveAsNormal",
            icon: '<i class="fas fa-fist-raised"></i>',
            condition: li => {
                const message = game.messages.get(li.data("messageId"));
                const active = game.settings.get("ironclaw2e", "calculateAttackEffects");
                const type = message.getFlag("ironclaw2e", "hangingAttack");
                const weaponid = message.getFlag("ironclaw2e", "hangingWeapon");
                const successes = message.getFlag("ironclaw2e", "resistSuccessCount");
                const actor = getHangingActor(message);
                // Check whether the attack effect calculation is active, the message has a roll, has a weapon id and a positive number of successes set and has explicitly been set to have a hanging resist attack
                const allowed = active && message.isRoll && weaponid && successes > 0 && type === "resist";
                return allowed && (message.isAuthor && actor.isOwner) && message.isContentVisible;
            },
            callback: li => {
                const message = game.messages.get(li.data("messageId"));
                const weaponid = message.getFlag("ironclaw2e", "hangingWeapon");
                const actor = getHangingActor(message);
                const weapon = actor?.items.get(weaponid) || game.items.get(weaponid);
                weapon?.resolveAsNormalAttack?.(message);
            }
        },
        {
            name: "ironclaw2e.context.chatLog.resolveAsSlaying",
            icon: '<i class="fas fa-fist-raised"></i>',
            condition: li => {
                const message = game.messages.get(li.data("messageId"));
                const active = game.settings.get("ironclaw2e", "calculateAttackEffects");
                const type = message.getFlag("ironclaw2e", "hangingAttack");
                const weaponid = message.getFlag("ironclaw2e", "hangingWeapon");
                const isslaying = message.getFlag("ironclaw2e", "hangingSlaying");
                const successes = message.getFlag("ironclaw2e", "resistSuccessCount");
                const actor = getHangingActor(message);
                // Check whether the attack effect calculation is active, the message has a roll, doesn't already have slaying, has a weapon id and a positive number of successes set and has explicitly been set to have a hanging resist attack
                const allowed = active && message.isRoll && !isslaying && weaponid && successes > 0 && type === "resist";
                return allowed && (message.isAuthor && actor.isOwner) && message.isContentVisible;
            },
            callback: li => {
                const message = game.messages.get(li.data("messageId"));
                const weaponid = message.getFlag("ironclaw2e", "hangingWeapon");
                const actor = getHangingActor(message);
                const weapon = actor?.items.get(weaponid) || game.items.get(weaponid);
                weapon?.resolveAsNormalAttack?.(message, true);
            }
        },
        {
            name: "ironclaw2e.context.chatLog.attackAgainstDefense",
            icon: '<i class="fas fa-fist-raised"></i>',
            condition: li => {
                const message = game.messages.get(li.data("messageId"));
                const type = message.getFlag("ironclaw2e", "rollType");
                const messageid = message.getFlag("ironclaw2e", "defenseForAttack");
                const attackMessage = game.messages.get(messageid);
                // Check that the message is a roll and that the message has a callback id to the attacker's item info chat message
                const allowed = message.isRoll && attackMessage && type;
                return allowed && (game.user.isGM || attackMessage.isAuthor) && attackMessage.isContentVisible && message.isContentVisible;
            },
            callback: async li => {
                const message = game.messages.get(li.data("messageId"));
                const type = message.getFlag("ironclaw2e", "rollType");
                const messageid = message.getFlag("ironclaw2e", "defenseForAttack");
                const attackMessage = game.messages.get(messageid);
                const tn = (type === "HIGH" ? message.rolls[0].result : 3);
                const resists = (type === "TN" ? message.rolls[0].result : -1);
                Ironclaw2EActor.triggerAttackerRoll(attackMessage, "attack", false, type === "HIGH", message, tn, resists);
            }
        });
}
Hooks.on("getChatLogEntryContext", addIronclawChatLogContext);
/* eslint-enable */

/**
 * Adds the Ironclaw context menu options to the item folder directory
 * @param {any} html
 * @param {any} entryOptions The menu
 */
function addIronclawItemDirectoryFolderContext(html, entryOptions) {
    entryOptions.push(
        {
            name: "ironclaw2e.context.items.setAsSpeciesSource",
            icon: '<i class="fas fa-bullseye"></i>',
            condition: header => {
                const folder = game.folders.get(header.parent().data("folderId"));
                return game.user.isGM && folder.contents.some(x => x.type === "speciesTemplate");
            },
            callback: header => {
                const id = header.parent().data("folderId");
                game.settings.set("ironclaw2e", "templateSpeciesFolder", id);
            }
        },
        {
            name: "ironclaw2e.context.items.setAsCareerSource",
            icon: '<i class="fas fa-bullseye"></i>',
            condition: header => {
                const folder = game.folders.get(header.parent().data("folderId"));
                return game.user.isGM && folder.contents.some(x => x.type === "careerTemplate");
            },
            callback: header => {
                const id = header.parent().data("folderId");
                game.settings.set("ironclaw2e", "templateCareerFolder", id);
            }
        });
}
Hooks.on("getItemDirectoryFolderContext", addIronclawItemDirectoryFolderContext);

/**
 * Adds the Ironclaw context menu options to the item directory
 * @param {any} html
 * @param {any} entryOptions The menu
 */
function addIronclawItemDirectoryEntryContext(html, entryOptions) {
    entryOptions.push(
        {
            name: "ironclaw2e.context.items.sendToChat",
            icon: '<i class="fas fa-comment-dots"></i>',
            condition: li => {
                const id = li.data("documentId");
                return game.user.isGM && game.items.has(id);
            },
            callback: li => {
                const id = li.data("documentId");
                const item = game.items.get(id);
                if (item)
                    item.sendInfoToChat();
                else
                    ui.notifications.warn("ironclaw2e.ui.itemNotFound", { "localize": true });
            }
        });
}
Hooks.on("getItemDirectoryEntryContext", addIronclawItemDirectoryEntryContext);
