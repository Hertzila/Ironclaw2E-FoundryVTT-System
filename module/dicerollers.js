import { addArrays, findTotalDice, findTotalDiceArrays, parseSingleDiceString } from "./helpers.js";
import { getMacroSpeaker } from "./helpers.js";

import { CommonSystemInfo, specialSettingsRerollGMMap, specialSettingsRerollIntersection } from "./systeminfo.js";

/**
 * The unified dice roller system class for the Cardinal dice pool system.
 * This class holds a lot of static functions that help roll the dice in such a way as to be easily readable and useful for the Cardinal system.
 */
export class CardinalDiceRoller {

    /**
     * @typedef {{
     *   roll: Roll,
     *   highest: number,
     *   tnData: TNData|null,
     *   message: Object,
     *   isSent: boolean
     * }} DiceReturn
     */

    /**
     * @typedef {{
     *   successes: number,
     *   ties: number
     * }} TNData
     */

    /* -------------------------------------------- */
    /*  Dice Roller Variables                       */
    /* -------------------------------------------- */

    /**
     * Whether the dice are ordered by source pool (true), or by size (false)
     */
    static sourceOrderedDice = false;

    /* -------------------------------------------- */
    /*  Dice Roller Set Up Functions                */
    /* -------------------------------------------- */

    /**
     * Place to get the variables from system settings
     */
    static cardinalInitialization() {
        this.sourceOrderedDice = game.settings.get("ironclaw2e", "dicePoolsSourceOrdered");
    }

    /* -------------------------------------------- */
    /*  Dice Rolling Functions Proper               */
    /* -------------------------------------------- */

    /**
     * A common dice roller function to roll a set of dice against a target number
     * @param {number} tni Target number
     * @param {number[]} intermediary The intermediary dice array
     * @param {string} label Optional value to display some text before the result text
     * @param {Actor} rollingactor Optional value to display the roll as from a specific actor
     * @param {boolean} sendinchat Optional value, set to false for the dice roller to not send the roll message into chat, just create the data for it
     * @returns {Promise<DiceReturn>} Promise of the roll and the message object or data (depending on sendinchat, true | false) in an object
     * @protected
     */
    static async rollTargetNumber(tni, intermediary, label = "", rollingactor = null, sendinchat = true) {
        let rollstring = CardinalDiceRoller.formRollFromIntermediary(intermediary);
        if (rollstring.length === 0)
            return null;

        let roll = await new Roll("{" + rollstring + "}cs>" + tni).evaluate({ async: true });
        const typeText = game.i18n.localize("ironclaw2e.chat.rollingTN") + ": ";

        const successes = roll.total;
        let highest = 0;
        let ties = 0;
        let hasOne = false;
        // Process the roll results to get all the necessary data out
        roll.terms[0].results.forEach(x => {
            if (x.result === tni) ties++;
            if (x.result > highest) highest = x.result;
            if (x.result === 1) hasOne = true;
        });

        const flavorstring = CardinalDiceRoller.flavorStringTN(successes, ties, highest, typeText, label);

        /** @type TNData */
        let tnData = { "successes": successes, "ties": ties };

        let msg = await roll.toMessage({
            speaker: getMacroSpeaker(rollingactor),
            flavor: flavorstring,
            flags: { "ironclaw2e.rollType": "TN", "ironclaw2e.targetNumber": tni, "ironclaw2e.rollIntermediary": intermediary, "ironclaw2e.label": label, "ironclaw2e.originalRoll": true, "ironclaw2e.hasOne": hasOne }
        }, { create: sendinchat });

        return { "roll": roll, "highest": highest, "tnData": tnData, "message": msg, "isSent": sendinchat };
    };

    /**
     * Overload of sorts for the "rollTargetNumber" dice roller function, taking in a set of dice arrays instead of an intermediary
     * @param {number} tni Target number
     * @param {number[]} dicearrays A set of dice arrays to roll, five numbers corresponding to dice the amount of dice to roll, [0] = d12, [1] = d10 ... [4] = d4
     * @param {string} label Optional value to display some text before the result text
     * @param {Actor} rollingactor Optional value to display the roll as from a specific actor
     * @param {boolean} sendinchat Optional value, set to false for the dice roller to not send the roll message into chat, just create the data for it
     * @returns {Promise<DiceReturn>} Promise of the roll and the message object or data (depending on sendinchat, true | false) in an object
     */
    static async rollTargetNumberArray(tni, dicearrays, label = "", rollingactor = null, sendinchat = true) {
        const intermediary = this.intermediaryDiceTermArray(dicearrays);
        return await CardinalDiceRoller.rollTargetNumber(tni, intermediary, label, rollingactor, sendinchat);
    }

    /**
     * Copies the results of an older roll into a new one while allowing a change in the evaluation method
     * @param {number} tni Target number
     * @param {object} message Message containing the roll to copy
     * @param {boolean} sendinchat Optional value, set to false for the dice roller to not send the roll message into chat, just create the data for it
     * @param {string} rerolltype Optional value, empty string for this means the copy is a direct one, whereas some input means that there is some type of modification happening
     * @param {object} copyoptions Optional value, the object to hold options for the reroll copy function
     * @returns {Promise<DiceReturn>} Promise of the roll and the message object or data (depending on sendinchat, true | false) in an object
     */
    static async copyToRollTN(tni, message, sendinchat = true, rerolltype = "", copyoptions = {}) {
        if (!(message) || !(message.isRoll)) {
            console.warn("Somehow, a message that isn't a roll got into 'copyToRollTN'.");
            console.warn(message);
            return;
        }

        let label = message.getFlag("ironclaw2e", "label");
        if (typeof label !== "string") {
            return;
        }

        
		const usedSpeaker = (copyoptions.replacespeaker ? { "alias": (message.speaker?.alias ?? game.i18n.localize("ironclaw2e.chatInfo.miniRoll")) } : message.speaker);
        let intermediary = [...message.getFlag("ironclaw2e", "rollIntermediary")];
        let rollString = CardinalDiceRoller.copyDicePoolResult(message.rolls?.[0]);
        let directCopy = true;
        let rerollFlavor = "";
        if (rerolltype) {
            copyoptions.firstroll = { "type": "TN", "TN": tni };
            const foobar = await CardinalDiceRoller.rerollTypeSwitch(rerolltype, message, intermediary, label, usedSpeaker, copyoptions);
            rollString = foobar.rollString;
            directCopy = foobar.directCopy;
            rerollFlavor = foobar.rerollFlavor;
            label = foobar.label;
        }

        if (rollString.length === 0) {
            return;
        }

		let roll = message.rolls?.[0];
		let successes = 0;
        let highest = 0;
        let ties = 0;
        let hasOne = false;
        // Process the roll results to get all the necessary data out
        roll.terms[0].results.forEach(x => {
            if (x.result === tni) ties++;
            if (x.result > highest) highest = x.result;
            if (x.result === 1) hasOne = true;
			if (x.result > tni) successes++;
        });
		
        const flavorstring = CardinalDiceRoller.flavorStringTN(successes, ties, highest, `${(directCopy ? game.i18n.localize("ironclaw2e.chatInfo.copy") : rerollFlavor)} ${game.i18n.localize("ironclaw2e.chatInfo.tn")}:`, label);

        /** @type TNData */
        let tnData = { "successes": successes, "ties": ties };

        let msg = await roll.toMessage({
            speaker: usedSpeaker,
            flavor: flavorstring,
            flags: { "ironclaw2e.rollType": "TN", "ironclaw2e.targetNumber": tni, "ironclaw2e.rollIntermediary": intermediary, "ironclaw2e.label": label, "ironclaw2e.originalRoll": false, "ironclaw2e.hasOne": hasOne }
        }, { create: sendinchat });

        await CardinalDiceRoller.copyIronclawRollFlags(message, msg, tnData);

        return { "roll": roll, "highest": highest, "tnData": tnData, "message": msg, "isSent": sendinchat };
    }

