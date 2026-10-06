/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

/**
 * Open dialog when the preDeleteCombat hook is fired.
 */
Hooks.on('preDeleteCombat', (combat, html, id) => {
    if (!game.user.isGM) return;
    if (!game.settings.get("pf2e-award-xp", "combatPopup")) return;

    const pcs = combat.combatants
        .filter(c => c.actor?.type === 'character' && c.actor?.alliance === 'party' && !c.actor?.traits?.has('eidolon') && !c.actor?.traits?.has('minion'))
        .map(c => c.actor);

    if (!pcs.length) return;

    const pwol = game.pf2e.settings.variants.pwol.enabled;
    let calculatedXP = game.pf2e.gm.calculateXP(
        pcs[0].system.details.level.value,
        pcs.length,
        combat.combatants.filter(c => c.actor?.alliance === 'opposition').map(c => c.actor.system.details.level.value),
        combat.combatants.filter(c => c.actor?.type === "hazard").map(c => c.actor.system.details.level.value),
        { pwol }
    );

    const award = new game.pf2e_awardxp.Award({
        destinations: pcs,
        description: 'Encounter (' + calculatedXP.rating.charAt(0).toUpperCase() + calculatedXP.rating.slice(1) + ')',
        xp: calculatedXP.xpPerPlayer
    });
    award.render(true);
});

Hooks.once("init", async () => {
    console.log('PF2E Award XP Init');
    game.pf2e_awardxp = {
        openDialog: Award.openDialog,
        openPlayerDialog: Award.openDialog,
        Award: Award
    };
    registerCustomEnrichers();
    registerWorldSettings();
});

Hooks.once("ready", async () => {
    game.pf2e_awardxp.Award._welcomeMessage();
});

Hooks.on("chatMessage", (app, message, data) => game.pf2e_awardxp.Award.chatMessage(message));


export function registerCustomEnrichers() {
    CONFIG.TextEditor.enrichers.push({
        id: "pf2e-award-xp",
        pattern: /\[\[\/(?<type>award) (?<config>[^\]]+)]](?:{(?<label>[^}]+)})?/gi,
        enricher: enrichAward
    });

    document.body.addEventListener("click", awardAction);
}

export function registerWorldSettings() {
    game.settings.register("pf2e-award-xp", "welcomeMessageShown", {
        scope: "world",
        name: "welcomeMessageShown",
        hint: "welcomeMessageShown",
        config: false,
        type: Boolean,
        default: false
    });

    game.settings.register("pf2e-award-xp", "combatPopup", {
        scope: "world",
        name: "PF2EAXP.Award.combatPopup",
        hint: "PF2EAXP.Award.combatPopupHint",
        config: true,
        type: Boolean,
        default: true
    });
}

/* -------------------------------------------- */
/*  Enrichers                                   */
/* -------------------------------------------- */

