// Import Modules
import { Ironclaw2EActor } from "./actor/actor.js";
import { Ironclaw2EActorSheet } from "./actor/actor-sheet.js";

import { Ironclaw2EItem } from "./item/item.js";
import { Ironclaw2EItemSheet } from "./item/item-sheet.js";

import { TokenExtenderOptions, TokenHUDStatusMonkeyPatch } from "./token/token-hud-extender.js"
import { Ironclaw2EToken } from "./token/token.js"

import { Ironclaw2EChatMessage } from "./chatmessage.js";
import { requestRollPopup } from "./utilitiesmacros.js";
import { ironclawDragRulerIntegration } from "./utilitiesmacros.js";

import { Ironclaw2ECombat } from "./combat.js";
import { Ironclaw2ECombatant } from "./combat.js";
import { Ironclaw2ECombatTracker } from "./combat.js";

import { CardinalDiceRoller } from "./dicerollers.js";
import { rollTargetNumberDialog } from "./dicerollers.js";
import { rollHighestDialog } from "./dicerollers.js";
import { rollTargetNumberOneLine } from "./dicerollers.js";
import { rollHighestOneLine } from "./dicerollers.js";
import { rollVariableOneLine } from "./dicerollers.js";

import { checkQuickModifierKey, getSpeakerActor, makeCompareReady } from "./helpers.js";

import { getVersionNumbers } from "./versionupgrade.js";
import { checkIfNewerVersion } from "./versionupgrade.js";
import { upgradeVersion } from "./versionupgrade.js";

import { chatCommandsIntegration } from "./commands.js";

import { CommonConditionInfo } from "./conditions.js";

import { CommonSystemInfo } from "./systeminfo.js";

import { registerHandlebarsHelpers } from "./handlebars.js";

import { WildcardTemplateConfig, WorldSettingsConfig } from "./config.js";
import { CoinageSettingsConfig } from "./config.js";
import { IronclawDetectionModes, IronclawVisionModes } from "./canvas.js";

import { IronclawActorTour, IronclawConfigTour, IronclawGiftTour, IronclawItemTour } from "./tours.js";
import { IronclawDocumentationViewer } from "./documentation.js";

/* -------------------------------------------- */
/*  Base Initialization Hooks                   */
/* -------------------------------------------- */