    /**
     * A common dice roller function to roll a set of dice and take the highest one
     * @param {number[]} intermediary The intermediary dice array
     * @param {string} label Optional value to display some text before the result text
     * @param {Actor} rollingactor Optional value to display the roll as from a specific actor
     * @param {boolean} sendinchat Optional value, set to false for the dice roller to not send the roll message into chat, just create the data for it
     * @returns {Promise<DiceReturn>} Promise of the roll and the message object or data (depending on sendinchat, true | false) in an object
     * @protected
     */
    static async rollHighest(intermediary, label = "", rollingactor = null, sendinchat = true) {
        let rollstring = CardinalDiceRoller.formRollFromIntermediary(intermediary);
        if (rollstring.length === 0)
            return null;

        let roll = await new Roll("{" + rollstring + "}kh1").evaluate({ async: true });
        const typeText = game.i18n.localize("ironclaw2e.chat.rollingHighest") + ": ";
        const flavorstring = CardinalDiceRoller.flavorStringHighest(roll.total, typeText, label);

        const hasOne = roll.terms[0].results.some(x => x.result === 1); // Find if one of the dice rolled a "1"

        let msg = await roll.toMessage({
            speaker: getMacroSpeaker(rollingactor),
            flavor: flavorstring,
            flags: { "ironclaw2e.rollType": "HIGH", "ironclaw2e.targetNumber": -1, "ironclaw2e.rollIntermediary": intermediary, "ironclaw2e.label": label, "ironclaw2e.originalRoll": true, "ironclaw2e.hasOne": hasOne }
        }, { create: sendinchat });

        return { "roll": roll, "highest": roll.total, "tnData": null, "message": msg, "isSent": sendinchat };
    };

    /**
     * Overload of sorts for the "rollHighest" dice roller function, taking in a set of dice arrays instead of an intermediary
     * @param {number[]} dicearrays A set of dice arrays to roll, five numbers corresponding to dice the amount of dice to roll, [0] = d12, [1] = d10 ... [4] = d4
     * @param {string} label Optional value to display some text before the result text
     * @param {Actor} rollingactor Optional value to display the roll as from a specific actor
     * @param {boolean} sendinchat Optional value, set to false for the dice roller to not send the roll message into chat, just create the data for it
     * @returns {Promise<DiceReturn>} Promise of the roll and the message object or data (depending on sendinchat, true | false) in an object
     */
    static async rollHighestArray(dicearrays, label = "", rollingactor = null, sendinchat = true) {
        const intermediary = this.intermediaryDiceTermArray(dicearrays);
        return await CardinalDiceRoller.rollHighest(intermediary, label, rollingactor, sendinchat);
    }

    /**
     * Copies the results of an older roll into a new one while allowing a change in the evaluation method
     * @param {object} message Message containing the roll to copy
     * @param {boolean} sendinchat Optional value, set to false for the dice roller to not send the roll message into chat, just create the data for it
     * @param {string} rerolltype Optional value, empty string for this means the copy is a direct one, whereas some input means that there is some type of modification happening
     * @param {object} copyoptions Optional value, the object to hold options for the reroll copy function
     * @returns {Promise<DiceReturn>} Promise of the roll and the message object or data (depending on sendinchat, true | false) in an object
     */
    static async copyToRollHighest(message, sendinchat = true, rerolltype = "", copyoptions = {}) {
        if (!(message) || !(message.isRoll)) {
            console.warn("Somehow, a message that isn't a roll got into 'copyToRollHighest'.");
            console.warn(message);
            return;
        }

        let label = message.getFlag("ironclaw2e", "label");
        if (typeof label !== "string") {
            return;
        }

        const usedSpeaker = (copyoptions.replacespeaker ? { "alias": (message.speaker?.alias ?? game.i18n.localize("ironclaw2e.chatInfo.miniRoll")) } : message.speaker);
        let intermediary = [...message.getFlag("ironclaw2e", "rollIntermediary")];
        let rollString = CardinalDiceRoller.copyDicePoolResult(message.rolls?.[0]);
        let directCopy = true;
        let rerollFlavor = "";
        if (rerolltype) {
            copyoptions.firstroll = { "type": "HIGH", "TN": -1 };
            const foobar = await CardinalDiceRoller.rerollTypeSwitch(rerolltype, message, intermediary, label, usedSpeaker, copyoptions);
            rollString = foobar.rollString;
            directCopy = foobar.directCopy;
            rerollFlavor = foobar.rerollFlavor;
            label = foobar.label;
        }

        if (rollString.length === 0) {
            return;
        }

        //let roll = await new Roll("{" + rollString + "}kh1").evaluate({ async: true });
		let roll = message.rolls?.[0];
		let highest = 0;
		
		roll.terms[0].results.forEach(x => {
		    if (x.result > highest) highest = x.result;
		});
		
        const flavorstring = CardinalDiceRoller.flavorStringHighest(highest, `${(directCopy ? game.i18n.localize("ironclaw2e.chatInfo.copy") : rerollFlavor)} ${game.i18n.localize("ironclaw2e.chatInfo.high")}:`, label);

        const hasOne = roll.terms[0].results.some(x => x.result === 1); // Find if one of the dice "rolled" a "1"

        let msg = await roll.toMessage({
            speaker: usedSpeaker,
            flavor: flavorstring,
            flags: { "ironclaw2e.rollType": "HIGH", "ironclaw2e.targetNumber": -1, "ironclaw2e.rollIntermediary": intermediary, "ironclaw2e.label": label, "ironclaw2e.originalRoll": false, "ironclaw2e.hasOne": hasOne }
        }, { create: sendinchat });

        await CardinalDiceRoller.copyIronclawRollFlags(message, msg);

        return { "roll": roll, "highest": highest, "tnData": null, "message": msg, "isSent": sendinchat };
    }

    /**
     * A mini dice roller function meant for the internal reroll system to reroll specific dice separately of the main roll
     * @param {number[]} rollstring The roll string to use for the mini-roll
     * @param {number[]} intermediary The intermediary dice array, mostly for storing it in the roll flags
     * @param {string} reason The reason shown for the mini-roll
     * @param {string} rolltype The roll type this mini-roll will be for, either 'HIGH' or 'TN'
     * @param {number} tni The target number used for the roll, if a TN type
     * @param {Object} chatspeaker Optional value to get the speaker for the chat message from a preset value
     * @param {boolean} sendinchat Optional value, set to false for the dice roller to not send the roll message into chat, just create the data for it
     * @param {boolean} picklowest Optional value, set to true to actually get the lowest value from the given roll, rather than the highest, the 'highest' value returned will actually be the lowest
     * @param {boolean} playsound Optional value, set to false to disable the sound for the roll
     * @returns {Promise<DiceReturn>} Promise of the roll and the message object or data (depending on sendinchat, true | false) in an object
     * @protected
     */
    static async miniRoll(rollstring, intermediary, reason, rolltype, tni = -1, chatspeaker = null, sendinchat = true, picklowest = false, playsound = true) {
        if (rollstring.length === 0) {
            rollstring = CardinalDiceRoller.formRollFromIntermediary(intermediary);
            if (rollstring.length === 0)
                return null;
        }

        const useTN = rolltype === "TN" && tni > 0;
        const rollEval = useTN ? "}cs>" + tni.toString() : (picklowest ? "}kl1" : "}kh1");
        let roll = await new Roll("{" + rollstring + rollEval).evaluate({ async: true });

        let successes = 0;
        let highest = 0;
        let ties = 0;
        let hasOne = false;
        if (useTN) {
            // Process the roll results to get all the necessary data out
            successes = roll.total;
            roll.terms[0].results.forEach(x => {
                if (x.result === tni) ties++;
                if (x.result > highest) highest = x.result;
                if (x.result === 1) hasOne = true;
            });
        } else {
            hasOne = roll.terms[0].results.some(x => x.result === 1); // Find if one of the dice "rolled" a "1"
        }

        const typeText = game.i18n.format("ironclaw2e.chatInfo.miniRollFor", { "reason": reason });
        const flavorstring = useTN ? CardinalDiceRoller.flavorStringTN(successes, ties, highest, typeText, "") :
            (picklowest ? CardinalDiceRoller.flavorStringLowest(roll.total, typeText, "") : CardinalDiceRoller.flavorStringHighest(roll.total, typeText, ""));

        /** @type TNData */
        let tnData = useTN ? { "successes": successes, "ties": ties } : null;

        let messageData = {
            speaker: chatspeaker ?? getMacroSpeaker(null),
            flavor: flavorstring,
            flags: { "ironclaw2e.rollType": "MINI", "ironclaw2e.targetNumber": useTN ? tni : -1, "ironclaw2e.rollIntermediary": intermediary, "ironclaw2e.label": "", "ironclaw2e.originalRoll": false, "ironclaw2e.hasOne": hasOne }
        };
        if (playsound === false) messageData.sound = null;
        let msg = await roll.toMessage(messageData, { create: sendinchat });

        return { "roll": roll, "highest": roll.total, "tnData": tnData, "message": msg, "isSent": sendinchat };
    }

