/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

/**
 * Open dialog at when the preDeleteCombat hook is fired.
 */
Hooks.on('preDeleteCombat', (combat, html, id) => {
    if (!game.user.isGM) return;
    if (!game.settings.get("pf2e-award-xp", "combatPopup")) return;
    
    const pcs = combat.combatants
        .filter(c => c.actor.type === 'character' && c.actor.alliance === 'party' && !c.actor.traits.has('eidolon') && !c.actor.traits.has('minion'))
        .map(c => c.actor);
        
    const pwol = game.pf2e.settings.variants.pwol.enabled;
    let calculatedXP = game.pf2e.gm.calculateXP(
        pcs[0].system.details.level.value,
        pcs.length,
        combat.combatants.filter(c => c.actor.alliance === 'opposition').map(c => c.actor.system.details.level.value),
        combat.combatants.filter(c => c.actor.type === "hazard").map(c => c.actor.system.details.level.value),
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
    for ( const part of match.match(/(?:[^\s"]+|"[^"]*")+/g) ) {
        if ( !part ) continue;
        const [key, value] = part.split("=");
        const valueLower = value?.toLowerCase();
        if ( value === undefined ) config.values.push(key.replace(/(^"|"$)/g, ""));
        else if ( ["true", "false"].includes(valueLower) ) config[key] = valueLower === "true";
        else if ( Number.isNumeric(value) ) config[key] = Number(value);
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
    if ( !command ) return;
    event.stopPropagation();
    Award.handleAward(command);
}
  
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

class Award extends HandlebarsApplicationMixin(ApplicationV2) {

    static DEFAULT_OPTIONS = {
        classes: ['pf2e', 'sheet', 'actor', 'award', 'pf2eawardxp'],
        tag: 'form',  // REQUIRED for dialogs and forms
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
        context.xp = this.options.xp ?? 0;
        context.description = this.options.description ?? null;       
        context.destinations = this.options.destinations?.length > 0 ? this.options.destinations : game.actors.party.members.filter(m => m.type === "character" && !m.traits.has('eidolon') && !m.traits.has('minion'));
        return context;
    }

    static async #onSubmitForm(event, form, formData) {
        event.preventDefault();
        const data = foundry.utils.expandObject(Object.fromEntries(formData));
        
        // FIX: Use the injected 'form' parameter, not 'this.form'
        const transferBtn = form.querySelector('button[name="transfer"]');
        if (transferBtn) transferBtn.disabled = true;
        
        if(data['award-type'] != "Custom") { data.description = data['award-type']; }
        
        let destinations = [];
        for (const actor in data.destination) { 
            if (data.destination[actor] == "true") {
                destinations.push(game.actors.get(actor));
            } 
        }
        
        console.log(destinations);
        this.close();
        
        if (game.user.isGM) {
            if (!Number(data.xp)) { 
                ui.notifications.error("Invalid XP Entry");
                return;
            }
            await this.constructor.awardXP(data.xp, destinations);
            await this.constructor.displayAwardMessages(data.xp, data.description, destinations);
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
                if (this.selectedOptions[0].value == "Custom") {
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
        if ( !amount || !destinations.length ) return;
        if (!Number(amount)) { 
            ui.notifications.error("Invalid Entry");
            return;
        }
        for ( const destination of destinations ) {
            try {
                console.log(`PF2E Award XP - ${destination.name} - ${destination.system.details.xp.value} (starting) + ${amount} (award) = ${destination.system.details.xp.value + parseInt(amount)} (total)`);
                await destination.update({'system.details.xp.value': parseInt(destination.system.details.xp.value) + parseInt(amount)});
            } catch(err) {
                ui.notifications.warn(destination.name + ": " + err.message);
            }
        }
    }

    /**
     * Send the ChatMessage using the new Dark Fantasy visual format.
     */
    static async displayAwardMessages(amount, description, destinations) {
        // OVERHAUL: Replaced template render with structured HTML
        const chatContent = `
        <div class="pf2eawardxp-chat-card">
            <header class="chat-header">
                <img src="icons/magic/fire/flame-burning-campfire-yellow-red.webp" alt="XP Fire" class="xp-icon" />
                <h3 class="chat-title">Experience Gained</h3>
            </header>
            <div class="chat-body">
                ${game.i18n.format("PF2EAXP.Award.Message", { 
                    name: `<span class="highlight-name">${game.actors.party.name}</span>`, 
                    award: `<span class="highlight-xp">${amount}</span>`, 
                    description: description 
                })}
            </div>
        </div>
        `;

        const messageData = {
            style: CONST.CHAT_MESSAGE_STYLES.OTHER,
            content: chatContent,
            speaker: ChatMessage.getSpeaker(), // FIX: removed this.parent logic
            rolls: null,
        };
        
        return ChatMessage.create(messageData, {});
    }

    /* -------------------------------------------- */
    /*  Chat Command                                */
    /* -------------------------------------------- */

    static COMMAND_PATTERN = /^(?:<p>)?\/award(?:\s|<\/p>$\vert{}$)/i;
    static VALUE_PATTERN = new RegExp(/^(\d+)(.*)/);

    static chatMessage(message) {
        if ( !this.COMMAND_PATTERN.test(message) ) return;
        this.handleAward(message);
        return false;
    }

    static async handleAward(message) {
        message = message.replace(/<\/?p>/g, "").replace(/^\/award\s*/i, "").trim();
        if ( !game.user.isGM ) {
            ui.notifications.error("PF2EAXP.Award.NotGMError", { localize: true });
            return;
        }

        try {
            const { xp, description } = this.parseAwardCommand(message);
            const award = new game.pf2e_awardxp.Award({xp:parseInt(xp), description:description});
            award.render(true);
        } catch(err) {
            ui.notifications.warn(err.message);
        }
    }

    static parseAwardCommand(message) {
        const command = message.replace(this.COMMAND_PATTERN, "");
        let [full, xp, description] = command.match(this.VALUE_PATTERN) ?? [];
        return { xp, description };
    }

    static openDialog(options={}) { 
        if ( !game.user.isGM ) {
            ui.notifications.error("PF2EAXP.Award.NotGMError", { localize: true });
            return;
        }
          
        let xp = options.award ?? null;
        let description = options.description ?? null;
        const award = new game.pf2e_awardxp.Award({xp:xp, description:description});
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
                    <p>
                        ${game.i18n.localize("PF2EAXP.Welcome.WelcomeEnricherJank")}
                    </p>
                    <p class="nue">${game.i18n.localize("PF2EAXP.Welcome.WelcomeMessageOutput")}</p>
                    <p>
                        ${game.i18n.localize("PF2EAXP.Welcome.WelcomeEnricher")}
                    </p>
                    <p class="nue">${game.i18n.localize("PF2EAXP.Welcome.WelcomeMessage3")}</p>
                    <p>
                        ${game.i18n.localize("PF2EAXP.Welcome.WelcomeCommand")}
                    </p>
                    <p class="nue"></p>
                    <footer class="nue"></footer>
                </div>
                `];
                const chatData = content.map(c => {
                    return {
                        whisper: [game.user.id],
                        speaker: { alias: "PF2E Award Exp" },
                        flags: { core: { canPopout: true } },
                        content: c
                    };
                });
                ChatMessage.implementation.createDocuments(chatData);
                game.settings.set("pf2e-award-xp", "welcomeMessageShown", true);
            }
        }
    }
}