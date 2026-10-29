# Loki.js Command Reference

Here is a clear and organized list of all the slash commands available in the bot.

*Note: Arguments in `[brackets]` are optional, while arguments in `<angle brackets>` are required.*

---

### `/setup`
**Manage server setup**
* **Preview layout:** 
  > `/setup preview`
* **Apply layout (creates missing channels/categories):** 
  > `/setup apply`

### `/server`
**Manage server-level organization**
* **Preview inbox layout changes:** 
  > `/server inbox-preview`
* **Apply inbox layout changes:** 
  > `/server inbox-apply`
* **Migrate imp-stuff messages via Mistral AI:** 
  > `/server migrate-imp-stuff` or `/server migrate-imp-stuff limit:100`
* **Preview onboarding layout:** 
  > `/server onboarding-preview`
* **Apply onboarding layout:** 
  > `/server onboarding-apply`
* **Show server guide & channel routing:** 
  > `/server help`

### `/radio`
**Manage the 24/7 radio bots**
* **Setup radio category:** 
  > `/radio setup`
* **Check radio status:** 
  > `/radio status`
* **Restart a station:** 
  > `/radio restart station:<station_name>`
* **Stop a station:** 
  > `/radio stop station:<station_name>`
* **Start a station:** 
  > `/radio start station:<station_name>`
* **Change stream URL:** 
  > `/radio set-stream station:<station_name> url:<new_stream_url>`

### `/news`
**Manage the Daily Intelligence Digest system**
* **Force run a news category:** 
  > `/news run type:<category_name>`
* **Check news system status:** 
  > `/news status`
* **List configured sources:** 
  > `/news sources`
* **Pause a category:** 
  > `/news pause type:<category_name>`
* **Resume a category:** 
  > `/news resume type:<category_name>`

### `/market`
**Market automation commands**
* **Trigger intraday stock update:** 
  > `/market update`

### `/ctf`
**Manage CTF (Capture The Flag) events and workspaces**
* **Create a new CTF:** 
  > `/ctf create name:<ctf_name>` or `/ctf create name:<ctf_name> url:<ctf_url>`
* **Archive a CTF:** 
  > `/ctf archive name:<ctf_name>`
* **Start a temporary private CTF workspace:** 
  > `/ctf start name:<workspace_name> teammate:<@user>` 
  *(Optional: add `duration:<hours>` or `url:<ctf_url>`)*
* **Extend a temporary CTF workspace:** 
  > `/ctf extend name:<workspace_name> hours:<number>`
* **Close a temporary CTF workspace:** 
  > `/ctf close name:<workspace_name>`