    /* -------------------------------------------- */
    /*  Helpers                                     */
    /* -------------------------------------------- */

    /**
     * Helper function to parse a bunch of dice arrays into the wanted format, based on game settings
     * @param {[number[]] | number[]} dicearrays
     * @returns {number[]} Intermediary dice term array, each number corresponding to a die type that is finally parsed into the Foundry roller; 0 = d12, 1 = d10 ... 4 = d4
     */
    static intermediaryDiceTermArray(dicearrays) {
        if (dicearrays.length === 0) {
            return [];
        }
        // If source ordered dice is disabled, or the dicearrays given is just a singular dice array
        if (this.sourceOrderedDice === false || typeof (dicearrays[0]) === "number") {
            // Check that it's one actual dice array
            if (typeof (dicearrays[0]) === "number" && dicearrays.length === 5) {
                // Parse the one pool into an intermediary and return it
                return this.formIntermediaryFromPool(dicearrays);
            }
            // Check that the dice arrays are an actual array of arrays
            else if (Array.isArray(dicearrays[0])) {
                let foo = [0, 0, 0, 0, 0];
                for (let pool of dicearrays) {
                    if (pool?.length === 5) { // One final check to make sure the length is right
                        // Add the pool to the temporary processing pool
                        foo = addArrays(foo, pool);
                    } else {
                        console.error("Something other than a dice pool array got into the dice pool parser: " + pool);
                    }
                }
                // Process and return the temp pool
                return this.formIntermediaryFromPool(foo);
            }
        } else if (this.sourceOrderedDice === true) {
            let foo = [];
            for (let pool of dicearrays) {
                if (pool?.length === 5) { // One final check to make sure the length is right
                    // Process the pool and add it to the intermediary array
                    foo = foo.concat(this.formIntermediaryFromPool(pool));
                } else {
                    console.error("Something other than a dice pool array got into the dice pool parser: " + pool);
                }
            }
            // Return the processed array
            return foo;
        }

        // Essentially a default, should never really happen
        console.warn("The intermediary dice pool parsing essentially defaulted:" + dicearrays);
        return [];
    }

    /**
     * Helper function to process a dice pool array into an intermediary dice term array
     * @param {number[]} dicearray The dice array to roll, five numbers corresponding to dice the amount of dice to roll; [0] = d12, [1] = d10 ... [4] = d4
     * @returns {number[]} Intermediary dice term array, each number corresponding to a die type that is finally parsed into the Foundry roller; 0 = d12, 1 = d10 ... 4 = d4
     * @private
     */
    static formIntermediaryFromPool(dicearray) {
        let intermediary = [];
        for (let i = 0; i < dicearray[0]; i++) {
            intermediary.push(0);
        }
        for (let i = 0; i < dicearray[1]; i++) {
            intermediary.push(1);
        }
        for (let i = 0; i < dicearray[2]; i++) {
            intermediary.push(2);
        }
        for (let i = 0; i < dicearray[3]; i++) {
            intermediary.push(3);
        }
        for (let i = 0; i < dicearray[4]; i++) {
            intermediary.push(4);
        }
        return intermediary;
    };

    /**
     * Helper function for the dice rollers to form the dice for the roll command properly
     * @param {number[] | number} intermediary The intermediary dice array, or a single intermediary term number to get the die string version for
     * @param {boolean} leavecomma Whether to leave the trailing comma in place or not
     * @returns {string} Properly set-up string to give to a Roll
     * @private
     */
    static formRollFromIntermediary(intermediary, leavecomma = false) {
        // Convert a number into an actual array for processing
        const inters = Array.isArray(intermediary) ? intermediary : [intermediary];
        let rollstring = "";
        for (let term of inters) {
            switch (term) {
                case 0:
                    rollstring += "d12,";
                    break;
                case 1:
                    rollstring += "d10,";
                    break;
                case 2:
                    rollstring += "d8,";
                    break;
                case 3:
                    rollstring += "d6,";
                    break;
                case 4:
                    rollstring += "d4,";
                    break;
                default:
                    break;
            }
        }
        if (!leavecomma && rollstring.length > 0) {
            // Remove trailing comma
            rollstring = rollstring.slice(0, -1);
        }
        return rollstring;
    };

    /**
     * Helper function for the target number dice rollers to form the chat message flavor text properly
     * @param {number} successes The number of successes for the roll
     * @param {number} ties The number of ties for the roll
     * @param {number} highest The highest die result for the roll
     * @param {string} label Label to put in front of the dice results
     * @param {string} typetext The text clarifying what type of roll this is
     * @returns {string} The formed flavor string
     * @private
     */
    static flavorStringTN(successes, ties, highest, typetext, label) {
        const botched = highest === 1; // Whether the roll was botched based on whether the highest-showing die is 1
        if (successes > 0) {
            // Check to make sure typetext and label each have stuff, then check if there's already HTML paragraph tags at the start and end
            return (typetext?.length > 0 ? (typetext.startsWith("<p>") && typetext.endsWith("</p>") ? typetext : "<p>" + typetext + "</p>") : "") +
                (label?.length > 0 ? (label.startsWith("<p>") && label.endsWith("</p>") ? label : "<p>" + label + "</p>") : "") +
                `<p style="font-size:${CommonSystemInfo.resultFontSize};margin-bottom:${CommonSystemInfo.resultTNMarginSize};color:${CommonSystemInfo.resultColors.success}">${game.i18n.format("ironclaw2e.chat.success", { "successes": successes })}</p>` +
                CardinalDiceRoller.flavorStringHighest(highest, "", "", true);
        }
        else {
            if (botched) {
                return (typetext?.length > 0 ? (typetext.startsWith("<p>") && typetext.endsWith("</p>") ? typetext : "<p>" + typetext + "</p>") : "") +
                    (label?.length > 0 ? (label.startsWith("<p>") && label.endsWith("</p>") ? label : "<p>" + label + "</p>") : "") +
                    `<p style="font-size:${CommonSystemInfo.resultFontSize};color:${CommonSystemInfo.resultColors.botch}">${game.i18n.localize("ironclaw2e.chat.botch")}</p>`;
            }
            else if (ties > 0) {
                return (typetext?.length > 0 ? (typetext.startsWith("<p>") && typetext.endsWith("</p>") ? typetext : "<p>" + typetext + "</p>") : "") +
                    (label?.length > 0 ? (label.startsWith("<p>") && label.endsWith("</p>") ? label : "<p>" + label + "</p>") : "") +
                    `<p style="font-size:${CommonSystemInfo.resultFontSize};margin-bottom:${CommonSystemInfo.resultTNMarginSize};color:${CommonSystemInfo.resultColors.tie}">${game.i18n.format("ironclaw2e.chat.tie", { "ties": ties })}</p>` +
                    CardinalDiceRoller.flavorStringHighest(highest, "", "", true);
            }
            else {
                return (typetext?.length > 0 ? (typetext.startsWith("<p>") && typetext.endsWith("</p>") ? typetext : "<p>" + typetext + "</p>") : "") +
                    (label?.length > 0 ? (label.startsWith("<p>") && label.endsWith("</p>") ? label : "<p>" + label + "</p>") : "") +
                    `<p style="font-size:${CommonSystemInfo.resultFontSize};margin-bottom:${CommonSystemInfo.resultTNMarginSize};color:${CommonSystemInfo.resultColors.failure}">${game.i18n.localize("ironclaw2e.chat.failure")}</p>` +
                    CardinalDiceRoller.flavorStringHighest(highest, "", "", true);
            }
        }
    }