Hooks.once('init', function () {

    game.ironclaw2e = {
        // The special intermediary dice roller
        CardinalDiceRoller,
        // Document classes
        Ironclaw2EActor,
        Ironclaw2EItem,
        Ironclaw2ECombat,
        Ironclaw2ECombatant,
        Ironclaw2ECombatTracker,
        Ironclaw2EChatMessage,
        // Sheet classes
        Ironclaw2EActorSheet,
        Ironclaw2EItemSheet,
        // Object class
        Ironclaw2EToken,
        // Hotbar macros
        rollItemMacro,
        popupMacro,
        popupSelect,
        popupDamage,
        requestRollPopup,
        // Dice rolling commands
        rollTargetNumberDialog,
        rollHighestDialog,
        rollTargetNumberOneLine,
        rollHighestOneLine,
        rollVariableOneLine,
        // System info
        CommonSystemInfo,
        CommonConditionInfo,
        // Misc
        "useCUBConditions": false,
        "useETLElevation": false,
        waitUntilReady,
        sleep,
        ironclawLogHeader: "Ironclaw 2E | "
    };

    // Define custom Document classes
    CONFIG.Actor.documentClass = Ironclaw2EActor;
    CONFIG.Item.documentClass = Ironclaw2EItem;
    CONFIG.Combat.documentClass = Ironclaw2ECombat;
    CONFIG.Combatant.documentClass = Ironclaw2ECombatant;
    CONFIG.Token.objectClass = Ironclaw2EToken;
    CONFIG.ui.combat = Ironclaw2ECombatTracker;
    CONFIG.statusEffects = CommonConditionInfo.conditionList;
    CONFIG.ChatMessage.documentClass = Ironclaw2EChatMessage;
    CONFIG.ChatMessage.template = "systems/ironclaw2e/templates/chat/chat-message.html";

    // Foundry VTT core monkey-patches
    TokenHUDStatusMonkeyPatch();

    /**
     * Set an initiative formula for the system
     * @type {String}
     */
    CONFIG.Combat.initiative = {
        formula: "-1",
        decimals: 2
    };
    CONFIG.time.roundTime = 6;

    // Register sheet application classes
    Actors.unregisterSheet("core", ActorSheet);
    Actors.registerSheet("ironclaw2e", Ironclaw2EActorSheet, { makeDefault: true });
    Items.unregisterSheet("core", ItemSheet);
    Items.registerSheet("ironclaw2e", Ironclaw2EItemSheet, { makeDefault: true });

    // Register a version number that was used last time to allow determining if a new version is being used, world-scope for system function updates
    game.settings.register("ironclaw2e", "lastSystemVersionWorld", {
        scope: "world",
        type: String,
        default: game.system.version,
        config: false
    });

    // Register system world settins
    registerWorldSettings();

    // Register system client settings
    registerClientSettings();

    // Register a version number that was used last time to allow determining if a new version is being used, client-scope for potential update logs and such
    game.settings.register("ironclaw2e", "lastSystemVersionClient", {
        scope: "client",
        type: String,
        default: game.system.version,
        config: false
    });

    // Register keybinds for the system
    game.keybindings.register("ironclaw2e", "quickRollModifier", {
        name: "ironclaw2e.keyConfig.quickRollModifier",
        hint: "ironclaw2e.keyConfig.quickRollModifierHint",
        editable: [
            {
                key: "ControlLeft"
            },
            {
                key: "ControlRight"
            }
        ],
        restricted: false
    });

    // Handlebars helper registration
    registerHandlebarsHelpers();

    // Dice roller init
    CardinalDiceRoller.cardinalInitialization();

    // Define system vision modes and settings
    CONFIG.Canvas.visionModes = IronclawVisionModes();
    CONFIG.Canvas.detectionModes = IronclawDetectionModes();
    CONFIG.specialStatusEffects.BLIND = "blinded";
    CONFIG.specialStatusEffects.MUTE = "silenced";

    const asciiArt = `  _____                      _                
  \\_   \\_ __ ___  _ __   ___| | __ ___      __
   / /\\/ '__/ _ \\| '_ \\ / __| |/ _\` \\ \\ /\\ / /
/\\/ /_ | | | (_) | | | | (__| | (_| |\\ V  V / 
\\____/ |_|  \\___/|_| |_|\\___|_|\\__,_| \\_/\\_/  
==============================================`;
    console.log(asciiArt);
    console.log(game.ironclaw2e.ironclawLogHeader + "Ironclaw2E System init complete");
});

Hooks.once('setup', function () {
    // Tours registeration
    registerIronclawTours();

    // Enhanced Terrain Layer check
    const etlActive = game.modules.get("enhanced-terrain-layer")?.active === true;
    game.ironclaw2e.useETLElevation = etlActive;

    console.log(game.ironclaw2e.ironclawLogHeader + "Ironclaw2E System setup complete");
});

Hooks.once("ready", function () {
    // Wait to register hotbar drop hook on ready so that modules could register earlier if they want to
    Hooks.on("hotbarDrop", (bar, data, slot) => createIronclaw2EMacro(data, slot));
	console.log(game.ironclaw2e.ironclawLogHeader + "Ironclaw2E System Ready One");
    // Check and set default Combat Tracker options if they do not exist
    let ctOptions = game.settings.get("core", Combat.CONFIG_SETTING);
    if (jQuery.isEmptyObject(ctOptions)) {
        game.settings.set("core", Combat.CONFIG_SETTING, {
            sideBased: true,
            initType: 2,
            forceSettings: false,
            skipDefeated: false,
            manualTN: -1
        });
    }
	console.log(game.ironclaw2e.ironclawLogHeader + "Ironclaw2E System Ready Two");
    // World Version checks 
    if (game.user.isGM) {
        const lastVersion = game.settings.get("ironclaw2e", "lastSystemVersionWorld");
        console.log(game.ironclaw2e.ironclawLogHeader + "Last system version played: " + lastVersion);
        if (checkIfNewerVersion(game.system.version, lastVersion)) {
            upgradeVersion(lastVersion);
        }
        game.settings.set("ironclaw2e", "lastSystemVersionWorld", game.system.version);
    }
	console.log(game.ironclaw2e.ironclawLogHeader + "Ironclaw2E System Ready Three");
    // Client Version checks
    const lastClientVersion = game.settings.get("ironclaw2e", "lastSystemVersionClient");
    if (checkIfNewerVersion(game.system.version, lastClientVersion)) {
        // Insert changelog popups here
    }
	console.log(game.ironclaw2e.ironclawLogHeader + "Ironclaw2E System Ready Four");
    game.settings.set("ironclaw2e", "lastSystemVersionClient", game.system.version);


    console.log(game.ironclaw2e.ironclawLogHeader + "Ironclaw2E System ready");
});

