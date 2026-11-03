import airtableIcon from '@/frontend/assets/mcp/airtable.png'
import apolloIcon from '@/frontend/assets/mcp/apollo.png'
import asanaIcon from '@/frontend/assets/mcp/asana.png'
import atlassianIcon from '@/frontend/assets/mcp/atlassian.png'
import boxIcon from '@/frontend/assets/mcp/box.png'
import chromeIcon from '@/frontend/assets/mcp/chrome.svg'
import clickupIcon from '@/frontend/assets/mcp/clickup.png'
import cloudflareIcon from '@/frontend/assets/mcp/cloudflare.png'
import context7Icon from '@/frontend/assets/mcp/context7.png'
import datadogIcon from '@/frontend/assets/mcp/datadog.png'
import discordIcon from '@/frontend/assets/mcp/discord.png'
import dropboxIcon from '@/frontend/assets/mcp/dropbox.png'
import elevenlabsIcon from '@/frontend/assets/mcp/elevenlabs.png'
import exaIcon from '@/frontend/assets/mcp/exa.png'
import figmaIcon from '@/frontend/assets/mcp/figma.png'
import firecrawlIcon from '@/frontend/assets/mcp/firecrawl.png'
import githubIcon from '@/frontend/assets/mcp/github.png'
import gitlabIcon from '@/frontend/assets/mcp/gitlab.png'
import gmailIcon from '@/frontend/assets/mcp/gmail.png'
import googlecalendarIcon from '@/frontend/assets/mcp/googlecalendar.png'
import googledriveIcon from '@/frontend/assets/mcp/googledrive.png'
import grafanaIcon from '@/frontend/assets/mcp/grafana.png'
import granolaIcon from '@/frontend/assets/mcp/granola.png'
import hubspotIcon from '@/frontend/assets/mcp/hubspot.png'
import huggingfaceIcon from '@/frontend/assets/mcp/huggingface.png'
import intercomIcon from '@/frontend/assets/mcp/intercom.png'
import linearIcon from '@/frontend/assets/mcp/linear.png'
import mondayIcon from '@/frontend/assets/mcp/monday.png'
import mongodbIcon from '@/frontend/assets/mcp/mongodb.png'
import neonIcon from '@/frontend/assets/mcp/neon.png'
import notionIcon from '@/frontend/assets/mcp/notion.png'
import paperIcon from '@/frontend/assets/mcp/paper.png'
import paypalIcon from '@/frontend/assets/mcp/paypal.png'
import perplexityIcon from '@/frontend/assets/mcp/perplexity.png'
import postgresqlIcon from '@/frontend/assets/mcp/postgresql.png'
import posthogIcon from '@/frontend/assets/mcp/posthog.png'
import puppeteerIcon from '@/frontend/assets/mcp/puppeteer.png'
import railwayIcon from '@/frontend/assets/mcp/railway.png'
import redisIcon from '@/frontend/assets/mcp/redis.png'
import salesforceIcon from '@/frontend/assets/mcp/salesforce.png'
import sentryIcon from '@/frontend/assets/mcp/sentry.png'
import shopifyIcon from '@/frontend/assets/mcp/shopify.png'
import slackIcon from '@/frontend/assets/mcp/slack.png'
import snowflakeIcon from '@/frontend/assets/mcp/snowflake.png'
import stripeIcon from '@/frontend/assets/mcp/stripe.png'
import supabaseIcon from '@/frontend/assets/mcp/supabase.png'
import telegramIcon from '@/frontend/assets/mcp/telegram.png'
import twilioIcon from '@/frontend/assets/mcp/twilio.png'
import vercelIcon from '@/frontend/assets/mcp/vercel.png'
import zapierIcon from '@/frontend/assets/mcp/zapier.png'

const ICONS: Record<string, string> = {
  airtable: airtableIcon,
  apollo: apolloIcon,
  asana: asanaIcon,
  atlassian: atlassianIcon,
  box: boxIcon,
  chrome: chromeIcon,
  'chrome-devtools': chromeIcon,
  clickup: clickupIcon,
  cloudflare: cloudflareIcon,
  context7: context7Icon,
  datadog: datadogIcon,
  discord: discordIcon,
  dropbox: dropboxIcon,
  elevenlabs: elevenlabsIcon,
  exa: exaIcon,
  figma: figmaIcon,
  firecrawl: firecrawlIcon,
  github: githubIcon,
  gitlab: gitlabIcon,
  gmail: gmailIcon,
  googlecalendar: googlecalendarIcon,
  googledrive: googledriveIcon,
  grafana: grafanaIcon,
  granola: granolaIcon,
  hubspot: hubspotIcon,
  huggingface: huggingfaceIcon,
  intercom: intercomIcon,
  linear: linearIcon,
  monday: mondayIcon,
  mongodb: mongodbIcon,
  neon: neonIcon,
  notion: notionIcon,
  paper: paperIcon,
  paypal: paypalIcon,
  perplexity: perplexityIcon,
  postgresql: postgresqlIcon,
  posthog: posthogIcon,
  puppeteer: puppeteerIcon,
  railway: railwayIcon,
  redis: redisIcon,
  salesforce: salesforceIcon,
  sentry: sentryIcon,
  shopify: shopifyIcon,
  slack: slackIcon,
  snowflake: snowflakeIcon,
  stripe: stripeIcon,
  supabase: supabaseIcon,
  telegram: telegramIcon,
  twilio: twilioIcon,
  vercel: vercelIcon,
  zapier: zapierIcon
}

const ALIASES: Record<string, string> = {
  'google drive': 'googledrive',
  'google calendar': 'googlecalendar',
  gcal: 'googlecalendar',
  gdrive: 'googledrive',
  'apollo.io': 'apollo',
  'paper-desktop': 'paper',
  'granola-mcp': 'granola',
  postgres: 'postgresql',
  'hugging face': 'huggingface',
  jira: 'atlassian',
  confluence: 'atlassian'
}

function canon(name: string): string {
  return name.toLowerCase().replace(/[\s._-]+/g, '')
}

// Canonicalized lookups, built once from the readable maps above. Alias values
// are icon keys, so canonicalize both sides.
const ICONS_BY_CANON = new Map(Object.entries(ICONS).map(([k, v]) => [canon(k), v]))
const ALIASES_BY_CANON = new Map(Object.entries(ALIASES).map(([k, v]) => [canon(k), canon(v)]))

export function getMcpIcon(server: string): string | undefined {
  const key = canon(server)
  return ICONS_BY_CANON.get(ALIASES_BY_CANON.get(key) ?? key)
}

export function formatMcpServerName(server: string): string {
  return server
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map(part => part[0].toUpperCase() + part.slice(1))
    .join(' ')
}