    /**
     * Helper function for the highest dice rollers to form the chat message flavor text properly
     * @param {number} highest The highest die result for the roll
     * @param {string} label Label to put in front of the dice results
     * @param {string} typetext The text clarifying what type of roll this is
     * @param {boolean} small Whether to ask for the small version of the string
     * @returns {string} The formed flavor string
     * @private
     */
    static flavorStringHighest(highest, typetext, label, small = false) {
        return (typetext?.length > 0 ? (typetext.startsWith("<p>") && typetext.endsWith("</p>") ? typetext : "<p>" + typetext + "</p>") : "") +
            (label?.length > 0 ? (label.startsWith("<p>") && label.endsWith("</p>") ? label : "<p>" + label + "</p>") : "") +
            (small ? `<p style="font-size:${CommonSystemInfo.resultSmallFontSize};margin-top:0px;` : `<p style="font-size:${CommonSystemInfo.resultFontSize};`) + `
    color:${(highest > 1 ? CommonSystemInfo.resultColors.normal : CommonSystemInfo.resultColors.botch)}">${game.i18n.format("ironclaw2e.chat.highest", { "highest": highest })}</p>`;
    }

    /**
     * Helper function for the lowest dice rollers to form the chat message flavor text properly 
     * This is used basically just for luck rerolls to pick the lowest die possible
     * @param {number} lowest The lowest die result for the roll
     * @param {string} label Label to put in front of the dice results
     * @param {string} typetext The text clarifying what type of roll this is
     * @param {boolean} small Whether to ask for the small version of the string
     * @returns {string} The formed flavor string
     * @private
     */
    static flavorStringLowest(lowest, typetext, label, small = false) {
        return (typetext?.length > 0 ? (typetext.startsWith("<p>") && typetext.endsWith("</p>") ? typetext : "<p>" + typetext + "</p>") : "") +
            (label?.length > 0 ? (label.startsWith("<p>") && label.endsWith("</p>") ? label : "<p>" + label + "</p>") : "") +
            (small ? `<p style="font-size:${CommonSystemInfo.resultSmallFontSize};margin-top:0px;` : `<p style="font-size:${CommonSystemInfo.resultFontSize};`) + `
    color:${(lowest > 1 ? CommonSystemInfo.resultColors.normal : CommonSystemInfo.resultColors.botch)}">${game.i18n.format("ironclaw2e.chat.lowest", { "lowest": lowest })}</p>`;
    }

    /**
     * Helper to pick the correct setups for different reroll types
     * @param {string} reroll The type given: "ONE" means reroll a one
     * @param {Object} message Message containing the roll to copy
     * @param {number[]} intermediary The intermediary dice array
     * @param {string} label The label used for the roll message
     * @param {Object} speaker The speaker used for potential mini-rolls
     * @param {boolean} [favorreroll] Whether a favored roll will also reroll a one at the same time
     * @param {number} [luckindex] What index the luck is rerolling
     * @param {boolean} [luckhigh] Whether the luck uses the highest or lowest roll
     * @param {object} [firstroll] The data about the original roll
     */
    static async rerollTypeSwitch(reroll, message, intermediary, label, speaker, { identifieroverride = "", favorreroll = false, luckindex = -1, luckhigh = true, firstroll = {} } = {}) {
        let rollString = "";
        let directCopy = true;
        let rerollFlavor = "";
        let rollUsed = message.rolls?.[0];
        switch (reroll) {
            case "ONE":
                rollString = CardinalDiceRoller.copyRerollHighestOne(rollUsed, intermediary);
                directCopy = false;
                rerollFlavor = identifieroverride ? identifieroverride + "," : game.i18n.localize("ironclaw2e.chatInfo.reroll");
                break;
            case "FAVOR":
                intermediary.unshift(0);
                rollString = CardinalDiceRoller.copyResultToIntermediary(rollUsed, intermediary, 1); // Get the favor roll string now, it'll be used either for the mini-roll or for the main reroll
                directCopy = false;
                if (label && label.includes(":")) { // To append the Favor Bonus note to the correct position, a bit hacky but it works
                    label = label.replace(":", ": " + game.i18n.localize("ironclaw2e.chatInfo.favorBonus") + " +");
                }
                if (favorreroll) { // To reroll the one at the same time
                    rerollFlavor = game.i18n.localize("ironclaw2e.chatInfo.favor") + " + " + game.i18n.localize("ironclaw2e.chatInfo.reroll");
                    const miniRoll = await CardinalDiceRoller.miniRoll(rollString, intermediary, game.i18n.localize("ironclaw2e.chatInfo.favor"), firstroll.type, firstroll.TN, speaker, true, false, false);
                    rollString = CardinalDiceRoller.copyRerollHighestOne(miniRoll.roll, intermediary);
                } else { // To simply add a favor bonus
                    rerollFlavor = identifieroverride ? identifieroverride + "," : game.i18n.localize("ironclaw2e.chatInfo.favor");
                }
                break;
            case "KNACK":
                rollString = CardinalDiceRoller.formRollFromIntermediary(intermediary);
                directCopy = false;
                rerollFlavor = identifieroverride ? identifieroverride + "," : game.i18n.localize("ironclaw2e.chatInfo.knack");
                break;
            case "LUCK":
                rollString = CardinalDiceRoller.copyRerollLuckDie(rollUsed, intermediary, luckindex, luckhigh);
                directCopy = false;
                rerollFlavor = identifieroverride ? identifieroverride + "," : (luckhigh ? game.i18n.localize("ironclaw2e.chatInfo.luckHighest") : game.i18n.localize("ironclaw2e.chatInfo.luckLowest"));
                break;
            case "KEEN":
                rollString = CardinalDiceRoller.copyRemoveHighest(rollUsed, intermediary);
                directCopy = false;
                rerollFlavor = identifieroverride ? identifieroverride + "," : game.i18n.localize("ironclaw2e.chatInfo.keen");
                break;
        }

        return { rollString, directCopy, rerollFlavor, rollUsed, label };
    }

    /**
     * Helper function for the dice roller copy functions to turn the dice results of the copied roll into numbers
     * @param {Roll} roll The roll to be copied
     * @returns {string} A new formula to use for the new copy roll
     * @private
     */
    static copyDicePoolResult(roll) {
        let formula = "";
        if (!roll) {
            console.warn("A non-existant roll was given to the copy function");
            return formula;
        }

        if (roll.terms.length === 0) {
            console.warn("A roll with zero terms given to a copy function");
            return formula;
        }

        roll.terms[0].results.forEach(x => {
            formula += x.result.toString() + ",";
        });
        if (formula.length > 0) {
            // Remove the trailing comma
            formula = formula.slice(0, -1);
        }

        return formula;
    }