/* -------------------------------------------- */
/*  Settings Registers                          */
/* -------------------------------------------- */

/**
 * Separate function to register the world-scope menus and settings, for clarity
 * @private
 */
function registerWorldSettings() {
    // Register the system world configuration menus
    // Every world setting should be in these, so no need to make any of them appear in the base configuration menu
    game.settings.registerMenu("ironclaw2e", "worldSettingsConfig", {
        name: "ironclaw2e.config.worldConfig.menuName",
        hint: "ironclaw2e.config.worldConfig.menuHint",
        label: "ironclaw2e.config.worldConfig.menuLabel",
        icon: "fas fa-globe",
        type: WorldSettingsConfig,
        restricted: true
    });
    game.settings.registerMenu("ironclaw2e", "coinageSettingsConfig", {
        name: "ironclaw2e.config.coinageConfig.menuName",
        hint: "ironclaw2e.config.coinageConfig.menuHint",
        label: "ironclaw2e.config.coinageConfig.menuLabel",
        icon: "fas fa-coins",
        type: CoinageSettingsConfig,
        restricted: true
    });
    game.settings.registerMenu("ironclaw2e", "templateSettingsConfig", {
        name: "ironclaw2e.config.wildcardTemplateConfig.menuName",
        hint: "ironclaw2e.config.wildcardTemplateConfig.menuHint",
        label: "ironclaw2e.config.wildcardTemplateConfig.menuLabel",
        icon: "fas fa-user-circle",
        type: WildcardTemplateConfig,
        restricted: true
    });

    // General configurations
    // Dice system configuration
    game.settings.register("ironclaw2e", "dicePoolsSourceOrdered", {
        name: "ironclaw2e.config.dicePoolsSourceOrdered",
        hint: "ironclaw2e.config.dicePoolsSourceOrderedHint",
        scope: "world",
        type: Boolean,
        default: true,
        config: false,
        onChange: ordered => game.ironclaw2e.CardinalDiceRoller.sourceOrderedDice = ordered
    });
    game.settings.register("ironclaw2e", "oneLineDicesOrdered", {
        name: "ironclaw2e.config.oneLineDicesOrdered",
        hint: "ironclaw2e.config.oneLineDicesOrderedHint",
        scope: "world",
        type: Boolean,
        default: false,
        config: false
    });
    game.settings.register("ironclaw2e", "allowRerollingOthersDice", {
        name: "ironclaw2e.config.allowRerollingOthersDice",
        hint: "ironclaw2e.config.allowRerollingOthersDiceHint",
        scope: "world",
        type: Boolean,
        default: true,
        config: false
    });

    // Damage calculation configs
    game.settings.register("ironclaw2e", "calculateAttackEffects", {
        name: "ironclaw2e.config.calculateAttackEffects",
        hint: "ironclaw2e.config.calculateAttackEffectsHint",
        scope: "world",
        type: Boolean,
        default: true,
        config: false
    });
    game.settings.register("ironclaw2e", "calculateDisplaysFailed", {
        name: "ironclaw2e.config.calculateDisplaysFailed",
        hint: "ironclaw2e.config.calculateDisplaysFailedHint",
        scope: "world",
        type: Boolean,
        default: true,
        config: false
    });
    game.settings.register("ironclaw2e", "calculateDoesNotDisplay", {
        name: "ironclaw2e.config.calculateDoesNotDisplay",
        hint: "ironclaw2e.config.calculateDoesNotDisplayHint",
        scope: "world",
        type: Boolean,
        default: false,
        config: false
    });

    // Chat button configs
    game.settings.register("ironclaw2e", "chatButtons", {
        name: "ironclaw2e.config.chatButtons",
        hint: "ironclaw2e.config.chatButtonsHint",
        scope: "world",
        type: Boolean,
        default: true,
        config: false
    });
    game.settings.register("ironclaw2e", "showDefenseButtons", {
        name: "ironclaw2e.config.showDefenseButtons",
        hint: "ironclaw2e.config.showDefenseButtonsHint",
        scope: "world",
        type: Boolean,
        default: true,
        config: false
    });
    game.settings.register("ironclaw2e", "showOthersTacticsUse", {
        name: "ironclaw2e.config.showOthersTacticsUse",
        hint: "ironclaw2e.config.showOthersTacticsUseHint",
        scope: "world",
        type: Boolean,
        default: true,
        config: false
    });

    // Automatic condition configs
    game.settings.register("ironclaw2e", "autoInitiativeConditions", {
        name: "ironclaw2e.config.autoInitiativeConditions",
        hint: "ironclaw2e.config.autoInitiativeConditionsHint",
        scope: "world",
        type: Boolean,
        default: true,
        config: false
    });
    game.settings.register("ironclaw2e", "autoConditionRemoval", {
        name: "ironclaw2e.config.autoConditionRemoval",
        hint: "ironclaw2e.config.autoConditionRemovalHint",
        scope: "world",
        type: Boolean,
        default: true,
        config: false
    });
    game.settings.register("ironclaw2e", "autoConditionRemovalNoTurns", {
        name: "ironclaw2e.config.autoConditionRemovalNoTurns",
        hint: "ironclaw2e.config.autoConditionRemovalNoTurnsHint",
        scope: "world",
        type: Boolean,
        default: false,
        config: false
    });
    game.settings.register("ironclaw2e", "autoAddOnFireLight", {
        name: "ironclaw2e.config.autoAddOnFireLight",
        hint: "ironclaw2e.config.autoAddOnFireLightHint",
        scope: "world",
        type: Boolean,
        default: true,
        config: false
    });

    // Range settings
    game.settings.register("ironclaw2e", "rangePenalties", {
        name: "ironclaw2e.config.rangePenalties",
        hint: "ironclaw2e.config.rangePenaltiesHint",
        scope: "world",
        type: Boolean,
        default: true,
        config: false
    });
    game.settings.register("ironclaw2e", "matchStandardRuler", {
        name: "ironclaw2e.config.matchStandardRuler",
        hint: "ironclaw2e.config.matchStandardRulerHint",
        scope: "world",
        type: Boolean,
        default: false,
        config: false
    });
    game.settings.register("ironclaw2e", "requireSpecialRangeFound", {
        name: "ironclaw2e.config.requireSpecialRangeFound",
        hint: "ironclaw2e.config.requireSpecialRangeFoundHint",
        scope: "world",
        type: Boolean,
        default: false,
        config: false
    });
    game.settings.register("ironclaw2e", "showRangeCombatRules", {
        name: "ironclaw2e.config.showRangeCombatRules",
        hint: "ironclaw2e.config.showRangeCombatRulesHint",
        scope: "world",
        type: Number,
        default: 1,
        config: false,
        choices: CommonSystemInfo.rangeCombatRules
    });

    // Item configs
    game.settings.register("ironclaw2e", "vehicleStationCaptainOverride", {
        name: "ironclaw2e.config.vehicleStationCaptainOverride",
        hint: "ironclaw2e.config.vehicleStationCaptainOverrideHint",
        scope: "world",
        type: Boolean,
        default: false,
        config: false
    });
    game.settings.register("ironclaw2e", "sendWeaponExhaustMessage", {
        name: "ironclaw2e.config.sendWeaponExhaustMessage",
        hint: "ironclaw2e.config.sendWeaponExhaustMessageHint",
        scope: "world",
        type: Boolean,
        default: false,
        config: false
    });
    game.settings.register("ironclaw2e", "sendWeaponReadyExhaustMessage", {
        name: "ironclaw2e.config.sendWeaponReadyExhaustMessage",
        hint: "ironclaw2e.config.sendWeaponReadyExhaustMessageHint",
        scope: "world",
        type: Boolean,
        default: false,
        config: false
    });
    game.settings.register("ironclaw2e", "sendGiftUseExhaustMessage", {
        name: "ironclaw2e.config.sendGiftUseExhaustMessage",
        hint: "ironclaw2e.config.sendGiftUseExhaustMessageHint",
        scope: "world",
        type: Boolean,
        default: false,
        config: false
    });
    game.settings.register("ironclaw2e", "sparkDieAutoDwindle", {
        name: "ironclaw2e.config.sparkDieAutoDwindle",
        hint: "ironclaw2e.config.sparkDieAutoDwindleHint",
        scope: "world",
        type: Boolean,
        default: true,
        config: false
    });
    game.settings.register("ironclaw2e", "askReadyWhenUsed", {
        name: "ironclaw2e.config.askReadyWhenUsed",
        hint: "ironclaw2e.config.askReadyWhenUsedHint",
        scope: "world",
        type: Boolean,
        default: true,
        config: false
    });
    game.settings.register("ironclaw2e", "weaponExhaustNeedsRefreshed", {
        name: "ironclaw2e.config.weaponExhaustNeedsRefreshed",
        hint: "ironclaw2e.config.weaponExhaustNeedsRefreshedHint",
        scope: "world",
        type: Boolean,
        default: true,
        config: false
    });
    game.settings.register("ironclaw2e", "npcItemHasDescription", {
        name: "ironclaw2e.config.npcItemHasDescription",
        hint: "ironclaw2e.config.npcItemHasDescriptionHint",
        scope: "world",
        type: Boolean,
        default: true,
        config: false
    });

    // Register misc world settings
    game.settings.register("ironclaw2e", "preferTokenName", {
        name: "ironclaw2e.config.preferTokenName",
        hint: "ironclaw2e.config.preferTokenNameHint",
        scope: "world",
        type: Boolean,
        default: true,
        config: false
    });
    game.settings.register("ironclaw2e", "showTokenExtraButtons", {
        name: "ironclaw2e.config.showTokenExtraButtons",
        hint: "ironclaw2e.config.showTokenExtraButtonsHint",
        scope: "world",
        type: Boolean,
        default: true,
        config: false
    });
    game.settings.register("ironclaw2e", "autoPrototypeSetup", {
        name: "ironclaw2e.config.autoPrototypeSetup",
        hint: "ironclaw2e.config.autoPrototypeSetupHint",
        scope: "world",
        type: Boolean,
        default: true,
        config: false
    });
    game.settings.register("ironclaw2e", "allowNonGMRequestRolls", {
        name: "ironclaw2e.config.allowNonGMRequestRolls",
        hint: "ironclaw2e.config.allowNonGMRequestRollsHint",
        scope: "world",
        type: Boolean,
        default: true,
        config: false
    });

    // Encumbrance configs
    game.settings.register("ironclaw2e", "manageEncumbranceAuto", {
        name: "ironclaw2e.config.manageEncumbranceAuto",
        hint: "ironclaw2e.config.manageEncumbranceAutoHint",
        scope: "world",
        type: Boolean,
        default: false,
        config: false
    });
    game.settings.register("ironclaw2e", "coinsHaveWeight", {
        name: "ironclaw2e.config.coinsHaveWeight",
        hint: "ironclaw2e.config.coinsHaveWeightHint",
        scope: "world",
        type: Boolean,
        default: true,
        config: false
    });

    // Coinage settings
    // Just one here
    game.settings.register("ironclaw2e", "currencySettings", {
        scope: "world",
        type: Object,
        default: CoinageSettingsConfig.getCoinageDefaultSettings(),
        config: false
    });

    // Template settings
    // 
    game.settings.register("ironclaw2e", "templateIncludeFolderPath", {
        name: "ironclaw2e.config.templateIncludeFolderPath",
        hint: "ironclaw2e.config.templateIncludeFolderPathHint",
        scope: "world",
        type: Boolean,
        default: false,
        config: false
    });
    game.settings.register("ironclaw2e", "templateSpeciesActive", {
        name: "ironclaw2e.config.templateSpeciesActive",
        hint: "ironclaw2e.config.templateSpeciesActiveHint",
        scope: "world",
        type: Boolean,
        default: true,
        config: false
    });
    game.settings.register("ironclaw2e", "templateCareerActive", {
        name: "ironclaw2e.config.templateCareerActive",
        hint: "ironclaw2e.config.templateCareerActiveHint",
        scope: "world",
        type: Boolean,
        default: true,
        config: false
    });
    game.settings.register("ironclaw2e", "templateSpeciesFolder", {
        name: "ironclaw2e.config.templateSpeciesFolder",
        hint: "ironclaw2e.config.templateSpeciesFolderHint",
        scope: "world",
        type: String,
        default: "",
        config: false
    });
    game.settings.register("ironclaw2e", "templateCareerFolder", {
        name: "ironclaw2e.config.templateCareerFolder",
        hint: "ironclaw2e.config.templateCareerFolderHint",
        scope: "world",
        type: String,
        default: "",
        config: false
    });
}

