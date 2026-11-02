# Intercom Fin — identity & rollout switch (ESL-4216)

Support (Michael Ho, Sabel) own Fin and the `ynju29g7` AU workspace. We own the signed identity, the switch and the trigger. Admins only. Parent: [elmo-chat](../elmo-chat/summary.md).

## DECIDED 23 Oct 2026 (Dave + Aaron, in person)

- **Signing in TMS, copying Kore.** **LD** for general release, a **new SST param** for individual clients (SST wins, else LD). SST = `elmo-core` (staging sitesetup.elmodev.com, prod core.elmohub.com.au).
- Open: module subdomains (copy Kore per backend vs cross-origin to the main site + prod CORS).
- The section below (chat-service route, three-state Kore switch) is SUPERSEDED.

## Superseded design (22 Oct 2026)

```
Pendo RC "Support" ──► elmoSupport.open()
                         │  reads nav `assistant` block (TMS resolves the switch)
                         ├─ off  → nothing
                         ├─ kore → window.elmoAiAssistant()
                         └─ fin  → GET /api/support/v1/intercom-token (elmo-chat-service)
                                     verify X-Kong-JWT, ROLE_SUPER only, HS256 sign
                                   → Intercom boot (api_base AU, hidden launcher) → show
```

- **Token route** in elmo-chat-service. Neutral path. No tenant logic and no LaunchDarkly read. The Messenger secret stays in Secrets Manager and is never sent to the browser.
- **Three-state switch: off / Kore / Fin.** Extends `KoreAiConfigService::isKoreAiAssistEnabled`: the LaunchDarkly flag is the bulk default and the SST parameter wins per site. Engineers flip the bulk default; Support sets individual sites.
- **Backstop:** the `HAM Restriction` audience exclusion in Fin, seeded with the sites that opted out of Kore. A hard server-side check (chat service asks TMS) only if Compliance needs it.
- **Known bypass:** a Company Admin on an "off" site can call the token route directly. That's accepted unless Compliance objects.

## Facts verified

- **Kore prod flag** `platform-tms-koreai-assist-20241121`: on, defaults to Enable, no targets (22 Oct). Every tenant has Kore unless the SST parameter `elmo_kore_ai.menu_enabled` is false. The list of opted-out sites is in `sink_sst_site_config` and needs Platform or DevOps to query.
- **Zendesk** has no tenant switch. Help Centre users are Company Admins, set up per organisation at handover, and some customers are missing (e.g. Fortus).
- **Module hosts** can't reach TMS on the same origin. The cross-origin call through Kong works on staging; prod needs the CORS allow-list (ESL-4203).
- **Kong session:** use `ensureKongSession`, never a raw `/kong/session/init`.
- **`sub`** = TMS uuid (PLA-6098). Admin = `ROLE_SUPER`, ELMO staff excluded (Michael, 21 Oct).

## History

The toggle was always meant to be ELMO config, set via ROS ticket. Platform pushed back on **signing** in TMS, so signing moved to Kong. Claude then also put the flag in Kong's tenant table, which was never Eugene's plan. Dave and Aaron rejected the Kong version on 22 Oct.

## Rejected (and why)

| Option | Why |
|---|---|
| Kong `oidc-multitenant` branch + DynamoDB tenant flag | Dave and Aaron, 22 Oct: no vendor logic in the gateway; the table is the OAuth client store |
| Sign in module backends (Kore pattern) | Secret in about 6 backends |
| Token signing in TMS | Platform pushed back on adding the signing to TMS (the toggle as ELMO config was always the plan) |
| New dedicated service | Overkill for one route |

## Open

| Owner | Question |
|---|---|
| Dave | Is the chat service OK as the home? Is the Kore SST/LaunchDarkly switch the right tenant control? |
| DP | Will they host the route? |
| Platform / Hub | Who adds the three-state SST value, and how do existing sites migrate? |
| Michael | Zendesk coverage; `HAM Restriction` populated; UUID uniqueness (data team) |
| Compliance (Prashant) | US processing, ISO 42001 record, UK in the AU instance, humans-only for restricted customers |
| Us | Spike E4 (Kong session on PHP/module/SPA pages); E10 (do audiences apply on programmatic boot?) |

## Stale, needs rewrite

- Design doc artifact https://claude.ai/artifact/Lzo6NC9JX8e5N86ubLp52V (still Kong v12; Dave and Aaron's comment threads are open there)
- LMA1 Confluence drafts: DACI 4907008270, tech design 4906746669 (describe the TMS version)
- ESL-4216 description
- Slack: reply to Dave, Aaron, Allen and DP (points 4 and 9). Delete the old drafts to Allen's thread (C0CBDL2BL48), #rnd_ask_devops and the DM to Aaron.

## People

Michael Ho, Sabel (Support, Fin owners) · Dave Newson (architecture) · Aaron Pejakovic (DevOps) · Allen Tian (Platform) · DP (chat service) · Prashant (Compliance)