    /**
     * Helper function to partially override a dice pool with existing roll data
     * If the skip dice is not set above zero, the function will have equivalent output to copyDicePoolResult
     * @param {Roll} roll The roll to be copied
     * @param {number[]} intermediary The original intermediary dice term array, used to figure out what die should get rerolled
     * @param {number} skipdice The index from which the roll will be copied over the intermediary, essentially, how many indices are skipped over until the copying starts
     * @returns {string} A new formula to use for the new copy roll
     * @private
     */
    static copyResultToIntermediary(roll, intermediary, skipdice, { ignoreextra = true } = {}) {
        let formula = "";
        if (roll.terms.length === 0) {
            console.warn("A roll with zero terms given to a copy function");
            return formula;
        }
        const skipping = (skipdice > 0 ? skipdice : 0);
        const results = roll.terms[0].results;
        // Check what the maximum iteration amount it, either based completely on intermediary length, or using either intermediary length or the results length plus skipping amount
        const max = (ignoreextra ? intermediary.length : (intermediary.length > results.length + skipping ? intermediary.length : results.length + skipping));

        for (let i = 0; i < max; ++i) {
            // If the result is over the skipping limit, and the resulting index is within the results limits, copy it from the roll
            if (i >= skipping && (i - skipping < results.length && i - skipping >= 0)) {
                formula += results[i - skipping].result.toString() + ",";
            } else if (i < intermediary.length) {
                // Otherwise, if the index is within intermediary's limits, copy it from the intermediary
                formula += this.formRollFromIntermediary(intermediary[i], true);
            }

        }
        if (formula.length > 0) {
            // Remove the trailing comma
            formula = formula.slice(0, -1);
        }

        return formula;
    }

    /**
     * Helper function for the dice roller copy functions to reroll one "1" and copy the rest of the dice results as numbers
     * @param {Roll} roll The roll to be checked for ones
     * @param {number[]} intermediary The original intermediary dice term array, used to figure out what die should get rerolled
     * @returns {string} A new formula to use for the new copy roll, with the highest "1" as a die to be rolled
     * @private
     */
    static copyRerollHighestOne(roll, intermediary) {
        // The recreated formula
        let formula = "";
        if (!roll) {
            console.warn("A non-existant roll was given to the reroll one function");
            return formula;
        }

        if (roll.terms.length === 0) {
            console.warn("A roll with zero terms given to the reroll one function");
            return formula;
        }
        // The size of the one found, the index of the found one
        let onefound = -1, foundone = -1;

        // Find the highest found one
        roll.terms[0].results.forEach((x, i) => {
            if (x.result === 1) {
                if (intermediary) {
                    // New version with an intermediary array
                    if (foundone < 0) {
                        onefound = intermediary[i];
                        foundone = i;
                    } else if (intermediary[i] < onefound) {
                        onefound = intermediary[i];
                        foundone = i;
                    }
                } else {
                    // Legacy for support
                    const die = parseSingleDiceString(roll.terms[0].terms[1]);
                    if (foundone < 0) {
                        onefound = dieindex;
                        foundone = i;
                    } else if (die[1] > onefound) {
                        onefound = dieindex;
                        foundone = i;
                    }
                }
            }
        });
        // Replace the highest found one with its actual die
        roll.terms[0].results.forEach((x, i) => {
            if (i === foundone) {
                if (intermediary)
                    formula += this.formRollFromIntermediary(intermediary[i], true);
                else
                    formula += roll.terms[0].terms[i] + ",";
            } else {
                formula += x.result.toString() + ",";
            }
        });
        if (formula.length > 0) {
            // Remove the trailing comma
            formula = formula.slice(0, -1);
        }

        return formula;
    }

    /**
     * Helper function to form a new roll string for a Luck reroll
     * @param {Roll} roll The roll to be checked for ones
     * @param {number[]} intermediary The original intermediary dice term array, used to figure out what die should get rerolled
     * @param {number} luckdie Index of the die to be lucked
     * @param {boolean} highest Whether to pick the highest, or the lowest
     * @returns {string} A new formula to use for the new copy roll, with the highest "1" as a die to be rolled
     * @private
     */
    static copyRerollLuckDie(roll, intermediary, luckdie, highest = true) {
        // The new formula
        let formula = "";
        if (roll.terms.length === 0) {
            console.warn("A roll with zero terms given to a copy function");
            return formula;
        }
        if (!intermediary) {
            console.error("A luck reroll attempted on a dice roll with no intermediary saved!");
            return formula;
        }
        if (luckdie < 0) {
            console.error("A luck reroll attempted without specifying luck index!");
            return formula;
        }

        // Replace the lucked die with two new rolls
        roll.terms[0].results.forEach((x, i) => {
            if (i === luckdie) {
                formula += `{${this.formRollFromIntermediary(intermediary[i], false)},${this.formRollFromIntermediary(intermediary[i], false)},${x.result.toString()}}${highest ? "kh1" : "kl1"},`;
            } else {
                formula += x.result.toString() + ",";
            }
        });
        if (formula.length > 0) {
            // Remove the trailing comma
            formula = formula.slice(0, -1);
        }

        return formula;

    }

    /**
     * Helper function for the dice roller copy functions to reroll one "1" and copy the rest of the dice results as numbers
     * @param {Roll} roll The roll to be checked for ones
     * @param {number[]} intermediary The original intermediary dice term array, used to figure out what die should get rerolled
     * @returns {string} A new formula to use for the new copy roll, with the highest "1" as a die to be rolled
     * @private
     */
    static copyRemoveHighest(roll, intermediary) {
        // The recreated formula
        let formula = "";
        if (!roll) {
            console.warn("A non-existant roll was given to the remove highest function");
            return formula;
        }

        if (roll.terms.length === 0) {
            console.warn("A roll with zero terms given to the remove highest function");
            return formula;
        }
        // The number of the highest result found, the index of the found die
        let highestfound = -1, highestindex = -1;

        // Find the highest die
        roll.terms[0].results.forEach((x, i) => {
            if (highestfound < x.result) {
                highestfound = x.result;
                highestindex = i;
            }
        });
        // Copy the roll with the exception of the ignored die
        roll.terms[0].results.forEach((x, i) => {
            if (i !== highestindex) {
                formula += x.result.toString() + ",";
            }
        });
        if (formula.length > 0) {
            // Remove the trailing comma
            formula = formula.slice(0, -1);
        }

        return formula;
    }

    /**
     * Helper function for the dice roller to copy roll flags to the copied rolls
     * @param {Message} origin The message to copy the flags from
     * @param {Message} target The message to copy the flags to
     * @param {TNData} tndata The TN Data to use to replace the recorded successes and success state for the relevant roll, if empty those will not be copied
     * @private
     */
    static async copyIronclawRollFlags(origin, target, tndata = null) {
        if (!origin || !target) {
            return;
        }

        const hangingType = origin.getFlag("ironclaw2e", "hangingAttack");
        const defenseAttack = origin.getFlag("ironclaw2e", "defenseForAttack");
        const usedActorStats = origin.getFlag("ironclaw2e", "usedActorStats");
        let updatedata = {
            "flags": {}
        };

        if (hangingType) {
            updatedata.flags = mergeObject(updatedata.flags, {
                "ironclaw2e.hangingAttack": hangingType, "ironclaw2e.hangingWeapon": origin.getFlag("ironclaw2e", "hangingWeapon"), "ironclaw2e.hangingActor": origin.getFlag("ironclaw2e", "hangingActor"),
                "ironclaw2e.hangingToken": origin.getFlag("ironclaw2e", "hangingToken"), "ironclaw2e.hangingScene": origin.getFlag("ironclaw2e", "hangingScene"), "ironclaw2e.hangingSlaying": origin.getFlag("ironclaw2e", "hangingSlaying")
            });

            if (tndata) {
                const successes = (isNaN(tndata.successes) ? 0 : tndata.successes);
                const ties = (isNaN(tndata.ties) ? 0 : tndata.ties);
                const success = successes > 0;
                const usedsuccesses = (success ? successes : ties);

                if (hangingType === "attack") {
                    updatedata.flags = mergeObject(updatedata.flags, { "ironclaw2e.attackSuccess": success, "ironclaw2e.attackSuccessCount": usedsuccesses });
                } else if (hangingType === "resist") {
                    updatedata.flags = mergeObject(updatedata.flags, { "ironclaw2e.resistSuccess": success, "ironclaw2e.resistSuccessCount": usedsuccesses });
                }
            }
        }
        if (defenseAttack) {
            updatedata.flags = mergeObject(updatedata.flags, { "ironclaw2e.defenseForAttack": defenseAttack });
        }
        if (usedActorStats) {
            updatedata.flags = mergeObject(updatedata.flags, { "ironclaw2e.usedActorStats": usedActorStats });
        }

        await target.update(updatedata);
    }
}