/**
 * Separate function to register the client-scope settings, for clarity
 * @private
 */
function registerClientSettings() {
    // Client settings, all in the base configuration menu
    game.settings.register("ironclaw2e", "defaultSendDamage", {
        name: "ironclaw2e.config.defaultSendDamage",
        hint: "ironclaw2e.config.defaultSendDamageHint",
        scope: "client",
        type: Boolean,
        default: true,
        config: true
    });
    game.settings.register("ironclaw2e", "defaultSendGiftExhaust", {
        name: "ironclaw2e.config.defaultSendGiftExhaust",
        hint: "ironclaw2e.config.defaultSendGiftExhaustHint",
        scope: "client",
        type: Boolean,
        default: true,
        config: true
    });
    game.settings.register("ironclaw2e", "confirmItemInfo", {
        name: "ironclaw2e.config.confirmItemInfo",
        hint: "ironclaw2e.config.confirmItemInfoHint",
        scope: "client",
        type: Boolean,
        default: false,
        config: true
    });
    game.settings.register("ironclaw2e", "showRangeWhenTargeting", {
        name: "ironclaw2e.config.showRangeWhenTargeting",
        hint: "ironclaw2e.config.showRangeWhenTargetingHint",
        scope: "client",
        type: Boolean,
        default: true,
        config: true
    });
    game.settings.register("ironclaw2e", "showRangeDuration", {
        name: "ironclaw2e.config.showRangeDuration",
        hint: "ironclaw2e.config.showRangeDurationHint",
        scope: "client",
        type: Number,
        default: 3000,
        range: { min: 1000, max: 4000, step: 200 },
        config: true
    });
    game.settings.register("ironclaw2e", "defaultSendToChat", {
        name: "ironclaw2e.config.defaultSendToChat",
        hint: "ironclaw2e.config.defaultSendToChatHint",
        scope: "client",
        type: Boolean,
        default: true,
        config: true
    });
    game.settings.register("ironclaw2e", "leftButtonOption", {
        name: "ironclaw2e.config.leftButtonOption",
        hint: "ironclaw2e.config.leftButtonOptionHint",
        scope: "client",
        type: String,
        default: "pool",
        config: true,
        choices: TokenExtenderOptions.buttonOptions
    });
    game.settings.register("ironclaw2e", "rightButtonOption", {
        name: "ironclaw2e.config.rightButtonOption",
        hint: "ironclaw2e.config.rightButtonOptionHint",
        scope: "client",
        type: String,
        default: "damage",
        config: true,
        choices: TokenExtenderOptions.buttonOptions
    });
}

