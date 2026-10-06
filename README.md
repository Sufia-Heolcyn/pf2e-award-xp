# PF2e Award XP

A Foundry VTT module for the Pathfinder 2e system that streamlines the process of awarding Experience Points. It automatically calculates and prompts XP awards after combat, adds convenient chat commands, and introduces custom journal enrichers for seamless reward distribution directly from your notes.

## ✨ Features

* **Post-Combat Automation**: Automatically opens an XP award dialog after a combat encounter ends, pre-filled with the calculated XP value of the defeated enemies.
* **Smart Distribution**: Automatically targets and awards all Player Characters (PCs) who participated in the combat.
* **Journal Enrichers**: Create clickable links inside your journal entries to distribute specific XP awards on the fly.
* **Chat Commands**: Quickly award XP directly from the chat box using simple commands.

---

## 🚀 Usage

### 1. Post-Combat Auto-Prompt
Once an encounter is completed, a dialog box will automatically appear. It will be pre-filled with the encounter's XP value and will list the PCs involved in the combat. 

![Automated XP Dialog](https://github.com/jsavko/pf2e-award-xp/assets/192591/fbd1cfb1-d0a2-4d67-b734-80a99a60156f)

### 2. Chat Commands
You can manually award XP at any time using the `/award` macro in the chat box.

**Syntax:**
```text
/award <amount> <Reason>
```
**Example:**
```text
/award 10 Accomplishment (Minor)
```
### 3. Journal Inline:
You can embed clickable XP rewards directly into your Foundry journal entries. The enricher will automatically convert the formatted text into a stylized, clickable link that GMs can use during a session.

**Syntax:**
```text
[[/award <amount> <Reason>]]{<Display Text>}
```
**Example:**
```text
[[/award 10 Accomplishment (Minor)]]{Minor Accomplishment}
```