/* -------------------------------------------- */
/*  Dialog Macros                               */
/* -------------------------------------------- */
/* eslint-disable */

/**
 * Dialog macro function for a target number roll that displays a separate input field for every dice type
 * No inputs need to actually be given, but default values can be inputted
 * @param {number} tn Target number for the roll
 * @param {number} d12s Number of d12 dice
 * @param {number} d10s Number of d10 dice
 * @param {number} d8s Number of d8 dice
 * @param {number} d6s Number of d6 dice
 * @param {number} d4s Number of d4 dice
 * @param {string} label The label given to the roll function to display in the chat message
 * @param {string} rolltitle The title shown as the dialog's purpose, translated if one is found
 * @param {Actor} rollingactor The actor for which the roll is for
 * @returns {Promise<DiceReturn> | Promise<null>} Promise of the roll data in an object, or null if cancelled
 */
export async function rollTargetNumberDialog(tn = 3, d12s = 0, d10s = 0, d8s = 0, d6s = 0, d4s = 0, label = "", rolltitle = "", rollingactor = null) {
    let confirmed = false;
    const usetranslation = !rolltitle || game.i18n.has(rolltitle); // Use translations if either rolltitle does not exist, or it exists and has a translation equivalent
    let speaker = getMacroSpeaker(rollingactor);
    let resolvedroll = new Promise((resolve) => {
        let dlog = new Dialog({
            title: usetranslation ? game.i18n.format(rolltitle || "ironclaw2e.dialog.macroDefault.titleTN", { "name": speaker.alias }) : speaker.alias + ": " + rolltitle,
            content: `
     <form class="ironclaw2e">
      <div class="form-group">
       <label>${game.i18n.localize("ironclaw2e.dialog.macroDefault.targetNumber")}:</label>
	   <input type="text" id="tn" name="tn" value="${tn.toString()}" onfocus="this.select();"></input>
      </div>
      <div class="form-group">
       <label>${game.i18n.localize("ironclaw2e.dialog.macroDefault.d12Dice")}:</label>
	   <input type="text" id="d12s" name="d12s" value="${d12s != 0 ? d12s.toString() : ""}" onfocus="this.select();"></input>
      </div>
	  <div class="form-group">
       <label>${game.i18n.localize("ironclaw2e.dialog.macroDefault.d10Dice")}:</label>
	   <input type="text" id="d10s" name="d10s" value="${d10s != 0 ? d10s.toString() : ""}" onfocus="this.select();"></input>
      </div>
	  <div class="form-group">
       <label>${game.i18n.localize("ironclaw2e.dialog.macroDefault.d8Dice")}:</label>
	   <input type="text" id="d8s" name="d8s" value="${d8s != 0 ? d8s.toString() : ""}" onfocus="this.select();"></input>
      </div>
	  <div class="form-group">
       <label>${game.i18n.localize("ironclaw2e.dialog.macroDefault.d6Dice")}:</label>
	   <input type="text" id="d6s" name="d6s" value="${d6s != 0 ? d6s.toString() : ""}" onfocus="this.select();"></input>
      </div>
	  <div class="form-group">
       <label>${game.i18n.localize("ironclaw2e.dialog.macroDefault.d4Dice")}:</label>
	   <input type="text" id="d4s" name="d4s" value="${d4s != 0 ? d4s.toString() : ""}" onfocus="this.select();"></input>
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
            render: html => { document.getElementById("tn").focus(); },
            close: html => {
                if (confirmed) {
                    let TNSS = html.find('[name=tn]')[0].value;
                    let TN = 0; if (TNSS.length > 0) TN = parseInt(TNSS);
                    let D12SS = html.find('[name=d12s]')[0].value;
                    let D12S = 0; if (D12SS.length > 0) D12S = parseInt(D12SS);
                    let D10SS = html.find('[name=d10s]')[0].value;
                    let D10S = 0; if (D10SS.length > 0) D10S = parseInt(D10SS);
                    let D8SS = html.find('[name=d8s]')[0].value;
                    let D8S = 0; if (D8SS.length > 0) D8S = parseInt(D8SS);
                    let D6SS = html.find('[name=d6s]')[0].value;
                    let D6S = 0; if (D6SS.length > 0) D6S = parseInt(D6SS);
                    let D4SS = html.find('[name=d4s]')[0].value;
                    let D4S = 0; if (D4SS.length > 0) D4S = parseInt(D4SS);
                    resolve(CardinalDiceRoller.rollTargetNumberArray(TN, [D12S, D10S, D8S, D6S, D4S], label, rollingactor));
                } else {
                    resolve(null);
                }
            }
        }, { focus: false });
        dlog.render(true);
    });
    return await resolvedroll;
}

/**
 * Dialog macro function for a highest roll that displays a separate input field for every dice type
 * No inputs need to actually be given, but default values can be inputted
 * @param {number} d12s Number of d12 dice
 * @param {number} d10s Number of d10 dice
 * @param {number} d8s Number of d8 dice
 * @param {number} d6s Number of d6 dice
 * @param {number} d4s Number of d4 dice
 * @param {string} label The label given to the roll function to display in the chat message
 * @param {string} rolltitle The title shown as the dialog's purpose, translated if one is found
 * @param {Actor} rollingactor The actor for which the roll is for
 * @returns {Promise<DiceReturn> | Promise<null>} Promise of the roll data in an object, or null if cancelled
 */
export async function rollHighestDialog(d12s = 0, d10s = 0, d8s = 0, d6s = 0, d4s = 0, label = "", rolltitle = "", rollingactor = null) {
    let confirmed = false;
    const usetranslation = !rolltitle || game.i18n.has(rolltitle); // Use translations if either rolltitle does not exist, or it exists and has a translation equivalent
    let speaker = getMacroSpeaker(rollingactor);
    let resolvedroll = new Promise((resolve) => {
        let dlog = new Dialog({
            title: usetranslation ? game.i18n.format(rolltitle || "ironclaw2e.dialog.macroDefault.titleHighest", { "name": speaker.alias }) : speaker.alias + ": " + rolltitle,
            content: `
     <form class="ironclaw2e">
      <div class="form-group">
       <label>${game.i18n.localize("ironclaw2e.dialog.macroDefault.d12Dice")}:</label>
	   <input type="text" id="d12s" name="d12s" value="${d12s != 0 ? d12s.toString() : ""}" onfocus="this.select();"></input>
      </div>
	  <div class="form-group">
       <label>${game.i18n.localize("ironclaw2e.dialog.macroDefault.d10Dice")}:</label>
	   <input type="text" id="d10s" name="d10s" value="${d10s != 0 ? d10s.toString() : ""}" onfocus="this.select();"></input>
      </div>
	  <div class="form-group">
       <label>${game.i18n.localize("ironclaw2e.dialog.macroDefault.d8Dice")}:</label>
	   <input type="text" id="d8s" name="d8s" value="${d8s != 0 ? d8s.toString() : ""}" onfocus="this.select();"></input>
      </div>
	  <div class="form-group">
       <label>${game.i18n.localize("ironclaw2e.dialog.macroDefault.d6Dice")}:</label>
	   <input type="text" id="d6s" name="d6s" value="${d6s != 0 ? d6s.toString() : ""}" onfocus="this.select();"></input>
      </div>
	  <div class="form-group">
       <label>${game.i18n.localize("ironclaw2e.dialog.macroDefault.d4Dice")}:</label>
	   <input type="text" id="d4s" name="d4s" value="${d4s != 0 ? d4s.toString() : ""}" onfocus="this.select();"></input>
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
            render: html => { document.getElementById("d12s").focus(); },
            close: html => {
                if (confirmed) {
                    let D12SS = html.find('[name=d12s]')[0].value;
                    let D12S = 0; if (D12SS.length > 0) D12S = parseInt(D12SS);
                    let D10SS = html.find('[name=d10s]')[0].value;
                    let D10S = 0; if (D10SS.length > 0) D10S = parseInt(D10SS);
                    let D8SS = html.find('[name=d8s]')[0].value;
                    let D8S = 0; if (D8SS.length > 0) D8S = parseInt(D8SS);
                    let D6SS = html.find('[name=d6s]')[0].value;
                    let D6S = 0; if (D6SS.length > 0) D6S = parseInt(D6SS);
                    let D4SS = html.find('[name=d4s]')[0].value;
                    let D4S = 0; if (D4SS.length > 0) D4S = parseInt(D4SS);
                    resolve(CardinalDiceRoller.rollHighestArray([D12S, D10S, D8S, D6S, D4S], label, rollingactor));
                } else {
                    resolve(null);
                }
            }
        }, { focus: false });
        dlog.render(true);
    });
    return await resolvedroll;
}

