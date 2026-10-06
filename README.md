# PF2e Award XP

Open an XP award dialog after combat prefilled with XP Value of the previous combat to award all PCs who were part of the combat.

Adds journal enrichers to allow reward dialog inside journals!

Original code by [jvasko](https://github.com/jsavko).
Edited to have a more soulslike aesthetic.

---

## Usage

### 1. Post-Combat Auto-Prompt
Once an encounter is completed, a dialog box will automatically appear. It will be pre-filled with the encounter's XP value and will list the PCs involved in the combat. 

![XP Prompt](https://i.imgur.com/8XmvU52.png)
![XP Prompt](https://i.imgur.com/WsGxrhO.png)

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