/* -------------------------------------------- */
/*  Tours Registers                             */
/* -------------------------------------------- */

/**
 * Separate function to register system tours
 * @private
 */
async function registerIronclawTours() {
    try {
        game.tours.register("ironclaw2e", "ironclawSettings", await IronclawConfigTour.fromJSON("systems/ironclaw2e/tours/ironclaw-settings.json"));
        game.tours.register("ironclaw2e", "ironclawActorSheet", await IronclawActorTour.fromJSON("systems/ironclaw2e/tours/ironclaw-character-sheet.json"));
        game.tours.register("ironclaw2e", "ironclawWeaponSheet", await IronclawItemTour.fromJSON("systems/ironclaw2e/tours/ironclaw-weapon-sheet.json"));
        game.tours.register("ironclaw2e", "ironclawGiftSheet", await IronclawGiftTour.fromJSON("systems/ironclaw2e/tours/ironclaw-gift-sheet.json"));
    }
    catch (err) {
        console.error(err);
    }
}

/* -------------------------------------------- */
/*  Canvas Initialization                       */
/* -------------------------------------------- */

Hooks.on("canvasInit", function () {
    
});

/* -------------------------------------------- */
/*  Ironclaw 2E Links                           */
/* -------------------------------------------- */

/**
 * Function that is called when an Ironclaw-specific button is pressed in the sidebar
   * @param {MouseEvent} event    The originating click event
 */