/**
 * Dialog macro function for a target number roll that displays a single dice input field for standard dice notation that will then be parsed
 * No inputs need to actually be given, but default values can be inputted
 * @param {number} tnnum The target number for the roll
 * @param {string} readydice The dice for the roll, in standard dice notation to be parsed
 * @param {string} label The label given to the roll function to display in the chat message
 * @param {string} rolltitle The title shown as the dialog's purpose, translated if one is found
 * @param {Actor} rollingactor The actor for which the roll is for
 * @returns {Promise<DiceReturn> | Promise<null>} Promise of the roll data in an object, or null if cancelled
 */
export async function rollTargetNumberOneLine(tnnum = 3, readydice = "", label = "", rolltitle = "", rollingactor = null) {
    let confirmed = false;
    const usetranslation = !rolltitle || game.i18n.has(rolltitle); // Use translations if either rolltitle does not exist, or it exists and has a translation equivalent
    const extraOrdered = game.settings.get("ironclaw2e", "oneLineDicesOrdered");
    let speaker = getMacroSpeaker(rollingactor);
    let resolvedroll = new Promise((resolve) => {
        let dlog = new Dialog({
            title: usetranslation ? game.i18n.format(rolltitle || "ironclaw2e.dialog.macroDefault.titleTN", { "name": speaker.alias }) : speaker.alias + ": " + rolltitle,
            content: `
     <form class="ironclaw2e">
      <div class="form-group">
       <label>${game.i18n.localize("ironclaw2e.dialog.macroDefault.targetNumber")}:</label>
	   <input type="text" id="tn" name="tn" value="${tnnum}" onfocus="this.select();"></input>
      </div>
      <div class="form-group">
       <label>${game.i18n.localize("ironclaw2e.dialog.macroDefault.oneLineDice")}:</label>
      </div>
	  <div class="form-group">
	   <input type="text" id="dices" name="dices" value="${readydice}" onfocus="this.select();"></input>
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
            render: html => { document.getElementById("tn").focus(); },
            close: html => {
                if (confirmed) {
                    let TNSS = html.find('[name=tn]')[0].value;
                    let TN = 0; if (TNSS.length > 0) TN = parseInt(TNSS);
                    let DICES = html.find('[name=dices]')[0].value;
                    let DICE = extraOrdered ? findTotalDiceArrays(DICES) : findTotalDice(DICES);
                    resolve(CardinalDiceRoller.rollTargetNumberArray(TN, DICE, label, rollingactor));
                } else {
                    resolve(null);
                }
            }
        }, { focus: false });
        dlog.render(true);
    });
    return await resolvedroll;
}

/**
 * Dialog macro function for a target number roll that displays a single dice input field for standard dice notation that will then be parsed
 * No inputs need to actually be given, but default values can be inputted
 * @param {string} readydice The dice for the roll, in standard dice notation to be parsed
 * @param {string} label The label given to the roll function to display in the chat message
 * @param {string} rolltitle The title shown as the dialog's purpose, translated if one is found
 * @param {Actor} rollingactor The actor for which the roll is for
 * @returns {Promise<DiceReturn> | Promise<null>} Promise of the roll data in an object, or null if cancelled
 */
export async function rollHighestOneLine(readydice = "", label = "", rolltitle = "", rollingactor = null) {
    let confirmed = false;
    const usetranslation = !rolltitle || game.i18n.has(rolltitle); // Use translations if either rolltitle does not exist, or it exists and has a translation equivalent
    const extraOrdered = game.settings.get("ironclaw2e", "oneLineDicesOrdered");
    let speaker = getMacroSpeaker(rollingactor);
    let resolvedroll = new Promise((resolve) => {
        let dlog = new Dialog({
            title: usetranslation ? game.i18n.format(rolltitle || "ironclaw2e.dialog.macroDefault.titleHighest", { "name": speaker.alias }) : speaker.alias + ": " + rolltitle,
            content: `
     <form class="ironclaw2e">
      <div class="form-group">
       <label>${game.i18n.localize("ironclaw2e.dialog.macroDefault.oneLineDice")}:</label>
      </div>
	  <div class="form-group">
	   <input type="text" id="dices" name="dices" value="${readydice}" onfocus="this.select();"></input>
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
            render: html => { document.getElementById("dices").focus(); },
            close: html => {
                if (confirmed) {
                    let DICES = html.find('[name=dices]')[0].value;
                    let DICE = extraOrdered ? findTotalDiceArrays(DICES) : findTotalDice(DICES);
                    resolve(CardinalDiceRoller.rollHighestArray(DICE, label, rollingactor));
                } else {
                    resolve(null);
                }
            }
        }, { focus: false });
        dlog.render(true);
    });
    return await resolvedroll;
}

/**
 * Dialog macro function for a variable type roll that displays a single dice input field for standard dice notation that will then be parsed
 * No inputs need to actually be given, but default values can be inputted
 * @param {boolean} tnyes Whether the roll uses a target number by default
 * @param {number} tnnum The target number for the roll
 * @param {string} readydice The dice for the roll, in standard dice notation to be parsed
 * @param {string} label The label given to the roll function to display in the chat message
 * @param {string} rolltitle The title shown as the dialog's purpose, translated if one is found
 * @param {Actor} rollingactor The actor for which the roll is for
 * @returns {Promise<DiceReturn> | Promise<null>} Promise of the roll data in an object, or null if cancelled
 */