function parseConfig(match) {
    const config = { _config: match, values: [] };
    for (const part of match.match(/(?:[^\s"]+|"[^"]*")+/g) || []) {
        if (!part) continue;
        const [key, value] = part.split("=");
        const valueLower = value?.toLowerCase();
        if (value === undefined) config.values.push(key.replace(/(^"|"$)/g, ""));
        else if (["true", "false"].includes(valueLower)) config[key] = valueLower === "true";
        else if (Number.isNumeric(value)) config[key] = Number(value);
        else config[key] = value.replace(/(^"|"$)/g, "");
    }
    return config;
}

async function enrichAward(match, options) {
    let { type, config, label } = match.groups;
    config = parseConfig(config);
    config._input = match[0];
    const command = config._config;

    const block = document.createElement("span");
    block.classList.add("award-block", "pf2eaxp");
    block.dataset.awardCommand = command;

    block.innerHTML += `<a class="award-link" data-action="awardRequest">
      <i class="fa-solid fa-trophy"></i> ${label ?? game.i18n.localize("PF2EAXP.Award.Action")}
    </a>`;

    return block;
}

/* -------------------------------------------- */
/*  Actions                                     */
/* -------------------------------------------- */

async function awardAction(event) {
    const target = event.target.closest('[data-action="awardRequest"]');
    const command = target?.closest("[data-award-command]")?.dataset.awardCommand;
    if (!command) return;
    event.stopPropagation();
    Award.handleAward(command);
}

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

class Award extends HandlebarsApplicationMixin(ApplicationV2) {

    static DEFAULT_OPTIONS = {
        classes: ['pf2e', 'sheet', 'actor', 'award', 'pf2eawardxp'],
        tag: 'form',
        form: {
            submitOnChange: false,
            closeOnSubmit: false,
            handler: Award.#onSubmitForm,
        },
        position: { width: 380, height: 'auto' },
        window: {
            resizable: true,
            title: 'PF2EAXP.Award.Title'
        }
    };

    static PARTS = {
        form: {
            template: 'modules/pf2e-award-xp/templates/apps/award.hbs'
        }
    };

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        context.xp = Number.isNumeric(this.options.xp) ? Number(this.options.xp) : 0;
        context.description = this.options.description ?? null;
        context.destinations = this.options.destinations?.length > 0
            ? this.options.destinations
            : (game.actors.party?.members?.filter(m => m.type === "character" && !m.traits?.has('eidolon') && !m.traits?.has('minion')) ?? []);
        return context;
    }

    static async #onSubmitForm(event, form, formData) {
        event.preventDefault();
        const data = foundry.utils.expandObject(Object.fromEntries(formData));

        // FIX: Access the passed `form` argument instead of undefined `this.form`
        const transferBtn = form.querySelector('button[name="transfer"]');
        if (transferBtn) transferBtn.disabled = true;

        if (data['award-type'] !== "Custom") {
            data.description = data['award-type'];
        }

        let destinations = [];
        for (const actor in data.destination) {
            if (data.destination[actor] === "true" || data.destination[actor] === true) {
                const targetActor = game.actors.get(actor);
                if (targetActor) destinations.push(targetActor);
            }
        }

        this.close();

        if (game.user.isGM) {
            if (!Number.isNumeric(data.xp)) {
                ui.notifications.error("Invalid XP Entry");
                return;
            }
            await Award.awardXP(Number(data.xp), destinations);
            await Award.displayAwardMessages(Number(data.xp), data.description, destinations);
        }
    }

    _onRender(context, options) {
        super._onRender(context, options);
        const html = this.element;
        html.querySelector('[name=award-type]')?.addEventListener("change", function() {
            const xpInput = html.querySelector('[name=xp]');
            if (xpInput) xpInput.value = this.selectedOptions[0].getAttribute("data-xp");

            const customBox = html.querySelector(".pf2e_awardxp_description input");
            if (customBox) {
                if (this.selectedOptions[0].value === "Custom") {
                    customBox.disabled = false;
                } else {
                    customBox.disabled = true;
                    customBox.value = this.selectedOptions[0].value;
                }
            }
        });
    }

    /**
     * Update the actors with the current EXP value.
     */
    static async awardXP(amount, destinations) {
        if (!amount || !destinations.length) return;
        if (!Number.isNumeric(amount)) {
            ui.notifications.error("Invalid Entry");
            return;
        }
        for (const destination of destinations) {
            try {
                const currentXP = destination.system.details.xp.value ?? 0;
                const newXP = parseInt(currentXP, 10) + parseInt(amount, 10);
                await destination.update({ 'system.details.xp.value': newXP });
            } catch (err) {
                ui.notifications.warn(`${destination.name}: ${err.message}`);
            }
        }
    }

    /**
     * Send the ChatMessage from the template file.
     */
    static async displayAwardMessages(amount, description, destinations) {
        const context = {
            message: game.i18n.format("PF2EAXP.Award.Message", {
                name: game.actors.party?.name ?? "Party",
                award: amount,
                description: description ?? ""
            }),
            destinations: destinations
        };
        const content = await foundry.applications.handlebars.renderTemplate("modules/pf2e-award-xp/templates/chat/party.hbs", context);

        const messageData = {
            style: CONST.CHAT_MESSAGE_STYLES.OTHER,
            content: content,
            speaker: ChatMessage.getSpeaker(),
            rolls: null,
        };
        return ChatMessage.create(messageData, {});
    }

    /* -------------------------------------------- */
    /*  Chat Command                                */
    /* -------------------------------------------- */

    /**
     * Matches /award at the start of the message with optional arguments and HTML paragraph wrappers.
     */
    static COMMAND_PATTERN = /^\s*(?:<p>)?\s*\/award(?:\s+.*?)?(?:<\/p>)?\s*$/i;

    /**
     * Matches leading numeric XP and captures the optional trailing description.
     */
    static VALUE_PATTERN = /^(\d+)(?:\s+(.*))?$/;

    static chatMessage(message) {
        if (!this.COMMAND_PATTERN.test(message)) return;
        this.handleAward(message);
        return false;
    }

    static async handleAward(message) {
        if (!game.user.isGM) {
            ui.notifications.error("PF2EAXP.Award.NotGMError", { localize: true });
            return;
        }

        try {
            const { xp, description } = this.parseAwardCommand(message);
            const award = new game.pf2e_awardxp.Award({
                xp: Number.isNumeric(xp) ? parseInt(xp, 10) : null,
                description: description
            });
            award.render(true);
        } catch (err) {
            ui.notifications.warn(err.message);
        }
    }

    static parseAwardCommand(message) {
        // Strip paragraph wrappers and the command itself
        const clean = (message ?? "")
            .replace(/<\/?p>/g, "")
            .replace(/^\s*\/award(?:\s+|$)/i, "")
            .trim();

        if (!clean) {
            return { xp: null, description: null };
        }

        // Test for numeric XP at the beginning: e.g. "40" or "40 Encounter"
        const match = clean.match(this.VALUE_PATTERN);
        if (match) {
            const xp = parseInt(match[1], 10);
            const description = match[2]?.trim().replace(/^["']|["']$/g, "") || null;
            return { xp, description };
        }

        // If no leading number (e.g. `/award Quest Complete`), treat full string as description
        const description = clean.replace(/^["']|["']$/g, "") || null;
        return { xp: null, description };
    }

    static openDialog(options = {}) {
        if (!game.user.isGM) {
            ui.notifications.error("PF2EAXP.Award.NotGMError", { localize: true });
            return;
        }

        let xp = options.award ?? null;
        let description = options.description ?? null;
        const award = new game.pf2e_awardxp.Award({ xp: xp, description: description });
        award.render(true);
    }

    static _welcomeMessage() {
        if (!game.settings.get("pf2e-award-xp", "welcomeMessageShown")) {
            if (game.user.isGM) {
                const content = [`
                <div class="pf2eawardxp">
                    <h3 class="nue">${game.i18n.localize("PF2EAXP.Welcome.Title")}</h3>
                    <p class="nue">${game.i18n.localize("PF2EAXP.Welcome.WelcomeMessage1")}</p>
                    <p class="nue">${game.i18n.localize("PF2EAXP.Welcome.WelcomeMessage2")}</p>
                    <p>${game.i18n.localize("PF2EAXP.Welcome.WelcomeEnricherJank")}</p>
                    <p class="nue">${game.i18n.localize("PF2EAXP.Welcome.WelcomeMessageOutput")}</p>
                    <p>${game.i18n.localize("PF2EAXP.Welcome.WelcomeEnricher")}</p>
                    <p class="nue">${game.i18n.localize("PF2EAXP.Welcome.WelcomeMessage3")}</p>
                    <p>${game.i18n.localize("PF2EAXP.Welcome.WelcomeCommand")}</p>
                    <p class="nue"></p>
                    <footer class="nue"></footer>
                </div>
                `];
                const chatData = content.map(c => ({
                    whisper: [game.user.id],
                    speaker: { alias: "PF2E Award Exp" },
                    flags: { core: { canPopout: true } },
                    content: c
                }));
                ChatMessage.implementation.createDocuments(chatData);
                game.settings.set("pf2e-award-xp", "welcomeMessageShown", true);
            }
        }
    }
}