function systemSidebarAction(event) {
    event.preventDefault();
    const button = event.currentTarget;

    switch (button.dataset.systemAction) {
        case "system-readme":
            new IronclawDocumentationViewer("systems/ironclaw2e/README.md", {}).render(true);
            break;
        case "system-changelog":
            new IronclawDocumentationViewer("systems/ironclaw2e/CHANGELOG.md", {}).render(true);
            break;
    }
}

Hooks.on("renderSettings", (app, html) => {
  console.log("renderSettings fired");

  // Log all h4s and their text content
  const headers = html.querySelectorAll("h4");
  headers.forEach((h, i) => {
    console.log(`Header ${i}:`, `"${h.textContent.trim()}"`, h);
  });

  // Also log all section elements for reference
  const sections = html.querySelectorAll("section");
  console.log(`Found ${sections.length} sections:`);
  sections.forEach((sec, i) => {
    // Show first 50 chars of section text for context
    console.log(`Section ${i}:`, sec.textContent.trim().slice(0, 50), sec);
  });
});

Hooks.on("renderSettings", (app,html) => {
	console.log("renderSettings fired");

	// Find the section with class "documentation"
	const helpSection = html.querySelector("section.documentation");

	if (!helpSection) {
	  console.warn("Help and Documentation section not found");
	  return;
	}
		
	// Avoid adding the button twice
	if (helpSection.querySelector(".my-custom-settings-button")) return;
	
	
	//Add Readme Button
	const readmeButton = document.createElement("button");
	readmeButton.className = "my-custom-settings-button";
	readmeButton.dataset.systemAction = "system-readme";
	readmeButton.innerHTML ='<i class="fas fa-book-open"></i>' + game.i18n.localize("ironclaw2e.sidebar.readme");
	readmeButton.addEventListener("click", systemSidebarAction);
	
	// Add Changelog Button
	const changeLogButton = document.createElement("button");
	changeLogButton.className = "my-custom-settings-button";
	changeLogButton.dataset.systemAction = "system-changelog";
	changeLogButton.innerHTML ='<i class="fas fa-clipboard-list"></i>' + game.i18n.localize("ironclaw2e.sidebar.changelog");
	changeLogButton.addEventListener("click", systemSidebarAction);
	
	helpSection.appendChild(readmeButton);
	helpSection.appendChild(changeLogButton);
})