export async function rollVariableOneLine(tnyes = false, tnnum = 3, readydice = "", label = "", rolltitle = "", rollingactor = null) {
    let confirmed = false;
    const usetranslation = !rolltitle || game.i18n.has(rolltitle); // Use translations if either rolltitle does not exist, or it exists and has a translation equivalent
    let speaker = getMacroSpeaker(rollingactor);
    let resolvedroll = new Promise((resolve) => {
        let dlog = new Dialog({
            title: usetranslation ? game.i18n.format(rolltitle || "ironclaw2e.dialog.macroDefault.titleVar", { "name": speaker.alias }) : speaker.alias + ": " + rolltitle,
            content: `
     <form class="ironclaw2e">
      <div class="form-group">
       <label>${game.i18n.localize("ironclaw2e.dialog.macroDefault.targetNumber")}:</label>
       <input type="checkbox" id="tnused" name="tnused" ${tnyes ? "checked" : ""}></input>
	   <input type="text" style="max-width:40%" id="tn" name="tn" value="${tnnum}" onfocus="this.select();"></input>
      </div>
      <div class="form-group">
       <label>${game.i18n.localize("ironclaw2e.dialog.macroDefault.oneLineDice")}:</label>
      </div>
	  <div class="form-group">
	   <input type="text" id="dices" name="dices" value="${readydice}" onfocus="this.select();"></input>
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
            render: html => { document.getElementById("tn").focus(); },
            close: html => {
                if (confirmed) {
                    let TNSS = html.find('[name=tn]')[0]?.value;
                    let TN = 0; if (TNSS?.length > 0) TN = parseInt(TNSS);
                    let TNUSED = html.find('[name=tnused]')[0];
                    let USED = TNUSED?.checked ?? false;
                    let DICES = html.find('[name=dices]')[0]?.value;
                    let DICE = findTotalDice(DICES);
                    resolve(USED ? CardinalDiceRoller.rollTargetNumberArray(TN, DICE, label, rollingactor) : CardinalDiceRoller.rollHighestArray(DICE, label, rollingactor));
                } else {
                    resolve(null);
                }
            }
        }, { focus: false });
        dlog.render(true);
    });
    return await resolvedroll;
}

/**
 * Function that takes a message with a roll and asks for a target number to use in copying the results of the roll to a new one
 * @param {ChatMessage} message The chat message to copy the roll from, assuming it has one
 * @param {string} rolltitle The title shown as the dialog's purpose, translated if one is found
 * @returns {Promise<DiceReturn> | Promise<null>} Promise of the roll data in an object, or null if cancelled
 */
export async function copyToRollTNDialog(message, rolltitle = "") {
    let confirmed = false;
    const usetranslation = !rolltitle || game.i18n.has(rolltitle); // Use translations if either rolltitle does not exist, or it exists and has a translation equivalent
    let resolvedroll = new Promise((resolve) => {
        let dlog = new Dialog({
            title: usetranslation ? game.i18n.format(rolltitle || "ironclaw2e.dialog.macroDefault.titleCopyTN") : rolltitle,
            content: `
     <form class="ironclaw2e">
      <div class="form-group">
       <label>${game.i18n.localize("ironclaw2e.dialog.macroDefault.targetNumberCopy")}:</label>
      </div>
	  <div class="form-group">
	   <input type="text" id="tn" name="tn" onfocus="this.select();"></input>
      </div>
     </form>
     `,
            buttons: {
                one: {
                    icon: '<i class="fas fa-check"></i>',
                    label: game.i18n.localize("ironclaw2e.dialog.copy"),
                    callback: () => confirmed = true
                },
                two: {
                    icon: '<i class="fas fa-times"></i>',
                    label: game.i18n.localize("ironclaw2e.dialog.cancel"),
                    callback: () => confirmed = false
                }
            },
            default: "one",
            render: html => { document.getElementById("tn").focus(); },
            close: html => {
                if (confirmed) {
                    let DICES = html.find('[name=tn]')[0].value;
                    let TN = 0; if (DICES.length > 0) TN = parseInt(DICES);
                    resolve(CardinalDiceRoller.copyToRollTN(TN, message));
                } else {
                    resolve(null);
                }
            }
        }, { focus: false });
        dlog.render(true);
    });
    return await resolvedroll;
}

/**
 * Function that takes a message with a roll and asks what sort of reroll the user wants to do to it
 * @param {ChatMessage} message The chat message to reroll
 * @param {Ironclaw2EActor} actor The actor to use for checks
 * @returns {Promise<DiceReturn> | Promise<null>} Promise of the roll data in an object, or null if cancelled
 */
export async function rerollDialog(message, actor) {
    let confirmed = false;
    const GMPrivilege = !actor && game.user.isGM;
    if (!actor && !GMPrivilege) {
        console.error("A non-GM user tried to open a reroll dialog without a set actor: " + actor);
        return null;
    }
    const messageRoll = message.rolls?.[0];
    if (!messageRoll) {
        console.error("A reroll dialog opened on a message with no roll attached: " + message);
        return null;
    }

    // Get the reroll types
    const hasOne = message.getFlag("ironclaw2e", "hasOne");
    const statsUsed = message.getFlag("ironclaw2e", "usedActorStats");
    const rerollTypes = actor?.getGiftRerollTypes(statsUsed, hasOne, message.isAuthor) ?? specialSettingsRerollGMMap(hasOne);
    if (!(rerollTypes?.size > 0)) { // If the rerollTypes size isn't larger than zero, done this way in case rerollTypes ever ends up null or size ends up null, this should still catch it
        console.error("Somehow, the rerollDialog function was called despite no usable reroll types being found: " + rerollTypes);
        return null;
    }

    // Get the usable reroll types in the correct format
    const rerollIntersection = specialSettingsRerollIntersection(rerollTypes);

    // Get the possible luck selections if luck reroll is one of the types
    let luckSelections = {};
    if (rerollIntersection.usableRerolls.hasOwnProperty("LUCK")) {
        for (let i = 0; i < messageRoll.terms[0].terms.length && i < i < messageRoll.terms[0].results.length; i++) {
            luckSelections[i] = game.i18n.format("ironclaw2e.dialog.reroll.luckDiceSelect", { "ordinal": i, "die": messageRoll.terms[0].terms[i], "result": messageRoll.terms[0].results[i].result });
        }
    }

    const templateData = {
        "rerollTypes": rerollIntersection.usableRerolls,
        "rerollSelected": rerollIntersection.firstType,
        "favorExists": rerollIntersection.usableRerolls.hasOwnProperty("FAVOR"),
        "luckExists": rerollIntersection.usableRerolls.hasOwnProperty("LUCK"),
        "luckSelections": luckSelections,
        "alias": message.speaker.alias,
        "gmIgnore": GMPrivilege
    };
    const contents = await renderTemplate("systems/ironclaw2e/templates/popup/reroll-popup.html", templateData);
    const rollType = message.getFlag("ironclaw2e", "rollType");
    const targetNumber = message.getFlag("ironclaw2e", "targetNumber");

    let resolvedroll = new Promise((resolve) => {
        let dlog = new Dialog({
            title: game.i18n.localize("ironclaw2e.dialog.reroll.heading"),
            content: contents,
            buttons: {
                one: {
                    icon: '<i class="fas fa-check"></i>',
                    label: game.i18n.localize("ironclaw2e.dialog.rerollText"),
                    callback: () => confirmed = true
                },
                two: {
                    icon: '<i class="fas fa-times"></i>',
                    label: game.i18n.localize("ironclaw2e.dialog.cancel"),
                    callback: () => confirmed = false
                }
            },
            default: "one",
            render: html => { document.getElementById("rerolltype").focus(); },
            close: async html => {
                if (confirmed) {
                    let REROLL = html.find('[name=rerolltype]')[0]?.value;
                    let FAVORRE = html.find('[name=favorreroll]')[0];
                    let favorreroll = FAVORRE?.checked;
                    let LUCKIN = html.find('[name=luckindex]')[0]?.value;
                    let luckindex = -1; if (LUCKIN?.length > 0) luckindex = parseInt(LUCKIN);
                    let LUCKHI = html.find('[name=luckhigh]')[0];
                    let luckhigh = LUCKHI?.checked;

                    let identifieroverride = "";

                    if (rerollTypes.has(REROLL)) {
                        if (rerollTypes.get(REROLL)?.identifierOverride)
                            identifieroverride = rerollTypes.get(REROLL)?.identifierOverride;

                        if (rerollTypes.get(REROLL)?.bonusExhaustsOnUse === true) {
                            const gift = actor.items.get(rerollTypes.get(REROLL).giftId);
                            const giftUseToChat = game.settings.get("ironclaw2e", "sendGiftUseExhaustMessage");
                            if (gift) await gift.giftToggleExhaust("true", giftUseToChat);
                        }
                    }

                    if (rollType === "HIGH")
                        resolve(CardinalDiceRoller.copyToRollHighest(message, true, REROLL, { identifieroverride, favorreroll, luckindex, luckhigh }));
                    else
                        resolve(CardinalDiceRoller.copyToRollTN(targetNumber, message, true, REROLL, { identifieroverride, favorreroll, luckindex, luckhigh }));
                } else {
                    resolve(null);
                }
            }
        }, { focus: false });
        dlog.render(true);
    });
    return await resolvedroll;
}