/* -------------------------------------------- */
/*  Functions                                   */
/* -------------------------------------------- */

/**
 * Delay an async function for set milliseconds
 * @param {number} ms
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Quick and dirty way to make condition adding and removing wait until the game is fully ready
 * @param {any} resolve
 */
async function waitUntilReady() {
    while (!game.ready) {
        await sleep(500);
    }
    return true;
}

/* -------------------------------------------- */
/*  External Module Support                     */
/* -------------------------------------------- */

// Drag Ruler integration
Hooks.once("dragRuler.ready", (SpeedProvider) => ironclawDragRulerIntegration(SpeedProvider));

// ChatCommands integration
Hooks.on("chatCommandsReady", chatCommandsIntegration);

/* -------------------------------------------- */
/*  Hotbar Macros                               */
/* -------------------------------------------- */

/**
 * Create a Macro from an Item drop.
 * Get an existing item macro if one exists, otherwise create a new one.
 * @param {Object} data     The dropped data
 * @param {number} slot     The hotbar slot to use
 * @returns {Promise}
 */
function createIronclaw2EMacro(data, slot) {
    if (data?.type !== "Item") return console.error("Ironclaw item macro creation received data for something that isn't an item: " + data?.type);
    if (!data.uuid) return console.error("Ironclaw item macro creation received data without a UUID set: " + data);
    // Do the actual macro creation separately so the hook can return false and prevent the default handling
    (async () => {
        const item = await fromUuid(data.uuid);
        if (!item?.actor) return ui.notifications.warn(game.i18n.localize("ironclaw2e.ui.macroOwnedItemsWarning"));
        // If the default macro is sending to chat, check for inverse modifier key, otherwise check for normal modifier key
        const defaultMacro = game.settings.get("ironclaw2e", "defaultSendToChat");
        const justInfo = defaultMacro ? !checkQuickModifierKey() : checkQuickModifierKey();

        // Create the macro command
        const command = `game.ironclaw2e.rollItemMacro("${item.name}", ${justInfo ? "true" : "false"});`;
        const usedName = item.name + (justInfo ? " To Chat" : "");
        let macro = game.macros.find(m => (m?.name === usedName) && (m?.command === command));
        if (!macro) {
            macro = await Macro.create({
                name: usedName,
                type: "script",
                img: item.img,
                command: command,
                flags: { "ironclaw2e.itemMacro": true }
            });
        }
        game.user.assignHotbarMacro(macro, slot);
    })();
    return false;
}

/**
 * Roll an item macro for the currently selected actor, if the actor has the given item
 * @param {string} itemName
 * @return {Promise}
 */
function rollItemMacro(itemName, justInfo = false) {
    const actor = getSpeakerActor();
    const item = actor ? actor.items.getName(itemName) : null;
    if (!item) return ui.notifications.warn(game.i18n.format("ironclaw2e.ui.actorDoesNotHaveItem", { "itemName": itemName }));

    // Trigger the item roll
    return (justInfo ? item.sendInfoToChat() : item.roll());
}

/**
 * Popup a certain type of dialog screen on the currently selected actor
 * @param {number} popup The type of popup to open
 * @returns {Promise}
 */
function popupMacro(popup) {
    const actor = getSpeakerActor();
    if (!actor) return ui.notifications.warn(game.i18n.localize("ironclaw2e.ui.actorNotFoundForMacro"));

    // Trigger the popup
    switch (popup) {
        case 0:
            return actor.basicRollSelector();
            break;
        case 1:
            return actor.popupDamage();
            break;
        case 2:
            return actor.popupAddCondition();
            break;
        default:
            ui.notifications.warn(game.i18n.format("ironclaw2e.ui.popupNotFoundForMacro", { "popup": popup }));
            return actor.basicRollSelector();
            break;
    }
}

/**
 * Popup the standard dice pool selection dialog with some readied data
 * @param {string[]} prechecked Array of skills to autocheck on the dialog, must be in lowercase and without spaces
 * @param {boolean} tnyes Whether to use a TN, true for yes
 * @param {number} tnnum TN to use, ignored if highest roll
 * @param {string} extradice Default extra dice to use for the bottom one-line slot
 * @param {boolean} quick Whether the roll skips the dialog
 */
function popupSelect(prechecked = [], tnyes = false, tnnum = 3, extradice = "", quick = false) {
    const actor = getSpeakerActor();
    if (!actor) return ui.notifications.warn(game.i18n.localize("ironclaw2e.ui.actorNotFoundForMacro"));

    return actor.basicRollSelector({ prechecked, tnyes, tnnum, extradice }, { "directroll": quick === true });
}

/**
 * Popup the standard actor damage dialog with some readied data
 * @param {number} readydamage The damage to use for default
 * @param {number} readysoak The soak to use for default
 * @param {string} damageconditions Extra conditions to be added alongside the damage conditions
 * @param {boolean} quick Whether the roll skips the dialog
 */
function popupDamage(readydamage = 0, readysoak = 0, damageconditions = "", quick = false) {
    const actor = getSpeakerActor();
    if (!actor) return ui.notifications.warn(game.i18n.localize("ironclaw2e.ui.actorNotFoundForMacro"));

    if (quick === true)
        return actor.silentDamage(readydamage, readysoak, damageconditions);
    else
        return actor.popupDamage(readydamage, readysoak, damageconditions);
}